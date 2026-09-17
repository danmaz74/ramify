// Adapted from cucumber-viz
// src/domains/module-architecture/ui/pages/ModuleArchitecturePageView.tsx at
// 44b7f30e0fdfda79ead8363ef4c85c100e36fda0.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExportList from './ExportList.js';
import type { ExportDetailState } from './ExportList.js';
import type {
  ExplorerCoverage,
  ExplorerEdge,
  ExplorerModule,
  ProjectExplorerModel,
} from './interfaces/project-view.js';
import type {
  DependencyGraphEvidence,
  DependencyGraphModel,
  DependencyGraphState,
  DependencyLinkTarget,
  DependencySettings,
} from './interfaces/dependency-view.js';
import {
  activeDependencyEdges,
  defaultDependencySettings,
  idleDependencyGraph,
  type ActiveDependencyEdge,
} from './dependency-graph.js';
import type { GraphSelection, ModuleGraphProps } from './moduleGraphShared.js';
import {
  getPresentationClassColor,
  getPresentationClassLabel,
} from './moduleTypePresentation.js';
import './project-view.css';

export const COMPONENT_UID = 'cmp_project_explorer_view';

export type ExplorerDiscussionSelection =
  | { readonly kind: 'module'; readonly module: ExplorerModule }
  | GraphSelection;

export interface ExplorerDiscussionProps {
  readonly contextLabel: string;
  readonly selection: ExplorerDiscussionSelection;
}

export interface ProjectExplorerViewProps {
  readonly data: ProjectExplorerModel | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly unavailableReason?: string | null;
  readonly selectedModuleId: string | null;
  readonly selectedEdge: GraphSelection | null;
  readonly expandedExportId: string | null;
  readonly exportDetail: ExportDetailState;
  readonly selectedPresentationClasses: readonly string[];
  readonly expandedDependencyId: string | null;
  readonly GraphComponent: React.ComponentType<ModuleGraphProps>;
  readonly DiscussionComponent?: React.ComponentType<ExplorerDiscussionProps>;
  readonly onSelectModule: (id: string | null) => void;
  readonly onSelectEdge: (edge: GraphSelection | null) => void;
  readonly onToggleExport: (item: ExplorerModule['exports'][number]) => void;
  readonly onTogglePresentationClass: (presentationClass: string) => void;
  readonly onRefresh: () => void;
  readonly onToggleDependency: (edgeId: string) => void;
  readonly isStale: boolean;
  readonly scopeModuleId: string | null;
  readonly breadcrumbTrail: readonly { readonly id: string | null; readonly label: string }[];
  readonly onDrillDown: (moduleId: string) => void;
  readonly onNavigateToScope: (scopeId: string | null) => void;
  /** When set, a module's details link to it in the module tree. */
  readonly onOpenModuleTree?: (moduleId: string) => void;
  /**
   * The dependency result for the displayed project model. Only its links are drawn; the
   * project model's occurrence edges remain source evidence. Defaults to not requested.
   */
  readonly dependencies?: DependencyGraphState;
  /** Controlled dependency settings; the view keeps its own when omitted. */
  readonly dependencySettings?: DependencySettings;
  /** Reports a settings change. Settings select among loaded links and never request data. */
  readonly onDependencySettingsChange?: (settings: DependencySettings) => void;
}

const linkTargetOptions: readonly { readonly value: DependencyLinkTarget; readonly label: string }[] = [
  { value: 'imported-module', label: 'Imported modules' },
  { value: 'original-owner', label: 'Original owners' },
];

/** Sections that start collapsed: raw occurrences are secondary evidence. */
const initiallyCollapsed: ReadonlySet<string> = new Set(['mod-evidence']);

export const headlineHelp = 'One headline dependency per consumer module and referenced original symbol.';

export function ProjectExplorerView({
  data,
  isLoading,
  error,
  unavailableReason = null,
  selectedModuleId,
  selectedEdge,
  expandedExportId,
  exportDetail,
  selectedPresentationClasses,
  expandedDependencyId,
  GraphComponent,
  DiscussionComponent,
  onSelectModule,
  onSelectEdge,
  onToggleExport,
  onTogglePresentationClass,
  onRefresh,
  onToggleDependency,
  isStale,
  scopeModuleId,
  breadcrumbTrail,
  onDrillDown,
  onNavigateToScope,
  onOpenModuleTree,
  dependencies = idleDependencyGraph,
  dependencySettings,
  onDependencySettingsChange,
}: ProjectExplorerViewProps): React.ReactElement {
  const [copiedImportPath, setCopiedImportPath] = useState<string | null>(null);
  const [toggledSections, setToggledSections] = useState<Set<string>>(new Set());
  const [localSettings, setLocalSettings] = useState<DependencySettings>(defaultDependencySettings);
  const settings = dependencySettings ?? localSettings;
  const linkTargetRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const isResizing = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current || !contentRef.current) return;
      const contentRect = contentRef.current.getBoundingClientRect();
      const newWidth = contentRect.right - moveEvent.clientX;
      setSidebarWidth(Math.max(240, Math.min(newWidth, contentRect.width * 0.6)));
    };
    const onMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  function isSectionExpanded(key: string): boolean {
    return initiallyCollapsed.has(key) === toggledSections.has(key);
  }

  function changeSettings(next: DependencySettings): void {
    if (dependencySettings === undefined) setLocalSettings(next);
    onDependencySettingsChange?.(next);
  }

  function toggleSection(key: string): void {
    setToggledSections((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const modules = data?.modules ?? [];
  const modulesById = useMemo(
    () => new Map(modules.map((module) => [module.id, module])),
    [modules],
  );
  const selectedClassSet = useMemo(
    () => new Set(selectedPresentationClasses),
    [selectedPresentationClasses],
  );
  const modulesInScope = useMemo(() => {
    if (!data) return [];
    if (scopeModuleId) return modules.filter((module) => module.parent === scopeModuleId);

    const topLevel = modules.filter((module) => module.parent === null);
    const root = modulesById.get(data.rootModuleId);
    if (topLevel.length === 1 && root && root.children.length > 0) {
      return root.children
        .map((childId) => modulesById.get(childId))
        .filter((module): module is ExplorerModule => module != null);
    }
    return topLevel;
  }, [data, modules, modulesById, scopeModuleId]);

  const classEntries = useMemo(() => {
    const allClasses = [...new Set(modules.map((module) => module.presentationClass))].sort();
    return allClasses.map((presentationClass) => ({
      id: presentationClass,
      label: getPresentationClassLabel(presentationClass),
      color: getPresentationClassColor(presentationClass),
      moduleCount: modulesInScope.filter(
        (module) => module.presentationClass === presentationClass,
      ).length,
    }));
  }, [modules, modulesInScope]);

  const modulesForGraph = useMemo(
    () => modulesInScope.filter((module) => selectedClassSet.has(module.presentationClass)),
    [modulesInScope, selectedClassSet],
  );
  const visibleModuleIds = useMemo(
    () => new Set(modulesForGraph.map((module) => module.id)),
    [modulesForGraph],
  );
  const dependencyData = dependencies.data;
  const { showNonBehavioral, linkTarget } = settings;
  // Keyed by setting values, so an equal recreated settings object keeps the same links.
  const activeEdges = useMemo(
    () => dependencyData ? activeDependencyEdges(dependencyData, { showNonBehavioral, linkTarget }) : [],
    [dependencyData, showNonBehavioral, linkTarget],
  );
  const dependencyRows = useMemo(
    () => new Map((dependencyData?.modules ?? []).map((row) => [row.id, row])),
    [dependencyData],
  );
  const outOfViewModules = useMemo(() => {
    if (modulesForGraph.length === 0) return [];
    const related = new Set<string>();
    for (const edge of activeEdges) {
      if (visibleModuleIds.has(edge.consumer) && !visibleModuleIds.has(edge.provider)) {
        related.add(edge.provider);
      }
      if (visibleModuleIds.has(edge.provider) && !visibleModuleIds.has(edge.consumer)) {
        related.add(edge.consumer);
      }
    }
    return [...related]
      .map((id) => modulesById.get(id))
      .filter((module): module is ExplorerModule => module != null);
  }, [activeEdges, modulesById, modulesForGraph.length, visibleModuleIds]);
  const outOfViewLevelById = useMemo(() => {
    const result: Record<string, number> = {};
    const visibleDepth = modulesForGraph.length > 0
      ? Math.min(...modulesForGraph.map((module) => moduleDepth(module.id, modulesById)))
      : 0;
    for (const module of outOfViewModules) {
      result[module.id] = Math.max(1, visibleDepth - moduleDepth(module.id, modulesById));
    }
    return result;
  }, [modulesById, modulesForGraph, outOfViewModules]);
  const allVisibleModuleIds = useMemo(
    () => new Set([...visibleModuleIds, ...outOfViewModules.map((module) => module.id)]),
    [outOfViewModules, visibleModuleIds],
  );

  useEffect(() => {
    if (selectedModuleId && !visibleModuleIds.has(selectedModuleId)) onSelectModule(null);
  }, [onSelectModule, selectedModuleId, visibleModuleIds]);

  /** Links drawn in this scope: active links touching a visible module. */
  const graphEdges = useMemo(() => activeEdges.filter((edge) =>
    (visibleModuleIds.has(edge.consumer) || visibleModuleIds.has(edge.provider))
      && allVisibleModuleIds.has(edge.consumer) && allVisibleModuleIds.has(edge.provider)),
  [activeEdges, allVisibleModuleIds, visibleModuleIds]);
  const graphEdgesById = useMemo(
    () => new Map(graphEdges.map((edge) => [edge.id, edge])),
    [graphEdges],
  );

  // A selection survives a settings, scope or data change only as the same projection-specific ID.
  useEffect(() => {
    if (selectedEdge && !graphEdgesById.has(selectedEdge.id)) onSelectEdge(null);
  }, [graphEdgesById, onSelectEdge, selectedEdge]);

  if (isLoading) return renderLoading();
  if (error) return renderFailure('Project analysis failed', error.message, 'Retry');
  if (unavailableReason) {
    return renderFailure('Project view unavailable', unavailableReason, 'Retry');
  }
  if (!data || modules.length === 0) return renderEmpty();
  const model = data;

  const selectedModule = selectedModuleId
    ? modulesForGraph.find((module) => module.id === selectedModuleId) ?? null
    : null;
  const selectedLink = selectedEdge ? graphEdgesById.get(selectedEdge.id) ?? null : null;
  const displayedLinks = graphEdges.length;
  const linkSummary = dependencyData ? `, ${displayedLinks} displayed ${displayedLinks === 1 ? 'link' : 'links'}` : '';
  const scopeName = scopeModuleId ? modulesById.get(scopeModuleId)?.name : null;
  const notice = dependencyNotice(dependencies);

  return (
    <div className="project-explorer-page">
      <div className="module-arch">
        <div className="module-arch__header">
          <div>
            <h2 className="module-arch__title">Project Explorer</h2>
            <p className="module-arch__subtitle">
              {scopeName
                ? `${scopeName} \u203A Showing ${modulesForGraph.length} sub-modules${linkSummary}`
                : `Showing ${modulesForGraph.length} of ${modules.length} modules${linkSummary}`}
            </p>
            <p className="module-arch__revision">Revision {String(data.revision)}</p>
            <p className={`module-arch__dependency-status module-arch__dependency-status--${notice.state}`}
              data-dependency-state={notice.state} aria-live="polite">
              {notice.text}
            </p>
          </div>
          <div className="module-arch__header-actions">
            {data.state === 'partial' && (
              <span className="module-arch__health-badge module-arch__health-badge--warning">
                Partial coverage ({data.coverage.length} notes)
              </span>
            )}
            <button
              type="button"
              className={`module-arch__refresh-btn${isStale ? ' module-arch__refresh-btn--stale' : ''}`}
              onClick={onRefresh}
              disabled={!isStale}
            >
              {isStale ? 'Refresh (stale)' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="module-arch__controls">
        <div className="module-arch__filters" role="group" aria-label="Presentation class filters">
          <div className="module-arch__filters-title">Declared tag classes</div>
          <div className="module-arch__filters-list">
            {classEntries.map((entry) => {
              const unavailable = entry.moduleCount === 0;
              return (
                <label
                  className={`module-arch__filter-item${unavailable ? ' module-arch__filter-item--disabled' : ''}`}
                  key={entry.id}
                >
                  <input
                    type="checkbox"
                    checked={!unavailable && selectedClassSet.has(entry.id)}
                    disabled={unavailable}
                    onChange={() => onTogglePresentationClass(entry.id)}
                  />
                  <span className="module-arch__filter-swatch" style={{ background: entry.color }} />
                  <span className="module-arch__filter-label">{entry.label}</span>
                  <span className="module-arch__filter-count">{entry.moduleCount}</span>
                </label>
              );
            })}
          </div>
          {classEntries.some((entry) => entry.moduleCount === 0) && (
            <p className="module-arch__filters-hint">
              Tag classes with zero modules are disabled in this scope.
            </p>
          )}
        </div>
        {renderDependencyControls()}
        </div>

        {breadcrumbTrail.length > 0 && (
          <nav className="module-arch__breadcrumb" aria-label="Module navigation">
            {breadcrumbTrail.map((crumb, index) => {
              const last = index === breadcrumbTrail.length - 1;
              return (
                <React.Fragment key={`${crumb.id ?? 'overview'}:${index}`}>
                  {index > 0 && <span className="module-arch__breadcrumb-sep">/</span>}
                  {last ? (
                    <span className="module-arch__breadcrumb-current">{crumb.label}</span>
                  ) : (
                    <button
                      type="button"
                      className="module-arch__breadcrumb-link"
                      onClick={() => onNavigateToScope(crumb.id)}
                    >
                      {crumb.label}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        )}

        <div className="module-arch__content" ref={contentRef}>
          <div className="module-arch__main">
            <GraphComponent
              modules={modulesForGraph}
              edges={graphEdges}
              outOfViewModules={outOfViewModules}
              outOfViewLevelById={outOfViewLevelById}
              selectedModuleId={selectedModuleId}
              selectedEdgeId={selectedEdge?.id ?? null}
              onSelectModule={onSelectModule}
              onSelectEdge={onSelectEdge}
              onDrillDown={onDrillDown}
            />
          </div>

          <div
            className="module-arch__resize-handle"
            onMouseDown={handleResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />

          <div className="module-arch__sidebar" style={{ width: sidebarWidth }}>
            {selectedLink
              ? renderLinkDetail(selectedLink)
              : selectedModule
                ? renderModuleDetail(selectedModule)
                : renderProjectDetail()}
          </div>
        </div>
      </div>
    </div>
  );

  function renderLoading(): React.ReactElement {
    return (
      <div className="project-explorer-page"><div className="module-arch">
        <div className="module-arch__header"><div>
          <h2 className="module-arch__title">Project Explorer</h2>
          <p className="module-arch__subtitle">Loading the published project report...</p>
        </div></div>
        <div className="module-arch__loading"><div className="spinner" /><p>Loading project view...</p></div>
      </div></div>
    );
  }

  function renderFailure(title: string, detail: string, action: string): React.ReactElement {
    return (
      <div className="project-explorer-page"><div className="module-arch">
        <div className="module-arch__header"><div>
          <h2 className="module-arch__title">Project Explorer</h2>
          <p className="module-arch__subtitle">{title}</p>
        </div></div>
        <div className="module-arch__error">
          <div className="module-arch__error-icon">!</div>
          <h3>{title}</h3>
          <p className="module-arch__error-detail">{detail || 'An unknown error occurred'}</p>
          <button type="button" className="module-arch__refresh-btn" onClick={onRefresh}>{action}</button>
        </div>
      </div></div>
    );
  }

  function renderEmpty(): React.ReactElement {
    return (
      <div className="project-explorer-page"><div className="module-arch">
        <div className="module-arch__header">
          <div><h2 className="module-arch__title">Project Explorer</h2>
            <p className="module-arch__subtitle">No declared modules are available</p></div>
          <button type="button" className="module-arch__refresh-btn" onClick={onRefresh}>Refresh</button>
        </div>
        <div className="module-arch__empty"><h3>No modules found</h3>
          <p>The published report contains no declared Ramify modules.</p></div>
      </div></div>
    );
  }

  function renderDependencyControls(): React.ReactElement {
    const unavailable = dependencyData === null;
    const selectedIndex = linkTargetOptions.findIndex((option) => option.value === settings.linkTarget);
    const choose = (index: number) => {
      const option = linkTargetOptions[(index + linkTargetOptions.length) % linkTargetOptions.length]!;
      if (option.value !== settings.linkTarget) changeSettings({ ...settings, linkTarget: option.value });
      linkTargetRefs.current[linkTargetOptions.indexOf(option)]?.focus();
    };
    return (
      <div className="module-arch__filters module-arch__dependency-controls" role="group" aria-label="Dependencies">
        <div className="module-arch__filters-title">Dependencies</div>
        <div className="module-arch__filters-list">
          <label className={`module-arch__filter-item${unavailable ? ' module-arch__filter-item--disabled' : ''}`}>
            <input
              type="checkbox"
              checked={settings.showNonBehavioral}
              disabled={unavailable}
              onChange={(event) => changeSettings({ ...settings, showNonBehavioral: event.target.checked })}
            />
            <span className="module-arch__filter-label">Show non-behavioral dependencies</span>
          </label>
          <div className="module-arch__segmented">
            <span className="module-arch__segmented-label" id="module-arch-link-targets">Link targets</span>
            <div role="radiogroup" aria-labelledby="module-arch-link-targets" className="module-arch__segmented-options">
              {linkTargetOptions.map((option, index) => {
                const checked = option.value === settings.linkTarget;
                return (
                  <button
                    key={option.value}
                    ref={(element) => { linkTargetRefs.current[index] = element; }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={checked ? 0 : -1}
                    disabled={unavailable}
                    className={`module-arch__segmented-option${checked ? ' module-arch__segmented-option--checked' : ''}`}
                    onClick={() => choose(index)}
                    onKeyDown={(event) => {
                      const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? selectedIndex + 1
                        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? selectedIndex - 1
                          : event.key === 'Home' ? 0
                            : event.key === 'End' ? linkTargetOptions.length - 1 : null;
                      if (next === null) return;
                      event.preventDefault();
                      choose(next);
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderProjectDetail(): React.ReactNode {
    return (
      <div className="module-arch__detail">
        <div className="module-arch__detail-header">
          <h3 className="module-arch__detail-name">Project dependencies</h3>
          <p className="module-arch__detail-description">{headlineHelp}</p>
        </div>
        <section className="module-arch__role" aria-label="Project dependencies">
          {dependencyData
            ? headlineCards(dependencyData.project.behavioral, dependencyData.project.nonBehavioral,
              'Behavioral dependencies', 'Non-behavioral dependencies')
            : dependencyPlaceholder()}
          <div className="module-arch__detail-metrics">
            {dependencyData && metric(displayedLinks, 'Displayed module links')}
            {dependencyData && metric(coverageText(dependencyData), 'Coverage')}
            {metric(<code>{String(model.revision)}</code>, 'Revision')}
            {dependencyData && metric(<code>{dependencyData.inputId}</code>, 'Input')}
          </div>
          {dependencyData?.state === 'partial' && (
            <p className="module-arch__coverage-warning">
              Some dependencies were omitted: {dependencyData.coverage.unknownDependencies} unknown
              {' '}{dependencyData.coverage.unknownDependencies === 1 ? 'dependency' : 'dependencies'}
              {' '}({dependencyData.coverage.limitIds.length} coverage {dependencyData.coverage.limitIds.length === 1 ? 'limit' : 'limits'}).
            </p>
          )}
        </section>
        <p className="module-arch__sidebar-hint">Select a module or link to inspect details</p>
      </div>
    );
  }

  function renderModuleDetail(module: ExplorerModule): React.ReactNode {
    const dependencies = model.edges.filter((edge) => edge.consumer === module.id);
    const dependents = model.edges.filter((edge) => edge.provider === module.id);
    const coverage = model.coverage.filter((item) => item.moduleIds.includes(module.id));
    const row = dependencyRows.get(module.id) ?? null;
    const linksDisplayed = activeEdges.filter((edge) => edge.consumer === module.id || edge.provider === module.id).length;
    const imported = settings.linkTarget === 'imported-module';
    const usedThrough = row && (
      <section className="module-arch__role" aria-label="Used through this module" key="used-through">
        {imported && <h4 className="module-arch__role-title">Used through this module</h4>}
        {headlineCards(row.usedThrough.behavioralUsedOriginals, row.usedThrough.nonBehavioralUsedOriginals,
          'Behavioral used originals via this module', 'Non-behavioral used originals via this module')}
      </section>
    );
    const owned = row && (
      <section className="module-arch__role" aria-label="Owned originals used by others" key="owned">
        {!imported && <h4 className="module-arch__role-title">Owned originals used by others</h4>}
        {headlineCards(row.ownedUsedByOthers.behavioral, row.ownedUsedByOthers.nonBehavioral,
          'Behavioral dependencies', 'Non-behavioral dependencies')}
      </section>
    );
    // The alternate role is titled by its disclosure summary.
    const [activeRole, alternateRole, alternateLabel] = imported
      ? [usedThrough, owned, 'Owned originals used by others']
      : [owned, usedThrough, 'Used through this module'];
    return (
      <div className="module-arch__detail">
        <div className="module-arch__detail-header">
          <h3 className="module-arch__detail-name">{module.name}</h3>
          <span className="module-arch__detail-path">{module.directory}</span>
          <span className="module-arch__dependency-badge module-arch__dependency-badge--class">
            {getPresentationClassLabel(module.presentationClass)}
          </span>
          <p className="module-arch__detail-description">
            {module.purpose.state === 'present'
              ? module.purpose.paragraph
              : `Purpose unavailable: ${module.purpose.state}`}
          </p>
          {onOpenModuleTree && (
            <button type="button" className="module-arch__submodule-enter" onClick={() => onOpenModuleTree(module.id)}>
              Show in module tree
            </button>
          )}
        </div>

        {row ? (
          <>
            <section className="module-arch__role" aria-label="Uses">
              <h4 className="module-arch__role-title">Uses</h4>
              {headlineCards(row.uses.behavioral, row.uses.nonBehavioral,
                'Behavioral dependencies', 'Non-behavioral dependencies')}
            </section>
            {activeRole}
            <details className="module-arch__alternate-role">
              <summary>{alternateLabel}</summary>
              {alternateRole}
            </details>
          </>
        ) : (
          <section className="module-arch__role" aria-label="Uses">
            <h4 className="module-arch__role-title">Uses</h4>
            {dependencyData
              ? <p className="module-arch__no-exports">No dependency row for this module</p>
              : dependencyPlaceholder()}
          </section>
        )}

        <div className="module-arch__role">
          <div className="module-arch__detail-metrics">
            {dependencyData && metric(linksDisplayed, 'Links displayed')}
            {metric(module.metrics.ownedFiles, 'Owned files')}
            {metric(module.metrics.subtreeFiles, 'Subtree files')}
            {dependencyData && metric(coverageText(dependencyData), 'Dependency coverage')}
          </div>
        </div>

        {module.children.length > 0 && collapsible('mod-submodules', 'Sub-Modules', (
          <div className="module-arch__submodule-list">
            {module.children.map((childId) => {
              const child = modulesById.get(childId);
              if (!child) return null;
              return (
                <button key={childId} type="button" className="module-arch__submodule-item"
                  onClick={() => onDrillDown(childId)}>
                  <span className="module-arch__submodule-name">{child.name}</span>
                  <span className="module-arch__submodule-files">{child.metrics.ownedFiles} owned files</span>
                </button>
              );
            })}
            <button type="button" className="module-arch__submodule-enter"
              onClick={() => onDrillDown(module.id)}>View sub-module graph</button>
          </div>
        ), module.children.length)}

        {collapsible('mod-exports', 'Export inventory', (
          module.exports.length > 0 ? (
            <ExportList exports={module.exports} expandedExportId={expandedExportId}
              detail={exportDetail} onToggleExport={onToggleExport} />
          ) : <p className="module-arch__no-exports">No exports found</p>
        ), module.exports.length || undefined)}

        {coverage.length > 0 && collapsible('mod-coverage', 'Coverage limits',
          renderCoverage(coverage), coverage.length)}

        {collapsible('mod-evidence', 'Source evidence: import occurrences', (
          <>
            <p className="module-arch__no-exports">
              Import occurrences are supporting evidence, not dependencies.
            </p>
            <div className="module-arch__detail-metrics">
              {metric(module.metrics.accessOccurrences, 'Import occurrences')}
              {metric(module.metrics.deniedAccesses, 'Denied occurrences')}
              {metric(module.metrics.limitedAccesses, 'Limited occurrences')}
            </div>
            {dependencies.length > 0 && (
              <>
                <h5 className="module-arch__evidence-title">Occurrences this module imports</h5>
                {renderEdgeList(dependencies, 'provider')}
              </>
            )}
            {dependents.length > 0 && (
              <>
                <h5 className="module-arch__evidence-title">Occurrences importing this module</h5>
                {renderEdgeList(dependents, 'consumer')}
              </>
            )}
          </>
        ))}
        {renderDiscussion({ kind: 'module', module }, module.name, 'mod-discussion')}
      </div>
    );
  }

  function renderLinkDetail(link: ActiveDependencyEdge): React.ReactNode {
    const consumer = modulesById.get(link.consumer)?.name ?? link.consumer;
    const provider = modulesById.get(link.provider)?.name ?? link.provider;
    const edge = link.source;
    const imported = edge.projection === 'imported-module';
    const reasons = [...new Set(edge.evidence.map((item) => item.reasons).flat())].sort();
    const coverageIds = [...new Set(edge.evidence.flatMap((item) => item.coverageIds))].sort();
    const linkCoverage = model.coverage.filter((item) => coverageIds.includes(item.limit.id));
    const files = (select: (item: DependencyGraphEvidence) => readonly string[]) =>
      [...new Set(edge.evidence.flatMap(select))].sort();
    const unit = imported ? 'used originals via this boundary' : 'dependencies';
    return (
      <div className="module-arch__detail">
        <div className="module-arch__detail-header">
          <h3 className="module-arch__detail-name">{imported ? 'Imported-module link' : 'Original-owner link'}</h3>
          <span className="module-arch__detail-path">{consumer} {' -> '} {provider}</span>
          {statusBadge(link.status)}
          {reasonBadges(reasons)}
        </div>
        <section className="module-arch__role" aria-label={imported ? 'Used originals via this boundary' : 'Dependencies'}>
          <h4 className="module-arch__role-title">
            {imported ? `${consumer} uses through ${provider}` : `${consumer} depends on originals owned by ${provider}`}
          </h4>
          {headlineCards(link.behavioral, link.nonBehavioral, `Behavioral ${unit}`, `Non-behavioral ${unit}`)}
          <div className="module-arch__detail-metrics">
            {metric(link.behavioral + link.nonBehavioral, `Total classified ${imported ? 'originals via this boundary' : 'dependencies'}`)}
          </div>
        </section>
        <section className="module-arch__role" aria-label={imported ? 'Original owners' : 'Imported through'}>
          <h4 className="module-arch__role-title">{imported ? 'Original owners' : 'Imported through'}</h4>
          <ul className="module-arch__breakdown">
            {edge.projection === 'imported-module'
              ? edge.originalOwners.map((item) => breakdownRow(item.owner,
                item.counts.behavioralUsedOriginals, item.counts.nonBehavioralUsedOriginals))
              : edge.importedThrough.map((item) => breakdownRow(item.module,
                item.counts.behavioralUsedOriginals, item.counts.nonBehavioralUsedOriginals))}
          </ul>
        </section>
        {collapsible('edge-files', 'Supporting files', (
          <dl className="module-arch__file-groups">
            {fileGroup('Consumer files', files((item) => item.consumerFiles))}
            {imported
              ? fileGroup('Imported module files', files((item) => item.importedFiles))
              : fileGroup('Original declaration files', files((item) => item.originalFiles))}
            <dt>Coverage</dt>
            <dd>
              <span>{coverageIds.length === 0 ? 'No coverage limits on this link' : coverageIds.join(', ')}</span>
              {linkCoverage.length > 0 && renderCoverage(linkCoverage)}
            </dd>
          </dl>
        ))}
        {collapsible('edge-originals', 'Referenced originals', renderEvidence(edge.evidence, imported),
          new Set(edge.evidence.map((item) => originalKey(item))).size)}
        {renderDiscussion({ kind: 'edge', id: link.id, edge: link }, `${consumer} -> ${provider}`, 'edge-discussion')}
      </div>
    );
  }

  function renderEvidence(evidence: readonly DependencyGraphEvidence[], imported: boolean): React.ReactNode {
    const groups = new Map<string, DependencyGraphEvidence[]>();
    for (const item of evidence) {
      const key = originalKey(item);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return (
      <ul className="module-arch__evidence-list">
        {[...groups.entries()].map(([key, items]) => {
          const first = items[0]!;
          return (
            <li key={key} className="module-arch__evidence-item" data-original={key}>
              <span className="module-arch__evidence-original">{first.original.binding}</span>
              <span className="module-arch__detail-path">
                {first.original.file} ({modulesById.get(first.originalOwner)?.name ?? first.originalOwner})
              </span>
              {items.map((item) => (
                <div key={item.importedModule} className="module-arch__evidence-path">
                  <span className="module-arch__dependency-badge">{item.classification}</span>
                  {statusBadge(item.status)}
                  {reasonBadges(item.reasons)}
                  {!imported && (
                    <span className="module-arch__detail-path">
                      imported through {modulesById.get(item.importedModule)?.name ?? item.importedModule}
                    </span>
                  )}
                  <span className="module-arch__evidence-occurrences">
                    Supporting occurrences: {item.accessIds.length}
                  </span>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    );
  }

  function breakdownRow(id: string, behavioral: number, nonBehavioral: number): React.ReactElement {
    return (
      <li key={id} className="module-arch__breakdown-item" data-module={id}>
        <span className="module-arch__dependency-name">{modulesById.get(id)?.name ?? id}</span>
        <span>{behavioral} behavioral</span>
        <span>{nonBehavioral} non-behavioral</span>
      </li>
    );
  }

  function headlineCards(behavioral: number, nonBehavioral: number,
    behavioralLabel: string, nonBehavioralLabel: string): React.ReactElement {
    return (
      <div className="module-arch__headline-cards">
        <div className="module-arch__headline-card module-arch__headline-card--behavioral" data-headline="behavioral">
          <span className="module-arch__headline-value">{behavioral}</span>
          <span className="module-arch__metric-label">{behavioralLabel}</span>
        </div>
        <div className="module-arch__headline-card module-arch__headline-card--non-behavioral" data-headline="non-behavioral">
          <span className="module-arch__headline-value">{nonBehavioral}</span>
          <span className="module-arch__metric-label">{nonBehavioralLabel}</span>
          <span className="module-arch__headline-note">{settings.showNonBehavioral ? 'shown' : 'not drawn'}</span>
        </div>
      </div>
    );
  }

  function dependencyPlaceholder(): React.ReactElement {
    return <p className="module-arch__no-exports" data-dependency-state={notice.state}>{notice.text}</p>;
  }

  function renderEdgeList(edges: readonly ExplorerEdge[], otherEnd: 'consumer' | 'provider'): React.ReactNode {
    return (
      <div className="module-arch__dependency-list">
        {edges.map((edge) => {
          const expanded = expandedDependencyId === edge.id;
          const otherModule = modulesById.get(edge[otherEnd]);
          return (
            <div key={edge.id} className="module-arch__dependency-item">
              <button type="button" className="module-arch__dependency-header"
                onClick={() => onToggleDependency(edge.id)}>
                <span className="module-arch__dependency-name">{otherModule?.name ?? edge[otherEnd]}</span>
                <span className="module-arch__dependency-badges">
                  <span className="module-arch__dependency-badge module-arch__dependency-badge--methods">
                    {edge.accessCount} {edge.accessCount === 1 ? 'access' : 'accesses'}
                  </span>
                  {statusBadge(edge.status)}
                  {reasonBadges(edge.reasons)}
                </span>
                <span className="module-arch__dependency-chevron">{expanded ? '\u25B2' : '\u25BC'}</span>
              </button>
              {expanded && <div className="module-arch__dependency-methods">{renderAccesses(edge.accesses)}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  function renderAccesses(accesses: readonly ExplorerEdge['accesses'][number][]): React.ReactNode {
    if (accesses.length === 0) return <p className="module-arch__no-exports">No source accesses recorded</p>;
    return (
      <div className="module-arch__edge-methods">
        {accesses.map((access) => {
          const spelling = access.specifier ?? access.targetFile ?? access.writtenForm;
          return (
            <button key={access.id} type="button" className="module-arch__edge-method"
              data-import-path={spelling} title={spelling}
              onClick={() => copyImportPath(spelling)}>
              <span className="module-arch__edge-method-name">
                {access.writtenForm}: {access.selections.map((selection) => selection.exportedName).join(', ') || '(no named selection)'}
              </span>
              <span className={`module-arch__dependency-badge module-arch__dependency-badge--${access.status}`}>
                {access.status}
              </span>
              {copiedImportPath === spelling && <span className="module-arch__edge-method-copied">Copied</span>}
            </button>
          );
        })}
      </div>
    );
  }

  function copyImportPath(path: string): void {
    void copyTextToClipboard(path);
    setCopiedImportPath(path);
    window.setTimeout(() => {
      setCopiedImportPath((current) => current === path ? null : current);
    }, 1200);
  }

  function renderCoverage(coverage: readonly ExplorerCoverage[]): React.ReactNode {
    return (
      <ul className="module-arch__coverage-list">
        {coverage.map((item) => (
          <li key={item.limit.id} className="module-arch__coverage-item">
            <strong>{item.limit.code}</strong>: {item.limit.message}
            <span>{formatLocation(item.limit.location)}</span>
          </li>
        ))}
      </ul>
    );
  }

  function renderDiscussion(
    selection: ExplorerDiscussionSelection,
    contextLabel: string,
    key: string,
  ): React.ReactNode {
    if (!DiscussionComponent) return null;
    return collapsible(key, 'Discussion', (
      <DiscussionComponent contextLabel={contextLabel} selection={selection} />
    ));
  }

  function collapsible(
    key: string,
    title: string,
    body: React.ReactNode,
    count?: number,
  ): React.ReactElement {
    return (
      <div className="module-arch__collapsible">
        <button type="button" className="module-arch__collapsible-header"
          aria-expanded={isSectionExpanded(key)} onClick={() => toggleSection(key)}>
          <span className={`module-arch__collapsible-arrow${isSectionExpanded(key) ? ' module-arch__collapsible-arrow--expanded' : ''}`}>&#9654;</span>
          <span className="module-arch__collapsible-title">{title}</span>
          {count != null && <span className="module-arch__collapsible-badge">{count}</span>}
        </button>
        {isSectionExpanded(key) && <div className="module-arch__collapsible-body">{body}</div>}
      </div>
    );
  }
}

export default ProjectExplorerView;

function metric(value: React.ReactNode, label: string): React.ReactElement {
  return (
    <div className="module-arch__metric">
      <span className="module-arch__metric-value">{value}</span>
      <span className="module-arch__metric-label">{label}</span>
    </div>
  );
}

function fileGroup(label: string, files: readonly string[]): React.ReactNode {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        <ul className="module-arch__file-list">
          {files.map((file) => <li key={file}><code>{file}</code></li>)}
        </ul>
      </dd>
    </>
  );
}

function originalKey(item: DependencyGraphEvidence): string {
  return JSON.stringify([item.original.kind, item.original.owner, item.original.file, item.original.binding]);
}

function coverageText(model: DependencyGraphModel): string {
  return model.state === 'complete'
    ? 'Complete'
    : `Partial: ${model.coverage.unknownDependencies} omitted`;
}

export interface DependencyNotice {
  readonly state: 'idle' | 'waiting' | 'analyzing' | 'unavailable' | 'superseded'
    | 'stale' | 'partial' | 'zero' | 'complete';
  readonly text: string;
}

/** The dependency state shown beside the graph; each state has a distinct marker and text. */
export function dependencyNotice(state: DependencyGraphState): DependencyNotice {
  const kept = state.data ? ' Showing the earlier dependency diagram.' : '';
  switch (state.phase) {
    case 'idle':
      if (!state.data) return { state: 'idle', text: 'Behavioral dependencies have not been requested' };
      break;
    case 'waiting':
      return { state: 'waiting', text: 'Computing behavioral dependencies: waiting for another analysis' };
    case 'analyzing':
      return { state: 'analyzing', text: 'Computing behavioral dependencies' };
    case 'unavailable':
      return { state: 'unavailable', text: `Dependency diagram unavailable: ${state.reason ?? 'unknown reason'}.${kept}` };
    case 'superseded':
      return { state: 'superseded',
        text: `Dependency result superseded: ${state.reason ?? 'a newer revision is published'}. Refresh to update.${kept}` };
    case 'ready':
      break;
  }
  const data = state.data;
  if (!data) return { state: 'unavailable', text: 'Dependency diagram unavailable: the ready result has no data' };
  if (state.isStale) {
    return { state: 'stale', text: `Stale dependency diagram for input ${data.inputId}. Refresh to update.` };
  }
  if (data.state === 'partial') {
    return { state: 'partial', text: `Partial coverage: ${data.coverage.unknownDependencies} unknown `
      + `${data.coverage.unknownDependencies === 1 ? 'dependency' : 'dependencies'} omitted` };
  }
  if (data.project.behavioral === 0 && data.project.nonBehavioral === 0) {
    return { state: 'zero', text: 'Measured zero dependencies' };
  }
  return { state: 'complete', text: 'Behavioral dependencies complete' };
}

function statusBadge(status: ExplorerEdge['status']): React.ReactElement {
  return (
    <span className={`module-arch__dependency-badge module-arch__dependency-badge--${status}`}>
      {status}
    </span>
  );
}

function reasonBadges(reasons: ExplorerEdge['reasons']): React.ReactNode {
  return reasons.map((reason) => (
    <span key={reason} className="module-arch__dependency-badge module-arch__dependency-badge--reason">
      {reason}
    </span>
  ));
}

function moduleDepth(id: string, modulesById: ReadonlyMap<string, ExplorerModule>): number {
  let depth = 0;
  let current = modulesById.get(id);
  const visited = new Set<string>();
  while (current?.parent && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = modulesById.get(current.parent);
  }
  return depth;
}

function formatLocation(location: { readonly file: string; readonly line: number;
  readonly column: number }): string {
  return `${location.file}:${location.line}:${location.column}`;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === 'undefined') return;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}
