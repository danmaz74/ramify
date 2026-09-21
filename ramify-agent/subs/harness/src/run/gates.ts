import { allProjectChecks, checkpointPolicies, scopedChecks, type CheckpointPolicy, type ResolvedTests } from '../checks/checkpoint.js';
import { runGate } from '../checks/gate.js';
import type { Checkpoint, GateAttempt, GateRuleRecord, RecordReference } from '../checks/records.js';
import { commitAccepted, findCommitByTrailer } from '../../subs/evidence/src/git.js';
import { cleanEnvironment, runCommand } from '../../subs/evidence/src/run-command.js';
import type { RunPolicy } from './records.js';

/*
 * A checkpoint of a run: run the checks, then commit.
 *
 * The gate's commands run in the working directory while the one writer is
 * idle. On a pass the harness commits the working directory on the run
 * branch; on a failure nothing is committed and the diagnostics return. No
 * tree identity is taken or compared, so no change to the working directory
 * blocks anything: it is content for the next commit.
 *
 * The commit is an external effect of the ledger, keyed by the gate attempt.
 * A repeat after a crash finds the commit by its `Ramify-Gate` trailer and
 * makes no second one.
 */

/** The trailer that identifies the commit one gate attempt made. */
export const gateTrailer = 'Ramify-Gate';

export interface CheckpointRequest {
  readonly id: string;
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
  readonly authorizations?: readonly { readonly path: string; readonly by: RecordReference }[] | undefined;
  /** Rules the harness verified over the tree itself, such as a contract gate's fake naming. */
  readonly rules?: readonly GateRuleRecord[] | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Runs one checkpoint's checks and answers the attempt. The attempt is
 * returned, not written: the harness commits it with the event that closes
 * the checkpoint, and its `commit` is filled by the effect that follows a
 * pass.
 */
export async function runCheckpoint(request: CheckpointRequest): Promise<GateAttempt> {
  const policy = checkpointPolicies[request.checkpoint];
  if (policy.selection !== 'all-project' && request.tests === undefined) {
    throw new Error(`The ${request.checkpoint} checkpoint requires an ${policy.selection} selection, and none was resolved`);
  }
  const checks = request.tests === undefined
    ? allProjectChecks(request.policy.commands, policy, request.scopeProbe)
    : scopedChecks(request.policy.commands, request.tests);
  return runGate(request.checkpoint, {
    id: request.id,
    projectRoot: request.projectRoot,
    directory: request.directory,
    head: request.head,
    checks,
    ...(request.subject === undefined ? {} : { subject: request.subject }),
    ...(request.proposedBy === undefined ? {} : { proposedBy: request.proposedBy }),
    ...(request.repairRound === undefined ? {} : { repairRound: request.repairRound }),
    ...(request.infrastructureAttempt === undefined ? {} : { infrastructureAttempt: request.infrastructureAttempt }),
    ...(request.guarded === undefined ? {} : { guarded: request.guarded }),
    ...(request.authorizations === undefined ? {} : { authorizations: request.authorizations }),
    ...(request.rules === undefined ? {} : { rules: request.rules }),
    limits: {
      repairRounds: request.checkpoint === 'work-item'
        ? request.policy.limits.repairRoundsPerWorkItemGate
        : request.policy.limits.repairRoundsPerIteration,
      infrastructureRetries: request.policy.limits.infrastructureRetriesPerGate,
    },
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  });
}

/** Whether a pass at this checkpoint is followed by the harness's commit. */
export function commitsOnPass(checkpoint: Checkpoint): boolean {
  return (checkpointPolicies[checkpoint] satisfies CheckpointPolicy).commitOnPass;
}

/**
 * The commit one passing gate makes, or the one it already made. The gate
 * attempt is the idempotency key: a repeat after a crash finds the commit by
 * its trailer and makes no second one. Nothing to commit is `null`, which is
 * what a passing gate over an unchanged tree records.
 */
export async function commitForGate(projectRoot: string, gate: GateAttempt, message: string, signal?: AbortSignal): Promise<string | null> {
  const existing = await findCommitByTrailer(projectRoot, gateTrailer, gate.id, signal);
  if (existing !== null) return existing;
  return commitAccepted(projectRoot, message, signal);
}

export interface CommitMessageParts {
  readonly runId: string;
  readonly planId: string;
  readonly gate: GateAttempt;
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
 * The message the harness writes, mechanically, from records. The verdict on
 * the checks is the harness's, so their summary is too; an agent's words
 * enter only as the `summary` of its validated submission.
 */
export function commitMessage(parts: CommitMessageParts): string {
  const { gate } = parts;
  const subject = gate.subject.iteration ?? gate.subject.workItem ?? `${gate.checkpoint} verification of plan "${parts.planId}"`;
  const goal = parts.goal === undefined || parts.goal.trim() === '' ? '' : `: ${parts.goal.trim().split('\n')[0]}`;
  const lines: string[] = [`${subject}${goal}`, ''];
  if (parts.summary !== undefined && parts.summary.trim() !== '') lines.push(parts.summary.trim(), '');

  const rounds = gate.repairRound > 0 ? `, repair round ${gate.repairRound}` : '';
  lines.push(`Checks: ${gate.verdict} (gate ${gate.id}, checkpoint ${gate.checkpoint}${rounds})`);
  for (const command of gate.commands) {
    const seconds = (command.elapsedMs / 1000).toFixed(1);
    const outcome = command.outcome === 'not-verified' ? `not verified (${command.notVerified ?? 'unknown'})` : command.outcome;
    lines.push(`  ${command.kind.padEnd(14)}${outcome.padEnd(10)}${seconds.padStart(6)} s${selectionOf(command)}`);
  }
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
  lines.push(`Ramify-Run: ${parts.runId}`);
  if (gate.subject.workItem !== undefined) lines.push(`Ramify-Work-Item: ${gate.subject.workItem}`);
  if (gate.subject.iteration !== undefined) lines.push(`Ramify-Iteration: ${gate.subject.iteration}`);
  lines.push(`${gateTrailer}: ${gate.id}`);
  if (parts.invocations !== undefined && parts.invocations.length > 0) {
    lines.push(`Ramify-Invocations: ${parts.invocations.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

/** What one command's resolved selection contributes to its line: the file count and the owners it came from. */
function selectionOf(command: GateAttempt['commands'][number]): string {
  const selection = command.selection;
  if (selection === undefined) return '';
  const owners = [...selection.exactOwners, ...selection.subtrees.map(subtree => `${subtree} (subtree)`)];
  const files = `${selection.resolved.length} file${selection.resolved.length === 1 ? '' : 's'}`;
  return owners.length === 0 ? `   ${files}` : `   ${files}; owners ${owners.join(', ')}`;
}

/** The same attempt, naming the commit the effect made. Records are immutable: this one is written once, here. */
export function withCommit(gate: GateAttempt, commit: string | null): GateAttempt {
  return { ...gate, commit };
}

/** The commit the working directory is on, or `''` where git cannot say. */
export async function currentHead(projectRoot: string): Promise<string> {
  const run = await runCommand({ argv: ['git', 'rev-parse', 'HEAD'], cwd: projectRoot, env: cleanEnvironment(), timeoutMs: 30_000 });
  return run.outcome.kind === 'completed' && run.outcome.exitCode === 0 ? run.stdout.trim() : '';
}
