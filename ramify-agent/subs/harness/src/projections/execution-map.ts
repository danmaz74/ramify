import type {
  ExecutionCapabilityDetail, ExecutionLink, ExecutionNode, ExecutionScenarioDetail, ExecutionSourceRef,
  ExecutionScenarioResult,
} from '../interfaces/protocol/execution-map.js';
import { gateCheckpointSchema } from '../interfaces/protocol/runs.js';
import type { ScenarioRecord } from '../../subs/scenarios/src/records.js';
import type { GateAttempt } from '../checks/records.js';
import { capabilityProgressOf } from './progress.js';
import { scenariosOf } from './scenarios.js';
import { runSessionViews } from './sessions.js';
import { allWorkItemsOf, capabilityOfItem } from './work.js';
import type { RunView } from './inputs.js';

/** The complete, unpaged census. HTTP pagination and the remaining causal links are later iterations. */
export interface ExecutionCoreIndex {
  readonly runVersion: number;
  readonly nodes: readonly ExecutionNode[];
  readonly links: readonly ExecutionLink[];
  readonly gaps: readonly string[];
}

const key = (kind: ExecutionNode['kind'], id: string): string => `${kind}:${id}`;
const count = (total: number) => ({ state: 'complete' as const, known: total, total });
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
    links.push({ id: `${kind}:${from}:${to}`, kind, from: { coverage: 'shown', key: from }, to: { coverage: 'shown', key: to }, source, runVersion });
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
    add({ ...base(key('capability', registry.capability), label(registry.capability), source), kind: 'capability',
      level: registry.origin === 'entry' ? 'entry' : 'lower', state: capability.state, reason: capability.reason,
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
      modules: module === null ? [] : [{ module, role: 'owner', source }],
    });
    if (workItem !== null && view.records.workItems.some(item => item.id === workItem)) {
      relate('session-for', key('session', session.session), key('work-item', workItem), source);
    }
  }

  for (const { body: gate } of view.gates.values()) {
    const source = sourceOf(view, 'ramify-agent.gate-attempt/3', gate.id, 'gate');
    add({ ...base(key('gate', gate.id), `${label(gate.checkpoint)} gate ${gate.id}`, source), kind: 'gate',
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
    if (gate.evidence !== null) gaps.push(`Audit result for gate ${gate.id} is unavailable: the gate retains publication refs but no overall outcome.`);
    else if (gate.audited !== null) gaps.push(`Audit publication for gate ${gate.id} is incomplete; no audit result is retained.`);
  }
  const settled = new Set(view.gates.keys());
  for (const event of view.events) if (event.type === 'gate-committing' && !settled.has(event.data.gate)) {
    const source = eventSource(view, event.sequence);
    add({ ...base(key('gate', event.data.gate), `${label(event.data.checkpoint)} gate ${event.data.gate}`, source),
      kind: 'gate', checkpoint: gateCheckpointSchema.parse(event.data.checkpoint),
      verdict: null, audit: event.data.checkpoint === 'readiness' ? 'not-applicable' : 'not-started', repairRound: 0,
      commit: null, auditedCommit: null, active: true,
      subject: { workItem: null, iteration: null }, cause: null, evidencePresent: false });
  }

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
  return { runVersion, nodes, links, gaps };
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
      detail: { state: 'available', name: record.name, source: [...record.source], record: source } };
  }
  return { schema: 'execution-map/1', runVersion, key: key('scenario', scenario),
    detail: { state: 'unavailable', reason: `No retained frozen source for scenario ${scenario}.` } };
}
