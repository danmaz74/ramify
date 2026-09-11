import type { BatchOperation } from '../../../../src/interfaces/batch.js';
import type { DaemonStatus } from '../../../../src/interfaces/service.js';
import type { ServiceConnector, DaemonRecord } from '../../../daemon/src/interfaces/daemon.js';
import type { ContextStatus, ContextRevision } from '../../../daemon/src/context-types.js';
import type { AnalysisReport } from '../../../analysis/src/interfaces/analysis.js';

export type CliExitCode = 0 | 1 | 2 | 130;
export interface CliEnvironment {
  readonly cwd: string;
  readonly version: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly batch: BatchOperation;
  readonly connect: ServiceConnector;
}
export type WatchLine =
  | { readonly schemaVersion: 'ramify.watch/1'; readonly event: 'status'; readonly current: ContextStatus }
  | { readonly schemaVersion: 'ramify.watch/1'; readonly event: 'revision'; readonly revision: ContextRevision;
      readonly coalesced: number; readonly report: AnalysisReport }
  | { readonly schemaVersion: 'ramify.watch/1'; readonly event: 'revision-evicted';
      readonly revision: ContextRevision; readonly coalesced: number }
  | { readonly schemaVersion: 'ramify.watch/1'; readonly event: 'evicted' | 'stopped' | 'unavailable';
      readonly reason: string };
export type DaemonStatusDocument =
  | { readonly schemaVersion: 'ramify.daemon-status/1'; readonly running: true; readonly status: DaemonStatus }
  | { readonly schemaVersion: 'ramify.daemon-status/1'; readonly running: false;
      readonly record: DaemonRecord | null };
