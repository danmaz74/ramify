import type { AnalysisReport } from '../../../analysis/src/interfaces/analysis.js';
import type { SymbolDetail, SymbolDetailRequest } from '../../../analysis/subs/typescript/src/interfaces/source.js';
import type {
  ContextId,
  ContextRevision,
  RevisionId,
} from '../../../daemon/subs/contexts/src/interfaces/contexts.js';

export interface ExplorerProjectionInput {
  readonly revision: ContextRevision;
  readonly report: AnalysisReport;
}

/** The browser sends no token; the server's project binding supplies it. */
export interface ProjectViewInput {
  readonly revision?: RevisionId;
}

export interface ExplorerDetailsInput {
  readonly revision: RevisionId;
  readonly requests: readonly SymbolDetailRequest[];
}

export type ExplorerDetailsResult =
  | { readonly status: 'ready'; readonly revision: ContextRevision;
      readonly details: readonly SymbolDetail[] }
  | { readonly status: 'superseded' | 'unavailable'; readonly reason: string };

export type ServerBindingKind = 'connecting' | 'ready' | 'daemon-stopped' | 'project-unavailable' | 'retrying';

export interface ServerStatusResult {
  /** The resolved project root the server was started for. */
  readonly root: string;
  readonly binding: ServerBindingKind;
  /** The binding's message while retrying or project-unavailable, otherwise null. */
  readonly message: string | null;
  /** The newest published revision of the bound context, or null when none is known. */
  readonly published: ContextRevision | null;
  /** The connected daemon's process ID while ready and reported, otherwise null. */
  readonly daemonPid: number | null;
}

export interface ExplorerProcessRecord {
  readonly schemaVersion: 'ramify.explorer-record/1';
  readonly instanceId: string;
  readonly pid: number;
  readonly version: string;
  readonly buildKey: string;
  readonly protocol: 'ramify.explorer-http/1';
  /** The resolved project root served by this process. */
  readonly root: string;
  /** The daemon context ID whose first 16 hex digits form the record's project key. */
  readonly context: ContextId;
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly origin: string;
  readonly startedAt: number;
  readonly state: 'running' | 'stopped';
  readonly stopped: null | { readonly at: number;
    readonly reason: 'idle' | 'explicit' | 'failed' };
}
