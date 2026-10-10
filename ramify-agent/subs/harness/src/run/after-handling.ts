import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CandidateSource, GitService } from '../../subs/evidence/src/git.js';
import type { PackageCitation } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { orientationKey, readGuidance } from '../../subs/reviews/src/inputs.js';
import { openCandidateSnapshot, type CandidateSnapshot } from '../../subs/reviews/src/snapshot.js';
import { capabilityCompletionBlockers, replayCapabilityState } from '../capability/state.js';
import { type ConsumerRequirement, type ContractRecord, type ProviderObligation } from '../contracts/records.js';
import { bindingKey, conformanceKey, openRequirements, verificationKey } from '../contracts/schedule.js';
import { isContained, resolveRealTarget } from '../guard/resolve-contained-path.js';
import type { RunFailureReason } from '../interfaces/protocol/runs.js';
import { commitRecord, type RecordRef as CommitRecord } from '../jobs/commit.js';
import { sha256 } from '../prompts/packages.js';
import { pendingBindingEvidence } from '../reviews/binding-evidence.js';
import { reviewLayout, reviewRequestId, reviewRequestSchema, type ForkPoint, type ReviewRequest } from '../reviews/records.js';
import { reviewStateOf } from '../reviews/state.js';
import { committedBody } from '../steps/runner.js';
import { committedRecords, refOf } from '../work/committed.js';
import { engineerSubmissionSchema } from '../work/engineer.js';
import { dueIntegrations, integrationWorkItem } from '../work/integration.js';
import {
  iterationAssignmentSchema, iterationLayout, iterationResultSchema, workItemOfIteration,
  type IterationAssignment, type IterationResult, type WriteScope,
} from '../work/iterations.js';
import {
  bindingEventsToRecord, obligationEventsToRecord, obligationsOf,
  type ObligationActor, type ObligationBinding, type ObligationProjection, type ObligationRegistration, type ObligationReport,
} from '../work/obligations.js';
import { workItemOutlineSchema, workLayout, type WorkItem, type WorkItemOutline } from '../work/records.js';
import type { OutlineBody } from '../work/submission.js';
import { releasableScratchModules, removeScratchDirectories } from '../work/scratch.js';
import type { CommittingGates, GateRun } from './committing-gate.js';
import { expectedFeatureFiles, trackedScenarios, writtenScenarios } from './feature-files.js';
import type { RunEventInput, RunEventOf, RunLog } from './log.js';
import { declaredModuleDirectories } from './project-config.js';
import { gateAttemptSchema, runLayout, type ArchitectRef, type RecordRef, type ReviewKind } from './records.js';
import type { RunWrite } from './service.js';

/*
 * What the harness records after an accepted submission, as far as it is a
 * function of records: the obligations an architect reported, the bindings
 * an engineer proposed, an iteration's close and the review requests an
 * accepted iteration owes. An implementation run and a manual run's `after`
 * share it; each names, through its host, how it writes and fails, and what
 * only it can supply: a correction's close, a package citation and the
 * identity a design orientation is keyed by.
 */

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What one review question binds besides the candidate. */
export type ReviewInputs = Pick<ReviewRequest, 'guidance' | 'forkPoint'> & Partial<Pick<ReviewRequest, 'inputsUnavailable' | 'source'>>;

/** What the after-handling asks of a run. */
export interface HandlingHost<R extends GateRun> {
  readonly projectRoot: string;
  readonly git: GitService;
  readonly candidates: CandidateSource;
  readonly gates: CommittingGates<R>;
  write(run: R, input: RunEventInput, records?: readonly CommitRecord[]): Promise<'committed' | 'already-committed' | 'ended'>;
  afterWrite(write: RunWrite, runId: string): Promise<void>;
  warn(text: string): void;
  ignoring(run: R): boolean;
  /** Ends the run with the reason; a manual run's handling stops with the detail as its error. */
  fail(run: R, reason: RunFailureReason, detail: string, records?: readonly string[]): Promise<void>;
  /** Closes an accepted correction with its repair claims, on the same line as the close. */
  closeCorrection(run: R, workItem: string, closing: {
    readonly data: Omit<RunEventOf<'iteration-closed'>['data'], 'checkFindings'>;
    readonly record: CommitRecord;
    readonly corrects: string;
    readonly gate: string;
    readonly commit: string;
    readonly invocation: string | null;
  }): Promise<void>;
  /** Cites elements with every plan deviation recorded so far; throws where no catalog is held. */
  citeCurrentDeviations(run: R, elements: readonly string[]): Promise<PackageCitation>;
  /** Who a design orientation is keyed by, or why the run names none. */
  orientationIdentity(run: R): { readonly packageHash: string | null; readonly agent: string; readonly model: string | null } | string;
  /** Wakes the run's review readers, where it has any. */
  wakeReviews(run: R): void;
}

/** The after-handling of one kind of run. */
export class AfterHandling<R extends GateRun> {
  constructor(private readonly host: HandlingHost<R>) {}

  /**
   * Records every review request owed for one accepted iteration, once per
   * key, before the driver passes it. The candidate's tree is read first,
   * outside the mutex; the key is checked and the identifier counted under
   * it. Answers the requests it recorded: none for a key already recorded,
   * a run that has ended, or a candidate whose tree cannot be read, which
   * is warned about.
   */
  async requestReviews(run: R, closed: { readonly workItem: string; readonly iteration: string; readonly gate: string; readonly commit: string }): Promise<string[]> {
    const policy = run.policy.reviews;
    if (policy === undefined) return [];
    let tree: string;
    try {
      tree = await this.host.candidates.commitTree(this.host.projectRoot, closed.commit);
    } catch (error) {
      // A request binds its tree; without one there is nothing to review
      // against, and the gap is the missing request, stated here.
      this.host.warn(`Run ${run.jobId}: no review of ${closed.iteration} was requested; the tree of ${closed.commit} could not be read: ${message(error)}`);
      return [];
    }
    const number = Number.parseInt(closed.iteration.slice(closed.iteration.lastIndexOf('.i') + 2), 10);
    const base = this.host.gates.acceptedBefore(run, closed.gate);
    const assignment = iterationLayout.assignment(closed.workItem, number);
    // Each question's captured inputs are read before the mutex, as the tree is.
    const inputs = new Map<ReviewKind, ReviewInputs>();
    for (const kind of policy.kinds) inputs.set(kind, await this.reviewInputs(run, kind, { ...closed, assignment, base }));
    const recorded: string[] = [];
    for (const kind of policy.kinds) {
      const outcome = await run.mutex.run(async () => {
        if (run.log.terminal) return null;
        const existing = [...reviewStateOf(run.log.events).values()]
          .find(request => request.iteration === closed.iteration && request.candidate === closed.commit && request.kind === kind);
        if (existing !== undefined) return null;
        const id = reviewRequestId(run.log.count('review-request-recorded') + 1);
        const request = reviewRequestSchema.parse({
          schema: 'ramify-agent.review-request/1',
          id,
          key: { iteration: closed.iteration, candidate: closed.commit, kind, policy: policy.version },
          workItem: closed.workItem,
          assignment,
          base,
          gate: closed.gate,
          tree,
          ...inputs.get(kind)!,
        } satisfies ReviewRequest);
        await commitRecord(run.log.ledger, {
          event: run.log.next({
            type: 'review-request-recorded',
            data: { request: id, workItem: closed.workItem, iteration: closed.iteration, kind, gate: closed.gate, candidate: closed.commit },
          }),
          records: [{ path: reviewLayout.request(id), id, revision: 1, body: request }],
        });
        return id;
      });
      if (outcome !== null) recorded.push(outcome);
    }
    this.host.wakeReviews(run);
    return recorded;
  }

  /**
   * What one question of one candidate is given besides the candidate, and
   * the point its reviewer starts from. Code review needs nothing more and
   * never forks. Scope review binds the plan excerpts the assignment cites
   * and the local architect's pinned point at the assignment. Design review
   * binds the guidance it selects from the candidate and the orientation
   * key of that selection. An input that cannot be read is recorded as
   * such: the attempt then says what it lacked.
   */
  async reviewInputs(
    run: R,
    kind: ReviewKind,
    closed: { readonly workItem: string; readonly iteration: string; readonly commit: string; readonly assignment: string; readonly base: string },
  ): Promise<ReviewInputs> {
    const none: ReviewInputs = { guidance: [], forkPoint: { kind: 'none' } };
    if (kind === 'code' || kind === 'scope') {
      // Both read the assignment package from its record; scope review adds
      // the plan deviations recorded by the time it is requested.
      let source: PackageCitation | undefined;
      try {
        const assignment = iterationAssignmentSchema.parse(committedBody(run, closed.assignment));
        source = assignment.source === undefined || kind === 'code' ? assignment.source
          : await this.host.citeCurrentDeviations(run, assignment.source.elements);
      } catch (error) {
        return { ...none, inputsUnavailable: `The ${kind} review's assignment package could not be cited: ${message(error)}` };
      }
      if (kind === 'code') return { ...none, ...(source === undefined ? {} : { source }) };
      const assigned = run.log.all('iteration-assigned').find(event => event.data.iteration === closed.iteration);
      const capabilityAssigned = run.log.all('capability-assigned').find(event => event.data.assignment === closed.iteration);
      const pinned = assigned?.data.architectRef ?? capabilityAssigned?.data.architectRef;
      const forkPoint: ForkPoint = pinned === undefined || pinned === null
        ? { kind: 'unavailable', reason: pinned === null ? 'The local architect\'s session was not kept after the assignment' : 'The assignment recorded no pinned point of the local architect' }
        : { kind: 'session', session: pinned.session, ref: pinned.ref };
      return { guidance: [], forkPoint, ...(source === undefined ? {} : { source }) };
    }
    try {
      const snapshot = await openCandidateSnapshot(this.host.candidates, this.host.projectRoot, { commit: closed.commit, base: closed.base });
      const guidance = (await readGuidance(this.host.candidates, this.host.projectRoot, snapshot)).map(({ ref, hash }) => ({ ref, hash }));
      if (guidance.length === 0) return { ...none, forkPoint: { kind: 'unavailable', reason: 'The candidate holds no guidance to judge a design against' } };
      const identity = this.host.orientationIdentity(run);
      if (typeof identity === 'string') return { guidance, forkPoint: { kind: 'unavailable', reason: identity } };
      const key = orientationKey({
        guidance,
        packageHash: identity.packageHash,
        agent: identity.agent,
        model: identity.model,
        context: run.policy.context.reviewer,
        scope: { projectRoot: this.host.projectRoot, workItem: closed.workItem, authority: 'read-only-candidate' },
        execution: { history: 'complete', compaction: 'forbidden', snapshot: 'current-request-candidate' },
      });
      return { guidance, forkPoint: { kind: 'orientation', key } };
    } catch (error) {
      return { ...none, forkPoint: { kind: 'unavailable', reason: `The candidate's guidance could not be read: ${message(error)}` } };
    }
  }

  /** Commits the `IterationResult` and closes the iteration. It is the last write of that iteration. */
  async closeIteration(
    run: R,
    item: WorkItem,
    number: number,
    assignment: IterationAssignment,
    body: {
      readonly outcome: IterationResult['outcome'];
      readonly invocations: readonly string[];
      readonly findings: readonly string[];
      readonly gate: string | null;
      readonly commit: string | null;
      readonly recommendation?: string | undefined;
      /** Where an engineer ended without a result: its digest and its analysis. */
      readonly failure?: IterationResult['failure'] | undefined;
    },
  ): Promise<IterationResult> {
    // The notices are read from the commit itself, never from an agent's
    // words, so a run that repeats the effect derives the same ones.
    const notices = await this.host.gates.committedModules(run, body.commit, assignment.id, body.gate);
    const proposalInvocation = body.gate === null ? body.invocations.at(-1)
      : gateAttemptSchema.parse(committedBody(run, runLayout.gate(body.gate))).proposedBy;
    const submissionBytes = proposalInvocation == null ? undefined
      : await readIfExists(run.path(runLayout.submission(proposalInvocation)));
    const retainedSubmission = proposalInvocation == null ? null
      : committedRecords(run.log.ledger.replay()).outcomes.get(proposalInvocation)?.submission;
    if (retainedSubmission != null && (submissionBytes === undefined || sha256(submissionBytes) !== retainedSubmission.hash)) {
      throw new Error(`Engineer ${proposalInvocation} has changed or missing submission bytes`);
    }
    const rawSubmission = submissionBytes === undefined ? null : JSON.parse(submissionBytes.toString('utf8')) as Record<string, unknown>;
    const submitted = rawSubmission?.schema === 'ramify-agent.engineer-submission/1'
      ? engineerSubmissionSchema.safeParse((({ schema: _schema, ...value }) => value)(rawSubmission)) : null;
    const startingPoints = submitted?.success && ['completion-proposed', 'partial'].includes(submitted.data.kind)
      && 'startingPoints' in submitted.data ? submitted.data.startingPoints : undefined;
    const result = iterationResultSchema.parse({
      schema: 'ramify-agent.iteration-result/1',
      iteration: assignment.id,
      ...(assignment.coordination === undefined ? {} : { coordination: assignment.coordination }),
      outcome: body.outcome,
      invocations: [...body.invocations],
      gate: body.gate,
      commit: body.commit,
      findings: [...body.findings],
      changedAssumptions: [],
      ...(startingPoints === undefined ? {} : { startingPoints }),
      ...(body.recommendation === undefined ? {} : { recommendation: body.recommendation }),
      artifacts: [],
      ...(body.failure === undefined ? {} : { failure: body.failure }),
    } satisfies IterationResult);

    const data = { workItem: item.id, iteration: assignment.id, outcome: result.outcome, gate: result.gate, commit: result.commit, notices };
    const recordOwner = assignment.coordination?.kind === 'capability-task' ? assignment.coordination.id : item.id;
    const record = { path: iterationLayout.result(recordOwner, number), id: assignment.id, revision: 1, body: result };
    const corrects = assignment.coordination?.kind === 'capability-task'
      ? run.log.all('capability-assigned').find(event => event.data.assignment === assignment.id)?.data.corrects
      : run.log.all('iteration-assigned').find(event => event.data.iteration === assignment.id)?.data.corrects;
    if (result.outcome === 'accepted' && result.gate !== null && result.commit !== null && corrects !== undefined) {
      await this.host.closeCorrection(run, recordOwner, { data, record, corrects, gate: result.gate, commit: result.commit, invocation: body.invocations.at(-1) ?? null });
    } else {
      await this.host.write(run, { type: 'iteration-closed', data }, [record]);
    }
    await this.host.afterWrite('iteration-closed', run.jobId);
    await this.cleanupClosedScratch(run);
    return result;
  }

  /** A closed assignment releases scratch only when no other assignment in its module remains open. */
  async cleanupClosedScratch(run: R): Promise<void> {
    const records = committedRecords(run.log.ledger.replay());
    // Contract revision can supersede an assignment by committing its result
    // with evidence-reopened, without a separate iteration-closed event.
    const closed = new Set(records.results.keys());
    const engineerAssignments = new Set([
      ...run.log.all('iteration-assigned').map(event => event.data.iteration),
      ...run.log.all('capability-assigned').map(event => event.data.assignment),
    ]);
    const declared = await declaredModuleDirectories(this.host.projectRoot);
    const directoriesOf = (scope: WriteScope): string[] => {
      const captured = scope.resolved.roots.flatMap(root => {
        const path = relative(this.host.projectRoot, root).replaceAll('\\', '/');
        return path === 'src' ? [''] : path.endsWith('/src') ? [path.slice(0, -'/src'.length)] : [];
      });
      return [...new Set([...declared, ...captured].filter(directory => {
        const src = join(this.host.projectRoot, directory, 'src');
        return scope.resolved.roots.some(root => root === src || isContained(root, src));
      }))];
    };
    const assignments = [...records.assignments.values()]
      .filter(assignment => engineerAssignments.has(assignment.id))
      .map(assignment => ({ id: assignment.id, modules: directoriesOf(assignment.scope) }));
    for (const iteration of closed) {
      const removable = releasableScratchModules(iteration, assignments, closed);
      if (removable.length === 0) continue;
      const removed = await removeScratchDirectories(this.host.projectRoot, removable, this.host.git);
      if (removed.preservedTracked.length > 0 && !run.log.all('scratch-preserved').some(entry =>
        entry.data.iteration === iteration && entry.data.paths.join('\0') === removed.preservedTracked.join('\0'))) {
        await this.host.write(run, { type: 'scratch-preserved', data: { iteration, paths: [...removed.preservedTracked] } });
      }
    }
  }

  /**
   * Records an accepted architect submission's registrations and reports,
   * each as its own event naming the invocation and the submission's hash.
   * What the same accepted submission already recorded is not recorded
   * again, so a replayed action applies each effect once.
   */
  async recordObligations(run: R, actor: ObligationActor, invocation: string,
    submission: { readonly registrations: readonly ObligationRegistration[]; readonly reports: readonly ObligationReport[] }): Promise<boolean> {
    if (submission.registrations.length === 0 && submission.reports.length === 0) return true;
    const hash = run.log.all('invocation-ended').find(event => event.data.invocation === invocation)?.data.submission ?? null;
    if (hash === null) {
      await this.host.fail(run, 'internal', `Invocation ${invocation} reported obligations without a recorded accepted submission`, [runLayout.outcome(invocation)]);
      return false;
    }
    for (const input of obligationEventsToRecord(submission, actor, { by: invocation, submission: hash }, obligationProjection(run.log), run.log.events)) {
      // A done report that makes every sub-scenario of an integration
      // scenario done commits that scenario's work item with it.
      const due = input.type === 'obligation-reported' && input.data.judgment === 'done' ? integrationItemsDue(run.log, input.data.id) : [];
      if (await this.host.write(run, input, due) === 'ended') return false;
      // A crash between two reports of one submission leaves the rest to
      // the replay, which records each once.
      if (input.type === 'obligation-reported') await this.host.afterWrite('obligation-reported', run.jobId);
      if (this.host.ignoring(run)) return false;
    }
    return !this.host.ignoring(run);
  }

  /** Attribute only the rendering and accepted bindings preceding this exact candidate gate. */
  async reviewPendingBindings(run: R, request: ReviewRequest, snapshot: CandidateSnapshot) {
    return pendingBindingsOf(run, request, snapshot, this.host);
  }

  /**
   * Records an accepted engineer proposal's bindings, each as its own
   * `obligation-bound` event naming the invocation and the submission's hash.
   * What the same accepted submission already recorded is not recorded
   * again, so a replayed action applies each binding once.
   */
  async recordBindings(run: R, invocation: string, bindings: readonly ObligationBinding[]): Promise<boolean> {
    if (bindings.length === 0) return true;
    const hash = run.log.all('invocation-ended').find(event => event.data.invocation === invocation)?.data.submission ?? null;
    if (hash === null) {
      await this.host.fail(run, 'internal', `Invocation ${invocation} bound obligations without a recorded accepted submission`, [runLayout.outcome(invocation)]);
      return false;
    }
    for (const input of bindingEventsToRecord(bindings, { by: invocation, submission: hash }, run.log.events)) {
      if (await this.host.write(run, input) === 'ended') return false;
    }
    return !this.host.ignoring(run);
  }

  /**
   * The outline revision an accepted local architect submission carries,
   * written once for its invocation: a repeated handling of the same
   * invocation answers the revision it already wrote. Null once the run
   * accepts nothing more.
   */
  async reviseOutline(run: R, input: {
    readonly item: WorkItem;
    readonly invocation: string;
    readonly outline: OutlineBody;
    readonly hypothesesSeen: readonly RecordRef[];
    /** The architect's pinned point a completion request records with its revision; absent for an assignment's. */
    readonly architectRef?: ArchitectRef | null | undefined;
  }): Promise<{ readonly outline: WorkItemOutline; readonly written: boolean } | null> {
    const { item, invocation } = input;
    const prior = run.log.all('outline-revised').find(event => event.data.workItem === item.id && event.data.invocation === invocation);
    if (prior !== undefined) {
      const outline = workItemOutlineSchema.parse(committedBody(run, workLayout.outline(item.id, prior.data.revision)));
      if (outline.invocation !== invocation) throw new Error(`The outline revision ${prior.data.revision} of ${item.id} no longer names ${invocation}`);
      return { outline, written: false };
    }
    const revision = (committedRecords(run.log.ledger.replay()).outlines.get(item.id) ?? []).length + 1;
    const outline = workItemOutlineSchema.parse({
      schema: 'ramify-agent.work-item-outline/1', workItem: item.id, revision, invocation, ...input.outline,
      hypothesesSeen: input.hypothesesSeen.map(ref => ({ ...ref })),
    } satisfies WorkItemOutline);
    await this.host.write(run, { type: 'outline-revised', data: { workItem: item.id, revision, invocation,
      ...(input.architectRef === undefined ? {} : { architectRef: input.architectRef }) } }, [
      { path: workLayout.outline(item.id, revision), id: item.id, revision, body: outline },
    ]);
    await this.host.afterWrite('outline-revised', run.jobId);
    return this.host.ignoring(run) ? null : { outline, written: true };
  }

  /**
   * Commits an accepted assignment: its record, the local decisions committed
   * with it, and the \`iteration-assigned\` that names the invocation, the
   * architect's pinned point and the reconciliation it corrects. Null once
   * the run accepts nothing more.
   */
  async recordAssignment(run: R, input: {
    readonly item: WorkItem;
    readonly number: number;
    readonly invocation: string;
    readonly assignment: IterationAssignment;
    readonly decisions: readonly string[];
    readonly localRecords: readonly CommitRecord[];
    readonly architectRef: ArchitectRef | null;
  }): Promise<IterationAssignment | null> {
    const { item, assignment } = input;
    const corrects = pendingCorrection(run.log, item.id);
    // The architect's pinned point that produced this assignment is
    // committed with it: the iteration's scope review forks it. The first
    // assignment after a reconciliation chose a correction resolves that
    // reconciliation's repair intent.
    await this.host.write(run, {
      type: 'iteration-assigned',
      data: {
        workItem: item.id, iteration: assignment.id, kind: assignment.kind, scopeRevision: assignment.scope.revision, invocation: input.invocation,
        decisions: [...input.decisions], architectRef: input.architectRef, ...(corrects === undefined ? {} : { corrects }),
      },
    }, [
      { path: iterationLayout.assignment(item.id, input.number), id: assignment.id, revision: 1, body: assignment },
      ...input.localRecords,
    ]);
    await this.host.afterWrite('iteration-assigned', run.jobId);
    return this.host.ignoring(run) ? null : assignment;
  }
}

// Ledger-only projections the handling and the run share.

/**
 * The pending-tag bindings a review of the candidate is told about: each
 * accepted binding committed before the request's gate whose scenario file
 * the candidate changed, with its verified provenance.
 */
export async function pendingBindingsOf(run: Pick<GateRun, 'log' | 'planId' | 'jobId'> & { path(relative: string): string }, request: ReviewRequest,
  snapshot: CandidateSnapshot, host: { readonly candidates: CandidateSource; readonly projectRoot: string }) {
  const lines = run.log.ledger.replay();
  const gate = lines.findIndex(line => line.transaction.event.type === 'gate-committing' && line.transaction.event.data.gate === request.gate);
  if (gate < 0) return [];
  const prefix = lines.slice(0, gate + 1);
  const tracked = writtenScenarios(prefix);
  const expected = new Map(expectedFeatureFiles(tracked, { planId: run.planId, runId: run.jobId }).map(file => [file.path, file.content]));
  const changed = new Set(snapshot.changes.map(change => change.path));
  const bindings: Array<{ path: string; sha256: string; scenario: string; invocation: string; submission: string }> = [];
  for (const line of prefix) {
    const event = line.transaction.event;
    if (event.type !== 'obligation-bound') continue;
    const scenario = tracked.records.find(record => record.id === event.data.id);
    if (!scenario || !changed.has(scenario.file) || snapshot.entries.get(scenario.file)?.kind !== 'file') continue;
    const end = prefix.find(item => item.transaction.event.type === 'invocation-ended' && item.transaction.event.data.invocation === event.data.by
      && item.transaction.event.data.submission === event.data.submission);
    if (!end) continue;
    const submission = await readIfExists(run.path(runLayout.submission(event.data.by)));
    if (submission === undefined || sha256(submission) !== event.data.submission) continue;
    const bytes = await host.candidates.readBlob(host.projectRoot, request.key.candidate, scenario.file);
    const evidence = pendingBindingEvidence({ path: scenario.file, scenario: scenario.id, invocation: event.data.by, submission: event.data.submission,
      submissionBytes: submission, candidateBytes: bytes, expectedBytes: expected.get(scenario.file) });
    if (evidence !== null) bindings.push(evidence);
  }
  return bindings;
}

/**
 * A scope widened by the guarded paths an architect authorized: each one the
 * engineer may write through the guarded tools, recorded beside the scope it
 * widens by that one file.
 */
export async function authorizedScope(projectRoot: string, scope: WriteScope, authorizations: readonly { readonly path: string }[]): Promise<WriteScope> {
  for (const authorization of authorizations) {
    const target = await resolveRealTarget(projectRoot, authorization.path);
    if (target.ok && !scope.resolved.files.includes(target.resolved)) scope.resolved.files.push(target.resolved);
  }
  return scope;
}

/** The contract artifacts in force, each with the agreement that names it: the guarded set an assignment captures. */
export function requiredArtifacts(committed: ReturnType<typeof committedRecords>): Array<{ path: string; contract: ContractRecord }> {
  const artifacts: Array<{ path: string; contract: ContractRecord }> = [];
  for (const contract of committed.contracts.values()) {
    const paths = [
      ...contract.artifacts.interface.map(entry => entry.path),
      ...contract.artifacts.conformance.map(entry => entry.path),
      ...contract.artifacts.fake.map(entry => entry.path),
    ];
    for (const path of paths) artifacts.push({ path, contract });
  }
  return artifacts;
}

/**
 * Registered evidence an iteration must satisfy, derived and never
 * submitted: a provider work item runs the agreed suite against the real
 * implementation, and a verification runs its consumer's tests with the fake
 * replaced.
 */
export function evidenceFor(log: RunLog, item: WorkItem, kind: IterationAssignment['kind'], records: ReturnType<typeof committedRecords>): IterationAssignment['evidenceObligations'] {
  const evidence: IterationAssignment['evidenceObligations'] = [];
  const obligation = obligationOwedBy(log, item, records);
  if (obligation !== null) {
    evidence.push({ obligation: refOf(obligation.id, obligation.revision, obligation), suite: [...obligation.evidence.conformance], against: 'real' });
  }
  if (kind === 'verification') {
    for (const requirement of openRequirementsOf(log, records, item.id)) {
      const owed = records.obligations.get(requirement.obligation);
      evidence.push({ requirement: refOf(requirement.id, requirement.revision, requirement), suite: [...(owed?.evidence.conformance ?? [])], against: 'real' });
    }
  }
  return evidence;
}

/** The one obligation projection: scenario records, delegated outcomes and the accepted registrations and reports. */
export function obligationProjection(log: RunLog): ObligationProjection {
  const lines = log.ledger.replay();
  return obligationsOf({ scenarios: trackedScenarios(lines).records, workItems: committedRecords(lines).workItems, events: log.events });
}

/**
 * The integration work items a done report of one scenario makes due: each
 * integration whose every sub-scenario is then done.
 */
export function integrationItemsDue(log: RunLog, scenario: string): CommitRecord[] {
  const lines = log.ledger.replay();
  const tracked = trackedScenarios(lines);
  if (!tracked.states.has(scenario)) return [];
  const after = new Map(tracked.states);
  after.set(scenario, 'done');
  const items = [...committedRecords(lines).workItems];
  const records: CommitRecord[] = [];
  for (const integration of dueIntegrations(tracked.records, after, items)) {
    if (!integration.subScenarios.includes(scenario)) continue;
    const item = integrationWorkItem(integration, items.length);
    items.push(item);
    records.push({ path: workLayout.item(item.id), id: item.id, revision: 1, body: item });
  }
  return records;
}

/**
 * Which work item each obligation and requirement revision is bound to: a
 * registered agreement binds its own, and a revision records its bindings
 * itself.
 */
export function bindingsOf(log: RunLog): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const event of log.events) {
    if (event.type === 'contract-registered') {
      if (event.data.obligation !== null && event.data.providerWorkItem !== null) {
        bindings.set(bindingKey(event.data.obligation, event.data.revision), event.data.providerWorkItem);
      }
      const consumer = workItemOfIteration(event.data.iteration);
      if (consumer !== null) {
        for (const requirement of event.data.requirements) bindings.set(bindingKey(requirement, event.data.revision), consumer);
      }
      continue;
    }
    if (event.type !== 'evidence-reopened') continue;
    for (const binding of event.data.bindings) bindings.set(bindingKey(binding.subject.id, binding.subject.revision), binding.workItem);
  }
  return bindings;
}

/** The requirement revisions a `requirement-verified` has closed. */
export function verifiedRequirements(log: RunLog): Set<string> {
  return new Set(log.all('requirement-verified').map(event => verificationKey(event.data.requirement, event.data.revision)));
}

/** The requirements one work item owes that no `requirement-verified` has closed, by the scheduling binding. */
export function openRequirementsOf(log: RunLog, records: ReturnType<typeof committedRecords>, workItem: string): ConsumerRequirement[] {
  return openRequirements(records.requirements, verifiedRequirements(log), workItem, bindingsOf(log));
}

/** The obligation one provider work item currently owes: the latest revision of its own obligation bound to it. */
export function obligationOwedBy(log: RunLog, item: WorkItem, records: ReturnType<typeof committedRecords>): ProviderObligation | null {
  if (!('obligation' in item.origin)) return null;
  const obligation = records.obligations.get(item.origin.obligation.id);
  if (obligation === undefined) return null;
  const bound = bindingsOf(log).get(bindingKey(obligation.id, obligation.revision)) ?? null;
  if (bound !== null) return bound === item.id ? obligation : null;
  return item.origin.obligation.revision === obligation.revision ? obligation : null;
}

/** The unresolved capability work that blocks a work item's completion in the capability workflow. */
export function capabilityBlockersOf(log: RunLog, workItem: string): string[] {
  const accepted = new Set(log.all('iteration-closed').filter(event => event.data.outcome === 'accepted').map(event => event.data.iteration));
  return capabilityCompletionBlockers(replayCapabilityState(log.events), workItem, accepted);
}

/**
 * Why a work item's completion request is refused now, or nothing: in the
 * contract workflow, an open requirement and an owed obligation not yet
 * conformed; in the capability workflow, its unresolved capability work.
 */
export function completionBlockers(log: RunLog, item: WorkItem, capabilityWorkflow: boolean): {
  readonly blocked: string[];
  readonly open: ConsumerRequirement[];
  readonly owed: ProviderObligation | null;
} {
  const records = committedRecords(log.ledger.replay());
  const open = openRequirementsOf(log, records, item.id);
  const conformed = new Set(log.all('provider-conformed').map(event => conformanceKey(event.data.obligation, event.data.revision)));
  const owing = obligationOwedBy(log, item, records);
  const owed = owing !== null && !conformed.has(conformanceKey(owing.id, owing.revision)) ? owing : null;
  const capability = capabilityWorkflow ? capabilityBlockersOf(log, item.id) : [];
  const blocked = [
    ...(capabilityWorkflow ? [] : open).map(requirement => {
      const obligation = records.obligations.get(requirement.obligation);
      return `${requirement.id} is open: ${obligation?.capability ?? requirement.forCapability} is still held by the fake at ${requirement.evidence.fakeInjections.join(', ')}`;
    }),
    ...(capabilityWorkflow || owed === null ? [] : [`${owed.id} is owed: the agreed conformance suite has not passed against the real provider yet`]),
    ...capability,
  ];
  return { blocked, open: capabilityWorkflow ? [] : open, owed: capabilityWorkflow ? null : owed };
}

/** The reconciliation an assignment of this work item corrects, while none has resolved it. */
export function pendingCorrection(log: RunLog, workItem: string): string | undefined {
  const assessed = log.all('reconciliation-assessed').filter(event => event.data.workItem === workItem).at(-1);
  if (assessed === undefined || assessed.data.next !== 'correct') return undefined;
  const resolved = log.all('iteration-assigned').some(event => event.data.corrects === assessed.data.reconciliation) ||
    log.all('capability-assigned').some(event => event.data.corrects === assessed.data.reconciliation);
  return resolved ? undefined : assessed.data.reconciliation;
}

/** The count of iterations this work item has been assigned, contract sub-sessions included. */
export function assignedCount(log: RunLog, workItem: string): number {
  return log.all('iteration-assigned').filter(event => event.data.workItem === workItem).length
    + log.all('contract-requested').filter(event => event.data.workItem === workItem).length;
}

async function readIfExists(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
