import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type Node, type NodeChange, type NodeProps, type Viewport } from '@xyflow/react';
import type { ExecutionNode } from '../../harness/src/interfaces/protocol/execution-map.js';
import type { GateView, ProjectedRunEvent } from '../../harness/src/interfaces/protocol/runs.js';
import type { ProtocolClient } from './client.js';
import type { ExecutionMapSnapshot } from './execution-map-client.js';
import { cardWidth, estimatedCardHeight, executionLayout, runBandKey, settlePositions } from './execution-map-layout.js';
import { ExecutionModules } from './execution-modules.js';
import { CapabilityTasksArea } from './capability-tasks.js';
import { executionMapVisualTokens as tokens } from './execution-map-tokens.js';
import { waitingLabel } from './decision-waits.js';
import { RoleIcon } from './session-role.js';
import { TranscriptWorkspace, clampWindowRect, defaultWindowRect, type TranscriptWindowState } from './transcript-workspace.js';
import type { SessionAnchor } from './routes.js';
import { useQuery } from './use-query.js';

type CardData = { node: ExecutionNode | null; collapsed: boolean; hiddenCount: number; hiddenMatches: number; active: boolean;
  selected: boolean; related: boolean; flash: boolean; hasChildren: boolean; repairFrom: string | null;
  /** When a running gate started, from its `gate-started` event; null when the event is not at hand. */
  startedAt: string | null;
  /** The command a running gate is on, as `gateStep` words it; null for any other card. */
  step: string | null;
  /** The module line, from `moduleText`. */
  module: string;
  /** A work item the run holds for the person's decision, as the run's snapshot states it. */
  awaitingDecision: boolean; onSelect: (key: string) => void; onToggle: (key: string) => void };
type CardNode = Node<CardData, 'execution'>;
const statusColor = tokens.light.status;

function nodeStatus(node: ExecutionNode): keyof typeof statusColor {
  switch (node.kind) {
    case 'capability': return node.state === 'completed' ? 'completed' : node.state === 'working' ? 'working' : 'todo';
    case 'scenario': return node.state === 'done' && node.latestRealResult === 'passed' ? 'completed'
      : node.latestRealResult === 'failed' ? 'failed' : node.latestRealResult === 'unavailable' ? 'attention' : 'todo';
    case 'requirement': return node.state === 'verified' ? 'completed' : node.state === 'working' || node.state === 'provider-conformed'
      ? 'working' : node.state === 'reopened' ? 'attention' : 'todo';
    case 'gate': return node.verdict === 'passed' ? 'completed' : node.verdict === 'failed' ? 'failed' : node.active ? 'working' : 'attention';
    case 'work-item': return node.state === 'completed' ? 'completed' : node.state === 'working' ? 'working' : 'todo';
    case 'iteration': return node.state === 'completed' ? 'completed' : node.state === 'failed' ? 'failed' : node.state === 'working' ? 'working' : 'todo';
    case 'contract': return node.state === 'conformed' ? 'completed' : node.state === 'working' ? 'working' : node.state === 'reopened' ? 'attention' : 'todo';
    case 'session': return node.state === 'live' ? 'working' : node.state === 'finished' ? 'completed' : 'todo';
    default: return 'todo';
  }
}

function countText(coverage: { state: string; known?: number; total?: number | null; reason?: string }): string {
  if (coverage.state === 'unavailable') return `unavailable: ${coverage.reason}`;
  return `${coverage.known} / ${coverage.total ?? '?'}${coverage.state === 'partial' ? ' partial' : ''}`;
}

const moduleNotRecorded = 'Module not recorded';

/**
 * The module an element belongs to; a gate of a work item names the work item's module. A gate without a work item
 * and a session that reaches the run are run-wide; any other missing module is not recorded.
 */
function moduleText(node: ExecutionNode, byKey: ReadonlyMap<string, ExecutionNode>): string {
  if (node.kind === 'capability') return node.owner ?? moduleNotRecorded;
  if (node.kind === 'work-item' || node.kind === 'iteration') return node.module ?? moduleNotRecorded;
  if (node.kind === 'gate' && node.subject.workItem !== null && !node.modules.length) {
    const item = byKey.get(`work-item:${node.subject.workItem}`);
    return item?.kind === 'work-item' && item.module !== null ? item.module : moduleNotRecorded;
  }
  if (node.kind === 'session' && (node.reach.kind === 'work-item' || node.reach.kind === 'module' || node.reach.kind === 'capability-task')) return node.reach.module ?? moduleNotRecorded;
  if (node.modules.length) return node.modules.map(relation => `${relation.module} (${relation.role})`).join(', ');
  if ((node.kind === 'gate' && node.subject.workItem === null) || (node.kind === 'session' && node.reach.kind === 'run')) return 'Run-wide';
  return moduleNotRecorded;
}

type GateNode = Extract<ExecutionNode, { kind: 'gate' }>;
const verdictWords = { passed: 'Passed', failed: 'Failed', 'not-verified': 'Not verified' } as const;
const verdictMarks = { passed: '✓', failed: '✗', 'not-verified': '?' } as const;
const auditWords = { 'not-started': 'Audit not started', passed: 'Audit passed', failed: 'Audit failed', indeterminate: 'Audit indeterminate',
  incomplete: 'Audit incomplete', unavailable: 'Audit unavailable' } as const;

/** A gate's repair chain, repair round and audit, each only where it applies: a first round and a gate without an audit say nothing. */
function gateFacts(node: GateNode, repairFrom: string | null): string {
  return [repairFrom ? `${repairFrom} → ${node.verdict ? verdictMarks[node.verdict] : '…'}` : null,
    node.repairRound > 0 ? `Repair round ${node.repairRound}` : null,
    !node.active && node.audit !== 'not-applicable' ? auditWords[node.audit] : null].filter(Boolean).join(' · ');
}

/** A gate's verdict in words, or Running while it runs. */
function verdictText(node: GateNode): string {
  return node.verdict === null ? 'Running' : verdictWords[node.verdict];
}

/** The command a running gate started last, as the map's current activity states it. */
type ExecutionGateCommand = NonNullable<ExecutionMapSnapshot['current']['gateCommand']>;
const commandWords: Record<ExecutionGateCommand['kind'], string> = {
  setup: 'Setup', tests: 'Tests', 'type-check': 'Type check', 'ramify-check': 'Ramify check', conformance: 'Conformance', scenarios: 'Scenarios',
  configured: 'Configured check',
};

/** A command's words: a setup command the project named `build` is the build. */
function commandText(command: { readonly kind: ExecutionGateCommand['kind']; readonly name?: string | null | undefined }): string {
  return command.kind === 'setup' && command.name?.trim().toLowerCase() === 'build' ? 'Build' : commandWords[command.kind];
}

/** The command a running gate is on, and its place among the gate's commands: "Type check (2 of 4)". */
function gateStep(command: ExecutionGateCommand): string {
  return `${commandText(command)} (${command.position} of ${command.total})`;
}

function elapsedText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`;
}

/** How long a running gate has run, counted each second from its start. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <> for {elapsedText(now - Date.parse(since))}</>;
}

/** A scenario's latest result from a gate that was not a dry run; a scenario no such gate has run is not run yet. */
function realResultText(result: Extract<ExecutionNode, { kind: 'scenario' }>['latestRealResult']): string {
  return result === 'no-real-run' ? 'not run yet' : result;
}

type CapabilityNode = Extract<ExecutionNode, { kind: 'capability' }>;
/** Scenario results in the order the summary names and draws them; "not run yet" is a scenario no real (not dry-run) gate has run. */
const scenarioBuckets = [['passed', 'passed', 'completed'], ['failed', 'failed', 'failed'], ['other', 'other', 'attention'],
  ['noRealRun', 'not run yet', 'todo'], ['unavailable', 'unavailable', 'todo']] as const;

/**
 * A capability's scenario results, naming only the results that occur, out of its scenarios: "3 passed · 1 failed of 4",
 * or "2 of 2 not run yet" when every counted scenario has one result.
 */
function scenarioText(scenarios: CapabilityNode['scenarios']): string {
  const coverage = scenarios.coverage;
  if (coverage.state === 'unavailable') return `Scenarios unavailable: ${coverage.reason}`;
  if (coverage.known === 0 && coverage.state === 'complete') return 'No scenarios';
  const present = scenarioBuckets.filter(([field]) => scenarios[field] > 0);
  const of = coverage.state === 'partial' ? `${coverage.known} known${coverage.total === null ? '' : ` of ${coverage.total}`}` : `${coverage.known}`;
  if (present.length === 1) return `${scenarios[present[0]![0]]} of ${of} ${present[0]![1]}`;
  return `${present.map(([field, words]) => `${scenarios[field]} ${words}`).join(' · ')} of ${of}`;
}

function ScenarioSummary({ node, collapsed }: { node: CapabilityNode; collapsed: boolean }) {
  const s = node.scenarios;
  const parts = scenarioBuckets.map(([field]) => s[field]);
  const colors = scenarioBuckets.map(([, , color]) => color);
  const known = s.coverage.state === 'unavailable' ? 0 : s.coverage.known;
  const text = scenarioText(s);
  return <div className="execution-scenario-summary" aria-label={`Scenarios: ${text}`}>
    {collapsed && known <= 20 ? <div className="execution-dots" aria-hidden="true">{parts.flatMap((count, i) =>
      Array.from({ length: count }, (_, j) => <i key={`${i}-${j}`} style={{ backgroundColor: statusColor[colors[i]!] }} />))}</div>
      : <div className="execution-segments" aria-hidden="true">{parts.map((count, i) => count > 0 &&
        <i key={i} style={{ width: `${known ? count / known * 100 : 0}%`, backgroundColor: statusColor[colors[i]!] }} />)}</div>}
    <small aria-hidden="true">{text}</small>
  </div>;
}

function ExecutionCard({ data }: NodeProps<CardNode>) {
  const { node, collapsed, hiddenCount, hiddenMatches, active, selected, related, flash, hasChildren, repairFrom, startedAt, step, module, awaitingDecision, onSelect, onToggle } = data;
  if (node === null) return <div className="execution-card execution-run-band"><strong>Run band</strong><small>Initial architecture, integration and run-wide evidence</small><Handle type="source" position={Position.Right} isConnectable={false} /></div>;
  const role = node.kind === 'session' ? tokens.roleIdentity[node.role] : null;
  const roleAccent = node.kind === 'session' ? tokens.light.role[node.role] : null;
  const label = `${node.label}, ${node.kind}${node.kind === 'session' ? `, ${role!.label}, ${node.state}` : ''}${awaitingDecision ? `, ${waitingLabel.toLowerCase()}` : ''}${related ? ', directly related to selected module' : ''}`;
  const status = nodeStatus(node);
  return <div className={`execution-card execution-${node.kind} execution-state-${status}${awaitingDecision ? ' execution-awaiting-decision' : ''}${active ? ' execution-live' : ''}${selected ? ' execution-selected' : ''}${related ? ' execution-related' : ''}${flash ? ' execution-flash' : ''}`}
    style={{ borderColor: statusColor[status], borderLeftColor: roleAccent ?? statusColor[status], color: statusColor[status] }}>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <button type="button" className="execution-card-main nodrag" onClick={() => onSelect(node.key)} aria-label={label}
      aria-pressed={selected}>
      {node.kind === 'gate'
        // A gate's title names it a gate, so its first line is the verdict in words rather than the kind.
        ? <small className={`execution-gate-mark audit-${node.audit}`} aria-label={`Verdict ${node.verdict ?? 'running'}; audit ${node.audit}`}>
          {node.verdict === null ? <>Running{startedAt && <Elapsed since={startedAt} />}</> : verdictWords[node.verdict]}</small>
        : <small className={roleAccent ? 'execution-role-label' : undefined} style={roleAccent ? { color: roleAccent } : undefined}>{node.kind === 'session' ? <><RoleIcon role={node.role} /> {role!.label}</> : node.kind.replace('-', ' ')}</small>}
      {node.kind === 'gate' && step && <small className="execution-gate-step">{step}</small>}
      {/* A capability is named by its id as registered, with its registered behavior as the description. */}
      {node.kind === 'capability' ? <><strong><code className="execution-capability-id">{node.label}</code></strong>
        <small className="execution-capability-behavior" title={node.behavior}>{node.behavior}</small></> : <strong>{node.label}</strong>}
      {awaitingDecision && <small className="execution-decision-mark">{waitingLabel}</small>}
      <small>{module}</small>
      {node.kind === 'session' && node.role === 'local-architect' && <small>Local architect lane · {node.invocations.length} invocation{node.invocations.length === 1 ? '' : 's'} across the work item</small>}
      {node.kind === 'iteration' && <small>Iteration {node.ordinal} · outline {node.outlineRevision} · {node.outcome ?? node.state}</small>}
      {node.kind === 'requirement' && <small>{node.state} · provider {node.providerStage} · revision {node.currentRevision}</small>}
      {node.kind === 'contract' && <small>{node.mode} · revision {node.revision} · {node.state}</small>}
      {node.kind === 'scenario' && <small>{realResultText(node.latestRealResult)} · {node.state}</small>}
      {node.kind === 'capability' && <><small>{node.state} · {node.reason}</small><ScenarioSummary node={node} collapsed={collapsed} />
        {!collapsed && <small>Requirements: {node.directRequirements.verified} verified of {countText(node.directRequirements.coverage)} direct current-revision requirements</small>}</>}
      {node.kind === 'gate' && gateFacts(node, repairFrom) && <small>{gateFacts(node, repairFrom)}</small>}
    </button>
    {hasChildren && <button type="button" className="execution-expand nodrag" onClick={() => onToggle(node.key)}
      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.label}${hiddenMatches ? `, ${hiddenMatches} matches inside` : ''}`}
      aria-expanded={!collapsed}>{collapsed ? `▸ ${hiddenCount} inside${hiddenMatches ? ` · ${hiddenMatches} matches inside` : ''}` : '▾'}</button>}
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </div>;
}
const nodeTypes = { execution: ExecutionCard };
/** The lowest zoom at which card text stays readable: the initial view and a requested centring never open below it. */
const readableZoom = 0.8;
const fitPadding = 0.15;
/** The space above and left of the run's top when the initial view opens there. */
const fitMargin = 24;
/** Heights of the cards of each kind in the real run's canvas, used until a card is measured. */
const estimatedHeights: Partial<Record<ExecutionNode['kind'] | 'run-band', number>> = { 'run-band': 110, capability: 210, gate: 140, session: 100 };

function Detail({ node, map, client, planId, runId, onOpenGate, onOpenSession }: { node: ExecutionNode | undefined; map: ExecutionMapSnapshot;
  client: ProtocolClient; planId: string; runId: string; onOpenGate: (gate: string) => void; onOpenSession: (id: string) => void }) {
  const key = node?.key ?? '';
  const capability = useQuery(`capability-detail:${runId}:${map.runVersion}:${key}`, () =>
    node?.kind === 'capability' ? client.getExecutionCapability(planId, runId, key.slice('capability:'.length), map.runVersion) : Promise.resolve(null));
  const scenario = useQuery(`scenario-detail:${runId}:${map.runVersion}:${key}`, () =>
    node?.kind === 'scenario' ? client.getExecutionScenario(planId, runId, key.slice('scenario:'.length), map.runVersion) : Promise.resolve(null));
  const gate = useQuery(`gate-detail:${runId}:${map.runVersion}:${key}`, () =>
    node?.kind === 'gate' && !node.active ? client.getGate(planId, runId, key.slice('gate:'.length)) : Promise.resolve(null));
  if (!node) return <p className="muted">Select a map card, scenario name, session or gate for its recorded detail.</p>;
  const moduleRoles = new Set([...node.modules.map(relation => `${relation.module} (${relation.role})`),
    ...[...map.moduleMap.modules, ...map.moduleMap.outsideTree].flatMap(row =>
      row.direct.filter(relation => relation.element === node.key).map(relation => `${row.module} (${relation.role})`))]);
  return <section className="execution-detail" aria-label={`Details for ${node.label}`}>
    <h3>{node.kind === 'capability' ? <code>{node.label}</code> : node.label}</h3><p><code>{node.key}</code> · {node.kind}</p>
    {moduleRoles.size > 0 && <p>Modules: {[...moduleRoles].join('; ')}</p>}
    {node.kind === 'capability' && <><p>{node.reason}</p><p>Scenarios: {scenarioText(node.scenarios)}; requirements {node.directRequirements.verified} verified of {countText(node.directRequirements.coverage)} direct current-revision requirements.</p>
      {capability.state.status === 'ready' && capability.state.data && (capability.state.data.detail.state === 'available'
        ? <p>{capability.state.data.detail.description}</p> : <p>Full description unavailable: {capability.state.data.detail.reason}</p>)}
      {capability.state.status === 'failed' && <p role="alert">Could not read description: {capability.state.error.message}</p>}</>}
    {node.kind === 'scenario' && <><p>Latest real result: {realResultText(node.latestRealResult)}; lifecycle: {node.state}.</p>
      {scenario.state.status === 'ready' && scenario.state.data && (scenario.state.data.detail.state === 'available'
        ? <><pre>{scenario.state.data.detail.source.join('\n')}</pre><h4>Result history</h4>
          {scenario.state.data.detail.gates.length ? <ol>{scenario.state.data.detail.gates.map((g, i) => <li key={`${g.gate}:${i}`}>{g.gate}: {g.status} in {g.check}; gate {g.verdict}; {g.checkpoint}</li>)}</ol>
            : <p>No recorded gate result.</p>}</> : <p>Full scenario unavailable: {scenario.state.data.detail.reason}</p>)}
      {scenario.state.status === 'failed' && <p role="alert">Could not read scenario: {scenario.state.error.message}</p>}</>}
    {node.kind === 'gate' && <><p>Verdict {node.verdict ?? 'running'}{node.audit !== 'not-applicable' ? `; audit ${node.audit}` : ''}{node.repairRound > 0 ? `; repair round ${node.repairRound}` : ''}; cause {node.cause ?? 'none'}.</p>
      {node.active ? <p>The gate is running{map.current.runningGate === node.key && map.current.gateCommand ? `: ${map.current.gateCommand.waitingLine ?? gateStep(map.current.gateCommand)}` : ''}; its full check result will be available when this attempt settles.</p>
        : <button type="button" onClick={() => onOpenGate(node.key.slice('gate:'.length))}>Open full check and audit detail</button>}
      {gate.state.status === 'ready' && gate.state.data && <><p>Attempt commit {gate.state.data.commit ?? 'none'}; audited commit {gate.state.data.audited ?? 'none'}; audit evidence {gate.state.data.evidence?.runRef ?? 'not published'}.</p>
        {gate.state.data.audit?.nested === true && <NestedAuditLines audit={gate.state.data.audit} />}
        {gate.state.data.commands.map((command, i) => <div key={i} className="command"><p>{command.kind}: {command.outcome}; exit {command.exitCode ?? 'none'}; {command.elapsedMs} ms running{command.lockWaitMs === undefined ? '' : `; ${command.lockWaitMs} ms waiting for the machine test lock`}.</p>
          <pre aria-label={`Output tail of ${command.kind}`}>{command.output.tail}</pre></div>)}</>}
      {gate.state.status === 'failed' && <p role="alert">Could not read gate: {gate.state.error.message}</p>}</>}
    {node.kind === 'session' && <button type="button" onClick={() => onOpenSession(key.slice('session:'.length))}>Open transcript of {node.label}</button>}
    {node.kind === 'work-item' && <><p>{node.goal}</p><p>Module: {node.module ?? 'unavailable'}</p></>}
    {node.kind === 'requirement' && <p>Current revision {node.currentRevision}; verification {node.state}; provider {node.providerStage}; previous verified revision {node.verifiedRevision ?? 'none'}.</p>}
    {node.kind === 'iteration' && <p>Iteration {node.ordinal} of {node.workItem}, outline {node.outlineRevision}; {node.state}, {node.outcome ?? 'no outcome'}.</p>}
    <p className="muted">Sources: {node.sourceRefs.map(ref => `${ref.kind} ${ref.id}${ref.sequence ? ` at event ${ref.sequence}` : ''}`).join('; ')}</p>
  </section>;
}

/** A nested audit's projects and skipped definitions, one line each, as the gate recorded them. */
function NestedAuditLines({ audit }: { audit: NonNullable<GateView['audit']> }) {
  return <>
    <p>Invocation {audit.verdict ?? 'none'} over {audit.projects?.length ?? 0} projects; discovery {audit.discovery?.status ?? 'not recorded'}.</p>
    {audit.projects !== null && <ul aria-label="Audited projects">{audit.projects.map(project => (
      <li key={project.projectRoot}><code>{project.projectRoot}</code>: {project.verdict}, {project.execution}
        {project.failures.length === 0 ? '' : `; ${project.failures.join('; ')}`}
        {project.evidence === null ? '; no published record' : <>; report <code>{project.evidence.reportCommit.slice(0, 12)}</code></>}</li>
    ))}</ul>}
    {audit.discovery !== null && audit.discovery.skipped.length > 0 && <ul aria-label="Skipped projects">{audit.discovery.skipped.map(skip => (
      <li key={skip.projectRoot}>Not audited: <code>{skip.projectRoot}</code> ({skip.reason} <code>{skip.directory}</code>)</li>
    ))}</ul>}
  </>;
}

function Canvas({ map, events, client, planId, runId, onOpenGate, selected, onSelect,
  selectedModule, onSelectModule, collapsed, onCollapsed, positions, onPositions, viewport, onViewport,
  onOpenSession, focusRequest, waitingWorkItems }: { map: ExecutionMapSnapshot; events: readonly ProjectedRunEvent[];
  waitingWorkItems: ReadonlySet<string>;
  client: ProtocolClient; planId: string; runId: string; onOpenGate: (gate: string) => void;
  onOpenSession: (id: string) => void; focusRequest: { id: string; nonce: number } | null;
  selected: string | null; onSelect: (key: string | null) => void;
  selectedModule: string | null; onSelectModule: (module: string | null) => void;
  collapsed: ReadonlySet<string>; onCollapsed: (keys: ReadonlySet<string>) => void;
  positions: ReadonlyMap<string, { x: number; y: number }>; onPositions: (positions: ReadonlyMap<string, { x: number; y: number }>) => void;
  viewport: Viewport; onViewport: (viewport: Viewport) => void }) {
  const flow = useReactFlow<CardNode, Edge>();
  const [flash, setFlash] = useState<string | null>(null);
  // Cards differ in height (a capability's scenario summary, a gate's audit line), so the stack uses each card's
  // measured height, or an estimate by kind until the canvas has measured it. The cards are rebuilt on every render
  // (each pan frame among them), so each carries its measured size back: a card without one is hidden, and its edges
  // dropped, until the canvas measures it again.
  const [measured, setMeasured] = useState<ReadonlyMap<string, { width: number; height: number }>>(new Map());
  const onNodesChange = (changes: NodeChange<CardNode>[]) => {
    setMeasured(current => {
      let next: Map<string, { width: number; height: number }> | null = null;
      for (const change of changes) if (change.type === 'dimensions' && change.dimensions) {
        const known = current.get(change.id);
        if (known && Math.abs(known.width - change.dimensions.width) < 1 && Math.abs(known.height - change.dimensions.height) < 1) continue;
        next ??= new Map(current);
        next.set(change.id, { width: change.dimensions.width, height: change.dimensions.height });
      }
      return next ?? current;
    });
    // Only a card the person dragged keeps a stored position.
    const dragged = changes.flatMap(change => change.type === 'position' && change.position ? [[change.id, change.position] as const] : []);
    if (dragged.length) onPositions(new Map([...positions, ...dragged]));
  };
  const heights = useMemo(() => new Map([...measured].map(([key, size]) => [key, size.height])), [measured]);
  const heightOf = useMemo(() => {
    const kinds = new Map(map.nodes.map(node => [node.key, node.kind]));
    return (key: string) => heights.get(key) ?? estimatedHeights[kinds.get(key) ?? 'run-band'] ?? estimatedCardHeight;
  }, [heights, map.nodes]);
  const layout = useMemo(() => executionLayout(map.nodes, map.links, collapsed, heightOf), [map.nodes, map.links, collapsed, heightOf]);
  const allLayout = useMemo(() => executionLayout(map.nodes, map.links, new Set()), [map.nodes, map.links]);
  const allPlace = useMemo(() => new Map(allLayout.placements.map(p => [p.key, p])), [allLayout]);
  const hasChildren = useMemo(() => new Set(allLayout.placements.flatMap(p => p.parent ? [p.parent] : [])), [allLayout]);
  const byKey = useMemo(() => new Map(map.nodes.map(node => [node.key, node])), [map.nodes]);
  const moduleRows = useMemo(() => [...map.moduleMap.modules, ...map.moduleMap.outsideTree], [map.moduleMap]);
  const directMatches = useMemo(() => new Set(moduleRows.find(row => row.module === selectedModule)?.direct.map(ref => ref.element) ?? []),
    [moduleRows, selectedModule]);
  const highlightedModules = useMemo(() => new Set(moduleRows.filter(row => selected !== null && row.direct.some(ref => ref.element === selected))
    .map(row => row.module).concat(byKey.get(selected ?? '')?.modules.map(relation => relation.module) ?? [])), [moduleRows, byKey, selected]);
  const place = useMemo(() => new Map(layout.placements.map(p => [p.key, p])), [layout]);
  const hiddenMatches = useMemo(() => new Set([...directMatches].filter(key => layout.hidden.has(key))), [directMatches, layout.hidden]);
  const matchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const key of hiddenMatches) {
      let parent = allPlace.get(key)?.parent;
      while (parent) {
        if (collapsed.has(parent)) counts.set(parent, (counts.get(parent) ?? 0) + 1);
        parent = allPlace.get(parent)?.parent;
      }
    }
    return counts;
  }, [allPlace, collapsed, hiddenMatches]);
  // Every card follows the layout, which a version update, a measured card or a collapsed branch recomputes, so collapsing
  // a branch closes its gap. Only a card the person dragged keeps its stored position.
  const effectivePositions = useMemo(() => settlePositions(layout.placements, positions, heightOf), [layout, positions, heightOf]);
  // The canvas centres a card only when a person asks for it (a card, list or event jump, Now, Focus on map). A version
  // update, an expanded branch or a measured card leaves the pan and zoom where the person put them.
  const [centring, setCentring] = useState<{ key: string; nonce: number } | null>(null);
  const toggle = (key: string) => { const next = new Set(collapsed); if (next.has(key)) next.delete(key); else next.add(key); onCollapsed(next); };
  const focus = (key: string) => {
    let parent = place.get(key)?.parent;
    if (!parent) parent = allPlace.get(key)?.parent;
    if (layout.hidden.has(key)) { const next = new Set(collapsed);
      while (parent && parent !== runBandKey) { next.delete(parent); parent = allPlace.get(parent)?.parent; } onCollapsed(next); }
    onSelect(key);
    setCentring(previous => ({ key, nonce: (previous?.nonce ?? 0) + 1 }));
  };
  const jump = (key: string) => { onSelectModule(null); focus(key); if (key.startsWith('session:')) onOpenSession(key.slice('session:'.length)); };
  useEffect(() => {
    if (!focusRequest) return;
    const key = `session:${focusRequest.id}`;
    if (byKey.has(key)) {
      onSelectModule(null);
      focus(key);
      setFlash(key);
      const timer = setTimeout(() => setFlash(null), 1100);
      return () => clearTimeout(timer);
    }
  }, [focusRequest?.nonce]);
  // A request waits until its card is placed: revealing a hidden card places it on a later render.
  useEffect(() => {
    if (!centring) return;
    const at = effectivePositions.get(centring.key);
    if (!at || layout.hidden.has(centring.key)) return;
    setCentring(null);
    void flow.setCenter(at.x + 120, at.y + 48, {
      zoom: Math.max(viewport.zoom, readableZoom), duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
    });
  }, [centring, effectivePositions, layout]);
  // The initial view, once every placed card is measured: the whole run when it fits at a readable zoom; otherwise a
  // readable zoom centred on the active card, or on the top of the run when nothing is active. Later updates keep the view.
  const pane = useRef<HTMLDivElement>(null);
  const [initialView, setInitialView] = useState(false);
  useEffect(() => {
    if (initialView || !layout.placements.every(p => measured.has(p.key))) return;
    setInitialView(true);
    const width = pane.current?.clientWidth ?? 0, height = pane.current?.clientHeight ?? 0;
    const cards = layout.placements.map(p => ({ key: p.key, ...(effectivePositions.get(p.key) ?? p) }));
    const left = Math.min(...cards.map(card => card.x)), top = Math.min(...cards.map(card => card.y));
    const right = Math.max(...cards.map(card => card.x + (measured.get(card.key)?.width ?? cardWidth)));
    const bottom = Math.max(...cards.map(card => card.y + heightOf(card.key)));
    const fitZoom = Math.min(width / ((right - left) * (1 + 2 * fitPadding)), height / ((bottom - top) * (1 + 2 * fitPadding)));
    // An unmeasured pane (as in a test renderer) cannot say whether the run fits, so it fits.
    if (!width || !height || fitZoom >= readableZoom) { void flow.fitView({ padding: fitPadding, maxZoom: 1 }); return; }
    const target = [map.current.runningGate, map.current.awaitedSession].find(key => key && effectivePositions.has(key) && !layout.hidden.has(key));
    const at = target ? effectivePositions.get(target)! : null;
    if (at && target) void flow.setCenter(at.x + cardWidth / 2, at.y + heightOf(target) / 2, { zoom: readableZoom, duration: 0 });
    else void flow.setViewport({ x: fitMargin - left * readableZoom, y: fitMargin - top * readableZoom, zoom: readableZoom }, { duration: 0 });
  }, [initialView, layout, measured, effectivePositions, heightOf, map.current]);
  const active = new Set([map.current.awaitedSession, map.current.runningGate].filter((key): key is string => key !== null));
  const repairs = new Map(map.links.filter(l => l.kind === 'repair-of' && l.from.coverage !== 'unresolved' && l.to.coverage !== 'unresolved')
    .map(l => [l.from.key, l.to.key]));
  /** The mark of the gate a repair gate repairs, or null for a gate that repairs none. */
  const repairFrom = (key: string) => { const prior = byKey.get(repairs.get(key) ?? ''); return prior?.kind === 'gate' ? prior.verdict ? verdictMarks[prior.verdict] : '…' : null; };
  const eventTimes = useMemo(() => new Map(events.map(event => [event.sequence, event.at])), [events]);
  const startedAt = (key: string) => {
    const node = byKey.get(key);
    const sequence = node?.kind === 'gate' && node.active ? node.sourceRefs[0]?.sequence : null;
    return typeof sequence === 'number' ? eventTimes.get(sequence) ?? null : null;
  };
  const nodes: CardNode[] = layout.placements.map(p => ({ id: p.key, type: 'execution', position: effectivePositions.get(p.key) ?? { x: p.x, y: p.y }, measured: measured.get(p.key),
    data: { node: byKey.get(p.key) ?? null, collapsed: collapsed.has(p.key), hiddenCount: layout.hiddenCount.get(p.key) ?? 0,
      hiddenMatches: matchCounts.get(p.key) ?? 0, active: active.has(p.key), selected: selected === p.key,
      flash: flash === p.key,
      related: directMatches.has(p.key),
      hasChildren: hasChildren.has(p.key),
      awaitingDecision: byKey.get(p.key)?.kind === 'work-item' && waitingWorkItems.has(p.key.slice('work-item:'.length)),
      startedAt: startedAt(p.key),
      step: p.key === map.current.runningGate && map.current.gateCommand
        ? map.current.gateCommand.waitingLine ?? gateStep(map.current.gateCommand) : null,
      module: (() => { const node = byKey.get(p.key); return node ? moduleText(node, byKey) : ''; })(),
      repairFrom: repairFrom(p.key),
      onSelect: jump, onToggle: toggle }, draggable: false, selectable: true }));
  const visible = new Set(nodes.map(node => node.id));
  const edges: Edge[] = [];
  for (const p of layout.placements) if (p.parent && visible.has(p.parent)) edges.push({ id: `parent:${p.key}`, source: p.parent, target: p.key, type: 'smoothstep', selectable: false });
  for (const link of layout.references) if (link.from.coverage !== 'unresolved' && link.to.coverage !== 'unresolved' && visible.has(link.from.key) && visible.has(link.to.key)) {
    edges.push({ id: link.id, source: link.from.key, target: link.to.key, type: 'smoothstep', label: link.kind,
      style: { strokeDasharray: '4 4', stroke: link.kind === 'repair-of' ? statusColor.failed : '#64748b' }, selectable: false });
  }
  const focusNow = () => { const target = map.current.runningGate ?? map.current.awaitedSession;
    if (target) { onSelectModule(null); focus(target); } };
  const selectedNode = selected ? byKey.get(selected) : undefined;
  const selectedSequences = new Set(selectedNode?.sourceRefs.flatMap(ref => ref.sequence === null ? [] : [ref.sequence]) ?? []);
  return <div className="execution-area area-wide" aria-label="Execution map">
    <header className="execution-heading"><h2>Execution map</h2><div className="execution-actions">
      <button type="button" onClick={focusNow} disabled={!map.current.runningGate && !map.current.awaitedSession}>Now</button>
      <button type="button" onClick={() => void flow.fitView({ padding: fitPadding })}>Fit</button>
      <button type="button" onClick={() => { onPositions(new Map()); void flow.fitView({ padding: fitPadding }); }}>Relayout</button>
    </div></header>
    <p className="muted">Version {map.runVersion}{map.freshness === 'stale' ? ' · stale connection' : ''}; nodes {map.coverage.nodes.shown} / {map.coverage.nodes.total}, links {map.coverage.links.shown} / {map.coverage.links.total}, {map.tree.status === 'available' ? `modules ${map.coverage.modules.shown} / ${map.coverage.modules.total}` : `recorded module rows ${map.coverage.modules.shown} / ${map.coverage.modules.total} (hierarchy unavailable)`}.
      {map.links.filter(link => link.from.coverage === 'unresolved' || link.to.coverage === 'unresolved').length > 0 &&
        ` Unresolved references: ${map.links.filter(link => link.from.coverage === 'unresolved' || link.to.coverage === 'unresolved').length}.`}
      {map.coverage.gaps.length > 0 && ` Coverage gaps: ${map.coverage.gaps.length}.`}
      {map.tree.status === 'unavailable' && ` Module tree unavailable: ${map.tree.message}.`}</p>
    {map.coverage.gaps.length > 0 && <details className="execution-coverage-gaps">
      <summary>Coverage gaps ({map.coverage.gaps.length}) · first: <span className="execution-coverage-preview">{map.coverage.gaps.slice(0, 2).join('; ')}</span></summary>
      <ol>{map.coverage.gaps.map((gap, index) => <li key={`${index}:${gap}`}>{gap}</li>)}</ol>
    </details>}
    <div className="execution-workspace"><div className="execution-maps"><div className="execution-viewport" aria-label="Zoomable execution canvas" ref={pane}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} viewport={viewport} onMove={(_, next) => onViewport(next)} onNodesChange={onNodesChange}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable deleteKeyCode={null} minZoom={0.2} maxZoom={2}>
        <Background /><Controls showInteractive={false} />
      </ReactFlow></div>
      <ExecutionModules map={map} selectedModule={selectedModule} highlightedModules={highlightedModules}
        onSelectModule={module => { onSelectModule(module); onSelect(null); }} directMatches={directMatches}
        hiddenMatches={hiddenMatches} onJump={jump} />
      </div>
      <aside className="execution-side"><Detail node={selectedNode} map={map} client={client} planId={planId} runId={runId} onOpenGate={onOpenGate} onOpenSession={onOpenSession} />
        <section aria-label="All sessions"><h3>All sessions ({map.nodes.filter(n => n.kind === 'session').length})</h3><ul>{map.nodes.filter(n => n.kind === 'session').map(n => n.kind === 'session' &&
          <li key={n.key}><button type="button" onClick={() => jump(n.key)}><span className="execution-role-label" style={{ color: tokens.light.role[n.role] }}><RoleIcon role={n.role} /> {tokens.roleIdentity[n.role].label}</span> · {n.label} · {n.state} · {n.workItem ?? n.reach.kind} · {moduleText(n, byKey)}</button>
            {' '}<button type="button" onClick={() => onOpenSession(n.key.slice('session:'.length))}>Transcript</button></li>)}</ul></section>
        <section aria-label="All gates"><h3>All gates ({map.nodes.filter(n => n.kind === 'gate').length})</h3><ul>{map.nodes.filter(n => n.kind === 'gate').map(n => n.kind === 'gate' &&
          <li key={n.key}><button type="button" onClick={() => jump(n.key)}>{[n.label, verdictText(n), moduleText(n, byKey), gateFacts(n, repairFrom(n.key))].filter(Boolean).join(' · ')}</button></li>)}</ul></section>
        <section aria-label="References"><h3>References</h3><ul>{layout.references.filter(l => l.kind === 'provider-for' || l.kind === 'depends-on' || l.from.coverage === 'unresolved' || l.to.coverage === 'unresolved').map(l =>
          <li key={l.id}>{l.kind}: {l.from.key} → {l.to.key}{l.from.coverage === 'unresolved' || l.to.coverage === 'unresolved' ? ' · unresolved' : ' · shared or cycle reference'}</li>)}</ul></section>
      </aside></div>
    <section className="execution-rail" aria-label="Event order"><h3>Event order</h3><ol>{events.map(event => {
      const session = event.refs.filter(ref => ref.kind === 'session').map(ref => byKey.get(`session:${ref.id}`)).find(node => node?.kind === 'session');
      const role = session?.kind === 'session' ? session.role : null;
      return <li key={event.sequence} className={selectedSequences.has(event.sequence) || event.refs.some(ref => `${ref.kind}:${ref.id}` === selected) ? 'execution-event-selected' : ''}>
        <button type="button" onClick={() => { const target = event.refs.map(ref => `${ref.kind}:${ref.id}`).find(key => byKey.has(key)); if (target) jump(target); }}>
          <span>{event.sequence}</span> <time dateTime={event.at}>{event.at.slice(11, 19)}</time> {role && <span className="execution-role-label" style={{ color: tokens.light.role[role] }}> <RoleIcon role={role} /> {tokens.roleIdentity[role].label}</span>} {event.summary}
        </button></li>;
    })}</ol></section>
  </div>;
}

function ExecutionMapAreaRun({ client, planId, runId, version, events, onOpenGate, waitingWorkItems = noWaits }: { client: ProtocolClient; planId: string; runId: string;
  version: number | undefined; events: readonly ProjectedRunEvent[]; onOpenGate: (gate: string) => void; waitingWorkItems?: ReadonlySet<string> }) {
  const [selected, onSelect] = useState<string | null>(null);
  const [selectedModule, onSelectModule] = useState<string | null>(null);
  const [collapsed, onCollapsed] = useState<ReadonlySet<string> | null>(null);
  const [positions, onPositions] = useState<ReadonlyMap<string, { x: number; y: number }>>(new Map());
  const [viewport, onViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [windows, setWindows] = useState<readonly TranscriptWindowState[]>([]);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const lastMap = useRef<ExecutionMapSnapshot | null>(null);
  const query = useQuery(`execution-map:${planId}:${runId}:${version ?? 'pending'}`, () => client.getExecutionMap(planId, runId));
  if (query.state.status === 'ready') lastMap.current = query.state.data;
  const openSession = (id: string, anchor: SessionAnchor | null = null, opener: HTMLElement | null = document.activeElement instanceof HTMLElement ? document.activeElement : null) => {
    setWindows(previous => {
      const top = Math.max(0, ...previous.map(item => item.z)) + 1;
      const existing = previous.find(item => item.id === id);
      if (existing) return previous.map(item => item.id === id ? { ...item, z: top, minimized: false,
        anchor: anchor ?? item.anchor, anchorNonce: item.anchorNonce + 1 } : item);
      const rect = clampWindowRect(defaultWindowRect(previous.length), window.innerWidth, window.innerHeight);
      return [...previous, { id, rect, restore: rect, z: top, minimized: false, maximized: false,
        anchor, anchorNonce: 0, opener }];
    });
    const focusHeader = () => document.querySelector<HTMLElement>(`[data-transcript-window="${id}"] .transcript-window-drag`)?.focus();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusHeader);
    else queueMicrotask(focusHeader);
  };
  const changeWindow = (id: string, change: Partial<TranscriptWindowState>) =>
    setWindows(previous => previous.map(item => item.id === id ? { ...item, ...change } : item));
  const closeWindow = (id: string) => setWindows(previous => {
    const opener = previous.find(item => item.id === id)?.opener;
    queueMicrotask(() => opener?.focus());
    return previous.filter(item => item.id !== id);
  });
  useEffect(() => {
    const clamp = () => setWindows(previous => previous.map(item => ({ ...item,
      rect: item.maximized
        ? clampWindowRect({ x: 8, y: 8, width: window.innerWidth - 16, height: window.innerHeight - 16 }, window.innerWidth, window.innerHeight)
        : clampWindowRect(item.rect, window.innerWidth, window.innerHeight),
      restore: clampWindowRect(item.restore, window.innerWidth, window.innerHeight) })));
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, []);
  const initialCollapse = useMemo(() => {
    if (query.state.status !== 'ready') return new Set<string>();
    const snapshot = query.state.data;
    const roots = new Set(snapshot.nodes.filter(node => node.kind === 'capability' && node.level === 'entry').map(node => node.key));
    const repaired = new Set(snapshot.links.filter(link => link.kind === 'repair-of' && link.to.coverage !== 'unresolved').map(link => link.to.key));
    const latestIssue = [...snapshot.nodes].reverse().find(node => node.kind === 'gate' && node.verdict === 'failed' && !repaired.has(node.key));
    const parents = new Map(executionLayout(snapshot.nodes, snapshot.links, new Set()).placements.map(p => [p.key, p.parent]));
    for (const target of [snapshot.current.awaitedSession, snapshot.current.runningGate, latestIssue?.key]) {
      let key = target ?? null;
      while (key) { roots.delete(key); key = parents.get(key) ?? null; }
    }
    return roots;
  }, [query.state]);
  const map = query.state.status === 'ready' ? query.state.data : lastMap.current;
  return <>
    {version === undefined ? <p>Loading the run…</p> : query.state.status === 'failed' && !map
      ? <p role="alert">Could not load execution map: {query.state.error.message}</p>
      : map ? <ReactFlowProvider><Canvas map={map} events={events} client={client} planId={planId} runId={runId} onOpenGate={onOpenGate}
        selected={selected} onSelect={onSelect} collapsed={collapsed ?? initialCollapse} onCollapsed={onCollapsed}
        selectedModule={selectedModule} onSelectModule={onSelectModule} focusRequest={focusRequest} onOpenSession={openSession}
        positions={positions} onPositions={onPositions} viewport={viewport} onViewport={onViewport} waitingWorkItems={waitingWorkItems} /></ReactFlowProvider>
        : <p>Loading execution map…</p>}
    {query.state.status === 'failed' && map && <p role="alert">Could not refresh execution map: {query.state.error.message}</p>}
    <CapabilityTasksArea client={client} planId={planId} runId={runId} version={version} onOpenGate={onOpenGate} />
    <TranscriptWorkspace client={client} planId={planId} runId={runId} nodes={map?.nodes ?? []} windows={windows}
      onOpen={openSession} onChange={changeWindow} onClose={closeWindow}
      onFocusMap={id => setFocusRequest({ id, nonce: Date.now() + Math.random() })} />
  </>;
}

const noWaits: ReadonlySet<string> = new Set();

/** A route change gives the map and its floating workspace a fresh run identity. */
export function ExecutionMapArea(props: { client: ProtocolClient; planId: string; runId: string; version: number | undefined;
  events: readonly ProjectedRunEvent[]; onOpenGate: (gate: string) => void;
  /** The work items the run holds for the person's decision; their cards say so. */
  waitingWorkItems?: ReadonlySet<string> }) {
  return <ExecutionMapAreaRun key={`${props.planId}/${props.runId}`} {...props} />;
}
