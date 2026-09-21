import type { RecordRef } from '../run/records.js';
import type { Hypothesis } from '../analysis/records.js';
import type { WorkItem } from './records.js';

/*
 * The work-item frontier: which work items a run has, in what order it takes
 * them, and which hypothesis revisions each one receives when it starts.
 *
 * Delivery happens at a coordination point and never rewrites an active
 * assignment. A hypothesis reaches a work item because it involves that
 * module or anticipates it as a consumer, not only because it suggests it as
 * the owner: a module that will consume the forecast behavior needs the
 * forecast as much as the one that might own it.
 */

/** The capability a work item exists for, where its origin names one. */
export function capabilityOf(item: WorkItem): string | null {
  return 'entry' in item.origin ? item.origin.entry : null;
}

/**
 * The hypotheses one work item receives, at the revisions the run has
 * committed. A superseded one is delivered too, with its standing: an
 * architect that was told to expect a capability elsewhere is told when that
 * forecast is withdrawn, rather than seeing it disappear. It still forecasts
 * nothing and still never becomes work.
 */
export function hypothesesFor(item: WorkItem, hypotheses: readonly Hypothesis[]): Hypothesis[] {
  const capability = capabilityOf(item);
  return hypotheses.filter(hypothesis => {
    if (hypothesis.suggestedOwner === item.module) return true;
    if (hypothesis.involvedModules.includes(item.module)) return true;
    if (hypothesis.anticipatedConsumers.includes(item.module)) return true;
    return capability !== null && hypothesis.anticipatedConsumers.includes(capability);
  });
}

/** The reference of one hypothesis revision, as a delivery and an outline record it. */
export function hypothesisRef(hypothesis: Hypothesis, hash: string): RecordRef {
  return { id: hypothesis.id, revision: hypothesis.revision, hash };
}

/**
 * The order a run takes its work items in: the order they were committed.
 * A yielded item's provider is started before it resumes, which is the
 * depth-first stack `startedFor` records; with no delegation yet, the
 * committed order is that order.
 */
export function frontierOrder(items: readonly WorkItem[]): WorkItem[] {
  return [...items];
}
