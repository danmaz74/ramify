import type { ExecutionNode, ExecutionLink, ExecutionSourceRef, ExecutionCapabilityDetail, ExecutionScenarioDetail } from '../../../../harness/src/interfaces/protocol/execution-map.js';
import type { ExecutionMapSnapshot } from '../../execution-map-client.js';

const version = 42;
const source = (sequence: number): ExecutionSourceRef => ({ kind: 'run-event', id: `ev-${sequence}`, sequence, revision: null });
const base = (key: string, label: string, sequence: number) => ({ key, label, runVersion: version, sourceRefs: [source(sequence)], modules: [] });
const complete = (total: number) => ({ state: 'complete' as const, known: total, total });
export const canvasNodes: ExecutionNode[] = [
  { ...base('capability:status-badge', 'status-badge', 2), kind: 'capability', level: 'entry', behavior: 'Shows the run\'s status as a badge.', state: 'working', reason: 'The reopened provider requirement needs verification.', owner: 'project/ui', proposed: null,
    scenarios: { coverage: complete(1), passed: 1, failed: 0, other: 0, noRealRun: 0, unavailable: 0 }, directRequirements: { coverage: complete(1), verified: 0, keys: ['requirement:req-status'] } },
  { ...base('capability:accessible-tone', 'accessible-tone', 3), kind: 'capability', level: 'entry', behavior: 'Keeps the badge tone readable.', state: 'working', reason: 'Its current scenario has not passed.', owner: 'project/accessibility', proposed: null,
    scenarios: { coverage: complete(1), passed: 0, failed: 1, other: 0, noRealRun: 0, unavailable: 0 }, directRequirements: { coverage: complete(0), verified: 0, keys: [] } },
  { ...base('capability:theme-tokens', 'theme-tokens', 11), kind: 'capability', level: 'lower', behavior: 'Provides shared theme tokens.', state: 'completed', reason: 'Provider conformance passed.', owner: 'project/theme', proposed: null,
    scenarios: { coverage: complete(0), passed: 0, failed: 0, other: 0, noRealRun: 0, unavailable: 0 }, directRequirements: { coverage: complete(0), verified: 0, keys: [] } },
  { ...base('scenario:sc-status', 'Renders the status badge', 4), kind: 'scenario', scenarioKind: 'entry', state: 'done', latestRealResult: 'passed', entry: 'capability:status-badge', detailAvailable: true },
  { ...base('scenario:sc-accessible', 'Accessible tone is readable', 5), kind: 'scenario', scenarioKind: 'entry', state: 'done', latestRealResult: 'failed', entry: 'capability:accessible-tone', detailAvailable: true },
  { ...base('scenario:sc-integration', 'Integration across modules', 6), kind: 'scenario', scenarioKind: 'integration', state: 'pending', latestRealResult: 'no-real-run', entry: null, detailAvailable: true },
  { ...base('work-item:wi-status', 'Implement status badge', 7), kind: 'work-item', state: 'working', module: 'project/ui', goal: 'Implement and verify status badge.' },
  { ...base('work-item:wi-provider', 'Implement theme tokens', 12), kind: 'work-item', state: 'completed', module: 'project/theme', goal: 'Implement shared theme tokens.' },
  { ...base('iteration:it-status-1', 'Status iteration 1', 16), kind: 'iteration', workItem: 'work-item:wi-status', ordinal: 1, outlineRevision: 1, state: 'failed', outcome: 'partial', module: 'project/ui', scopeExceptions: [] },
  { ...base('iteration:it-status-2', 'Status iteration 2', 30), kind: 'iteration', workItem: 'work-item:wi-status', ordinal: 2, outlineRevision: 2, state: 'completed', outcome: 'accepted', module: 'project/ui', scopeExceptions: [] },
  { ...base('placement-request:pl-1', 'Place theme tokens', 9), kind: 'placement-request', state: 'decided', requestedBy: 'iteration:it-status-1' },
  { ...base('contract:ct-theme', 'Theme token contract', 13), kind: 'contract', state: 'reopened', revision: 2, mode: 'fake-backed' },
  { ...base('requirement:req-status', 'Status requires theme tokens', 14), kind: 'requirement', state: 'reopened', consumer: 'capability:status-badge', contract: 'contract:ct-theme', currentRevision: 2, verifiedRevision: 1, providerStage: 'conformed', provider: 'capability:theme-tokens' },
  { ...base('session:ses-initial', 'Initial architect', 1), kind: 'session', role: 'initial-architect', state: 'finished', executor: 'scripted', workItem: null, reach: { kind: 'run' }, invocations: ['inv-initial'] },
  { ...base('session:ses-local-status', 'Status local architect', 10), kind: 'session', role: 'local-architect', state: 'suspended', executor: 'scripted', workItem: 'work-item:wi-status', reach: { kind: 'work-item', workItem: 'wi-status', capability: 'status-badge', module: 'project/ui' }, invocations: ['inv-outline', 'inv-resume'] },
  { ...base('session:ses-engineer', 'Status engineer', 29), kind: 'session', role: 'engineer', state: 'live', executor: 'scripted', workItem: 'work-item:wi-status', reach: { kind: 'work-item', workItem: 'wi-status', capability: 'status-badge', module: 'project/ui' }, invocations: ['inv-status'] },
  { ...base('gate:ga-005', 'Status iteration gate, failed', 27), kind: 'gate', checkpoint: 'iteration', verdict: 'failed', audit: 'passed', repairRound: 0, commit: 'commit-failed', auditedCommit: 'commit-failed', active: false, subject: { workItem: 'wi-status', iteration: 'it-status-1' }, cause: 'in-scope', evidencePresent: true },
  { ...base('gate:ga-006', 'Status iteration gate, repaired', 34), kind: 'gate', checkpoint: 'iteration', verdict: 'passed', audit: 'incomplete', repairRound: 1, commit: 'commit-repair', auditedCommit: null, active: false, subject: { workItem: 'wi-status', iteration: 'it-status-2' }, cause: null, evidencePresent: false },
];
const link = (id: string, kind: ExecutionLink['kind'], from: string, to: string, sequence: number): ExecutionLink => ({ id, kind,
  from: { coverage: 'shown', key: from }, to: { coverage: 'shown', key: to }, source: source(sequence), runVersion: version });
export const canvasLinks: ExecutionLink[] = [
  link('l1', 'tracks-scenario', 'capability:status-badge', 'scenario:sc-status', 4),
  link('l2', 'tracks-scenario', 'capability:accessible-tone', 'scenario:sc-accessible', 5),
  link('l3', 'started-for', 'capability:status-badge', 'work-item:wi-status', 7),
  link('l4', 'started-for', 'capability:theme-tokens', 'work-item:wi-provider', 12),
  link('l5', 'assigned-iteration', 'work-item:wi-status', 'iteration:it-status-1', 16),
  link('l6', 'assigned-iteration', 'work-item:wi-status', 'iteration:it-status-2', 30),
  link('l7', 'follows', 'iteration:it-status-1', 'iteration:it-status-2', 30),
  link('l8', 'requested-by', 'placement-request:pl-1', 'iteration:it-status-1', 9),
  link('l9', 'proposed-by', 'capability:theme-tokens', 'placement-request:pl-1', 11),
  link('l10', 'established-by', 'contract:ct-theme', 'placement-request:pl-1', 13),
  link('l11', 'provider-for', 'capability:theme-tokens', 'requirement:req-status', 14),
  link('l12', 'session-for', 'session:ses-local-status', 'work-item:wi-status', 10),
  link('l13', 'session-for', 'session:ses-engineer', 'iteration:it-status-2', 29),
  link('l14', 'gate-for', 'gate:ga-005', 'iteration:it-status-1', 27),
  link('l15', 'gate-for', 'gate:ga-006', 'iteration:it-status-2', 34),
  link('l16', 'repair-of', 'gate:ga-006', 'gate:ga-005', 34),
  link('l17', 'depends-on', 'capability:status-badge', 'capability:theme-tokens', 14),
  link('l18', 'depends-on', 'capability:theme-tokens', 'capability:status-badge', 40),
];
const noLines = { totals: { added: 0, deleted: 0, textPaths: 0, invocationIds: [] }, coverage: 'unavailable' as const,
  gaps: ['No retained lines.'], binary: { paths: 0, invocationIds: [] }, methodLimit: 'Two worktree snapshots can miss edits reverted before the second snapshot.' as const };
const tree = { status: 'unavailable' as const, message: 'No current tree.' };
export const canvasMap: ExecutionMapSnapshot = { runVersion: version, tree,
  moduleMap: { tree, modules: [], outsideTree: [], proposed: [], unplaced: [], unmapped: noLines, lines: noLines },
  current: { awaitedSession: 'session:ses-engineer', runningGate: null, source: source(41) }, nodes: canvasNodes, links: canvasLinks,
  coverage: { nodes: { shown: canvasNodes.length, total: canvasNodes.length }, links: { shown: canvasLinks.length, total: canvasLinks.length },
    modules: { shown: 0, total: 0 }, moduleRelations: { shown: 0, total: 0 }, lineRefs: { shown: 0, total: 0 }, gaps: [] }, freshness: 'fresh' };
export const capabilityDetail: ExecutionCapabilityDetail = { schema: 'execution-map/1', runVersion: version, key: 'capability:status-badge',
  detail: { state: 'available', level: 'entry', description: 'Render a status badge whose tone uses the shared theme contract.', source: source(2) } };
export const scenarioDetail: ExecutionScenarioDetail = { schema: 'execution-map/1', runVersion: version, key: 'scenario:sc-status',
  detail: { state: 'available', name: 'Renders the status badge', source: ['Scenario: Renders the status badge', '  Given a valid status'], gates: [], record: source(4) } };
