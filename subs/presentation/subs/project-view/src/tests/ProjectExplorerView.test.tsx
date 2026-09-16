/**
 * @vitest-environment jsdom
 *
 * Adapted from cucumber-viz
 * src/domains/module-architecture/ui/pages/ModuleArchitecturePageView.test.tsx at
 * 44b7f30e0fdfda79ead8363ef4c85c100e36fda0.
 */

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ProjectExplorerView from '../ProjectExplorerView.js';
import type {
  ExplorerAccess,
  ExplorerEdge,
  ExplorerExport,
  ExplorerModule,
  ProjectExplorerModel,
} from '../interfaces/project-view.js';
import type { GraphSelection, ModuleGraphProps } from '../moduleGraphShared.js';
import type { ExplorerDiscussionProps, ProjectExplorerViewProps } from '../ProjectExplorerView.js';

afterEach(cleanup);

describe('ProjectExplorerView', () => {
  it('renders module type checkboxes and toggles a type filter', () => {
    const onTogglePresentationClass = vi.fn();
    const { container } = render(
      <ProjectExplorerView {...createProps({ onTogglePresentationClass })} />,
    );
    fireEvent.click(within(container).getByRole('checkbox', { name: /Browser \+ Ui/i }));
    expect(onTogglePresentationClass).toHaveBeenCalledWith('browser+ui');
  });

  it('disables module type checkboxes when no modules exist for that type', () => {
    const { container } = render(<ProjectExplorerView {...createProps()} />);
    expect(within(container).getByRole('checkbox', { name: /^Ui/i })).toBeDisabled();
  });

  it('preserves selected module detail across re-renders', () => {
    const props = createProps({ selectedModuleId: 'a' });
    const { rerender } = render(<ProjectExplorerView {...props} />);
    expect(screen.getByText('Module A')).toBeInTheDocument();
    expect(screen.getByText('Export inventory')).toBeInTheDocument();
    rerender(<ProjectExplorerView {...props} />);
    expect(screen.getByText('Module A')).toBeInTheDocument();
    expect(screen.getByText('Export inventory')).toBeInTheDocument();
  });

  it('preserves selected edge detail across re-renders', () => {
    const edge = createEdges()[0];
    const selectedEdge: GraphSelection = { kind: 'edge', id: edge.id, edge };
    const props = createProps({ selectedEdge, selectedModuleId: null });
    const { rerender } = render(<ProjectExplorerView {...props} />);
    expect(screen.getByText('Dependency Edge')).toBeInTheDocument();
    expect(screen.getAllByText(/Module A\s*->\s*Module B/).length).toBeGreaterThan(0);
    expect(screen.getByText('Source accesses')).toBeInTheDocument();
    rerender(<ProjectExplorerView {...props} />);
    expect(screen.getByText('Dependency Edge')).toBeInTheDocument();
    expect(screen.getAllByText(/Module A\s*->\s*Module B/).length).toBeGreaterThan(0);
    expect(screen.getByText('Source accesses')).toBeInTheDocument();
  });

  it('renders "Chat with Claude" heading when a module is selected', () => {
    render(<ProjectExplorerView {...createProps({ selectedModuleId: 'a' })} />);
    expect(screen.getByText('Discussion for Module A')).toBeInTheDocument();
  });

  it('renders "Chat with Claude" heading when an edge is selected', () => {
    const edge = createEdges()[0];
    render(<ProjectExplorerView {...createProps({
      selectedEdge: { kind: 'edge', id: edge.id, edge },
      selectedModuleId: null,
    })} />);
    expect(screen.getByText('Discussion for Module A -> Module B')).toBeInTheDocument();
  });

  it('does not render chat section when nothing is selected', () => {
    const { container } = render(<ProjectExplorerView {...createProps({
      selectedModuleId: null,
      selectedEdge: null,
    })} />);
    const sidebar = container.querySelector('.module-arch__sidebar') as HTMLElement;
    expect(within(sidebar).queryByText(/^Discussion$/)).not.toBeInTheDocument();
    expect(within(sidebar).getByText(/Select a module or dependency edge/)).toBeInTheDocument();
    expect(within(sidebar).queryByText(/other target/i)).not.toBeInTheDocument();
  });

  it('shows composer placeholder with module name for module selection', () => {
    render(<ProjectExplorerView {...createProps({ selectedModuleId: 'a' })} />);
    expect(screen.getByPlaceholderText('Ask about Module A...')).toBeInTheDocument();
  });

  it('shows composer placeholder with edge direction for edge selection', () => {
    const edge = createEdges()[0];
    render(<ProjectExplorerView {...createProps({
      selectedEdge: { kind: 'edge', id: edge.id, edge },
      selectedModuleId: null,
    })} />);
    expect(screen.getByPlaceholderText('Ask about Module A -> Module B...')).toBeInTheDocument();
  });

  it('renders Send button in the composer', () => {
    render(<ProjectExplorerView {...createProps({ selectedModuleId: 'a' })} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  describe('Refresh button staleness', () => {
    it('disables Refresh button when not stale', () => {
      const { container } = render(<ProjectExplorerView {...createProps({ isStale: false })} />);
      const actions = container.querySelector('.module-arch__header-actions') as HTMLElement;
      expect(within(actions).getByRole('button', { name: 'Refresh' })).toBeDisabled();
    });

    it('enables Refresh button with stale modifier when stale', () => {
      const { container } = render(<ProjectExplorerView {...createProps({ isStale: true })} />);
      const actions = container.querySelector('.module-arch__header-actions') as HTMLElement;
      const button = within(actions).getByRole('button', { name: 'Refresh (stale)' });
      expect(button).not.toBeDisabled();
      expect(button.className).toContain('module-arch__refresh-btn--stale');
    });

    it('renders Retry button always enabled in error state regardless of staleness', () => {
      render(<ProjectExplorerView {...createProps({
        error: new Error('test failure'),
        data: null,
        isLoading: false,
      })} />);
      expect(screen.getByRole('button', { name: 'Retry' })).not.toBeDisabled();
    });
  });

  it('renders the single-root overview, breadcrumbs, drill-down and out-of-view modules', () => {
    const onNavigateToScope = vi.fn();
    const onDrillDown = vi.fn();
    render(<ProjectExplorerView {...createProps({
      breadcrumbTrail: [{ id: null, label: 'Project' }, { id: 'root', label: 'Root' }],
      onNavigateToScope,
      onDrillDown,
    })} />);
    const graph = screen.getByTestId('mock-module-graph');
    expect(graph).toHaveAttribute('data-modules', 'a,b');
    expect(graph).toHaveAttribute('data-out-of-view', 'root');
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    expect(onNavigateToScope).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Drill into Module A' }));
    expect(onDrillDown).toHaveBeenCalledWith('a');
  });

  it('renders a module hierarchy with zero dependency edges as a normal view', () => {
    render(<ProjectExplorerView {...createProps({ data: noDependencyModel() })} />);
    const graph = screen.getByTestId('mock-module-graph');
    expect(graph).toHaveAttribute('data-modules', 'a,b');
    expect(graph).toHaveAttribute('data-edges', '');
    expect(screen.getByText(/Showing 2 of 4 modules, 0 module dependencies/)).toBeInTheDocument();
    expect(screen.queryByText('No modules found')).not.toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it('resizes the sidebar and retains its detail', () => {
    const { container, rerender } = render(
      <ProjectExplorerView {...createProps({ selectedModuleId: 'a' })} />,
    );
    const content = container.querySelector('.module-arch__content') as HTMLDivElement;
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 500,
      width: 1000, height: 500, toJSON: () => ({}),
    });
    fireEvent.mouseDown(screen.getByRole('separator', { name: 'Resize sidebar' }));
    fireEvent.mouseMove(document, { clientX: 520 });
    fireEvent.mouseUp(document);
    expect((container.querySelector('.module-arch__sidebar') as HTMLElement).style.width).toBe('480px');
    rerender(<ProjectExplorerView {...createProps({ selectedModuleId: 'a' })} />);
    expect(screen.getByText('Module A')).toBeInTheDocument();
  });

  it('renders loading, empty and unavailable states distinctly', () => {
    const rendered = render(<ProjectExplorerView {...createProps({ isLoading: true, data: null })} />);
    expect(screen.getByText('Loading project view...')).toBeInTheDocument();
    rendered.rerender(<ProjectExplorerView {...createProps({ data: emptyModel() })} />);
    expect(screen.getByText('No modules found')).toBeInTheDocument();
    rendered.rerender(<ProjectExplorerView {...createProps({
      data: null,
      unavailableReason: 'report exceeded the response limit',
    })} />);
    expect(screen.getAllByText('Project view unavailable').length).toBeGreaterThan(0);
    expect(screen.getByText('report exceeded the response limit')).toBeInTheDocument();
  });

  it('shows export aliases, capability, exposures, locations and every signature result state', () => {
    const onToggleExport = vi.fn();
    const base = createProps({
      selectedModuleId: 'a',
      expandedExportId: 'export-a',
      onToggleExport,
      exportDetail: { state: 'loading' },
      DiscussionComponent: undefined,
    });
    const rendered = render(<ProjectExplorerView {...base} />);
    expect(screen.getByText('Alpha, PublicAlpha')).toBeInTheDocument();
    expect(screen.getAllByText('value + type').length).toBeGreaterThan(0);
    expect(screen.getByText('parent')).toBeInTheDocument();
    expect(screen.getByText('subs/a/src/index.ts:2:3')).toBeInTheDocument();
    expect(screen.getByText('Loading signature...')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    expect(onToggleExport).toHaveBeenCalledWith(createExports()[0]);

    rendered.rerender(<ProjectExplorerView {...base}
      exportDetail={{ state: 'described', signature: 'export declare const Alpha: Alpha;', documentation: 'Alpha docs.' }} />);
    expect(screen.getByText('export declare const Alpha: Alpha;')).toBeInTheDocument();
    expect(screen.getByText('Alpha docs.')).toBeInTheDocument();
    rendered.rerender(<ProjectExplorerView {...base}
      exportDetail={{ state: 'truncated', signature: 'export declare...', truncated: ['signature', 'overloads'] }} />);
    expect(screen.getByText('Truncated: signature, overloads')).toBeInTheDocument();
    rendered.rerender(<ProjectExplorerView {...base}
      exportDetail={{ state: 'unavailable', reason: 'compiler released' }} />);
    expect(screen.getByText('Signature unavailable: compiler released')).toBeInTheDocument();
  });

  it('shows decision reasons and coverage limits for a module edge', () => {
    const edge = createEdges()[0];
    render(<ProjectExplorerView {...createProps({
      selectedModuleId: null,
      selectedEdge: { kind: 'edge', id: edge.id, edge },
    })} />);
    expect(screen.getAllByText('denied').length).toBeGreaterThan(0);
    expect(screen.getAllByText('not-visible').length).toBeGreaterThan(0);
    expect(screen.getByText('unresolved-original')).toBeInTheDocument();
    expect(screen.queryByText('Other target')).not.toBeInTheDocument();
  });

  it('renders independently without a discussion component', () => {
    render(<ProjectExplorerView {...createProps({
      selectedModuleId: 'a',
      DiscussionComponent: undefined,
    })} />);
    expect(screen.getByText('Module A')).toBeInTheDocument();
    expect(screen.queryByText(/^Discussion$/)).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-module-graph')).toBeInTheDocument();
  });
});

type Overrides = Partial<ProjectExplorerViewProps>;

function createProps(overrides: Overrides = {}): ProjectExplorerViewProps {
  return {
    data: overrides.data === undefined ? createModel() : overrides.data,
    isLoading: overrides.isLoading ?? false,
    error: overrides.error === undefined ? null : overrides.error,
    unavailableReason: overrides.unavailableReason ?? null,
    selectedModuleId: overrides.selectedModuleId ?? null,
    selectedEdge: overrides.selectedEdge ?? null,
    expandedExportId: overrides.expandedExportId ?? null,
    exportDetail: overrides.exportDetail ?? { state: 'idle' },
    selectedPresentationClasses: overrides.selectedPresentationClasses
      ?? ['browser+ui', 'dispatch', 'ui', 'untagged'],
    expandedDependencyId: overrides.expandedDependencyId ?? null,
    GraphComponent: overrides.GraphComponent ?? MockGraph,
    DiscussionComponent: 'DiscussionComponent' in overrides
      ? overrides.DiscussionComponent
      : MockDiscussion,
    onSelectModule: overrides.onSelectModule ?? vi.fn(),
    onSelectEdge: overrides.onSelectEdge ?? vi.fn(),
    onToggleExport: overrides.onToggleExport ?? vi.fn(),
    onTogglePresentationClass: overrides.onTogglePresentationClass ?? vi.fn(),
    onRefresh: overrides.onRefresh ?? vi.fn(),
    onToggleDependency: overrides.onToggleDependency ?? vi.fn(),
    isStale: overrides.isStale ?? false,
    scopeModuleId: overrides.scopeModuleId ?? null,
    breadcrumbTrail: overrides.breadcrumbTrail ?? [],
    onDrillDown: overrides.onDrillDown ?? vi.fn(),
    onNavigateToScope: overrides.onNavigateToScope ?? vi.fn(),
  };
}

function MockGraph(props: ModuleGraphProps): React.ReactElement {
  return (
    <div data-testid="mock-module-graph"
      data-modules={props.modules.map((module) => module.id).join(',')}
      data-edges={props.edges.map((edge) => edge.id).join(',')}
      data-out-of-view={props.outOfViewModules?.map((module) => module.id).join(',')}>
      {props.modules.map((module) => (
        <button key={module.id} type="button" onClick={() => props.onDrillDown?.(module.id)}>
          Drill into {module.name}
        </button>
      ))}
    </div>
  );
}

function MockDiscussion({ contextLabel }: ExplorerDiscussionProps): React.ReactElement {
  return (
    <section>
      <h4>Discussion for {contextLabel}</h4>
      <input aria-label="Discussion message" placeholder={`Ask about ${contextLabel}...`} />
      <button type="button">Send</button>
    </section>
  );
}

function createModel(): ProjectExplorerModel {
  const modules = createModules();
  return {
    revision: 'revision-7',
    rootModuleId: 'root',
    state: 'partial',
    registry: { id: 'registry', definitions: [], isDefault: true },
    modules,
    edges: createEdges(),
    coverage: [{
      limit: {
        id: 'coverage-1',
        code: 'unresolved-original',
        location: location('subs/a/src/consumer.ts', 4, 2),
        message: 'One selected original could not be resolved.',
        related: [],
      },
      moduleIds: ['a'],
      edgeIds: ['a->b'],
    }],
    summary: {
      owners: modules.length,
      ownedFiles: 6,
      edges: 2,
      accessOccurrences: 2,
      selectedSymbols: 2,
      deniedAccesses: 1,
      limitedAccesses: 1,
      coverageNotes: 1,
    },
  };
}

function emptyModel(): ProjectExplorerModel {
  return { ...createModel(), modules: [], edges: [], coverage: [], summary: {
    owners: 0, ownedFiles: 0, edges: 0, accessOccurrences: 0,
    selectedSymbols: 0, deniedAccesses: 0, limitedAccesses: 0, coverageNotes: 0,
  } };
}

function noDependencyModel(): ProjectExplorerModel {
  const model = createModel();
  return {
    ...model,
    modules: model.modules.map((module) => ({
      ...module,
      metrics: {
        ...module.metrics,
        dependencies: 0,
        dependents: 0,
        accessOccurrences: 0,
        selectedSymbols: 0,
        deniedAccesses: 0,
        limitedAccesses: 0,
      },
    })),
    edges: [],
    coverage: [],
    summary: {
      ...model.summary,
      edges: 0,
      accessOccurrences: 0,
      selectedSymbols: 0,
      deniedAccesses: 0,
      limitedAccesses: 0,
      coverageNotes: 0,
    },
  };
}

function createModules(): ExplorerModule[] {
  return [
    createModule('root', 'Root', null, ['a', 'b'], 'untagged', 1, 6, []),
    createModule('a', 'Module A', 'root', ['c'], 'browser+ui', 2, 3, createExports()),
    createModule('b', 'Module B', 'root', [], 'dispatch', 2, 2, []),
    createModule('c', 'Module C', 'a', [], 'ui', 1, 1, []),
  ];
}

function createModule(id: string, name: string, parent: string | null, children: string[],
  presentationClass: string, ownedFiles: number, subtreeFiles: number,
  exports: readonly ExplorerExport[]): ExplorerModule {
  return {
    id,
    name,
    directory: id === 'root' ? '.' : `subs/${id}`,
    parent,
    children,
    tags: presentationClass === 'untagged' ? [] : presentationClass.split('+'),
    presentationClass,
    purpose: { state: 'present', readme: `${id}/README.md`, paragraph: `${name} purpose.` },
    files: [],
    exports,
    metrics: {
      ownedFiles,
      subtreeFiles,
      dependencies: id === 'a' ? 2 : 0,
      dependents: id === 'b' ? 1 : 0,
      accessOccurrences: id === 'a' ? 2 : 0,
      selectedSymbols: id === 'a' ? 1 : 0,
      deniedAccesses: id === 'a' ? 1 : 0,
      limitedAccesses: 0,
      approximateIcs: id === 'a' ? 0.4 : 0.1,
    },
  };
}

function createEdges(): ExplorerEdge[] {
  const access = createAccess('access-a-b', 'subs/b/src/index.ts', './b', 'denied', ['not-visible']);
  return [{
    id: 'a->b',
    consumer: 'a',
    provider: 'b',
    consumerFiles: ['subs/a/src/consumer.ts'],
    providerFiles: ['subs/b/src/index.ts'],
    accessCount: 1,
    symbolCount: 1,
    accesses: [access],
    status: 'denied',
    reasons: ['not-visible'],
    coverageIds: ['coverage-1'],
  }, {
    id: 'a->root',
    consumer: 'a',
    provider: 'root',
    consumerFiles: ['subs/a/src/consumer.ts'],
    providerFiles: ['src/index.ts'],
    accessCount: 1,
    symbolCount: 0,
    accesses: [],
    status: 'allowed',
    reasons: ['exposed'],
    coverageIds: [],
  }];
}

function createAccess(id: string, targetFile: string | null, specifier: string,
  status: ExplorerAccess['status'], reasons: ExplorerAccess['reasons']): ExplorerAccess {
  return {
    id,
    importerFile: 'subs/a/src/consumer.ts',
    targetFile,
    specifier,
    writtenForm: 'import',
    selectionForm: 'named',
    runtimeLoad: true,
    selections: [{
      exportedName: 'Alpha',
      localName: null,
      original: null,
      request: 'value',
      explicitType: false,
      forwarding: [],
      status: status === 'limited' ? 'unresolved' : 'resolved',
      location: location('subs/a/src/consumer.ts', 4, 10),
    }],
    status,
    reasons,
    coverageIds: status === 'limited' ? ['coverage-1'] : [],
    location: location('subs/a/src/consumer.ts', 4, 1),
  };
}

function createExports(): ExplorerExport[] {
  return [{
    id: 'export-a',
    name: 'Alpha',
    aliases: ['Alpha', 'PublicAlpha'],
    original: { kind: 'code', owner: 'a', file: 'subs/a/src/index.ts', binding: 'Alpha' },
    file: 'subs/a/src/index.ts',
    locations: [location('subs/a/src/index.ts', 2, 3)],
    capability: 'value-and-type',
    tags: ['ui'],
    forwarded: true,
    exposures: [{
      module: 'a',
      names: ['Alpha'],
      destinations: ['parent'],
      provider: null,
      effective: true,
      evidence: [location('subs/a/module.ramify', 3, 1)],
    }],
    signature: { state: 'loadable', request: {
      original: { kind: 'code', owner: 'a', file: 'subs/a/src/index.ts', binding: 'Alpha' },
      exportName: 'Alpha',
    } },
  }];
}

function location(file: string, line: number, column: number) {
  return { file, start: 0, end: 1, line, column };
}
