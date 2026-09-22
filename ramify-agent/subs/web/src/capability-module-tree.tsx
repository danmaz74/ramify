import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ModuleTreeCanvas, type ModuleTreeCanvasEmphasis, type ModuleTreeCanvasNode } from 'ramify.ts/module-tree';
import type {
  ComparisonCoverage, InitialAssociation, InitialRole, ModuleCapabilities, ModuleCapabilityComparisonResponse, ModuleCapabilityRow,
} from '../../harness/src/interfaces/protocol/runs.js';

/*
 * Progress → By module: the harness's module-capability comparison drawn in
 * Ramify's packaged module-tree canvas. Every returned capability row is
 * listed in its module node with two independent indications: Initial, the
 * revision-1 roles that associated it with the module, and Implemented, the
 * current verified progress owned there. The harness decides where each
 * module is drawn; this view maps its answer to canvas nodes and sizes each
 * node so that every row is visible.
 */

/** What is selected: one capability row of a module, or a module shell. */
export type ModuleCapabilitySelection =
  | { readonly kind: 'row'; readonly module: string; readonly capability: string }
  | { readonly kind: 'module'; readonly module: string };

export interface CapabilityModuleTreeProps {
  readonly comparison: ModuleCapabilityComparisonResponse;
  readonly selection: ModuleCapabilitySelection | null;
  readonly onSelect: (selection: ModuleCapabilitySelection | null) => void;
}

// Node geometry. The canvas shell is border-box with 6 px padding and a 1 px
// border, so a node's height is this chrome plus its header and rows.
const shellChrome = 14;
const headerHeight = 18;
const proposedHeight = 16;
const rowsTop = 4;
export const rowHeight = 36;
const rowGap = 3;
const minimumHeight = 64;
const minimumWidth = 200;
const horizontalChrome = 16 + 20;
/** Generous per-character widths, so that text never needs truncation. */
const nameCharacter = 8;
const idCharacter = 7.5;
const markCharacter = 6.5;

const roleLabels: Record<InitialRole, string> = {
  'entry-owner': 'entry owner',
  'suggested-owner': 'suggested owner',
  involved: 'involved',
};

function leaf(module: string): string {
  return module.slice(module.lastIndexOf('/') + 1);
}

/** The distinct role labels of a row's initial associations, in their returned order. */
function roleText(initial: readonly InitialAssociation[]): string {
  return [...new Set(initial.map(association => roleLabels[association.role]))].join(', ');
}

function marksText(row: ModuleCapabilityRow): string {
  return [row.initial.length > 0 ? `Initial: ${roleText(row.initial)}` : '', row.implementedHere ? 'Implemented' : '']
    .filter(Boolean).join('  ');
}

/** A node's height: its chrome, header, proposal label and every row. */
export function nodeHeight(entry: ModuleCapabilities): number {
  const rows = entry.capabilities.length;
  const content = headerHeight
    + (entry.proposedAtStart ? proposedHeight : 0)
    + (rows > 0 ? rowsTop + rows * rowHeight + (rows - 1) * rowGap : 0);
  return Math.max(minimumHeight, shellChrome + content);
}

function nodeWidth(entry: ModuleCapabilities): number {
  const widest = Math.max(
    leaf(entry.module).length * nameCharacter,
    entry.proposedAtStart ? 'proposed at start'.length * markCharacter : 0,
    ...entry.capabilities.map(row => Math.max(row.capability.length * idCharacter, marksText(row).length * markCharacter + 24)),
  );
  return Math.max(minimumWidth, Math.ceil(widest + horizontalChrome));
}

function emphasisOf(entry: ModuleCapabilities): ModuleTreeCanvasEmphasis {
  if (entry.placement === 'proposed') return 'provisional';
  return entry.capabilities.length === 0 ? 'muted' : 'normal';
}

/**
 * Canvas nodes for the modules the harness placed: a declared module under
 * its parent in the current tree, a proposed one under its recorded parent.
 * `unplaced` modules are not drawn.
 */
export function comparisonNodes(comparison: ModuleCapabilityComparisonResponse): ModuleTreeCanvasNode[] {
  if (comparison.tree.status !== 'available') return [];
  const treeParents = new Map(comparison.tree.modules.map(entry => [entry.module, entry.parent]));
  const placed = comparison.modules.filter(entry => entry.placement !== 'unplaced');
  const names = new Set(placed.map(entry => entry.module));
  const parentOf = (entry: ModuleCapabilities): string | null => {
    const parent = entry.placement === 'proposed' ? entry.proposedAtStart?.parent ?? null : treeParents.get(entry.module) ?? null;
    return parent !== null && names.has(parent) ? parent : null;
  };
  const parents = new Map(placed.map(entry => [entry.module, parentOf(entry)]));
  return placed.map(entry => ({
    id: entry.module,
    name: leaf(entry.module),
    parent: parents.get(entry.module)!,
    children: placed.filter(child => parents.get(child.module) === entry.module).map(child => child.module),
    color: entry.capabilities.some(row => row.implementedHere) ? '#2f7d4f' : entry.capabilities.length > 0 ? '#2f5fa7' : '#94a3b8',
    width: nodeWidth(entry),
    height: nodeHeight(entry),
    emphasis: emphasisOf(entry),
  }));
}

function CapabilityRowButton({ module, row, selected, onSelect }: {
  readonly module: string;
  readonly row: ModuleCapabilityRow;
  readonly selected: boolean;
  readonly onSelect: (selection: ModuleCapabilitySelection) => void;
}) {
  const select = () => onSelect({ kind: 'row', module, capability: row.capability });
  const keyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    select();
  };
  const label = [row.capability, row.initial.length > 0 ? `Initial: ${roleText(row.initial)}` : null, row.implementedHere ? 'Implemented' : null]
    .filter(Boolean).join(', ');
  return (
    <button type="button" className={selected ? 'capability-row capability-row-selected' : 'capability-row'} style={{ height: rowHeight }}
      aria-pressed={selected} aria-label={label} onClick={select} onKeyDown={keyDown}>
      <code className="capability-row-id">{row.capability}</code>
      <span className="capability-row-marks">
        {row.initial.length > 0 && <span className="capability-mark capability-mark-initial">Initial: {roleText(row.initial)}</span>}
        {row.implementedHere && <span className="capability-mark capability-mark-implemented">Implemented</span>}
      </span>
    </button>
  );
}

function RowList({ entry, selection, onSelect }: {
  readonly entry: ModuleCapabilities;
  readonly selection: ModuleCapabilitySelection | null;
  readonly onSelect: (selection: ModuleCapabilitySelection) => void;
}) {
  return (
    <div className="capability-rows" style={{ gap: rowGap, marginTop: rowsTop }}>
      {entry.capabilities.map(row => (
        <CapabilityRowButton key={row.capability} module={entry.module} row={row} onSelect={onSelect}
          selected={selection?.kind === 'row' && selection.module === entry.module && selection.capability === row.capability} />
      ))}
    </div>
  );
}

function ModuleBody({ entry, selection, onSelect }: {
  readonly entry: ModuleCapabilities;
  readonly selection: ModuleCapabilitySelection | null;
  readonly onSelect: (selection: ModuleCapabilitySelection) => void;
}) {
  return (
    <div className="capability-module">
      <span className="capability-module-name" title={entry.module} style={{ height: headerHeight }}>{leaf(entry.module)}</span>
      {entry.proposedAtStart && <span className="capability-module-proposed" style={{ height: proposedHeight }}>proposed at start</span>}
      {entry.capabilities.length > 0 && <RowList entry={entry} selection={selection} onSelect={onSelect} />}
    </div>
  );
}

function identityText(comparison: ModuleCapabilityComparisonResponse): { initial: string; tree: string } {
  const view = comparison.initialView;
  const initial = view === null ? 'none: the initial analysis is not available'
    : view.status === 'placeholder' ? 'the placeholder architect view (none was materialized before the run)'
      : `architect view revision ${view.revision}, input ${view.input}`;
  const tree = comparison.tree.status === 'available'
    ? `revision ${comparison.tree.revision}, input ${comparison.tree.input}`
    : `unavailable: ${comparison.tree.message}`;
  return { initial, tree };
}

function Coverage({ coverage }: { readonly coverage: ComparisonCoverage }) {
  if (coverage.state === 'complete') {
    return <p className="capability-coverage" aria-label="Coverage">Coverage complete: {coverage.implemented} of {coverage.capabilities} capabilities implemented.</p>;
  }
  if (coverage.state === 'unavailable') {
    return <p className="failure" role="alert" aria-label="Coverage">The comparison is unavailable: {coverage.reason}</p>;
  }
  return (
    <div className="capability-coverage capability-coverage-partial" aria-label="Coverage">
      <p><strong>Coverage partial.</strong> Only known subtotals are shown.</p>
      <dl className="facts">
        <div><dt>Known capabilities</dt><dd>{coverage.knownCapabilities}</dd></div>
        <div><dt>Known implemented</dt><dd>{coverage.knownImplemented}</dd></div>
        {coverage.totalCapabilities !== null && <div><dt>Capabilities in total</dt><dd>{coverage.totalCapabilities}</dd></div>}
      </dl>
      <p>Gaps:</p>
      <ul aria-label="Coverage gaps">{coverage.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
    </div>
  );
}

function RowDetail({ module, row }: { readonly module: string; readonly row: ModuleCapabilityRow }) {
  return (
    <section className="capability-module-detail" aria-label={`Details for ${row.capability} in ${module}`}>
      <h3><code>{row.capability}</code></h3>
      <p className="muted">In <code>{module}</code></p>
      <h4>Initial</h4>
      {row.initial.length === 0
        ? <p>No revision-1 association with this module.</p>
        : (
          <ul>
            {row.initial.map(association => (
              <li key={`${association.role}-${association.hypothesis ?? ''}`}>
                {roleLabels[association.role]}: {association.hypothesis === null ? 'entry assignment' : <>hypothesis <code>{association.hypothesis}</code></>}
              </li>
            ))}
          </ul>
        )}
      <h4>Implemented</h4>
      {row.implementedHere === null
        ? <p>Not implemented in this module now.</p>
        : (
          <>
            <p>Verified in this run: {row.implementedHere.reason}</p>
            {row.implementedHere.evidence.length > 0 && <div>Evidence: <ul className="inline-list" aria-label="Evidence">{row.implementedHere.evidence.map(item => <li key={item}><code>{item}</code></li>)}</ul></div>}
          </>
        )}
    </section>
  );
}

function placementText(entry: ModuleCapabilities): string {
  if (entry.placement === 'declared') return 'declared in the current module tree';
  if (entry.placement === 'proposed') return `not in the current module tree; placed under its recorded parent ${entry.proposedAtStart?.parent ?? ''}`;
  return 'not placed in the tree';
}

function ModuleDetail({ entry, onSelect }: { readonly entry: ModuleCapabilities; readonly onSelect: (selection: ModuleCapabilitySelection) => void }) {
  return (
    <section className="capability-module-detail" aria-label={`Details for module ${entry.module}`}>
      <h3><code>{entry.module}</code></h3>
      <p className="muted">Placement: {placementText(entry)}.</p>
      {entry.proposedAtStart && (
        <p>Proposed at start under <code>{entry.proposedAtStart.parent}</code>: {entry.proposedAtStart.purpose}
          {entry.proposedAtStart.tags.length > 0 && <> Tags: {entry.proposedAtStart.tags.join(', ')}.</>}</p>
      )}
      {entry.capabilities.length === 0
        ? <p>No capability is associated with or implemented in this module.</p>
        : (
          <ul aria-label={`Capabilities of ${entry.module}`}>
            {entry.capabilities.map(row => (
              <li key={row.capability}>
                <button type="button" className="link" onClick={() => onSelect({ kind: 'row', module: entry.module, capability: row.capability })}>{row.capability}</button>
                {row.initial.length > 0 && <span className="capability-mark capability-mark-initial">Initial: {roleText(row.initial)}</span>}
                {row.implementedHere && <span className="capability-mark capability-mark-implemented">Implemented</span>}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

function Detail({ comparison, selection, onSelect }: CapabilityModuleTreeProps) {
  const entry = selection ? comparison.modules.find(item => item.module === selection.module) : undefined;
  if (!selection || !entry) return <p className="muted">Select a capability row for its roles and evidence, or a module for its capability list.</p>;
  if (selection.kind === 'module') return <ModuleDetail entry={entry} onSelect={onSelect} />;
  const row = entry.capabilities.find(item => item.capability === selection.capability);
  return row ? <RowDetail module={entry.module} row={row} /> : <p className="muted">That capability is not in this answer.</p>;
}

/** The comparison's header, canvas, `unplaced` list and selected detail. */
export function CapabilityModuleTree({ comparison, selection, onSelect }: CapabilityModuleTreeProps) {
  const nodes = useMemo(() => comparisonNodes(comparison), [comparison]);
  const byModule = useMemo(() => new Map(comparison.modules.map(entry => [entry.module, entry])), [comparison]);
  const unplaced = comparison.modules.filter(entry => entry.placement === 'unplaced');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const identity = identityText(comparison);

  const selectRow = useCallback((next: ModuleCapabilitySelection) => onSelect(next), [onSelect]);
  const selectNode = useCallback((id: string | null) => onSelect(id === null ? null : { kind: 'module', module: id }), [onSelect]);
  const toggle = useCallback((id: string) => setCollapsed(current => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  }), []);
  const renderBody = useCallback((node: ModuleTreeCanvasNode): ReactNode => {
    const entry = byModule.get(node.id);
    return entry ? <ModuleBody entry={entry} selection={selection} onSelect={selectRow} /> : null;
  }, [byModule, selection, selectRow]);
  const ariaLabelOf = useCallback((node: ModuleTreeCanvasNode) => {
    const entry = byModule.get(node.id);
    const rows = entry?.capabilities.length ?? 0;
    return `${node.id}${entry?.proposedAtStart ? ', proposed at start' : ''}, ${rows === 0 ? 'no capability rows' : rows === 1 ? '1 capability row' : `${rows} capability rows`}`;
  }, [byModule]);

  if (comparison.coverage.state === 'unavailable') {
    return (
      <div className="capability-module-tree">
        <Coverage coverage={comparison.coverage} />
      </div>
    );
  }

  return (
    <div className="capability-module-tree">
      <header className="capability-module-header">
        <h2>Initial modules and implemented capabilities</h2>
        <p className="muted">Each row is one capability. Initial: the revision-1 analysis associated it with this module, in the role shown. Implemented: it is verified in this run and owned by this module now.</p>
        <dl className="facts" aria-label="Compared states">
          <div><dt>Initial analysis</dt><dd>{identity.initial}</dd></div>
          <div><dt>Current module tree</dt><dd>{identity.tree}</dd></div>
          <div><dt>Run version</dt><dd>{comparison.runVersion}</dd></div>
          <div><dt>Identity policy</dt><dd><code>{comparison.identityPolicy}</code></dd></div>
        </dl>
        <Coverage coverage={comparison.coverage} />
        <p className="capability-legend" aria-label="Legend">
          <span className="capability-mark capability-mark-initial">Initial: role</span> outlined
          <span className="capability-mark capability-mark-implemented">Implemented</span> filled
          <span>A dashed shell is a module proposed at start and absent from the tree; a faded shell has no capability rows.</span>
        </p>
      </header>
      <div className="capability-module-layout">
        {nodes.length > 0
          ? (
            <div className="capability-module-canvas">
              <ModuleTreeCanvas
                nodes={nodes}
                selectedNodeId={selection?.kind === 'module' ? selection.module : null}
                collapsedNodeIds={collapsed}
                ariaLabel="Modules with their capability rows"
                renderNodeBody={renderBody}
                ariaLabelOf={ariaLabelOf}
                onSelectNode={selectNode}
                onToggleCollapsed={toggle}
              />
            </div>
          )
          : <p className="muted capability-module-canvas-empty">No module is drawn: {comparison.tree.status === 'unavailable' ? comparison.tree.message : 'the tree holds no module.'}</p>}
        <aside className="capability-module-side">
          <section aria-label="Selected">
            <Detail comparison={comparison} selection={selection} onSelect={onSelect} />
          </section>
          {unplaced.length > 0 && (
            <section className="capability-unplaced" aria-label="Modules not placed in the tree">
              <h3>Not placed in the tree</h3>
              <p className="muted">The harness could not place these modules; their rows are listed here.</p>
              <ul>
                {unplaced.map(entry => (
                  <li key={entry.module}>
                    <button type="button" className="link" aria-pressed={selection?.kind === 'module' && selection.module === entry.module}
                      onClick={() => onSelect({ kind: 'module', module: entry.module })}>{entry.module}</button>
                    {entry.proposedAtStart && <span className="capability-module-proposed"> proposed at start</span>}
                    {entry.capabilities.length > 0 && <RowList entry={entry} selection={selection} onSelect={selectRow} />}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
