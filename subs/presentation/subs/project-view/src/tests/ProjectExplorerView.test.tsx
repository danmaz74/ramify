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
import type { DependencyGraphModel, DependencyGraphState, DependencySettings } from '../interfaces/dependency-view.js';
import {
  defaultDependencySettings,
  dependencyScope,
  ownSourceNodeId,
  ownSourceNodeModule,
  scopeCoversProject,
  scopeDependencyLinks,
  scopeEnd,
  scopeLinkCounts,
  subtreeDependencyCounts,
  type ActiveDependencyEdge,
} from '../dependency-graph.js';
import { indexModuleTree } from '../module-tree.js';
import {
  collectionReview,
  expectedAncestors,
  expectedCoversProject,
  expectedDepth,
  expectedEnd,
  expectedModule,
  expectedOwnSourceNodeId,
  expectedProject,
  expectedScope,
  expectedScopeLinks,
  forwardingProject,
  mappedDependencyModels,
  nestedLevelsDependencies,
  nestedLevelsProject,
} from './dependency-fixtures.js';

afterEach(cleanup);

describe('ProjectExplorerView', () => {
  it('MT13 shows the module tree link only when an opener is supplied', () => {
    const onOpenModuleTree = vi.fn();
    const { rerender } = render(<ProjectExplorerView {...createProps({ selectedModuleId: 'a' })} />);
    expect(screen.queryByRole('button', { name: 'Show in module tree' })).toBeNull();
    rerender(<ProjectExplorerView {...createProps({ selectedModuleId: 'a' })} onOpenModuleTree={onOpenModuleTree} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show in module tree' }));
    expect(onOpenModuleTree).toHaveBeenCalledWith('a');
  });

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

  it('preserves selected link detail across re-renders', () => {
    const selectedEdge = linkSelection();
    const props = createProps({ selectedEdge, selectedModuleId: null });
    const { rerender } = render(<ProjectExplorerView {...props} />);
    expect(screen.getByText('Rolled-up link')).toBeInTheDocument();
    expect(screen.getAllByText(/Module A\s*->\s*Module B/).length).toBeGreaterThan(0);
    expect(screen.getByText('Referenced originals')).toBeInTheDocument();
    rerender(<ProjectExplorerView {...props} />);
    expect(screen.getByText('Rolled-up link')).toBeInTheDocument();
    expect(screen.getAllByText(/Module A\s*->\s*Module B/).length).toBeGreaterThan(0);
    expect(screen.getByText('Referenced originals')).toBeInTheDocument();
  });

  it('renders "Chat with Claude" heading when a module is selected', () => {
    render(<ProjectExplorerView {...createProps({ selectedModuleId: 'a' })} />);
    expect(screen.getByText('Discussion for Module A')).toBeInTheDocument();
  });

  it('renders "Chat with Claude" heading when an edge is selected', () => {
    render(<ProjectExplorerView {...createProps({
      selectedEdge: linkSelection(),
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
    expect(within(sidebar).getByText(/Select a module or link/)).toBeInTheDocument();
    expect(within(sidebar).queryByText(/other target/i)).not.toBeInTheDocument();
  });

  it('shows composer placeholder with module name for module selection', () => {
    render(<ProjectExplorerView {...createProps({ selectedModuleId: 'a' })} />);
    expect(screen.getByPlaceholderText('Ask about Module A...')).toBeInTheDocument();
  });

  it('shows composer placeholder with edge direction for edge selection', () => {
    render(<ProjectExplorerView {...createProps({
      selectedEdge: linkSelection(),
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
    const { rerender } = render(<ProjectExplorerView {...createProps({
      breadcrumbTrail: [{ id: null, label: 'Project' }, { id: 'root', label: 'Root' }],
      onNavigateToScope,
      onDrillDown,
    })} />);
    const graph = screen.getByTestId('mock-module-graph');
    expect(graph).toHaveAttribute('data-modules', 'a,b');
    // Both ends of the one link map to displayed nodes, so nothing is out of view.
    expect(graph).toHaveAttribute('data-out-of-view', '');
    // Filtering B out keeps it as the link's related node.
    rerender(<ProjectExplorerView {...createProps({
      breadcrumbTrail: [{ id: null, label: 'Project' }, { id: 'root', label: 'Root' }],
      onNavigateToScope, onDrillDown, selectedPresentationClasses: ['browser+ui'],
    })} />);
    expect(screen.getByTestId('mock-module-graph')).toHaveAttribute('data-out-of-view', 'b');
    rerender(<ProjectExplorerView {...createProps({
      breadcrumbTrail: [{ id: null, label: 'Project' }, { id: 'root', label: 'Root' }],
      onNavigateToScope, onDrillDown,
    })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    expect(onNavigateToScope).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Drill into Module A' }));
    expect(onDrillDown).toHaveBeenCalledWith('a');
  });

  it('renders a module hierarchy with zero dependency edges as a normal view', () => {
    render(<ProjectExplorerView {...createProps({ data: noDependencyModel(),
      dependencies: readyDependencies({ ...createDependencies(), project: { behavioral: 0, nonBehavioral: 0 },
        importedModuleEdges: [], originalOwnerEdges: [] }) })} />);
    const graph = screen.getByTestId('mock-module-graph');
    expect(graph).toHaveAttribute('data-modules', 'a,b');
    expect(graph).toHaveAttribute('data-edges', '');
    expect(screen.getByText(/Showing 2 of 4 modules, 0 displayed links/)).toBeInTheDocument();
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

  it('shows decision reasons and coverage limits for a link', () => {
    render(<ProjectExplorerView {...createProps({
      selectedModuleId: null,
      selectedEdge: linkSelection(),
    })} />);
    expect(screen.getAllByText('denied').length).toBeGreaterThan(0);
    expect(screen.getAllByText('not-visible').length).toBeGreaterThan(0);
    expect(screen.getByText('coverage-1')).toBeInTheDocument();
    // The link's coverage ID resolves to the displayed revision's coverage note.
    expect(screen.getByText(/One selected original could not be resolved\./)).toBeInTheDocument();
    expect(screen.queryByText('Other target')).not.toBeInTheDocument();
  });

  it('keeps raw import occurrences in a collapsed source evidence section of the module panel', () => {
    render(<ProjectExplorerView {...createProps({ selectedModuleId: 'a' })} />);
    const evidence = screen.getByRole('button', { name: /Source evidence: import occurrences/ });
    expect(evidence).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Import occurrences')).not.toBeInTheDocument();
    fireEvent.click(evidence);
    expect(screen.getByText('Import occurrences are supporting evidence, not dependencies.')).toBeInTheDocument();
    expect(screen.getByText('Import occurrences').closest('.module-arch__metric')).toHaveTextContent('2');
    expect(screen.queryByText('Approx. complexity')).not.toBeInTheDocument();
    expect(screen.queryByText('Selected symbols')).not.toBeInTheDocument();
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

describe('Plan 6D dependency diagram', () => {
  const graphProps: ModuleGraphProps[] = [];
  function RecordingGraph(props: ModuleGraphProps): React.ReactElement {
    graphProps.push(props);
    return <MockGraph {...props} />;
  }
  const lastGraph = () => graphProps.at(-1)!;
  afterEach(() => { graphProps.length = 0; });

  /** Data callbacks fail the test; only selection and settings callbacks are expected. */
  function failing(name: string) {
    return vi.fn(() => { throw new Error(`${name} requested data`); });
  }

  function diagramProps(project: ProjectExplorerModel, dependencies: DependencyGraphState,
    overrides: Overrides = {}): ProjectExplorerViewProps {
    return createProps({
      data: project,
      dependencies,
      selectedPresentationClasses: [...new Set(project.modules.map((module) => module.presentationClass))],
      GraphComponent: RecordingGraph,
      DiscussionComponent: undefined,
      onRefresh: failing('refresh'),
      onToggleExport: failing('export detail'),
      onToggleDependency: failing('occurrence detail'),
      onDrillDown: failing('drill-down'),
      onNavigateToScope: failing('scope'),
      ...overrides,
    });
  }

  function cards(region: HTMLElement): { behavioral: string; nonBehavioral: string; note: string } {
    const behavioral = region.querySelector('[data-headline="behavioral"] .module-arch__headline-value');
    const nonBehavioral = region.querySelector('[data-headline="non-behavioral"]');
    return {
      behavioral: behavioral?.textContent ?? '',
      nonBehavioral: nonBehavioral?.querySelector('.module-arch__headline-value')?.textContent ?? '',
      note: nonBehavioral?.querySelector('.module-arch__headline-note')?.textContent ?? '',
    };
  }

  const projectRegion = () => screen.getByRole('region', { name: 'Project dependencies' });
  const nonBehavioralToggle = () => screen.getByRole('checkbox', { name: 'Show non-behavioral dependencies' });
  const leavingToggle = () => screen.getByRole('checkbox', { name: 'Show dependencies that leave this module' });
  const depthOption = (name: 'Modules at this level' | 'Exact module') => within(
    screen.getByRole('radiogroup', { name: 'Link depth' })).getByRole('radio', { name });
  /** One labelled card pair of a panel region, such as `This view` or `Including internals`. */
  const pair = (region: HTMLElement, label: string) =>
    cards(within(region).getByRole('group', { name: label, hidden: true }));
  const numbers = (region: HTMLElement, label: string) => {
    const value = pair(region, label);
    return { behavioral: Number(value.behavioral), nonBehavioral: Number(value.nonBehavioral) };
  };
  const region = (name: string) => screen.getByRole('region', { name, hidden: true });
  /** The drawn links, as independently comparable strings. */
  const drawn = () => lastGraph().edges
    .map((edge) => `${edge.consumer}>${edge.provider}:${edge.behavioral}/${edge.nonBehavioral}`);
  const drawnOf = (links: readonly { consumer: string; provider: string;
    behavioral: number; nonBehavioral: number }[]) => links
    .map((link) => `${link.consumer}>${link.provider}:${link.behavioral}/${link.nonBehavioral}`);
  const outOfView = () => (lastGraph().outOfViewModules ?? []).map((module) => module.id);
  const notDrawn = () => document.querySelector('.module-arch__not-drawn')?.getAttribute('data-not-drawn') ?? '';
  const settings = (overrides: Partial<DependencySettings> = {}): DependencySettings =>
    ({ ...defaultDependencySettings, ...overrides });

  const workspace = 'collection-review/workspace';

  it('BD30 draws the scope roll-up of behavioral original-owner links and never occurrence edges', () => {
    const { project, dependencies } = collectionReview();
    const expected = expectedScopeLinks({ project, dependencies, scopeModuleId: workspace });
    const withNonBehavioral = expectedScopeLinks({ project, dependencies, scopeModuleId: workspace,
      showNonBehavioral: true });
    const nonBehavioralOnly = withNonBehavioral.filter((link) => link.behavioral === 0);
    expect(expected.length).toBeGreaterThan(0);
    expect(nonBehavioralOnly.length).toBeGreaterThan(0);

    const { rerender } = render(<ProjectExplorerView {...diagramProps(project, readyDependencies(dependencies),
      { scopeModuleId: workspace })} />);
    let graph = lastGraph();
    expect(drawn()).toEqual(drawnOf(expected));
    for (const edge of graph.edges) {
      expect(edge.depthMode).toBe('level');
      expect(edge.displayed).toBe(edge.behavioral);
      expect(edge.sources.length).toBeGreaterThan(0);
    }
    const ids = new Set(graph.edges.map((edge) => edge.id));
    expect(project.edges.length).toBeGreaterThan(0);
    expect(project.edges.some((edge) => ids.has(edge.id))).toBe(false);
    for (const link of nonBehavioralOnly) {
      expect(graph.edges.some((edge) => edge.consumer === link.consumer && edge.provider === link.provider)).toBe(false);
    }

    // Pending: the module nodes stay, no link is drawn, and no occurrence edge replaces them.
    for (const phase of ['waiting', 'analyzing'] as const) {
      rerender(<ProjectExplorerView {...diagramProps(project, { data: null, phase, reason: null, isStale: false },
        { scopeModuleId: workspace })} />);
      graph = lastGraph();
      expect(graph.modules.map((module) => module.id)).toEqual(project.modules
        .filter((module) => module.parent === workspace).map((module) => module.id));
      expect(graph.edges).toEqual([]);
      expect(graph.outOfViewModules).toEqual([]);
      expect(screen.getAllByText(/Computing behavioral dependencies/).length).toBeGreaterThan(0);
    }
  });

  it('BD31 applies the non-behavioral and depth controls locally from one loaded result', () => {
    const { project, dependencies } = collectionReview();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('fetch requested data'); });
    const onSettings = vi.fn();
    render(<ProjectExplorerView {...diagramProps(project, readyDependencies(dependencies),
      { scopeModuleId: workspace, onDependencySettingsChange: onSettings })} />);
    const measured = expectedProject(dependencies);
    expect(pair(projectRegion(), 'Whole project')).toEqual({ behavioral: String(measured.behavioral),
      nonBehavioral: String(measured.nonBehavioral), note: 'not drawn' });
    expect(drawn()).toEqual(drawnOf(expectedScopeLinks({ project, dependencies, scopeModuleId: workspace })));

    fireEvent.click(nonBehavioralToggle());
    expect(onSettings).toHaveBeenLastCalledWith(settings({ showNonBehavioral: true }));
    expect(nonBehavioralToggle()).toBeChecked();
    expect(pair(projectRegion(), 'Whole project').note).toBe('shown');
    expect(drawn()).toEqual(drawnOf(expectedScopeLinks({ project, dependencies, scopeModuleId: workspace,
      showNonBehavioral: true })));
    expect(lastGraph().edges.some((edge) => edge.behavioral === 0)).toBe(true);
    // The measured card does not move with the setting.
    expect(pair(projectRegion(), 'Whole project').behavioral).toBe(String(measured.behavioral));

    fireEvent.click(depthOption('Exact module'));
    expect(onSettings).toHaveBeenLastCalledWith(settings({ showNonBehavioral: true, depthMode: 'exact' }));
    expect(drawn()).toEqual(drawnOf(expectedScopeLinks({ project, dependencies, scopeModuleId: workspace,
      depthMode: 'exact', showNonBehavioral: true })));
    expect(lastGraph().edges.every((edge) => edge.depthMode === 'exact' && edge.sources.length === 1)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    // Controlled settings report the change and render only what the owner supplies.
    cleanup();
    const controlled = vi.fn();
    render(<ProjectExplorerView {...diagramProps(project, readyDependencies(dependencies), {
      scopeModuleId: workspace, dependencySettings: defaultDependencySettings,
      onDependencySettingsChange: controlled })} />);
    fireEvent.click(nonBehavioralToggle());
    expect(controlled).toHaveBeenCalledWith(settings({ showNonBehavioral: true }));
    expect(nonBehavioralToggle()).not.toBeChecked();
  });

  it('BD32 links a forwarded original to its original owner in both depth modes', () => {
    const { forwarding, bothBoundaries } = mappedDependencyModels();
    const project = forwardingProject();
    const show = (model: DependencyGraphModel, next: DependencySettings) => {
      const rendered = render(<ProjectExplorerView {...diagramProps(project, readyDependencies(model),
        { dependencySettings: next })} />);
      const result = { links: drawn(), outOfView: outOfView() };
      rendered.unmount();
      return result;
    };
    // The forwarded `run`, owned by b/core, rolls up to `app/b` and is exactly `app/b/core`.
    expect(show(forwarding, settings()).links).toEqual(['app/a>app/b:1/0', 'app/b>app/c:1/0']);
    const exact = show(forwarding, settings({ depthMode: 'exact' }));
    expect(exact.links).toEqual(['app/a>app/b/core:1/0', 'app/b>app/c:1/0']);
    expect(exact.outOfView).toEqual(['app/b/core']);

    // The imported module `app/b` is no endpoint in `Exact module`; it is only a panel breakdown.
    const exactLink = scopedLinks(project, forwarding, settings({ depthMode: 'exact' }))
      .find((link) => link.consumer === 'app/a')!;
    expect(exactLink.provider).toBe('app/b/core');
    const rendered = render(<ProjectExplorerView {...diagramProps(project, readyDependencies(forwarding), {
      dependencySettings: settings({ depthMode: 'exact' }),
      selectedEdge: { kind: 'edge', id: exactLink.id, edge: exactLink } })} />);
    expect([...region('Imported through').querySelectorAll('[data-module]')]
      .map((row) => row.getAttribute('data-module'))).toEqual(['app/b', 'app/c']);
    rendered.unmount();

    // One original through b and c: one rolled-up link and one headline dependency.
    expect(show(bothBoundaries, settings()).links).toEqual(['app/a>app/b:1/0']);
    expect(show(bothBoundaries, settings({ depthMode: 'exact' })).links).toEqual(['app/a>app/b/core:1/0']);
    expect(expectedProject(bothBoundaries)).toEqual({ behavioral: 1, nonBehavioral: 1 });
    render(<ProjectExplorerView {...diagramProps(project, readyDependencies(bothBoundaries))} />);
    expect(pair(projectRegion(), 'Whole project')).toMatchObject({ behavioral: '1', nonBehavioral: '1' });
  });

  it('BD34 labels the filtered and measured project cards, the numbers not drawn, links, coverage and revision', () => {
    const { forwarding, zero } = mappedDependencyModels();
    const project = forwardingProject();
    const { rerender } = render(<ProjectExplorerView {...diagramProps(project, readyDependencies(forwarding))} />);
    const measured = expectedProject(forwarding);
    const thisView = expectedScopeLinks({ project, dependencies: forwarding, showNonBehavioral: true })
      .reduce((sum, link) => ({ behavioral: sum.behavioral + link.behavioral,
        nonBehavioral: sum.nonBehavioral + link.nonBehavioral }), { behavioral: 0, nonBehavioral: 0 });
    expect(thisView).toEqual({ behavioral: 2, nonBehavioral: 1 });
    expect(pair(projectRegion(), 'This view')).toEqual({ behavioral: String(thisView.behavioral),
      nonBehavioral: String(thisView.nonBehavioral), note: 'not drawn' });
    expect(pair(projectRegion(), 'Whole project')).toEqual({ behavioral: String(measured.behavioral),
      nonBehavioral: String(measured.nonBehavioral), note: 'not drawn' });
    expect(notDrawn()).toBe(`${measured.behavioral - thisView.behavioral}/${measured.nonBehavioral - thisView.nonBehavioral}`);
    expect(screen.getByText(/Not drawn at this level/)).toBeInTheDocument();
    expect(within(projectRegion()).getAllByText('Behavioral dependencies').length).toBe(2);
    const metricValue = (label: string) => within(projectRegion()).getByText(label).closest('.module-arch__metric')!
      .querySelector('.module-arch__metric-value')!.textContent;
    expect(metricValue('Displayed module links')).toBe(String(lastGraph().edges.length));
    expect(metricValue('Coverage')).toBe(`Partial: ${forwarding.coverage.unknownDependencies} omitted`);
    expect(within(projectRegion()).getByText(/Some dependencies were omitted: 1 unknown dependency/)).toBeInTheDocument();
    expect(metricValue('Revision')).toBe(project.revision);
    expect(metricValue('Input')).toBe(forwarding.inputId);
    expect(screen.getByText(/One headline dependency per consumer module and referenced original symbol/)).toBeInTheDocument();
    const sidebar = document.querySelector('.module-arch__sidebar') as HTMLElement;
    expect(sidebar.textContent).not.toMatch(/ratio|%|confidence|pie/i);
    expect(sidebar.querySelector('svg, canvas')).toBeNull();
    // At the project scope there is no drilled-in frame, so no own-source section.
    expect(screen.queryByRole('region', { name: "Scope's own source" })).not.toBeInTheDocument();

    fireEvent.click(nonBehavioralToggle());
    expect(pair(projectRegion(), 'This view').note).toBe('shown');
    // A panel number does not move with the non-behavioral setting.
    expect(pair(projectRegion(), 'This view').behavioral).toBe(String(thisView.behavioral));
    expect(notDrawn()).toBe(`${measured.behavioral - thisView.behavioral}/${measured.nonBehavioral - thisView.nonBehavioral}`);
    expect(metricValue('Displayed module links')).toBe(String(lastGraph().edges.length));

    rerender(<ProjectExplorerView {...diagramProps(project, readyDependencies(zero))} />);
    expect(pair(projectRegion(), 'Whole project')).toMatchObject({ behavioral: '0', nonBehavioral: '0' });
    expect(metricValue('Coverage')).toBe('Complete');
    expect(metricValue('Displayed module links')).toBe('0');
  });

  it('BD35 shows Uses and owned originals as At this level against Including internals', () => {
    const { forwarding } = mappedDependencyModels();
    const project = forwardingProject();
    const tree = indexModuleTree(project.modules, project.rootModuleId);
    const subtree = subtreeDependencyCounts(forwarding, 'app/b', tree);
    render(<ProjectExplorerView {...diagramProps(project, readyDependencies(forwarding), { selectedModuleId: 'app/b' })} />);
    const regions = () => [...document.querySelectorAll('.module-arch__sidebar section[aria-label]')]
      .map((section) => [section.getAttribute('aria-label'), section.closest('details') ? 'disclosure' : 'primary']);
    expect(regions()).toEqual([['Uses', 'primary'], ['Owned originals used by others', 'primary'],
      ['Used through this module', 'disclosure']]);
    // The measured subtree totals come from the served rows of `app/b` and `app/b/core`.
    expect(subtree.uses).toEqual({ behavioral: 1, nonBehavioral: 1 });
    expect(subtree.ownedUsedByOthers).toEqual({ behavioral: 1, nonBehavioral: 1 });
    expect(numbers(region('Uses'), 'Including internals')).toEqual(subtree.uses);
    expect(numbers(region('Uses'), 'At this level')).toEqual({ behavioral: 1, nonBehavioral: 0 });
    expect(numbers(region('Owned originals used by others'), 'Including internals'))
      .toEqual(subtree.ownedUsedByOthers);
    expect(numbers(region('Owned originals used by others'), 'At this level'))
      .toEqual({ behavioral: 1, nonBehavioral: 0 });
    // `Used through this module` keeps its imported unit, measured only.
    const through = region('Used through this module');
    expect(numbers(through, 'Including internals')).toEqual({ behavioral: subtree.usedThrough.behavioralUsedOriginals,
      nonBehavioral: subtree.usedThrough.nonBehavioralUsedOriginals });
    expect(within(through).queryByRole('group', { name: 'At this level', hidden: true })).not.toBeInTheDocument();
    expect(within(through).getByText('Behavioral used originals via this module')).toBeInTheDocument();
    const linksDisplayed = () => screen.getByText('Links displayed').closest('.module-arch__metric')!.textContent;
    expect(linksDisplayed()).toBe(`${scopedLinks(project, forwarding)
      .filter((link) => link.consumer === 'app/b' || link.provider === 'app/b').length}Links displayed`);

    fireEvent.click(nonBehavioralToggle());
    expect(numbers(region('Uses'), 'Including internals')).toEqual(subtree.uses);
    expect(numbers(region('Uses'), 'At this level')).toEqual({ behavioral: 1, nonBehavioral: 0 });
    expect(linksDisplayed()).toBe(`${scopedLinks(project, forwarding, { showNonBehavioral: true })
      .filter((link) => link.consumer === 'app/b' || link.provider === 'app/b').length}Links displayed`);
  });

  it('BD36 lists the rolled-up modules of a link and keeps the exact link panel labels', () => {
    const nestedProject = nestedLevelsProject();
    const nested = nestedLevelsDependencies();
    // Rolled up inside `app/a`: two exact edges of `app/a/left` onto the `app/b` subtree.
    const rolled = scopedLinks(nestedProject, nested, { showNonBehavioral: true }, 'app/a')
      .find((link) => link.consumer === 'app/a/left' && link.provider === 'app/b')!;
    expect(rolled.sources.map((edge) => [edge.consumer, edge.provider]))
      .toEqual([['app/a/left', 'app/b'], ['app/a/left', 'app/b/core']]);
    const rendered = render(<ProjectExplorerView {...diagramProps(nestedProject, readyDependencies(nested), {
      scopeModuleId: 'app/a', dependencySettings: settings({ showNonBehavioral: true }),
      selectedEdge: { kind: 'edge', id: rolled.id, edge: rolled } })} />);
    expect(screen.getByRole('heading', { name: 'Rolled-up link' })).toBeInTheDocument();
    expect(numbers(region('Dependencies'), 'At this level')).toEqual({ behavioral: 1, nonBehavioral: 2 });
    expect(within(region('Dependencies')).getByText('Total classified dependencies')
      .closest('.module-arch__metric')).toHaveTextContent('3');
    expect([...region('Rolled-up modules').querySelectorAll('.module-arch__breakdown-item')]
      .map((row) => [row.getAttribute('data-consumer'), row.getAttribute('data-provider'), row.textContent]))
      .toEqual([['app/a/left', 'app/b', 'left  ->  b0 behavioral1 non-behavioral'],
        ['app/a/left', 'app/b/core', 'left  ->  core1 behavioral1 non-behavioral']]);
    // The imported-through breakdown sums the contributing edges per imported module.
    expect([...region('Imported through').querySelectorAll('[data-module]')]
      .map((row) => [row.getAttribute('data-module'), row.textContent]))
      .toEqual([['app/b', 'b1 behavioral1 non-behavioral'], ['app/b/core', 'core0 behavioral1 non-behavioral']]);
    expect(screen.getByText('limit-nested-1')).toBeInTheDocument();
    // One row per original, each naming its exact consumer and owner.
    const rows = [...document.querySelectorAll('.module-arch__evidence-item')];
    expect(rows.map((row) => row.querySelector('.module-arch__evidence-original')!.textContent))
      .toEqual(['delta', 'alpha', 'beta']);
    expect(rows[0]!.querySelector('.module-arch__evidence-path')!.textContent)
      .toBe('non-behavioraldeniednot-visibleleft  ->  bimported through bSupporting occurrences: 1');
    rendered.unmount();

    // The exact link panel keeps iteration 6's original-owner labels.
    const { forwarding } = mappedDependencyModels();
    const project = forwardingProject();
    const exactLink = scopedLinks(project, forwarding, { depthMode: 'exact' })
      .find((link) => link.consumer === 'app/a' && link.provider === 'app/b/core')!;
    render(<ProjectExplorerView {...diagramProps(project, readyDependencies(forwarding), {
      dependencySettings: settings({ depthMode: 'exact' }),
      selectedEdge: { kind: 'edge', id: exactLink.id, edge: exactLink } })} />);
    expect(screen.getByRole('heading', { name: 'Original-owner link' })).toBeInTheDocument();
    const dependencies = region('Dependencies');
    expect(within(dependencies).getByText('Behavioral dependencies')).toBeInTheDocument();
    expect(cards(dependencies)).toEqual({ behavioral: '1', nonBehavioral: '0', note: 'not drawn' });
    expect(within(dependencies).getByText('Total classified dependencies')).toBeInTheDocument();
    expect(screen.queryByText(/via this boundary/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Rolled-up modules' })).not.toBeInTheDocument();
    expect([...region('Imported through').querySelectorAll('[data-module]')]
      .map((row) => [row.getAttribute('data-module'), row.textContent]))
      .toEqual([['app/b', 'b1 behavioral0 non-behavioral'], ['app/c', 'c0 behavioral1 non-behavioral']]);
    expect(screen.getByText('Original declaration files')).toBeInTheDocument();
    // Only referenced classified originals; accesses are labelled supporting occurrences.
    const exactRows = [...document.querySelectorAll('.module-arch__evidence-item')];
    expect(exactRows).toHaveLength(1);
    expect(document.querySelector('.module-arch__sidebar')!.textContent).not.toContain('unknown');
    expect([...exactRows[0]!.querySelectorAll('.module-arch__evidence-path')].map((row) => row.textContent))
      .toEqual(['behavioralallowedexposedimported through bSupporting occurrences: 1',
        'non-behavioraldeniednot-visibleimported through cSupporting occurrences: 1']);
  });

  it('BD37 reconciles scope, filters, out-of-view nodes and selection against the scope links', () => {
    const { forwarding, bothBoundaries } = mappedDependencyModels();
    const project = forwardingProject();
    const props = diagramProps(project, readyDependencies(forwarding));
    const { rerender } = render(<ProjectExplorerView {...props} />);
    expect(outOfView()).toEqual([]);
    fireEvent.click(nonBehavioralToggle());
    // The non-behavioral rolled-up links stay inside the displayed nodes.
    expect(outOfView()).toEqual([]);
    fireEvent.click(nonBehavioralToggle());
    fireEvent.click(depthOption('Exact module'));
    expect(outOfView()).toEqual(['app/b/core']);
    fireEvent.click(depthOption('Modules at this level'));

    // A filter hiding `app/a` and `app/c` keeps them as the links' related nodes: the mapping
    // is unchanged, only the displayed set is.
    const filtered = expectedScopeLinks({ project, dependencies: forwarding,
      displayed: ['app/b', 'app/idle'] });
    rerender(<ProjectExplorerView {...props} selectedPresentationClasses={['untagged']} />);
    expect(lastGraph().modules.map((module) => module.id)).toEqual(['app/b', 'app/idle']);
    expect(drawn()).toEqual(drawnOf(filtered));
    expect(outOfView()).toEqual(['app/a', 'app/c']);
    cleanup();

    // Scope: inside `app/b` only links that reach `app/b/core` are drawn; `app/b/core -> app/b`
    // has a frame end and is drawn nowhere.
    render(<ProjectExplorerView {...diagramProps(project, readyDependencies(forwarding),
      { scopeModuleId: 'app/b', dependencySettings: settings({ showNonBehavioral: true }) })} />);
    expect(drawn()).toEqual(['app/a>app/b/core:1/0']);
    expect(outOfView()).toEqual(['app/a']);
    cleanup();

    // Selection: a rolled-up ID names its scope, so the same pair has a different ID inside `app/b`.
    const onSelectEdge = vi.fn();
    const rolledAtProject = scopedLinks(project, forwarding, { showNonBehavioral: true })
      .find((link) => link.consumer === 'app/a')!;
    const rolledInsideB = scopedLinks(project, forwarding, { showNonBehavioral: true }, 'app/b')
      .find((link) => link.consumer === 'app/a')!;
    expect(rolledAtProject.id).not.toBe(rolledInsideB.id);
    const view = (next: DependencySettings, selected: GraphSelection, scopeModuleId: string | null = null,
      model = forwarding) =>
      <ProjectExplorerView {...diagramProps(project, readyDependencies(model), { dependencySettings: next,
        scopeModuleId, selectedEdge: selected, onSelectEdge })} />;
    const selection = (edge: ActiveDependencyEdge): GraphSelection => ({ kind: 'edge', id: edge.id, edge });
    const selected = render(view(settings({ showNonBehavioral: true }), selection(rolledAtProject)));
    expect(onSelectEdge).not.toHaveBeenCalled();
    selected.rerender(view(settings({ showNonBehavioral: true }), selection(rolledAtProject), 'app/b'));
    expect(onSelectEdge).toHaveBeenCalledWith(null);
    onSelectEdge.mockClear();

    // A behavioral rolled-up link keeps its ID when non-behavioral links are hidden.
    const behavioral = scopedLinks(project, bothBoundaries).find((link) => link.provider === 'app/b')!;
    selected.rerender(view(settings({ showNonBehavioral: true }), selection(behavioral), null, bothBoundaries));
    selected.rerender(view(settings(), selection(behavioral), null, bothBoundaries));
    expect(onSelectEdge).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Rolled-up link' })).toBeInTheDocument();
    // A non-behavioral-only link is cleared when the setting hides it.
    const nonBehavioral = scopedLinks(project, forwarding, { showNonBehavioral: true })
      .find((link) => link.emphasis === 'non-behavioral')!;
    selected.rerender(view(settings({ showNonBehavioral: true }), selection(nonBehavioral)));
    expect(onSelectEdge).not.toHaveBeenCalled();
    selected.rerender(view(settings(), selection(nonBehavioral)));
    expect(onSelectEdge).toHaveBeenCalledWith(null);
  });

  it('BD38 gives the three controls labels and keyboard behavior and distinguishes every dependency state', () => {
    const { forwarding, zero, bothBoundaries } = mappedDependencyModels();
    const project = forwardingProject();
    const { rerender } = render(<ProjectExplorerView {...diagramProps(project, readyDependencies(bothBoundaries))} />);
    expect(screen.getByRole('group', { name: 'Dependencies' })).toBeInTheDocument();
    const level = depthOption('Modules at this level');
    expect(level).toHaveAttribute('aria-checked', 'true');
    expect(level).toHaveAttribute('tabindex', '0');
    expect(depthOption('Exact module')).toHaveAttribute('tabindex', '-1');
    level.focus();
    fireEvent.keyDown(level, { key: 'ArrowRight' });
    expect(depthOption('Exact module')).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(depthOption('Exact module'));
    expect(lastGraph().edges.every((edge) => edge.depthMode === 'exact')).toBe(true);
    fireEvent.keyDown(depthOption('Exact module'), { key: 'Home' });
    expect(depthOption('Modules at this level')).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(depthOption('Modules at this level'));
    fireEvent.keyDown(depthOption('Modules at this level'), { key: 'End' });
    expect(depthOption('Exact module')).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(depthOption('Exact module'), { key: 'ArrowLeft' });
    expect(depthOption('Modules at this level')).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(depthOption('Modules at this level'), { key: 'Tab' });
    expect(depthOption('Modules at this level')).toHaveAttribute('aria-checked', 'true');
    // The project scope of a single-root project has no outside, so the toggle does not apply.
    expect(screen.queryByRole('checkbox', { name: 'Show dependencies that leave this module' }))
      .not.toBeInTheDocument();

    const states: Array<[DependencyGraphState, string, RegExp, boolean]> = [
      [{ data: null, phase: 'idle', reason: null, isStale: false }, 'idle', /not been requested/, false],
      [{ data: null, phase: 'waiting', reason: null, isStale: false }, 'waiting', /waiting for another analysis/, false],
      [{ data: null, phase: 'analyzing', reason: null, isStale: false }, 'analyzing', /^Computing behavioral dependencies$/, false],
      [{ data: null, phase: 'unavailable', reason: 'analysis-failed: helper exited', isStale: false }, 'unavailable',
        /unavailable: analysis-failed: helper exited/, false],
      [{ data: bothBoundaries, phase: 'superseded', reason: 'revision rev/1:x:4 is published', isStale: true }, 'superseded',
        /superseded: revision rev\/1:x:4 is published\. Refresh to update\. Showing the earlier/, true],
      [readyDependencies(bothBoundaries, { isStale: true }), 'stale', /Stale dependency diagram for input input\/1:dependency-model/, true],
      [readyDependencies(forwarding), 'partial', /Partial coverage: 1 unknown dependency omitted/, true],
      [readyDependencies(zero), 'zero', /Measured zero dependencies/, false],
      [readyDependencies(bothBoundaries), 'complete', /Behavioral dependencies complete/, true],
    ];
    const seen = new Set<string>();
    for (const [state, marker, text, drawsLinks] of states) {
      rerender(<ProjectExplorerView {...diagramProps(project, state)} />);
      const status = document.querySelector('.module-arch__header [data-dependency-state]')!;
      expect(status.getAttribute('data-dependency-state')).toBe(marker);
      expect(status.textContent).toMatch(text);
      seen.add(status.textContent!);
      expect(lastGraph().modules.length).toBeGreaterThan(0);
      expect(lastGraph().edges.length > 0).toBe(drawsLinks);
      const controlsDisabled = state.data === null;
      expect(nonBehavioralToggle()).toHaveProperty('disabled', controlsDisabled);
      expect(depthOption('Modules at this level')).toHaveProperty('disabled', controlsDisabled);
    }
    expect(seen.size).toBe(states.length);

    // In a drilled-in scope all three controls are present and keyboard-reachable.
    cleanup();
    render(<ProjectExplorerView {...diagramProps(nestedLevelsProject(),
      readyDependencies(nestedLevelsDependencies()), { scopeModuleId: 'app/a' })} />);
    expect(leavingToggle()).toBeChecked();
    expect(leavingToggle()).toHaveProperty('disabled', false);
    expect(depthOption('Modules at this level')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Plan 6D scope-aware roll-up', () => {
  const graphProps: ModuleGraphProps[] = [];
  function RecordingGraph(props: ModuleGraphProps): React.ReactElement {
    graphProps.push(props);
    return <MockGraph {...props} />;
  }
  const lastGraph = () => graphProps.at(-1)!;
  afterEach(() => { graphProps.length = 0; });

  function viewProps(project: ProjectExplorerModel, model: DependencyGraphModel,
    overrides: Overrides = {}): ProjectExplorerViewProps {
    return createProps({
      data: project,
      dependencies: readyDependencies(model),
      selectedPresentationClasses: [...new Set(project.modules.map((module) => module.presentationClass))],
      GraphComponent: RecordingGraph,
      DiscussionComponent: undefined,
      ...overrides,
    });
  }

  const drawn = () => lastGraph().edges
    .map((edge) => `${edge.consumer}>${edge.provider}:${edge.behavioral}/${edge.nonBehavioral}`);
  const drawnOf = (links: readonly { consumer: string; provider: string;
    behavioral: number; nonBehavioral: number }[]) => links
    .map((link) => `${link.consumer}>${link.provider}:${link.behavioral}/${link.nonBehavioral}`);
  const outOfView = () => (lastGraph().outOfViewModules ?? []).map((module) => module.id);
  const settings = (overrides: Partial<DependencySettings> = {}): DependencySettings =>
    ({ ...defaultDependencySettings, ...overrides });
  const pair = (host: HTMLElement, label: string) => {
    const group = within(host).getByRole('group', { name: label, hidden: true });
    return {
      behavioral: Number(group.querySelector('[data-headline="behavioral"] .module-arch__headline-value')!.textContent),
      nonBehavioral: Number(group.querySelector('[data-headline="non-behavioral"] .module-arch__headline-value')!.textContent),
    };
  };
  const region = (name: string) => screen.getByRole('region', { name, hidden: true });

  const workspace = 'collection-review/workspace';
  const contracts = 'collection-review/workspace/contracts';
  const catalog = 'collection-review/workspace/catalog';
  const reviews = 'collection-review/workspace/reviews';

  it('BD44 maps every end of a scope: containing node, frame, shallower ancestor and exact module', () => {
    const project = nestedLevelsProject();
    const tree = indexModuleTree(project.modules, project.rootModuleId);
    const inside = dependencyScope(project, 'app/a');
    expect(inside).toEqual({ frameModule: 'app/a', nodes: ['app/a/left', 'app/a/right'], depth: 2,
      ownSourceNode: null });
    expect(inside).toEqual(expectedScope(project, 'app/a'));
    // Inside the scope: the child that contains the end.
    expect(scopeEnd('app/a/left', inside, 'level', tree))
      .toEqual({ kind: 'node', module: 'app/a/left', inScope: true });
    // The scope module's own source: the frame.
    expect(scopeEnd('app/a', inside, 'level', tree)).toEqual({ kind: 'frame' });
    // Outside and deeper: the ancestor at the scope module's depth.
    expect(expectedDepth(project, 'app/b/core')).toBe(2);
    expect(scopeEnd('app/b/core', inside, 'level', tree))
      .toEqual({ kind: 'node', module: 'app/b', inScope: false });
    // Outside and no deeper than that depth: itself.
    expect(scopeEnd('app/c', inside, 'level', tree)).toEqual({ kind: 'node', module: 'app/c', inScope: false });
    expect(scopeEnd('app', inside, 'level', tree)).toEqual({ kind: 'node', module: 'app', inScope: false });
    // `exact` maps every end to itself and has no frame.
    for (const id of project.modules.map((module) => module.id)) {
      const end = scopeEnd(id, inside, 'exact', tree);
      expect(end).toEqual({ kind: 'node', module: id,
        inScope: id === 'app/a' || expectedAncestors(project, id).includes('app/a') });
      expect(end).toEqual(expectedEnd(project, expectedScope(project, 'app/a'), id, 'exact'));
    }
    // Every clause agrees with the independent mapping, at every scope and in both modes.
    for (const scopeModuleId of [null, ...project.modules.map((module) => module.id)]) {
      const scope = dependencyScope(project, scopeModuleId);
      const expected = expectedScope(project, scopeModuleId);
      expect(scope).toEqual(expected);
      expect(scopeCoversProject(scope, project.modules.map((module) => module.id), tree))
        .toBe(expectedCoversProject(project, expected));
      for (const depthMode of ['level', 'exact'] as const) {
        for (const id of project.modules.map((module) => module.id)) {
          expect(scopeEnd(id, scope, depthMode, tree)).toEqual(expectedEnd(project, expected, id, depthMode));
        }
      }
    }
    // An end never depends on the class filter or the settings: the mapping takes neither.
    const reference = project.modules.map((module) => scopeEnd(module.id, inside, 'level', tree));
    expect(project.modules.map((module) => scopeEnd(module.id, inside, 'level', tree))).toEqual(reference);
  });

  it('BD45 draws no link whose ends map to one node, at any scope', () => {
    const { project, dependencies } = collectionReview();
    const tree = indexModuleTree(project.modules, project.rootModuleId);
    for (const scopeModuleId of [null, ...project.modules.map((module) => module.id)]) {
      const scope = dependencyScope(project, scopeModuleId);
      for (const depthMode of ['level', 'exact'] as const) {
        const links = scopeDependencyLinks({ model: dependencies, scope, displayed: new Set(scope.nodes), tree,
          settings: { showNonBehavioral: true, depthMode, showOutsideScope: true, showOwnSourceNode: false } });
        for (const link of links) expect(link.consumer).not.toBe(link.provider);
        expect(drawnOf(links)).toEqual(drawnOf(expectedScopeLinks({ project, dependencies, scopeModuleId,
          depthMode, showNonBehavioral: true })));
      }
    }

    // The project scope shows the two top-level children and draws nothing: every dependency is
    // internal to one of them or folded into the root's own source.
    const projectScope = dependencyScope(project, null);
    expect(projectScope.nodes).toEqual(['collection-review/integration-tests', workspace]);
    render(<ProjectExplorerView {...viewProps(project, dependencies)} />);
    expect(lastGraph().modules.map((module) => module.id)).toEqual(projectScope.nodes);
    expect(lastGraph().edges).toEqual([]);
    const internal = dependencies.originalOwnerEdges.filter((edge) => {
      const ends = [edge.consumer, edge.provider]
        .map((id) => scopeEnd(id, projectScope, 'level', tree));
      return ends[0]!.kind === 'node' && ends[1]!.kind === 'node' && ends[0]!.module === ends[1]!.module;
    });
    expect(internal).toHaveLength(20);
    cleanup();

    // Drilling into `workspace` makes its children's links visible.
    const inside = expectedScopeLinks({ project, dependencies, scopeModuleId: workspace, showNonBehavioral: true });
    expect(inside).toHaveLength(9);
    expect(scopeLinkCounts(scopedLinks(project, dependencies, { showNonBehavioral: true }, workspace)))
      .toEqual({ behavioral: 7, nonBehavioral: 41 });
    render(<ProjectExplorerView {...viewProps(project, dependencies,
      { scopeModuleId: workspace, dependencySettings: settings({ showNonBehavioral: true }) })} />);
    expect(drawn()).toEqual(drawnOf(inside));
    expect(drawn()).toContain(`${catalog}>${contracts}:0/9`);
    expect(drawn()).toContain(`${reviews}>${contracts}:0/24`);
  });

  it('BD46 rolls several deep ends of one subtree into one link and drops a link with no displayed end', () => {
    const project = nestedLevelsProject();
    const dependencies = nestedLevelsDependencies();
    const tree = indexModuleTree(project.modules, project.rootModuleId);
    const scope = dependencyScope(project, 'app/a');
    const links = scopeDependencyLinks({ model: dependencies, scope, displayed: new Set(scope.nodes), tree,
      settings: { showNonBehavioral: true, depthMode: 'level', showOutsideScope: true,
        showOwnSourceNode: false } });
    expect(drawnOf(links)).toEqual(drawnOf(expectedScopeLinks({ project, dependencies, scopeModuleId: 'app/a',
      showNonBehavioral: true })));
    // Two exact edges onto the `app/b` subtree collapse into one link with one out-of-view node.
    const rolled = links.find((link) => link.consumer === 'app/a/left' && link.provider === 'app/b')!;
    expect(rolled.sources.map((edge) => [edge.consumer, edge.provider]))
      .toEqual([['app/a/left', 'app/b'], ['app/a/left', 'app/b/core']]);
    expect(links.some((link) => link.consumer === 'app/b/core' || link.provider === 'app/b/core')).toBe(false);
    // `app/c -> app` has no displayed end inside `app/a` and is not drawn.
    expect(dependencies.originalOwnerEdges.some((edge) => edge.consumer === 'app/c' && edge.provider === 'app')).toBe(true);
    expect(links.some((link) => link.consumer === 'app/c' || link.provider === 'app')).toBe(false);
    // The frame ends are drawn nowhere.
    expect(links.some((link) => link.consumer === 'app/a' || link.provider === 'app/a')).toBe(false);

    render(<ProjectExplorerView {...viewProps(project, dependencies,
      { scopeModuleId: 'app/a', dependencySettings: settings({ showNonBehavioral: true }) })} />);
    expect(drawn()).toEqual(drawnOf(links));
    expect(outOfView().sort()).toEqual(['app', 'app/b', 'app/c']);
  });

  it('BD47 draws a parent-and-child dependency at no scope and keeps it in the measured totals', () => {
    const { forwarding } = mappedDependencyModels();
    const project = forwardingProject();
    const tree = indexModuleTree(project.modules, project.rootModuleId);
    const edge = forwarding.originalOwnerEdges
      .find((item) => item.consumer === 'app/b/core' && item.provider === 'app/b')!;
    expect(edge.counts).toEqual({ behavioral: 0, nonBehavioral: 1 });
    // Internal at the project scope, a frame end inside `app/b`: the roll-up draws it nowhere.
    for (const scopeModuleId of [null, ...project.modules.map((module) => module.id)]) {
      const scope = dependencyScope(project, scopeModuleId);
      const links = scopeDependencyLinks({ model: forwarding, scope, displayed: new Set(scope.nodes), tree,
        settings: { showNonBehavioral: true, depthMode: 'level', showOutsideScope: true,
        showOwnSourceNode: false } });
      expect(links.some((link) => link.sources.includes(edge))).toBe(false);
    }
    // `Exact module` keeps iteration 6's ends: inside `app/b` it is drawn with `app/b` out of view.
    const exactInsideB = scopeDependencyLinks({ model: forwarding, scope: dependencyScope(project, 'app/b'),
      displayed: new Set(['app/b/core']), tree,
      settings: { showNonBehavioral: true, depthMode: 'exact', showOutsideScope: true,
        showOwnSourceNode: false } });
    expect(exactInsideB.map((link) => [link.consumer, link.provider]))
      .toEqual([['app/a', 'app/b/core'], ['app/b/core', 'app/b']]);
    const projectScope = dependencyScope(project, null);
    expect(scopeEnd('app/b/core', projectScope, 'level', tree))
      .toEqual({ kind: 'node', module: 'app/b', inScope: true });
    const insideB = dependencyScope(project, 'app/b');
    expect(scopeEnd('app/b', insideB, 'level', tree)).toEqual({ kind: 'frame' });

    // `app/b`'s module panel keeps the dependency in `Including internals`.
    render(<ProjectExplorerView {...viewProps(project, forwarding, { selectedModuleId: 'app/b' })} />);
    expect(pair(region('Uses'), 'Including internals')).toEqual({ behavioral: 1, nonBehavioral: 1 });
    expect(pair(region('Uses'), 'At this level')).toEqual({ behavioral: 1, nonBehavioral: 0 });
    cleanup();

    // The drilled-in scope reports the frame module's own source.
    render(<ProjectExplorerView {...viewProps(project, forwarding, { scopeModuleId: 'app/b' })} />);
    const own = region("Scope's own source");
    expect(pair(own, 'Uses')).toEqual({ behavioral: 1, nonBehavioral: 0 });
    expect(pair(own, 'Owned originals used by others')).toEqual({ behavioral: 0, nonBehavioral: 1 });
    expect(within(own).getByText(/own source is folded into the frame/)).toBeInTheDocument();
  });

  it('BD48 counts a rolled-up link as distinct pairs, with settled status, coverage and ordered sources', () => {
    const { project, dependencies } = collectionReview();
    const tree = indexModuleTree(project.modules, project.rootModuleId);
    // On the reference the distinct pairs equal the sum of the contributing edges, at every scope.
    let rolledUp = 0;
    for (const scopeModuleId of [null, ...project.modules.map((module) => module.id)]) {
      const scope = dependencyScope(project, scopeModuleId);
      const links = scopeDependencyLinks({ model: dependencies, scope, displayed: new Set(scope.nodes), tree,
        settings: { showNonBehavioral: true, depthMode: 'level', showOutsideScope: true,
        showOwnSourceNode: false } });
      const expected = expectedScopeLinks({ project, dependencies, scopeModuleId, showNonBehavioral: true });
      expect(links.map((link) => [link.consumer, link.provider, link.behavioral, link.nonBehavioral, link.sources.map((edge) => edge.id)]))
        .toEqual(expected.map((link) => [link.consumer, link.provider, link.behavioral, link.nonBehavioral, link.sources]));
      for (const link of links) {
        const sum = link.sources.reduce((total, edge) => ({
          behavioral: total.behavioral + edge.counts.behavioral,
          nonBehavioral: total.nonBehavioral + edge.counts.nonBehavioral }), { behavioral: 0, nonBehavioral: 0 });
        expect({ behavioral: link.behavioral, nonBehavioral: link.nonBehavioral }).toEqual(sum);
        if (link.sources.length > 1) rolledUp += 1;
      }
    }
    expect(rolledUp).toBeGreaterThan(0);

    // Status, coverage and ordering over several contributing edges.
    const nestedProject = nestedLevelsProject();
    const nested = nestedLevelsDependencies();
    const link = scopedLinks(nestedProject, nested, { showNonBehavioral: true }, 'app/a')
      .find((item) => item.consumer === 'app/a/left' && item.provider === 'app/b')!;
    expect(link.sources).toHaveLength(2);
    // `delta` is denied and `beta` limited, so the link is denied.
    expect(link.sources.flatMap((edge) => edge.evidence.map((item) => item.status)).sort())
      .toEqual(['allowed', 'denied', 'limited']);
    expect(link.status).toBe('denied');
    expect(link.coverageIds).toEqual(['limit-nested-1']);
    // Three distinct pairs, one settled behavioral because one of its rows is.
    expect({ behavioral: link.behavioral, nonBehavioral: link.nonBehavioral })
      .toEqual({ behavioral: 1, nonBehavioral: 2 });
    expect(link.sources.map((edge) => edge.provider)).toEqual(['app/b', 'app/b/core']);
    expect(link.depthMode).toBe('level');
    expect(link.id).toContain('scoped-link/1:level:app/a:');
  });

  it('BD49 hides the links that leave the scope with their out-of-view nodes', () => {
    const project = nestedLevelsProject();
    const dependencies = nestedLevelsDependencies();
    const onSelectEdge = vi.fn();
    const inside = scopedLinks(project, dependencies, { showNonBehavioral: true }, 'app/a');
    const leaving = inside.filter((link) => link.leavesScope);
    const staying = inside.filter((link) => !link.leavesScope);
    expect(leaving.length).toBeGreaterThan(0);
    expect(staying.length).toBeGreaterThan(0);
    render(<ProjectExplorerView {...viewProps(project, dependencies,
      { scopeModuleId: 'app/a', onSelectEdge })} />);
    // The default is on.
    expect(screen.getByRole('checkbox', { name: 'Show dependencies that leave this module' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show non-behavioral dependencies' }));
    expect(drawn()).toEqual(drawnOf(inside));
    expect(outOfView().length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show dependencies that leave this module' }));
    expect(drawn()).toEqual(drawnOf(staying));
    expect(outOfView()).toEqual([]);
    expect(drawnOf(expectedScopeLinks({ project, dependencies, scopeModuleId: 'app/a',
      showNonBehavioral: true, showOutsideScope: false }))).toEqual(drawn());
    cleanup();

    // A selected leaving link is cleared when the toggle hides it.
    onSelectEdge.mockClear();
    const selected: GraphSelection = { kind: 'edge', id: leaving[0]!.id, edge: leaving[0]! };
    const rendered = render(<ProjectExplorerView {...viewProps(project, dependencies, { scopeModuleId: 'app/a',
      selectedEdge: selected, onSelectEdge, dependencySettings: settings({ showNonBehavioral: true }) })} />);
    expect(onSelectEdge).not.toHaveBeenCalled();
    rendered.rerender(<ProjectExplorerView {...viewProps(project, dependencies, { scopeModuleId: 'app/a',
      selectedEdge: selected, onSelectEdge,
      dependencySettings: settings({ showNonBehavioral: true, showOutsideScope: false }) })} />);
    expect(onSelectEdge).toHaveBeenCalledWith(null);
    rendered.unmount();

    // A scope that covers the project has no outside, so the control is absent there.
    render(<ProjectExplorerView {...viewProps(project, dependencies, { onSelectEdge })} />);
    expect(screen.queryByRole('checkbox', { name: 'Show dependencies that leave this module' }))
      .not.toBeInTheDocument();
  });

  it('BD50 reconciles a selection by its exact link ID without invoking a data callback', () => {
    const { project, dependencies } = collectionReview();
    const onSelectEdge = vi.fn();
    const onSelectModule = vi.fn();
    const failing = (name: string) => vi.fn(() => { throw new Error(`${name} requested data`); });
    const base = (overrides: Overrides) => viewProps(project, dependencies, {
      onSelectEdge, onSelectModule, onRefresh: failing('refresh'), onToggleExport: failing('export detail'),
      onToggleDependency: failing('occurrence detail'), onNavigateToScope: failing('scope'), ...overrides });
    const rolled = scopedLinks(project, dependencies, { showNonBehavioral: true }, workspace)[0]!;
    // An exact link whose end stays displayed in both scopes: `catalog/core` onto `contracts`.
    const exact = scopedLinks(project, dependencies, { showNonBehavioral: true, depthMode: 'exact' }, workspace)
      .find((link) => link.consumer === `${catalog}/core` && link.provider === contracts)!;
    const selection = (edge: ActiveDependencyEdge): GraphSelection => ({ kind: 'edge', id: edge.id, edge });

    // A rolled-up ID names its scope and depth mode.
    expect(rolled.id).toContain(`scoped-link/1:level:${workspace}:`);
    const rendered = render(<ProjectExplorerView {...base({ scopeModuleId: workspace,
      dependencySettings: settings({ showNonBehavioral: true }), selectedEdge: selection(rolled) })} />);
    expect(onSelectEdge).not.toHaveBeenCalled();
    rendered.rerender(<ProjectExplorerView {...base({ scopeModuleId: catalog,
      dependencySettings: settings({ showNonBehavioral: true }), selectedEdge: selection(rolled) })} />);
    expect(onSelectEdge).toHaveBeenCalledWith(null);
    onSelectEdge.mockClear();
    rendered.rerender(<ProjectExplorerView {...base({ scopeModuleId: workspace,
      dependencySettings: settings({ showNonBehavioral: true, depthMode: 'exact' }),
      selectedEdge: selection(rolled) })} />);
    expect(onSelectEdge).toHaveBeenCalledWith(null);
    onSelectEdge.mockClear();

    // An exact selection survives a scope change while its link is still drawn.
    expect(exact.id).toBe(exact.sources[0]!.id);
    rendered.rerender(<ProjectExplorerView {...base({ scopeModuleId: workspace,
      dependencySettings: settings({ showNonBehavioral: true, depthMode: 'exact' }),
      selectedEdge: selection(exact) })} />);
    expect(onSelectEdge).not.toHaveBeenCalled();
    rendered.rerender(<ProjectExplorerView {...base({ scopeModuleId: catalog,
      dependencySettings: settings({ showNonBehavioral: true, depthMode: 'exact' }),
      selectedEdge: selection(exact) })} />);
    expect(onSelectEdge).not.toHaveBeenCalled();
    expect(lastGraph().edges.some((edge) => edge.id === exact.id)).toBe(true);

    // A module selection survives while its node is displayed, and is cleared otherwise.
    rendered.rerender(<ProjectExplorerView {...base({ scopeModuleId: workspace, selectedModuleId: catalog })} />);
    expect(onSelectModule).not.toHaveBeenCalled();
    rendered.rerender(<ProjectExplorerView {...base({ scopeModuleId: catalog, selectedModuleId: catalog })} />);
    expect(onSelectModule).toHaveBeenCalledWith(null);
  });

  it('BD51 labels the filtered numbers of each scope against the measured ones', () => {
    const { project, dependencies } = collectionReview();
    const tree = indexModuleTree(project.modules, project.rootModuleId);
    const measured = expectedProject(dependencies);
    expect(measured).toEqual({ behavioral: 17, nonBehavioral: 48 });

    // The project scope draws nothing, so nothing of the project is at this level.
    const { rerender } = render(<ProjectExplorerView {...viewProps(project, dependencies)} />);
    const projectRegion = () => screen.getByRole('region', { name: 'Project dependencies' });
    expect(pair(projectRegion(), 'This view')).toEqual({ behavioral: 0, nonBehavioral: 0 });
    expect(pair(projectRegion(), 'Whole project')).toEqual(measured);
    expect(document.querySelector('.module-arch__not-drawn')!.getAttribute('data-not-drawn')).toBe('17/48');

    // Inside `workspace`: 7/41 of 17/48, so 10 and 7 are not drawn at this level.
    rerender(<ProjectExplorerView {...viewProps(project, dependencies, { scopeModuleId: workspace })} />);
    expect(pair(projectRegion(), 'This view')).toEqual({ behavioral: 7, nonBehavioral: 41 });
    expect(pair(projectRegion(), 'Whole project')).toEqual(measured);
    expect(document.querySelector('.module-arch__not-drawn')!.getAttribute('data-not-drawn')).toBe('10/7');
    const own = region("Scope's own source");
    expect(pair(own, 'Uses')).toEqual({ behavioral: 2, nonBehavioral: 1 });

    // `catalog` at that scope: Uses 1/11 against 3/13, owned originals 3/0 against 6/2.
    rerender(<ProjectExplorerView {...viewProps(project, dependencies,
      { scopeModuleId: workspace, selectedModuleId: catalog })} />);
    const subtree = subtreeDependencyCounts(dependencies, catalog, tree);
    expect(subtree.uses).toEqual({ behavioral: 3, nonBehavioral: 13 });
    expect(subtree.ownedUsedByOthers).toEqual({ behavioral: 6, nonBehavioral: 2 });
    expect(pair(region('Uses'), 'At this level')).toEqual({ behavioral: 1, nonBehavioral: 11 });
    expect(pair(region('Uses'), 'Including internals')).toEqual(subtree.uses);
    expect(pair(region('Owned originals used by others'), 'At this level')).toEqual({ behavioral: 3, nonBehavioral: 0 });
    expect(pair(region('Owned originals used by others'), 'Including internals')).toEqual(subtree.ownedUsedByOthers);
    // `Used through this module` stays measured, in a disclosure.
    const through = region('Used through this module');
    expect(through.closest('details')).not.toBeNull();
    expect(pair(through, 'Including internals')).toEqual({ behavioral: subtree.usedThrough.behavioralUsedOriginals,
      nonBehavioral: subtree.usedThrough.nonBehavioralUsedOriginals });

    // The rolled-up link panel lists its contributing exact modules.
    const link = scopedLinks(project, dependencies, { showNonBehavioral: true }, workspace)
      .find((item) => item.consumer === reviews && item.provider === contracts)!;
    expect(link.sources.length).toBeGreaterThan(1);
    rerender(<ProjectExplorerView {...viewProps(project, dependencies, { scopeModuleId: workspace,
      dependencySettings: settings({ showNonBehavioral: true }),
      selectedEdge: { kind: 'edge', id: link.id, edge: link } })} />);
    expect(pair(region('Dependencies'), 'At this level')).toEqual({ behavioral: 0, nonBehavioral: 24 });
    expect([...region('Rolled-up modules').querySelectorAll('.module-arch__breakdown-item')]
      .map((row) => [row.getAttribute('data-consumer'), row.getAttribute('data-provider')]))
      .toEqual(link.sources.map((edge) => [edge.consumer, edge.provider]));
  });
});

describe("Plan 6D the scope module's own source as a node", () => {
  const graphProps: ModuleGraphProps[] = [];
  function RecordingGraph(props: ModuleGraphProps): React.ReactElement {
    graphProps.push(props);
    return <MockGraph {...props} />;
  }
  const lastGraph = () => graphProps.at(-1)!;
  afterEach(() => { graphProps.length = 0; });

  /** Data callbacks fail: no control or selection change may request data. */
  const failing = (name: string) => vi.fn(() => { throw new Error(`${name} requested data`); });

  function viewProps(project: ProjectExplorerModel, model: DependencyGraphModel,
    overrides: Overrides = {}): ProjectExplorerViewProps {
    return createProps({
      data: project,
      dependencies: readyDependencies(model),
      selectedPresentationClasses: [...new Set(project.modules.map((module) => module.presentationClass))],
      GraphComponent: RecordingGraph,
      DiscussionComponent: undefined,
      onRefresh: failing('refresh'),
      onToggleExport: failing('export detail'),
      onToggleDependency: failing('occurrence detail'),
      onNavigateToScope: failing('scope'),
      ...overrides,
    });
  }

  const settings = (overrides: Partial<DependencySettings> = {}): DependencySettings =>
    ({ ...defaultDependencySettings, ...overrides });
  const drawn = () => lastGraph().edges
    .map((edge) => `${edge.consumer}>${edge.provider}:${edge.behavioral}/${edge.nonBehavioral}`);
  const drawnOf = (links: readonly { consumer: string; provider: string;
    behavioral: number; nonBehavioral: number }[]) => links
    .map((link) => `${link.consumer}>${link.provider}:${link.behavioral}/${link.nonBehavioral}`);
  const pair = (host: HTMLElement, label: string) => {
    const group = within(host).getByRole('group', { name: label, hidden: true });
    return {
      behavioral: Number(group.querySelector('[data-headline="behavioral"] .module-arch__headline-value')!.textContent),
      nonBehavioral: Number(group.querySelector('[data-headline="non-behavioral"] .module-arch__headline-value')!.textContent),
    };
  };
  const region = (name: string) => screen.getByRole('region', { name, hidden: true });
  const ownSourceToggle = () => screen.getByRole('checkbox', { name: "Show this module's own source as a node" });
  const notDrawn = () => document.querySelector('.module-arch__not-drawn')!;
  const workspace = 'collection-review/workspace';

  /** Links calculated by the implementation for one scope, with the own-source control applied. */
  function links(project: ProjectExplorerModel, model: DependencyGraphModel,
    scopeModuleId: string | null, overrides: Partial<DependencySettings> = {}): ActiveDependencyEdge[] {
    const applied = { ...defaultDependencySettings, showNonBehavioral: true, ...overrides };
    const scope = dependencyScope(project, scopeModuleId,
      applied.showOwnSourceNode && applied.depthMode === 'level');
    return scopeDependencyLinks({
      model,
      scope,
      displayed: new Set(scope.nodes),
      tree: indexModuleTree(project.modules, project.rootModuleId),
      settings: applied,
    });
  }

  it('BD53 adds the own-source node to the scope and maps the frame module to it', () => {
    const project = nestedLevelsProject();
    const tree = indexModuleTree(project.modules, project.rootModuleId);
    const inside = dependencyScope(project, 'app/a', true);
    expect(inside).toEqual({ frameModule: 'app/a', nodes: ['app/a/left', 'app/a/right'], depth: 2,
      ownSourceNode: 'app/a' });
    expect(inside).toEqual(expectedScope(project, 'app/a', true));
    expect(ownSourceNodeId('app/a')).toBe(expectedOwnSourceNodeId('app/a'));
    expect(ownSourceNodeModule(ownSourceNodeId('app/a'))).toBe('app/a');
    // The node ID is no module ID, and no module ID is an own-source node ID.
    for (const module of project.modules) {
      expect(module.id).not.toBe(ownSourceNodeId('app/a'));
      expect(ownSourceNodeModule(module.id)).toBeNull();
    }
    // Clause 2: the scope module's own source is the own-source node, in scope.
    expect(scopeEnd('app/a', inside, 'level', tree)).toEqual({ kind: 'own-source', module: 'app/a' });
    // Clauses 1 and 3 give the ends BD44 records.
    expect(scopeEnd('app/a/left', inside, 'level', tree))
      .toEqual({ kind: 'node', module: 'app/a/left', inScope: true });
    expect(scopeEnd('app/b/core', inside, 'level', tree))
      .toEqual({ kind: 'node', module: 'app/b', inScope: false });
    expect(scopeEnd('app/c', inside, 'level', tree)).toEqual({ kind: 'node', module: 'app/c', inScope: false });
    expect(scopeEnd('app', inside, 'level', tree)).toEqual({ kind: 'node', module: 'app', inScope: false });

    // The project scope has no own-source node, although its frame is the root module.
    const projectScope = dependencyScope(project, null, true);
    expect(projectScope.frameModule).toBe('app');
    expect(projectScope.ownSourceNode).toBeNull();
    expect(projectScope).toEqual(expectedScope(project, null, true));
    expect(scopeEnd('app', projectScope, 'level', tree)).toEqual({ kind: 'frame' });

    // Every scope and both modes agree with the independent mapping, with the control on.
    for (const scopeModuleId of [null, ...project.modules.map((module) => module.id)]) {
      for (const showOwnSourceNode of [false, true]) {
        const scope = dependencyScope(project, scopeModuleId, showOwnSourceNode);
        const expected = expectedScope(project, scopeModuleId, showOwnSourceNode);
        expect(scope).toEqual(expected);
        for (const depthMode of ['level', 'exact'] as const) {
          for (const id of project.modules.map((module) => module.id)) {
            expect(scopeEnd(id, scope, depthMode, tree)).toEqual(expectedEnd(project, expected, id, depthMode));
          }
        }
      }
    }
    // `exact` returns before clause 2, so the control changes no end there.
    for (const id of project.modules.map((module) => module.id)) {
      expect(scopeEnd(id, inside, 'exact', tree))
        .toEqual(scopeEnd(id, dependencyScope(project, 'app/a'), 'exact', tree));
    }
    // An end still depends on neither the class filter nor the other settings: it takes neither.
    const ends = project.modules.map((module) => scopeEnd(module.id, inside, 'level', tree));
    expect(project.modules.map((module) => scopeEnd(module.id, inside, 'level', tree))).toEqual(ends);
  });

  it('BD54 draws the own-source node onto a child and a child onto it', () => {
    const project = nestedLevelsProject();
    const dependencies = nestedLevelsDependencies();
    const node = ownSourceNodeId('app/a');
    // The parent's own source onto its child: `app/a -> app/a/left`.
    const parentEdge = dependencies.originalOwnerEdges
      .find((edge) => edge.consumer === 'app/a' && edge.provider === 'app/a/left')!;
    const folded = links(project, dependencies, 'app/a');
    expect(folded.some((link) => link.sources.includes(parentEdge))).toBe(false);
    const withNode = links(project, dependencies, 'app/a', { showOwnSourceNode: true });
    const expected = expectedScopeLinks({ project, dependencies, scopeModuleId: 'app/a',
      showNonBehavioral: true, showOwnSourceNode: true });
    expect(withNode.map((link) => [link.id, link.consumer, link.provider, link.behavioral,
      link.nonBehavioral, link.status]))
      .toEqual(expected.map((link) => [link.id, link.consumer, link.provider, link.behavioral,
        link.nonBehavioral, link.status]));
    const onto = withNode.find((link) => link.consumer === node)!;
    expect([onto.provider, onto.behavioral, onto.nonBehavioral, onto.status])
      .toEqual(['app/a/left', 1, 0, 'allowed']);
    expect(onto.sources).toEqual([parentEdge]);
    expect(onto.id).toBe(`scoped-link/1:level:app/a:${JSON.stringify([node, 'app/a/left'])}`);
    expect(onto.leavesScope).toBe(false);
    // Switching the control off folds it again, and no other link changes.
    expect(drawnOf(folded)).toEqual(drawnOf(withNode.filter((link) =>
      link.consumer !== node && link.provider !== node)));

    // The child onto its parent's own source: `forwarding`'s `app/b/core -> app/b`, BD47's edge.
    const { forwarding } = mappedDependencyModels();
    const forwardingModel = forwardingProject();
    const coreEdge = forwarding.originalOwnerEdges
      .find((edge) => edge.consumer === 'app/b/core' && edge.provider === 'app/b')!;
    const insideB = links(forwardingModel, forwarding, 'app/b', { showOwnSourceNode: true });
    const expectedB = expectedScopeLinks({ project: forwardingModel, dependencies: forwarding,
      scopeModuleId: 'app/b', showNonBehavioral: true, showOwnSourceNode: true });
    expect(insideB.map((link) => [link.id, link.consumer, link.provider, link.behavioral, link.nonBehavioral]))
      .toEqual(expectedB.map((link) => [link.id, link.consumer, link.provider, link.behavioral, link.nonBehavioral]));
    const back = insideB.find((link) => link.provider === ownSourceNodeId('app/b'))!;
    expect([back.consumer, back.behavioral, back.nonBehavioral]).toEqual(['app/b/core', 0, 1]);
    expect(back.sources).toEqual([coreEdge]);
    expect(links(forwardingModel, forwarding, 'app/b').some((link) => link.sources.includes(coreEdge))).toBe(false);

    // The component draws both nodes and both directions, and drops them again.
    const rendered = render(<ProjectExplorerView {...viewProps(project, dependencies,
      { scopeModuleId: 'app/a',
        dependencySettings: settings({ showNonBehavioral: true, showOwnSourceNode: true }) })} />);
    expect(lastGraph().ownSourceNode).toEqual({ id: node,
      module: project.modules.find((module) => module.id === 'app/a') });
    expect(drawn()).toEqual(drawnOf(expected));
    expect(drawn()).toContain(`${node}>app/a/left:1/0`);
    rendered.rerender(<ProjectExplorerView {...viewProps(project, dependencies, { scopeModuleId: 'app/a',
      dependencySettings: settings({ showNonBehavioral: true }) })} />);
    expect(lastGraph().ownSourceNode).toBeNull();
    expect(drawn()).toEqual(drawnOf(folded));
    rendered.unmount();

    render(<ProjectExplorerView {...viewProps(forwardingModel, forwarding, { scopeModuleId: 'app/b',
      dependencySettings: settings({ showNonBehavioral: true, showOwnSourceNode: true }) })} />);
    expect(drawn()).toContain(`app/b/core>${ownSourceNodeId('app/b')}:0/1`);
  });

  it('BD55 draws exactly the formerly folded edges of the reference scope', () => {
    const { project, dependencies } = collectionReview();
    const tree = indexModuleTree(project.modules, project.rootModuleId);
    const node = ownSourceNodeId(workspace);
    const foldedInside = dependencies.originalOwnerEdges.filter((edge) => {
      const scope = dependencyScope(project, workspace);
      return [edge.consumer, edge.provider]
        .some((id) => scopeEnd(id, scope, 'level', tree).kind === 'frame');
    });
    expect(foldedInside).toHaveLength(3);
    const before = links(project, dependencies, workspace);
    const after = links(project, dependencies, workspace, { showOwnSourceNode: true });
    const expected = expectedScopeLinks({ project, dependencies, scopeModuleId: workspace,
      showNonBehavioral: true, showOwnSourceNode: true });
    expect(after.map((link) => [link.id, link.consumer, link.provider, link.behavioral, link.nonBehavioral,
      link.status, link.sources.map((edge) => edge.id)]))
      .toEqual(expected.map((link) => [link.id, link.consumer, link.provider, link.behavioral,
        link.nonBehavioral, link.status, link.sources]));
    // Exactly the folded edges are added, grouped by their mapped node pairs.
    const added = after.filter((link) => link.consumer === node || link.provider === node);
    expect(added.flatMap((link) => link.sources).sort((left, right) => left.id < right.id ? -1 : 1))
      .toEqual([...foldedInside].sort((left, right) => left.id < right.id ? -1 : 1));
    expect(added.length).toBeGreaterThan(0);
    // Every other link keeps its endpoints, counts, status, sources and ID.
    const key = (link: ActiveDependencyEdge) => JSON.stringify([link.id, link.consumer, link.provider,
      link.behavioral, link.nonBehavioral, link.status, link.sources.map((edge) => edge.id)]);
    expect(after.filter((link) => link.consumer !== node && link.provider !== node).map(key))
      .toEqual(before.map(key));

    // The control is not rendered at the project scope, so its 8 folded edges stay folded.
    const projectScope = dependencyScope(project, null, true);
    expect(projectScope.ownSourceNode).toBeNull();
    expect(links(project, dependencies, null, { showOwnSourceNode: true })).toHaveLength(0);
    expect(dependencies.originalOwnerEdges.filter((edge) => [edge.consumer, edge.provider]
      .some((id) => scopeEnd(id, dependencyScope(project, null), 'level', tree).kind === 'frame')))
      .toHaveLength(8);
  });

  it('BD56 moves the own-source pairs from the numbers not drawn into this view', () => {
    const { project, dependencies } = collectionReview();
    const node = ownSourceNodeId(workspace);
    const measured = expectedProject(dependencies);
    expect(measured).toEqual({ behavioral: 17, nonBehavioral: 48 });
    const before = scopeLinkCounts(links(project, dependencies, workspace));
    const after = links(project, dependencies, workspace, { showOwnSourceNode: true });
    const ownLinks = after.filter((link) => link.consumer === node || link.provider === node);
    const own = scopeLinkCounts(ownLinks);
    expect(own.behavioral + own.nonBehavioral).toBeGreaterThan(0);

    const { rerender } = render(<ProjectExplorerView {...viewProps(project, dependencies,
      { scopeModuleId: workspace })} />);
    const projectRegion = () => screen.getByRole('region', { name: 'Project dependencies' });
    expect(pair(projectRegion(), 'This view')).toEqual(before);
    expect(notDrawn().getAttribute('data-not-drawn'))
      .toBe(`${measured.behavioral - before.behavioral}/${measured.nonBehavioral - before.nonBehavioral}`);
    expect(notDrawn().textContent).toContain("folded into the scope's own source");

    fireEvent.click(ownSourceToggle());
    rerender(<ProjectExplorerView {...viewProps(project, dependencies, { scopeModuleId: workspace,
      dependencySettings: settings({ showOwnSourceNode: true }) })} />);
    const thisView = pair(projectRegion(), 'This view');
    expect(thisView).toEqual({ behavioral: before.behavioral + own.behavioral,
      nonBehavioral: before.nonBehavioral + own.nonBehavioral });
    expect(pair(projectRegion(), 'Whole project')).toEqual(measured);
    const remaining = notDrawn().getAttribute('data-not-drawn')!.split('/').map(Number);
    expect(remaining).toEqual([measured.behavioral - thisView.behavioral,
      measured.nonBehavioral - thisView.nonBehavioral]);
    expect(thisView.behavioral + remaining[0]!).toBe(measured.behavioral);
    expect(thisView.nonBehavioral + remaining[1]!).toBe(measured.nonBehavioral);
    // The remaining causes are the internal and the outside ones only.
    expect(notDrawn().textContent).toContain('internal to a displayed node');
    expect(notDrawn().textContent).toContain('outside the scope');
    expect(notDrawn().textContent).not.toContain('folded');
    // The scope's own source is now drawn as its own node.
    expect(within(region("Scope's own source")).getByText(/own source is drawn as its own node here/))
      .toBeInTheDocument();
  });

  it('BD57 renders the control only in a drilled-in scope and disables it in Exact module', () => {
    const { project, dependencies } = collectionReview();
    const onSettings = vi.fn();
    const { rerender } = render(<ProjectExplorerView {...viewProps(project, dependencies,
      { onDependencySettingsChange: onSettings, onDrillDown: failing('drill-down') })} />);
    // Absent at the project scope, whose frame is the root module.
    expect(dependencyScope(project, null).frameModule).not.toBeNull();
    expect(screen.queryByRole('checkbox', { name: "Show this module's own source as a node" }))
      .not.toBeInTheDocument();

    rerender(<ProjectExplorerView {...viewProps(project, dependencies, { scopeModuleId: workspace,
      onDependencySettingsChange: onSettings, onDrillDown: failing('drill-down') })} />);
    const toggle = ownSourceToggle();
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();
    expect(toggle.tagName).toBe('INPUT');
    expect(toggle.getAttribute('type')).toBe('checkbox');
    expect(toggle.closest('label')).not.toBeNull();
    fireEvent.click(toggle);
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenLastCalledWith(settings({ showOwnSourceNode: true }));

    // `Exact module` disables it and keeps its value; no own-source node is drawn.
    rerender(<ProjectExplorerView {...viewProps(project, dependencies, { scopeModuleId: workspace,
      onDependencySettingsChange: onSettings, onDrillDown: failing('drill-down'),
      dependencySettings: settings({ showOwnSourceNode: true, depthMode: 'exact' }) })} />);
    expect(ownSourceToggle()).toBeChecked();
    expect(ownSourceToggle()).toBeDisabled();
    expect(lastGraph().ownSourceNode).toBeNull();
    expect(lastGraph().edges.some((edge) => edge.consumer.startsWith('own-source/1:')
      || edge.provider.startsWith('own-source/1:'))).toBe(false);
  });

  it('BD59 shows the own-source panel against the module row excluding internals', () => {
    const { project, dependencies } = collectionReview();
    const node = ownSourceNodeId(workspace);
    const row = dependencies.modules.find((item) => item.id === workspace)!;
    const scoped = links(project, dependencies, workspace, { showOwnSourceNode: true });
    const counts = (select: (link: ActiveDependencyEdge) => boolean) =>
      scopeLinkCounts(scoped.filter(select));
    render(<ProjectExplorerView {...viewProps(project, dependencies, { scopeModuleId: workspace,
      selectedModuleId: node,
      dependencySettings: settings({ showNonBehavioral: true, showOwnSourceNode: true }) })} />);
    expect(screen.getByRole('heading', { name: 'workspace · own source' })).toBeInTheDocument();
    expect(pair(region('Uses'), 'At this level')).toEqual(counts((link) => link.consumer === node));
    expect(pair(region('Uses'), 'Excluding internals')).toEqual(row.uses);
    expect(pair(region('Owned originals used by others'), 'At this level'))
      .toEqual(counts((link) => link.provider === node));
    expect(pair(region('Owned originals used by others'), 'Excluding internals'))
      .toEqual(row.ownedUsedByOthers);
    // The measured imported unit stays in a disclosure.
    const through = region('Used through this module');
    expect(through.closest('details')).not.toBeNull();
    expect(pair(through, 'Excluding internals'))
      .toEqual({ behavioral: row.usedThrough.behavioralUsedOriginals,
        nonBehavioral: row.usedThrough.nonBehavioralUsedOriginals });
    // Its displayed links and owned source files.
    const displayed = scoped.filter((link) => link.consumer === node || link.provider === node).length;
    const metrics = [...document.querySelectorAll('.module-arch__metric')]
      .map((item) => [item.querySelector('.module-arch__metric-label')!.textContent,
        item.querySelector('.module-arch__metric-value')!.textContent]);
    expect(metrics).toContainEqual(['Links displayed', String(displayed)]);
    const workspaceModule = project.modules.find((module) => module.id === workspace)!;
    expect(metrics).toContainEqual(['Owned source files',
      String(workspaceModule.files.filter((file) => file.kind === 'source').length)]);
    expect(screen.getByText(/appear on its own node in the\s+enclosing scope/)).toBeInTheDocument();
  });

  it('BD60 clears an own-source selection when the node leaves the drawn set', () => {
    const { project, dependencies } = collectionReview();
    const node = ownSourceNodeId(workspace);
    const onSelectModule = vi.fn();
    const onSelectEdge = vi.fn();
    const own = settings({ showNonBehavioral: true, showOwnSourceNode: true });
    const base = (overrides: Overrides) => viewProps(project, dependencies,
      { scopeModuleId: workspace, onSelectModule, onSelectEdge, onDrillDown: failing('drill-down'),
        dependencySettings: own, ...overrides });
    const child = project.modules.find((module) => module.parent === workspace)!.id;

    // A selected own-source node survives while the node is drawn.
    const rendered = render(<ProjectExplorerView {...base({ selectedModuleId: node })} />);
    expect(onSelectModule).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'workspace · own source' })).toBeInTheDocument();
    // Switching the control off clears it.
    rendered.rerender(<ProjectExplorerView {...base({ selectedModuleId: node,
      dependencySettings: settings({ showNonBehavioral: true }) })} />);
    expect(onSelectModule).toHaveBeenCalledWith(null);
    onSelectModule.mockClear();
    // A scope change clears it.
    rendered.rerender(<ProjectExplorerView {...base({ selectedModuleId: node, scopeModuleId: child })} />);
    expect(onSelectModule).toHaveBeenCalledWith(null);
    onSelectModule.mockClear();
    // `Exact module` clears it.
    rendered.rerender(<ProjectExplorerView {...base({ selectedModuleId: node,
      dependencySettings: settings({ showNonBehavioral: true, showOwnSourceNode: true, depthMode: 'exact' }) })} />);
    expect(onSelectModule).toHaveBeenCalledWith(null);
    onSelectModule.mockClear();

    // A selected own-source link is cleared by the same three changes.
    const ownLink = links(project, dependencies, workspace, { showOwnSourceNode: true })
      .find((link) => link.consumer === node || link.provider === node)!;
    const selection: GraphSelection = { kind: 'edge', id: ownLink.id, edge: ownLink };
    rendered.rerender(<ProjectExplorerView {...base({ selectedEdge: selection })} />);
    expect(onSelectEdge).not.toHaveBeenCalled();
    for (const overrides of [
      { dependencySettings: settings({ showNonBehavioral: true }) },
      { scopeModuleId: child },
      { dependencySettings: settings({ showNonBehavioral: true, showOwnSourceNode: true, depthMode: 'exact' }) },
    ] as Overrides[]) {
      onSelectEdge.mockClear();
      rendered.rerender(<ProjectExplorerView {...base({ selectedEdge: selection })} />);
      rendered.rerender(<ProjectExplorerView {...base({ selectedEdge: selection, ...overrides })} />);
      expect(onSelectEdge).toHaveBeenCalledWith(null);
    }

    // A child-to-child link selection and a module selection survive the toggle.
    const childLink = links(project, dependencies, workspace)
      .find((link) => link.consumer !== node && link.provider !== node)!;
    const childSelection: GraphSelection = { kind: 'edge', id: childLink.id, edge: childLink };
    onSelectEdge.mockClear();
    onSelectModule.mockClear();
    rendered.rerender(<ProjectExplorerView {...base({ selectedEdge: childSelection,
      dependencySettings: settings({ showNonBehavioral: true }) })} />);
    rendered.rerender(<ProjectExplorerView {...base({ selectedEdge: childSelection })} />);
    expect(onSelectEdge).not.toHaveBeenCalled();
    rendered.rerender(<ProjectExplorerView {...base({ selectedModuleId: child,
      dependencySettings: settings({ showNonBehavioral: true }) })} />);
    rendered.rerender(<ProjectExplorerView {...base({ selectedModuleId: child })} />);
    expect(onSelectModule).not.toHaveBeenCalled();
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
    dependencies: 'dependencies' in overrides ? overrides.dependencies : readyDependencies(createDependencies()),
    ...('dependencySettings' in overrides ? { dependencySettings: overrides.dependencySettings } : {}),
    ...('onDependencySettingsChange' in overrides
      ? { onDependencySettingsChange: overrides.onDependencySettingsChange } : {}),
  };
}

function readyDependencies(data: DependencyGraphModel, state: Partial<DependencyGraphState> = {}): DependencyGraphState {
  return { data, phase: 'ready', reason: null, isStale: false, ...state };
}

/** The links one project's whole scope draws, with every candidate node displayed. */
function scopedLinks(project: ProjectExplorerModel, model: DependencyGraphModel,
  overrides: Partial<DependencySettings> = {}, scopeModuleId: string | null = null,
  displayed?: readonly string[]): ActiveDependencyEdge[] {
  const scope = dependencyScope(project, scopeModuleId);
  return scopeDependencyLinks({
    model,
    scope,
    displayed: new Set(displayed ?? scope.nodes),
    tree: indexModuleTree(project.modules, project.rootModuleId),
    settings: { ...defaultDependencySettings, ...overrides },
  });
}

function linkSelection(settings: Partial<DependencySettings> = {}): GraphSelection {
  const edge = scopedLinks(createModel(), createDependencies(), settings)[0]!;
  return { kind: 'edge', id: edge.id, edge };
}

function createDependencies(): DependencyGraphModel {
  const evidence = {
    original: { kind: 'code' as const, owner: 'b', file: 'subs/b/src/index.ts', binding: 'Beta' },
    originalOwner: 'b', importedModule: 'b', classification: 'behavioral' as const,
    consumerFiles: ['subs/a/src/consumer.ts'], importedFiles: ['subs/b/src/index.ts'],
    originalFiles: ['subs/b/src/index.ts'], accessIds: ['access-a-b'], status: 'denied' as const,
    reasons: ['not-visible' as const], coverageIds: ['coverage-1'],
  };
  const throughRoot = { ...evidence, importedModule: 'root', importedFiles: ['src/index.ts'], accessIds: ['access-a-root'],
    status: 'allowed' as const, reasons: ['exposed' as const], coverageIds: [] };
  const zero = { behavioral: 0, nonBehavioral: 0 };
  const zeroImported = { behavioralUsedOriginals: 0, nonBehavioralUsedOriginals: 0 };
  return {
    schemaVersion: 'ramify.explorer-dependencies/1',
    inputId: 'input/1:view-test',
    state: 'complete',
    project: { behavioral: 1, nonBehavioral: 0 },
    modules: [
      { id: 'a', uses: { behavioral: 1, nonBehavioral: 0 }, usedThrough: zeroImported, ownedUsedByOthers: zero },
      { id: 'b', uses: zero, usedThrough: { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 },
        ownedUsedByOthers: { behavioral: 1, nonBehavioral: 0 } },
      { id: 'c', uses: zero, usedThrough: zeroImported, ownedUsedByOthers: zero },
      { id: 'root', uses: zero, usedThrough: { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 },
        ownedUsedByOthers: zero },
    ],
    importedModuleEdges: [{ id: 'dependency-edge/1:imported-module:a-b', projection: 'imported-module',
      consumer: 'a', provider: 'b', counts: { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 },
      originalOwners: [{ owner: 'b', counts: { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 } }],
      evidence: [evidence] }, { id: 'dependency-edge/1:imported-module:a-root', projection: 'imported-module',
      consumer: 'a', provider: 'root', counts: { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 },
      originalOwners: [{ owner: 'b', counts: { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 } }],
      evidence: [throughRoot] }],
    originalOwnerEdges: [{ id: 'dependency-edge/1:original-owner:a-b', projection: 'original-owner',
      consumer: 'a', provider: 'b', counts: { behavioral: 1, nonBehavioral: 0 },
      importedThrough: [{ module: 'b', counts: { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 } },
        { module: 'root', counts: { behavioralUsedOriginals: 1, nonBehavioralUsedOriginals: 0 } }],
      evidence: [evidence, throughRoot] }],
    coverage: { unknownDependencies: 0, limitIds: [] },
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
