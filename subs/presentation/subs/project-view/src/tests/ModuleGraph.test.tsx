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
import { flowDashArray, type GraphSelection } from '../moduleGraphShared.js';
import type { ExplorerModule } from '../interfaces/project-view.js';
import {
  dependencyScope,
  linkWidth,
  ownSourceNodeId,
  maximumLinkWidth,
  minimumLinkWidth,
  scopeDependencyLinks,
  type ActiveDependencyEdge,
} from '../dependency-graph.js';
import { indexModuleTree } from '../module-tree.js';
import type { DependencyGraphModel, DependencySettings } from '../interfaces/dependency-view.js';
import type { ProjectExplorerModel } from '../interfaces/project-view.js';
import {
  forwardingProject,
  mappedDependencyModels,
  nestedLevelsDependencies,
  nestedLevelsProject,
} from './dependency-fixtures.js';

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
  const edgeId = 'dependency-edge/1:original-owner:a-b';

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
    edges.push({ ...edges[0]!, id: 'dependency-edge/1:original-owner:b-a', consumer: 'b', provider: 'a', displayed: 12 });
    renderGraph({ edges });
    const graphEdges = getLastReactFlowProps().edges as Array<Record<string, any>>;
    expect(graphEdges[0].animated).toBe(false);
    expect(graphEdges[1].animated).toBe(false);
    expect(graphEdges[1].style.strokeWidth).toBeGreaterThan(graphEdges[0].style.strokeWidth);
  });

  it('BD33 encodes behavior and status as colour and count as a bounded logarithmic width, with directional dashes', () => {
    const { forwarding } = mappedDependencyModels();
    const forwardingModel = forwardingProject();
    const nestedModel = nestedLevelsProject();
    const nested = nestedLevelsDependencies();
    const rolled = scopedLinks(forwardingModel, forwarding, 'level');
    const exact = scopedLinks(forwardingModel, forwarding, 'exact');
    const nestedRolled = scopedLinks(nestedModel, nested, 'level');
    const nestedExact = scopedLinks(nestedModel, nested, 'exact');
    const pick = (links: readonly ActiveDependencyEdge[], consumer: string, provider: string) =>
      links.find((link) => link.consumer === consumer && link.provider === provider)!;

    // Behavioral and allowed: the full-strength neutral colour.
    const allowed = pick(rolled, 'app/b', 'app/c');
    expect(allowed).toMatchObject({ behavioral: 1, nonBehavioral: 0, emphasis: 'behavioral', status: 'allowed' });
    expect(strokeOf(forwardingModel, allowed)).toBe('#64748b');
    // Behavioral and denied: the full-strength red.
    const denied = pick(rolled, 'app/a', 'app/b');
    expect(denied).toMatchObject({ emphasis: 'behavioral', status: 'denied' });
    expect(strokeOf(forwardingModel, denied)).toBe('#ef4444');
    // Non-behavioral only and limited: the lighter amber.
    const limited = pick(rolled, 'app/a', 'app/c');
    expect(limited).toMatchObject({ behavioral: 0, nonBehavioral: 1, emphasis: 'non-behavioral', status: 'limited' });
    expect(strokeOf(forwardingModel, limited)).toBe('#fcd34d');
    // Non-behavioral only and allowed: the lighter neutral, muted.
    const muted = pick(exact, 'app/b/core', 'app/b');
    expect(muted).toMatchObject({ behavioral: 0, nonBehavioral: 1, emphasis: 'non-behavioral', status: 'allowed' });
    expect(strokeOf(forwardingModel, muted)).toBe('#cbd5e1');
    expect(styleOf(forwardingModel, muted).opacity).toBeLessThan(styleOf(forwardingModel, allowed).opacity);
    // Non-behavioral only and denied: the lighter red.
    const lightDenied = pick(nestedExact, 'app/a/left', 'app/b');
    expect(lightDenied).toMatchObject({ behavioral: 0, nonBehavioral: 1, emphasis: 'non-behavioral', status: 'denied' });
    expect(strokeOf(nestedModel, lightDenied)).toBe('#fca5a5');

    // The dash pattern is the direction animation, so every link carries it whatever its behavior.
    cleanup();
    renderComponent(<ModuleGraphRadial modules={nestedModel.modules} edges={nestedRolled} selectedModuleId={null}
      selectedEdgeId={null} onSelectModule={vi.fn()} onSelectEdge={vi.fn()} />);
    const drawn = getLastReactFlowProps().edges as Array<Record<string, any>>;
    expect(drawn).toHaveLength(nestedRolled.length);
    for (const link of drawn) expect(link.style.strokeDasharray).toBe(flowDashArray);
    expect(drawn.every((link: Record<string, any>) => link.animated === false)).toBe(true);

    // Status belongs to the contributing evidence, not to the settings.
    for (const showNonBehavioral of [false, true]) {
      const link = scopedLinks(forwardingModel, forwarding, 'level', { showNonBehavioral })
        .find((item) => item.consumer === 'app/a' && item.provider === 'app/b')!;
      expect(link).toMatchObject({ emphasis: 'behavioral', status: 'denied' });
    }

    // Width: logarithmic over the displayed count, bounded at both ends.
    const mixed = pick(nestedRolled, 'app/a', 'app/b');
    expect(mixed).toMatchObject({ behavioral: 2, nonBehavioral: 2, displayed: 4 });
    expect(linkWidth(1)).toBe(minimumLinkWidth);
    expect(linkWidth(2)).toBeGreaterThan(linkWidth(1));
    expect(linkWidth(4) - linkWidth(2)).toBeCloseTo(linkWidth(2) - linkWidth(1));
    expect(linkWidth(1_000_000)).toBe(maximumLinkWidth);
    expect(styleOf(nestedModel, mixed).strokeWidth).toBe(linkWidth(4));
    expect(styleOf(forwardingModel, allowed).strokeWidth).toBe(linkWidth(1));
  });

  it('BD37 sizes nodes by owned source files, independently of dependency settings', () => {
    const { forwarding } = mappedDependencyModels();
    const project = forwardingProject();
    const diameters: Array<Record<string, number>> = [];
    for (const settings of [
      { showNonBehavioral: false, depthMode: 'level' as const, showOutsideScope: true },
      { showNonBehavioral: true, depthMode: 'level' as const, showOutsideScope: true },
      { showNonBehavioral: false, depthMode: 'exact' as const, showOutsideScope: true },
      { showNonBehavioral: true, depthMode: 'exact' as const, showOutsideScope: false },
    ]) {
      cleanup();
      renderComponent(<ModuleGraphRadial modules={project.modules}
        edges={scopedLinks(project, forwarding, settings.depthMode, settings)} selectedModuleId={null}
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

  it('BD58 draws the own-source node as a distinct node with no sub-module count or drill-down', () => {
    const project = nestedLevelsProject();
    const dependencies = nestedLevelsDependencies();
    const tree = indexModuleTree(project.modules, project.rootModuleId);
    const frame = project.modules.find((module) => module.id === 'app/a')!;
    const children = project.modules.filter((module) => module.parent === 'app/a');
    const scope = dependencyScope(project, 'app/a', true);
    const edges = scopeDependencyLinks({ model: dependencies, scope, displayed: new Set(scope.nodes), tree,
      settings: { showNonBehavioral: true, depthMode: 'level', showOutsideScope: true, showOwnSourceNode: true } });
    const node = { id: ownSourceNodeId('app/a'), module: frame };
    const onDrillDown = vi.fn();
    const onSelectModule = vi.fn();
    const render = (own: typeof node | null) => (
      <ModuleGraphRadial modules={children} edges={own ? edges : edges
        .filter((edge) => edge.consumer !== node.id && edge.provider !== node.id)}
        ownSourceNode={own} selectedModuleId={null} selectedEdgeId={null}
        onSelectModule={onSelectModule} onSelectEdge={vi.fn()} onDrillDown={onDrillDown} />
    );
    const rendered = renderComponent(render(node));
    const nodes = getLastReactFlowProps().nodes as Array<Record<string, any>>;
    const drawn = nodes.find((item) => item.id === node.id)!;
    expect(drawn.data.name).toBe('a \u00b7 own source');
    expect(drawn.data.ownSourceModule).toBe('app/a');
    expect(drawn.data.isOwnSource).toBe(true);
    expect(drawn.data.subModuleCount).toBe(0);
    expect(nodes.filter((item) => item.data.isOwnSource === true)).toHaveLength(1);
    // Its link onto a child is drawn, because its node ID is among the graph's nodes.
    const graphEdges = getLastReactFlowProps().edges as Array<Record<string, any>>;
    expect(graphEdges.map((edge) => [edge.source, edge.target]))
      .toContainEqual([node.id, 'app/a/left']);

    // The node view renders the label, the identity attribute and a rounded square.
    const NodeView = getLastReactFlowProps().nodeTypes.moduleCircle as React.ComponentType<any>;
    const view = renderComponent(<NodeView id={node.id} data={drawn.data} />);
    const element = view.container.querySelector('[data-own-source]')!;
    expect(element.getAttribute('data-own-source')).toBe('app/a');
    expect(element.getAttribute('aria-label')).toBe('a \u00b7 own source');
    expect((element as HTMLElement).style.borderRadius).toBe('16px');
    expect(element.className).toContain('module-arch__radial-node--own-source');
    expect(element.textContent).toContain('a \u00b7 own source');
    const moduleData = nodes.find((item) => item.id === 'app/a/left')!.data;
    const moduleView = renderComponent(<NodeView id="app/a/left" data={moduleData} />);
    const moduleElement = moduleView.container.querySelector('.module-arch__radial-node')!;
    expect(moduleElement.getAttribute('data-own-source')).toBeNull();
    expect((moduleElement as HTMLElement).style.borderRadius).toBe('50%');

    // Activating it selects it; it is no drill-down target.
    fireEvent.click(screen.getByTestId(`mock-node-${node.id}`));
    expect(onSelectModule).toHaveBeenCalledWith(node.id);
    expect(onDrillDown).not.toHaveBeenCalled();

    // The displayed modules keep their diameters when the control is toggled.
    const diameters = (items: Array<Record<string, any>>) => Object.fromEntries(items
      .filter((item) => item.data.isOwnSource !== true).map((item) => [item.id, item.data.diameter]));
    const withNode = diameters(nodes);
    rendered.rerender(render(null));
    const withoutNodes = getLastReactFlowProps().nodes as Array<Record<string, any>>;
    expect(diameters(withoutNodes)).toEqual(withNode);
    expect(withoutNodes.some((item) => item.data.isOwnSource === true)).toBe(false);
  });

  it('labels the link unit of the drawn links', () => {
    const { forwarding } = mappedDependencyModels();
    const project = forwardingProject();
    const rendered = renderComponent(<ModuleGraphRadial modules={project.modules}
      edges={scopedLinks(project, forwarding, 'level')} selectedModuleId={null}
      selectedEdgeId={null} onSelectModule={vi.fn()} onSelectEdge={vi.fn()} />);
    expect(screen.getByText('Link unit: a module and everything under it')).toBeTruthy();
    rendered.rerender(<ModuleGraphRadial modules={project.modules}
      edges={scopedLinks(project, forwarding, 'exact')} selectedModuleId={null}
      selectedEdgeId={null} onSelectModule={vi.fn()} onSelectEdge={vi.fn()} />);
    expect(screen.getByText('Link unit: one exact consumer and original owner')).toBeTruthy();
  });

  it('renders module edges to out-of-view modules without making them selectable', () => {
    const outOfView = createModule('c', 'Module C', null, [], 'ui', 1, 0, 0, 0.1);
    const edge = { ...createEdges()[0]!, id: 'dependency-edge/1:original-owner:a-c', provider: 'c' };
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
    id: 'dependency-edge/1:original-owner:a-b',
    depthMode: 'exact',
    consumer: 'a',
    provider: 'b',
    behavioral: 1,
    nonBehavioral: 0,
    displayed: 1,
    emphasis: 'behavioral',
    status: 'allowed',
    leavesScope: false,
    coverageIds: [],
    sources: [{
      id: 'dependency-edge/1:original-owner:a-b', projection: 'original-owner', consumer: 'a', provider: 'b',
      counts: { behavioral: 1, nonBehavioral: 0 },
      importedThrough: [{ module: 'b', counts: { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 } }],
      evidence: [],
    }],
  }];
}

/** The links one project's whole scope draws, with every candidate node displayed. */
function scopedLinks(project: ProjectExplorerModel, model: DependencyGraphModel,
  depthMode: DependencySettings['depthMode'],
  overrides: Partial<DependencySettings> = {}): ActiveDependencyEdge[] {
  const scope = dependencyScope(project, null);
  return scopeDependencyLinks({
    model,
    scope,
    displayed: new Set(scope.nodes),
    tree: indexModuleTree(project.modules, project.rootModuleId),
    settings: { showNonBehavioral: true, depthMode, showOutsideScope: true, showOwnSourceNode: false,
      ...overrides },
  });
}

function styleOf(project: ProjectExplorerModel, link: ActiveDependencyEdge): Record<string, any> {
  cleanup();
  renderComponent(<ModuleGraphRadial modules={project.modules} edges={[link]} selectedModuleId={null}
    selectedEdgeId={null} onSelectModule={vi.fn()} onSelectEdge={vi.fn()} />);
  const edges = getLastReactFlowProps().edges as Array<Record<string, any>>;
  expect(edges).toHaveLength(1);
  return edges[0]!.style as Record<string, any>;
}

function strokeOf(project: ProjectExplorerModel, link: ActiveDependencyEdge): string {
  return styleOf(project, link).stroke as string;
}
