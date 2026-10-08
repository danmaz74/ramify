import { mkdir, writeFile } from 'node:fs/promises';
import { guardedFilesHash } from '../../subs/evidence/src/guarded-files.js';
import type { CommandRun } from '../../subs/evidence/src/run-command.js';
import { checkOutputPath } from './execution.js';
import type { CheckExecutionPort, CheckExecutionResult, GateCommandStart, GateCommandStarted } from './execution.js';
import type {
  AcceptedCommit, Checkpoint, GateAttempt, GateAttemptId, GateAuditProjectRecord, GateAuditRecord, GateCause,
  GateCommandRecord, GateNext, GateRuleRecord, NotVerified, RecordReference,
} from './records.js';
import { gateAttemptSchema } from './records.js';
import { verifyChecks } from './verify.js';
import { PausableDeadline } from '../run/pausable-deadline.js';
import type { PlannedCheck, VerificationFailure } from './verify.js';
import type { ConfiguredAuditMode, ConfiguredAuditResult, ConfiguredProjectResult } from '../../subs/audit/src/check-execution.js';

/*
 * Gate policy compares guarded files and verifies the harness's own rules
 * before any effect. A committing caller then creates the revision and asks
 * the project's committed audit about that exact commit: the audit
 * definition names every check, and the provider's composed verdict is the
 * audit's answer. The harness plans no test, selection or scenario run.
 *
 * A standalone session's diagnosis keeps the in-place executor, which runs
 * its planned commands in the working tree and publishes nothing.
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
  /** An in-place diagnosis's commands; a committing gate plans none. */
  readonly checks: readonly PlannedCheck[];
  /**
   * A committing gate's configured audit: the mode it requests of the
   * committed definition and the bound of the whole request, lock waits
   * excepted.
   */
  readonly audit?: {
    readonly mode: ConfiguredAuditMode;
    /** Audit the tracked nested definitions too: the final gate's full nested verification. */
    readonly nested?: boolean | undefined;
    readonly timeoutMs: number;
  } | undefined;
  readonly subject?: { readonly workItem?: string; readonly iteration?: string } | undefined;
  readonly proposedBy?: string | null | undefined;
  readonly repairRound?: number | undefined;
  readonly infrastructureAttempt?: number | undefined;
  /** The guarded files as the assignment captured them. */
  readonly guarded?: readonly { readonly path: string; readonly hash: string | null }[] | undefined;
  /** A guarded path whose change a committed record authorized. */
  readonly authorizations?: readonly { readonly path: string; readonly by: RecordReference }[] | undefined;
  /**
   * Rules the caller verified over the tree, such as the fake-naming rule of
   * a contract gate. A failed rule fails the attempt and is the engineer's to
   * repair, so the attempt's cause is `check-failed`.
   */
  readonly rules?: readonly GateRuleRecord[] | undefined;
  /** The run's bounds, where the caller has them; without them no attempt is exhausted. */
  readonly limits?: { readonly repairRounds?: number; readonly infrastructureRetries?: number } | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Called as each command or configured check starts. */
  readonly started?: GateCommandStarted | undefined;
  /** Called when a configured check waits for the machine test lock. */
  readonly waiting?: ((command: GateCommandStart, line: string) => Promise<void>) | undefined;
}

/**
 * The project's committed audit as a committing gate asks it: one request
 * of the candidate commit in the given mode, answered by the provider.
 */
export type ConfiguredGateAudit = (request: {
  readonly runId: string;
  readonly attemptId: string;
  readonly checkpoint: Checkpoint;
  readonly projectRoot: string;
  readonly sourceCommit: string;
  readonly mode: ConfiguredAuditMode;
  readonly nested: boolean;
  readonly signal: AbortSignal;
  readonly started?: GateCommandStarted | undefined;
  readonly waiting?: ((command: GateCommandStart, line: string) => Promise<void>) | undefined;
  readonly lockAcquired?: (() => void) | undefined;
}) => Promise<ConfiguredAuditResult>;

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
  const timeoutMs = request.audit?.timeoutMs ?? request.checks.reduce((total, check) => total + check.command.timeoutMs, 0) + 30_000;
  // Scratch violations must stop before a committing checkpoint stages a tree.
  // Keep a normal failed attempt so the engineer receives repair diagnostics.
  const unsafeScratch = rules.some(rule => (rule.rule === 'scratch-safety' || rule.rule === 'write-scope') && rule.outcome === 'failed');
  if (!verified || unsafeScratch) {
    return finishGate({ checkpoint, request, guardedChanges, rules, unauthorized, ruleFailed, decisive, timeoutMs }, {
      commands: await notVerifiedRecords(request, failures, unsafeScratch ? 'local-rule-failed' : 'interrupted'), audited: null, evidence: null,
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
  waiting: GateRequest['waiting'] = prepared.request.waiting,
): Promise<GateAttempt> {
  const { request, checkpoint } = prepared;
  const bound = new PausableDeadline(prepared.timeoutMs);
  const signal = request.signal === undefined ? bound.signal : AbortSignal.any([request.signal, bound.signal]);
  try {
  const executionResult = await execution.run(request.checks, {
      directory: request.directory,
      classify,
      context: {
        ...(request.runId === undefined ? {} : { runId: request.runId }),
        attemptId: request.id,
        checkpoint,
        projectRoot: request.projectRoot,
        sourceCommit,
        timeoutMs: prepared.timeoutMs,
      },
      signal,
      ...(started === undefined ? {} : { started }),
    });
    return finishGate(prepared, executionResult, commit);
  } finally {
    bound.dispose();
  }
}

/**
 * Ask the project's committed audit about `sourceCommit`, the commit this
 * gate made or found, and finish the attempt from its answer. Applicable
 * evidence the provider reuses answers the request as a fresh record does;
 * the attempt keeps both source identities. A failed, cancelled or refused
 * request is never a pass, and a time waiting for the machine test lock
 * does not count against the gate's bound.
 */
export async function executeConfiguredGate(
  audit: ConfiguredGateAudit,
  prepared: PreparedGate,
  sourceCommit: string,
  commit: string | null,
  started: GateCommandStarted | undefined = prepared.request.started,
  waiting: GateRequest['waiting'] = prepared.request.waiting,
): Promise<GateAttempt> {
  const { request, checkpoint } = prepared;
  if (request.runId === undefined || request.audit === undefined) {
    throw new Error(`Gate ${request.id} is not a committing gate with a durable run and a configured audit`);
  }
  const bound = new PausableDeadline(prepared.timeoutMs);
  const signal = request.signal === undefined ? bound.signal : AbortSignal.any([request.signal, bound.signal]);
  let releaseWait: (() => void) | undefined;
  let result: ConfiguredAuditResult;
  try {
    result = await audit({
      runId: request.runId, attemptId: request.id, checkpoint, projectRoot: request.projectRoot, sourceCommit,
      mode: request.audit.mode, nested: request.audit.nested === true, signal, started,
      waiting: async (command, line) => { releaseWait ??= bound.pause(); await waiting?.(command, line); },
      lockAcquired: () => { releaseWait?.(); releaseWait = undefined; },
    });
  } catch (error) {
    // An exception is the request's own failure: no answer exists for the commit.
    result = {
      status: signal.aborted ? 'cancelled' : 'failed', requestId: `${request.runId}:${request.id}`, mode: request.audit.mode,
      nested: request.audit.nested === true, projects: null, discovery: null, requestedSourceCommit: sourceCommit, auditedSourceCommit: null, reused: false, reuse: null,
      requestedMode: null, executedMode: null, fallbackReason: null, verdict: null,
      reportCommit: null, runRef: null, treeRef: null, definition: { path: '', blob: '' },
      detail: error instanceof Error ? error.message : String(error), provider: { error: String(error) }, checks: {},
    };
  } finally {
    releaseWait?.();
    bound.dispose();
  }
  // The gate's own bound ending the request is a timeout, as the provider's
  // own timeout is; a caller's cancellation is not.
  const boundExpired = bound.signal.aborted && request.signal?.aborted !== true;
  return finishConfiguredGate(prepared, result, commit, boundExpired);
}

/**
 * The gate's record of a configured audit's answer: the request, both
 * source identities, modes, reuse, verdict and, for a nested request, each
 * project and the discovery outcome. Readiness's baseline records the same.
 */
export function configuredAuditRecord(result: ConfiguredAuditResult): GateAuditRecord {
  return {
    requestId: result.requestId,
    mode: result.mode,
    nested: result.nested,
    status: result.status,
    definition: { ...result.definition },
    requestedSourceCommit: result.requestedSourceCommit,
    auditedSourceCommit: result.auditedSourceCommit,
    requestedMode: result.requestedMode,
    executedMode: result.executedMode,
    fallbackReason: result.fallbackReason,
    reuse: result.reuse === null ? null : { ...result.reuse, ignoredChangedPaths: [...result.reuse.ignoredChangedPaths] },
    verdict: result.status === 'completed' ? result.verdict : null,
    detail: result.detail,
    projects: result.projects === null ? null : result.projects.map(projectRecord),
    discovery: result.discovery === null ? null : {
      status: result.discovery.status,
      skipped: result.discovery.skipped.map(skip => ({ ...skip })),
      unavailable: result.discovery.unavailable.map(gap => ({ ...gap, definitions: [...gap.definitions] })),
    },
  };
}

/** The committing gate's attempt: its audit's answer beside the harness's own findings. */
function finishConfiguredGate(prepared: PreparedGate, result: ConfiguredAuditResult, commit: string | null, boundExpired = false): GateAttempt {
  const { request, checkpoint, guardedChanges, rules, unauthorized, ruleFailed } = prepared;
  const record = configuredAuditRecord(result);
  const answered = result.status === 'completed';
  // The candidate's own declared setup, such as its build, exiting non-zero
  // is the candidate's failure, as a failing check is: the engineer repairs
  // it. Every other unanswered request says nothing about the source.
  const setupFailed = configuredSetupFailed(result);
  const verdict: GateAttempt['verdict'] = setupFailed ? 'failed'
    : !answered || result.verdict === 'indeterminate' || result.verdict === null ? 'not-verified'
      : result.verdict === 'fail' || unauthorized || ruleFailed ? 'failed' : 'passed';
  const cause: GateCause | null = unauthorized ? 'guarded-change'
    : verdict === 'passed' ? null
      : verdict === 'failed' ? 'check-failed'
        : boundExpired || configuredTimedOut(result) ? 'timeout' : 'infrastructure';
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
    audited: answered ? result.requestedSourceCommit : null,
    evidence: answered && result.reportCommit !== null && result.runRef !== null && result.treeRef !== null
      ? { reportCommit: result.reportCommit, runRef: result.runRef, treeRef: result.treeRef } : null,
    ...(answered && result.verdict !== null ? { auditOverall: result.verdict } : {}),
    provider: { result: result.provider, checks: result.checks },
    audit: record,
    guardedChanges,
    ...(rules.length === 0 ? {} : { rules }),
    commands: [],
    verdict,
    cause,
    next: nextOf(request, verdict, cause),
  };
}

/** One project of a nested audit as the attempt keeps it: its verdict, execution, failures, counts and record identities. */
function projectRecord(project: ConfiguredProjectResult): GateAuditProjectRecord {
  return {
    projectRoot: project.projectRoot, verdict: project.verdict, execution: project.execution, status: project.status,
    failures: [...project.failures], requestId: project.requestId, auditedSourceCommit: project.auditedSourceCommit,
    requestedMode: project.requestedMode, executedMode: project.executedMode, fallbackReason: project.fallbackReason,
    reuse: project.reuse === null ? null : { ...project.reuse, ignoredChangedPaths: [...project.reuse.ignoredChangedPaths] },
    evidence: project.reportCommit === null || project.runRef === null || project.treeRef === null ? null
      : { reportCommit: project.reportCommit, runRef: project.runRef, treeRef: project.treeRef },
    retrievalCommands: [...project.retrievalCommands], durationSeconds: project.durationSeconds,
    counts: project.counts === null ? null : {
      checks: { ...project.counts.checks },
      tests: project.counts.tests === null ? null : { ...project.counts.tests },
      scenarios: project.counts.scenarios === null ? null : { ...project.counts.scenarios },
    },
    detail: project.detail,
  };
}

/** Whether the provider's workspace preparation stopped because a declared setup command exited non-zero. */
function configuredSetupFailed(result: ConfiguredAuditResult): boolean {
  if (result.status !== 'failed') return false;
  const provider = result.provider as { status?: unknown; error?: { code?: unknown } } | null;
  return provider !== null && typeof provider === 'object' && provider.status === 'failed' && provider.error?.code === 'setup-command-failed';
}

/** Whether a request that did not answer ran out of time, which the provider's own error code says. */
function configuredTimedOut(result: ConfiguredAuditResult): boolean {
  const provider = result.provider as { status?: unknown; error?: { code?: unknown } } | null;
  return provider !== null && typeof provider === 'object' && provider.status === 'failed'
    && (provider.error?.code === 'timeout' || provider.error?.code === 'test-lock-wait-exceeded' || provider.error?.code === 'setup-command-timed-out');
}

async function finishGate(prepared: PreparedGate, executionResult: CheckExecutionResult, commit: string | null): Promise<GateAttempt> {
  const { request, checkpoint, guardedChanges, rules, unauthorized, ruleFailed, decisive } = prepared;
  const commands = [...executionResult.commands];
  if (commands.length !== request.checks.length) {
    throw new Error(`Check execution answered ${commands.length} command records for ${request.checks.length} planned checks`);
  }

  const verdict = verdictOf(commands, unauthorized || ruleFailed);
  const cause = causeOf(decisive, commands, verdict, unauthorized, ruleFailed);
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
    ...(executionResult.provider === undefined ? {} : { provider: executionResult.provider }),
    guardedChanges,
    ...(rules.length === 0 ? {} : { rules }),
    commands,
    verdict,
    cause,
    next: nextOf(request, verdict, cause),
  };
}

/** Every command is recorded, but none runs when any plan failed verification. */
async function notVerifiedRecords(
  request: GateRequest,
  failures: readonly (VerificationFailure | null)[],
  skipped: 'local-rule-failed' | 'interrupted' = 'interrupted',
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
      startedAt,
      elapsedMs: 0,
      exitCode: null,
      outcome: 'not-verified' as const,
      notVerified: failure?.notVerified ?? skipped,
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
 */
function classify(check: PlannedCheck, run: CommandRun, outputFile: string): GateCommandRecord {
  const base = {
    kind: check.kind,
    ...(check.name === undefined ? {} : { name: check.name }),
    command: run.receivedEnvironment === undefined ? check.command : { ...check.command, env: [...run.receivedEnvironment] },
    startedAt: run.startedAt,
    elapsedMs: run.elapsedMs,
    ...(run.lockWaitMs === undefined ? {} : { lockWaitMs: run.lockWaitMs }),
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

/**
 * A command a failed setup kept from running proves nothing either way, and
 * it is the setup command's own record that decides: a build that exited
 * non-zero fails the attempt, and one that did not complete leaves it not
 * verified.
 */
function verdictOf(commands: readonly GateCommandRecord[], harnessFinding: boolean): GateAttempt['verdict'] {
  if (commands.some(command => command.outcome === 'not-verified' && command.notVerified !== 'setup-failed' && command.notVerified !== 'local-rule-failed')) return 'not-verified';
  if (harnessFinding || commands.some(command => command.outcome === 'failed')) return 'failed';
  return 'passed';
}

/** An unauthorized guarded change is the cause whatever else happened; a timeout comes before other infrastructure. */
function causeOf(
  decisive: readonly NotVerified[],
  commands: readonly GateCommandRecord[],
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
  if (reasons.has('runner-error') || reasons.has('command-missing') || reasons.has('interrupted')) return 'infrastructure';
  if (verdict !== 'failed') return 'unknown';
  // The engineer diagnoses every failed check and requests another owner when
  // repair exceeds its authority. A diagnostic path or test location is evidence,
  // not a decision about who receives the failed iteration.
  return commands.some(command => command.outcome === 'failed') || ruleFailed ? 'check-failed' : 'unknown';
}

function nextOf(
  request: GateRequest,
  verdict: GateAttempt['verdict'],
  cause: GateCause | null,
): GateNext {
  if (verdict === 'passed') return 'accept';
  if (cause === 'infrastructure' || cause === 'timeout') {
    const bound = request.limits?.infrastructureRetries;
    return bound !== undefined && (request.infrastructureAttempt ?? 0) + 1 >= bound ? 'exhausted' : 'retry-infrastructure';
  }
  if (cause === 'check-failed') {
    const bound = request.limits?.repairRounds;
    return bound !== undefined && (request.repairRound ?? 0) + 1 >= bound ? 'exhausted' : 'repair';
  }
  return 'return-to-local-architect';
}
