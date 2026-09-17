import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyViewResult } from '../../service-api/src/interfaces/explorer-dependencies.js';
import type { ExplorerDetailsResult, ServerStatusResult } from '../../service-api/src/interfaces/explorer-service.js';
import type { ContextRevision, ContextStatus, RevisionId } from '../../daemon/subs/contexts/src/interfaces/contexts.js';
import type { SymbolDetailRequest } from '../../analysis/subs/typescript/src/interfaces/source.js';
import type { ProjectExplorerModel } from '../../presentation/subs/project-view/src/interfaces/project-view.js';
import { isNewerRevision } from './revision-freshness.js';

export type ProjectViewResult =
  | { readonly status: 'ready'; readonly revision: ContextRevision;
      readonly view: ProjectExplorerModel }
  | { readonly status: 'pending'; readonly current: ContextStatus }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface ExplorerClient {
  projectView(input: { readonly revision?: RevisionId }): Promise<ProjectViewResult>;
  explorerDetails(input: { readonly revision: RevisionId;
    readonly requests: readonly SymbolDetailRequest[] }): Promise<ExplorerDetailsResult>;
  serverStatus(): Promise<ServerStatusResult>;
  /** The behavioral dependency view of one exact published revision; pending while the daemon analyzes. */
  dependencyView(input: { readonly revision: RevisionId }): Promise<DependencyViewResult>;
}

export interface PublishedProjectView {
  readonly data: ProjectExplorerModel | null;
  /** The published revision of the displayed model; a new object on every successful load. */
  readonly revision: ContextRevision | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly unavailableReason: string | null;
  readonly isStale: boolean;
  /** The one-line binding notice while the server's binding is not ready. */
  readonly bindingNotice: string | null;
  /** Loads the newest known revision. */
  refresh(): void;
}

/** Loads the published project view, polls the server status and marks fresher analysis. */
export function usePublishedProjectView(client: ExplorerClient,
  options: { readonly pollIntervalMs?: number } = {}): PublishedProjectView {
  const pollIntervalMs = options.pollIntervalMs ?? 3000;
  const [data, setData] = useState<ProjectExplorerModel | null>(null);
  const [revision, setRevision] = useState<ContextRevision | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [newestRevision, setNewestRevision] = useState<RevisionId | null>(null);
  const [bindingNotice, setBindingNotice] = useState<string | null>(null);
  const viewRequest = useRef(0);
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
          setRevision(null);
          setUnavailableReason('Project view response mixed revision identities');
          return;
        }
        displayedRevision.current = result.revision;
        dataRef.current = result.view;
        setData(result.view);
        // A new object even for an equal revision, so a refresh can request dependencies again.
        setRevision({ ...result.revision });
        setUnavailableReason(null);
        setIsStale(false);
        setNewestRevision(null);
      } else if (result.status === 'unavailable') {
        // A displayed model stays; the binding notice reports the server's state.
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

  useEffect(() => { void load(); return () => { viewRequest.current++; }; }, [load]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const result = await client.serverStatus();
        if (!active) return;
        setBindingNotice(result.binding === 'ready' ? null : bindingStateText(result));
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

  const refresh = useCallback(() => { void load(newestRevision ?? undefined); }, [load, newestRevision]);

  return { data, revision, isLoading, error, unavailableReason, isStale, bindingNotice, refresh };
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
