import type { CapabilityProgress } from '../interfaces/protocol/runs.js';
import type { WorkItem } from '../work/records.js';
import type { RunView } from './inputs.js';
import { entryScenarioCounts } from './scenarios.js';
import { capabilityOfItem } from './work.js';

/*
 * What the run has done about each capability: todo, working on or
 * completed, each with its reason and its evidence. It is derived and never
 * recorded, and it needs no call to any architect.
 *
 * - `completed` needs current verification evidence: every work item of the
 *   capability closed by a passing work-item gate, and every requirement it
 *   consumes verified at its current contract revision. A reused capability
 *   is completed when a consumer that uses it has passed its own gate. A
 *   fake-backed pass is still `working`.
 * - A provider wait stays `working`, with what it waits for.
 * - `evidence-reopened` returns a completed capability to `working`: its
 *   follow-up work item is open, and the earlier completion stays history.
 * - A superseded hypothesis leaves the list without becoming `completed`;
 *   a live one is listed as tentative, a forecast and never a commitment.
 * - An entry also counts its acceptance scenarios, implemented of all it
 *   has; the count is beside its state and does not decide it.
 */

interface Standing {
  readonly started: ReadonlySet<string>;
  readonly completed: ReadonlyMap<string, string>;
  readonly yielded: ReadonlyMap<string, readonly string[]>;
  readonly resumed: ReadonlySet<string>;
  /** Verified requirement revisions, `rq-001@2`, with the gate that verified each. */
  readonly verified: ReadonlyMap<string, string>;
  /** Provider conformance, `ob-ct-001@2`, with its gate. */
  readonly conformed: ReadonlyMap<string, string>;
  /** Each follow-up work item and the reopening that created it. */
  readonly reopened: ReadonlyMap<string, { readonly follows: string; readonly cause: string; readonly contract: string; readonly revision: number }>;
}

function standingOf(view: RunView): Standing {
  const started = new Set<string>();
  const completed = new Map<string, string>();
  const yielded = new Map<string, readonly string[]>();
  const resumed = new Set<string>();
  const verified = new Map<string, string>();
  const conformed = new Map<string, string>();
  const reopened = new Map<string, { follows: string; cause: string; contract: string; revision: number }>();
  for (const event of view.events) {
    switch (event.type) {
      case 'work-item-started': started.add(event.data.workItem); break;
      case 'work-item-completed': completed.set(event.data.workItem, event.data.gate); break;
      case 'work-item-yielded': yielded.set(event.data.workItem, event.data.requirements); resumed.delete(event.data.workItem); break;
      case 'work-item-resumed': resumed.add(event.data.workItem); break;
      case 'requirement-verified': verified.set(`${event.data.requirement}@${event.data.revision}`, event.data.gate); break;
      case 'provider-conformed': conformed.set(`${event.data.obligation}@${event.data.revision}`, event.data.gate); break;
      case 'evidence-reopened':
        for (const followUp of event.data.followUps) {
          reopened.set(followUp.workItem, { follows: followUp.follows, cause: event.data.cause, contract: event.data.contract, revision: event.data.revision });
        }
        break;
      default: break;
    }
  }
  return { started, completed, yielded, resumed, verified, conformed, reopened };
}

/** The capabilities the run knows: registered first, in committed order, then those forecast only. */
export function capabilityProgressOf(view: RunView): CapabilityProgress[] {
  const standing = standingOf(view);
  const scenarioCounts = entryScenarioCounts(view);
  const itemsOf = new Map<string, WorkItem[]>();
  for (const item of view.records.workItems) {
    const capability = capabilityOfItem(view, item);
    if (capability === null) continue;
    itemsOf.set(capability, [...(itemsOf.get(capability) ?? []), item]);
  }

  // Confirmed links: a requirement's consumer capability depends on the
  // capability of the obligation it attaches to, and a registry entry names
  // the capabilities that consume it.
  const confirmed = new Map<string, Set<string>>();
  const link = (consumer: string, dependency: string) => {
    if (consumer === dependency) return;
    confirmed.set(consumer, (confirmed.get(consumer) ?? new Set()).add(dependency));
  };
  for (const requirement of view.records.requirements.values()) {
    const dependency = view.records.obligations.get(requirement.obligation)?.capability;
    if (dependency !== undefined) link(requirement.forCapability, dependency);
  }
  for (const entry of view.records.registry) {
    for (const consumer of entry.consumers) link(consumer.capability, entry.capability);
  }

  const live = view.records.hypotheses.filter(hypothesis => hypothesis.standing !== 'superseded');
  const tentativeLinks = (capability: string): string[] =>
    [...new Set(live.filter(hypothesis => hypothesis.capability === capability).flatMap(hypothesis => hypothesis.dependsOn))];

  const dependsOnOf = (capability: string) => {
    const links = confirmed.get(capability) ?? new Set<string>();
    return [
      ...[...links].map(dependency => ({ capability: dependency, tentative: false })),
      ...tentativeLinks(capability).filter(dependency => !links.has(dependency)).map(dependency => ({ capability: dependency, tentative: true })),
    ];
  };

  const progress: CapabilityProgress[] = [];
  const registered = new Set<string>();
  for (const entry of view.records.registry) {
    registered.add(entry.capability);
    const items = itemsOf.get(entry.capability) ?? [];
    const judged = items.length === 0 ? reuseState(view, standing, entry.capability) : workState(view, standing, entry.capability, items);
    progress.push({
      capability: entry.capability,
      owner: entry.owner,
      entry: entry.origin === 'entry',
      tentative: false,
      state: judged.state,
      reason: judged.reason,
      dependsOn: dependsOnOf(entry.capability),
      workItems: items.map(item => item.id),
      evidence: judged.evidence,
      scenarios: entry.origin === 'entry' ? { ...(scenarioCounts.get(entry.capability) ?? { implemented: 0, total: 0 }) } : null,
    });
  }

  const forecast = new Set<string>();
  for (const hypothesis of live) {
    if (registered.has(hypothesis.capability) || forecast.has(hypothesis.capability)) continue;
    forecast.add(hypothesis.capability);
    progress.push({
      capability: hypothesis.capability,
      owner: hypothesis.suggestedOwner,
      entry: false,
      tentative: true,
      state: 'todo',
      reason: `Forecast by hypothesis ${hypothesis.id} at revision ${hypothesis.revision} (${hypothesis.standing}); no work derives from a hypothesis`,
      dependsOn: tentativeLinks(hypothesis.capability).map(dependency => ({ capability: dependency, tentative: true })),
      workItems: [],
      evidence: [],
      scenarios: null,
    });
  }
  return progress;
}

interface Judged {
  readonly state: CapabilityProgress['state'];
  readonly reason: string;
  readonly evidence: string[];
}

/** A capability with work items of its own. */
function workState(view: RunView, standing: Standing, capability: string, items: readonly WorkItem[]): Judged {
  const gates = items.map(item => standing.completed.get(item.id)).filter((gate): gate is string => gate !== undefined);
  const open = items.filter(item => !standing.completed.has(item.id));
  const requirements = [...view.records.requirements.values()].filter(requirement => requirement.forCapability === capability);
  const unverified = requirements.filter(requirement => !standing.verified.has(`${requirement.id}@${requirement.revision}`));
  const verificationGates = requirements
    .map(requirement => standing.verified.get(`${requirement.id}@${requirement.revision}`))
    .filter((gate): gate is string => gate !== undefined);
  const conformance = items.flatMap(item => ('obligation' in item.origin ? [item.origin.obligation.id] : []))
    .map(obligation => {
      const current = view.records.obligations.get(obligation);
      return current === undefined ? undefined : standing.conformed.get(`${obligation}@${current.revision}`);
    })
    .filter((gate): gate is string => gate !== undefined);
  const evidence = [...new Set([...gates, ...conformance, ...verificationGates])];

  if (open.length === 0 && unverified.length === 0) {
    const last = items.at(-1)!;
    return {
      state: 'completed',
      reason: `${last.id} passed its work-item gate ${standing.completed.get(last.id)!}${verificationGates.length === 0 ? '' : `; ${requirements.map(requirement => requirement.id).join(', ')} verified at the current contract revision`}`,
      evidence,
    };
  }

  const reopenedItem = open.find(item => standing.reopened.has(item.id));
  if (reopenedItem !== undefined) {
    const reopening = standing.reopened.get(reopenedItem.id)!;
    return {
      state: 'working',
      reason: `Evidence reopened by ${reopening.cause} of ${reopening.contract} at revision ${reopening.revision}; follow-up ${reopenedItem.id} of completed ${reopening.follows} is open`,
      evidence,
    };
  }

  for (const item of open) {
    const waiting = standing.yielded.get(item.id);
    if (waiting === undefined) continue;
    const obligations = [...new Set(waiting.map(id => view.records.requirements.get(id)?.obligation).filter((id): id is string => id !== undefined))];
    if (!standing.resumed.has(item.id)) {
      return { state: 'working', reason: `Waiting for provider ${obligations.join(', ') || 'work'} (${waiting.join(', ')})`, evidence };
    }
    return { state: 'working', reason: `The provider conformed; ${item.id} is verifying ${waiting.join(', ')} against it`, evidence };
  }

  if (open.length === 0) {
    // Every work item passed, and a requirement it consumes is not verified
    // at its current revision: a fake-backed pass is not completion.
    return { state: 'working', reason: `Not verified against the real provider: ${unverified.map(requirement => `${requirement.id} at revision ${requirement.revision}`).join(', ')}`, evidence };
  }

  const started = open.filter(item => standing.started.has(item.id));
  if (started.length > 0) {
    const current = [...view.records.assignments.values()].filter(assignment => assignment.workItem === started[0]!.id && !view.records.results.has(assignment.id)).at(-1);
    return { state: 'working', reason: `${started[0]!.id} is under way${current === undefined ? '' : `, iteration ${current.id}`}`, evidence };
  }
  return { state: 'todo', reason: `${open.map(item => item.id).join(', ')} not started`, evidence };
}

/**
 * A capability with no work item of its own: one a decision reuses, or one
 * satisfied outside the project. It is completed when a consumer that uses
 * it has passed its own gate, which is the verification of that reuse.
 */
function reuseState(view: RunView, standing: Standing, capability: string): Judged {
  const consumers = new Set<string>();
  for (const entry of view.records.registry) {
    if (entry.capability !== capability) continue;
    for (const consumer of entry.consumers) consumers.add(consumer.workItem);
  }
  for (const requirement of view.records.requirements.values()) {
    if (view.records.obligations.get(requirement.obligation)?.capability === capability) consumers.add(requirement.workItem);
  }
  const decision = [...view.records.decisions.values()].filter(candidate => candidate.capability === capability).at(-1);
  const how = decision === undefined ? 'no work item of its own' : `${decision.outcome} by ${decision.id}`;
  const verified = [...consumers].filter(item => standing.completed.has(item));
  if (verified.length > 0) {
    return {
      state: 'completed',
      reason: `Verified reuse (${how}): consumer ${verified.join(', ')} passed its gate`,
      evidence: verified.map(item => standing.completed.get(item)!),
    };
  }
  const working = [...consumers].filter(item => standing.started.has(item));
  if (working.length > 0) {
    return { state: 'working', reason: `Reused (${how}); verified when consumer ${working.join(', ')} passes its gate`, evidence: [] };
  }
  return { state: 'todo', reason: `No work started (${how})`, evidence: [] };
}
