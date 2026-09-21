import type { RecordRef as CommitRecord } from '../jobs/commit.js';
import { entryAssignmentsSchema, type EntryAssignments, type RunRecord } from '../run/records.js';
import { runLayout } from '../run/records.js';
import { workItemId, workItemSchema, workLayout, type WorkItem } from '../work/records.js';
import { analysisLayout, hypothesisSchema, registryEntrySchema, type Hypothesis, type RegistryEntry } from './records.js';
import type { InitialAnalysisSubmission } from './submission.js';

/*
 * What one accepted initial analysis commits, in the single
 * `analysis-accepted` transition: the entry assignments, every hypothesis at
 * revision 1, one registry entry per entry capability and one work item per
 * entry capability.
 *
 * One work item per entry capability, always. Two related capabilities in one
 * module get two work items; there is no grouping field and no judgment.
 *
 * A hypothesis creates nothing. It is committed beside the rest and no work
 * item, registry entry or completion requirement is derived from one.
 */

export interface AcceptedAnalysis {
  readonly entries: EntryAssignments;
  readonly hypotheses: readonly Hypothesis[];
  readonly registry: readonly RegistryEntry[];
  readonly workItems: readonly WorkItem[];
  /** Every record body the transition carries, with where each is materialized. */
  readonly records: readonly CommitRecord[];
}

/**
 * Derives every record of the phase from one validated submission. It is a
 * pure function of the submission, the run's view identity and the
 * invocation that produced it, so a repeat after a crash derives the same
 * records with the same IDs.
 */
export function acceptAnalysis(
  submission: InitialAnalysisSubmission,
  context: { readonly invocation: string; readonly view: RunRecord['manifest']['architectView'] },
): AcceptedAnalysis {
  const entries = entryAssignmentsSchema.parse({
    schema: 'ramify-agent.entry-assignments/1',
    view: context.view,
    entries: submission.entries,
  } satisfies EntryAssignments);

  const hypotheses = submission.hypotheses.map(hypothesis => hypothesisSchema.parse({
    schema: 'ramify-agent.hypothesis/1',
    revision: 1,
    standing: 'tentative',
    ...hypothesis,
    cause: { initial: context.invocation },
  } satisfies Hypothesis));

  const registry = submission.entries.map(entry => registryEntrySchema.parse({
    schema: 'ramify-agent.capability/1',
    capability: entry.capability,
    revision: 1,
    behavior: entry.description,
    owner: entry.owner,
    ...(entry.proposed === undefined ? {} : { proposed: entry.proposed }),
    origin: 'entry',
    decision: null,
    consumers: [],
  } satisfies RegistryEntry));

  const workItems = submission.entries.map((entry, index) => workItemSchema.parse({
    schema: 'ramify-agent.work-item/1',
    id: workItemId(index + 1),
    module: entry.owner,
    origin: { entry: entry.capability },
    goal: entry.description,
    requirementRefs: entry.requirementRefs,
    acceptanceRefs: entry.acceptanceRefs,
    startedFor: null,
  } satisfies WorkItem));

  const records: CommitRecord[] = [
    { path: runLayout.entries, id: 'entries', revision: 1, body: entries },
    ...hypotheses.map(hypothesis => ({
      path: analysisLayout.hypothesis(hypothesis.id, 1), id: hypothesis.id, revision: 1, body: hypothesis,
    })),
    ...registry.map(entry => ({
      path: analysisLayout.registry(entry.capability, 1), id: entry.capability, revision: 1, body: entry,
    })),
    ...workItems.map(item => ({ path: workLayout.item(item.id), id: item.id, revision: 1, body: item })),
  ];

  return { entries, hypotheses, registry, workItems, records };
}
