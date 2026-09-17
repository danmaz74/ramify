// Adapted from cucumber-viz
// src/domains/module-architecture/ui/pages/ModuleArchitecturePage.tsx at
// 44b7f30e0fdfda79ead8363ef4c85c100e36fda0.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExplorerExport, ProjectExplorerModel } from '../../presentation/subs/project-view/src/interfaces/project-view.js';
import type { ExportDetailState } from '../../presentation/subs/project-view/src/ExportList.js';
import type { GraphSelection } from '../../presentation/subs/project-view/src/moduleGraphShared.js';
import { ModuleGraphRadial } from '../../presentation/subs/project-view/src/ModuleGraphRadial.js';
import { ProjectExplorerView, type ExplorerDiscussionProps } from '../../presentation/subs/project-view/src/ProjectExplorerView.js';
import { usePublishedProjectView, type ExplorerClient } from './published-project-view.js';

export interface ProjectExplorerPageProps {
  readonly client: ExplorerClient;
  readonly pollIntervalMs?: number;
  readonly DiscussionComponent?: React.ComponentType<ExplorerDiscussionProps>;
  /** A module to focus in the first loaded model (`?module=`). */
  readonly initialModuleId?: string | null;
  /** Opens a module in the module tree; defaults to a new browser tab. */
  readonly openModuleTree?: (id: string) => void;
}

export function ProjectExplorerPage({ client, pollIntervalMs = 3000,
  DiscussionComponent, initialModuleId = null, openModuleTree = openInModuleTree }: ProjectExplorerPageProps): React.ReactElement {
  const { data, isLoading, error, unavailableReason, isStale, bindingNotice, refresh } =
    usePublishedProjectView(client, { pollIntervalMs });
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphSelection | null>(null);
  const [expandedExportId, setExpandedExportId] = useState<string | null>(null);
  const [exportDetail, setExportDetail] = useState<ExportDetailState>({ state: 'idle' });
  const [expandedDependencyId, setExpandedDependencyId] = useState<string | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<readonly string[]>([]);
  const [classesInitialized, setClassesInitialized] = useState(false);
  const [scopeModuleId, setScopeModuleId] = useState<string | null>(null);
  const [focusNotice, setFocusNotice] = useState<string | null>(null);
  const focusApplied = useRef(false);
  const detailRequest = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  const classes = useMemo(() => [...new Set(data?.modules.map(module => module.presentationClass) ?? [])].sort(), [data]);
  useEffect(() => {
    if (!data) return;
    if (!classesInitialized) {
      setSelectedClasses(classes);
      setClassesInitialized(true);
      return;
    }
    setSelectedClasses(previous => {
      const valid = previous.filter(value => classes.includes(value));
      const added = classes.filter(value => !previous.includes(value));
      return [...valid, ...added];
    });
  }, [classes, classesInitialized, data]);

  useEffect(() => {
    if (!data) return;
    const modules = new Map(data.modules.map(module => [module.id, module]));
    if (selectedModuleId && !modules.has(selectedModuleId)) setSelectedModuleId(null);
    if (scopeModuleId && !modules.has(scopeModuleId)) setScopeModuleId(null);
    if (expandedDependencyId && !data.edges.some(edge => edge.id === expandedDependencyId)) setExpandedDependencyId(null);
    if (expandedExportId && !data.modules.some(module => module.exports.some(item => item.id === expandedExportId))) {
      setExpandedExportId(null);
      setExportDetail({ state: 'idle' });
    }
    if (selectedEdge) {
      const edge = data.edges.find(item => item.id === selectedEdge.id);
      setSelectedEdge(edge ? { kind: 'edge', id: edge.id, edge } : null);
    }
  }, [data]);

  useEffect(() => {
    if (!data || focusApplied.current) return;
    focusApplied.current = true;
    if (initialModuleId === null) return;
    const focus = focusModule(data, initialModuleId);
    if (focus === null) {
      setFocusNotice(`Module ${initialModuleId} is not in this revision`);
      return;
    }
    setSelectedClasses([...new Set(data.modules.map(module => module.presentationClass))].sort());
    setClassesInitialized(true);
    setScopeModuleId(focus.scope);
    setSelectedModuleId(focus.selected);
  }, [data, initialModuleId]);

  const breadcrumbTrail = useMemo(() => {
    if (!scopeModuleId || !data) return [];
    const byId = new Map(data.modules.map(module => [module.id, module]));
    const trail: { id: string | null; label: string }[] = [];
    let current: string | null = scopeModuleId;
    while (current) {
      const module = byId.get(current);
      if (!module) break;
      trail.unshift({ id: current, label: module.name });
      current = module.parent;
    }
    trail.unshift({ id: null, label: 'All Modules' });
    return trail;
  }, [data, scopeModuleId]);

  const toggleExport = useCallback((item: ExplorerExport) => {
    if (expandedExportId === item.id) {
      detailRequest.current++;
      setExpandedExportId(null);
      setExportDetail({ state: 'idle' });
      return;
    }
    setExpandedExportId(item.id);
    setExportDetail(item.signature.state === 'unavailable'
      ? { state: 'unavailable', reason: 'missing original identity' } : { state: 'idle' });
  }, [expandedExportId]);

  useEffect(() => {
    if (!expandedExportId || !data) return;
    const item = data.modules.flatMap(module => module.exports).find(candidate => candidate.id === expandedExportId);
    if (!item || item.signature.state === 'unavailable') return;
    const displayedRevision = data.revision;
    const request = ++detailRequest.current;
    setExportDetail({ state: 'loading' });
    void client.explorerDetails({ revision: displayedRevision, requests: [item.signature.request] })
      .then(result => {
        if (request !== detailRequest.current || dataRef.current?.revision !== displayedRevision) return;
        if (result.status !== 'ready') {
          setExportDetail({ state: 'unavailable', reason: result.reason });
          return;
        }
        if (result.revision.revision !== displayedRevision) {
          setExportDetail({ state: 'unavailable', reason: 'superseded revision' });
          return;
        }
        const detail = result.details[0];
        if (!detail) setExportDetail({ state: 'unavailable', reason: 'detail provider returned no result' });
        else if (detail.state === 'described') setExportDetail({ state: 'described', signature: detail.signature,
          ...(detail.documentation ? { documentation: detail.documentation } : {}) });
        else if (detail.state === 'truncated') setExportDetail({ state: 'truncated', signature: detail.signature,
          ...(detail.documentation ? { documentation: detail.documentation } : {}), truncated: detail.truncated });
        else setExportDetail({ state: 'unavailable', reason: detail.reason });
      }).catch(cause => {
        if (request === detailRequest.current) setExportDetail({ state: 'unavailable', reason: cause instanceof Error ? cause.message : String(cause) });
      });
    return () => { detailRequest.current++; };
  }, [client, data, expandedExportId]);

  const view = <ProjectExplorerView
    data={data} isLoading={isLoading} error={error} unavailableReason={unavailableReason}
    selectedModuleId={selectedModuleId} selectedEdge={selectedEdge}
    expandedExportId={expandedExportId} exportDetail={exportDetail}
    selectedPresentationClasses={selectedClasses} expandedDependencyId={expandedDependencyId}
    GraphComponent={ModuleGraphRadial} DiscussionComponent={DiscussionComponent}
    onSelectModule={id => { setSelectedModuleId(id); setSelectedEdge(null); setExpandedExportId(null); setExportDetail({ state: 'idle' }); }}
    onSelectEdge={edge => { setSelectedEdge(edge); setSelectedModuleId(null); setExpandedExportId(null); setExportDetail({ state: 'idle' }); }}
    onToggleExport={toggleExport}
    onTogglePresentationClass={value => setSelectedClasses(previous => previous.includes(value)
      ? previous.filter(item => item !== value) : [...previous, value])}
    onRefresh={refresh}
    onToggleDependency={id => setExpandedDependencyId(previous => previous === id ? null : id)}
    isStale={isStale} scopeModuleId={scopeModuleId} breadcrumbTrail={breadcrumbTrail}
    onDrillDown={id => { if (data?.modules.find(module => module.id === id)?.children.length) {
      setScopeModuleId(id); setSelectedModuleId(null); setSelectedEdge(null);
    } }}
    onNavigateToScope={id => { setScopeModuleId(id); setSelectedModuleId(null); setSelectedEdge(null); }}
    onOpenModuleTree={openModuleTree} />;
  const notice = [bindingNotice, focusNotice].filter(Boolean).join(' · ');
  if (notice === '') return view;
  return <>
    <p role="status" className="project-explorer-page__connection-notice"
      style={{ margin: 0, padding: '0.4rem 1rem', background: '#fff4ce', color: '#5c4400', fontSize: '0.875rem' }}>
      {notice}
    </p>
    {view}
  </>;
}

/**
 * Where the explorer shows a module: the root needs no focus, a module the default scope shows
 * is only selected, and any other module is selected inside its parent's scope.
 */
export function focusModule(model: ProjectExplorerModel, id: string): { readonly scope: string | null; readonly selected: string | null } | null {
  const module = model.modules.find(item => item.id === id);
  if (!module) return null;
  if (module.parent === null) return { scope: null, selected: null };
  const topLevel = model.modules.filter(item => item.parent === null);
  const root = model.modules.find(item => item.id === model.rootModuleId);
  const defaultShowsRootChildren = topLevel.length === 1 && root !== undefined && root.children.length > 0;
  if (defaultShowsRootChildren && module.parent === model.rootModuleId) return { scope: null, selected: id };
  return { scope: module.parent, selected: id };
}

/** The module tree URL focused on one module. */
export function moduleTreeUrl(id: string): string {
  return `/modules/latest?module=${encodeURIComponent(id)}`;
}

function openInModuleTree(id: string): void {
  window.open(moduleTreeUrl(id), '_blank', 'noopener');
}
