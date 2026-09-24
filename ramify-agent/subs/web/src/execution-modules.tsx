import { useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { ModuleTreeCanvas, type ModuleTreeCanvasNode } from 'ramify.ts/module-tree';
import type { ExecutionElementKey } from '../../harness/src/interfaces/protocol/execution-map.js';
import type { ExecutionMapSnapshot } from './execution-map-client.js';
import { executionMapVisualTokens } from './execution-map-tokens.js';

type ModuleMap = ExecutionMapSnapshot['moduleMap'];
type ModuleRow = ModuleMap['modules'][number] | ModuleMap['outsideTree'][number];
type Shell = { id: string; parent: string | null; placement: 'current' | 'outside' | 'proposed'; row?: ModuleRow };

/** Only a current tree row can establish a hierarchy; recorded exceptions remain visible as shells. */
function shellsOf(map: ModuleMap): Shell[] {
  const shells = new Map<string, Shell>();
  for (const row of map.modules) shells.set(row.module, { id: row.module, parent: row.parent, placement: 'current', row });
  for (const row of map.outsideTree) if (!shells.has(row.module))
    shells.set(row.module, { id: row.module, parent: null, placement: 'outside', row });
  for (const proposed of map.proposed) {
    const prior = shells.get(proposed.module);
    if (prior?.placement === 'current') continue;
    shells.set(proposed.module, { id: proposed.module, parent: proposed.parent,
      placement: 'proposed', row: prior?.row });
  }
  return [...shells.values()].map(shell => ({ ...shell,
    parent: shell.parent !== shell.id && shell.parent !== null && shells.has(shell.parent) ? shell.parent : null }));
}

/** One symmetric run-wide scale makes additions and deletions comparable across modules. */
export function lineScaleOf(map: ModuleMap): number {
  return Math.max(1, ...[...map.modules, ...map.outsideTree].flatMap(row =>
    row.lines.coverage === 'unavailable' ? [] : [row.lines.totals.added, row.lines.totals.deleted]));
}

function CapturedLines({ lines, scale }: { lines: ModuleMap['lines']; scale: number }) {
  if (lines.coverage === 'unavailable') return <small className="execution-module-lines">Captured writer changes unavailable</small>;
  const partial = lines.coverage === 'partial' || lines.coverage === 'pending';
  return <span className={`execution-module-lines${partial ? ' execution-module-lines-partial' : ''}`}>
    <small>Captured writer changes: +{lines.totals.added} / −{lines.totals.deleted}{partial ? ` · ${lines.coverage} subtotal` : ''}</small>
    <span className="execution-line-bars" aria-hidden="true">
      <i className="execution-line-negative"><b style={{ width: `${lines.totals.deleted / scale * 100}%` }} /></i>
      <i className="execution-line-positive"><b style={{ width: `${lines.totals.added / scale * 100}%` }} /></i>
    </span>
  </span>;
}

export interface ExecutionModulesProps {
  map: ExecutionMapSnapshot;
  selectedModule: string | null;
  highlightedModules: ReadonlySet<string>;
  onSelectModule(module: string | null): void;
  directMatches: ReadonlySet<ExecutionElementKey>;
  hiddenMatches: ReadonlySet<ExecutionElementKey>;
  onJump(key: ExecutionElementKey): void;
}

export function ExecutionModules({ map, selectedModule, highlightedModules, onSelectModule,
  directMatches, hiddenMatches, onJump }: ExecutionModulesProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const shells = useMemo(() => shellsOf(map.moduleMap), [map.moduleMap]);
  const byId = useMemo(() => new Map(shells.map(shell => [shell.id, shell])), [shells]);
  const scale = useMemo(() => lineScaleOf(map.moduleMap), [map.moduleMap]);
  const nodes = useMemo<ModuleTreeCanvasNode[]>(() => shells.map(shell => ({
    id: shell.id, name: shell.id.split('/').at(-1) ?? shell.id, parent: shell.parent,
    children: shells.filter(child => child.parent === shell.id).map(child => child.id),
    color: shell.row?.workedIn ? executionMapVisualTokens.light.participation : '#94a3b8',
    width: 205, height: 105, emphasis: shell.placement === 'proposed' ? 'provisional' : 'normal',
  })), [shells]);
  const row = selectedModule ? byId.get(selectedModule)?.row : undefined;
  const selectedShell = selectedModule ? byId.get(selectedModule) : undefined;
  const direct = [...directMatches].map(key => map.nodes.find(node => node.key === key)).filter(node => node !== undefined);
  const toggle = (id: string) => setCollapsed(old => {
    const next = new Set(old);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const renderBody = (node: ModuleTreeCanvasNode) => {
    const shell = byId.get(node.id)!;
    const summary = shell.row?.lines;
    return <><strong className="execution-module-name">{node.name}</strong>
      <small>{shell.placement === 'proposed' ? 'Proposed module' : shell.placement === 'outside' ? 'Outside current tree' :
        shell.row?.workedIn ? 'Worked in · direct' : shell.row && 'involvedDescendants' in shell.row && shell.row.involvedDescendants > 0
          ? `${shell.row.involvedDescendants} involved descendant${shell.row.involvedDescendants === 1 ? '' : 's'}` : 'No recorded direct work'}</small>
      {summary && <CapturedLines lines={summary} scale={scale} />}</>;
  };
  const ariaLabelOf = (node: ModuleTreeCanvasNode) => {
    const shell = byId.get(node.id)!;
    return `${node.id}, ${shell.placement === 'proposed' ? 'proposed module' : shell.placement === 'outside' ? 'outside current tree' : 'current module'}, ` +
      `${shell.row?.workedIn ? 'worked in directly' : 'no direct work'}` +
      `${shell.row && 'involvedDescendants' in shell.row && typeof shell.row.involvedDescendants === 'number' && shell.row.involvedDescendants > 0 ? `, ${shell.row.involvedDescendants} involved descendants` : ''}`;
  };
  return <section className="execution-modules" aria-label="Companion modules map">
    <header className="execution-modules-header"><h3>Modules map</h3>
      <button className="execution-modules-toggle" type="button" aria-expanded={drawerOpen} aria-controls="execution-modules-panel"
        onClick={() => setDrawerOpen(value => !value)}>{drawerOpen ? 'Close modules' : 'Open modules'}</button></header>
    <div id="execution-modules-panel" className={`execution-modules-panel${drawerOpen ? ' is-open' : ''}`}>
      <p className="muted">Violet: worked in directly. Gray: no direct work. Bars show captured writer changes on one run-wide scale.</p>
      {map.tree.status === 'unavailable' ? <><p role="status">Current module tree unavailable: {map.tree.message}. Module relations are still listed on execution cards.</p>
          {map.moduleMap.proposed.length > 0 && <ul aria-label="Proposed modules">{map.moduleMap.proposed.map(item =>
            <li key={item.module}><code>{item.module}</code> proposed under <code>{item.parent}</code></li>)}</ul>}</>
        : nodes.length === 0 ? <p>No modules in the current tree.</p>
          : <div className="execution-modules-viewport" aria-label="Zoomable modules canvas"><ReactFlowProvider>
            <ModuleTreeCanvas nodes={nodes} selectedNodeId={selectedModule} highlightedNodeIds={highlightedModules}
              collapsedNodeIds={collapsed} ariaLabel="Current modules hierarchy" renderNodeBody={renderBody} ariaLabelOf={ariaLabelOf}
              onSelectNode={onSelectModule} onToggleCollapsed={toggle} />
          </ReactFlowProvider></div>}
      {selectedShell && <section className="execution-module-detail" aria-label={`Details for module ${selectedShell.id}`}>
        <h4><code>{selectedShell.id}</code></h4><p>{selectedShell.placement === 'current' ? 'Current tree' : selectedShell.placement === 'proposed' ? 'Proposed module' : 'Outside current tree'}.
          {row?.workedIn ? ' Recorded direct work.' : ' No recorded direct work.'}
          {row && 'involvedDescendants' in row && typeof row.involvedDescendants === 'number' && row.involvedDescendants > 0 ? ` ${row.involvedDescendants} involved descendants.` : ''}</p>
        {row && <><CapturedLines lines={row.lines} scale={scale} />
          {row.lines.gaps.length > 0 && <p>Coverage gaps: {row.lines.gaps.join('; ')}</p>}
          {row.lines.binary.paths > 0 && <p>{row.lines.binary.paths} binary path{row.lines.binary.paths === 1 ? '' : 's'} captured without line counts.</p>}
          <p>Direct relations: {row.direct.length ? row.direct.map(relation => `${relation.element} (${relation.role})`).join('; ') : 'none'}.</p></>}
        <p>{directMatches.size} directly related execution node{directMatches.size === 1 ? '' : 's'}; {hiddenMatches.size} hidden in collapsed branches.</p>
        {direct.length > 0 && <ul aria-label="Direct execution matches">{direct.map(node => <li key={node.key}>
          <button type="button" onClick={() => onJump(node.key)}>{node.label} · {node.kind}{hiddenMatches.has(node.key) ? ' · hidden; reveal' : ''}</button>
        </li>)}</ul>}
      </section>}
      {map.moduleMap.unplaced.length > 0 && <section aria-label="Unplaced work"><h4>Unplaced work</h4><ul>{map.moduleMap.unplaced.map(item =>
        <li key={item.element}><button type="button" onClick={() => onJump(item.element)}>{item.element}</button> · {item.reason}</li>)}</ul></section>}
      {map.moduleMap.unmapped.coverage !== 'unavailable' && (map.moduleMap.unmapped.totals.textPaths > 0 || map.moduleMap.unmapped.binary.paths > 0) &&
        <p>Unmapped captured changes: +{map.moduleMap.unmapped.totals.added} / −{map.moduleMap.unmapped.totals.deleted}; {map.moduleMap.unmapped.binary.paths} binary paths.</p>}
    </div>
  </section>;
}
