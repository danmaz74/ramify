// Adapted from cucumber-viz
// src/domains/module-architecture/ui/pages/ModuleArchitecturePage.tsx at
// 44b7f30e0fdfda79ead8363ef4c85c100e36fda0.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExplorerDetailsResult, ServerStatusResult } from '../../service-api/src/interfaces/explorer-service.js';
import type { ContextRevision, RevisionId } from '../../daemon/subs/contexts/src/interfaces/contexts.js';
import type { ProjectExplorerModel, ExplorerExport } from '../../presentation/subs/project-view/src/interfaces/project-view.js';
import type { ExportDetailState } from '../../presentation/subs/project-view/src/ExportList.js';
import type { GraphSelection } from '../../presentation/subs/project-view/src/moduleGraphShared.js';
import { ModuleGraphRadial } from '../../presentation/subs/project-view/src/ModuleGraphRadial.js';
import { ProjectExplorerView, type ExplorerDiscussionProps } from '../../presentation/subs/project-view/src/ProjectExplorerView.js';
import { isNewerRevision } from './revision-freshness.js';

type ProjectViewResult =
  | { readonly status: 'ready'; readonly revision: ContextRevision;
      readonly view: ProjectExplorerModel }
  | { readonly status: 'pending'; readonly current: import('../../daemon/subs/contexts/src/interfaces/contexts.js').ContextStatus }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface ExplorerClient {
  projectView(input: { readonly revision?: RevisionId }): Promise<ProjectViewResult>;
  explorerDetails(input: { readonly revision: RevisionId;
    readonly requests: readonly import('../../analysis/subs/typescript/src/interfaces/source.js').SymbolDetailRequest[] }): Promise<ExplorerDetailsResult>;
  serverStatus(): Promise<ServerStatusResult>;
}

export interface ProjectExplorerPageProps {
  readonly client: ExplorerClient;
  readonly pollIntervalMs?: number;
  readonly DiscussionComponent?: React.ComponentType<ExplorerDiscussionProps>;
}

export function ProjectExplorerPage({ client, pollIntervalMs = 3000,
  DiscussionComponent }: ProjectExplorerPageProps): React.ReactElement {
  const [data, setData] = useState<ProjectExplorerModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [newestRevision, setNewestRevision] = useState<RevisionId | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphSelection | null>(null);
  const [expandedExportId, setExpandedExportId] = useState<string | null>(null);
  const [exportDetail, setExportDetail] = useState<ExportDetailState>({ state: 'idle' });
  const [expandedDependencyId, setExpandedDependencyId] = useState<string | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<readonly string[]>([]);
  const [classesInitialized, setClassesInitialized] = useState(false);
  const [scopeModuleId, setScopeModuleId] = useState<string | null>(null);
  const viewRequest = useRef(0);
  const detailRequest = useRef(0);
  const dataRef = useRef<ProjectExplorerModel | null>(null);
  const displayedRevision = useRef<ContextRevision | null>(null);
  const viewLoading = useRef(false);

  const load = useCallback(async (revision?: RevisionId) => {
    const request = ++viewRequest.current;
    let pending = false;
    viewLoading.current = true;
    setIsLoading(dataRef.current === null);
    setError(null);
    try {
      const result = await client.projectView({ ...(revision ? { revision } : {}) });
      if (request !== viewRequest.current) return;
      if (result.status === 'ready') {
        if (result.view.revision !== result.revision.revision) {
          dataRef.current = null;
          setData(null);
          setUnavailableReason('Project view response mixed revision identities');
          return;
        }
        detailRequest.current++;
        displayedRevision.current = result.revision;
        dataRef.current = result.view;
        setData(result.view);
        setUnavailableReason(null);
        setIsStale(false);
        setNewestRevision(null);
        setExportDetail({ state: 'idle' });
      } else if (result.status === 'unavailable') {
        // A displayed model stays; the connection notice reports the server's state.
        if (dataRef.current === null) setUnavailableReason(result.reason);
      } else {
        pending = true;
        setUnavailableReason(null);
      }
    } catch (cause) {
      if (request === viewRequest.current) setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (request === viewRequest.current) {
        viewLoading.current = false;
        setIsLoading(pending);
      }
    }
  }, [client]);

  useEffect(() => { void load(); return () => { viewRequest.current++; detailRequest.current++; }; }, [load]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const result = await client.serverStatus();
        if (!active) return;
        setConnectionNotice(connectionNoticeText(result));
        if (result.binding !== 'ready') return;
        const published = result.published;
        if (published && dataRef.current === null && !viewLoading.current) {
          void load(published.revision);
          return;
        }
        const displayed = displayedRevision.current;
        if (published && displayed && isNewerRevision(displayed, published)) {
          setNewestRevision(published.revision);
          setIsStale(true);
        }
      } catch { /* A later poll can recover; the displayed revision remains coherent. */ }
    };
    const timer = setInterval(() => { void poll(); }, pollIntervalMs);
    const visible = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', visible);
    void poll();
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [client, load, pollIntervalMs]);

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
    onRefresh={() => { void load(newestRevision ?? undefined); }}
    onToggleDependency={id => setExpandedDependencyId(previous => previous === id ? null : id)}
    isStale={isStale} scopeModuleId={scopeModuleId} breadcrumbTrail={breadcrumbTrail}
    onDrillDown={id => { if (data?.modules.find(module => module.id === id)?.children.length) {
      setScopeModuleId(id); setSelectedModuleId(null); setSelectedEdge(null);
    } }}
    onNavigateToScope={id => { setScopeModuleId(id); setSelectedModuleId(null); setSelectedEdge(null); }} />;
  if (connectionNotice === null) return view;
  return <>
    <p role="status" className="project-explorer-page__connection-notice"
      style={{ margin: 0, padding: '0.4rem 1rem', background: '#fff4ce', color: '#5c4400', fontSize: '0.875rem' }}>
      {connectionNotice}
    </p>
    {view}
  </>;
}

const bindingLabels: Readonly<Record<ServerStatusResult['binding'], string>> = {
  'connecting': 'Connecting to the project',
  'ready': 'Connected',
  'daemon-stopped': 'The daemon was stopped explicitly',
  'project-unavailable': 'The project is unavailable',
  'retrying': 'Reconnecting to the daemon',
};

/** The binding state as one line of text. */
export function bindingStateText(status: Pick<ServerStatusResult, 'binding' | 'message'>): string {
  const label = bindingLabels[status.binding];
  return status.message ? `${label}: ${status.message}` : label;
}

function connectionNoticeText(status: ServerStatusResult): string | null {
  if (status.binding === 'ready') return null;
  return bindingStateText(status);
}
