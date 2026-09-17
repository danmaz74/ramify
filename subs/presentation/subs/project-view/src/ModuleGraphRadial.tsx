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
import ModuleGraphLegend from './ModuleGraphLegend.js';
import {
  buildGraphEdges,
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
  readonly complexityScore: number;
  readonly fileCount: number;
  readonly dependencyCount: number;
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
      : { text: 'ok', bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' };

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
      title={`${data.path}\nApproximate complexity ${Math.round(data.complexityScore * 100)}%`}
    >
      <div
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
      </div>
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
        <div style={{ marginTop: '-1px', marginBottom: '4px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: '24px', padding: '1px 6px', borderRadius: '999px', background: '#eff6ff',
            border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '9px', fontWeight: 700,
            lineHeight: 1.1 }}>
            ~{Math.round(data.complexityScore * 100)}
          </span>
        </div>
        <div style={{ fontSize: '9px', color: '#64748b', lineHeight: 1.2 }}>
          {data.fileCount} files | {data.dependencyCount} deps
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
}: EdgeProps): React.ReactElement {
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
      stroke={style?.stroke || '#64748b'}
      strokeWidth={style?.strokeWidth || 2}
      strokeDasharray="8 4"
      strokeLinecap="round"
      opacity={style?.opacity || 0.82}
      style={{ animation: 'module-arch-edge-flow 1.5s linear infinite' }}
    />
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
    const complexityScores = modules.map((module) => module.metrics.approximateIcs);
    const minComplexity = complexityScores.length > 0 ? Math.min(...complexityScores) : 0;
    const maxComplexity = complexityScores.length > 0 ? Math.max(...complexityScores) : 0;
    const complexityRange = Math.max(1, maxComplexity - minComplexity);
    const result: ModuleCircleNode[] = [];

    for (let index = 0; index < modules.length; index += 1) {
      const module = modules[index];
      const complexity = module.metrics.approximateIcs;
      result.push(moduleNode(module, index, totalCount, baseRadius,
        MIN_DIAMETER + ((complexity - minComplexity) / complexityRange) * (MAX_DIAMETER - MIN_DIAMETER),
        module.id === selectedModuleId));
    }
    for (let index = 0; index < outOfViewModules.length; index += 1) {
      const module = outOfViewModules[index];
      result.push(moduleNode(module, modules.length + index, totalCount, baseRadius, MIN_DIAMETER,
        false, true, outOfViewLevelById[module.id]));
    }
    return result;
  }, [modules, outOfViewModules, outOfViewLevelById, selectedModuleId]);

  const graphEdges = useMemo(() => buildGraphEdges({
    edges: moduleEdges,
    nodeIdSet: allNodeIds,
    selectedEdgeId,
    edgeType: 'chordArrow',
    markerSize: 18,
    allowedStroke: '#64748b',
  }).map((edge) => ({ ...edge, style: { ...edge.style, opacity: 0.82 } })),
  [moduleEdges, allNodeIds, selectedEdgeId]);

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
      <ModuleGraphLegend presentationClasses={presentationClasses} />
    </div>
  );
}

function moduleNode(module: ExplorerModule, slot: number, total: number, radius: number,
  diameter: number, selected: boolean, outOfView = false,
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
      complexityScore: module.metrics.approximateIcs,
      fileCount: module.metrics.ownedFiles,
      dependencyCount: module.metrics.dependencies,
      limitedCount: module.metrics.limitedAccesses,
      deniedCount: module.metrics.deniedAccesses,
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
