/**
 * @vitest-environment jsdom
 *
 * Adapted from cucumber-viz
 * src/domains/module-architecture/ui/components/ModuleGraph.test.tsx at
 * 44b7f30e0fdfda79ead8363ef4c85c100e36fda0.
 */

import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as renderComponent, screen } from '@testing-library/react';
import { ModuleGraphRadial } from '../ModuleGraphRadial.js';
import { getPresentationClassColor } from '../moduleTypePresentation.js';
import type { GraphSelection } from '../moduleGraphShared.js';
import type { ExplorerEdge, ExplorerModule } from '../interfaces/project-view.js';

const reactFlowPropsHistory: Array<Record<string, unknown>> = [];

vi.mock('@xyflow/react', () => {
  function ReactFlow(props: Record<string, any>) {
    reactFlowPropsHistory.push(props);
    const [zoom, setZoom] = useState(1);
    return (
      <div data-testid="mock-reactflow">
        <button data-testid="mock-zoom" onClick={() => setZoom((value) => value + 1)}>zoom</button>
        <span data-testid="mock-zoom-level">{zoom}</span>
        <button data-testid="mock-pane" onClick={() => props.onPaneClick?.()}>pane</button>
        {(props.nodes ?? []).map((node: Record<string, any>) => (
          <button key={node.id} data-testid={`mock-node-${node.id}`}
            onClick={() => props.onNodeClick?.({}, node)}>{node.id}</button>
        ))}
        {(props.edges ?? []).map((edge: Record<string, any>) => (
          <button key={edge.id} data-testid={`mock-edge-${edge.id}`}
            onClick={() => props.onEdgeClick?.({}, edge)}>{edge.id}</button>
        ))}
        {props.children}
      </div>
    );
  }
  function Background() { return <div data-testid="mock-background" />; }
  function Controls() { return <div data-testid="mock-controls" />; }
  function MiniMap() { return <div data-testid="mock-minimap" />; }
  function Handle() { return null; }
  return {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Handle,
    Position: { Top: 'top', Bottom: 'bottom' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    BackgroundVariant: { Dots: 'dots' },
  };
});

describe('ModuleGraphRadial', () => {
  const edgeId = '4:edge1:a1:b';

  beforeEach(() => {
    cleanup();
    reactFlowPropsHistory.length = 0;
  });

  it('renders radial layout', () => {
    renderGraph();
    const lastProps = getLastReactFlowProps();
    const nodes = lastProps.nodes as Array<Record<string, any>>;
    const edges = lastProps.edges as Array<Record<string, any>>;
    expect(nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(nodes.every((node) => node.type === 'moduleCircle')).toBe(true);
    expect(nodes[0].data.subModuleCount).toBe(1);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      id: edgeId,
      source: 'a',
      target: 'b',
      type: 'chordArrow',
      data: { kind: 'edge', id: edgeId, edge: createEdges()[0] },
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    expect(edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))).toBe(true);
    expect(screen.getByTestId('mock-background')).toBeTruthy();
    expect(screen.getByTestId('mock-controls')).toBeTruthy();
    expect(screen.getByTestId('mock-minimap')).toBeTruthy();
  });

  it('provides module-type color metadata', () => {
    renderGraph();
    const nodes = getLastReactFlowProps().nodes as Array<Record<string, any>>;
    expect(nodes[0].data.presentationClass).toBe('browser+ui');
    expect(nodes[0].data.presentationClassColor).toBe(getPresentationClassColor('browser+ui'));
    expect(screen.getByText('Tags: Browser + Ui')).toBeTruthy();
  });

  it('node click selects module and clears edge', () => {
    const onSelectModule = vi.fn();
    const onSelectEdge = vi.fn();
    renderGraph({ onSelectModule, onSelectEdge });
    fireEvent.click(screen.getByTestId('mock-node-a'));
    expect(onSelectEdge).toHaveBeenCalledWith(null);
    expect(onSelectModule).toHaveBeenCalledWith('a');
  });

  it('edge click emits GraphEdgeSelection payload shape', () => {
    const onSelectModule = vi.fn();
    const onSelectEdge = vi.fn();
    renderGraph({ onSelectModule, onSelectEdge });
    fireEvent.click(screen.getByTestId(`mock-edge-${edgeId}`));
    expect(onSelectModule).toHaveBeenCalledWith(null);
    expect(onSelectEdge).toHaveBeenCalledWith({ kind: 'edge', id: edgeId, edge: createEdges()[0] });
  });

  it('pane click clears both selections', () => {
    const onSelectModule = vi.fn();
    const onSelectEdge = vi.fn();
    renderGraph({ onSelectModule, onSelectEdge });
    fireEvent.click(screen.getByTestId('mock-pane'));
    expect(onSelectModule).toHaveBeenCalledWith(null);
    expect(onSelectEdge).toHaveBeenCalledWith(null);
  });

  it('clicking selected edge toggles it off', () => {
    const onSelectModule = vi.fn();
    const onSelectEdge = vi.fn();
    renderGraph({ selectedEdgeId: edgeId, onSelectModule, onSelectEdge });
    fireEvent.click(screen.getByTestId(`mock-edge-${edgeId}`));
    expect(onSelectEdge).toHaveBeenCalledWith(null);
    expect(onSelectModule).not.toHaveBeenCalled();
  });

  it('scales edge thickness by access count and disables animation', () => {
    const edges = createEdges();
    edges.push({ ...edges[0], id: '4:edge1:b1:a', consumer: 'b', provider: 'a', accessCount: 12 });
    renderGraph({ edges });
    const graphEdges = getLastReactFlowProps().edges as Array<Record<string, any>>;
    expect(graphEdges[0].animated).toBe(false);
    expect(graphEdges[1].animated).toBe(false);
    expect(graphEdges[1].style.strokeWidth).toBeGreaterThan(graphEdges[0].style.strokeWidth);
  });

  it('renders module edges to out-of-view modules without making them selectable', () => {
    const outOfView = createModule('c', 'Module C', null, [], 'ui', 1, 0, 0, 0.1);
    const edge = { ...createEdges()[0], id: '4:edge1:a1:c', provider: 'c' };
    const onSelectModule = vi.fn();
    renderGraph({ edges: [edge], outOfViewModules: [outOfView], onSelectModule });
    const graph = getLastReactFlowProps();
    const nodes = graph.nodes as Array<Record<string, any>>;
    const edges = graph.edges as Array<Record<string, any>>;
    expect(nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'a', target: 'c', data: { kind: 'edge', edge } });
    expect(screen.getByTestId('mock-node-c')).toBeTruthy();
    expect(screen.getByTestId(`mock-edge-${edge.id}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId('mock-node-c'));
    expect(onSelectModule).not.toHaveBeenCalled();
  });

  it('preserves graph framework state while presentation-class filtering rerenders', () => {
    const rendered = renderGraph();
    fireEvent.click(screen.getByTestId('mock-zoom'));
    expect(screen.getByTestId('mock-zoom-level').textContent).toBe('2');
    rendered.rerender(graph(createModules().slice(0, 1)));
    expect(screen.getByTestId('mock-zoom-level').textContent).toBe('2');
    expect(screen.queryByTestId('mock-node-b')).toBeNull();
    expect(screen.getByText('Tags: Browser + Ui')).toBeTruthy();
    expect(screen.queryByText('Tags: Dispatch')).toBeNull();
  });

  it('renders a module hierarchy with zero dependency edges', () => {
    renderGraph({ edges: [] });
    const graph = getLastReactFlowProps();
    expect((graph.nodes as Array<Record<string, any>>).map((node) => node.id)).toEqual(['a', 'b']);
    expect(graph.edges).toEqual([]);
  });
});

interface RenderOverrides {
  readonly selectedModuleId?: string | null;
  readonly selectedEdgeId?: string | null;
  readonly edges?: ExplorerEdge[];
  readonly outOfViewModules?: ExplorerModule[];
  readonly onSelectModule?: (id: string | null) => void;
  readonly onSelectEdge?: (edge: GraphSelection | null) => void;
}

function renderGraph(overrides: RenderOverrides = {}): ReturnType<typeof renderComponent> {
  return renderComponent(graph(createModules(), overrides));
}

function graph(modules: ExplorerModule[], overrides: RenderOverrides = {}) {
  return (
    <ModuleGraphRadial
      modules={modules}
      edges={overrides.edges ?? createEdges()}
      outOfViewModules={overrides.outOfViewModules}
      selectedModuleId={overrides.selectedModuleId ?? null}
      selectedEdgeId={overrides.selectedEdgeId ?? null}
      onSelectModule={overrides.onSelectModule ?? vi.fn()}
      onSelectEdge={overrides.onSelectEdge ?? vi.fn()}
    />
  );
}

function getLastReactFlowProps(): Record<string, any> {
  const lastProps = reactFlowPropsHistory.at(-1);
  expect(lastProps).toBeDefined();
  return lastProps as Record<string, any>;
}

function createModules(): ExplorerModule[] {
  return [
    createModule('a', 'Module A', null, ['b'], 'browser+ui', 2, 1, 0, 0.3),
    createModule('b', 'Module B', 'a', [], 'dispatch', 1, 0, 1, 0.8),
  ];
}

function createModule(id: string, name: string, parent: string | null, children: string[],
  presentationClass: string, ownedFiles: number, limitedAccesses: number,
  deniedAccesses: number, approximateIcs: number): ExplorerModule {
  return {
    id,
    name,
    directory: `subs/${id}`,
    parent,
    children,
    tags: presentationClass === 'untagged' ? [] : presentationClass.split('+'),
    presentationClass,
    purpose: { state: 'present', readme: `subs/${id}/README.md`, paragraph: `${name} purpose.` },
    files: [],
    exports: [],
    metrics: {
      ownedFiles,
      subtreeFiles: ownedFiles,
      dependencies: id === 'a' ? 1 : 0,
      dependents: id === 'b' ? 1 : 0,
      accessOccurrences: id === 'a' ? 1 : 0,
      selectedSymbols: id === 'a' ? 1 : 0,
      deniedAccesses,
      limitedAccesses,
      approximateIcs,
    },
  };
}

function createEdges(): ExplorerEdge[] {
  return [{
    id: '4:edge1:a1:b',
    consumer: 'a',
    provider: 'b',
    consumerFiles: ['subs/a/src/consumer.ts'],
    providerFiles: ['subs/b/src/index.ts'],
    accessCount: 1,
    symbolCount: 1,
    accesses: [],
    status: 'allowed',
    reasons: ['exposed'],
    coverageIds: [],
  }];
}
