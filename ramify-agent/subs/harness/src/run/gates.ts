import { allProjectChecks, checkpointPolicies, scopedChecks, type ResolvedTests } from '../checks/checkpoint.js';
import type { CheckExecutionPort } from '../checks/execution.js';
import { executePreparedGate, prepareGate } from '../checks/gate.js';
import type { PreparedGate } from '../checks/gate.js';
import type { Checkpoint, GateAttempt, GateRuleRecord, RecordReference } from '../checks/records.js';
import { commitAccepted, findCommitByTrailers } from '../../subs/evidence/src/git.js';
import { childEnvironment, runCommand } from '../../subs/evidence/src/run-command.js';
import type { RunPolicy } from './records.js';

/*
 * A checkpoint of a run: verify, commit, then audit.
 *
 * Committing run checkpoints settle the writer and verify every plan before
 * an effect is recorded. That effect makes or finds its commit and audits the
 * exact revision. Standalone sessions keep their in-place execution.
 *
 * The commit is an external effect of the ledger, keyed by the gate attempt.
 * A repeat after a crash finds the commit by its `Ramify-Run` and
 * `Ramify-Gate` trailers and makes no second one.
 */

/** The trailer that identifies the commit one gate attempt made. */
export const gateTrailer = 'Ramify-Gate';
/** The trailer that scopes gate attempt identifiers to their durable run. */
export const runTrailer = 'Ramify-Run';

export interface CheckpointRequest {
  readonly id: string;
  /** The durable run that owns this attempt. Standalone session gates omit it. */
  readonly runId?: string | undefined;
  readonly checkpoint: Checkpoint;
  readonly projectRoot: string;
  /** Where the attempt's output files go, beside its record. */
  readonly directory: string;
  readonly head: string;
  readonly policy: RunPolicy;
  readonly proposedBy?: string | null | undefined;
  readonly repairRound?: number | undefined;
  readonly infrastructureAttempt?: number | undefined;
  /** What the attempt is for: a work item, an iteration, or neither. */
  readonly subject?: GateAttempt['subject'] | undefined;
  /** For an `owned-by-scope` checkpoint: the selection resolved anew from the current tree. */
  readonly tests?: ResolvedTests | undefined;
  /**
   * For an `all-project` checkpoint that follows an assignment: that
   * assignment's own selection, run beside the project's tests. Its outcome
   * is what tells a failure inside the last scope from one outside it.
   */
  readonly scopeProbe?: ResolvedTests | undefined;
  /** The guarded files as the assignment captured them. */
  readonly guarded?: readonly { readonly path: string; readonly hash: string }[] | undefined;
  /**
   * The project-relative write scope of the assignment this checkpoint
   * follows. A failed Ramify check's findings are attributed against it.
   */
  readonly writeScope?: readonly string[] | undefined;
  readonly authorizations?: readonly { readonly path: string; readonly by: RecordReference }[] | undefined;
  /** Rules the harness verified over the tree itself, such as a contract gate's fake naming. */
  readonly rules?: readonly GateRuleRecord[] | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Runs one checkpoint in place and answers its attempt. Durable run
 * checkpoints split preparation from execution around their commit effect.
 */
export async function runCheckpoint(execution: CheckExecutionPort, request: CheckpointRequest): Promise<GateAttempt> {
  const prepared = await prepareCheckpoint(request);
  if ('schema' in prepared) return prepared;
  return executePreparedGate(execution, prepared, request.head, null);
}

/** Verify a committing checkpoint before its commit effect is allowed to begin. */
export async function prepareCheckpoint(request: CheckpointRequest): Promise<PreparedGate | GateAttempt> {
  return prepareGate(request.checkpoint, gateRequest(request));
}

function gateRequest(request: CheckpointRequest) {
  const policy = checkpointPolicies[request.checkpoint];
  if (policy.selection !== 'all-project' && request.tests === undefined) {
    throw new Error(`The ${request.checkpoint} checkpoint requires an ${policy.selection} selection, and none was resolved`);
  }
  const checks = request.tests === undefined
    ? allProjectChecks(request.policy.commands, policy, request.scopeProbe)
    : scopedChecks(request.policy.commands, request.tests);
  return {
    id: request.id,
    ...(request.runId === undefined ? {} : { runId: request.runId }),
    projectRoot: request.projectRoot,
    directory: request.directory,
    head: request.head,
    checks,
    selection: {
      policy: policy.selection,
      exactOwners: policy.selection === 'owned-by-scope' ? [...(request.tests?.selection.exactOwners ?? [])] : [],
      subtrees: policy.selection === 'owned-by-scope' ? [...(request.tests?.selection.subtrees ?? [])] : [],
    },
    dependencyDirectories: request.policy.commands.nestedPackages.map(nested => nested.directory),
    ...(request.subject === undefined ? {} : { subject: request.subject }),
    ...(request.proposedBy === undefined ? {} : { proposedBy: request.proposedBy }),
    ...(request.repairRound === undefined ? {} : { repairRound: request.repairRound }),
    ...(request.infrastructureAttempt === undefined ? {} : { infrastructureAttempt: request.infrastructureAttempt }),
    ...(request.guarded === undefined ? {} : { guarded: request.guarded }),
    ...(request.writeScope === undefined ? {} : { writeScope: request.writeScope }),
    ...(request.authorizations === undefined ? {} : { authorizations: request.authorizations }),
    ...(request.rules === undefined ? {} : { rules: request.rules }),
    limits: {
      repairRounds: request.checkpoint === 'work-item'
        ? request.policy.limits.repairRoundsPerWorkItemGate
        : request.policy.limits.repairRoundsPerIteration,
      infrastructureRetries: request.policy.limits.infrastructureRetriesPerGate,
    },
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  };
}

/**
 * The commit one verified attempt makes, or the one it already made. The gate
 * attempt is the idempotency key within its run: a repeat after a crash finds
 * the commit by both identity trailers and makes no second one. Nothing to
 * commit is `null`, which is what a passing gate over an unchanged tree
 * records.
 */
export async function commitForGate(
  projectRoot: string,
  runId: string,
  gateId: string,
  message: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const existing = await findCommitByTrailers(projectRoot, [
    { key: runTrailer, value: runId },
    { key: gateTrailer, value: gateId },
  ], signal);
  if (existing !== null) return existing;
  return commitAccepted(projectRoot, message, signal);
}

export interface CommitMessageParts {
  readonly runId: string;
  readonly planId: string;
  readonly gate: Pick<GateAttempt, 'id' | 'checkpoint' | 'subject' | 'repairRound'>;
  /** The assignment's goal, which is the subject line beside the iteration. */
  readonly goal?: string | undefined;
  /** The engineer's own words, from its validated submission; the harness writes everything else. */
  readonly summary?: string | undefined;
  /** Earlier attempts at the same subject, newest last. */
  readonly earlier?: ReadonlyArray<{ readonly id: string; readonly verdict: string; readonly cause: string | null }> | undefined;
  /** What the one supported runner does not cover, stated rather than omitted. */
  readonly notCovered?: readonly string[] | undefined;
  readonly invocations?: readonly string[] | undefined;
  /** Modules the commit adds or removes, read from the tree and never from an agent's words. */
  readonly modules?: ReadonlyArray<{ readonly kind: 'module-created' | 'module-removed'; readonly module: string; readonly declaration: string }> | undefined;
}

/**
 * The message the harness writes, mechanically, from records. The audit
 * verdict postdates the commit and is retrieved from its note; an agent's
 * words enter only as the `summary` of its validated submission.
 */
export function commitMessage(parts: CommitMessageParts): string {
  const { gate } = parts;
  const subject = gate.subject.iteration ?? gate.subject.workItem ?? `${gate.checkpoint} verification of plan "${parts.planId}"`;
  const goal = parts.goal === undefined || parts.goal.trim() === '' ? '' : `: ${parts.goal.trim().split('\n')[0]}`;
  const lines: string[] = [`${subject}${goal}`, ''];
  if (parts.summary !== undefined && parts.summary.trim() !== '') lines.push(parts.summary.trim(), '');

  if (parts.modules !== undefined && parts.modules.length > 0) {
    const created = parts.modules.filter(notice => notice.kind === 'module-created');
    const removed = parts.modules.filter(notice => notice.kind === 'module-removed');
    if (created.length > 0) lines.push(`Modules created: ${created.map(notice => `${notice.module} (${notice.declaration})`).join(', ')}`);
    if (removed.length > 0) lines.push(`Modules removed: ${removed.map(notice => `${notice.module} (${notice.declaration})`).join(', ')}`);
  }
  if (parts.earlier !== undefined && parts.earlier.length > 0) {
    lines.push(`Earlier attempts: ${parts.earlier.map(attempt => `${attempt.id} ${attempt.verdict}${attempt.cause === null ? '' : ` (${attempt.cause})`}`).join(', ')}`);
  }
  if (parts.notCovered !== undefined && parts.notCovered.length > 0) {
    lines.push(`Not covered: ${parts.notCovered.join(', ')}`);
  }
  lines.push('');
  lines.push(`${runTrailer}: ${parts.runId}`);
  if (gate.subject.workItem !== undefined) lines.push(`Ramify-Work-Item: ${gate.subject.workItem}`);
  if (gate.subject.iteration !== undefined) lines.push(`Ramify-Iteration: ${gate.subject.iteration}`);
  lines.push(`${gateTrailer}: ${gate.id}`);
  lines.push('Audit-Note: git notes --ref=audit show <commit>');
  if (parts.invocations !== undefined && parts.invocations.length > 0) {
    lines.push(`Ramify-Invocations: ${parts.invocations.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

/** The commit the working directory is on, or `''` where git cannot say. */
export async function currentHead(projectRoot: string): Promise<string> {
  const run = await runCommand({ argv: ['git', 'rev-parse', 'HEAD'], cwd: projectRoot, env: childEnvironment(), timeoutMs: 30_000 });
  return run.outcome.kind === 'completed' && run.outcome.exitCode === 0 ? run.stdout.trim() : '';
}
