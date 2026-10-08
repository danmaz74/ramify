import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../styles.css';
import { ExecutionMapArea } from '../../execution-map.js';
import { loadExecutionMapPages, type ExecutionMapSnapshot } from '../../execution-map-client.js';
import type { ProtocolClient } from '../../client.js';
import type { ExecutionCapabilityDetail, ExecutionMapPage, ExecutionNode, ExecutionScenarioDetail } from '../../../../harness/src/interfaces/protocol/execution-map.js';
import { canvasMap, capabilityDetail, scenarioDetail } from '../helpers/execution-map-canvas.js';
import { page, reply, sessionView } from '../helpers/sessions.js';

/* A browser-safe protocol fixture. Durable scripted-run evidence is tested separately. */
const source = { kind: 'run-event' as const, id: 'ev-browser', sequence: 42, revision: null };
const core = JSON.parse(JSON.stringify(canvasMap)
  .replaceAll('ses-initial', 'ses-0001').replaceAll('ses-local-status', 'ses-0002')
  .replaceAll('ses-engineer', 'ses-0003')) as ExecutionMapSnapshot;
const complete = (total: number) => ({ state: 'complete' as const, known: total, total });
const emptyLines = { totals: { added: 0, deleted: 0, textPaths: 0, invocationIds: [] }, coverage: 'complete' as const,
  gaps: [], binary: { paths: 0, invocationIds: [] }, methodLimit: 'Two worktree snapshots can miss edits reverted before the second snapshot.' as const };
const partialLines = { ...emptyLines, totals: { added: 18, deleted: 7, textPaths: 2, invocationIds: [] },
  coverage: 'partial' as const, gaps: ['One writer snapshot was incomplete.'] };
const tree = { status: 'available' as const, revision: 'tree-browser', input: 'input-browser', modules: [
  { module: 'project', dir: '', parent: null },
  { module: 'project/ui', dir: 'subs/ui', parent: 'project' },
  { module: 'project/theme', dir: 'subs/theme', parent: 'project' },
  { module: 'project/accessibility', dir: 'subs/accessibility', parent: 'project' },
] };
const extraNodes: ExecutionNode[] = [
  { key: 'session:ses-0004', label: 'Theme global fork', kind: 'session', runVersion: 42, sourceRefs: [source], modules: [],
    role: 'global-fork', state: 'finished', executor: 'scripted', workItem: null,
    reach: { kind: 'request', request: 'pl-1', workItem: 'wi-status', capability: 'status-badge' }, invocations: ['inv-fork'] },
  { key: 'session:ses-0005', label: 'Theme contract engineer', kind: 'session', runVersion: 42, sourceRefs: [source], modules: [],
    role: 'contract-engineer', state: 'finished', executor: 'scripted', workItem: 'work-item:wi-provider',
    reach: { kind: 'work-item', workItem: 'wi-provider', capability: 'theme-tokens', module: 'project/theme' }, invocations: ['inv-contract'] },
  { key: 'contract:ct-access', label: 'Accessible theme access', kind: 'contract', runVersion: 42, sourceRefs: [source], modules: [],
    state: 'conformed', revision: 1, mode: 'access-only' },
  { key: 'requirement:req-access', label: 'Access theme interface', kind: 'requirement', runVersion: 42, sourceRefs: [source], modules: [],
    state: 'verified', consumer: 'capability:accessible-tone', contract: 'contract:ct-access', currentRevision: 1,
    verifiedRevision: 1, providerStage: 'access-established', provider: null },
];
const nodes = [...core.nodes, ...extraNodes];
const relation = (element: string, role: 'owner' | 'engineer' | 'provider' | 'consumer' | 'local-architect') => ({ element, role, source });
const ui = { module: 'project/ui', parent: 'project', dir: 'subs/ui', workedIn: true, involvedDescendants: 0,
  lines: partialLines, direct: [relation('capability:status-badge', 'owner'), relation('work-item:wi-status', 'engineer'),
    relation('session:ses-0002', 'local-architect'), relation('session:ses-0003', 'engineer'), relation('gate:ga-005', 'engineer')] };
const theme = { module: 'project/theme', parent: 'project', dir: 'subs/theme', workedIn: true, involvedDescendants: 0,
  lines: { ...emptyLines, totals: { added: 34, deleted: 11, textPaths: 3, invocationIds: [] } },
  direct: [relation('capability:theme-tokens', 'provider'), relation('work-item:wi-provider', 'engineer'),
    relation('session:ses-0005', 'engineer')] };
const accessibility = { module: 'project/accessibility', parent: 'project', dir: 'subs/accessibility', workedIn: false,
  involvedDescendants: 0, lines: { ...emptyLines, coverage: 'unavailable' as const, gaps: ['No writer snapshot.'] },
  direct: [relation('capability:accessible-tone', 'owner'), relation('requirement:req-access', 'consumer')] };
const parent = { module: 'project', parent: null, dir: '', workedIn: false, involvedDescendants: 2,
  lines: emptyLines, direct: [] };
let map: ExecutionMapSnapshot = { ...core, tree, nodes, coverage: { ...core.coverage,
  nodes: { shown: nodes.length, total: nodes.length }, modules: { shown: 4, total: 4 } },
  moduleMap: { ...core.moduleMap, tree, modules: [parent, ui, theme, accessibility], lines: partialLines } };

type AcceptanceControl = { setVersion(version: number): void; setUnavailable(value: boolean): void;
  restartVersion(): void; setRequirementVerified(value: boolean): void; setScenarioCount(count: number): void; appendLive(text: string): void };
interface DurableBrowserRun { planId: string; runId: string; pages: ExecutionMapPage[];
  capabilities: Record<string, ExecutionCapabilityDetail>; scenarios: Record<string, ExecutionScenarioDetail> }
declare global { interface Window { acceptance: AcceptanceControl; plan11Durable?: DurableBrowserRun } }
let unavailable = false;
let liveText: string | null = null;
function nextMap(nodes = map.nodes) {
  const version = map.runVersion + 1;
  map = { ...map, runVersion: version, nodes: nodes.map(node => ({ ...node, runVersion: version })),
    links: map.links.map(link => ({ ...link, runVersion: version })) };
  return version;
}
const scenarioHistory = [
  { gate: 'ga-001', checkpoint: 'iteration' as const, subject: { workItem: 'wi-status' }, verdict: 'passed' as const,
    check: 'scenarios', command: 'cucumber', status: 'passed' as const, failure: null, undefined: [] },
  { gate: 'ga-005', checkpoint: 'iteration' as const, subject: { workItem: 'wi-status' }, verdict: 'failed' as const,
    check: 'scenarios', command: 'cucumber', status: 'failed' as const, failure: null, undefined: [] },
  { gate: 'ga-006', checkpoint: 'iteration' as const, subject: { workItem: 'wi-status' }, verdict: 'passed' as const,
    check: 'scenarios', command: 'cucumber', status: 'passed' as const, failure: null, undefined: [] },
];
const client = {
  getExecutionMap: async () => { if (unavailable) throw new Error('Scripted connection loss');
    const durable = window.plan11Durable;
    if (durable) return loadExecutionMapPages(durable.pages[0]!.runVersion, async cursor => {
      const page = durable.pages.find(page => page.cursor === (cursor ?? null));
      if (!page) throw new Error(`The durable export has no page for cursor ${cursor ?? 'start'}`);
      return page;
    });
    return map;
  },
  getExecutionCapability: async (_plan: string, _run: string, capability: string) => window.plan11Durable
    ? window.plan11Durable.capabilities[capability]! : ({ ...capabilityDetail, runVersion: map.runVersion }),
  getExecutionScenario: async (_plan: string, _run: string, scenario: string) => window.plan11Durable
    ? window.plan11Durable.scenarios[scenario]! : ({ ...scenarioDetail, runVersion: map.runVersion,
    detail: scenarioDetail.detail.state === 'available' ? { ...scenarioDetail.detail, gates: scenarioHistory } : scenarioDetail.detail }),
  getCapabilityTasks: async (_plan: string, _run: string, version: number) => ({
    schema: 'capability-tasks/1' as const, version,
    terminal: { state: 'running' as const, reason: null, message: null }, requests: [], tasks: [], stack: [],
  }),
  getGate: async () => ({ commit: 'commit-failed', audited: 'commit-failed', evidence: null, commands: [] }),
  getRunSession: async (_plan: string, _run: string, id: string) => ({ version: 42,
    session: sessionView(id, { role: id === 'ses-0002' ? 'local-architect' : id === 'ses-0004' ? 'global-fork' :
      id === 'ses-0005' ? 'contract-engineer' : id === 'ses-0001' ? 'initial-architect' : 'engineer',
      state: id === 'ses-0003' ? 'live' : 'finished', finished: id === 'ses-0003' ? null : 'work-closed',
      reaches: id === 'ses-0002' ? { kind: 'work-item', workItem: 'wi-status', capability: 'status-badge', module: 'project/ui' } :
        id === 'ses-0005' ? { kind: 'work-item', workItem: 'wi-provider', capability: 'theme-tokens', module: 'project/theme' } :
          { kind: 'run' },
    }) }),
  getTranscript: async (ref: { session: string }, after: number) => ({ session: { source: 'run', planId: 'nested-provider-map', runId: 'run-scripted-map', session: ref.session },
    page: page(after ? [] : [reply(1, `Transcript for ${ref.session}`)], { cursor: Math.max(after, 1) }) }),
  pollSessions: async (_plan: string, _run: string, version: number, cursors: readonly { session: string; after: number }[]) => ({ version,
    sessions: [], transcripts: cursors.map(cursor => ({ session: cursor.session,
      page: page(cursor.session === 'ses-0003' && liveText && cursor.after < 2 ? [reply(2, liveText)] : [],
        { cursor: cursor.session === 'ses-0003' && liveText ? 2 : cursor.after }) })) }),
} as unknown as ProtocolClient;

function Fixture() {
  const [version, setVersion] = useState(window.plan11Durable?.pages[0]?.runVersion ?? 42);
  const [, refresh] = useState(0);
  window.acceptance = { setVersion, setUnavailable(value) { unavailable = value; setVersion(nextMap()); },
    restartVersion() { setVersion(nextMap()); },
    setRequirementVerified(value) { setVersion(nextMap(map.nodes.map(node => {
      if (node.key === 'capability:status-badge' && node.kind === 'capability') return { ...node,
        state: value ? 'completed' : 'working', reason: value ? 'All current evidence verified.' : 'The reopened provider requirement needs verification.',
        directRequirements: { ...node.directRequirements, verified: value ? 1 : 0 } };
      if (node.key === 'requirement:req-status' && node.kind === 'requirement') return { ...node,
        state: value ? 'verified' : 'reopened', verifiedRevision: value ? 2 : 1 };
      return node;
    }))); },
    setScenarioCount(count) { setVersion(nextMap(map.nodes.map(node => node.key === 'capability:status-badge' && node.kind === 'capability'
      ? { ...node, scenarios: { coverage: complete(count), passed: count, failed: 0, other: 0, noRealRun: 0, unavailable: 0 } }
      : node))); },
    appendLive(text) { liveText = text; refresh(v => v + 1); } };
  return <main className="route-run"><ExecutionMapArea client={client} planId={window.plan11Durable?.planId ?? 'nested-provider-map'}
    runId={window.plan11Durable?.runId ?? 'run-scripted-map'}
    version={version} events={[{ sequence: 42, at: '2026-09-24T08:00:00.000Z', transition: 'analysis-accepted', summary: 'Scripted browser event', refs: [{ kind: 'capability', id: 'status-badge' }] }]}
    onOpenGate={() => {}} /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
