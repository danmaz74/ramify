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
import { dottedDashArray, type GraphSelection } from '../moduleGraphShared.js';
import type { ExplorerModule } from '../interfaces/project-view.js';
import {
  activeDependencyEdges,
  linkWidth,
  maximumLinkWidth,
  minimumLinkWidth,
  type ActiveDependencyEdge,
} from '../dependency-graph.js';
import { forwardingProject, mappedDependencyModels } from './dependency-fixtures.js';

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
  const edgeId = 'dependency-edge/1:imported-module:a-b';

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

  it('scales link width by the displayed classified count and disables animation', () => {
    const edges = createEdges();
    edges.push({ ...edges[0]!, id: 'dependency-edge/1:imported-module:b-a', consumer: 'b', provider: 'a', displayed: 12 });
    renderGraph({ edges });
    const graphEdges = getLastReactFlowProps().edges as Array<Record<string, any>>;
    expect(graphEdges[0].animated).toBe(false);
    expect(graphEdges[1].animated).toBe(false);
    expect(graphEdges[1].style.strokeWidth).toBeGreaterThan(graphEdges[0].style.strokeWidth);
  });

  it('BD33 encodes behavior as line pattern, status as colour and count as a bounded logarithmic width', () => {
    const { forwarding, bothBoundaries } = mappedDependencyModels();
    const project = forwardingProject();
    const mixed = activeDependencyEdges(bothBoundaries, { showNonBehavioral: true, linkTarget: 'imported-module' });
    const onlyNonBehavioral = activeDependencyEdges(forwarding, { showNonBehavioral: true, linkTarget: 'imported-module' });
    const edges = [...mixed, ...onlyNonBehavioral.filter((edge) => edge.provider === 'app/c' || edge.consumer === 'app/b/core')];
    renderComponent(<ModuleGraphRadial modules={project.modules} edges={edges} selectedModuleId={null}
      selectedEdgeId={null} onSelectModule={vi.fn()} onSelectEdge={vi.fn()} />);
    const drawn = getLastReactFlowProps().edges as Array<Record<string, any>>;
    expect(drawn).toHaveLength(edges.length);

    // bothBoundaries a -> b: 1 behavioral + 1 non-behavioral, allowed: solid, neutral colour.
    const mixedLink = drawn[0]!;
    expect(mixedLink.data.edge).toMatchObject({ consumer: 'app/a', provider: 'app/b', behavioral: 1, nonBehavioral: 1, displayed: 2 });
    expect(mixedLink.style.strokeDasharray).toBeUndefined();
    expect(mixedLink.style.stroke).toBe('#64748b');
    // bothBoundaries a -> c: behavioral, limited: still solid, amber.
    const limitedLink = drawn[1]!;
    expect(limitedLink.data.edge).toMatchObject({ provider: 'app/c', status: 'limited', pattern: 'solid' });
    expect(limitedLink.style.strokeDasharray).toBeUndefined();
    expect(limitedLink.style.stroke).toBe('#f59e0b');
    // forwarding a -> c: non-behavioral only with denied evidence: dotted, and the colour still shows denied.
    const deniedDotted = drawn.find((edge) => edge.data.edge.status === 'denied')!;
    expect(deniedDotted.data.edge).toMatchObject({ behavioral: 0, nonBehavioral: 2, pattern: 'dotted' });
    expect(deniedDotted.style.strokeDasharray).toBe(dottedDashArray);
    expect(deniedDotted.style.stroke).toBe('#ef4444');
    // forwarding b/core -> b: non-behavioral only, allowed: dotted and muted.
    const muted = drawn.find((edge) => edge.source === 'app/b/core' && edge.target === 'app/b')!;
    expect(muted.style.strokeDasharray).toBe(dottedDashArray);
    expect(muted.style.stroke).toBe('#cbd5e1');
    expect(muted.style.opacity).toBeLessThan(mixedLink.style.opacity);

    // Status is a property of the edge's evidence, not of the settings: the owner link a -> b/core is
    // behavioral through b (allowed) and non-behavioral through c (denied), and stays denied when hidden paths are off.
    for (const showNonBehavioral of [false, true]) {
      const ownerLink = activeDependencyEdges(forwarding, { showNonBehavioral, linkTarget: 'original-owner' })
        .find((edge) => edge.consumer === 'app/a' && edge.provider === 'app/b/core')!;
      expect(ownerLink).toMatchObject({ pattern: 'solid', status: 'denied' });
    }

    // Width: logarithmic over the displayed count, bounded at both ends.
    expect(linkWidth(1)).toBe(minimumLinkWidth);
    expect(linkWidth(2)).toBeGreaterThan(linkWidth(1));
    expect(linkWidth(4) - linkWidth(2)).toBeCloseTo(linkWidth(2) - linkWidth(1));
    expect(linkWidth(1_000_000)).toBe(maximumLinkWidth);
    expect(mixedLink.style.strokeWidth).toBe(linkWidth(2));
    expect(deniedDotted.style.strokeWidth).toBe(linkWidth(2));
  });

  it('BD37 sizes nodes by owned source files, independently of dependency settings', () => {
    const { forwarding } = mappedDependencyModels();
    const project = forwardingProject();
    const diameters: Array<Record<string, number>> = [];
    for (const settings of [
      { showNonBehavioral: false, linkTarget: 'imported-module' as const },
      { showNonBehavioral: true, linkTarget: 'imported-module' as const },
      { showNonBehavioral: false, linkTarget: 'original-owner' as const },
      { showNonBehavioral: true, linkTarget: 'original-owner' as const },
    ]) {
      cleanup();
      renderComponent(<ModuleGraphRadial modules={project.modules}
        edges={activeDependencyEdges(forwarding, settings)} selectedModuleId={null}
        selectedEdgeId={null} onSelectModule={vi.fn()} onSelectEdge={vi.fn()} />);
      const nodes = getLastReactFlowProps().nodes as Array<Record<string, any>>;
      diameters.push(Object.fromEntries(nodes.map((node) => [node.id, node.data.diameter])));
      expect(nodes.every((node) => !('complexityScore' in node.data))).toBe(true);
    }
    expect(diameters.every((item) => JSON.stringify(item) === JSON.stringify(diameters[0]))).toBe(true);
    // Source files 1, 2, 3, 4 and 9 (resources excluded) order the diameters.
    const size = diameters[0]!;
    expect(size['app']).toBe(size['app/idle']);
    expect(size['app/a']!).toBeGreaterThan(size['app']!);
    expect(size['app/c']!).toBeGreaterThan(size['app/a']!);
    expect(size['app/b']!).toBeGreaterThan(size['app/c']!);
    expect(size['app/b/core']!).toBeGreaterThan(size['app/b']!);
    expect(Math.min(...Object.values(size))).toBe(84);
    expect(Math.max(...Object.values(size))).toBe(170);
  });

  it('renders module edges to out-of-view modules without making them selectable', () => {
    const outOfView = createModule('c', 'Module C', null, [], 'ui', 1, 0, 0, 0.1);
    const edge = { ...createEdges()[0]!, id: 'dependency-edge/1:imported-module:a-c', provider: 'c' };
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
  readonly edges?: ActiveDependencyEdge[];
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

function createEdges(): ActiveDependencyEdge[] {
  return [{
    id: 'dependency-edge/1:imported-module:a-b',
    projection: 'imported-module',
    consumer: 'a',
    provider: 'b',
    behavioral: 1,
    nonBehavioral: 0,
    displayed: 1,
    pattern: 'solid',
    status: 'allowed',
    source: {
      id: 'dependency-edge/1:imported-module:a-b', projection: 'imported-module', consumer: 'a', provider: 'b',
      counts: { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 },
      originalOwners: [{ owner: 'b', counts: { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 } }],
      evidence: [],
    },
  }];
}
