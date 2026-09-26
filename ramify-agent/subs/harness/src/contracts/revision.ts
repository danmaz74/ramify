import type { RecordRef } from '../run/records.js';
import type { RecordRef as CommitRecord } from '../jobs/commit.js';
import { refOf } from '../work/committed.js';
import { iterationLayout, iterationResultSchema, type IterationAssignment, type IterationResult } from '../work/iterations.js';
import { workItemId, workItemSchema, workLayout, type WorkItem, type WorkItemId } from '../work/records.js';
import { bindingKey } from './schedule.js';
import type { ConsumerRequirement, ProviderObligation } from './records.js';

/*
 * What a contract revision reschedules.
 *
 * Registering a revision does not reset the work that stands. Each new
 * obligation and requirement revision is bound to the work item responsible
 * for it: the item that has not finished is reused and receives the current
 * evidence at its next coordination point, and the item that had completed
 * stays completed and gets a follow-up that `follows` it.
 *
 * Nothing here decides anything: every binding follows from what the log
 * already holds, so a replay derives the same bindings, the same follow-up
 * identifiers and no duplicate.
 */

/** One scheduling binding: a subject revision, and the work item responsible for it. */
export interface SchedulingBinding {
  readonly subject: RecordRef;
  readonly workItem: WorkItemId;
}

/** What one reopening is derived from. */
export interface ReopenRequest {
  /** The obligation at its new revision, or null for an access-only agreement. */
  readonly obligation: ProviderObligation | null;
  /** Every attached requirement at its new revision, in committed order. */
  readonly requirements: readonly ConsumerRequirement[];
  /** The work item whose iteration established the revision; follow-ups are started for it. */
  readonly requestedBy: WorkItemId;
  /**
   * The work item bound to each subject before this transaction, keyed by
   * the subject's identifier alone: a subject has one responsible item at a
   * time, whatever revision it was bound at.
   */
  readonly previous: ReadonlyMap<string, WorkItemId>;
  readonly completed: ReadonlySet<WorkItemId>;
  /** Every work item committed so far, by identifier. */
  readonly items: ReadonlyMap<WorkItemId, WorkItem>;
  /** The count of committed work items; a follow-up takes the next identifier. */
  readonly workItemCount: number;
  /**
   * Assignments with no committed result, other than the one that
   * established this revision. Each of a reused item's closes as
   * `superseded`: no old assignment is accepted for the new revision.
   */
  readonly unfinishedAssignments: readonly IterationAssignment[];
}

/** Everything one reopening schedules, and the records its event commits. */
export interface Reopening {
  readonly bindings: readonly SchedulingBinding[];
  readonly followUps: readonly WorkItem[];
  readonly superseded: readonly IterationResult[];
  readonly records: readonly CommitRecord[];
}

/**
 * The bindings, follow-up work items and superseded results of one contract
 * revision. Provider work is bound first, so a provider follow-up is
 * committed before the consumer follow-ups that wait for it.
 */
export function reopenEvidence(request: ReopenRequest): Reopening {
  const bindings: SchedulingBinding[] = [];
  const followUps: WorkItem[] = [];
  const records: CommitRecord[] = [];
  const reused = new Set<WorkItemId>();
  let created = 0;

  const bind = (
    subject: RecordRef,
    origin: WorkItem['origin'],
    module: string,
    goal: string,
  ): void => {
    const prior = request.previous.get(subject.id);
    const priorItem = prior === undefined ? undefined : request.items.get(prior);
    if (priorItem !== undefined && !request.completed.has(priorItem.id)) {
      // The item has not finished. It keeps its identity and receives the
      // current evidence at its next coordination point.
      reused.add(priorItem.id);
      bindings.push({ subject, workItem: priorItem.id });
      return;
    }
    created += 1;
    const item = workItemSchema.parse({
      schema: 'ramify-agent.work-item/1',
      id: workItemId(request.workItemCount + created),
      module,
      origin,
      ...(priorItem === undefined ? {} : { follows: priorItem.id }),
      goal,
      // The follow-up carries the prior item's elements, so the work it
      // continues is stated where the plan states it.
      requirementRefs: priorItem === undefined ? [] : priorItem.requirementRefs,
      acceptanceRefs: priorItem === undefined ? [] : priorItem.acceptanceRefs,
      contextRefs: priorItem === undefined ? [] : priorItem.contextRefs,
      startedFor: request.requestedBy,
    } satisfies WorkItem);
    followUps.push(item);
    records.push({ path: workLayout.item(item.id), id: item.id, revision: 1, body: item });
    bindings.push({ subject, workItem: item.id });
  };

  if (request.obligation !== null) {
    const obligation = request.obligation;
    bind(
      refOf(obligation.id, obligation.revision, obligation),
      { obligation: refOf(obligation.id, obligation.revision, obligation) },
      obligation.provider,
      `Satisfy ${obligation.id} at revision ${obligation.revision}: the agreed conformance suite passes against the real provider.`,
    );
  }

  for (const requirement of request.requirements) {
    bind(
      refOf(requirement.id, requirement.revision, requirement),
      { verification: refOf(requirement.id, requirement.revision, requirement) },
      requirement.consumer,
      `Verify ${requirement.id} at revision ${requirement.revision}: the revised provider replaces the fake and the behavior this module states still holds.`,
    );
  }

  // An assignment of a reused item that never closed is bound to the
  // previous revision and cannot be accepted for this one. It closes here,
  // after the writer has settled.
  const superseded: IterationResult[] = [];
  for (const assignment of request.unfinishedAssignments) {
    if (!reused.has(assignment.workItem)) continue;
    const result = iterationResultSchema.parse({
      schema: 'ramify-agent.iteration-result/1',
      iteration: assignment.id,
      outcome: 'superseded',
      invocations: [],
      gate: null,
      commit: null,
      findings: [`The agreement it was assigned under was revised; ${assignment.id} carries references the run no longer schedules.`],
      changedAssumptions: [],
      artifacts: [],
    } satisfies IterationResult);
    superseded.push(result);
    records.push({
      path: iterationLayout.result(assignment.workItem, numberOf(assignment.id)),
      id: assignment.id,
      revision: 1,
      body: result,
    });
  }

  return { bindings, followUps, superseded, records };
}

/** The bindings a reopening records, as the scheduler keys them. */
export function bindingsOf(bindings: readonly SchedulingBinding[]): Map<string, WorkItemId> {
  return new Map(bindings.map(binding => [bindingKey(binding.subject.id, binding.subject.revision), binding.workItem]));
}

/** The iteration number of `wi-001.i02`, which its result file is written at. */
function numberOf(iteration: string): number {
  const tail = iteration.split('.i').at(-1);
  const parsed = Number(tail);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`"${iteration}" names no iteration number`);
  return parsed;
}
