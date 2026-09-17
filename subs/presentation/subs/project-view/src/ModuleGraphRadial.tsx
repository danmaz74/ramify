// Adapted from cucumber-viz
// src/domains/module-architecture/ui/components/ModuleGraphRadial.tsx at
// 44b7f30e0fdfda79ead8363ef4c85c100e36fda0.

import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  BackgroundVariant,
} from '@xyflow/react';
import type { EdgeProps, Node, NodeProps } from '@xyflow/react';
import { useAutoFit } from './auto-fit.js';
import type { ExplorerModule } from './interfaces/project-view.js';
import type { ActiveDependencyEdge } from './dependency-graph.js';
import ModuleGraphLegend from './ModuleGraphLegend.js';
import {
  buildGraphEdges,
  flowDashArray,
  useModuleGraphInteractions,
  type ModuleGraphProps,
} from './moduleGraphShared.js';
import {
  getOrderedPresentationClasses,
  getPresentationClass,
  getPresentationClassColor,
  getPresentationClassLabel,
  withAlpha,
} from './moduleTypePresentation.js';

const CHART_CENTER_X = 640;
const CHART_CENTER_Y = 420;
const MIN_DIAMETER = 84;
const MAX_DIAMETER = 170;

interface ModuleCircleData extends Record<string, unknown> {
  readonly name: string;
  readonly path: string;
  readonly presentationClass: string;
  readonly presentationClassLabel: string;
  readonly presentationClassColor: string;
  readonly fileCount: number;
  /** Displayed links this module consumes. */
  readonly linkCount: number;
  readonly limitedCount: number;
  readonly deniedCount: number;
  readonly isSelected: boolean;
  readonly diameter: number;
  readonly angle: number;
  readonly subModuleCount: number;
  readonly isOutOfView?: boolean;
  readonly outOfViewLevel?: number;
}

type ModuleCircleNode = Node<ModuleCircleData, 'moduleCircle'>;

function ModuleCircleNodeView({ data }: NodeProps<ModuleCircleNode>): React.ReactElement {
  const borderColor = data.presentationClassColor;
  const background = `radial-gradient(circle at 30% 30%, #ffffff, ${withAlpha(borderColor, 0.24)})`;
  const inwardAngle = data.angle + Math.PI;
  const handleRadius = data.diameter / 2 - 10;
  const handleX = data.diameter / 2 + Math.cos(inwardAngle) * handleRadius;
  const handleY = data.diameter / 2 + Math.sin(inwardAngle) * handleRadius;
  const healthBadge = data.deniedCount > 0
    ? { text: `${data.deniedCount} denied`, bg: '#fef2f2', border: '#fecaca', color: '#dc2626' }
    : data.limitedCount > 0
      ? { text: `${data.limitedCount} limited`, bg: '#fffbeb', border: '#fde68a', color: '#d97706' }
      : data.linkCount > 0
        ? { text: 'allowed', bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' }
        : null;

  return (
    <div
      className="module-arch__radial-node"
      style={{
        width: data.diameter,
        height: data.diameter,
        borderRadius: '50%',
        borderWidth: '3px',
        borderStyle: data.isOutOfView ? 'dashed' : 'solid',
        borderColor: data.isSelected ? '#1d4ed8' : borderColor,
        background,
        boxShadow: data.isSelected
          ? '0 0 0 4px rgba(29, 78, 216, 0.2), 0 10px 24px rgba(15, 23, 42, 0.18)'
          : '0 8px 22px rgba(15, 23, 42, 0.14)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        textAlign: 'center',
        padding: '10px',
        cursor: data.isOutOfView ? 'default' : 'pointer',
        opacity: data.isOutOfView ? 0.65 : undefined,
        position: 'relative',
      }}
      title={`${data.path}\n${data.fileCount} owned source files`}
    >
      {healthBadge && <div
        style={{
          position: 'absolute',
          bottom: -8,
          left: -8,
          fontSize: '8px',
          lineHeight: 1,
          padding: '3px 6px',
          borderRadius: 999,
          border: `1px solid ${healthBadge.border}`,
          background: healthBadge.bg,
          color: healthBadge.color,
          fontWeight: 700,
          textTransform: 'uppercase',
          boxShadow: '0 3px 8px rgba(15, 23, 42, 0.22)',
          zIndex: 3,
          pointerEvents: 'none',
        }}
      >
        {healthBadge.text}
      </div>}
      {data.isOutOfView && data.outOfViewLevel != null && (
        <div style={cornerBadgeStyle('bottom')}>-{data.outOfViewLevel}</div>
      )}
      {data.subModuleCount > 0 && (
        <div style={cornerBadgeStyle('top')}>{data.subModuleCount} sub</div>
      )}
      <Handle
        type="source"
        position={Position.Top}
        style={{ left: `${handleX}px`, top: `${handleY}px`, width: 8, height: 8,
          border: 'none', background: 'transparent' }}
      />
      <Handle
        type="target"
        position={Position.Top}
        style={{ left: `${handleX}px`, top: `${handleY}px`, width: 8, height: 8,
          border: 'none', background: 'transparent' }}
      />
      <div style={{ width: '100%' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a',
          marginBottom: '3px', lineHeight: 1.2 }}>
          {data.name}
        </div>
        <div style={{ fontSize: '9px', color: borderColor, marginBottom: '3px', fontWeight: 700 }}>
          {data.presentationClassLabel}
        </div>
        <div style={{ fontSize: '9px', color: '#64748b', lineHeight: 1.2 }}>
          {data.fileCount} source files
        </div>
      </div>
    </div>
  );
}

function ChordArrowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd: _markerEnd,
  style,
  data,
}: EdgeProps): React.ReactElement {
  const link = (data as { edge?: ActiveDependencyEdge } | undefined)?.edge;
  const pull = 0.78;
  const c1x = sourceX + (CHART_CENTER_X - sourceX) * pull;
  const c1y = sourceY + (CHART_CENTER_Y - sourceY) * pull;
  const c2x = targetX + (CHART_CENTER_X - targetX) * pull;
  const c2y = targetY + (CHART_CENTER_Y - targetY) * pull;
  const path = `M ${sourceX},${sourceY} C ${c1x},${c1y} ${c2x},${c2y} ${targetX},${targetY}`;
  return (
    <path
      id={id}
      d={path}
      fill="none"
      className="module-arch__graph-edge"
      stroke={style?.stroke || '#64748b'}
      strokeWidth={style?.strokeWidth || 2}
      strokeDasharray={style?.strokeDasharray ?? flowDashArray}
      strokeLinecap="round"
      opacity={style?.opacity || 0.82}
    >
      {link && <title>{linkTitle(link)}</title>}
    </path>
  );
}

const nodeTypes = { moduleCircle: ModuleCircleNodeView };
const radialFitOptions = { padding: 0.14, minZoom: 0.35, maxZoom: 1.3 };
const edgeTypes = { chordArrow: ChordArrowEdge };

export function ModuleGraphRadial({
  modules,
  edges: moduleEdges,
  outOfViewModules = [],
  outOfViewLevelById = {},
  selectedModuleId,
  selectedEdgeId,
  onSelectModule,
  onSelectEdge,
  onDrillDown,
}: ModuleGraphProps): React.ReactElement {
  const modulesById = useMemo(
    () => new Map([...modules, ...outOfViewModules].map((module) => [module.id, module])),
    [modules, outOfViewModules],
  );
  const allNodeIds = useMemo(
    () => new Set(modulesById.keys()),
    [modulesById],
  );

  const allRingNodes = useMemo<ModuleCircleNode[]>(() => {
    const totalCount = modules.length + outOfViewModules.length;
    const baseRadius = getRingRadius(totalCount);
    const diameters = nodeDiameters(modules);
    const result: ModuleCircleNode[] = [];

    for (let index = 0; index < modules.length; index += 1) {
      const module = modules[index];
      result.push(moduleNode(module, index, totalCount, baseRadius, diameters.get(module.id) ?? MIN_DIAMETER,
        module.id === selectedModuleId, linkHealth(module.id, moduleEdges)));
    }
    for (let index = 0; index < outOfViewModules.length; index += 1) {
      const module = outOfViewModules[index];
      result.push(moduleNode(module, modules.length + index, totalCount, baseRadius, MIN_DIAMETER,
        false, linkHealth(module.id, moduleEdges), true, outOfViewLevelById[module.id]));
    }
    return result;
  }, [modules, moduleEdges, outOfViewModules, outOfViewLevelById, selectedModuleId]);

  const graphEdges = useMemo(() => buildGraphEdges({
    edges: moduleEdges,
    nodeIdSet: allNodeIds,
    selectedEdgeId,
    edgeType: 'chordArrow',
    markerSize: 18,
    allowedStroke: '#64748b',
  }), [moduleEdges, allNodeIds, selectedEdgeId]);

  const interactions = useModuleGraphInteractions({
    selectedModuleId,
    selectedEdgeId,
    onSelectModule,
    onSelectEdge,
    onDrillDown,
  });
  const presentationClasses = getOrderedPresentationClasses(modules.map(getPresentationClass));
  const autoFit = useAutoFit(allRingNodes.length, radialFitOptions);

  return (
    <div className="module-arch__radial-canvas" ref={autoFit.containerRef}>
      <ReactFlow
        nodes={allRingNodes}
        edges={graphEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={interactions.onNodeClick}
        onEdgeClick={interactions.onEdgeClick}
        onPaneClick={interactions.onPaneClick}
        onNodeDoubleClick={interactions.onNodeDoubleClick}
        onInit={autoFit.onInit}
        onMoveStart={autoFit.onMoveStart}
        fitView
        fitViewOptions={radialFitOptions}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#dbe3f0" />
        <Controls showInteractive={false} />
        <MiniMap
          style={{ bottom: 12 }}
          nodeColor={(node) => (node.data as ModuleCircleData).presentationClassColor}
        />
      </ReactFlow>
      <ModuleGraphLegend presentationClasses={presentationClasses}
        showsNonBehavioralLinks={moduleEdges.some((edge) => edge.emphasis === 'non-behavioral')}
        depthMode={moduleEdges[0]?.depthMode} />
    </div>
  );
}

interface LinkHealth {
  readonly links: number;
  readonly limited: number;
  readonly denied: number;
}

function linkHealth(id: string, edges: readonly ActiveDependencyEdge[]): LinkHealth {
  const outgoing = edges.filter((edge) => edge.consumer === id);
  return {
    links: outgoing.length,
    limited: outgoing.filter((edge) => edge.status === 'limited').length,
    denied: outgoing.filter((edge) => edge.status === 'denied').length,
  };
}

/**
 * Node diameter from owned source files on a square-root scale over the given modules. It is
 * independent of dependency settings, so the controls never resize nodes.
 */
export function nodeDiameters(modules: readonly ExplorerModule[]): Map<string, number> {
  const sizes = modules.map((module) => Math.sqrt(ownedSourceFiles(module)));
  const minimum = sizes.length > 0 ? Math.min(...sizes) : 0;
  const range = sizes.length > 0 ? Math.max(...sizes) - minimum : 0;
  return new Map(modules.map((module, index) => [module.id, range === 0
    ? MIN_DIAMETER
    : MIN_DIAMETER + ((sizes[index]! - minimum) / range) * (MAX_DIAMETER - MIN_DIAMETER)]));
}

export function ownedSourceFiles(module: ExplorerModule): number {
  return module.files.filter((file) => file.kind === 'source').length;
}

function linkTitle(link: ActiveDependencyEdge): string {
  const unit = link.depthMode === 'level'
    ? 'dependencies of these modules and everything under them'
    : 'dependencies of these exact modules';
  return `${link.consumer} -> ${link.provider}: ${link.behavioral} behavioral, `
    + `${link.nonBehavioral} non-behavioral ${unit}`;
}

function moduleNode(module: ExplorerModule, slot: number, total: number, radius: number,
  diameter: number, selected: boolean, health: LinkHealth, outOfView = false,
  outOfViewLevel?: number): ModuleCircleNode {
  const angle = slotAngle(slot, total);
  const presentationClass = getPresentationClass(module);
  return {
    id: module.id,
    type: 'moduleCircle',
    position: circlePosition(angle, radius, diameter),
    // Controlled nodes never receive measurements back; the minimap needs their size.
    initialWidth: diameter,
    initialHeight: diameter,
    data: {
      name: module.name,
      path: module.directory,
      presentationClass,
      presentationClassLabel: getPresentationClassLabel(presentationClass),
      presentationClassColor: getPresentationClassColor(presentationClass),
      fileCount: ownedSourceFiles(module),
      linkCount: health.links,
      limitedCount: health.limited,
      deniedCount: health.denied,
      isSelected: selected,
      diameter,
      angle,
      subModuleCount: module.children.length,
      isOutOfView: outOfView,
      outOfViewLevel,
    },
  };
}

function cornerBadgeStyle(position: 'top' | 'bottom'): React.CSSProperties {
  return {
    position: 'absolute',
    [position]: -11,
    right: -11,
    fontSize: '8px',
    lineHeight: 1,
    padding: '3px 6px',
    borderRadius: 999,
    border: '1px solid #cbd5e1',
    background: '#f1f5f9',
    color: '#475569',
    fontWeight: 700,
    textTransform: 'uppercase',
    boxShadow: '0 3px 8px rgba(15, 23, 42, 0.22)',
    zIndex: 3,
    pointerEvents: 'none',
  };
}

function slotAngle(slot: number, total: number): number {
  return -Math.PI / 2 + (slot / Math.max(1, total)) * Math.PI * 2;
}

function circlePosition(angle: number, radius: number, diameter: number): { x: number; y: number } {
  return {
    x: CHART_CENTER_X + Math.cos(angle) * radius - diameter / 2,
    y: CHART_CENTER_Y + Math.sin(angle) * radius - diameter / 2,
  };
}

function getRingRadius(moduleCount: number): number {
  return Math.max(260, Math.min(460, moduleCount * 34));
}
