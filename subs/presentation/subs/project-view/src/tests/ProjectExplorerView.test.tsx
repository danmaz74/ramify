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
import { activeDependencyEdges, defaultDependencySettings } from '../dependency-graph.js';
import {
  collectionReview,
  expectedImportedEdges,
  expectedModule,
  expectedOwnerEdges,
  expectedProject,
  forwardingProject,
  mappedDependencyModels,
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
    expect(screen.getByText('Imported-module link')).toBeInTheDocument();
    expect(screen.getAllByText(/Module A\s*->\s*Module B/).length).toBeGreaterThan(0);
    expect(screen.getByText('Referenced originals')).toBeInTheDocument();
    rerender(<ProjectExplorerView {...props} />);
    expect(screen.getByText('Imported-module link')).toBeInTheDocument();
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
  const linkTarget = (name: 'Imported modules' | 'Original owners') => within(
    screen.getByRole('radiogroup', { name: 'Link targets' })).getByRole('radio', { name });

  it('BD30 draws behavioral imported-module links by default and never occurrence edges, with nodes while pending', () => {
    const { project, dependencies } = collectionReview();
    const expected = expectedImportedEdges(dependencies);
    const behavioralIds = [...expected].filter(([, value]) => value.behavioral > 0).map(([id]) => id);
    const nonBehavioralOnly = [...expected].filter(([, value]) => value.behavioral === 0).map(([id]) => id);
    expect(behavioralIds.length).toBeGreaterThan(0);
    expect(nonBehavioralOnly.length).toBeGreaterThan(0);

    const { rerender } = render(<ProjectExplorerView {...diagramProps(project, readyDependencies(dependencies),
      { scopeModuleId: 'collection-review/workspace' })} />);
    let graph = lastGraph();
    expect(graph.edges.length).toBeGreaterThan(0);
    const inView = new Set([...graph.modules, ...(graph.outOfViewModules ?? [])].map((module) => module.id));
    const visible = new Set(graph.modules.map((module) => module.id));
    // Exactly the behavioral imported-module links touching this scope, with independently counted units.
    expect(graph.edges.map((edge) => edge.id).sort()).toEqual(behavioralIds.filter((id) => {
      const edge = expected.get(id)!;
      return (visible.has(edge.consumer) || visible.has(edge.provider)) && inView.has(edge.consumer) && inView.has(edge.provider);
    }).sort());
    for (const edge of graph.edges) {
      expect(edge.projection).toBe('imported-module');
      expect([edge.consumer, edge.provider, edge.behavioral, edge.displayed])
        .toEqual([expected.get(edge.id)!.consumer, expected.get(edge.id)!.provider,
          expected.get(edge.id)!.behavioral, expected.get(edge.id)!.behavioral]);
    }
    const drawn = new Set(graph.edges.map((edge) => edge.id));
    expect(project.edges.length).toBeGreaterThan(0);
    expect(project.edges.some((edge) => drawn.has(edge.id))).toBe(false);
    expect(nonBehavioralOnly.some((id) => drawn.has(id))).toBe(false);
    // Over the full collection the default is exactly the behavioral imported-module links.
    expect(activeDependencyEdges(dependencies, defaultDependencySettings).map((edge) => edge.id)).toEqual(behavioralIds);

    // Pending: the module nodes stay, no link is drawn, and no occurrence edge replaces them.
    for (const phase of ['waiting', 'analyzing'] as const) {
      rerender(<ProjectExplorerView {...diagramProps(project, { data: null, phase, reason: null, isStale: false },
        { scopeModuleId: 'collection-review/workspace' })} />);
      graph = lastGraph();
      expect(graph.modules.map((module) => module.id)).toEqual(project.modules
        .filter((module) => module.parent === 'collection-review/workspace').map((module) => module.id));
      expect(graph.edges).toEqual([]);
      expect(graph.outOfViewModules).toEqual([]);
      expect(screen.getAllByText(/Computing behavioral dependencies/).length).toBeGreaterThan(0);
    }
  });

  it('BD31 applies both controls locally from one loaded result without requesting data', () => {
    const { project, dependencies } = collectionReview();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('fetch requested data'); });
    const onSettings = vi.fn();
    const props = diagramProps(project, readyDependencies(dependencies), { onDependencySettingsChange: onSettings });
    render(<ProjectExplorerView {...props} />);
    const project0 = expectedProject(dependencies);
    expect(cards(projectRegion())).toEqual({ behavioral: String(project0.behavioral),
      nonBehavioral: String(project0.nonBehavioral), note: 'not drawn' });
    const allImported = expectedImportedEdges(dependencies);
    const displayed = () => new Map(activeDependencyEdges(dependencies, {
      showNonBehavioral: nonBehavioralToggle().matches(':checked'),
      linkTarget: linkTarget('Imported modules').getAttribute('aria-checked') === 'true' ? 'imported-module' : 'original-owner',
    }).map((edge) => [edge.id, edge]));

    fireEvent.click(nonBehavioralToggle());
    expect(onSettings).toHaveBeenLastCalledWith({ showNonBehavioral: true, linkTarget: 'imported-module' });
    expect(nonBehavioralToggle()).toBeChecked();
    expect(cards(projectRegion()).note).toBe('shown');
    // Headline counts do not change with the setting.
    expect(cards(projectRegion()).behavioral).toBe(String(project0.behavioral));
    for (const edge of lastGraph().edges) {
      const value = allImported.get(edge.id)!;
      expect(edge.displayed).toBe(value.behavioral + value.nonBehavioral);
    }
    expect(lastGraph().edges.some((edge) => edge.behavioral === 0)).toBe(true);
    expect(displayed().size).toBe(allImported.size);

    fireEvent.click(linkTarget('Original owners'));
    expect(onSettings).toHaveBeenLastCalledWith({ showNonBehavioral: true, linkTarget: 'original-owner' });
    const owners = expectedOwnerEdges(dependencies);
    expect(lastGraph().edges.length).toBeGreaterThan(0);
    for (const edge of lastGraph().edges) {
      expect(edge.projection).toBe('original-owner');
      const value = owners.get(edge.id)!;
      expect([edge.consumer, edge.provider, edge.behavioral, edge.nonBehavioral])
        .toEqual([value.consumer, value.provider, value.behavioral, value.nonBehavioral]);
    }
    // Original-owner units sum to the headline counts.
    expect([...owners.values()].reduce((sum, value) => sum + value.behavioral, 0)).toBe(project0.behavioral);
    expect([...owners.values()].reduce((sum, value) => sum + value.nonBehavioral, 0)).toBe(project0.nonBehavioral);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    // Controlled settings report the change and render only what the owner supplies.
    cleanup();
    const controlled = vi.fn();
    render(<ProjectExplorerView {...diagramProps(project, readyDependencies(dependencies), {
      dependencySettings: defaultDependencySettings, onDependencySettingsChange: controlled })} />);
    fireEvent.click(nonBehavioralToggle());
    expect(controlled).toHaveBeenCalledWith({ showNonBehavioral: true, linkTarget: 'imported-module' });
    expect(nonBehavioralToggle()).not.toBeChecked();
  });

  it('BD32 links a forwarded original to its imported module by default and its owner alternatively', () => {
    const { forwarding, bothBoundaries } = mappedDependencyModels();
    const ids = (model: DependencyGraphModel, settings: DependencySettings) => {
      const rendered = render(<ProjectExplorerView {...diagramProps(forwardingProject(), readyDependencies(model),
        { dependencySettings: settings })} />);
      const result = lastGraph().edges.map((edge) => `${edge.consumer}>${edge.provider}:${edge.behavioral}/${edge.nonBehavioral}`);
      const outOfView = lastGraph().outOfViewModules?.map((module) => module.id) ?? [];
      rendered.unmount();
      return { result, outOfView };
    };
    const imported = { showNonBehavioral: false, linkTarget: 'imported-module' } as const;
    const owner = { showNonBehavioral: false, linkTarget: 'original-owner' } as const;
    // The forwarded `run`, owned by b/core, is imported through b: A -> B by default, A -> B/A as owner.
    expect(ids(forwarding, imported).result).toEqual(['app/a>app/b:1/0', 'app/b>app/c:1/0']);
    const forwardedOwner = ids(forwarding, owner);
    expect(forwardedOwner.result).toEqual(['app/a>app/b/core:1/0', 'app/b>app/c:1/0']);
    expect(forwardedOwner.outOfView).toEqual(['app/b/core']);

    // One original through b and c: two default links, one original-owner dependency.
    expect(ids(bothBoundaries, imported).result).toEqual(['app/a>app/b:1/1', 'app/a>app/c:1/0']);
    expect(ids(bothBoundaries, owner).result).toEqual(['app/a>app/b/core:1/0']);
    expect(expectedProject(bothBoundaries)).toEqual({ behavioral: 1, nonBehavioral: 1 });
    render(<ProjectExplorerView {...diagramProps(forwardingProject(), readyDependencies(bothBoundaries),
      { dependencySettings: owner })} />);
    expect(cards(projectRegion())).toMatchObject({ behavioral: '1', nonBehavioral: '1' });
  });

  it('BD34 summarizes the project with both headline cards, displayed links, coverage and revision only', () => {
    const { forwarding, zero } = mappedDependencyModels();
    const project = forwardingProject();
    const { rerender } = render(<ProjectExplorerView {...diagramProps(project, readyDependencies(forwarding))} />);
    const expected = expectedProject(forwarding);
    const region = projectRegion();
    expect(cards(region)).toEqual({ behavioral: String(expected.behavioral), nonBehavioral: String(expected.nonBehavioral),
      note: 'not drawn' });
    expect(within(region).getByText('Behavioral dependencies')).toBeInTheDocument();
    expect(within(region).getByText('Non-behavioral dependencies')).toBeInTheDocument();
    const metricValue = (label: string) => within(projectRegion()).getByText(label).closest('.module-arch__metric')!
      .querySelector('.module-arch__metric-value')!.textContent;
    expect(metricValue('Displayed module links')).toBe(String(lastGraph().edges.length));
    expect(metricValue('Coverage')).toBe(`Partial: ${forwarding.coverage.unknownDependencies} omitted`);
    expect(within(region).getByText(/Some dependencies were omitted: 1 unknown dependency/)).toBeInTheDocument();
    expect(metricValue('Revision')).toBe(project.revision);
    expect(metricValue('Input')).toBe(forwarding.inputId);
    expect(screen.getByText(/One headline dependency per consumer module and referenced original symbol/)).toBeInTheDocument();
    const sidebar = document.querySelector('.module-arch__sidebar') as HTMLElement;
    expect(sidebar.textContent).not.toMatch(/ratio|%|confidence|pie/i);
    expect(sidebar.querySelector('svg, canvas')).toBeNull();

    fireEvent.click(nonBehavioralToggle());
    expect(cards(projectRegion()).note).toBe('shown');
    expect(metricValue('Displayed module links')).toBe(String(lastGraph().edges.length));

    rerender(<ProjectExplorerView {...diagramProps(project, readyDependencies(zero))} />);
    expect(cards(projectRegion())).toMatchObject({ behavioral: '0', nonBehavioral: '0' });
    expect(metricValue('Coverage')).toBe('Complete');
    expect(metricValue('Displayed module links')).toBe('0');
  });

  it('BD35 separates Uses, Used through this module and Owned originals used by others, active role first', () => {
    const { forwarding } = mappedDependencyModels();
    const project = forwardingProject();
    const expected = expectedModule(forwarding, 'app/b');
    render(<ProjectExplorerView {...diagramProps(project, readyDependencies(forwarding), { selectedModuleId: 'app/b' })} />);
    const regions = () => [...document.querySelectorAll('.module-arch__sidebar section[aria-label]')]
      .map((section) => [section.getAttribute('aria-label'), section.closest('details') ? 'disclosure' : 'primary']);
    expect(regions()).toEqual([['Uses', 'primary'], ['Used through this module', 'primary'],
      ['Owned originals used by others', 'disclosure']]);
    const values = (name: string) => {
      const { behavioral, nonBehavioral } = cards(screen.getByRole('region', { name, hidden: true }));
      return { behavioral: Number(behavioral), nonBehavioral: Number(nonBehavioral) };
    };
    expect(values('Uses')).toEqual(expected.uses);
    expect(values('Used through this module')).toEqual(expected.usedThrough);
    expect(values('Owned originals used by others')).toEqual(expected.ownedUsedByOthers);
    // Distinct units: b forwards nothing of its own to a but is the boundary of a's use.
    expect(expected.usedThrough).toEqual({ behavioral: 1, nonBehavioral: 1 });
    expect(expected.ownedUsedByOthers).toEqual({ behavioral: 0, nonBehavioral: 1 });
    expect(within(screen.getByRole('region', { name: 'Used through this module' }))
      .getByText('Behavioral used originals via this module')).toBeInTheDocument();
    const linksDisplayed = () => screen.getByText('Links displayed').closest('.module-arch__metric')!.textContent;
    expect(linksDisplayed()).toBe(`${activeDependencyEdges(forwarding, defaultDependencySettings)
      .filter((edge) => edge.consumer === 'app/b' || edge.provider === 'app/b').length}Links displayed`);

    fireEvent.click(linkTarget('Original owners'));
    expect(regions()).toEqual([['Uses', 'primary'], ['Owned originals used by others', 'primary'],
      ['Used through this module', 'disclosure']]);
    expect(values('Uses')).toEqual(expected.uses);
    expect(values('Owned originals used by others')).toEqual(expected.ownedUsedByOthers);
    fireEvent.click(nonBehavioralToggle());
    expect(values('Uses')).toEqual(expected.uses);
    expect(linksDisplayed()).toBe(`${activeDependencyEdges(forwarding, { showNonBehavioral: true, linkTarget: 'original-owner' })
      .filter((edge) => edge.consumer === 'app/b' || edge.provider === 'app/b').length}Links displayed`);
  });

  it('BD36 labels each link panel in its projection unit and lists only referenced classified originals', () => {
    const { forwarding } = mappedDependencyModels();
    const project = forwardingProject();
    const importedSettings = { showNonBehavioral: true, linkTarget: 'imported-module' } as const;
    const importedLink = activeDependencyEdges(forwarding, importedSettings)
      .find((edge) => edge.consumer === 'app/a' && edge.provider === 'app/c')!;
    const expectedImported = expectedImportedEdges(forwarding).get(importedLink.id)!;
    const rendered = render(<ProjectExplorerView {...diagramProps(project, readyDependencies(forwarding), {
      dependencySettings: importedSettings, selectedEdge: { kind: 'edge', id: importedLink.id, edge: importedLink } })} />);
    expect(screen.getByRole('heading', { name: 'Imported-module link' })).toBeInTheDocument();
    const usage = screen.getByRole('region', { name: 'Used originals via this boundary' });
    expect(within(usage).getByText('Behavioral used originals via this boundary')).toBeInTheDocument();
    expect(within(usage).getByText('Non-behavioral used originals via this boundary')).toBeInTheDocument();
    expect(cards(usage)).toEqual({ behavioral: String(expectedImported.behavioral),
      nonBehavioral: String(expectedImported.nonBehavioral), note: 'shown' });
    expect(within(usage).getByText('Total classified originals via this boundary').closest('.module-arch__metric'))
      .toHaveTextContent(String(expectedImported.behavioral + expectedImported.nonBehavioral));
    const owners = screen.getByRole('region', { name: 'Original owners' });
    expect([...owners.querySelectorAll('[data-module]')].map((row) => [row.getAttribute('data-module'), row.textContent]))
      .toEqual([['app/b/core', 'core0 behavioral2 non-behavioral']]);
    expect(screen.getByText('Imported module files')).toBeInTheDocument();
    expect(screen.queryByText('Original declaration files')).not.toBeInTheDocument();
    const evidence = [...document.querySelectorAll('.module-arch__evidence-item')];
    // `run` (denied) and the known path of `x`; the unknown path of `x` and unused imports are absent.
    expect(evidence.map((item) => item.querySelector('.module-arch__evidence-original')!.textContent)).toEqual(['run', 'x']);
    expect(document.querySelector('.module-arch__sidebar')!.textContent).not.toContain('unknown');
    expect(screen.getAllByText(/Supporting occurrences: 1/)).toHaveLength(2);
    rendered.unmount();

    const ownerSettings = { showNonBehavioral: false, linkTarget: 'original-owner' } as const;
    const ownerLink = activeDependencyEdges(forwarding, ownerSettings)
      .find((edge) => edge.consumer === 'app/a' && edge.provider === 'app/b/core')!;
    const expectedOwner = expectedOwnerEdges(forwarding).get(ownerLink.id)!;
    render(<ProjectExplorerView {...diagramProps(project, readyDependencies(forwarding), {
      dependencySettings: ownerSettings, selectedEdge: { kind: 'edge', id: ownerLink.id, edge: ownerLink } })} />);
    expect(screen.getByRole('heading', { name: 'Original-owner link' })).toBeInTheDocument();
    const dependencies = screen.getByRole('region', { name: 'Dependencies' });
    expect(within(dependencies).getByText('Behavioral dependencies')).toBeInTheDocument();
    expect(cards(dependencies)).toEqual({ behavioral: String(expectedOwner.behavioral),
      nonBehavioral: String(expectedOwner.nonBehavioral), note: 'not drawn' });
    expect(within(dependencies).getByText('Total classified dependencies')).toBeInTheDocument();
    expect(screen.queryByText(/via this boundary/)).not.toBeInTheDocument();
    const through = screen.getByRole('region', { name: 'Imported through' });
    expect([...through.querySelectorAll('[data-module]')].map((row) => [row.getAttribute('data-module'), row.textContent]))
      .toEqual([['app/b', 'b1 behavioral0 non-behavioral'], ['app/c', 'c0 behavioral1 non-behavioral']]);
    expect(screen.getByText('Original declaration files')).toBeInTheDocument();
    // One primary row per original; its two boundaries are listed beneath it.
    const rows = [...document.querySelectorAll('.module-arch__evidence-item')];
    expect(rows).toHaveLength(1);
    expect([...rows[0]!.querySelectorAll('.module-arch__evidence-path')].map((row) => row.textContent))
      .toEqual(['behavioralallowedexposedimported through bSupporting occurrences: 1',
        'non-behavioraldeniednot-visibleimported through cSupporting occurrences: 1']);
  });

  it('BD37 reconciles scope, filters, out-of-view modules and selection against the active links', () => {
    const { forwarding, bothBoundaries } = mappedDependencyModels();
    const project = forwardingProject();
    const outOfView = () => (lastGraph().outOfViewModules ?? []).map((module) => module.id);
    const props = diagramProps(project, readyDependencies(forwarding));
    const { rerender } = render(<ProjectExplorerView {...props} />);
    expect(outOfView()).toEqual([]);
    fireEvent.click(nonBehavioralToggle());
    expect(outOfView()).toEqual(['app/b/core']);
    fireEvent.click(nonBehavioralToggle());
    fireEvent.click(linkTarget('Original owners'));
    expect(outOfView()).toEqual(['app/b/core']);

    // A filter hiding `c` makes it out of view only while an active link reaches it.
    rerender(<ProjectExplorerView {...props} selectedPresentationClasses={['untagged']}
      dependencySettings={{ showNonBehavioral: false, linkTarget: 'imported-module' }} />);
    expect(lastGraph().modules.map((module) => module.id)).toEqual(['app/b', 'app/idle']);
    expect(outOfView()).toEqual(['app/a', 'app/c']);
    rerender(<ProjectExplorerView {...props} selectedPresentationClasses={['untagged']}
      dependencySettings={{ showNonBehavioral: false, linkTarget: 'original-owner' }} />);
    expect(outOfView().sort()).toEqual(['app/c']);
    cleanup();

    // Scope: inside b, only links touching b/core are drawn.
    render(<ProjectExplorerView {...diagramProps(project, readyDependencies(forwarding), { scopeModuleId: 'app/b',
      dependencySettings: { showNonBehavioral: true, linkTarget: 'imported-module' } })} />);
    expect(lastGraph().edges.map((edge) => `${edge.consumer}>${edge.provider}`)).toEqual(['app/b/core>app/b']);
    expect(outOfView()).toEqual(['app/b']);
    cleanup();

    // Selection: the imported a -> c link has a different ID from the original-owner a -> c link.
    const onSelectEdge = vi.fn();
    const settings = { showNonBehavioral: true, linkTarget: 'imported-module' } as const;
    const importedAC = activeDependencyEdges(bothBoundaries, settings).find((edge) => edge.provider === 'app/c')!;
    const ownerAC = activeDependencyEdges(bothBoundaries, { ...settings, linkTarget: 'original-owner' })
      .find((edge) => edge.provider === 'app/c')!;
    expect(ownerAC.consumer).toBe(importedAC.consumer);
    expect(ownerAC.id).not.toBe(importedAC.id);
    const selection = (edge: typeof importedAC): GraphSelection => ({ kind: 'edge', id: edge.id, edge });
    const view = (next: DependencySettings, selected: GraphSelection, model = bothBoundaries) =>
      <ProjectExplorerView {...diagramProps(project, readyDependencies(model), { dependencySettings: next,
        selectedEdge: selected, onSelectEdge })} />;
    const selected = render(view(settings, selection(importedAC)));
    expect(onSelectEdge).not.toHaveBeenCalled();
    selected.rerender(view({ ...settings, linkTarget: 'original-owner' }, selection(importedAC)));
    expect(onSelectEdge).toHaveBeenCalledWith(null);
    onSelectEdge.mockClear();

    // The mixed a -> b link keeps its ID when non-behavioral links are hidden.
    const mixed = activeDependencyEdges(bothBoundaries, settings).find((edge) => edge.provider === 'app/b')!;
    selected.rerender(view(settings, selection(mixed)));
    selected.rerender(view({ ...settings, showNonBehavioral: false }, selection(mixed)));
    expect(onSelectEdge).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Imported-module link' })).toBeInTheDocument();
    // A non-behavioral-only link is cleared when the setting hides it.
    const dotted = activeDependencyEdges(forwarding, settings).find((edge) => edge.pattern === 'dotted')!;
    selected.rerender(view(settings, selection(dotted), forwarding));
    expect(onSelectEdge).not.toHaveBeenCalled();
    selected.rerender(view({ ...settings, showNonBehavioral: false }, selection(dotted), forwarding));
    expect(onSelectEdge).toHaveBeenCalledWith(null);
  });

  it('BD38 gives the controls labels and keyboard behavior and distinguishes every dependency state', () => {
    const { forwarding, zero, bothBoundaries } = mappedDependencyModels();
    const project = forwardingProject();
    const { rerender } = render(<ProjectExplorerView {...diagramProps(project, readyDependencies(bothBoundaries))} />);
    expect(screen.getByRole('group', { name: 'Dependencies' })).toBeInTheDocument();
    const imported = linkTarget('Imported modules');
    const owners = linkTarget('Original owners');
    expect(imported).toHaveAttribute('aria-checked', 'true');
    expect(imported).toHaveAttribute('tabindex', '0');
    expect(owners).toHaveAttribute('tabindex', '-1');
    imported.focus();
    fireEvent.keyDown(imported, { key: 'ArrowRight' });
    expect(linkTarget('Original owners')).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(linkTarget('Original owners'));
    expect(lastGraph().edges.every((edge) => edge.projection === 'original-owner')).toBe(true);
    fireEvent.keyDown(linkTarget('Original owners'), { key: 'Home' });
    expect(linkTarget('Imported modules')).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(linkTarget('Imported modules'));
    fireEvent.keyDown(linkTarget('Imported modules'), { key: 'End' });
    expect(linkTarget('Original owners')).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(linkTarget('Original owners'), { key: 'ArrowLeft' });
    expect(linkTarget('Imported modules')).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(linkTarget('Imported modules'), { key: 'Tab' });
    expect(linkTarget('Imported modules')).toHaveAttribute('aria-checked', 'true');

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
      expect(linkTarget('Imported modules')).toHaveProperty('disabled', controlsDisabled);
    }
    expect(seen.size).toBe(states.length);
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

function linkSelection(settings: DependencySettings = defaultDependencySettings): GraphSelection {
  const edge = activeDependencyEdges(createDependencies(), settings)[0]!;
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
