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
}

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
}: ProjectExplorerViewProps): React.ReactElement {
  const [copiedImportPath, setCopiedImportPath] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
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
    return !collapsedSections.has(key);
  }

  function toggleSection(key: string): void {
    setCollapsedSections((previous) => {
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
  const outOfViewModules = useMemo(() => {
    if (modulesForGraph.length === 0) return [];
    const related = new Set<string>();
    for (const edge of data?.edges ?? []) {
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
  }, [data?.edges, modulesById, modulesForGraph.length, visibleModuleIds]);
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

  useEffect(() => {
    if (!selectedEdge) return;
    const visible = allVisibleModuleIds.has(selectedEdge.edge.consumer)
      && allVisibleModuleIds.has(selectedEdge.edge.provider);
    if (!visible) onSelectEdge(null);
  }, [allVisibleModuleIds, onSelectEdge, selectedEdge]);

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
  const visibleDependencies = data.edges.filter((edge) =>
    visibleModuleIds.has(edge.consumer) && visibleModuleIds.has(edge.provider)).length;
  const scopeName = scopeModuleId ? modulesById.get(scopeModuleId)?.name : null;

  return (
    <div className="project-explorer-page">
      <div className="module-arch">
        <div className="module-arch__header">
          <div>
            <h2 className="module-arch__title">Project Explorer</h2>
            <p className="module-arch__subtitle">
              {scopeName
                ? `${scopeName} \u203A Showing ${modulesForGraph.length} sub-modules, ${visibleDependencies} module dependencies`
                : `Showing ${modulesForGraph.length} of ${modules.length} modules, ${visibleDependencies} module dependencies`}
            </p>
            <p className="module-arch__revision">Revision {String(data.revision)}</p>
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
              edges={data.edges}
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
            {selectedEdge
              ? renderEdgeDetail(selectedEdge.edge)
              : selectedModule
                ? renderModuleDetail(selectedModule)
                : (
                  <div className="module-arch__sidebar-empty">
                    <p>Select a module or dependency edge to inspect details</p>
                  </div>
                )}
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

  function renderModuleDetail(module: ExplorerModule): React.ReactNode {
    const dependencies = model.edges.filter((edge) => edge.consumer === module.id);
    const dependents = model.edges.filter((edge) => edge.provider === module.id);
    const coverage = model.coverage.filter((item) => item.moduleIds.includes(module.id));
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
        </div>

        {collapsible('mod-metrics', 'Metrics', (
          <div className="module-arch__detail-metrics">
            {metric(module.metrics.ownedFiles, 'Owned files')}
            {metric(module.metrics.subtreeFiles, 'Subtree files')}
            {metric(module.metrics.dependencies, 'Dependencies')}
            {metric(module.metrics.dependents, 'Dependents')}
            {metric(module.metrics.accessOccurrences, 'Access occurrences')}
            {metric(module.metrics.selectedSymbols, 'Selected symbols')}
            {metric(module.metrics.deniedAccesses, 'Denied accesses')}
            {metric(module.metrics.limitedAccesses, 'Limited accesses')}
            {metric(`~${module.metrics.approximateIcs}`, 'Approx. complexity')}
          </div>
        ))}

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

        {dependencies.length > 0 && collapsible('mod-consumed', 'Consumed accesses',
          renderEdgeList(dependencies, 'provider'), dependencies.length)}
        {dependents.length > 0 && collapsible('mod-consumers', 'Access consumers',
          renderEdgeList(dependents, 'consumer'), dependents.length)}

        {collapsible('mod-exports', 'Export inventory', (
          module.exports.length > 0 ? (
            <ExportList exports={module.exports} expandedExportId={expandedExportId}
              detail={exportDetail} onToggleExport={onToggleExport} />
          ) : <p className="module-arch__no-exports">No exports found</p>
        ), module.exports.length || undefined)}

        {coverage.length > 0 && collapsible('mod-coverage', 'Coverage limits',
          renderCoverage(coverage), coverage.length)}
        {renderDiscussion({ kind: 'module', module }, module.name, 'mod-discussion')}
      </div>
    );
  }

  function renderEdgeDetail(edge: ExplorerEdge): React.ReactNode {
    const consumer = modulesById.get(edge.consumer)?.name ?? edge.consumer;
    const provider = modulesById.get(edge.provider)?.name ?? edge.provider;
    const coverage = model.coverage.filter((item) => edge.coverageIds.includes(item.limit.id)
      || item.edgeIds.includes(edge.id));
    return (
      <div className="module-arch__detail">
        <div className="module-arch__detail-header">
          <h3 className="module-arch__detail-name">Dependency Edge</h3>
          <span className="module-arch__detail-path">{consumer} {' -> '} {provider}</span>
          {statusBadge(edge.status)}
          {reasonBadges(edge.reasons)}
        </div>
        {collapsible('edge-metrics', 'Metrics', (
          <div className="module-arch__detail-metrics">
            {metric(edge.consumerFiles.length, 'Consumer files')}
            {metric(edge.providerFiles.length, 'Provider files')}
            {metric(edge.accessCount, 'Access occurrences')}
            {metric(edge.symbolCount, 'Selected symbols')}
          </div>
        ))}
        {collapsible('edge-accesses', 'Source accesses', renderAccesses(edge.accesses), edge.accesses.length)}
        {coverage.length > 0 && collapsible('edge-coverage', 'Coverage limits',
          renderCoverage(coverage), coverage.length)}
        {renderDiscussion({ kind: 'edge', id: edge.id, edge }, `${consumer} -> ${provider}`, 'edge-discussion')}
      </div>
    );
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
