import type { CapturedInput, ObservedChange, OutsideSourceWarning } from '../../subs/project/src/interfaces/project.js';
import type { SourceLimit } from '../../subs/typescript/src/interfaces/source.js';
import type { AnalysisDiagnostic, AnalysisInputs, AnalysisReport, AnalysisSummary, RunControl } from './analysis.js';

/** Limits of one retained session; contexts owns request deadlines and sweep scheduling. */
export interface SessionLimits {
  readonly updateDeadlineMs: number;
  readonly sweepIntervalMs: number;
  readonly workerHeapMiB: number;
  readonly maxRetainedFactBytes: number;
}
export interface SessionInputs extends AnalysisInputs { readonly session: SessionLimits }
export type SessionChange = ObservedChange;
export type RevisionPath = 'cold' | 'unchanged-surface' | 'source' | 'description' | 'metadata' | 'membership' | 'broad';
/** What one revision recomputed. `files` were re-interpreted or described afresh;
 * `accesses` were decided afresh, position refreshes excluded. */
export interface CheckedSet {
  readonly path: RevisionPath;
  readonly files: readonly string[];
  readonly accesses: number;
  readonly modelRebuilt: boolean;
}
/** Findings that appeared, disappeared or only moved since the previous revision. */
export interface FindingDelta {
  readonly added: readonly AnalysisDiagnostic[];
  readonly removed: readonly string[];
  readonly positionOnly: readonly string[];
}
export interface RevisionTimings {
  readonly classify: number;
  readonly inventory: number;
  readonly compiler: number;
  readonly descriptions: number;
  readonly accesses: number;
  readonly link: number;
  readonly decide: number;
  readonly publish: number;
  readonly total: number;
}
/** One published revision: frozen plain data with the complete current lists. */
export interface SessionRevision {
  readonly sequence: number;
  readonly inputId: string;
  readonly inputs: readonly CapturedInput[];
  readonly changed: readonly string[];
  readonly checked: CheckedSet;
  readonly outcome: AnalysisReport['outcome'];
  readonly summary: AnalysisSummary;
  readonly diagnostics: readonly AnalysisDiagnostic[];
  readonly warnings: readonly OutsideSourceWarning[];
  readonly coverage: readonly SourceLimit[];
  readonly delta: FindingDelta;
  readonly timings: RevisionTimings;
}
/** Durations of one update or sweep outside `RevisionTimings.total`, in milliseconds.
 * Each layer adds what it measures; a field is absent where its layer did not run. */
export interface OperationTimings {
  /** The engine's invocation check before the update's timer starts; zero for a sweep. */
  readonly invocationCheck: number;
  /** Promotion of the compiler's reads into the capture after computation, inside
   * `RevisionTimings.total` but outside its stages; zero when it did not run. */
  readonly promotion: number;
  /** The worker's status checkpoint sent with the reply. */
  readonly workerStatus?: number;
  /** Request posted to reply received, measured by the daemon-side host. */
  readonly workerRoundTrip?: number;
}
export type SessionUpdate =
  | { readonly status: 'revised'; readonly revision: SessionRevision; readonly identical: boolean; readonly timings?: OperationTimings }
  | { readonly status: 'reported'; readonly report: AnalysisReport; readonly timings?: OperationTimings }
  | { readonly status: 'cancelled' };
export type VerifyOutcome =
  | { readonly status: 'equal'; readonly sequence: number; readonly elapsedMs: number }
  | { readonly status: 'mismatch'; readonly sequence: number; readonly fields: readonly string[]; readonly revision: SessionRevision }
  | { readonly status: 'cancelled' };
export interface SessionStatus {
  readonly level: 'hot' | 'warm';
  readonly sequence: number;
  readonly observedInputs: number;
  readonly factBytes: number;
  readonly worker: { readonly heapUsed: number; readonly rss: number };
  readonly compiler: { readonly pid: number | null; readonly rss: number | null };
  readonly lastSweepAt: number | null;
}
export interface RetainedSession {
  readonly current: SessionRevision | null;
  update(changes: readonly SessionChange[], control?: RunControl,
    invocation?: Pick<AnalysisInputs, 'project' | 'capabilities'>): Promise<SessionUpdate>;
  /** An unchanged sweep may carry the timings its hosting layers measured. */
  sweep(control?: RunControl): Promise<SessionUpdate | { readonly status: 'unchanged'; readonly timings?: OperationTimings }>;
  verify(control?: RunControl): Promise<VerifyOutcome>;
  report(control?: RunControl, sequence?: number): Promise<AnalysisReport | null>;
  releaseRevision(sequence: number): Promise<void>;
  status(): SessionStatus;
  releaseCompiler(): Promise<void>;
  dispose(): Promise<void>;
}
export type SessionOpen =
  | { readonly status: 'opened'; readonly session: RetainedSession; readonly revision: SessionRevision }
  | { readonly status: 'reported'; readonly report: AnalysisReport }
  | { readonly status: 'cancelled' };
