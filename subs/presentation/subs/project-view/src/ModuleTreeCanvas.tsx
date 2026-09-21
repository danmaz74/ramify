import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
} from '@xyflow/react';
import type { Edge, EdgeProps, MiniMapNodeProps, Node, NodeProps, ReactFlowInstance } from '@xyflow/react';
import type { Point } from '../../layout/src/interfaces/layout.js';
import { useAutoFit } from './auto-fit.js';
import {
  type HierarchyNode,
  indexHierarchy,
  layoutModuleTree,
  PROJECT_NODE_ID,
  TREE_NODE_HEIGHT,
  TREE_NODE_WIDTH,
} from './module-tree.js';

/** Shell treatment of a node: `muted` lowers its contrast, `provisional` dashes its border. */
export type ModuleTreeCanvasEmphasis = 'normal' | 'muted' | 'provisional';

export interface ModuleTreeCanvasNode {
  readonly id: string;
  /** Default accessible name and minimap title. */
  readonly name: string;
  readonly parent: string | null;
  readonly children: readonly string[];
  /** Accent of the node shell and its minimap mark. */
  readonly color: string;
  readonly width: number;
  readonly height: number;
  /** Shell treatment; `normal` when omitted. */
  readonly emphasis?: ModuleTreeCanvasEmphasis;
}

export interface ModuleTreeCanvasProps {
  readonly nodes: readonly ModuleTreeCanvasNode[];
  /** The single parentless node to lay out as the root; several parentless nodes share a project node. */
  readonly rootNodeId?: string;
  readonly selectedNodeId: string | null;
  readonly collapsedNodeIds: ReadonlySet<string>;
  readonly ariaLabel: string;
  /** Contents of a node shell. Controls in it neither select, open, drag nor pan. */
  renderNodeBody(node: ModuleTreeCanvasNode): React.ReactNode;
  /** Accessible name of a node shell; the node's name when omitted. */
  ariaLabelOf?(node: ModuleTreeCanvasNode): string;
  onSelectNode(id: string | null): void;
  onToggleCollapsed(id: string): void;
  onOpenNode?(id: string): void;
  /** Centres this node once, instead of fitting the whole tree, when it is laid out. */
  readonly centerNodeId?: string | null;
}

interface CanvasNodeData extends Record<string, unknown> {
  /** The supplied node, or null for the synthetic project node. */
  readonly module: ModuleTreeCanvasNode | null;
  readonly isSelected: boolean;
  readonly isCollapsed: boolean;
  readonly childCount: number;
  readonly hiddenCount: number;
  readonly ariaLabel: string;
  readonly renderBody: (node: ModuleTreeCanvasNode) => React.ReactNode;
  readonly onSelect: (id: string) => void;
  readonly onToggle: (id: string) => void;
  readonly onOpen: ((id: string) => void) | null;
}

type CanvasFlowNode = Node<CanvasNodeData, 'moduleTreeNode'>;
type CanvasFlowEdge = Edge<{ readonly points: readonly Point[] }, 'treeElbow'>;

/** Body elements whose events belong to the body rather than to its node. */
const BODY_CONTROL = 'button, a, input, [role="button"], [tabindex]';
const BODY_CLASS = 'module-tree__node-body';

/** The body control an event started in, if any. */
function bodyControlOf(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest(BODY_CONTROL);
  return control !== null && control.closest(`.${BODY_CLASS}`) !== null ? control : null;
}

function markBodyControl(target: EventTarget | null): void {
  bodyControlOf(target)?.classList.add('nodrag', 'nopan');
}

function markBodyControls(body: HTMLElement | null): void {
  body?.querySelectorAll(BODY_CONTROL).forEach(control => control.classList.add('nodrag', 'nopan'));
}

function ModuleTreeCanvasNodeView({ data }: NodeProps<CanvasFlowNode>): React.ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null);
  // Every render: a re-rendered body control may have replaced its class list.
  useLayoutEffect(() => markBodyControls(bodyRef.current));
  const node = data.module;
  if (node === null) {
    return <div className="module-tree__node module-tree__node--project" style={{ width: TREE_NODE_WIDTH, height: TREE_NODE_HEIGHT }}>
      <Handle type="source" position={Position.Bottom} className="module-tree__handle" />
      <span className="module-tree__node-name">Project</span>
    </div>;
  }
  const emphasis = node.emphasis ?? 'normal';
  const keyDown = (event: React.KeyboardEvent) => {
    // Only a key pressed on the shell itself: a body control's keys belong to
    // the body, and the collapse control's Enter and Space to its own click.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter') data.onSelect(node.id);
    else if (event.key === 'ArrowLeft' && data.childCount > 0 && !data.isCollapsed) data.onToggle(node.id);
    else if (event.key === 'ArrowRight' && data.isCollapsed) data.onToggle(node.id);
    else if (event.key === 'o' && data.onOpen) data.onOpen(node.id);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const classes = ['module-tree__node'];
  if (data.isSelected) classes.push('module-tree__node--selected');
  if (emphasis !== 'normal') classes.push(`module-tree__node--${emphasis}`);
  return (
    <div
      className={classes.join(' ')}
      style={{ width: node.width, height: node.height, borderLeftColor: node.color }}
      data-module-id={node.id}
      data-emphasis={emphasis}
      role="treeitem"
      aria-selected={data.isSelected}
      aria-expanded={data.childCount > 0 ? !data.isCollapsed : undefined}
      aria-label={data.ariaLabel}
      tabIndex={0}
      onKeyDown={keyDown}
    >
      <Handle type="target" position={Position.Top} className="module-tree__handle" />
      <Handle type="source" position={Position.Bottom} className="module-tree__handle" />
      <div
        ref={bodyRef}
        className={BODY_CLASS}
        onPointerDownCapture={event => markBodyControl(event.target)}
        onMouseDownCapture={event => markBodyControl(event.target)}
        onTouchStartCapture={event => markBodyControl(event.target)}
      >
        {data.renderBody(node)}
      </div>
      {data.childCount > 0 && (
        <button
          type="button"
          className="module-tree__toggle nodrag nopan"
          aria-label={`${data.isCollapsed ? 'Expand' : 'Collapse'} ${data.ariaLabel}`}
          onClick={event => { event.stopPropagation(); data.onToggle(node.id); }}
          onDoubleClick={event => event.stopPropagation()}
        >
          {data.isCollapsed ? `+${data.hiddenCount}` : '−'}
        </button>
      )}
    </div>
  );
}

function TreeElbowEdge({ id, data }: EdgeProps<CanvasFlowEdge>): React.ReactElement | null {
  const points = data?.points ?? [];
  if (points.length === 0) return null;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ');
  return <path id={id} d={path} className="module-tree__edge" fill="none" />;
}

/** Names of the supplied nodes, for minimap titles. */
const NodeNames = createContext<ReadonlyMap<string, HierarchyNode>>(new Map());

function MiniMapTreeNode({ id, x, y, width, height, style, color, strokeColor, strokeWidth, className, borderRadius,
  shapeRendering, selected, onClick }: MiniMapNodeProps): React.ReactElement {
  const name = useContext(NodeNames).get(id)?.name ?? 'Project';
  return (
    <rect className={['react-flow__minimap-node', selected ? 'selected' : '', className].filter(Boolean).join(' ')}
      x={x} y={y} rx={borderRadius} ry={borderRadius} width={width} height={height}
      style={{ fill: color ?? style?.background?.toString() ?? style?.backgroundColor, stroke: strokeColor, strokeWidth }}
      shapeRendering={shapeRendering} onClick={onClick ? event => onClick(event, id) : undefined}>
      <title>{name}</title>
    </rect>
  );
}

const nodeTypes = { moduleTreeNode: ModuleTreeCanvasNodeView };
const edgeTypes = { treeElbow: TreeElbowEdge };
const treeFitOptions = { padding: 0.12, minZoom: 0.1, maxZoom: 1.2 };
const PROJECT_COLOR = '#94a3b8';

/**
 * A top-down hierarchy canvas: the caller supplies each node's identity, hierarchy, size, accent,
 * emphasis and body, and controls selection and collapse; the canvas owns placement, edges,
 * collapse controls, keyboard input, the minimap and fitting.
 */
export function ModuleTreeCanvas({
  nodes: items,
  rootNodeId,
  selectedNodeId,
  collapsedNodeIds,
  ariaLabel,
  renderNodeBody,
  ariaLabelOf,
  onSelectNode,
  onToggleCollapsed,
  onOpenNode,
  centerNodeId = null,
}: ModuleTreeCanvasProps): React.ReactElement {
  const centered = useRef<string | null>(null);
  const index = useMemo(() => indexHierarchy(items, rootNodeId), [items, rootNodeId]);
  const layout = useMemo(() => layoutModuleTree(index, collapsedNodeIds, id => {
    const item = index.nodesById.get(id)!;
    return { width: item.width, height: item.height };
  }), [collapsedNodeIds, index]);

  const nodes = useMemo<CanvasFlowNode[]>(() => layout.nodes.map(placed => {
    const item = index.nodesById.get(placed.id) ?? null;
    return {
      id: placed.id,
      type: 'moduleTreeNode',
      position: { x: placed.x, y: placed.y },
      // Controlled nodes never receive measurements back; the minimap needs their size.
      initialWidth: placed.width,
      initialHeight: placed.height,
      draggable: false,
      selectable: item !== null,
      // The shell is the node's single tab stop, ahead of its body controls and collapse control.
      focusable: false,
      data: {
        module: item,
        isSelected: placed.id === selectedNodeId,
        isCollapsed: collapsedNodeIds.has(placed.id),
        childCount: index.children.get(placed.id)?.length ?? 0,
        hiddenCount: index.descendants.get(placed.id) ?? 0,
        ariaLabel: item === null ? 'Project' : ariaLabelOf?.(item) ?? item.name,
        renderBody: renderNodeBody,
        onSelect: onSelectNode,
        onToggle: onToggleCollapsed,
        onOpen: onOpenNode ?? null,
      },
    };
  }), [ariaLabelOf, collapsedNodeIds, index, layout, onOpenNode, onSelectNode, onToggleCollapsed, renderNodeBody,
    selectedNodeId]);
  const edges = useMemo<CanvasFlowEdge[]>(() => layout.edges.map(edge => ({
    id: edge.id, source: edge.parent, target: edge.child, type: 'treeElbow', data: { points: edge.points },
  })), [layout]);
  const autoFit = useAutoFit<ReactFlowInstance<CanvasFlowNode, CanvasFlowEdge>>(nodes.length, treeFitOptions,
    centerNodeId === null);
  const flow = autoFit.flow;

  useEffect(() => {
    if (!flow || !centerNodeId || centered.current === centerNodeId) return;
    const placed = layout.nodes.find(item => item.id === centerNodeId);
    if (!placed) return;
    centered.current = centerNodeId;
    void flow.setCenter(placed.x + placed.width / 2, placed.y + placed.height / 2, { zoom: 1 });
  }, [centerNodeId, flow, layout]);

  const ignoresEvent = (event: React.MouseEvent, id: string) => id === PROJECT_NODE_ID || bodyControlOf(event.target) !== null;

  return (
    <div className="module-tree__canvas" role="tree" aria-label={ariaLabel} ref={autoFit.containerRef}>
      <NodeNames.Provider value={index.nodesById}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(event, node) => { if (!ignoresEvent(event, node.id)) onSelectNode(node.id); }}
        onNodeDoubleClick={(event, node) => { if (!ignoresEvent(event, node.id)) onOpenNode?.(node.id); }}
        onPaneClick={() => onSelectNode(null)}
        zoomOnDoubleClick={false}
        onInit={autoFit.onInit}
        onMoveStart={autoFit.onMoveStart}
        fitView={centerNodeId === null}
        fitViewOptions={treeFitOptions}
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#dbe3f0" />
        <Controls showInteractive={false} />
        <MiniMap style={{ bottom: 12 }} pannable zoomable nodeComponent={MiniMapTreeNode}
          nodeColor={node => (node.data as CanvasNodeData).module?.color ?? PROJECT_COLOR} />
      </ReactFlow>
      </NodeNames.Provider>
    </div>
  );
}
