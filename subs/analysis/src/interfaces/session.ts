import type { AvailableForm } from '../../subs/model/src/interfaces/model.js';
import type { CapturedInput, ObservedChange, OutsideSourceWarning } from '../../subs/project/src/interfaces/project.js';
import type { SourceLimit, SymbolDetail, SymbolDetailLimits, SymbolDetailRequest } from '../../subs/typescript/src/interfaces/source.js';
import type { AnalysisDiagnostic, AnalysisInputs, AnalysisReport, AnalysisSummary, RunControl } from './analysis.js';
import type { ArchitectViewQuery, ArchitectViewQueryOutcome } from './architect-view.js';
import type { SessionMeasurementsOutcome } from './measurements.js';

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
  /** The signature-companion pass of the decide stage; inside `decide`, not added to it. */
  readonly companions: number;
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
  | { readonly status: 'revised'; readonly revision: SessionRevision; readonly identical: boolean;
      /** A structural observer update acquired the project again on a fresh, validated capture and
       * this revision promoted every compiler read into it. False for an identical or invalid result
       * and for the observation retry of a session opened over an invalid capture. */
      readonly reacquired: boolean; readonly timings?: OperationTimings }
  | { readonly status: 'reported'; readonly report: AnalysisReport; readonly timings?: OperationTimings }
  | { readonly status: 'cancelled' };
export type VerifyOutcome =
  | { readonly status: 'equal'; readonly sequence: number; readonly elapsedMs: number }
  | { readonly status: 'mismatch'; readonly sequence: number; readonly fields: readonly string[]; readonly revision: SessionRevision }
  /** The audit did not run: the compiler it recomputes from is released, or the
   * session failed. A reported outcome, never a rejection, so the caller can
   * record it without retrying. */
  | { readonly status: 'unavailable'; readonly reason: 'compiler-released' | 'failed'; readonly message: string }
  | { readonly status: 'cancelled' };
export type SessionExplorerDetailsOutcome =
  | { readonly status: 'ready'; readonly sequence: number;
      readonly details: readonly SymbolDetail[] }
  | { readonly status: 'superseded'; readonly sequence: number }
  | { readonly status: 'unavailable';
      readonly reason: 'compiler-released' | 'invalid-current'
        | 'resource-limit' | 'analysis-failed';
      readonly message: string }
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
  /** A session captures every input with the project request it was opened with. An
   * `invocation` that resolves to the same root changes only the request its reports echo;
   * when that request changes, an update with identical facts still publishes a revision. */
  update(changes: readonly SessionChange[], control?: RunControl,
    invocation?: Pick<AnalysisInputs, 'project' | 'capabilities'>): Promise<SessionUpdate>;
  /** An unchanged sweep may carry the timings its hosting layers measured. */
  sweep(control?: RunControl): Promise<SessionUpdate | { readonly status: 'unchanged'; readonly timings?: OperationTimings }>;
  verify(control?: RunControl): Promise<VerifyOutcome>;
  report(control?: RunControl, sequence?: number): Promise<AnalysisReport | null>;
  releaseRevision(sequence: number): Promise<void>;
  status(): SessionStatus;
  releaseCompiler(): Promise<void>;
  /** Project one ephemeral, bounded API-view from the current valid revision's
   * retained `SessionFacts`. Only `query.sequence` equal to the session's
   * current revision is accepted; a hot session uses its live compiler, a warm
   * session recreates one from the retained observer's captured view without
   * publishing a revision or walking the project inventory again. `report()`
   * and a second model/store are never used. */
  apiView(query: ApiViewQuery, control?: RunControl): Promise<ApiViewQueryOutcome>;
  /** Project the architect view's facts from the current valid revision, as
   * `apiView` does: only the current sequence is accepted, a warm session
   * recreates its compiler without publishing a revision, and `.feature` files
   * are read from disk only while their bytes equal the revision's captured
   * input; a changed one answers `superseded`. */
  architectView(query: ArchitectViewQuery, control?: RunControl): Promise<ArchitectViewQueryOutcome>;
  /** Measure the current revision's retained inventory and captured module
   * documentation. API-view bytes belong to the daemon and are not returned. */
  measurements(sequence: number, control?: RunControl): Promise<SessionMeasurementsOutcome>;
  /** Read bounded symbol details only from the current valid revision and its
   * still-live compiler. This never rehydrates or substitutes a revision. */
  explorerDetails(sequence: number, requests: readonly SymbolDetailRequest[],
    control?: RunControl): Promise<SessionExplorerDetailsOutcome>;
  dispose(): Promise<void>;
}
export type SessionOpen =
  | { readonly status: 'opened'; readonly session: RetainedSession; readonly revision: SessionRevision }
  | { readonly status: 'reported'; readonly report: AnalysisReport }
  | { readonly status: 'cancelled' };

/**
 * A materialized foreign-API projection: one entry, grouped by the original's
 * defining file and split by the owner's relationship to the consuming
 * module. `children` holds an original owned by a proper descendant of the
 * consumer, at any depth; `external` holds every other foreign owner
 * (ancestor, sibling or cousin). npm, built-in and standard-library targets
 * are never originals and never appear.
 */
export type ApiViewCategory = 'external' | 'children';
/** One defining-file export name available to the consuming area, paired
 * with its bounded signature/documentation detail. */
export interface ApiViewEntry {
  readonly name: string;
  readonly form: AvailableForm;
  readonly detail: SymbolDetail;
}
/** Every available entry of one original defining application file, byte-ordered by entry name. */
export interface ApiViewFile {
  readonly category: ApiViewCategory;
  readonly definingFile: string;
  readonly entries: readonly ApiViewEntry[];
}
/** The complete foreign-API projection of one source area (a module's ordinary
 * or testing source), byte-ordered by category then defining file. `coverage`
 * counts distinct catalog/source-description limits that may have omitted an
 * API; `detailsUnavailable` and `truncated` count the affected entries. */
export interface ApiViewAreaProjection {
  readonly area: 'ordinary' | 'tests';
  readonly root: string;
  readonly files: readonly ApiViewFile[];
  readonly coverage: number;
  readonly detailsUnavailable: number;
  readonly truncated: number;
}
/** One module's complete projection. `ordinary` is `null` exactly when the
 * module's ordinary source area (`<module>/src/`) was absent before
 * projection, and `tests` is `null` exactly when the module's testing source
 * area was absent before projection; neither is ever a placeholder for an
 * area that could not be computed. A module with neither area present yields
 * a module projection with both fields `null` and zero targets. */
export interface ApiViewModuleProjection {
  readonly module: string;
  readonly directory: string;
  readonly ordinary: ApiViewAreaProjection | null;
  readonly tests: ApiViewAreaProjection | null;
}
/** The frozen, ephemeral result of one materialization query: complete,
 * bounded, deterministic data for every requested module, derived from
 * exactly one analysis sequence. `bytes` is the deterministic encoded size
 * used for the invocation bound, not the eventual Markdown size. */
export interface ApiViewProjection {
  readonly schema: 'ramify.api-view-projection/1';
  readonly sequence: number;
  readonly inputId: string;
  readonly modules: readonly ApiViewModuleProjection[];
  readonly bytes: number;
}
/** One declared module by its innermost `from` location, or every inventory module. */
export type ApiViewSelection =
  | { readonly scope: 'module'; readonly from: string }
  | { readonly scope: 'all' };
export interface ApiViewQuery {
  readonly sequence: number;
  readonly selection: ApiViewSelection;
  readonly details: SymbolDetailLimits;
  readonly maxAreaBytes: number;
  readonly maxInvocationBytes: number;
}
export type ApiViewQueryOutcome =
  | { readonly status: 'projected'; readonly projection: ApiViewProjection }
  | { readonly status: 'superseded'; readonly sequence: number; readonly observedInputId: string }
  | { readonly status: 'unavailable'; readonly reason: 'invalid-revision' | 'invalid-location'
      | 'invalid-projection' | 'resource-limit' | 'analysis-failed'; readonly message: string }
  | { readonly status: 'cancelled' };
