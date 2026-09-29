import type {
  ExecutionCapabilityDetail, ExecutionLink, ExecutionNode, ExecutionScenarioDetail, ExecutionSourceRef,
  ExecutionScenarioResult, ExecutionMapPage,
} from '../interfaces/protocol/execution-map.js';
import { gateCheckpointSchema } from '../interfaces/protocol/runs.js';
import type { ScenarioRecord } from '../../subs/scenarios/src/records.js';
import type { GateAttempt } from '../checks/records.js';
import { capabilityProgressOf } from './progress.js';
import { gatesByScenario, scenariosOf } from './scenarios.js';
import { runSessionViews } from './sessions.js';
import { allWorkItemsOf, capabilityOfItem } from './work.js';
import type { RunView } from './inputs.js';
import type { ModuleTree } from '../interfaces/protocol/evidence.js';
import { capturedLinesOf, executionModuleMapOf } from './execution-modules.js';

/** The complete, unpaged census. HTTP pagination is added in iteration 5. */
export interface ExecutionCoreIndex {
  readonly runVersion: number;
  readonly nodes: readonly ExecutionNode[];
  readonly links: readonly ExecutionLink[];
  readonly gaps: readonly string[];
  readonly current: ExecutionMapPage['current'];
}

/** The complete census enriched from the current tree and retained writer snapshots. */
export async function executionMapOf(view: RunView, tree: ModuleTree): Promise<ExecutionCoreIndex & { moduleMap: ExecutionMapPage['moduleMap'] }> {
  const core = executionCoreOf(view);
  const captured = await capturedLinesOf(view);
  return { ...core, moduleMap: executionModuleMapOf(view, tree, core.nodes, captured) };
}

const key = (kind: ExecutionNode['kind'], id: string): string => `${kind}:${id}`;
const count = (total: number) => ({ state: 'complete' as const, known: total, total });
/** A role or checkpoint token in title case; a capability keeps its id as its label. */
const label = (name: string) => name.replace(/(^|[-\s])\S/g, part => part.toUpperCase()).replaceAll('-', ' ');

/** First commit establishes placement in the run; the latest revision supplies displayed data. */
function recordSource(view: RunView, schema: string, id: string, kind: ExecutionSourceRef['kind'], latest = false): ExecutionSourceRef | null {
  const lines = latest ? [...view.entries].reverse() : view.entries;
  for (const line of lines) {
    const records = latest ? [...line.transaction.records].reverse() : line.transaction.records;
    for (const record of records) {
      const body = record.body as { schema?: string; id?: string; capability?: string; workItem?: string };
      if (body.schema === schema && (body.id ?? body.capability ?? body.workItem) === id) {
        return { kind, id, sequence: line.sequence, revision: record.revision > 0 ? record.revision : null };
      }
    }
  }
  return null;
}

function eventSource(view: RunView, sequence: number): ExecutionSourceRef {
  return { kind: 'run-event', id: `event-${sequence}`, sequence, revision: null };
}

function sourceOf(view: RunView, schema: string, id: string, kind: ExecutionSourceRef['kind']): ExecutionSourceRef {
  const source = recordSource(view, schema, id, kind);
  if (source === null) throw new Error(`Committed ${schema} ${id} has no source line`);
  return source;
}

function scenarioSources(view: RunView): Map<string, ExecutionSourceRef> {
  const sources = new Map<string, ExecutionSourceRef>();
  for (const line of view.entries) for (const record of line.transaction.records) {
    const body = record.body as { schema?: string; id?: string };
    if (body.schema === 'ramify-agent.scenario/1' && body.id !== undefined && !sources.has(body.id)) {
      sources.set(body.id, { kind: 'tracked-scenario', id: body.id, sequence: line.sequence, revision: null });
    }
  }
  return sources;
}

function scenarioResults(view: RunView): Map<string, ExecutionScenarioResult> {
  const latest = new Map<string, ExecutionScenarioResult>();
  // Gate attempts retain their first-commit order even if the body is later revised.
  for (const { body: gate } of view.gates.values()) for (const command of gate.commands) {
    if (command.kind !== 'scenarios' || command.scenarios === undefined || command.scenarios.dryRun) continue;
    for (const result of command.scenarios.scenarios) latest.set(result.id, result.status);
  }
  return latest;
}

function auditOf(view: RunView, gate: GateAttempt) {
  if (gate.checkpoint === 'readiness') return 'not-applicable' as const;
  const outcome = view.gateAuditOutcomes.get(gate.id)?.body;
  if (outcome !== undefined && outcome.audited === gate.audited && gate.evidence !== null) {
    return outcome.overall === 'pass' ? 'passed' as const : 'failed' as const;
  }
  // Evidence refs certify publication, not the report's overall outcome.
  if (gate.evidence !== null) return 'unavailable' as const;
  if (gate.audited !== null || gate.commit !== null || view.events.some(event =>
    event.type === 'gate-committing' && event.data.gate === gate.id)) return 'incomplete' as const;
  return 'not-started' as const;
}

/** Project one canonical node for every committed core element, with no list-query caps. */
export function executionCoreOf(view: RunView): ExecutionCoreIndex {
  const runVersion = view.entries.at(-1)?.sequence ?? 0;
  const nodes: ExecutionNode[] = [];
  const links: ExecutionLink[] = [];
  const gaps: string[] = [];
  const add = (node: ExecutionNode) => nodes.push(node);
  const relate = (kind: ExecutionLink['kind'], from: string, to: string, source: ExecutionSourceRef) => {
    const id = `${kind}:${from}:${to}`;
    if (links.some(link => link.id === id)) return;
    links.push({ id, kind, from: { coverage: 'shown', key: from }, to: { coverage: 'shown', key: to }, source, runVersion });
  };
  const base = (id: string, name: string, source: ExecutionSourceRef) => ({
    key: id, runVersion, label: name, sourceRefs: [source], modules: [],
  });
  const tracked = scenariosOf(view);
  const scenarioSource = scenarioSources(view);
  const latestResult = scenarioResults(view);
  const byEntry = new Map<string, ScenarioRecord[]>();
  for (const scenario of tracked.records) if (scenario.entry !== null) {
    byEntry.set(scenario.entry, [...(byEntry.get(scenario.entry) ?? []), scenario]);
  }
  const verified = new Set(view.events.filter(event => event.type === 'requirement-verified')
    .map(event => `${event.data.requirement}@${event.data.revision}`));
  const progress = capabilityProgressOf(view).filter(capability => !capability.tentative);
  const entries = new Map(view.entryAssignments?.entries.map(entry => [entry.capability, entry]) ?? []);
  if (view.entryAssignments === null) gaps.push('Accepted entry assignments are not retained.');
  for (const entry of entries.values()) if (!view.records.registry.some(registry => registry.capability === entry.capability)) {
    gaps.push(`Accepted entry ${entry.capability} has no retained capability record.`);
  }

  for (const capability of progress) {
    const registry = view.records.registry.find(entry => entry.capability === capability.capability);
    if (registry === undefined) continue;
    const source = sourceOf(view, 'ramify-agent.capability/1', registry.capability, 'capability-record');
    const member = byEntry.get(registry.capability) ?? [];
    const bucket = { passed: 0, failed: 0, other: 0, noRealRun: 0, unavailable: 0 };
    for (const scenario of member) {
      const result = latestResult.get(scenario.id) ?? 'no-real-run';
      if (result === 'unavailable') bucket.unavailable++;
      else if (result === 'no-real-run') bucket.noRealRun++;
      else if (scenarioState(tracked.states.get(scenario.id)) !== 'implemented') bucket.other++;
      else if (result === 'passed') bucket.passed++;
      else if (result === 'failed') bucket.failed++;
      else bucket.other++;
    }
    const requirements = [...view.records.requirements.values()].filter(requirement => requirement.forCapability === registry.capability);
    const requirementKeys = requirements.map(requirement => key('requirement', requirement.id));
    const verifiedCount = requirements.filter(requirement => verified.has(`${requirement.id}@${requirement.revision}`)).length;
    add({ ...base(key('capability', registry.capability), registry.capability, source), kind: 'capability',
      level: registry.origin === 'entry' ? 'entry' : 'lower', behavior: registry.behavior, state: capability.state, reason: capability.reason,
      owner: registry.owner,
      proposed: registry.proposed === undefined ? null : { parent: registry.proposed.parent,
        directory: registry.proposed.directory, purpose: registry.proposed.purpose, tags: [...registry.proposed.tags] },
      modules: [{ module: registry.owner, role: 'owner', source }],
      scenarios: { coverage: count(member.length), ...bucket },
      directRequirements: { coverage: count(requirementKeys.length), verified: verifiedCount, keys: requirementKeys },
    });
  }

  for (const scenario of tracked.records) {
    const source = scenarioSource.get(scenario.id);
    if (source === undefined) { gaps.push(`Scenario ${scenario.id} has no retained source record.`); continue; }
    const state = scenarioState(tracked.states.get(scenario.id));
    add({ ...base(key('scenario', scenario.id), scenario.name || scenario.id, source), kind: 'scenario',
      scenarioKind: scenario.kind, state, latestRealResult: latestResult.get(scenario.id) ?? 'no-real-run',
      entry: scenario.entry === null ? null : key('capability', scenario.entry), detailAvailable: scenario.source.length > 0,
      modules: [{ module: scenario.owner, role: 'owner', source }],
    });
    if (scenario.entry !== null && progress.some(row => row.capability === scenario.entry)) {
      relate('tracks-scenario', key('capability', scenario.entry), key('scenario', scenario.id), source);
    } else if (scenario.entry !== null) gaps.push(`Scenario ${scenario.id} names missing entry capability ${scenario.entry}.`);
    if (scenario.source.length === 0 || scenario.name.length === 0) gaps.push(`Scenario ${scenario.id} lacks complete retained detail.`);
  }

  for (const summary of allWorkItemsOf(view)) {
    const source = sourceOf(view, 'ramify-agent.work-item/1', summary.id, 'work-item');
    add({ ...base(key('work-item', summary.id), summary.goal, source), kind: 'work-item',
      state: summary.state, module: summary.module, goal: summary.goal,
      modules: summary.module === null ? [] : [{ module: summary.module, role: 'owner', source }],
    });
    if (summary.capability !== null && progress.some(row => row.capability === summary.capability)) {
      relate('started-for', key('capability', summary.capability), key('work-item', summary.id), source);
    }
  }

  const iterationCounts = new Map<string, number>();
  const startedIterations = new Set(view.events.filter(event => event.type === 'invocation-started')
    .flatMap(event => event.data.work.iteration === undefined ? [] : [event.data.work.iteration]));
  for (const { body: assignment, sequence } of view.assignments) {
    const source: ExecutionSourceRef = { kind: 'iteration-assignment', id: assignment.id, sequence, revision: assignment.outline.revision };
    const ordinal = (iterationCounts.get(assignment.workItem) ?? 0) + 1;
    iterationCounts.set(assignment.workItem, ordinal);
    const result = view.records.results.get(assignment.id);
    const state = result === undefined ? startedIterations.has(assignment.id) ? 'working' : 'assigned'
      : result.outcome === 'accepted' ? 'completed' : 'failed';
    const item = view.records.workItems.find(candidate => candidate.id === assignment.workItem);
    const module = item?.module ?? null;
    if (item === undefined) gaps.push(`Iteration ${assignment.id} names missing work item ${assignment.workItem}.`);
    add({ ...base(key('iteration', assignment.id), assignment.goal, source), kind: 'iteration',
      workItem: key('work-item', assignment.workItem), ordinal, outlineRevision: assignment.outline.revision,
      state, outcome: result?.outcome ?? null, module, scopeExceptions: assignment.scope.extra.map(extra => ({ path: extra.path, purpose: extra.purpose })),
      modules: module === null ? [] : [{ module, role: 'owner', source }],
    });
    if (item !== undefined) relate('assigned-iteration', key('work-item', item.id), key('iteration', assignment.id), source);
  }

  for (const session of runSessionViews(view)) {
    const source = eventSource(view, session.opened.sequence);
    const workItem = session.reaches.kind === 'work-item' ? session.reaches.workItem : session.work.workItem ?? null;
    const module = session.reaches.kind === 'work-item' || session.reaches.kind === 'module' ? session.reaches.module : null;
    add({ ...base(key('session', session.session), `${label(session.role)} ${session.session}`, source), kind: 'session',
      role: session.role, state: session.state, executor: session.executor, workItem: workItem === null ? null : key('work-item', workItem),
      reach: session.reaches, invocations: session.invocations.map(invocation => invocation.invocation),
      modules: module === null ? [] : [{ module, role: session.role === 'local-architect' ? 'local-architect' as const :
        session.role === 'engineer' ? 'engineer' as const : session.role === 'contract-engineer' ? 'contract-engineer' as const : 'owner' as const, source }],
    });
    if (workItem !== null && view.records.workItems.some(item => item.id === workItem)) {
      relate('session-for', key('session', session.session), key('work-item', workItem), source);
    }
  }

  for (const { body: gate } of view.gates.values()) {
    const source = sourceOf(view, 'ramify-agent.gate-attempt/3', gate.id, 'gate');
    const auditRecord = view.gateAuditOutcomes.get(gate.id);
    add({ ...base(key('gate', gate.id), `${label(gate.checkpoint)} gate ${gate.id}`, source), kind: 'gate',
      sourceRefs: auditRecord === undefined ? [source] : [source, { kind: 'audit', id: gate.id, sequence: auditRecord.sequence, revision: 1 }],
      checkpoint: gate.checkpoint, verdict: gate.verdict, audit: auditOf(view, gate), repairRound: gate.repairRound,
      commit: gate.commit, auditedCommit: gate.audited, active: false,
      subject: { workItem: gate.subject.workItem ?? null, iteration: gate.subject.iteration ?? null },
      cause: gate.cause, evidencePresent: gate.evidence !== null,
    });
    const target = gate.subject.iteration !== undefined && view.records.assignments.has(gate.subject.iteration)
      ? key('iteration', gate.subject.iteration)
      : gate.subject.workItem !== undefined && view.records.workItems.some(item => item.id === gate.subject.workItem)
        ? key('work-item', gate.subject.workItem) : null;
    if (target !== null) relate('gate-for', key('gate', gate.id), target, source);
    if (gate.evidence !== null && auditRecord === undefined) {
      gaps.push(`Audit result for gate ${gate.id} is unavailable: the gate retains publication refs but no overall outcome.`);
    } else if (auditRecord !== undefined && (gate.evidence === null || auditRecord.body.audited !== gate.audited)) {
      gaps.push(`Audit result for gate ${gate.id} does not match its retained publication and cannot establish an outcome.`);
    } else if (gate.evidence === null && gate.audited !== null) {
      gaps.push(`Audit publication for gate ${gate.id} is incomplete; no audit result is retained.`);
    }
  }
  const settled = new Set(view.gates.keys());
  const ended = view.events.some(event => ['job-completed', 'job-failed', 'job-interrupted', 'job-stopped'].includes(event.type));
  const activeStarts = new Map<string, typeof view.events[number]>();
  for (const event of view.events) {
    if (event.type === 'gate-started' || event.type === 'gate-committing') activeStarts.set(event.data.gate, event);
    if (event.type === 'gate-attempted' || event.type === 'readiness-passed') activeStarts.delete(event.data.gate);
    if (event.type === 'readiness-failed') {
      if (event.data.gate !== undefined) { activeStarts.delete(event.data.gate); continue; }
      const previous = [...activeStarts.values()].reverse().find(start => start.type === 'gate-started' && start.data.checkpoint === 'readiness');
      if (previous?.type === 'gate-started') activeStarts.delete(previous.data.gate);
    }
  }
  for (const event of activeStarts.values()) if (!settled.has(event.type === 'gate-started' || event.type === 'gate-committing' ? event.data.gate : '')) {
    if (event.type !== 'gate-started' && event.type !== 'gate-committing') continue;
    if (ended) { gaps.push(`Gate ${event.data.gate} started but has no retained ending.`); continue; }
    const source = eventSource(view, event.sequence);
    add({ ...base(key('gate', event.data.gate), `${label(event.data.checkpoint)} gate ${event.data.gate}`, source),
      kind: 'gate', checkpoint: gateCheckpointSchema.parse(event.data.checkpoint),
      verdict: null, audit: event.data.checkpoint === 'readiness' ? 'not-applicable' : 'not-started', repairRound: 0,
      commit: null, auditedCommit: null, active: true,
      subject: { workItem: null, iteration: null }, cause: null, evidencePresent: false });
  }

  // Relationships are projections of committed identities. Revisions change a
  // node's current color, never the identity of its provider or old gates.
  const known = () => new Set(nodes.map(node => node.key));
  for (const request of view.records.requests.values()) {
    const source = sourceOf(view, 'ramify-agent.placement-request/1', request.id, 'placement-request');
    add({ ...base(key('placement-request', request.id), request.question, source), kind: 'placement-request',
      state: [...view.records.decisions.values()].some(decision => decision.request === request.id) ? 'decided' : 'open',
      requestedBy: key('work-item', request.workItem),
      modules: [{ module: request.requester, role: 'consumer', source }],
    });
    if (known().has(key('work-item', request.workItem))) relate('requested-by', key('placement-request', request.id), key('work-item', request.workItem), source);
  }
  for (const contract of view.records.contracts.values()) {
    const source = recordSource(view, 'ramify-agent.contract/2', contract.id, 'contract', true);
    if (source === null) { gaps.push(`Contract ${contract.id} has no retained source.`); continue; }
    const conformed = view.events.some(event => event.type === 'provider-conformed' &&
      event.data.obligation === `ob-${contract.id}` && event.data.revision === contract.revision);
    const currentRequirements = [...view.records.requirements.values()].filter(requirement =>
      requirement.obligation === `ob-${contract.id}` && requirement.revision === contract.revision);
    const allVerified = currentRequirements.length > 0 && currentRequirements.every(requirement => verified.has(`${requirement.id}@${requirement.revision}`));
    const state = contract.mode === 'access-only' || allVerified ? 'conformed' :
      contract.revision > 1 ? 'reopened' : conformed ? 'conformed' : 'working';
    add({ ...base(key('contract', contract.id), contract.behavior, source), kind: 'contract',
      state, revision: contract.revision, mode: contract.mode,
      modules: [{ module: contract.provider, role: 'provider' as const, source },
        { module: contract.authority.owner, role: 'consumer' as const, source }].filter((relation, index, all) =>
          all.findIndex(candidate => candidate.module === relation.module && candidate.role === relation.role) === index),
    });
    if (contract.decision !== null) {
      const decision = view.records.decisions.get(contract.decision);
      if (decision?.request !== null && decision?.request !== undefined && known().has(key('placement-request', decision.request))) {
        relate('established-by', key('contract', contract.id), key('placement-request', decision.request), source);
      }
    }
    if (known().has(key('iteration', contract.establishedBy.iteration))) {
      relate('established-by', key('contract', contract.id), key('iteration', contract.establishedBy.iteration), source);
    }
  }
  for (const requirement of view.records.requirements.values()) {
    const source = recordSource(view, 'ramify-agent.consumer-requirement/1', requirement.id, 'requirement', true);
    if (source === null) { gaps.push(`Requirement ${requirement.id} has no retained source.`); continue; }
    const contractId = requirement.obligation.replace(/^ob-/, '');
    const contract = view.records.contracts.get(contractId);
    const obligation = view.records.obligations.get(requirement.obligation);
    const provider = obligation === undefined ? null : key('capability', obligation.capability);
    if (contract === undefined || obligation === undefined || provider === null || !known().has(provider)) {
      gaps.push(`Requirement ${requirement.id} has no complete current provider binding.`);
    }
    const providerItems = view.records.workItems.filter(item => 'obligation' in item.origin && item.origin.obligation.id === requirement.obligation);
    const providerStarted = providerItems.some(item => view.events.some(event =>
      event.type === 'work-item-started' && event.data.workItem === item.id ||
      event.type === 'invocation-started' && event.data.work.workItem === item.id));
    const conformed = view.events.some(event => event.type === 'provider-conformed' &&
      event.data.obligation === requirement.obligation && event.data.revision === requirement.revision);
    const currentVerified = verified.has(`${requirement.id}@${requirement.revision}`);
    const oldVerification = view.events.flatMap(event => event.type === 'requirement-verified' && event.data.requirement === requirement.id
      ? [event.data.revision] : []).at(-1) ?? null;
    const providerStage = contract === undefined || obligation === undefined || provider === null || !known().has(provider) ? 'unavailable' :
      contract.mode === 'access-only' ? 'access-established' : conformed ? 'conformed' : providerStarted ? 'working' : 'not-started';
    const state = currentVerified ? 'verified' : contract === undefined || obligation === undefined || providerStage === 'unavailable' ? 'unavailable' :
      oldVerification !== null && oldVerification < requirement.revision ? 'reopened' :
      conformed ? 'provider-conformed' : 'working';
    add({ ...base(key('requirement', requirement.id), requirement.behavior, source), kind: 'requirement',
      state, consumer: key('capability', requirement.forCapability), contract: key('contract', contractId),
      currentRevision: requirement.revision, verifiedRevision: oldVerification, providerStage,
      provider: provider !== null && known().has(provider) ? provider : null,
      modules: [{ module: requirement.consumer, role: 'consumer', source },
        ...(contract === undefined ? [] : [{ module: contract.provider, role: 'provider' as const, source }])],
    });
    const verification = [...view.events].reverse().find(event => event.type === 'requirement-verified' &&
      event.data.requirement === requirement.id && event.data.revision === requirement.revision);
    if (known().has(key('contract', contractId))) relate('verification-of', key('requirement', requirement.id), key('contract', contractId),
      verification === undefined ? source : eventSource(view, verification.sequence));
    if (provider !== null && known().has(provider)) relate('provider-for', provider, key('requirement', requirement.id), source);
    if (known().has(key('capability', requirement.forCapability)) && provider !== null && known().has(provider)) {
      relate('depends-on', key('capability', requirement.forCapability), provider, source);
    }
  }
  for (const registry of view.records.registry) {
    if (registry.decision !== null) {
      const decision = view.records.decisions.get(registry.decision);
      if (decision?.request !== null && decision?.request !== undefined && known().has(key('placement-request', decision.request))) {
        const source = sourceOf(view, 'ramify-agent.capability/1', registry.capability, 'capability-record');
        relate('proposed-by', key('capability', registry.capability), key('placement-request', decision.request), source);
      }
    }
    for (const consumer of registry.consumers) if (known().has(key('capability', consumer.capability))) {
      const source = sourceOf(view, 'ramify-agent.capability/1', registry.capability, 'capability-record');
      const from = key('capability', consumer.capability), to = key('capability', registry.capability);
      if (!links.some(link => link.kind === 'depends-on' && link.from.key === from && link.to.key === to)) relate('depends-on', from, to, source);
    }
  }
  for (const event of view.events) if (event.type === 'contract-requested' && event.data.requestedBy !== null) {
    const registered = view.events.find(candidate => candidate.type === 'contract-registered' && candidate.data.iteration === event.data.iteration);
    if (registered?.type === 'contract-registered' && known().has(key('contract', registered.data.contract)) &&
        known().has(key('iteration', event.data.requestedBy))) {
      relate('requested-by', key('contract', registered.data.contract), key('iteration', event.data.requestedBy), eventSource(view, event.sequence));
    }
  }
  const previous = new Map<string, string>();
  for (const assignment of view.assignments) {
    const before = previous.get(assignment.body.workItem);
    if (before !== undefined) relate('follows', key('iteration', before), key('iteration', assignment.body.id),
      { kind: 'iteration-assignment', id: assignment.body.id, sequence: assignment.sequence, revision: assignment.body.outline.revision });
    previous.set(assignment.body.workItem, assignment.body.id);
  }
  for (const item of view.records.workItems) if (item.follows !== undefined && known().has(key('work-item', item.follows))) {
    relate('follows', key('work-item', item.follows), key('work-item', item.id), sourceOf(view, 'ramify-agent.work-item/1', item.id, 'work-item'));
  }
  for (const session of runSessionViews(view)) {
    if (session.reaches.kind === 'request' && known().has(key('placement-request', session.reaches.request))) {
      relate('session-for', key('session', session.session), key('placement-request', session.reaches.request), eventSource(view, session.opened.sequence));
    }
    for (const invocation of session.invocations) {
      const started = view.events.find(event => event.type === 'invocation-started' && event.data.invocation === invocation.invocation);
      if (started?.type === 'invocation-started' && started.data.work.iteration !== undefined && known().has(key('iteration', started.data.work.iteration))) {
        relate('session-for', key('session', session.session), key('iteration', started.data.work.iteration), eventSource(view, started.sequence));
      }
      if (started?.type === 'invocation-started' && session.role === 'contract-engineer' && started.data.work.iteration !== undefined) {
        const registration = view.events.find(event => event.type === 'contract-registered' && event.data.iteration === started.data.work.iteration);
        if (registration?.type === 'contract-registered' && known().has(key('contract', registration.data.contract))) {
          relate('session-for', key('session', session.session), key('contract', registration.data.contract), eventSource(view, started.sequence));
        }
      }
    }
  }
  const earlierGate = new Map<string, string>();
  for (const { body: gate } of view.gates.values()) {
    const subject = `${gate.checkpoint}:${gate.subject.workItem ?? ''}`;
    const prior = earlierGate.get(subject);
    if (gate.repairRound > 0 && prior !== undefined) relate('repair-of', key('gate', gate.id), key('gate', prior),
      sourceOf(view, 'ramify-agent.gate-attempt/3', gate.id, 'gate'));
    earlierGate.set(subject, gate.id);
  }

  const openInvocations = new Map<string, { session: string; sequence: number }>();
  for (const event of view.events) {
    if (event.type === 'invocation-started') openInvocations.set(event.data.invocation, { session: event.data.session, sequence: event.sequence });
    if (event.type === 'invocation-ended') openInvocations.delete(event.data.invocation);
  }
  const awaited = ended ? undefined : [...openInvocations.values()].at(-1);
  const running = ended ? undefined : [...activeStarts.values()].at(-1);
  const runningGate = running?.type === 'gate-started' || running?.type === 'gate-committing' ? running : undefined;
  // The step a running gate is on: the last command of that gate that
  // started after the gate did.
  const command = runningGate === undefined ? undefined : [...view.events].reverse().find(event =>
    (event.type === 'gate-command-started' || event.type === 'gate-command-waiting') &&
    event.data.gate === runningGate.data.gate && event.sequence > runningGate.sequence);
  const current: ExecutionCoreIndex['current'] = {
    awaitedSession: awaited === undefined ? null : key('session', awaited.session),
    runningGate: runningGate === undefined ? null : key('gate', runningGate.data.gate),
    source: runningGate !== undefined ? eventSource(view, runningGate.sequence) : awaited !== undefined ? eventSource(view, awaited.sequence) : null,
    ...(command?.type === 'gate-command-started' || command?.type === 'gate-command-waiting'
      ? { gateCommand: {
        kind: command.data.kind,
        ...(command.type === 'gate-command-started' && command.data.name !== undefined ? { name: command.data.name } : {}),
        ...(command.type === 'gate-command-waiting' ? { waitingLine: command.data.line } : {}),
        position: command.data.position, total: command.data.total, source: eventSource(view, command.sequence),
      } }
      : {}),
  };

  const keys = new Set<string>();
  for (const node of nodes) {
    if (keys.has(node.key)) throw new Error(`Duplicate execution element ${node.key}`);
    keys.add(node.key);
  }
  const ids = new Set<string>();
  for (const link of links) {
    if (ids.has(link.id)) throw new Error(`Duplicate execution link ${link.id}`);
    ids.add(link.id);
    if (!keys.has(link.from.key) || !keys.has(link.to.key)) throw new Error(`Execution link ${link.id} has an absent endpoint`);
  }
  nodes.sort((a, b) => (a.sourceRefs[0]?.sequence ?? Infinity) - (b.sourceRefs[0]?.sequence ?? Infinity)
    || a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
  links.sort((a, b) => (a.source.sequence ?? Infinity) - (b.source.sequence ?? Infinity) || a.id.localeCompare(b.id));
  return { runVersion, nodes, links, gaps, current };
}

function scenarioState(state: ReturnType<typeof scenariosOf>['states'] extends ReadonlyMap<string, infer S> ? S | undefined : never) {
  return state ?? 'pending';
}

/** Full accepted entry description or registered lower-level behavior, never clipped to a list limit. */
export function executionCapabilityDetailOf(view: RunView, capability: string): ExecutionCapabilityDetail {
  const runVersion = view.entries.at(-1)?.sequence ?? 0;
  const entry = view.entryAssignments?.entries.find(candidate => candidate.capability === capability);
  if (entry !== undefined) {
    const accepted = view.events.find(event => event.type === 'analysis-accepted');
    const source: ExecutionSourceRef = { kind: 'analysis-entry', id: capability, sequence: accepted?.sequence ?? null, revision: null };
    return { schema: 'execution-map/1', runVersion, key: key('capability', capability),
      detail: { state: 'available', level: 'entry', description: entry.description, source } };
  }
  const registry = view.records.registry.find(candidate => candidate.capability === capability);
  if (registry !== undefined && registry.origin !== 'entry') {
    const source = recordSource(view, 'ramify-agent.capability/1', capability, 'capability-record', true);
    if (source !== null) return { schema: 'execution-map/1', runVersion, key: key('capability', capability),
      detail: { state: 'available', level: 'lower', description: registry.behavior, source } };
  }
  return { schema: 'execution-map/1', runVersion, key: key('capability', capability),
    detail: { state: 'unavailable', reason: `No retained description for capability ${capability}.` } };
}

/** The entire frozen scenario block, or an explicit absent-source result. */
export function executionScenarioDetailOf(view: RunView, scenario: string): ExecutionScenarioDetail {
  const runVersion = view.entries.at(-1)?.sequence ?? 0;
  const record = scenariosOf(view).records.find(candidate => candidate.id === scenario);
  const source = scenarioSources(view).get(scenario);
  if (record !== undefined && source !== undefined && record.source.length > 0 && record.name.length > 0) {
    return { schema: 'execution-map/1', runVersion, key: key('scenario', scenario),
      detail: { state: 'available', name: record.name, source: [...record.source], gates: gatesByScenario(view).get(scenario) ?? [], record: source } };
  }
  return { schema: 'execution-map/1', runVersion, key: key('scenario', scenario),
    detail: { state: 'unavailable', reason: `No retained frozen source for scenario ${scenario}.` } };
}
