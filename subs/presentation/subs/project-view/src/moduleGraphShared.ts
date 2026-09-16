// Adapted from cucumber-viz
// src/domains/module-architecture/ui/components/moduleGraphShared.ts at
// 44b7f30e0fdfda79ead8363ef4c85c100e36fda0.

import { useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { MarkerType } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import type { ExplorerEdge, ExplorerModule } from './interfaces/project-view.js';

export type GraphSelection = {
  readonly kind: 'edge';
  readonly id: string;
  readonly edge: ExplorerEdge;
};

export interface ModuleGraphProps {
  readonly modules: readonly ExplorerModule[];
  readonly edges: readonly ExplorerEdge[];
  readonly outOfViewModules?: readonly ExplorerModule[];
  readonly outOfViewLevelById?: Readonly<Record<string, number>>;
  readonly selectedModuleId: string | null;
  readonly selectedEdgeId: string | null;
  readonly onSelectModule: (id: string | null) => void;
  readonly onSelectEdge: (edge: GraphSelection | null) => void;
  readonly onDrillDown?: (moduleId: string) => void;
}

interface BuildGraphEdgesOptions {
  readonly edges: readonly ExplorerEdge[];
  readonly nodeIdSet: ReadonlySet<string>;
  readonly selectedEdgeId: string | null;
  readonly edgeType: Edge['type'];
  readonly markerSize?: number;
  readonly allowedStroke?: string;
}

export function buildGraphEdges({
  edges,
  nodeIdSet,
  selectedEdgeId,
  edgeType,
  markerSize = 14,
  allowedStroke = '#94a3b8',
}: BuildGraphEdgesOptions): Edge[] {
  const result: Edge[] = [];

  for (const edge of edges) {
    if (!nodeIdSet.has(edge.consumer) || !nodeIdSet.has(edge.provider)) continue;
    const isSelected = edge.id === selectedEdgeId;
    const stroke = getEdgeStroke(edge.status, allowedStroke);
    result.push({
      id: edge.id,
      source: edge.consumer,
      target: edge.provider,
      type: edgeType,
      animated: false,
      data: { kind: 'edge', id: edge.id, edge } satisfies GraphSelection,
      style: selectedEdgeStyle(isSelected, stroke, edge.accessCount),
      markerEnd: marker(isSelected, stroke, markerSize),
    });
  }

  return result;
}

export function useModuleGraphInteractions({
  selectedModuleId,
  selectedEdgeId,
  onSelectModule,
  onSelectEdge,
  onDrillDown,
}: Pick<ModuleGraphProps, 'selectedModuleId' | 'selectedEdgeId' | 'onSelectModule'
  | 'onSelectEdge' | 'onDrillDown'>): {
    readonly onNodeClick: (_event: ReactMouseEvent, node: Node) => void;
    readonly onEdgeClick: (_event: ReactMouseEvent, edge: Edge) => void;
    readonly onPaneClick: () => void;
    readonly onNodeDoubleClick: (_event: ReactMouseEvent, node: Node) => void;
  } {
  const onNodeClick = useCallback((_event: ReactMouseEvent, node: Node) => {
    if (node.data.isOutOfView === true) return;
    onSelectEdge(null);
    onSelectModule(node.id === selectedModuleId ? null : node.id);
  }, [onSelectEdge, onSelectModule, selectedModuleId]);

  const onEdgeClick = useCallback((_event: ReactMouseEvent, edge: Edge) => {
    const edgeData = edge.data as GraphSelection | undefined;
    if (!edgeData) return;
    if (selectedEdgeId === edge.id) {
      onSelectEdge(null);
      return;
    }
    onSelectModule(null);
    onSelectEdge(edgeData);
  }, [onSelectEdge, onSelectModule, selectedEdgeId]);

  const onPaneClick = useCallback(() => {
    onSelectModule(null);
    onSelectEdge(null);
  }, [onSelectEdge, onSelectModule]);

  const onNodeDoubleClick = useCallback((_event: ReactMouseEvent, node: Node) => {
    if (node.data.isOutOfView !== true) onDrillDown?.(node.id);
  }, [onDrillDown]);

  return { onNodeClick, onEdgeClick, onPaneClick, onNodeDoubleClick };
}

function getEdgeStroke(status: ExplorerEdge['status'], allowedStroke: string): string {
  if (status === 'denied') return '#ef4444';
  if (status === 'limited') return '#f59e0b';
  return allowedStroke;
}

function getStrokeWidth(accessCount: number): number {
  const safeCount = Math.max(1, accessCount);
  return Math.min(6, 1.4 + Math.log2(safeCount + 1) * 1.1);
}

function selectedEdgeStyle(selected: boolean, stroke: string, accessCount: number): Edge['style'] {
  return {
    stroke: selected ? '#1d4ed8' : stroke,
    strokeWidth: getStrokeWidth(accessCount),
    filter: selected ? 'drop-shadow(0 0 4px rgba(30, 64, 175, 0.5))' : undefined,
  };
}

function marker(selected: boolean, stroke: string, size: number): Edge['markerEnd'] {
  return {
    type: MarkerType.ArrowClosed,
    color: selected ? '#1d4ed8' : stroke,
    width: size,
    height: size,
  };
}
