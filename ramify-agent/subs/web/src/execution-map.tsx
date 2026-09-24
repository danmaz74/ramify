import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type Node, type NodeProps, type Viewport } from '@xyflow/react';
import type { ExecutionNode } from '../../harness/src/interfaces/protocol/execution-map.js';
import type { ProjectedRunEvent } from '../../harness/src/interfaces/protocol/runs.js';
import type { Role } from '../../harness/src/interfaces/protocol/runs.js';
import type { ProtocolClient } from './client.js';
import type { ExecutionMapSnapshot } from './execution-map-client.js';
import { executionLayout, runBandKey } from './execution-map-layout.js';
import { executionMapVisualTokens as tokens } from './execution-map-tokens.js';
import { sessionHref } from './routes.js';
import { useQuery } from './use-query.js';

type CardData = { node: ExecutionNode | null; collapsed: boolean; hiddenCount: number; active: boolean;
  selected: boolean; hasChildren: boolean; repairFrom: string | null; onSelect: (key: string) => void; onToggle: (key: string) => void };
type CardNode = Node<CardData, 'execution'>;
const statusColor = tokens.light.status;

/** Small line icons use the same role identity on cards, shelf and event rail. */
function RoleIcon({ role }: { role: Role }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  if (role === 'initial-architect') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>;
  if (role === 'global-fork') return <svg {...common}><circle cx="6" cy="5" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><path d="M6 7v3c0 3 6 2 6 7M18 7v3c0 3-6 2-6 7" /></svg>;
  if (role === 'local-architect') return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>;
  if (role === 'engineer') return <svg {...common}><path d="M14 4a6 6 0 0 0-6 7L3 16l5 5 5-5a6 6 0 0 0 7-7l-4 4-4-4z" /></svg>;
  return <svg {...common}><path d="M10 14a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-2 2M14 10a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l2-2" /></svg>;
}

function nodeStatus(node: ExecutionNode): keyof typeof statusColor {
  switch (node.kind) {
    case 'capability': return node.state === 'completed' ? 'completed' : node.state === 'working' ? 'working' : 'todo';
    case 'scenario': return node.state === 'implemented' && node.latestRealResult === 'passed' ? 'completed'
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

function moduleText(node: ExecutionNode): string {
  if (node.kind === 'capability') return node.owner ?? 'module unavailable';
  if (node.kind === 'work-item' || node.kind === 'iteration') return node.module ?? 'module unavailable';
  if (node.kind === 'session' && node.reach.kind === 'work-item') return node.reach.module ?? 'module unavailable';
  return node.modules.length ? node.modules.map(relation => `${relation.module} (${relation.role})`).join(', ') : 'run-wide or module unavailable';
}

function ScenarioSummary({ node, collapsed }: { node: Extract<ExecutionNode, { kind: 'capability' }>; collapsed: boolean }) {
  const s = node.scenarios;
  const parts = [s.passed, s.failed, s.other, s.noRealRun, s.unavailable];
  const labels = ['passed', 'failed', 'other', 'no real run', 'unavailable'];
  const colors = ['completed', 'failed', 'attention', 'todo', 'todo'] as const;
  const known = s.coverage.state === 'unavailable' ? 0 : s.coverage.known;
  return <div className="execution-scenario-summary" aria-label={`Scenarios ${countText(s.coverage)}`}>
    {collapsed && known <= 20 ? <div className="execution-dots" aria-hidden="true">{parts.flatMap((count, i) =>
      Array.from({ length: count }, (_, j) => <i key={`${i}-${j}`} style={{ backgroundColor: statusColor[colors[i]!] }} />))}</div>
      : <div className="execution-segments" aria-hidden="true">{parts.map((count, i) => count > 0 &&
        <i key={i} style={{ width: `${known ? count / known * 100 : 0}%`, backgroundColor: statusColor[colors[i]!] }} />)}</div>}
    <small>{labels.map((label, i) => `${parts[i]} ${label}`).join(' · ')}; {countText(s.coverage)}</small>
  </div>;
}

function ExecutionCard({ data }: NodeProps<CardNode>) {
  const { node, collapsed, hiddenCount, active, selected, hasChildren, repairFrom, onSelect, onToggle } = data;
  if (node === null) return <div className="execution-card execution-run-band"><strong>Run band</strong><small>Initial architecture, integration and run-wide evidence</small><Handle type="source" position={Position.Right} isConnectable={false} /></div>;
  const role = node.kind === 'session' ? tokens.roleIdentity[node.role] : null;
  const roleAccent = node.kind === 'session' ? tokens.light.role[node.role] : null;
  const label = `${node.label}, ${node.kind}${node.kind === 'session' ? `, ${role!.label}, ${node.state}` : ''}`;
  const status = nodeStatus(node);
  return <div className={`execution-card execution-${node.kind} execution-state-${status}${active ? ' execution-live' : ''}${selected ? ' execution-selected' : ''}`}
    style={{ borderColor: statusColor[status], borderLeftColor: roleAccent ?? statusColor[status], color: statusColor[status] }}>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <button type="button" className="execution-card-main nodrag nopan" onClick={() => onSelect(node.key)} aria-label={label}
      aria-pressed={selected}>
      <small className={roleAccent ? 'execution-role-label' : undefined} style={roleAccent ? { color: roleAccent } : undefined}>{node.kind === 'session' ? <><RoleIcon role={node.role} /> {role!.label}</> : node.kind.replace('-', ' ')}</small>
      {node.kind === 'gate' ? <span className={`execution-gate-mark audit-${node.audit}`} aria-label={`Verdict ${node.verdict ?? 'running'}; audit ${node.audit}`}>
        {node.verdict === 'passed' ? '✓' : node.verdict === 'failed' ? '✗' : node.verdict === null ? '…' : '?'}</span> : null}
      <strong>{node.label}</strong>
      <small>{moduleText(node)}</small>
      {node.kind === 'session' && node.role === 'local-architect' && <small>Local architect lane · {node.invocations.length} invocation{node.invocations.length === 1 ? '' : 's'} across the work item</small>}
      {node.kind === 'iteration' && <small>Iteration {node.ordinal} · outline {node.outlineRevision} · {node.outcome ?? node.state}</small>}
      {node.kind === 'requirement' && <small>{node.state} · provider {node.providerStage} · revision {node.currentRevision}</small>}
      {node.kind === 'contract' && <small>{node.mode} · revision {node.revision} · {node.state}</small>}
      {node.kind === 'scenario' && <small>{node.latestRealResult} · {node.state}</small>}
      {node.kind === 'capability' && <><small>{node.state} · {node.reason}</small><ScenarioSummary node={node} collapsed={collapsed} />
        {!collapsed && <small>Requirements: {node.directRequirements.verified} verified of {countText(node.directRequirements.coverage)} direct current-revision requirements</small>}</>}
      {node.kind === 'gate' && <small>{repairFrom ? `${repairFrom} → ${node.verdict === 'passed' ? '✓' : node.verdict === 'failed' ? '✗' : '?'} · ` : ''}${node.checkpoint} · round {node.repairRound} · audit {node.audit}</small>}
    </button>
    {hasChildren && <button type="button" className="execution-expand nodrag nopan" onClick={() => onToggle(node.key)}
      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.label}`} aria-expanded={!collapsed}>{collapsed ? `▸ ${hiddenCount} inside` : '▾'}</button>}
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </div>;
}
const nodeTypes = { execution: ExecutionCard };

function Detail({ node, map, client, planId, runId, onOpenGate }: { node: ExecutionNode | undefined; map: ExecutionMapSnapshot;
  client: ProtocolClient; planId: string; runId: string; onOpenGate: (gate: string) => void }) {
  const key = node?.key ?? '';
  const capability = useQuery(`capability-detail:${runId}:${map.runVersion}:${key}`, () =>
    node?.kind === 'capability' ? client.getExecutionCapability(planId, runId, key.slice('capability:'.length), map.runVersion) : Promise.resolve(null));
  const scenario = useQuery(`scenario-detail:${runId}:${map.runVersion}:${key}`, () =>
    node?.kind === 'scenario' ? client.getExecutionScenario(planId, runId, key.slice('scenario:'.length), map.runVersion) : Promise.resolve(null));
  const gate = useQuery(`gate-detail:${runId}:${map.runVersion}:${key}`, () =>
    node?.kind === 'gate' && !node.active ? client.getGate(planId, runId, key.slice('gate:'.length)) : Promise.resolve(null));
  if (!node) return <p className="muted">Select a map card, scenario name, session or gate for its recorded detail.</p>;
  return <section className="execution-detail" aria-label={`Details for ${node.label}`}>
    <h3>{node.label}</h3><p><code>{node.key}</code> · {node.kind}</p>
    {node.modules.length > 0 && <p>Modules: {node.modules.map(relation => `${relation.module} (${relation.role})`).join('; ')}</p>}
    {node.kind === 'capability' && <><p>{node.reason}</p><p>Scenarios {countText(node.scenarios.coverage)}; requirements {node.directRequirements.verified} verified of {countText(node.directRequirements.coverage)} direct current-revision requirements.</p>
      {capability.state.status === 'ready' && capability.state.data && (capability.state.data.detail.state === 'available'
        ? <p>{capability.state.data.detail.description}</p> : <p>Full description unavailable: {capability.state.data.detail.reason}</p>)}
      {capability.state.status === 'failed' && <p role="alert">Could not read description: {capability.state.error.message}</p>}</>}
    {node.kind === 'scenario' && <><p>Latest real result: {node.latestRealResult}; lifecycle: {node.state}.</p>
      {scenario.state.status === 'ready' && scenario.state.data && (scenario.state.data.detail.state === 'available'
        ? <><pre>{scenario.state.data.detail.source.join('\n')}</pre><h4>Result history</h4>
          {scenario.state.data.detail.gates.length ? <ol>{scenario.state.data.detail.gates.map((g, i) => <li key={`${g.gate}:${i}`}>{g.gate}: {g.status}{g.dryRun ? ' (dry run)' : ''}; gate {g.verdict}; {g.checkpoint}</li>)}</ol>
            : <p>No recorded gate result.</p>}</> : <p>Full scenario unavailable: {scenario.state.data.detail.reason}</p>)}
      {scenario.state.status === 'failed' && <p role="alert">Could not read scenario: {scenario.state.error.message}</p>}</>}
    {node.kind === 'gate' && <><p>Verdict {node.verdict ?? 'running'}; audit {node.audit}; round {node.repairRound}; cause {node.cause ?? 'none'}.</p>
      {node.active ? <p>The gate is running; its full check result will be available when this attempt settles.</p>
        : <button type="button" onClick={() => onOpenGate(node.key.slice('gate:'.length))}>Open full check and audit detail</button>}
      {gate.state.status === 'ready' && gate.state.data && <><p>Attempt commit {gate.state.data.commit ?? 'none'}; audited commit {gate.state.data.audited ?? 'none'}; audit evidence {gate.state.data.evidence?.runRef ?? 'not published'}.</p>
        {gate.state.data.commands.map((command, i) => <div key={i} className="command"><p>{command.kind}: {command.outcome}; exit {command.exitCode ?? 'none'}; {command.elapsedMs} ms.</p>
          <pre aria-label={`Output tail of ${command.kind}`}>{command.output.tail}</pre></div>)}</>}
      {gate.state.status === 'failed' && <p role="alert">Could not read gate: {gate.state.error.message}</p>}</>}
    {node.kind === 'session' && <a href={sessionHref({ source: 'run', planId, runId, session: key.slice('session:'.length) })}>Read transcript of {node.label}</a>}
    {node.kind === 'work-item' && <><p>{node.goal}</p><p>Module: {node.module ?? 'unavailable'}</p></>}
    {node.kind === 'requirement' && <p>Current revision {node.currentRevision}; verification {node.state}; provider {node.providerStage}; previous verified revision {node.verifiedRevision ?? 'none'}.</p>}
    {node.kind === 'iteration' && <p>Iteration {node.ordinal} of {node.workItem}, outline {node.outlineRevision}; {node.state}, {node.outcome ?? 'no outcome'}.</p>}
    <p className="muted">Sources: {node.sourceRefs.map(ref => `${ref.kind} ${ref.id}${ref.sequence ? ` at event ${ref.sequence}` : ''}`).join('; ')}</p>
  </section>;
}

function Canvas({ map, events, client, planId, runId, onOpenGate, selected, onSelect,
  collapsed, onCollapsed, positions, onPositions, viewport, onViewport }: { map: ExecutionMapSnapshot; events: readonly ProjectedRunEvent[];
  client: ProtocolClient; planId: string; runId: string; onOpenGate: (gate: string) => void;
  selected: string | null; onSelect: (key: string | null) => void;
  collapsed: ReadonlySet<string>; onCollapsed: (keys: ReadonlySet<string>) => void;
  positions: ReadonlyMap<string, { x: number; y: number }>; onPositions: (positions: ReadonlyMap<string, { x: number; y: number }>) => void;
  viewport: Viewport; onViewport: (viewport: Viewport) => void }) {
  const flow = useReactFlow<CardNode, Edge>();
  const layout = useMemo(() => executionLayout(map.nodes, map.links, collapsed), [map.nodes, map.links, collapsed]);
  const allLayout = useMemo(() => executionLayout(map.nodes, map.links, new Set()), [map.nodes, map.links]);
  const allPlace = useMemo(() => new Map(allLayout.placements.map(p => [p.key, p])), [allLayout]);
  const hasChildren = useMemo(() => new Set(allLayout.placements.flatMap(p => p.parent ? [p.parent] : [])), [allLayout]);
  const byKey = useMemo(() => new Map(map.nodes.map(node => [node.key, node])), [map.nodes]);
  const place = useMemo(() => new Map(layout.placements.map(p => [p.key, p])), [layout]);
  const effectivePositions = useMemo(() => {
    const next = new Map(positions);
    for (const p of layout.placements) if (!next.has(p.key)) {
      let y = p.y;
      while ([...next.values()].some(other => Math.abs(other.x - p.x) < 200 && Math.abs(other.y - y) < 110)) y += 128;
      next.set(p.key, { x: p.x, y });
    }
    return next;
  }, [layout, positions]);
  useEffect(() => { if (effectivePositions.size > positions.size) onPositions(effectivePositions); }, [effectivePositions, positions, onPositions]);
  const toggle = (key: string) => { const next = new Set(collapsed); if (next.has(key)) next.delete(key); else next.add(key); onCollapsed(next); };
  const focus = (key: string) => {
    let parent = place.get(key)?.parent;
    if (!parent) parent = allPlace.get(key)?.parent;
    if (layout.hidden.has(key)) { const next = new Set(collapsed);
      while (parent && parent !== runBandKey) { next.delete(parent); parent = allPlace.get(parent)?.parent; } onCollapsed(next); }
    onSelect(key);
  };
  useEffect(() => {
    if (!selected) return;
    const p = place.get(selected);
    if (p && !layout.hidden.has(selected)) void flow.setCenter((effectivePositions.get(selected)?.x ?? p.x) + 120, (effectivePositions.get(selected)?.y ?? p.y) + 48, { zoom: Math.max(viewport.zoom, 0.8), duration: 300 });
  }, [selected, layout, place]);
  const active = new Set([map.current.awaitedSession, map.current.runningGate].filter((key): key is string => key !== null));
  const repairs = new Map(map.links.filter(l => l.kind === 'repair-of' && l.from.coverage !== 'unresolved' && l.to.coverage !== 'unresolved')
    .map(l => [l.from.key, l.to.key]));
  const nodes: CardNode[] = layout.placements.map(p => ({ id: p.key, type: 'execution', position: effectivePositions.get(p.key) ?? { x: p.x, y: p.y },
    data: { node: byKey.get(p.key) ?? null, collapsed: collapsed.has(p.key), hiddenCount: layout.hiddenCount.get(p.key) ?? 0,
      active: active.has(p.key), selected: selected === p.key,
      hasChildren: hasChildren.has(p.key),
      repairFrom: (() => { const prior = byKey.get(repairs.get(p.key) ?? ''); return prior?.kind === 'gate' ? prior.verdict === 'failed' ? '✗' : prior.verdict === 'passed' ? '✓' : '?' : null; })(),
      onSelect: focus, onToggle: toggle }, draggable: false, selectable: false }));
  const visible = new Set(nodes.map(node => node.id));
  const edges: Edge[] = [];
  for (const p of layout.placements) if (p.parent && visible.has(p.parent)) edges.push({ id: `parent:${p.key}`, source: p.parent, target: p.key, type: 'smoothstep', selectable: false });
  for (const link of layout.references) if (link.from.coverage !== 'unresolved' && link.to.coverage !== 'unresolved' && visible.has(link.from.key) && visible.has(link.to.key)) {
    edges.push({ id: link.id, source: link.from.key, target: link.to.key, type: 'smoothstep', label: link.kind,
      style: { strokeDasharray: '4 4', stroke: link.kind === 'repair-of' ? statusColor.failed : '#64748b' }, selectable: false });
  }
  const focusNow = () => { const target = map.current.runningGate ?? map.current.awaitedSession; if (target) focus(target); };
  const selectedNode = selected ? byKey.get(selected) : undefined;
  const selectedSequences = new Set(selectedNode?.sourceRefs.flatMap(ref => ref.sequence === null ? [] : [ref.sequence]) ?? []);
  return <div className="execution-area area-wide" aria-label="Execution map">
    <header className="execution-heading"><h2>Execution map</h2><div className="execution-actions">
      <button type="button" onClick={focusNow} disabled={!map.current.runningGate && !map.current.awaitedSession}>Now</button>
      <button type="button" onClick={() => void flow.fitView({ padding: 0.15 })}>Fit</button>
      <button type="button" onClick={() => { onPositions(new Map(layout.placements.map(p => [p.key, { x: p.x, y: p.y }]))); void flow.fitView({ padding: 0.15 }); }}>Relayout</button>
    </div></header>
    <p className="muted">Version {map.runVersion}{map.freshness === 'stale' ? ' · stale connection' : ''}; nodes {map.coverage.nodes.shown} / {map.coverage.nodes.total}, links {map.coverage.links.shown} / {map.coverage.links.total}, {map.tree.status === 'available' ? `modules ${map.coverage.modules.shown} / ${map.coverage.modules.total}` : `recorded module rows ${map.coverage.modules.shown} / ${map.coverage.modules.total} (hierarchy unavailable)`}.
      {map.links.filter(link => link.from.coverage === 'unresolved' || link.to.coverage === 'unresolved').length > 0 &&
        ` Unresolved references: ${map.links.filter(link => link.from.coverage === 'unresolved' || link.to.coverage === 'unresolved').length}.`}
      {map.coverage.gaps.length > 0 && ` Coverage gaps: ${map.coverage.gaps.join('; ')}.`}
      {map.tree.status === 'unavailable' && ` Module tree unavailable: ${map.tree.message}.`}</p>
    <div className="execution-workspace"><div className="execution-viewport" aria-label="Zoomable execution canvas">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} viewport={viewport} onMove={(_, next) => onViewport(next)}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} deleteKeyCode={null} fitView minZoom={0.2} maxZoom={2}>
        <Background /><Controls showInteractive={false} />
      </ReactFlow></div>
      <aside className="execution-side"><Detail node={selectedNode} map={map} client={client} planId={planId} runId={runId} onOpenGate={onOpenGate} />
        <section aria-label="All sessions"><h3>All sessions ({map.nodes.filter(n => n.kind === 'session').length})</h3><ul>{map.nodes.filter(n => n.kind === 'session').map(n => n.kind === 'session' &&
          <li key={n.key}><button type="button" onClick={() => focus(n.key)}><span className="execution-role-label" style={{ color: tokens.light.role[n.role] }}><RoleIcon role={n.role} /> {tokens.roleIdentity[n.role].label}</span> · {n.label} · {n.state} · {n.workItem ?? n.reach.kind} · {moduleText(n)}</button>
            {' '}<a href={sessionHref({ source: 'run', planId, runId, session: n.key.slice('session:'.length) })}>Transcript</a></li>)}</ul></section>
        <section aria-label="All gates"><h3>All gates ({map.nodes.filter(n => n.kind === 'gate').length})</h3><ul>{map.nodes.filter(n => n.kind === 'gate').map(n => n.kind === 'gate' &&
          <li key={n.key}><button type="button" onClick={() => focus(n.key)}>{n.label} · {n.checkpoint} · {n.subject.workItem ?? 'run-wide'}{n.subject.iteration ? ` / ${n.subject.iteration}` : ''} · {n.verdict ?? 'running'} · audit {n.audit} · round {n.repairRound}</button></li>)}</ul></section>
        <section aria-label="References"><h3>References</h3><ul>{layout.references.filter(l => l.kind === 'provider-for' || l.kind === 'depends-on' || l.from.coverage === 'unresolved' || l.to.coverage === 'unresolved').map(l =>
          <li key={l.id}>{l.kind}: {l.from.key} → {l.to.key}{l.from.coverage === 'unresolved' || l.to.coverage === 'unresolved' ? ' · unresolved' : ' · shared or cycle reference'}</li>)}</ul></section>
      </aside></div>
    <section className="execution-rail" aria-label="Event order"><h3>Event order</h3><ol>{events.map(event => {
      const session = event.refs.filter(ref => ref.kind === 'session').map(ref => byKey.get(`session:${ref.id}`)).find(node => node?.kind === 'session');
      const role = session?.kind === 'session' ? session.role : null;
      return <li key={event.sequence} className={selectedSequences.has(event.sequence) || event.refs.some(ref => `${ref.kind}:${ref.id}` === selected) ? 'execution-event-selected' : ''}>
        <button type="button" onClick={() => { const target = event.refs.map(ref => `${ref.kind}:${ref.id}`).find(key => byKey.has(key)); if (target) focus(target); }}>
          <span>{event.sequence}</span> <time dateTime={event.at}>{event.at.slice(11, 19)}</time> {role && <span className="execution-role-label" style={{ color: tokens.light.role[role] }}> <RoleIcon role={role} /> {tokens.roleIdentity[role].label}</span>} {event.summary}
        </button></li>;
    })}</ol></section>
  </div>;
}

export function ExecutionMapArea({ client, planId, runId, version, events, onOpenGate }: { client: ProtocolClient; planId: string; runId: string;
  version: number | undefined; events: readonly ProjectedRunEvent[]; onOpenGate: (gate: string) => void }) {
  const [selected, onSelect] = useState<string | null>(null);
  const [collapsed, onCollapsed] = useState<ReadonlySet<string> | null>(null);
  const [positions, onPositions] = useState<ReadonlyMap<string, { x: number; y: number }>>(new Map());
  const [viewport, onViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const query = useQuery(`execution-map:${planId}:${runId}:${version ?? 'pending'}`, () => client.getExecutionMap(planId, runId));
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
  if (version === undefined) return <p>Loading the run…</p>;
  if (query.state.status === 'loading') return <p>Loading execution map…</p>;
  if (query.state.status === 'failed') return <p role="alert">Could not load execution map: {query.state.error.message}</p>;
  return <ReactFlowProvider><Canvas map={query.state.data} events={events} client={client} planId={planId} runId={runId} onOpenGate={onOpenGate}
    selected={selected} onSelect={onSelect} collapsed={collapsed ?? initialCollapse} onCollapsed={onCollapsed}
    positions={positions} onPositions={onPositions} viewport={viewport} onViewport={onViewport} /></ReactFlowProvider>;
}
