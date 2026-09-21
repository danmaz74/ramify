import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { guardedFilesHash } from '../../subs/evidence/src/guarded-files.js';
import { runCommand } from '../../subs/evidence/src/run-command.js';
import type { CommandRun } from '../../subs/evidence/src/run-command.js';
import type {
  AcceptedCommit, Checkpoint, GateAttempt, GateAttemptId, GateCause,
  GateCommandRecord, GateNext, GateRuleRecord, NotVerified, RecordReference,
} from './records.js';
import { gateAttemptSchema } from './records.js';
import { verifyChecks } from './verify.js';
import type { PlannedCheck } from './verify.js';

/*
 * One function runs a gate. It verifies every command and every selection,
 * runs what verified in the working directory, compares the guarded files with
 * what was captured, and answers one `GateAttempt`. It knows nothing of runs:
 * its caller supplies the checkpoint, the commands, the captured hashes and
 * the head they describe, and commits afterwards if the attempt passed.
 *
 * It has one caller, because a standalone commit-audit tool extracted from
 * cucumber-viz will replace its body later and nothing else should have to
 * change with it.
 */

/** Everything a gate needs that is not the checkpoint itself. */
export interface GateRequest {
  readonly id: GateAttemptId;
  /** The project the commands run over, and whose guarded files are compared. */
  readonly projectRoot: string;
  /** Where the attempt's output files go, beside the attempt record. */
  readonly directory: string;
  /** The run branch's head when the commands ran. */
  readonly head: AcceptedCommit;
  readonly checks: readonly PlannedCheck[];
  readonly subject?: { readonly workItem?: string; readonly iteration?: string } | undefined;
  readonly proposedBy?: string | null | undefined;
  readonly repairRound?: number | undefined;
  readonly infrastructureAttempt?: number | undefined;
  /** The guarded files as the assignment captured them. */
  readonly guarded?: readonly { readonly path: string; readonly hash: string }[] | undefined;
  /** A guarded path whose change a committed record authorized. */
  readonly authorizations?: readonly { readonly path: string; readonly by: RecordReference }[] | undefined;
  /**
   * Rules the caller verified over the tree, such as the fake-naming rule of
   * a contract gate. A failed rule fails the attempt and is the engineer's to
   * repair, so the attempt's cause is `in-scope`.
   */
  readonly rules?: readonly GateRuleRecord[] | undefined;
  /** The run's bounds, where the caller has them; without them no attempt is exhausted. */
  readonly limits?: { readonly repairRounds?: number; readonly infrastructureRetries?: number } | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Run one checkpoint's checks over the working directory and answer the
 * attempt. The writer is already settled by the caller; nothing here pauses
 * or resumes one. The attempt is returned, not written: the harness commits it
 * with the event that closes the checkpoint.
 */
export async function runGate(checkpoint: Checkpoint, request: GateRequest): Promise<GateAttempt> {
  await mkdir(request.directory, { recursive: true });

  const guardedChanges = await compareGuardedFiles(request);
  const unauthorized = guardedChanges.some(change => change.authorizedBy === null);
  const rules = [...(request.rules ?? [])];
  const ruleFailed = rules.some(rule => rule.outcome === 'failed');

  const failures = await verifyChecks(request.checks);
  const verified = failures.every(failure => failure === null);

  const commands: GateCommandRecord[] = [];
  /**
   * The reasons a verdict is attributed to. A command that never ran because
   * another command of the same attempt failed verification is recorded as
   * `interrupted`, but it is not why the attempt did not run, so it is not
   * one of these.
   */
  const decisive: NotVerified[] = [];
  const startedAt = new Date().toISOString();
  let interrupted = false;
  for (const [index, check] of request.checks.entries()) {
    const outputFile = join(request.directory, `${String(index + 1).padStart(2, '0')}-${check.kind}.log`);
    const failure = failures[index] ?? null;
    if (!verified || interrupted) {
      // Nothing ran: the attempt could not run what the checkpoint requires.
      await writeFile(outputFile, '');
      commands.push({
        kind: check.kind, command: check.command, ...(check.selection === undefined ? {} : { selection: check.selection }),
        startedAt, elapsedMs: 0, exitCode: null,
        outcome: 'not-verified', notVerified: failure?.notVerified ?? 'interrupted',
        runnerError: null,
        output: { path: outputFile, bytes: 0, truncated: false, tail: failure?.detail ?? '' },
      });
      if (failure !== null) decisive.push(failure.notVerified);
      continue;
    }

    const run = await runCommand({
      argv: check.command.argv,
      cwd: check.command.cwd,
      env: check.command.env,
      timeoutMs: check.command.timeoutMs,
      outputFile,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    const record = classify(check, run, outputFile);
    commands.push(record);
    if (record.notVerified !== undefined) decisive.push(record.notVerified);
    if (record.notVerified === 'interrupted') interrupted = true;
  }

  const verdict = verdictOf(commands, unauthorized || ruleFailed);
  const cause = causeOf(decisive, commands, request.checks, verdict, unauthorized, ruleFailed);
  return {
    schema: gateAttemptSchema,
    id: request.id,
    checkpoint,
    subject: request.subject ?? {},
    proposedBy: request.proposedBy ?? null,
    repairRound: request.repairRound ?? 0,
    infrastructureAttempt: request.infrastructureAttempt ?? 0,
    head: request.head,
    commit: null,
    guardedChanges,
    ...(rules.length === 0 ? {} : { rules }),
    commands,
    verdict,
    cause,
    next: nextOf(request, verdict, cause),
  };
}

/** What each captured guarded file hashes to now. A deletion is `after: null`, a change like any other. */
async function compareGuardedFiles(request: GateRequest): Promise<GateAttempt['guardedChanges']> {
  const captured = request.guarded ?? [];
  if (captured.length === 0) return [];
  const current = await guardedFilesHash(request.projectRoot, captured.map(file => file.path));
  const byPath = new Map(current.map(file => [file.path, file.hash]));
  const authorized = new Map((request.authorizations ?? []).map(entry => [entry.path, entry.by]));
  const changes: GateAttempt['guardedChanges'] = [];
  for (const file of captured) {
    const after = byPath.get(file.path) ?? null;
    if (after === file.hash) continue;
    changes.push({ path: file.path, before: file.hash, after, authorizedBy: authorized.get(file.path) ?? null });
  }
  return changes;
}

/**
 * One command's outcome, from how it ended and the code it chose, never from
 * what it printed. A Ramify check exiting 2 was not checked, which is never a
 * pass; `runnerError` stays null, because nothing the harness spawned failed.
 */
function classify(check: PlannedCheck, run: CommandRun, outputFile: string): GateCommandRecord {
  const base = {
    kind: check.kind,
    command: check.command,
    ...(check.selection === undefined ? {} : { selection: check.selection }),
    startedAt: run.startedAt,
    elapsedMs: run.elapsedMs,
    output: { path: outputFile, bytes: run.output.bytes, truncated: run.output.truncated, tail: run.output.tail },
  };
  switch (run.outcome.kind) {
    case 'cancelled':
      return { ...base, exitCode: null, outcome: 'not-verified', notVerified: 'interrupted', runnerError: null };
    case 'timed-out':
      return { ...base, exitCode: null, outcome: 'not-verified', notVerified: 'timeout', runnerError: null };
    case 'runner-error':
      return { ...base, exitCode: null, outcome: 'not-verified', notVerified: 'runner-error', runnerError: run.outcome.error };
    case 'completed': {
      const exitCode = run.outcome.exitCode;
      if (exitCode === 0) return { ...base, exitCode, outcome: 'passed', runnerError: null };
      if (check.kind === 'ramify-check' && exitCode === 2) {
        return { ...base, exitCode, outcome: 'not-verified', notVerified: 'runner-error', runnerError: null };
      }
      return { ...base, exitCode, outcome: 'failed', runnerError: null };
    }
  }
}

function verdictOf(commands: readonly GateCommandRecord[], harnessFinding: boolean): GateAttempt['verdict'] {
  if (commands.some(command => command.outcome === 'not-verified')) return 'not-verified';
  if (harnessFinding || commands.some(command => command.outcome === 'failed')) return 'failed';
  return 'passed';
}

/** An unauthorized guarded change is the cause whatever else happened; a timeout comes before other infrastructure. */
function causeOf(
  decisive: readonly NotVerified[],
  commands: readonly GateCommandRecord[],
  checks: readonly PlannedCheck[],
  verdict: GateAttempt['verdict'],
  unauthorizedGuardedChange: boolean,
  ruleFailed: boolean,
): GateCause | null {
  if (unauthorizedGuardedChange) return 'guarded-change';
  if (verdict === 'passed') return null;
  const reasons = new Set(decisive.length > 0
    ? decisive
    : commands.flatMap(command => (command.notVerified === undefined ? [] : [command.notVerified])));
  if (reasons.has('timeout')) return 'timeout';
  // A discovery that failed is a failure of the evidence the harness needs,
  // not of the code: the module inventory could not be refreshed, and no
  // repair of the source would change that. It takes the bounded
  // infrastructure path, and never a code-repair assignment.
  if (reasons.has('runner-error') || reasons.has('command-missing') || reasons.has('interrupted') || reasons.has('discovery-error')) return 'infrastructure';
  if (reasons.has('empty-selection') || reasons.has('required-suite-missing')) return 'unknown';
  if (verdict !== 'failed') return 'unknown';
  // A rule the harness verified is about what this iteration wrote, so it is
  // the engineer's to repair whatever else ran.
  if (ruleFailed) return 'in-scope';
  return outsideAssignment(commands, checks) ? 'outside-assignment' : 'in-scope';
}

/**
 * Whether this failure lies outside the last assignment's own scope: every
 * command of that scope passed, and what failed is a command of the whole
 * project. It is read from which files ran and how each command exited, never
 * from what any of them printed. Without a probe of the assignment's own
 * selection there is nothing to attribute, so the failure stays in scope.
 */
function outsideAssignment(commands: readonly GateCommandRecord[], checks: readonly PlannedCheck[]): boolean {
  let probed = false;
  let failedOutside = false;
  for (const [index, check] of checks.entries()) {
    const record = commands[index];
    if (record === undefined || check.attribution === undefined) continue;
    if (check.attribution === 'in-scope') {
      if (record.outcome !== 'passed') return false;
      probed = true;
    } else if (record.outcome === 'failed') {
      failedOutside = true;
    }
  }
  return probed && failedOutside;
}

function nextOf(request: GateRequest, verdict: GateAttempt['verdict'], cause: GateCause | null): GateNext {
  if (verdict === 'passed') return 'accept';
  if (cause === 'in-scope') {
    const bound = request.limits?.repairRounds;
    return bound !== undefined && (request.repairRound ?? 0) + 1 >= bound ? 'exhausted' : 'repair';
  }
  if (cause === 'infrastructure' || cause === 'timeout') {
    const bound = request.limits?.infrastructureRetries;
    return bound !== undefined && (request.infrastructureAttempt ?? 0) + 1 >= bound ? 'exhausted' : 'retry-infrastructure';
  }
  return 'return-to-local-architect';
}
