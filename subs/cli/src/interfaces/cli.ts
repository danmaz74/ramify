import type { AffectedBatchOperation, BatchOperation } from '../../../../src/interfaces/batch.js';
import type { DaemonStatus } from '../../../../src/interfaces/service.js';
import type { ServiceConnector, DaemonRecord } from '../../../daemon/src/interfaces/daemon.js';
import type { ContextStatus, ContextRevision, ReplyTimings, RevisionId } from '../../../daemon/src/context-types.js';
import type { AnalysisReport, AnalysisDiagnostic, RunControl } from '../../../analysis/src/interfaces/analysis.js';
import type { RevisionPath, CheckedSet, RevisionTimings } from '../../../analysis/src/interfaces/session.js';
import type { OutsideSourceWarning } from '../../../analysis/subs/project/src/interfaces/project.js';
import type { SourceLimit } from '../../../analysis/subs/typescript/src/interfaces/source.js';
import type { AffectedSelection } from '../../../analysis/src/interfaces/affected.js';

export type CliExitCode = 0 | 1 | 2 | 130;
export interface ExplorerLaunch {
  readonly url: string;
  readonly started: boolean;
  /** Stops only the process started by this invocation. Reused processes are never owned.
   * `ramify explore` never calls it: the server it starts is resident. */
  cleanup(): Promise<void>;
}
/** `root` is the context's resolved project root; `projectKey` the first 16 hex digits of its context ID. */
export type ExplorerLauncher = (input: { readonly root: string; readonly projectKey: string }, control?: RunControl) => Promise<ExplorerLaunch>;
export type BrowserOpener = (url: string, control?: RunControl) => Promise<void>;
export interface CliEnvironment {
  readonly cwd: string;
  readonly version: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly batch: BatchOperation;
  /** The affected-module batch form. Root supplies it in installed CLI entries; without it
   * `affected --batch` is unavailable and the resident form is unaffected. */
  readonly affectedBatch?: AffectedBatchOperation;
  readonly connect: ServiceConnector;
  /** Root-owned lazy process assembly; present in installed CLI entries. */
  readonly explore?: ExplorerLauncher;
  /** Root-owned platform browser port; tests inject a controlled implementation. */
  readonly openBrowser?: BrowserOpener;
  /** Resolves a refusal when this client cannot run the installed build, otherwise null.
   * A command awaits it before it connects or runs batch; help and version do not. */
  readonly buildRefusal?: () => Promise<string | null>;
}
export interface CheckDocument {
  readonly schemaVersion: 'ramify.check/1';
  readonly root: string;
  readonly revision: { readonly id: RevisionId; readonly sequence: number; readonly path: RevisionPath } | null;
  readonly since: RevisionId | null;
  readonly changed: readonly { readonly path: string; readonly sha256: string | null; readonly covered: boolean }[];
  readonly outcome: 'checked' | 'not-checked';
  readonly reason: 'cold' | 'deadline-exceeded' | 'unobserved-input' | 'superseded' | 'incomplete' | 'unavailable' | 'stopped' | 'incompatible' | 'evicted-revision' | 'resource-unavailable' | 'analysis-failed' | 'unknown-context' | 'expired-generation' | 'unsupported-setup' | 'disposed' | 'configuration-changed' | null;
  readonly execution: AnalysisReport['outcome']['execution'] | null;
  readonly findings: readonly (AnalysisDiagnostic & { readonly new: boolean })[];
  readonly removed: readonly string[];
  readonly warnings: readonly OutsideSourceWarning[];
  readonly coverage: readonly SourceLimit[];
  readonly checked: CheckedSet | null;
  readonly timings: { readonly daemon: RevisionTimings | null; readonly waitedMs: number; readonly totalMs: number;
    /** The reported check reply's own durations, present only when the reply carries them. */
    readonly reply?: ReplyTimings };
  readonly exitCode: 0 | 1 | 2;
}
export type WatchLine =
  | { readonly schemaVersion: 'ramify.watch/2'; readonly event: 'status'; readonly current: ContextStatus }
  | { readonly schemaVersion: 'ramify.watch/2'; readonly event: 'revision'; readonly revision: ContextRevision;
      readonly coalesced: number; readonly report: AnalysisReport }
  | { readonly schemaVersion: 'ramify.watch/2'; readonly event: 'revision-evicted';
      readonly revision: ContextRevision; readonly coalesced: number }
  | { readonly schemaVersion: 'ramify.watch/2'; readonly event: 'evicted' | 'stopped' | 'unavailable';
      readonly reason: string };
export type DaemonStatusDocument =
  | { readonly schemaVersion: 'ramify.daemon-status/2'; readonly running: true; readonly status: DaemonStatus }
  | { readonly schemaVersion: 'ramify.daemon-status/2'; readonly running: false;
      readonly record: DaemonRecord | null };
/** One `ramify affected --format json` answer. `revision.sequence` is the resident
 * revision's sequence and null for a batch session. */
export interface AffectedDocument {
  readonly schemaVersion: 'ramify.affected-cli/2';
  readonly root: string;
  readonly mode: 'resident' | 'batch';
  readonly revision: { readonly sequence: number | null; readonly inputId: string };
  readonly ramifyVersion: string;
  readonly selection: AffectedSelection;
}
