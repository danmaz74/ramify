import type { WorkItem, WorkItemId } from '../work/records.js';
import type { ConsumerRequirement, ObligationId, RequirementId } from './records.js';

/*
 * Depth-first scheduling of work items across a delegation.
 *
 * Work starts at the consumer. When it has done what it can against the
 * fake, it yields at an iteration boundary, naming the requirements it waits
 * for. The harness then runs the provider work items of those requirements
 * before the next independent entry work item, and each provider repeats the
 * same for what it lacks in turn.
 *
 * A consumer resumes when every provider it waits for has conformed at the
 * current contract revision. It does not wait for its own verification: the
 * requirement stays open until the verification iteration replaces the fake
 * and passes, and waiting for that here would deadlock.
 */

/** What the scheduler reads. Every part of it is a projection over committed records. */
export interface ScheduleState {
  /** Every work item, in the order it was committed. */
  readonly items: readonly WorkItem[];
  readonly completed: ReadonlySet<WorkItemId>;
  /** Items that yielded and have not resumed since, with the requirements each waits for. */
  readonly yielded: ReadonlyMap<WorkItemId, readonly RequirementId[]>;
  /** Every requirement at its highest committed revision. */
  readonly requirements: ReadonlyMap<RequirementId, ConsumerRequirement>;
  /** `ob-ct-001@1` for every obligation revision a provider has conformed at. */
  readonly conformed: ReadonlySet<string>;
  /**
   * The work item responsible for each subject revision, keyed `rq-001@2`
   * and `ob-ct-001@2`. A revision may bind a subject to a work item that
   * already exists, so the binding and not the record's own field is what
   * says whose work it is.
   */
  readonly bindings: ReadonlyMap<string, WorkItemId>;
  /**
   * Consumers a provider's `revision-needed` is waiting for an answer from.
   * Such an item answers before anything else, even while it is yielded:
   * what blocks the run is the agreement, not the work.
   */
  readonly reopened: ReadonlySet<WorkItemId>;
}

/** The obligation revision one conformance is keyed by. */
export const conformanceKey = (obligation: ObligationId, revision: number): string => `${obligation}@${revision}`;

/** The subject revision one scheduling binding is keyed by. */
export const bindingKey = (subject: string, revision: number): string => `${subject}@${revision}`;

/** What the run does next: one work item, and the requirements a resumption releases. */
export interface NextWork {
  readonly item: WorkItem;
  /** Non-null when this item is resuming: the requirements whose providers have conformed. */
  readonly resumes: readonly RequirementId[] | null;
}

/**
 * The next work item to take, or null when none is runnable. A yielded item
 * whose providers have all conformed comes before any independent entry
 * work item; otherwise the deepest open item runs, which is the depth-first
 * stack `startedFor` records.
 */
export function nextWorkItem(state: ScheduleState): NextWork | null {
  // A consumer that has been told its provider cannot conform answers
  // before anything else. It is not resuming: no provider has conformed,
  // and what it answers is the agreement.
  for (const item of state.items) {
    if (state.completed.has(item.id)) continue;
    if (!state.reopened.has(item.id)) continue;
    return { item, resumes: null };
  }

  for (const item of state.items) {
    if (state.completed.has(item.id)) continue;
    const waiting = state.yielded.get(item.id);
    if (waiting === undefined) continue;
    if (!conformedFor(state, waiting)) continue;
    return { item, resumes: waiting };
  }

  const depths = depthOf(state.items);
  const open = state.items
    .map((item, index) => ({ item, index }))
    .filter(entry => !state.completed.has(entry.item.id)
      && !state.yielded.has(entry.item.id)
      && !awaitingProvider(state, entry.item));
  if (open.length === 0) return null;

  open.sort((left, right) => (depths.get(right.item.id)! - depths.get(left.item.id)!) || (left.index - right.index));
  return { item: open[0]!.item, resumes: null };
}

/**
 * Whether a verification work item is waiting for the provider of the
 * requirement it exists for. Provider work precedes consumer verification,
 * including when every item of the previous revision had completed.
 */
function awaitingProvider(state: ScheduleState, item: WorkItem): boolean {
  if (!('verification' in item.origin)) return false;
  const requirement = state.requirements.get(item.origin.verification.id);
  if (requirement === undefined) return false;
  return !state.conformed.has(conformanceKey(requirement.obligation, requirement.contractRevision));
}

/** Whether every requirement waited for has a provider that conformed at its contract revision. */
export function conformedFor(state: ScheduleState, waiting: readonly RequirementId[]): boolean {
  return waiting.every(id => {
    const requirement = state.requirements.get(id);
    if (requirement === undefined) return false;
    return state.conformed.has(conformanceKey(requirement.obligation, requirement.contractRevision));
  });
}

/** How deep each item sits on the delegation stack: an entry item is 0. */
export function depthOf(items: readonly WorkItem[]): Map<WorkItemId, number> {
  const byId = new Map(items.map(item => [item.id, item]));
  const depths = new Map<WorkItemId, number>();
  const measure = (item: WorkItem, seen: ReadonlySet<WorkItemId>): number => {
    const known = depths.get(item.id);
    if (known !== undefined) return known;
    const parent = item.startedFor === null ? undefined : byId.get(item.startedFor);
    const depth = parent === undefined || seen.has(parent.id) ? 0 : measure(parent, new Set([...seen, item.id])) + 1;
    depths.set(item.id, depth);
    return depth;
  };
  for (const item of items) measure(item, new Set([item.id]));
  return depths;
}

/**
 * The requirements one work item owes that no `requirement-verified` has
 * closed. The binding decides whose they are: a revision may bind a
 * requirement to a follow-up item, while the record's own `workItem` keeps
 * naming the original consumer item. Where nothing bound it, the record's
 * own field stands.
 */
export function openRequirements(
  requirements: ReadonlyMap<RequirementId, ConsumerRequirement>,
  verified: ReadonlySet<string>,
  workItem: WorkItemId,
  bindings: ReadonlyMap<string, WorkItemId> = new Map(),
): ConsumerRequirement[] {
  return [...requirements.values()].filter(requirement => {
    const bound = bindings.get(bindingKey(requirement.id, requirement.revision)) ?? requirement.workItem;
    return bound === workItem && !verified.has(verificationKey(requirement.id, requirement.revision));
  });
}

/** The requirement revision one verification is keyed by. */
export const verificationKey = (requirement: RequirementId, revision: number): string => `${requirement}@${revision}`;

/**
 * The provider work item bound to one obligation revision, or undefined
 * where none exists yet. The recorded binding answers first; a registration
 * that recorded none is read from the items' own origins.
 */
export function providerItemOf(
  items: readonly WorkItem[],
  obligation: ObligationId,
  revision: number,
  bindings: ReadonlyMap<string, WorkItemId> = new Map(),
): WorkItem | undefined {
  const bound = bindings.get(bindingKey(obligation, revision));
  if (bound !== undefined) return items.find(item => item.id === bound);
  return items.find(item => 'obligation' in item.origin
    && item.origin.obligation.id === obligation
    && item.origin.obligation.revision === revision);
}
