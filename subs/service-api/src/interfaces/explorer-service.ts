import type { AnalysisReport } from '../../../analysis/src/interfaces/analysis.js';
import type { SymbolDetail, SymbolDetailRequest } from '../../../analysis/subs/typescript/src/interfaces/source.js';
import type {
  ContextRevision,
  ContextStatus,
  ContextToken,
  RevisionId,
} from '../../../daemon/subs/contexts/src/interfaces/contexts.js';

export interface ExplorerProjectionInput {
  readonly revision: ContextRevision;
  readonly report: AnalysisReport;
}

export interface ProjectViewInput {
  readonly token: ContextToken;
  readonly revision?: RevisionId;
}

export interface ExplorerDetailsInput {
  readonly token: ContextToken;
  readonly revision: RevisionId;
  readonly requests: readonly SymbolDetailRequest[];
}

export type ExplorerDetailsResult =
  | { readonly status: 'ready'; readonly revision: ContextRevision;
      readonly details: readonly SymbolDetail[] }
  | { readonly status: 'superseded' | 'unavailable'; readonly reason: string };

export interface ContextStatusInput {
  readonly token: ContextToken;
}

export type ContextStatusResult =
  | { readonly status: 'ready'; readonly current: ContextStatus }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface ExplorerProcessRecord {
  readonly schemaVersion: 'ramify.explorer-record/1';
  readonly instanceId: string;
  readonly pid: number;
  readonly version: string;
  readonly buildKey: string;
  readonly protocol: 'ramify.explorer-http/1';
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly origin: string;
  readonly startedAt: number;
  readonly state: 'running' | 'stopped';
  readonly stopped: null | { readonly at: number;
    readonly reason: 'idle' | 'explicit' | 'failed' };
}
