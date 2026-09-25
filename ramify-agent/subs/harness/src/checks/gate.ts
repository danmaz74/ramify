import { mkdir, writeFile } from 'node:fs/promises';
import { guardedFilesHash } from '../../subs/evidence/src/guarded-files.js';
import type { CommandRun } from '../../subs/evidence/src/run-command.js';
import { ramifyAttribution } from './diagnostics.js';
import { checkOutputPath } from './execution.js';
import { typeCheckAttribution } from './type-check-output.js';
import type { CheckExecutionPort, CheckExecutionResult, GateCommandStarted } from './execution.js';
import type {
  AcceptedCommit, CheckCommandKind, Checkpoint, GateAttempt, GateAttemptId, GateAttribution, GateCause,
  GateCommandRecord, GateNext, GateRuleRecord, NotVerified, RecordReference, ScenarioCheckSummary,
} from './records.js';
import { gateAttemptSchema } from './records.js';
import { verifyChecks } from './verify.js';
import type { PlannedCheck, VerificationFailure } from './verify.js';

/*
 * Gate policy verifies every command and selection and compares guarded files
 * before execution. A committing caller can then create the revision first
 * and execute the prepared gate over that exact commit; standalone callers
 * keep using the in-place executor.
 *
 * Command execution is a port: the in-place runner implements today's loop,
 * and a commit-audit runner can replace it without moving gate policy.
 */

/** Everything a gate needs that is not the checkpoint itself. */
export interface GateRequest {
  readonly id: GateAttemptId;
  /** The durable run that owns this attempt; standalone in-place gates omit it. */
  readonly runId?: string | undefined;
  /** The project the commands run over, and whose guarded files are compared. */
  readonly projectRoot: string;
  /** Where the attempt's output files go, beside the attempt record. */
  readonly directory: string;
  /** The run branch's head when the commands ran. */
  readonly head: AcceptedCommit;
  readonly checks: readonly PlannedCheck[];
  /** The checkpoint's selection, kept separate from any all-project scope probe. */
  readonly selection?: {
    readonly policy: 'owned-by-scope' | 'all-project';
    readonly exactOwners: readonly string[];
    readonly subtrees: readonly string[];
  } | undefined;
  /** Project-relative nested packages whose dependencies an isolated runner links. */
  readonly dependencyDirectories?: readonly string[] | undefined;
  readonly subject?: { readonly workItem?: string; readonly iteration?: string } | undefined;
  readonly proposedBy?: string | null | undefined;
  readonly repairRound?: number | undefined;
  readonly infrastructureAttempt?: number | undefined;
  /** The guarded files as the assignment captured them. */
  readonly guarded?: readonly { readonly path: string; readonly hash: string }[] | undefined;
  /**
   * The project-relative write scope of the assignment this attempt follows,
   * its roots and its named files. A failed Ramify check's findings are
   * attributed against it; an attempt that follows no assignment has none.
   */
  readonly writeScope?: readonly string[] | undefined;
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
  /** `none-selected` when the checkpoint's scenario check had nothing to run, recorded on the attempt. */
  readonly scenarios?: 'none-selected' | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Called as each command starts; a gate run in place passes it to its executor. */
  readonly started?: GateCommandStarted | undefined;
}

/** A verified gate whose commands may now be executed over a chosen revision. */
export interface PreparedGate {
  readonly checkpoint: Checkpoint;
  readonly request: GateRequest;
  readonly guardedChanges: GateAttempt['guardedChanges'];
  readonly rules: GateRuleRecord[];
  readonly unauthorized: boolean;
  readonly ruleFailed: boolean;
  readonly decisive: NotVerified[];
  readonly timeoutMs: number;
}

/**
 * Run one checkpoint in place and answer the attempt. The writer is already
 * settled by the caller; nothing here pauses or resumes one. Committing run
 * checkpoints use prepareGate and executePreparedGate separately.
 */
export async function runGate(execution: CheckExecutionPort, checkpoint: Checkpoint, request: GateRequest): Promise<GateAttempt> {
  const prepared = await prepareGate(checkpoint, request);
  if ('schema' in prepared) return prepared;
  return executePreparedGate(execution, prepared, request.head, null);
}

/** Verify the plans and harness-owned rules before any external effect is allowed. */
export async function prepareGate(checkpoint: Checkpoint, request: GateRequest): Promise<PreparedGate | GateAttempt> {
  await mkdir(request.directory, { recursive: true });

  const guardedChanges = await compareGuardedFiles(request);
  const unauthorized = guardedChanges.some(change => change.authorizedBy === null);
  const rules = [...(request.rules ?? [])];
  const ruleFailed = rules.some(rule => rule.outcome === 'failed');

  const failures = await verifyChecks(request.checks);
  const verified = failures.every(failure => failure === null);

  const decisive: NotVerified[] = failures.flatMap(failure => failure === null ? [] : [failure.notVerified]);
  // The sum is the time the commands may legitimately consume in sequence;
  // the small allowance covers lease, worktree and publication operations.
  const timeoutMs = request.checks.reduce((total, check) => total + check.command.timeoutMs, 0) + 30_000;
  if (!verified) {
    return finishGate({ checkpoint, request, guardedChanges, rules, unauthorized, ruleFailed, decisive, timeoutMs }, {
      commands: await notVerifiedRecords(request, failures), audited: null, evidence: null,
    }, null);
  }
  return { checkpoint, request, guardedChanges, rules, unauthorized, ruleFailed, decisive, timeoutMs };
}

/**
 * Execute one already verified gate over `sourceCommit` and finish its
 * immutable attempt. `started` is called as each command starts; a gate
 * prepared again from its recorded operation is given it here.
 */
export async function executePreparedGate(
  execution: CheckExecutionPort,
  prepared: PreparedGate,
  sourceCommit: string,
  commit: string | null,
  started: GateCommandStarted | undefined = prepared.request.started,
): Promise<GateAttempt> {
  const { request, checkpoint } = prepared;
  const bound = AbortSignal.timeout(prepared.timeoutMs);
  const signal = request.signal === undefined ? bound : AbortSignal.any([request.signal, bound]);
  const executionResult = await execution.run(request.checks, {
      directory: request.directory,
      classify,
      context: {
        ...(request.runId === undefined ? {} : { runId: request.runId }),
        attemptId: request.id,
        checkpoint,
        projectRoot: request.projectRoot,
        sourceCommit,
        selection: request.selection ?? { policy: 'all-project', exactOwners: [], subtrees: [] },
        dependencyDirectories: request.dependencyDirectories ?? [],
        harness: { guardedChanges: prepared.guardedChanges, rules: prepared.rules },
        timeoutMs: prepared.timeoutMs,
      },
      signal,
      ...(started === undefined ? {} : { started }),
    });
  return finishGate(prepared, executionResult, commit);
}

async function finishGate(prepared: PreparedGate, executionResult: CheckExecutionResult, commit: string | null): Promise<GateAttempt> {
  const { request, checkpoint, guardedChanges, rules, unauthorized, ruleFailed, decisive } = prepared;
  const commands = [...executionResult.commands];
  if (commands.length !== request.checks.length) {
    throw new Error(`Check execution answered ${commands.length} command records for ${request.checks.length} planned checks`);
  }

  const verdict = verdictOf(commands, unauthorized || ruleFailed);
  // A failed Ramify check reported where each of its findings lies, and a
  // failed type check whose output format the project declared named the
  // file of each error, so the cause is attributed from those locations and
  // not only from which commands failed. Nothing of a test's output is read,
  // nor any output whose format the project did not declare.
  const writeScope = request.writeScope ?? null;
  const attribution = mergeAttributions(
    await ramifyAttribution(commands, writeScope),
    await typeCheckAttribution(commands, request.checks, writeScope, request.projectRoot),
  );
  const cause = causeOf(decisive, commands, request.checks, verdict, unauthorized, ruleFailed, attribution);
  return {
    schema: gateAttemptSchema,
    id: request.id,
    checkpoint,
    subject: request.subject ?? {},
    proposedBy: request.proposedBy ?? null,
    repairRound: request.repairRound ?? 0,
    infrastructureAttempt: request.infrastructureAttempt ?? 0,
    head: request.head,
    commit,
    audited: executionResult.audited,
    evidence: executionResult.evidence,
    ...(executionResult.auditOverall == null ? {} : { auditOverall: executionResult.auditOverall }),
    guardedChanges,
    ...(rules.length === 0 ? {} : { rules }),
    commands,
    ...(request.scenarios === undefined ? {} : { scenarios: request.scenarios }),
    verdict,
    cause,
    ...(attribution === null ? {} : { attribution }),
    next: nextOf(request, verdict, cause, commands),
  };
}

/** Every command is recorded, but none runs when any plan failed verification. */
async function notVerifiedRecords(
  request: GateRequest,
  failures: readonly (VerificationFailure | null)[],
): Promise<GateCommandRecord[]> {
  const startedAt = new Date().toISOString();
  return Promise.all(request.checks.map(async (check, index) => {
    const outputFile = checkOutputPath(request.directory, index, check);
    const failure = failures[index] ?? null;
    await writeFile(outputFile, '');
    return {
      kind: check.kind,
      ...(check.name === undefined ? {} : { name: check.name }),
      command: check.command,
      ...(check.selection === undefined ? {} : { selection: check.selection }),
      startedAt,
      elapsedMs: 0,
      exitCode: null,
      outcome: 'not-verified' as const,
      notVerified: failure?.notVerified ?? 'interrupted',
      runnerError: null,
      output: { path: outputFile, bytes: 0, truncated: false, tail: failure?.detail ?? '' },
    };
  }));
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
 *
 * A scenario check that completed passes by its summary, which its message
 * streams established: every run exited zero and every scenario passed. One
 * without a summary was not established by anything, so it is not verified.
 */
function classify(check: PlannedCheck, run: CommandRun, outputFile: string, scenarios?: ScenarioCheckSummary): GateCommandRecord {
  const base = {
    kind: check.kind,
    ...(check.name === undefined ? {} : { name: check.name }),
    command: check.command,
    ...(check.selection === undefined ? {} : { selection: check.selection }),
    startedAt: run.startedAt,
    elapsedMs: run.elapsedMs,
    output: { path: outputFile, bytes: run.output.bytes, truncated: run.output.truncated, tail: run.output.tail },
    ...(scenarios === undefined ? {} : { scenarios }),
  };
  if (check.kind === 'scenarios' && run.outcome.kind === 'completed') {
    if (scenarios === undefined) {
      return {
        ...base, exitCode: run.outcome.exitCode, outcome: 'not-verified', notVerified: 'runner-error',
        runnerError: { kind: 'scenario-summary-missing', message: 'The scenario check answered no summary of its message streams' },
      };
    }
    return { ...base, exitCode: run.outcome.exitCode, outcome: scenarios.failures.length === 0 ? 'passed' : 'failed', runnerError: null };
  }
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

/**
 * A command a failed setup kept from running proves nothing either way, and
 * it is the setup command's own record that decides: a build that exited
 * non-zero fails the attempt, and one that did not complete leaves it not
 * verified.
 */
function verdictOf(commands: readonly GateCommandRecord[], harnessFinding: boolean): GateAttempt['verdict'] {
  if (commands.some(command => command.outcome === 'not-verified' && command.notVerified !== 'setup-failed')) return 'not-verified';
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
  attribution: GateAttribution | null,
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
  // A setup command that ran and exited non-zero failed on the source it
  // was given; nothing after it ran. The change since the last state that
  // passed is the assignment's own, so the failure is in scope, the
  // engineer's to repair, as any project-wide failure is when the probe of
  // the assignment's own tests did not pass.
  if (commands.some(command => command.kind === 'setup' && command.outcome === 'failed')) return 'in-scope';
  // A rule the harness verified is about what this iteration wrote, so it is
  // the engineer's to repair whatever else ran.
  if (ruleFailed) return 'in-scope';
  // A failed Ramify check named the file of every finding, and a failed type
  // check in a declared format the file of every error. Where any of them
  // lies outside the assignment's own write scope the failure is not that
  // assignment's, whatever the tests of that scope did; where all of them
  // lie inside it, the failure is in scope, the engineer's to repair, even
  // though it is the local architect that answers a module violation.
  if (attribution !== null) {
    // Both are commands of the whole project, so leaving them in the scope
    // comparison would call every module violation and every type error a
    // failure outside the assignment. Their own output already said where
    // each lies.
    return attribution.outside.length > 0 || outsideAssignment(commands, checks, attributedKinds(attribution)) ? 'outside-assignment' : 'in-scope';
  }
  return outsideAssignment(commands, checks) ? 'outside-assignment' : 'in-scope';
}

/** The one attribution of an attempt, from the Ramify report's locations and the type check's. */
function mergeAttributions(ramify: GateAttribution | null, typeCheck: GateAttribution | null): GateAttribution | null {
  if (ramify === null || typeCheck === null) return ramify ?? typeCheck;
  return {
    basis: 'ramify-findings-and-type-check-errors',
    inScope: [...ramify.inScope, ...typeCheck.inScope],
    outside: [...ramify.outside, ...typeCheck.outside],
  };
}

/** The command kinds whose own output located their failures. */
function attributedKinds(attribution: GateAttribution): ReadonlySet<CheckCommandKind> {
  switch (attribution.basis) {
    case 'ramify-findings': return new Set(['ramify-check']);
    case 'type-check-errors': return new Set(['type-check']);
    case 'ramify-findings-and-type-check-errors': return new Set(['ramify-check', 'type-check']);
  }
}

/**
 * Whether this failure lies outside the last assignment's own scope: every
 * command of that scope passed, and what failed is a command of the whole
 * project. It is read from which files ran and how each command exited.
 * Without a probe of the assignment's own selection there is nothing to
 * attribute, so the failure stays in scope.
 *
 * The kinds in `except` are left out of the comparison: a Ramify check and
 * a type check run over the whole project, but where their own output named
 * the file of every finding or error, that is what attributes them.
 */
function outsideAssignment(
  commands: readonly GateCommandRecord[],
  checks: readonly PlannedCheck[],
  except: ReadonlySet<CheckCommandKind> = new Set(),
): boolean {
  let probed = false;
  let failedOutside = false;
  for (const [index, check] of checks.entries()) {
    const record = commands[index];
    if (record === undefined || check.attribution === undefined) continue;
    if (except.has(check.kind)) continue;
    if (check.attribution === 'in-scope') {
      if (record.outcome !== 'passed') return false;
      probed = true;
    } else if (record.outcome === 'failed') {
      failedOutside = true;
    }
  }
  return probed && failedOutside;
}

function nextOf(
  request: GateRequest,
  verdict: GateAttempt['verdict'],
  cause: GateCause | null,
  commands: readonly GateCommandRecord[],
): GateNext {
  if (verdict === 'passed') return 'accept';
  if (cause === 'infrastructure' || cause === 'timeout') {
    const bound = request.limits?.infrastructureRetries;
    return bound !== undefined && (request.infrastructureAttempt ?? 0) + 1 >= bound ? 'exhausted' : 'retry-infrastructure';
  }
  // A Ramify check that failed goes to the local architect whatever scope
  // its findings lie in. What a module may import is the architect's to
  // arrange with the owner; an engineer given the same brief again cannot
  // widen its own module's access, so a repair round would spend an
  // invocation on work it is not authorized to do.
  if (commands.some(command => command.kind === 'ramify-check' && command.outcome === 'failed')) return 'return-to-local-architect';
  if (cause === 'in-scope') {
    const bound = request.limits?.repairRounds;
    return bound !== undefined && (request.repairRound ?? 0) + 1 >= bound ? 'exhausted' : 'repair';
  }
  return 'return-to-local-architect';
}
