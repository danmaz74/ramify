import { mkdir } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { createConfiguredAudit, type ConfiguredAuditPort } from '../../subs/audit/src/check-execution.js';
import { selectCheckFindings } from '../../subs/check-findings/src/queries.js';
import { gitCandidateSource, type CandidateSource } from '../../subs/evidence/src/git.js';
import { prepareReview, type PreparedReview } from '../../subs/reviews/src/preparation.js';
import { openCandidateSnapshot, type CandidateSnapshot } from '../../subs/reviews/src/snapshot.js';
import { capabilityRunPolicyVersion } from '../capability/policy.js';
import { checkFindingStateOf } from '../check-findings/state.js';
import { planPath } from '../plans/discover.js';
import type { LoadedPackage } from '../prompts/packages.js';
import { pendingBindingsOf } from '../run/after-handling.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import { contextPolicyOf } from '../run/policy.js';
import { captureProjectConfig } from '../run/project-config.js';
import { declaredCheckFacts } from '../run/project-facts.js';
import { committedAuditConfigurationSchema, sessionIdSchema } from '../run/records.js';
import { concernBindings, finishReview, requestedStartOf, reviewOutcome } from '../run/review-finish.js';
import type { InvocationResult } from './runner.js';
import { reviewAttemptId, reviewLayout, reviewRequestSchema, reviewSubmissionSchema, type ReviewRequest, type ReviewSubmission } from '../reviews/records.js';
import { reviewStateOf } from '../reviews/state.js';
import { iterationAssignmentSchema } from '../work/iterations.js';
import { declaredCheckInputs } from '../work/starting-inputs.js';
import { stepInputsSchemaId, validateReviewInputs, type ReviewStepInputs } from './inputs.js';
import { readManualRun, type ManualRun } from './manual.js';
import { sameBody } from './manual-hosts.js';
import { constructReviewStep, type ConstructedReviewStep } from './reviewer.js';
import { committedBody } from './runner.js';

/*
 * A code, scope or design review in a manual run. `step inputs --request`
 * composes one question's inputs from a review request the manual run
 * recorded, as a run composes them before its reader starts: the audited
 * candidate's snapshot, its delivered patches, the iteration's intent, the
 * work item's CheckFindings, the pending-tag bindings and the declared
 * checks. `step run` opens the same candidate again, prepares the same
 * patches and validator, and, for a request of this manual run that is not
 * settled, records the attempt's start and its terminal record, which
 * settles the request.
 */

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What composing a review question from a manual run's request is given. */
export interface ReviewInputsFromRequestOptions {
  /** The manual run directory that recorded the request. */
  readonly runDirectory: string;
  readonly request: string;
  readonly candidates?: CandidateSource | undefined;
  readonly configuredAudit?: ConfiguredAuditPort | undefined;
}

export type ReviewInputsFromRequestResult =
  | { readonly status: 'refused'; readonly reason: string }
  | { readonly status: 'composed'; readonly inputs: ReviewStepInputs; readonly notes: readonly string[] };

const refused = (reason: string): ReviewInputsFromRequestResult => ({ status: 'refused', reason });

/**
 * One review question's inputs, composed from a request the manual run
 * recorded and not yet settled. Nothing is written and no lock is taken.
 */
export async function reviewInputsFromRequest(options: ReviewInputsFromRequestOptions): Promise<ReviewInputsFromRequestResult> {
  const candidates = options.candidates ?? gitCandidateSource;
  const opened = await readManualRun(options.runDirectory);
  if (opened.status === 'refused') return refused(`The manual run cannot be used: ${opened.reason}`);
  const { run, projectRoot } = opened;
  const policy = run.record.policy.reviews;
  if (policy === undefined) return refused('the manual run records no review policy');
  const parsed = reviewRequestSchema.safeParse(committedBody(run, reviewLayout.request(options.request)));
  if (!parsed.success) return refused(`the manual run ${run.directory} records no review request ${options.request}`);
  const request = parsed.data;
  const state = reviewStateOf(run.log.events).get(request.id);
  if (state === undefined) return refused(`the manual run records no review request ${request.id}`);
  if (state.settledBy !== null) return refused(`review request ${request.id} was already settled by ${state.settledBy}`);
  const open = state.attempts.find(attempt => attempt.started !== null && attempt.finished === null);
  if (open !== undefined) return refused(`attempt ${open.id} of ${request.id} started and has no terminal record`);
  const kind = request.key.kind;
  if (request.inputsUnavailable !== undefined) return refused(`the ${kind} review's inputs were unavailable when it was requested: ${request.inputsUnavailable}`);
  if (request.source !== undefined) return refused(`the ${kind} review cites an assignment package, which a manual run holds no element catalog to deliver`);
  if (kind === 'design' && request.guidance.length === 0) return refused('the design review selected no design guidance');

  const notes: string[] = [];
  const start = reviewStartOf(run, request, notes);
  if (typeof start === 'string') return refused(start);

  let snapshot: CandidateSnapshot;
  try { snapshot = await openCandidateSnapshot(candidates, projectRoot, { commit: request.key.candidate, base: request.base }); }
  catch (error) { return refused(`The audited candidate could not be read: ${message(error)}`); }
  if (snapshot.tree !== request.tree) return refused(`the audited candidate ${request.key.candidate} has tree ${snapshot.tree}, not the ${request.tree} the request bound`);

  const pendingBindings = await pendingBindingsOf(run, request, snapshot, { candidates, projectRoot });
  const assignment = iterationAssignmentSchema.safeParse(committedBody(run, request.assignment));
  const intent = assignment.success ? {
    goal: assignment.data.goal, approach: assignment.data.approach, completionEvidence: assignment.data.completionEvidence,
    scopeRationale: assignment.data.scope.rationale,
    testAreas: assignment.data.scope.resolved.ownership.modules.filter(module => assignment.data.gate.tests.exactOwners.includes(module.id)
      || assignment.data.gate.tests.subtrees.some(owner => module.id === owner || module.id.startsWith(`${owner}/`)))
      .map(module => posix.join(module.directory, 'src/tests')),
  } : null;
  const held = selectCheckFindings(checkFindingStateOf(run.log.ledger), { kind: 'list', owner: { kind: 'work-item', workItem: request.workItem }, select: 'all', limit: 100 });
  const checkFindings = held.ok && 'items' in held.view ? held.view.items.map(item => ({ id: item.id, standing: item.standing, title: item.title })) : [];
  let setup: string | undefined;
  if (kind !== 'design') {
    // A manual run captured no audit configuration; the audited candidate's committed one is read.
    const configuredAudit = options.configuredAudit ?? createConfiguredAudit({ workspaceOwnership: createAuditWorkspaceOwnership(projectRoot) });
    const auditConfiguration = await configuredAudit.read(projectRoot, request.key.candidate)
      .then(config => ({ config: committedAuditConfigurationSchema.parse(config) }), (error: unknown) => ({ invalid: message(error) }));
    const projectConfig = await captureProjectConfig(projectRoot);
    setup = declaredCheckInputs({ projectRoot, ...await declaredCheckFacts(projectRoot, auditConfiguration, projectConfig.path, snapshot), snapshot: true });
  }
  const planDocument = snapshot.entries.get(planPath(run.planId))?.kind === 'file' ? planPath(run.planId) : null;
  const briefing = {
    request: { id: request.id, key: { kind, iteration: request.key.iteration, candidate: request.key.candidate },
      workItem: request.workItem, base: request.base, tree: request.tree, gate: request.gate, guidance: request.guidance },
    snapshot, pendingBindings, assignment: intent, checkFindings, ...(setup === undefined ? {} : { setup }), planDocument,
  };
  let prepared: PreparedReview;
  try { prepared = await prepareReview({ source: candidates, projectRoot, maxConcerns: policy.maxConcerns, briefing }); }
  catch (error) { return refused(`The audited candidate's patches could not be collected: ${message(error)}`); }
  notes.push('Not composed: the starting points a run renders against the candidate from the assignment and the engineer.');
  const attempt = reviewAttemptId(request.id, state.attempts.length + 1);
  try {
    const inputs = validateReviewInputs({
      schema: stepInputsSchemaId, role: 'reviewer', question: kind, run: { planId: run.planId, runId: run.jobId },
      work: { workItem: request.workItem, iteration: request.key.iteration }, attempt: state.attempts.length + 1,
      capabilityWorkflow: run.record.policy.version === capabilityRunPolicyVersion, limits: run.record.policy.limits,
      context: contextPolicyOf(run.record.policy, 'reviewer'),
      request, snapshotTree: snapshot.tree,
      briefing: {
        assignment: intent, checkFindings, planDocument, pendingBindings: [...pendingBindings], ...(setup === undefined ? {} : { setup }),
        diffPayload: prepared.candidateDiff, changes: snapshot.changes.map(change => ({ status: change.status, path: change.path })),
        directories: (intent?.testAreas ?? []).filter(area => snapshot.directories.has(area)),
      },
      workspace: { run: join(dirname(reviewLayout.attempt(attempt)), 'workspace') },
      bounds: { absoluteMs: policy.attemptMs },
      start,
    });
    return { status: 'composed', inputs, notes };
  } catch (error) {
    return refused(`The ${kind} review cannot be composed: ${message(error)}`);
  }
}

/**
 * The start a question takes in a manual run: a scope review forks the
 * local architect's pinned point at the assignment where the manual run
 * recorded it, and starts fresh with the reason otherwise; a design review
 * forks an orientation the manual run recorded for its key, and starts fresh
 * with the reason where there is none, its guidance in its packet. `step run`
 * starts fresh, with the reason, where the forked session is not the
 * manual run's.
 */
function reviewStartOf(run: ManualRun, request: ReviewRequest, notes: string[]): ReviewStepInputs['start'] | string {
  const point = request.forkPoint;
  const fresh = (reason: string): ReviewStepInputs['start'] => {
    notes.push(`Starts fresh instead of forking: ${reason}`);
    return { kind: 'fresh', degraded: { requested: 'fork', reason } };
  };
  if (point.kind === 'none') return { kind: 'fresh' };
  if (point.kind === 'unavailable') return request.key.kind === 'code' ? point.reason : fresh(point.reason);
  const briefsBefore = (session: string, invocation: string) => {
    const ended = run.log.all('invocation-ended').find(event => event.data.invocation === invocation)?.sequence ?? 0;
    return run.log.all('brief-appended').filter(event => event.data.session === session && event.sequence < ended).map(event => event.data.decision);
  };
  if (point.kind === 'session') {
    const invocation = run.log.all('iteration-assigned').find(event => event.data.iteration === request.key.iteration)?.data.invocation;
    if (invocation === undefined) return fresh(`no assignment of ${request.key.iteration} is recorded`);
    return { kind: 'fork', session: point.session, invocation, point: point.ref, reason: 'scope-review', briefs: briefsBefore(point.session, invocation) };
  }
  const recorded = run.log.all('review-orientation-recorded').find(event => event.data.key === point.key);
  const body = recorded === undefined ? undefined : committedBody(run, reviewLayout.orientation(point.key)) as
    { outcome?: unknown; session?: unknown; invocation?: unknown; ref?: unknown } | undefined;
  if (body?.outcome !== 'oriented' || typeof body.session !== 'string' || typeof body.invocation !== 'string' || typeof body.ref !== 'string') {
    return fresh('the manual run records no design orientation of this guidance selection; a run makes one before its first design review');
  }
  return { kind: 'fork', session: sessionIdSchema.parse(body.session), invocation: body.invocation, point: body.ref, reason: 'design-orientation', briefs: briefsBefore(body.session, body.invocation) };
}

/** One review question prepared to run in a manual run, with what records its attempt. */
export interface ManualReview {
  readonly step: ConstructedReviewStep;
  readonly prepared: PreparedReview;
  /** Whether the request is the manual run's own and not settled, so the attempt is recorded and settles it. */
  readonly recorded: boolean;
  /** Records the attempt's start under the run mutex, for a request still unsettled; false when it was settled meanwhile. */
  onStarted(invocation: string, session: string): Promise<boolean>;
  /** The attempt's terminal record, which settles the request; null where the request is not the manual run's. */
  finish(result: InvocationResult<unknown>, actual: 'fresh' | 'fork' | null): Promise<string | null>;
}

/**
 * Prepares a review question's inputs in a manual run: the candidate is
 * opened again and must have the tree the inputs captured, and its patches
 * must be the ones they delivered. A request the manual run recorded must
 * be the very request the inputs carry, and not settled.
 */
export async function prepareManualReview(inputs: ReviewStepInputs, context: {
  readonly projectRoot: string;
  readonly packages: ReadonlyMap<string, LoadedPackage>;
  readonly run: ManualRun;
  readonly candidates: CandidateSource;
  readonly now: () => Date;
  readonly warn: (text: string) => void;
}): Promise<ManualReview> {
  const { projectRoot, run, candidates } = context;
  const step = constructReviewStep(inputs, { projectRoot, packages: context.packages });
  const request = inputs.request;
  const held = committedBody(run, reviewLayout.request(request.id));
  if (held !== undefined && !sameBody(held, request)) throw new ReviewRefusal(`the manual run records a different review request ${request.id} than the inputs carry`);
  const recorded = held !== undefined;
  const stateOf = () => reviewStateOf(run.log.events).get(request.id);
  if (recorded && stateOf()?.settledBy !== null) throw new ReviewRefusal(`review request ${request.id} was already settled by ${stateOf()?.settledBy}`);
  const snapshot = await openCandidateSnapshot(candidates, projectRoot, { commit: request.key.candidate, base: request.base })
    .catch((error: unknown) => { throw new ReviewRefusal(`The audited candidate could not be read: ${message(error)}`); });
  if (snapshot.tree !== inputs.snapshotTree) throw new ReviewRefusal(`the audited candidate has tree ${snapshot.tree}, not the ${inputs.snapshotTree} the inputs captured`);
  const { briefing } = inputs;
  const prepared = await prepareReview({
    source: candidates, projectRoot, maxConcerns: run.record.policy.reviews?.maxConcerns ?? 1,
    briefing: {
      request: { id: request.id, key: { kind: inputs.question, iteration: request.key.iteration, candidate: request.key.candidate },
        workItem: request.workItem, base: request.base, tree: request.tree, gate: request.gate, guidance: request.guidance },
      snapshot, pendingBindings: briefing.pendingBindings ?? [], assignment: briefing.assignment, checkFindings: briefing.checkFindings,
      ...(briefing.package === undefined ? {} : { package: briefing.package }), ...(briefing.setup === undefined ? {} : { setup: briefing.setup }),
      planDocument: briefing.planDocument ?? null,
    },
  }).catch((error: unknown) => { throw new ReviewRefusal(`The audited candidate's patches could not be collected: ${message(error)}`); });
  if (prepared.candidateDiff !== briefing.diffPayload) {
    throw new ReviewRefusal('The candidate patches prepared now differ from the ones the inputs delivered; compose the inputs again');
  }
  await mkdir(run.path(inputs.workspace.run), { recursive: true });

  const state = stateOf();
  const attempt = reviewAttemptId(request.id, (state?.attempts.length ?? 0) + 1);
  const queuedAt = state?.attempts.at(-1)?.finished?.at ?? state?.recordedAt ?? context.now().toISOString();
  const requestedStart = requestedStartOf(request);
  let started: { invocation: string; session: string; at: string } | undefined;
  return {
    step, prepared, recorded,
    onStarted: async (invocation, session) => {
      if (!recorded) return true;
      const at = context.now();
      const appended = await run.mutex.run(async () => {
        if (stateOf()?.settledBy !== null) return false;
        await run.log.append({ type: 'review-attempt-started', data: { request: request.id, attempt, invocation, session: sessionIdSchema.parse(session), requestedStart } }, at);
        return true;
      });
      if (appended) started = { invocation, session, at: at.toISOString() };
      return appended;
    },
    finish: async (ended, actual) => {
      if (!recorded) return null;
      // The value passed the review's validator, which accepts review submissions only.
      const result: InvocationResult<ReviewSubmission> = { ...ended, value: ended.value === undefined ? undefined : reviewSubmissionSchema.parse(ended.value) };
      const outcome = reviewOutcome(result, undefined);
      const submission = result.ended === 'submitted' ? result.value : undefined;
      const bindings = submission === undefined || submission.concerns.length === 0 ? []
        : await concernBindings(run, { projectRoot, planId: run.planId, candidates, warn: context.warn }, request, snapshot, prepared.tools, submission);
      await finishReview(run, context.now, request, {
        id: attempt, request: request.id, queuedAt, requestedStart,
        startedAt: started?.at ?? null, invocation: started?.invocation ?? null, session: started === undefined ? null : sessionIdSchema.parse(started.session), actualStart: actual,
      }, outcome.result, true, submission, bindings);
      return reviewLayout.attempt(attempt);
    },
  };
}

/** A review that cannot run as its inputs describe, refused before it starts. */
export class ReviewRefusal extends Error {}
