import { useId, useMemo, useState } from 'react';
import type { CapabilityProgress } from '../../harness/src/interfaces/protocol/runs.js';

const nodeWidth = 232;
const baseNodeHeight = 126;
const ownerCharactersPerLine = 24;
const ownerLineHeight = 18;
const columnGap = 88;
const rowGap = 28;
const horizontalPadding = 28;
const graphTop = 54;
const graphBottom = 24;

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
  readonly columns: number;
  readonly width: number;
  readonly height: number;
}

function nodeHeight(capability: CapabilityProgress): number {
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
  return baseNodeHeight + (ownerLines - 1) * ownerLineHeight;
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
 * A deterministic, dependency-first layout for the harness projection.
 * Consumers stay on the left and the capabilities they depend on move right.
 * Strongly connected capabilities share a column and get one cycle outline.
 */
export function layoutCapabilityGraph(capabilities: readonly CapabilityProgress[]): CapabilityGraphLayout {
  const byId = new Map(capabilities.map(capability => [capability.capability, capability]));
  const order = new Map(capabilities.map((capability, index) => [capability.capability, index]));
  const dependencies = new Map(capabilities.map(capability => [
    capability.capability,
    [...new Set(capability.dependsOn.map(link => link.capability).filter(target => byId.has(target)))],
  ]));

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

  const componentOrder = (left: number, right: number): number => {
    const leftIndex = Math.min(...components[left]!.map(id => order.get(id)!));
    const rightIndex = Math.min(...components[right]!.map(id => order.get(id)!));
    return leftIndex - rightIndex || components[left]![0]!.localeCompare(components[right]![0]!);
  };
  const queue = incoming.map((count, component) => ({ count, component }))
    .filter(({ count }) => count === 0).map(({ component }) => component).sort(componentOrder);
  const rank = components.map(() => 0);
  const visited: number[] = [];
  while (queue.length > 0) {
    const component = queue.shift()!;
    visited.push(component);
    for (const dependency of [...outgoing[component]!].sort(componentOrder)) {
      rank[dependency] = Math.max(rank[dependency]!, rank[component]! + 1);
      incoming[dependency]! -= 1;
      if (incoming[dependency] === 0) {
        queue.push(dependency);
        queue.sort(componentOrder);
      }
    }
  }

  // The SCC condensation is acyclic, but retaining this fallback makes a
  // partially malformed future projection visible rather than unrenderable.
  for (let component = 0; component < components.length; component += 1) {
    if (!visited.includes(component)) visited.push(component);
  }

  const columnCount = capabilities.length === 0 ? 0 : Math.max(...rank) + 1;
  const componentColumns = Array.from({ length: columnCount }, () => [] as number[]);
  for (let component = 0; component < components.length; component += 1) {
    componentColumns[rank[component]!]!.push(component);
  }
  for (const column of componentColumns) column.sort(componentOrder);

  const nodes: CapabilityGraphNode[] = [];
  const cycles: CapabilityGraphCycle[] = [];
  let greatestBottom = graphTop;
  componentColumns.forEach((column, columnIndex) => {
    let row = 0;
    let y = graphTop;
    for (const component of column) {
      const firstY = y;
      for (const id of components[component]!) {
        const capability = byId.get(id)!;
        const height = nodeHeight(capability);
        nodes.push({
          capability,
          component,
          column: columnIndex,
          row,
          x: horizontalPadding + columnIndex * (nodeWidth + columnGap),
          y,
          height,
        });
        row += 1;
        y += height + rowGap;
      }
      const selfLoop = components[component]!.some(id => dependencies.get(id)?.includes(id));
      if (components[component]!.length > 1 || selfLoop) {
        const lastBottom = y - rowGap;
        cycles.push({
          component,
          capabilities: components[component]!,
          x: horizontalPadding - 9 + columnIndex * (nodeWidth + columnGap),
          y: firstY - 9,
          width: nodeWidth + 18,
          height: lastBottom - firstY + 18,
        });
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
        // If malformed input repeats an edge, a confirmed observation wins.
        tentative: (previous?.tentative ?? true) && link.tentative,
      });
    }
  }

  return {
    nodes,
    edges: [...edgeByPair.values()],
    cycles,
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
    const outside = fromX + 36 + Math.abs(from.row - to.row) * 5;
    return `M ${fromX} ${fromY} C ${outside} ${fromY}, ${outside} ${toY}, ${to.x + nodeWidth} ${toY}`;
  }
  const toX = to.x;
  const middle = (fromX + toX) / 2;
  return `M ${fromX} ${fromY} C ${middle} ${fromY}, ${middle} ${toY}, ${toX} ${toY}`;
}

const stateLabel = (state: CapabilityProgress['state']): string => state === 'working' ? 'working on' : state;

export function CapabilityGraph({ capabilities, total }: {
  readonly capabilities: readonly CapabilityProgress[];
  readonly total: number;
}) {
  const layout = useMemo(() => layoutCapabilityGraph(capabilities), [capabilities]);
  const markerPrefix = useId().replaceAll(':', '');
  const confirmedMarker = `${markerPrefix}-confirmed-arrow`;
  const tentativeMarker = `${markerPrefix}-tentative-arrow`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = capabilities.find(capability => capability.capability === selectedId)
    ?? capabilities.find(capability => capability.entry)
    ?? capabilities[0];
  const nodeById = new Map(layout.nodes.map(node => [node.capability.capability, node]));
  const missingTargets = [...new Set(capabilities.flatMap(capability => capability.dependsOn.map(link => link.capability))
    .filter(target => !nodeById.has(target)))];
  const counts = {
    todo: capabilities.filter(capability => capability.state === 'todo').length,
    working: capabilities.filter(capability => capability.state === 'working').length,
    completed: capabilities.filter(capability => capability.state === 'completed').length,
  };

  if (capabilities.length === 0) {
    return <section className="panel capability-graph" aria-label="Capability dependency graph"><h2>Capability progress</h2><p className="empty">No capabilities have been projected for this run.</p></section>;
  }

  return (
    <section className="panel capability-graph" aria-labelledby="capability-graph-heading">
      <div className="capability-graph-header">
        <div>
          <h2 id="capability-graph-heading">Capability progress</h2>
          <p className="muted">Arrows run from a consumer to the capability it depends on. Select a capability for its retained reason and evidence.</p>
        </div>
        <dl className="capability-counts" aria-label="Progress totals">
          <div><dt>Todo</dt><dd>{counts.todo}</dd></div>
          <div><dt>Working on</dt><dd>{counts.working}</dd></div>
          <div><dt>Completed</dt><dd>{counts.completed}</dd></div>
        </dl>
      </div>
      {(total > capabilities.length || missingTargets.length > 0) && (
        <p className="graph-coverage warn" role="status">
          This graph is incomplete: showing {capabilities.length} of {total} capabilities
          {missingTargets.length > 0 ? `; ${missingTargets.length} referenced ${missingTargets.length === 1 ? 'dependency is' : 'dependencies are'} unavailable in this response (${missingTargets.join(', ')})` : ''}.
        </p>
      )}
      <div className="graph-legend" aria-label="Graph legend">
        <span><i className="legend-line" /> confirmed dependency</span>
        <span><i className="legend-line legend-tentative" /> tentative dependency</span>
        <span><i className="legend-node legend-entry" /> entry</span>
        <span><i className="legend-node legend-forecast" /> forecast</span>
        <span><i className="legend-cycle" /> dependency cycle</span>
      </div>
      <div className="capability-graph-scroll" tabIndex={0} aria-label="Scrollable capability dependency graph">
        <div className="capability-graph-surface" style={{ width: layout.width, height: layout.height }} role="group" aria-label={`${capabilities.length} capabilities in ${layout.columns} dependency columns`}>
          {Array.from({ length: layout.columns }, (_, column) => (
            <div key={column} className="graph-column-label" style={{ left: horizontalPadding + column * (nodeWidth + columnGap), width: nodeWidth }}>
              {column === 0 ? 'Starting capabilities' : `Dependency depth ${column}`}
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
            {layout.edges.map((edge, index) => {
              const from = nodeById.get(edge.from)!;
              const to = nodeById.get(edge.to)!;
              return <path key={`${edge.from}:${edge.to}:${index}`} className={`capability-edge${edge.tentative ? ' capability-edge-tentative' : ''}`} d={edgePath(from, to)} markerEnd={`url(#${edge.tentative ? tentativeMarker : confirmedMarker})`} />;
            })}
          </svg>
          {layout.nodes.map(node => {
            const capability = node.capability;
            return (
              <button
                key={capability.capability}
                type="button"
                className={`capability-node capability-node-${capability.state}${capability.tentative ? ' capability-node-tentative' : ''}${selected?.capability === capability.capability ? ' capability-node-selected' : ''}`}
                style={{ left: node.x, top: node.y, width: nodeWidth, height: node.height }}
                aria-pressed={selected?.capability === capability.capability}
                aria-label={`${capability.capability}, ${stateLabel(capability.state)}${capability.entry ? ', entry' : ''}${capability.tentative ? ', forecast' : ''}`}
                onClick={() => setSelectedId(capability.capability)}
              >
                <span className="capability-node-title"><code>{capability.capability}</code></span>
                <span className="capability-node-owner"><ModulePath module={capability.owner} /></span>
                <span className="capability-node-badges"><span className={`badge state-${capability.state}`}>{stateLabel(capability.state)}</span>{capability.entry && <span className="badge">entry</span>}{capability.tentative && <span className="badge tentative">forecast</span>}</span>
                <span className="capability-node-meta">{capability.workItems.length} work item{capability.workItems.length === 1 ? '' : 's'} · {capability.evidence.length} evidence</span>
              </button>
            );
          })}
        </div>
      </div>
      {selected && (
        <section className="capability-detail" aria-live="polite" aria-label={`Details for ${selected.capability}`}>
          <h3><code>{selected.capability}</code></h3>
          <p>{selected.reason}</p>
          <dl className="facts">
            <div><dt>Owner</dt><dd><code>{selected.owner}</code></dd></div>
            <div><dt>Work items</dt><dd>{selected.workItems.length > 0 ? selected.workItems.join(', ') : 'none recorded'}</dd></div>
            <div><dt>Verification evidence</dt><dd>{selected.evidence.length > 0 ? selected.evidence.join(', ') : 'none recorded'}</dd></div>
            <div><dt>Depends on</dt><dd>{selected.dependsOn.length > 0 ? selected.dependsOn.map(link => `${link.capability}${link.tentative ? ' (tentative)' : ''}`).join(', ') : 'nothing recorded'}</dd></div>
          </dl>
        </section>
      )}
      <details className="capability-dependency-list">
        <summary>Dependency list</summary>
        {layout.edges.length === 0
          ? <p className="muted">No dependency links are recorded.</p>
          : <ul>{layout.edges.map((edge, index) => <li key={`${edge.from}:${edge.to}:${index}`}><code>{edge.from}</code> depends on <code>{edge.to}</code>{edge.tentative ? ' (tentative)' : ''}</li>)}</ul>}
      </details>
    </section>
  );
}
