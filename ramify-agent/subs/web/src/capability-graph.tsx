import { useId, useMemo, useState } from 'react';
import type { CapabilityListResponse, CapabilityProgress } from '../../harness/src/interfaces/protocol/runs.js';
import type { RunSessionView } from '../../harness/src/interfaces/protocol/sessions.js';
import {
  capabilityOf, ElementSessions, marksText, RunSessionStrip, SessionMarks, SessionMarksLegend, sessionsBy, type DiagramSessions,
} from './session-marks.js';

/*
 * Progress → Dependencies: every capability the harness returned, once, with
 * arrows from each consumer to the capabilities it depends on. The harness
 * owns every displayed fact: the state is its literal `todo`, `working` or
 * `completed`, and the reason is its retained text, never read for meaning.
 * The browser owns only deterministic placement and selection. Columns are
 * dependency depth, not an execution order.
 */

const nodeWidth = 232;
const baseNodeHeight = 142;
const ownerCharactersPerLine = 24;
const ownerLineHeight = 18;
const columnGap = 88;
const rowGap = 28;
const horizontalPadding = 28;
const graphTop = 54;
const graphBottom = 24;
/** The room a cycle group keeps above its first member for its label. */
// Room above a cycle's first member for its label, which wraps to two lines at the node width.
const cycleHeader = 40;
const cyclePadding = 9;
/** The line every node keeps for its session marks when the graph is given the run's sessions, so a mark never moves a node. */
export const sessionMarksHeight = 24;

export interface CapabilityDependencyGraphProps {
  readonly capabilities: CapabilityListResponse['capabilities'];
  readonly total: CapabilityListResponse['total'];
  /** Opens one work item's history; without it, work items are listed as text. */
  readonly onOpenWorkItem?: ((workItem: string) => void) | undefined;
  /** The run's sessions: each node is marked with those that reach its capability. */
  readonly sessions?: DiagramSessions | undefined;
}

export interface CapabilityGraphNode {
  readonly capability: CapabilityProgress;
  readonly component: number;
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

export interface CapabilityGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly tentative: boolean;
}

/** Strongly connected capabilities: one group, drawn with its internal edges. */
export interface CapabilityGraphCycle {
  readonly component: number;
  readonly capabilities: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CapabilityGraphLayout {
  readonly nodes: readonly CapabilityGraphNode[];
  readonly edges: readonly CapabilityGraphEdge[];
  readonly cycles: readonly CapabilityGraphCycle[];
  /** Dependency targets absent from the response, in first-reference order; no node is made for them. */
  readonly omittedTargets: readonly string[];
  readonly columns: number;
  readonly width: number;
  readonly height: number;
}

/** The owner's label: a registered capability's module is its current owner; a forecast's is only suggested. */
export const ownerLabel = (capability: Pick<CapabilityProgress, 'tentative'>): string =>
  capability.tentative ? 'suggested owner' : 'current owner';

function nodeHeight(capability: CapabilityProgress, marksHeight: number): number {
  const segments = capability.owner.split('/').map((segment, index, all) => `${segment}${index < all.length - 1 ? '/' : ''}`);
  let ownerLines = 1;
  let lineLength = 0;
  for (const segment of segments) {
    const segmentLines = Math.max(1, Math.ceil(segment.length / ownerCharactersPerLine));
    if (lineLength > 0 && lineLength + segment.length > ownerCharactersPerLine) {
      ownerLines += 1;
      lineLength = 0;
    }
    ownerLines += segmentLines - 1;
    lineLength = segment.length % ownerCharactersPerLine;
  }
  return baseNodeHeight + (ownerLines - 1) * ownerLineHeight + marksHeight;
}

function ModulePath({ module }: { readonly module: string }) {
  const segments = module.split('/');
  return (
    <code>{segments.map((segment, index) => (
      <span key={`${index}:${segment}`}>{segment}{index < segments.length - 1 && <>/<wbr /></>}</span>
    ))}</code>
  );
}

/**
 * A deterministic layout of one response. Each capability's column is its
 * longest dependency depth from a capability nothing returned depends on, so
 * consumers are left of their dependencies and direct links may skip
 * columns. Strongly connected capabilities form one group in one column,
 * outlined with their internal edges, rather than an implied order.
 * `marksHeight` is added to every node, for its session marks.
 */
export function layoutCapabilityGraph(capabilities: readonly CapabilityProgress[], marksHeight = 0): CapabilityGraphLayout {
  const byId = new Map(capabilities.map(capability => [capability.capability, capability]));
  const order = new Map(capabilities.map((capability, index) => [capability.capability, index]));
  const dependencies = new Map(capabilities.map(capability => [
    capability.capability,
    [...new Set(capability.dependsOn.map(link => link.capability).filter(target => byId.has(target)))],
  ]));
  const omittedTargets = [...new Set(capabilities.flatMap(capability => capability.dependsOn.map(link => link.capability))
    .filter(target => !byId.has(target)))];

  // Tarjan's strongly connected components, visited in response order.
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const connect = (id: string): void => {
    const index = nextIndex++;
    indices.set(id, index);
    lowLinks.set(id, index);
    stack.push(id);
    onStack.add(id);

    for (const dependency of dependencies.get(id) ?? []) {
      if (!indices.has(dependency)) {
        connect(dependency);
        lowLinks.set(id, Math.min(lowLinks.get(id)!, lowLinks.get(dependency)!));
      } else if (onStack.has(dependency)) {
        lowLinks.set(id, Math.min(lowLinks.get(id)!, indices.get(dependency)!));
      }
    }

    if (lowLinks.get(id) !== indices.get(id)) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== id);
    component.sort((left, right) => order.get(left)! - order.get(right)!);
    components.push(component);
  };

  for (const capability of capabilities) {
    if (!indices.has(capability.capability)) connect(capability.capability);
  }

  const componentOf = new Map<string, number>();
  components.forEach((component, componentIndex) => {
    for (const id of component) componentOf.set(id, componentIndex);
  });

  const outgoing = components.map(() => new Set<number>());
  const incoming = components.map(() => 0);
  for (const [source, targets] of dependencies) {
    const sourceComponent = componentOf.get(source)!;
    for (const target of targets) {
      const targetComponent = componentOf.get(target)!;
      if (sourceComponent === targetComponent || outgoing[sourceComponent]!.has(targetComponent)) continue;
      outgoing[sourceComponent]!.add(targetComponent);
      incoming[targetComponent]! += 1;
    }
  }

  const firstIndex = components.map(component => Math.min(...component.map(id => order.get(id)!)));
  const componentOrder = (left: number, right: number): number => firstIndex[left]! - firstIndex[right]!;

  // Longest path over the condensation, which is acyclic.
  const queue = incoming.map((count, component) => ({ count, component }))
    .filter(({ count }) => count === 0).map(({ component }) => component).sort(componentOrder);
  const rank = components.map(() => 0);
  while (queue.length > 0) {
    const component = queue.shift()!;
    for (const dependency of [...outgoing[component]!].sort(componentOrder)) {
      rank[dependency] = Math.max(rank[dependency]!, rank[component]! + 1);
      incoming[dependency]! -= 1;
      if (incoming[dependency] === 0) {
        queue.push(dependency);
        queue.sort(componentOrder);
      }
    }
  }

  const columnCount = capabilities.length === 0 ? 0 : Math.max(...rank) + 1;
  const componentColumns = Array.from({ length: columnCount }, () => [] as number[]);
  for (let component = 0; component < components.length; component += 1) {
    componentColumns[rank[component]!]!.push(component);
  }
  for (const column of componentColumns) column.sort(componentOrder);

  const isCycle = (component: number): boolean =>
    components[component]!.length > 1 || components[component]!.some(id => dependencies.get(id)?.includes(id));

  const nodes: CapabilityGraphNode[] = [];
  const cycles: CapabilityGraphCycle[] = [];
  let greatestBottom = graphTop;
  componentColumns.forEach((column, columnIndex) => {
    let row = 0;
    let y = graphTop;
    const x = horizontalPadding + columnIndex * (nodeWidth + columnGap);
    for (const component of column) {
      const cycle = isCycle(component);
      const groupTop = y;
      if (cycle) y += cycleHeader;
      for (const id of components[component]!) {
        const capability = byId.get(id)!;
        const height = nodeHeight(capability, marksHeight);
        nodes.push({ capability, component, column: columnIndex, row, x, y, height });
        row += 1;
        y += height + rowGap;
      }
      if (cycle) {
        const lastBottom = y - rowGap;
        cycles.push({
          component,
          capabilities: components[component]!,
          x: x - cyclePadding,
          y: groupTop - cyclePadding,
          width: nodeWidth + 2 * cyclePadding,
          height: lastBottom - groupTop + 2 * cyclePadding,
        });
        y += cyclePadding;
      }
    }
    if (row > 0) greatestBottom = Math.max(greatestBottom, y - rowGap);
  });

  const edgeByPair = new Map<string, CapabilityGraphEdge>();
  for (const capability of capabilities) {
    for (const link of capability.dependsOn) {
      if (!byId.has(link.capability)) continue;
      const key = `${capability.capability}\u0000${link.capability}`;
      const previous = edgeByPair.get(key);
      edgeByPair.set(key, {
        from: capability.capability,
        to: link.capability,
        // If a response repeats an edge, a confirmed observation wins.
        tentative: (previous?.tentative ?? true) && link.tentative,
      });
    }
  }

  return {
    nodes,
    edges: [...edgeByPair.values()],
    cycles,
    omittedTargets,
    columns: columnCount,
    width: columnCount === 0 ? 0 : horizontalPadding * 2 + columnCount * nodeWidth + (columnCount - 1) * columnGap,
    height: capabilities.length === 0 ? 0 : greatestBottom + graphBottom,
  };
}

function edgePath(from: CapabilityGraphNode, to: CapabilityGraphNode): string {
  const fromX = from.x + nodeWidth;
  const fromY = from.y + from.height / 2;
  const toY = to.y + to.height / 2;
  if (from.column === to.column) {
    // Within a cycle group: loop out to the right and back.
    const outside = fromX + 36 + Math.abs(from.row - to.row) * 5;
    return `M ${fromX} ${fromY} C ${outside} ${fromY}, ${outside} ${toY}, ${to.x + nodeWidth} ${toY}`;
  }
  const toX = to.x;
  const middle = (fromX + toX) / 2;
  return `M ${fromX} ${fromY} C ${middle} ${fromY}, ${middle} ${toY}, ${toX} ${toY}`;
}

function nodeName(capability: CapabilityProgress, sessions: readonly RunSessionView[] | undefined): string {
  const marks = marksText(sessions);
  return `${capability.capability}, ${capability.state}${capability.entry ? ', entry' : ''}${capability.tentative ? ', forecast only' : ''}${marks ? `, sessions: ${marks}` : ''}`;
}

export function CapabilityDependencyGraph({ capabilities, total, onOpenWorkItem, sessions }: CapabilityDependencyGraphProps) {
  const marked = sessions !== undefined;
  const layout = useMemo(() => layoutCapabilityGraph(capabilities, marked ? sessionMarksHeight : 0), [capabilities, marked]);
  const byCapability = useMemo(() => sessionsBy(sessions?.sessions ?? [], capabilityOf), [sessions]);
  const drawn = new Set(capabilities.map(capability => capability.capability));
  const runLevel = (sessions?.sessions ?? []).filter(session => {
    const capability = capabilityOf(session.reaches);
    return capability === null || !drawn.has(capability);
  });
  const markerPrefix = useId().replaceAll(':', '');
  const confirmedMarker = `${markerPrefix}-confirmed-arrow`;
  const tentativeMarker = `${markerPrefix}-tentative-arrow`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = capabilities.find(capability => capability.capability === selectedId);
  const nodeById = new Map(layout.nodes.map(node => [node.capability.capability, node]));
  const omitted = new Set(layout.omittedTargets);
  const counts = {
    todo: capabilities.filter(capability => capability.state === 'todo').length,
    working: capabilities.filter(capability => capability.state === 'working').length,
    completed: capabilities.filter(capability => capability.state === 'completed').length,
  };
  const bounded = total > capabilities.length;

  const coverage = (bounded || omitted.size > 0) && (
    <div className="graph-coverage warn" role="status" aria-label="Response coverage">
      {bounded && (
        <p>
          Showing <strong>{capabilities.length} / {total}</strong> capabilities: the response is bounded, and the
          other {total - capabilities.length} are not in it. Every count here is of the returned set.
        </p>
      )}
      {omitted.size > 0 && (
        <>
          <p>Dependencies not in this response, shown as unavailable rather than as nodes:</p>
          <ul aria-label="Unavailable dependency targets">
            {layout.omittedTargets.map(target => <li key={target}><code>{target}</code></li>)}
          </ul>
        </>
      )}
    </div>
  );

  if (capabilities.length === 0) {
    return (
      <section className="panel capability-graph" aria-label="Capability dependency graph">
        <div className="capability-graph-header"><h2>Capability dependencies</h2></div>
        {coverage}
        {!bounded && <p className="empty" role="status">The run has no registered or forecast capability yet.</p>}
      </section>
    );
  }

  return (
    <section className="panel capability-graph" aria-labelledby="capability-graph-heading">
      <div className="capability-graph-header">
        <div>
          <h2 id="capability-graph-heading">Capability dependencies</h2>
          <p className="muted">
            Arrows run from a consumer to the capability it depends on. Columns are dependency depth, not an
            execution order. Select a capability for its reason, dependencies, work items and evidence.
          </p>
        </div>
        <div className="capability-counts-block">
          <p className="capability-counts-label" id={`${markerPrefix}-counts`}>
            State counts of the {capabilities.length} returned {capabilities.length === 1 ? 'capability' : 'capabilities'}
          </p>
          <dl className="capability-counts" aria-labelledby={`${markerPrefix}-counts`}>
            <div><dt>todo</dt><dd>{counts.todo}</dd></div>
            <div><dt>working</dt><dd>{counts.working}</dd></div>
            <div><dt>completed</dt><dd>{counts.completed}</dd></div>
          </dl>
        </div>
      </div>
      {coverage}
      <div className="graph-legend" aria-label="Graph legend">
        <span><i className="legend-line" /> confirmed dependency</span>
        <span><i className="legend-line legend-tentative" /> tentative dependency</span>
        <span><i className="legend-node legend-entry" /> entry</span>
        <span><i className="legend-node legend-forecast" /> forecast only</span>
        <span><i className="legend-cycle" /> dependency cycle</span>
        {marked && <SessionMarksLegend />}
      </div>
      {sessions && <RunSessionStrip diagram={sessions} sessions={runLevel} />}
      <div className="capability-graph-scroll" tabIndex={0} aria-label="Scrollable capability dependency graph">
        <div className="capability-graph-surface" style={{ width: layout.width, height: layout.height }} role="group" aria-label={`${capabilities.length} capabilities in ${layout.columns} dependency depth columns`}>
          {Array.from({ length: layout.columns }, (_, column) => (
            <div key={column} className="graph-column-label" style={{ left: horizontalPadding + column * (nodeWidth + columnGap), width: nodeWidth }}>
              Depth {column}
            </div>
          ))}
          <svg className="capability-edges" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              <marker id={confirmedMarker} className="capability-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
              <marker id={tentativeMarker} className="capability-arrow capability-arrow-tentative" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {layout.cycles.map(cycle => <rect key={cycle.component} className="capability-cycle" x={cycle.x} y={cycle.y} width={cycle.width} height={cycle.height} rx="10" />)}
            {layout.edges.map(edge => {
              const from = nodeById.get(edge.from)!;
              const to = nodeById.get(edge.to)!;
              return (
                <path
                  key={`${edge.from}:${edge.to}`}
                  className={`capability-edge${edge.tentative ? ' capability-edge-tentative' : ''}`}
                  data-from={edge.from}
                  data-to={edge.to}
                  d={edgePath(from, to)}
                  markerEnd={`url(#${edge.tentative ? tentativeMarker : confirmedMarker})`}
                />
              );
            })}
          </svg>
          {layout.cycles.map(cycle => (
            <div key={cycle.component} className="capability-cycle-label" style={{ left: cycle.x + 10, top: cycle.y + 6, width: cycle.width - 20 }}>
              Dependency cycle: no order among {cycle.capabilities.length === 1 ? 'itself' : 'these'}
            </div>
          ))}
          {layout.nodes.map(node => {
            const capability = node.capability;
            const isSelected = selected?.capability === capability.capability;
            return (
              <button
                key={capability.capability}
                type="button"
                className={`capability-node capability-node-${capability.state}${capability.tentative ? ' capability-node-tentative' : ''}${isSelected ? ' capability-node-selected' : ''}`}
                style={{ left: node.x, top: node.y, width: nodeWidth, height: node.height }}
                aria-pressed={isSelected}
                aria-label={nodeName(capability, byCapability.get(capability.capability))}
                onClick={() => setSelectedId(capability.capability)}
              >
                <span className="capability-node-title"><code>{capability.capability}</code></span>
                <span className="capability-node-owner-label">{ownerLabel(capability)}</span>
                <span className="capability-node-owner"><ModulePath module={capability.owner} /></span>
                <span className="capability-node-badges">
                  <span className={`badge state-${capability.state}`}>{capability.state}</span>
                  {capability.entry && <span className="badge">entry</span>}
                  {capability.tentative && <span className="badge tentative">forecast only</span>}
                </span>
                <span className="capability-node-meta">{capability.workItems.length} work item{capability.workItems.length === 1 ? '' : 's'} · {capability.evidence.length} evidence</span>
                {marked && <span className="capability-node-sessions" style={{ height: sessionMarksHeight }}><SessionMarks sessions={byCapability.get(capability.capability)} /></span>}
              </button>
            );
          })}
        </div>
      </div>
      {selected
        ? <CapabilityDetail capability={selected} capabilities={capabilities} omitted={omitted} onOpenWorkItem={onOpenWorkItem}
          sessions={sessions} of={byCapability.get(selected.capability)} />
        : <p className="capability-detail muted">No capability is selected.</p>}
      <details className="capability-dependency-list">
        <summary>Dependency list</summary>
        {layout.edges.length === 0
          ? <p className="muted">No dependency between returned capabilities is recorded.</p>
          : <ul>{layout.edges.map(edge => <li key={`${edge.from}:${edge.to}`}><code>{edge.from}</code> depends on <code>{edge.to}</code>{edge.tentative ? ' (tentative)' : ''}</li>)}</ul>}
        {layout.cycles.length > 0 && (
          <>
            <p>Dependency cycles, each with its internal dependencies:</p>
            <ul aria-label="Dependency cycles">
              {layout.cycles.map(cycle => {
                const members = new Set(cycle.capabilities);
                const internal = layout.edges.filter(edge => members.has(edge.from) && members.has(edge.to));
                return (
                  <li key={cycle.component}>
                    <code>{cycle.capabilities.join(', ')}</code>: {internal.map(edge => `${edge.from} → ${edge.to}${edge.tentative ? ' (tentative)' : ''}`).join('; ')}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </details>
    </section>
  );
}

function CapabilityDetail({ capability, capabilities, omitted, onOpenWorkItem, sessions, of }: {
  readonly capability: CapabilityProgress;
  readonly capabilities: readonly CapabilityProgress[];
  readonly omitted: ReadonlySet<string>;
  readonly onOpenWorkItem: ((workItem: string) => void) | undefined;
  readonly sessions: DiagramSessions | undefined;
  /** The sessions that reach this capability. */
  readonly of: readonly RunSessionView[] | undefined;
}) {
  const dependents = capabilities.filter(other => other.dependsOn.some(link => link.capability === capability.capability));
  return (
    <section className="capability-detail" aria-live="polite" aria-label={`Details for ${capability.capability}`}>
      <h3>
        <code>{capability.capability}</code> <span className={`badge state-${capability.state}`}>{capability.state}</span>
        {capability.entry && <span className="badge">entry</span>}
        {capability.tentative && <span className="badge tentative">forecast only</span>}
      </h3>
      <dl className="facts">
        <div><dt>Reason</dt><dd>{capability.reason}</dd></div>
        <div><dt>{ownerLabel(capability)}</dt><dd><code>{capability.owner}</code></dd></div>
        <div>
          <dt>Depends on</dt>
          <dd>
            {capability.dependsOn.length === 0 ? 'nothing recorded' : (
              <ul className="inline-list">
                {capability.dependsOn.map(link => (
                  <li key={link.capability}>
                    <code>{link.capability}</code>{link.tentative ? ' (tentative)' : ''}{omitted.has(link.capability) ? ' (not in this response)' : ''}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt>Depended on by</dt>
          <dd>{dependents.length === 0 ? 'no returned capability' : dependents.map(other => other.capability).join(', ')}</dd>
        </div>
        <div>
          <dt>Work items</dt>
          <dd>
            {capability.workItems.length === 0 ? 'none recorded' : (
              <ul className="inline-list" aria-label="Work items">
                {capability.workItems.map(workItem => (
                  <li key={workItem}>
                    {onOpenWorkItem
                      ? <button type="button" className="link" aria-label={`Open the history of work item ${workItem}`} onClick={() => onOpenWorkItem(workItem)}>{workItem}</button>
                      : <code>{workItem}</code>}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div><dt>Verification evidence</dt><dd>{capability.evidence.length > 0 ? capability.evidence.join(', ') : 'none recorded'}</dd></div>
        {capability.scenarios !== null && (
          <div><dt>Acceptance scenarios</dt><dd>{capability.scenarios.implemented} of {capability.scenarios.total} implemented</dd></div>
        )}
      </dl>
      {sessions && <ElementSessions diagram={sessions} sessions={of} element={capability.capability} />}
    </section>
  );
}
