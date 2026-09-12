import type { BatchOperation } from '../../../../src/interfaces/batch.js';
import type { DaemonStatus } from '../../../../src/interfaces/service.js';
import type { ServiceConnector, DaemonRecord } from '../../../daemon/src/interfaces/daemon.js';
import type { ContextStatus, ContextRevision, RevisionId } from '../../../daemon/src/context-types.js';
import type { AnalysisReport, AnalysisDiagnostic } from '../../../analysis/src/interfaces/analysis.js';
import type { RevisionPath, CheckedSet, RevisionTimings } from '../../../analysis/src/interfaces/session.js';
import type { OutsideSourceWarning } from '../../../analysis/subs/project/src/interfaces/project.js';
import type { SourceLimit } from '../../../analysis/subs/typescript/src/interfaces/source.js';

export type CliExitCode = 0 | 1 | 2 | 130;
export interface CliEnvironment {
  readonly cwd: string;
  readonly version: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly batch: BatchOperation;
  readonly connect: ServiceConnector;
}
export interface CheckDocument {
  readonly schemaVersion: 'ramify.check/1';
  readonly root: string;
  readonly revision: { readonly id: RevisionId; readonly sequence: number; readonly path: RevisionPath } | null;
  readonly since: RevisionId | null;
  readonly changed: readonly { readonly path: string; readonly sha256: string | null; readonly covered: boolean }[];
  readonly outcome: 'checked' | 'not-checked';
  readonly reason: 'cold' | 'deadline-exceeded' | 'unobserved-input' | 'superseded' | 'incomplete' | 'unavailable' | 'stopped' | 'incompatible' | 'evicted-revision' | 'resource-unavailable' | 'analysis-failed' | 'unknown-context' | 'expired-generation' | 'unsupported-setup' | 'disposed' | null;
  readonly execution: AnalysisReport['outcome']['execution'] | null;
  readonly findings: readonly (AnalysisDiagnostic & { readonly new: boolean })[];
  readonly removed: readonly string[];
  readonly warnings: readonly OutsideSourceWarning[];
  readonly coverage: readonly SourceLimit[];
  readonly checked: CheckedSet | null;
  readonly timings: { readonly daemon: RevisionTimings | null; readonly waitedMs: number; readonly totalMs: number };
  readonly exitCode: 0 | 1 | 2;
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
