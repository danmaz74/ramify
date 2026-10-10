import type { CandidateSource } from '../../subs/evidence/src/git.js';
import type { CheckFindingGround, CheckFindingReportCredibility } from '../../subs/check-findings/src/interfaces/check-findings.js';
import { resolveSnapshotPath, type CandidateSnapshot, type SnapshotTools } from '../../subs/reviews/src/snapshot.js';
import { reportCommand, type BoundReport } from '../check-findings/report.js';
import { commitCheckFindingChange, type CheckFindingTarget } from '../check-findings/transition.js';
import { canonicalJson } from '../jobs/commands.js';
import { sha256 } from '../prompts/packages.js';
import {
  concernKey, reviewLayout,
  type NotVerifiedReason, type ReviewAttempt, type ReviewRequest, type ReviewResult, type ReviewSubmission, type ReviewSubmissionRecord,
} from '../reviews/records.js';
import { candidateModuleIndex, concernModules, groundCredibility } from '../reviews/signals.js';
import { reviewStateOf } from '../reviews/state.js';
import type { InvocationResult } from '../steps/runner.js';
import { committedRecords } from '../work/committed.js';
import { trackedScenarios } from './feature-files.js';

/*
 * How a reviewer's turn becomes its attempt's record: what its end means,
 * what the harness binds to each concern, and the one transaction that
 * finishes the attempt with its CheckFinding reports. An implementation run
 * and a reviewer step in a manual run share it, so a review a person runs
 * settles its request exactly as the run's own reader would.
 */

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What the harness binds to one concern of a valid submission. */
export interface ConcernBinding {
  readonly ground: CheckFindingGround | null;
  readonly credibility: CheckFindingReportCredibility;
  readonly modules: readonly string[];
}

/** The start a request intends: a fork for every question with a fork point, fresh for code review. */
export function requestedStartOf(request: ReviewRequest): 'fresh' | 'fork' {
  return request.forkPoint.kind === 'none' ? 'fresh' : 'fork';
}

/** Whether a CheckFinding's owner is this work item. */
export function sameWorkItem(owner: { readonly kind: string; readonly workItem?: string } | undefined, workItem: string): boolean {
  return owner?.kind === 'work-item' && owner.workItem === workItem;
}

/**
 * What one reviewer invocation's end means for its attempt: covered scope,
 * or why none, and whether another attempt could do better. Invalid output,
 * a failed execution and a timeout may be retried; an unavailable input or
 * a stop may not.
 */
export function reviewOutcome(
  result: InvocationResult<ReviewSubmission>,
  stop: NotVerifiedReason | undefined,
): { readonly result: ReviewResult; readonly retryable: boolean } {
  const notVerified = (reason: NotVerifiedReason, detail: string, retryable: boolean) => ({ result: { result: 'not-verified' as const, reason, detail }, retryable });
  if (result.id === '') return notVerified('unavailable', 'The run\'s invocation bounds refused the reviewer', false);
  switch (result.ended) {
    case 'submitted': {
      const submission = result.value;
      if (submission === undefined) return notVerified('invalid-output', 'The reviewer ended without an accepted submission', true);
      const inspected = submission.inspected.map(path => ({ path }));
      return {
        result: submission.missing.length === 0
          ? { result: 'complete', inspected, concerns: submission.concerns.length }
          : { result: 'partial', inspected, missing: submission.missing.map(entry => ({ path: entry.path, reason: entry.reason })), concerns: submission.concerns.length },
        retryable: false,
      };
    }
    case 'invalid-submission':
      return notVerified('invalid-output', 'Every submission the reviewer made was invalid, up to the bound', true);
    case 'ended':
      return notVerified('invalid-output', 'The reviewer ended without a submission', true);
    case 'context-budget-reached':
      return notVerified('execution-failed', 'The reviewer reached its context budget before it submitted', true);
    case 'failed':
      return result.interruption === 'idle-timeout' || result.interruption === 'absolute-timeout'
        ? notVerified('timed-out', `The reviewer met its ${result.interruption === 'idle-timeout' ? 'idle' : 'attempt'} bound`, true)
        : notVerified('execution-failed', `The reviewer's session failed${result.interruption === undefined ? '' : ` (${result.interruption})`}`, true);
    case 'stopped':
      return notVerified(stop ?? 'stopped', stop === 'deadline' ? 'The reviews\' settlement bound passed while this attempt ran' : 'The run stopped its readers while this attempt ran', false);
  }
}

/** Where a review's concerns are bound: the project, its candidates and the plan the run belongs to. */
export interface ConcernContext {
  readonly projectRoot: string;
  readonly planId: string;
  readonly candidates: CandidateSource;
  warn(text: string): void;
}

/**
 * The ground, credibility and modules of each concern of a valid
 * submission, in concern order. The ground is the file the reviewer named,
 * with the hash of what `snapshot_read` answered; its credibility is the
 * provenance class of that file; the modules own the concern's locations
 * on the candidate's own module tree, else the work item's module. A
 * candidate whose module declarations cannot be read leaves only that
 * fallback, with a warning.
 */
export async function concernBindings(
  target: Pick<CheckFindingTarget, 'log'>,
  context: ConcernContext,
  request: ReviewRequest,
  snapshot: CandidateSnapshot,
  tools: Pick<SnapshotTools, 'read'>,
  submission: ReviewSubmission,
): Promise<ConcernBinding[]> {
  const index = await candidateModuleIndex(context.candidates, context.projectRoot, snapshot).catch(error => {
    context.warn(`Run ${target.log.runId}: the module declarations of ${request.key.candidate} could not be read, so ${request.id}'s concerns name only their work item's module: ${message(error)}`);
    return null;
  });
  const ledger = target.log.ledger.replay();
  const workItemModule = committedRecords(ledger).workItems.find(item => item.id === request.workItem)?.module ?? null;
  const provenance = { planId: context.planId, featureFiles: new Set(trackedScenarios(ledger).records.map(record => record.file)) };
  const read = tools.read();
  return submission.concerns.map(concern => {
    const resolved = concern.ground === null ? null : resolveSnapshotPath(snapshot, concern.ground.path);
    const path = resolved?.ok === true ? resolved.path : null;
    const hash = path === null ? undefined : read.get(path);
    const ground = path === null || hash === undefined ? null : { ref: path, hash };
    return {
      ground,
      credibility: groundCredibility(ground?.ref ?? null, provenance),
      modules: concernModules(index, concern.locations, workItemModule),
    };
  });
}

/**
 * Commits one terminal attempt: its record, its valid submission and one
 * report per concern, as one line through the CheckFinding transition. A
 * request already settled or an attempt already finished is fenced, and a
 * terminal run refuses it; neither appends anything. A concern set the
 * transition refuses leaves the attempt not verified, never clean.
 */
export async function finishReview(
  target: CheckFindingTarget,
  now: () => Date,
  request: ReviewRequest,
  attempt: Omit<ReviewAttempt, 'schema' | 'result' | 'settles' | 'checkFindings' | 'finishedAt'>,
  result: ReviewResult,
  settles: boolean,
  submission?: ReviewSubmission,
  bindings: readonly ConcernBinding[] = [],
): Promise<'committed' | 'fenced'> {
  if ((submission?.concerns.length ?? 0) !== bindings.length) {
    throw new Error(`${attempt.id} submitted ${submission?.concerns.length ?? 0} concerns, and ${bindings.length} were bound`);
  }
  const finishedAt = now().toISOString();
  const record: ReviewSubmissionRecord | undefined = submission === undefined
    ? undefined
    : { schema: 'ramify-agent.review-submission/1', attempt: attempt.id, ...submission };
  const evidenceHash = record === undefined ? null : `sha256:${sha256(canonicalJson(record))}`;
  const commit = await commitCheckFindingChange(target, ({ log, state }) => {
    const current = reviewStateOf(log.events).get(request.id);
    if (current === undefined) return { stale: `No review request ${request.id} is recorded` };
    if (current.settledBy !== null) return { stale: `${request.id} was settled by ${current.settledBy}; the result of ${attempt.id} is fenced` };
    if (current.attempts.some(entry => entry.id === attempt.id && entry.finished !== null)) return { stale: `${attempt.id} has already finished; its later result is fenced` };
    const concerns = record?.concerns ?? [];
    const commands = concerns.map((concern, index) => reportCommand({
      producer: `review:${request.key.kind}`,
      attempt: attempt.id,
      reportKey: concernKey(index),
      owner: { kind: 'work-item', workItem: request.workItem },
      source: { kind: 'tree', id: request.tree },
      issueKey: null,
      verification: { kind: 'assessment' },
      observation: {
        kind: 'review-concern',
        summary: concern.summary,
        evidence: [{ kind: 'review-submission', ref: reviewLayout.submission(attempt.id), hash: evidenceHash }],
        locations: concern.locations,
      },
      judgment: {
        actor: { kind: 'agent', role: 'reviewer', invocation: attempt.invocation ?? 'none' },
        consequence: concern.consequence,
        rationale: concern.rationale,
        uncertainty: concern.uncertainty,
        remedy: concern.remedy,
        risk: concern.risk,
        ground: bindings[index]!.ground,
      },
      // A hint only, and only toward a CheckFinding of the same work item.
      suggests: concern.suggests !== null && sameWorkItem(state.findings.get(concern.suggests)?.owner, request.workItem) ? concern.suggests : null,
      credibility: bindings[index]!.credibility,
      modules: [...bindings[index]!.modules],
    } satisfies BoundReport));
    return {
      commands,
      compose: decided => {
        const touched = [...new Set(decided.outcomes.flatMap(outcome => outcome.touched))];
        const body: ReviewAttempt = { schema: 'ramify-agent.review-attempt/1', ...attempt, finishedAt, result, settles, checkFindings: touched };
        return {
          event: {
            type: 'review-attempt-finished',
            data: {
              request: request.id, attempt: attempt.id, result: result.result,
              reason: result.result === 'not-verified' ? result.reason : null, settles, checkFindings: [...decided.events],
            },
          },
          records: [
            { path: reviewLayout.attempt(attempt.id), id: attempt.id, revision: 1, body },
            ...(record === undefined ? [] : [{ path: reviewLayout.submission(attempt.id), id: attempt.id, revision: 1, body: record }]),
          ],
        };
      },
    };
  }, now());
  if (commit.kind === 'committed' || commit.kind === 'replayed') return 'committed';
  if (commit.refusal.reason === 'run-ended' || commit.refusal.reason === 'stale-basis') return 'fenced';
  // The concerns could not be promoted as submitted; the attempt covers
  // nothing then, and says why.
  return await finishReview(target, now, request, attempt, {
    result: 'not-verified', reason: 'invalid-output', detail: `Its concerns were refused: ${commit.refusal.message}`,
  }, settles);
}
