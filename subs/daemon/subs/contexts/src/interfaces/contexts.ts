import type { AnalysisReport, AnalysisSummary, Capability, RunControl, AnalysisDiagnostic } from '../../../../../analysis/src/interfaces/analysis.js';
import type { ApiViewProjection, ApiViewSelection, CheckedSet, RevisionTimings, SessionStatus, SessionOpen } from '../../../../../analysis/src/interfaces/session.js';
import type { SourceLimit, SymbolDetail, SymbolDetailLimits, SymbolDetailRequest, TestTitleLimits } from '../../../../../analysis/subs/typescript/src/interfaces/source.js';
import type { PathOwnership, ProjectExclusion, ProjectRequest, ProjectScope, ProjectResolution, ProjectWarning } from '../../../../../analysis/subs/project/src/interfaces/project.js';
import type { DependencyDiagramFacts, TestReferenceFacts } from '../../../../../analysis/src/interfaces/dependency-diagram.js';
import type { DependencyDiagramRunner } from '../../../../../analysis/src/interfaces/dependency-analyzer.js';
import type { ArchitectViewProjection } from '../../../../../analysis/src/interfaces/architect-view.js';
import type { MeasurementViewUnavailableReason, SessionMeasurements } from '../../../../../analysis/src/interfaces/measurements.js';
import type { AffectedSelection, AffectedUnavailableReason } from '../../../../../analysis/src/interfaces/affected.js';

export type ContextId = string;
export type GenerationId = string;
export type RevisionId = string;
export type LeaseId = string;
export interface ContextToken {
  readonly context: ContextId;
  readonly generation: GenerationId;
}
export interface ContextSetup {
  readonly registry: 'default';
  readonly capabilities: readonly Capability[];
}
export interface ContextSelection {
  readonly root: string;
  readonly scope: ProjectRequest['scope'];
  readonly configuration: ProjectRequest['configuration'];
  readonly setup: ContextSetup;
}
export interface InputFingerprints {
  readonly inputId: string;
  readonly declarations: string;
  readonly source: string;
  readonly configuration: string;
  readonly registry: string;
  readonly engine: string;
}
export type RevisionCause = 'open' | 'watch' | 'request' | 'sweep' | 'verify' | 'conservative';
/** One watcher batch: its first event's receipt and its flush, on the watcher's clock. */
export interface WatchBatch {
  readonly receivedAt: number;
  readonly flushedAt: number;
}
/** Session work of one capture: sums over its update and sweep operations in
 * milliseconds, zero for operations that report none. Only `promotion` lies
 * inside `RevisionTimings.total`. */
export interface CaptureWork {
  readonly invocationCheck: number;
  /** Promotion of compiler reads after computation, inside `total` but outside its stages. */
  readonly promotion: number;
  readonly workerStatus: number;
  readonly workerRoundTrip: number;
  /** The round trips of the capture's sweep operations, also counted in `workerRoundTrip`. */
  readonly sweep: number;
}
/** The capture that published a revision. `watch` spans the watcher batches it
 * consumed: the earliest receipt and the latest flush, or null without any. */
export interface CaptureTimings extends CaptureWork {
  readonly watch: WatchBatch | null;
}
/** Work outside `RevisionTimings.total` paid by the capture that answered a
 * request, in milliseconds; zero for an answer from an existing publication. */
export interface ReplyTimings extends CaptureWork {
  /** The capture's daemon publication: fingerprints, history admission and events. */
  readonly publication: number;
  /** The service's handling of the check request, added by the daemon service. */
  readonly service?: number;
  /** Request sent to response received, less `service`, added by a socket client connection. */
  readonly clientTransport?: number;
}
export interface ContextRevision {
  readonly token: ContextToken;
  readonly revision: RevisionId;
  readonly sequence: number;
  readonly publishedAt: number;
  readonly cause: RevisionCause;
  readonly fingerprints: InputFingerprints;
  readonly changed: readonly string[];
  readonly checked: CheckedSet;
  readonly delta: { readonly added: number; readonly removed: number; readonly positionOnly: number };
  readonly timings: RevisionTimings;
  readonly capture: CaptureTimings;
  readonly outcome: AnalysisReport['outcome'];
  readonly summary: AnalysisSummary;
}
export type ContextState = 'opening' | 'warm' | 'cold' | 'evicted';
export type SynchronizationState = 'initializing' | 'synchronized' | 'reconciling'
  | 'conservative' | 'watcher-unavailable';
export interface ContextStatus {
  readonly token: ContextToken;
  readonly selection: ContextSelection;
  readonly scope: ProjectScope | null;
  readonly state: ContextState;
  readonly level: 'hot' | 'warm' | 'cold';
  readonly session: SessionStatus | null;
  readonly synchronization: SynchronizationState;
  readonly published: ContextRevision | null;
  readonly lastValid: ContextRevision | null;
  readonly pending: { readonly requests: number; readonly changedPaths: number;
    readonly analysisRunning: boolean };
  readonly history: { readonly retained: number; readonly bytes: number;
    readonly oldest: RevisionId | null };
  readonly retainedBytes: number;
  readonly leases: { readonly subscriptions: number; readonly requests: number };
  readonly watcher: 'active' | 'unavailable' | 'disposed';
  /** The active watcher's registrations; null while no watcher is attached. */
  readonly registrations: WatchRegistrations | null;
  readonly openedAt: number;
  readonly lastActivityAt: number;
  /** A demotion is in flight: the session was asked to release its compiler. */
  readonly demoting: boolean;
  /** When a demotion passed `demoteDeadlineMs` without the session answering;
   * the context is evicted under pressure at that moment. */
  readonly unresponsiveSince: number | null;
}
export interface ExpectedContent {
  readonly path: string;
  readonly sha256: string | null; // null: the client expects the path to be absent
}
export type Freshness =
  | { readonly mode: 'published'; readonly wait: boolean; readonly revision?: RevisionId }
  | { readonly mode: 'synchronized'; readonly expect: readonly ExpectedContent[] };
export interface FreshnessRecord {
  readonly mode: 'published' | 'synchronized';
  readonly acknowledged: number;
  readonly captureStarted: number | null;
  readonly verified: boolean;
  readonly reusedRevision: boolean;
}
export interface CheckRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Freshness;
  readonly scope: 'report' | 'delta';
  readonly since?: RevisionId;
  readonly deadlineMs?: number;
  /** The named paths of a changed check: project-relative, `/`-separated and distinct.
   * The reply gives each one a disposition. Requires synchronized freshness, whose
   * `expect` then names exactly the paths the classification analyzes. */
  readonly paths?: readonly string[];
  /** Present exactly with `paths`: the context revision sequence whose classification
   * `expect` follows, null while the client has none. A request whose expectations do
   * not follow the deciding revision's classification is answered `classification-changed`. */
  readonly classification?: number | null;
}
/**
 * How a changed check treated one named path, classified by the deciding revision's
 * ownership table. `checked`: the revision analyzed the path's current content, whose
 * identity it names, or its deletion. `not-analyzed`: the complete check does not
 * analyze the path either: it lies in an owned-ignored, external or scratch directory
 * or another always-excluded path, or it is an owned file that is neither source nor
 * an analysis input; it needs no content and carries no content identity.
 * `not-checked`: the path's result could not be established.
 */
export type PathCheckDisposition =
  | { readonly path: string; readonly disposition: 'checked'; readonly module: string; readonly exclusion: null;
      readonly reason: 'content'; readonly sha256: string }
  | { readonly path: string; readonly disposition: 'checked'; readonly module: string; readonly exclusion: null;
      readonly reason: 'deleted'; readonly sha256: null }
  | { readonly path: string; readonly disposition: 'not-analyzed'; readonly module: string | null;
      readonly exclusion: ProjectExclusion | null;
      readonly reason: 'owned-ignored' | 'external' | 'scratch' | 'reserved' | 'owned-non-source' }
  | { readonly path: string; readonly disposition: 'not-checked'; readonly module: string | null;
      readonly exclusion: ProjectExclusion | null;
      readonly reason: 'superseded' | 'unobserved-input' | 'classification-changed' };
export interface CheckDelta {
  readonly since: RevisionId | null;
  readonly findings: readonly (AnalysisDiagnostic & { readonly new: boolean })[];
  readonly removed: readonly string[];
  readonly warnings: readonly ProjectWarning[];
  readonly coverage: readonly SourceLimit[];
}
export type UnavailableReason = 'unknown-context' | 'expired-generation' | 'evicted-revision' | 'unobserved-input'
  | 'resource-unavailable' | 'analysis-failed' | 'unsupported-setup' | 'disposed'
  /** A synchronized request named a configuration path; the context answers at once and updates behind it. */
  | 'configuration-changed';
export interface Unavailable {
  readonly status: 'unavailable';
  readonly reason: UnavailableReason;
  readonly message: string;
}
export type CheckOutcome =
  /** `paths` holds one disposition per requested path, in request order; empty without `paths`. */
  | { readonly status: 'reported'; readonly requestId: string; readonly published: true;
      readonly revision: ContextRevision; readonly freshness: FreshnessRecord; readonly delta: CheckDelta; readonly report: AnalysisReport | null;
      readonly paths: readonly PathCheckDisposition[]; readonly timings?: ReplyTimings }
  | { readonly status: 'reported'; readonly requestId: string; readonly published: false;
      readonly revision: null; readonly freshness: FreshnessRecord; readonly delta: null; readonly report: AnalysisReport;
      readonly timings?: ReplyTimings }
  | { readonly status: 'pending'; readonly requestId: string; readonly current: ContextStatus }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null;
      readonly mismatches: readonly { readonly path: string; readonly expected: string | null;
        readonly observed: string | null }[] }
  | { readonly status: 'cold'; readonly requestId: string; readonly elapsedMs: number; readonly current: ContextStatus }
  | { readonly status: 'deadline-exceeded'; readonly requestId: string; readonly elapsedMs: number; readonly revision: ContextRevision | null }
  /** The request's expectations do not follow `revision`'s classification of its paths.
   * `paths` is that classification: `not-analyzed` paths need no content; every other
   * path is `not-checked` with reason `classification-changed` and needs its expectation. */
  | { readonly status: 'classification-changed'; readonly requestId: string; readonly revision: ContextRevision;
      readonly paths: readonly PathCheckDisposition[] }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | (Unavailable & { readonly requestId: string });
/** One serialized, synchronized API-view request: always synchronized freshness
 * (materialization never uses `published` freshness or a `since` baseline). */
export interface ApiViewRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Extract<Freshness, { readonly mode: 'synchronized' }>;
  /** Ignored when `views` omits `api`. */
  readonly selection: ApiViewSelection;
  readonly deadlineMs?: number;
  /** The projections to answer with, all from one revision; absent means `['api']`. The
   * root's `MaterializeViewId`, which this untagged owner cannot import from dispatch source. */
  readonly views?: readonly ('api' | 'architect')[];
  /** False only for the daemon's fixed architect-metrics omit policy. */
  readonly measureViews?: boolean;
  /** True only for the daemon's read-only measurement operation, which needs
   * inventory and the all-module API projection without either published view. */
  readonly measurementOnly?: boolean;
}
export type ContextApiViewOutcome =
  /** A projection is null exactly when its view was not requested. */
  | { readonly status: 'projected'; readonly requestId: string;
      readonly revision: ContextRevision; readonly freshness: FreshnessRecord;
      readonly projection: ApiViewProjection | null; readonly architect: ArchitectViewProjection | null;
      /** Whole-project API projection and inventory measurements used for architect metrics or `measure`. */
      readonly measurementProjection: ApiViewProjection | null; readonly measurements: SessionMeasurements | null;
      readonly measurementFailure: Exclude<MeasurementViewUnavailableReason, 'not-requested'> | null;
      readonly timings?: ReplyTimings }
  | { readonly status: 'pending' | 'cold'; readonly requestId: string;
      readonly current: ContextStatus }
  | { readonly status: 'deadline-exceeded'; readonly requestId: string;
      readonly revision: ContextRevision | null; readonly elapsedMs: number }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | (Unavailable & { readonly requestId: string });
/** One affected-module query against the covering revision. Synchronized freshness
 * joins `apiView`'s rendezvous; published freshness answers from the published
 * revision while the live session still holds it. Seeds are passed to the session
 * unchanged, which validates them. */
export interface AffectedRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Freshness;
  /** Exact inventory module IDs. */
  readonly modules?: readonly string[];
  /** Project-relative, `/`-separated paths. */
  readonly paths?: readonly string[];
  readonly deadlineMs?: number;
}
/** The non-answered variants share `ContextApiViewOutcome`'s shape, which `measure`
 * answers with; `unavailable` adds the revision it describes, null for a lifecycle
 * outcome, and the unknown module IDs of an `unknown-module` answer. */
export type ContextAffectedOutcome =
  | { readonly status: 'answered'; readonly requestId: string; readonly revision: ContextRevision;
      readonly freshness: FreshnessRecord; readonly result: AffectedSelection; readonly timings: ReplyTimings }
  | { readonly status: 'pending' | 'cold'; readonly requestId: string;
      readonly current: ContextStatus }
  | { readonly status: 'deadline-exceeded'; readonly requestId: string;
      readonly revision: ContextRevision | null; readonly elapsedMs: number }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | { readonly status: 'unavailable'; readonly requestId: string; readonly revision: ContextRevision | null;
      readonly reason: AffectedUnavailableReason | UnavailableReason; readonly message: string;
      readonly unknownModules: readonly string[] };
export interface ExplorerDetailsRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly revision: RevisionId;
  readonly requests: readonly SymbolDetailRequest[];
}
export type ContextExplorerDetailsOutcome =
  | { readonly status: 'ready'; readonly requestId: string;
      readonly revision: ContextRevision;
      readonly details: readonly SymbolDetail[] }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null }
  | { readonly status: 'unavailable'; readonly requestId: string;
      readonly reason: UnavailableReason | 'compiler-released'
        | 'invalid-current' | 'resource-limit' | 'analysis-failed';
      readonly message: string }
  | { readonly status: 'cancelled'; readonly requestId: string };
/** One on-demand dependency diagram at an exact published revision. */
export interface DependencyDiagramRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly revision: RevisionId;
}
export type ContextDependencyDiagramOutcome =
  | { readonly status: 'ready'; readonly requestId: string;
      readonly revision: ContextRevision;
      readonly diagram: DependencyDiagramFacts }
  | { readonly status: 'busy'; readonly requestId: string;
      readonly revision: ContextRevision;
      readonly reason: 'analysis-running' | 'inputs-changed' }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | { readonly status: 'unavailable'; readonly requestId: string;
      readonly reason: 'resource-unavailable' | 'invalid-current'
        | 'analysis-failed' | 'resource-limit';
      readonly message: string };
/** The dependency diagram answer whose ready variant also carries the test references of
 * the same analyzer run: null when only the references were refused or not retained. */
export type ContextDependencyFactsOutcome =
  | { readonly status: 'ready'; readonly requestId: string;
      readonly revision: ContextRevision;
      readonly diagram: DependencyDiagramFacts;
      readonly testReferences: TestReferenceFacts | null }
  | Exclude<ContextDependencyDiagramOutcome, { readonly status: 'ready' }>;
/** The frozen symbol-detail and area/invocation byte bounds `ContextManager.apiView`
 * passes to `RetainedSession.apiView`, and those it passes to `architectView`; not
 * part of `ApiViewRequest` since a caller
 * cannot loosen them per request. `ContextManagerOptions.apiViewLimits` defaults to
 * the values contracts.md froze in iteration 1 when a caller supplies none, so a
 * controlled test may tune them without every production caller needing an edit. */
export interface ApiViewQueryLimits {
  readonly details: SymbolDetailLimits;
  readonly maxAreaBytes: number;
  readonly maxInvocationBytes: number;
  /** The `RetainedSession.architectView` bounds, which Plan 2B froze. */
  readonly architect: {
    readonly details: SymbolDetailLimits;
    readonly tests: TestTitleLimits;
    readonly maxProjectionBytes: number;
  };
}
export type OpenOutcome =
  | { readonly status: 'opened'; readonly token: ContextToken; readonly created: boolean;
      readonly current: ContextStatus }
  | { readonly status: 'unresolved';
      readonly resolution: Extract<ProjectResolution, { readonly status: 'invalid' | 'unavailable' }>;
      readonly report: AnalysisReport }
  | Unavailable;
export type ContextEvent =
  | { readonly type: 'revision-published'; readonly token: ContextToken;
      readonly revision: ContextRevision; readonly coalesced: number }
  | { readonly type: 'status-changed'; readonly token: ContextToken; readonly current: ContextStatus;
      readonly coalesced: number }
  | { readonly type: 'context-evicted'; readonly token: ContextToken;
      readonly reason: 'idle' | 'pressure' | 'disposed' };
export interface SubscriptionHandle {
  readonly id: string;
  readonly current: ContextStatus;
  close(): void;
}
export interface WatchEvent {
  readonly path: string;
  readonly kind: 'changed' | 'created' | 'deleted' | 'renamed' | 'overflow' | 'error';
}
/**
 * What a watcher must not register beneath: one revision's rooted exclusions and the
 * canonical reserved-path rules, both applied by Project's classifier. A watcher registers
 * no directory `excluded` names and nothing beneath one; it keeps watching the enclosing
 * directory, so an owned-ignored, external or scratch directory's own creation, removal
 * or replacement still reaches the listener.
 */
export interface WatchScope {
  /** The published revision sequence whose ownership table decides; null before the first
   * completed revision, when only the canonical reserved-path rules exclude. */
  readonly sequence: number | null;
  /** That table's rooted exclusions, byte-ordered; empty before it. */
  readonly exclusions: readonly ProjectExclusion[];
  /** The exclusion containing a canonical project-relative path, null when none does. */
  excluded(path: string): ProjectExclusion | null;
}
/** A watcher's current registrations, which the context status reports. */
export interface WatchRegistrations {
  /** The `WatchScope.sequence` the registrations follow. */
  readonly sequence: number | null;
  /** Registered directories, the root included. */
  readonly directories: number;
  /** Excluded directories found directly beneath registered ones and not registered,
   * project-relative and byte-ordered: at most 20, with their total in `prunedCount`. */
  readonly pruned: readonly string[];
  readonly prunedCount: number;
}
export interface WatcherHandle {
  /** Apply another revision's exclusions: registrations beneath a newly excluded directory
   * end, and the directories an exclusion no longer holds back are registered. Resolves with
   * the number of directories so registered: changes made there before their registration
   * reached no listener, so a positive number requires the caller to recapture conservatively. */
  reconfigure(scope: WatchScope): Promise<number>;
  registrations(): WatchRegistrations;
  close(): Promise<void>;
}
export interface WatcherPort {
  /** A listener without `batch` receives its times from the context clock on delivery. */
  watch(root: string, scope: WatchScope, listener: (events: readonly WatchEvent[], batch?: WatchBatch) => void): Promise<WatcherHandle>;
}
export interface ClockPort {
  now(): number;
  schedule(delayMs: number, run: () => void): () => void;
}
export interface ContextBudgets {
  readonly maxContexts: number;
  readonly maxHistoryRevisions: number;
  readonly maxHistoryBytes: number;
  readonly maxRetainedBytesPerContext: number;
  readonly maxRetainedBytesGlobal: number;
  readonly maxQueuedPaths: number;
  readonly maxConcurrentAnalyses: number;
  readonly warmIdleMs: number;
  readonly coldRetainMs: number;
  readonly debounceMs: number;
  readonly maxHotContexts: number;
  readonly sweepIntervalMs: number;
  readonly updateDeadlineMs: number;
  /** How long a demotion waits for the session to release its compiler before
   * the context is evicted under pressure; the session disposal timeout. */
  readonly demoteDeadlineMs: number;
}
export interface AnalysisDriver {
  /** `known` holds earlier resolutions of an equal request, most recent first. A driver
   * returns one of them unchanged, as the same object, only while every discovery query
   * it made still answers the same; otherwise it resolves again. */
  resolve(request: ProjectRequest, control?: RunControl, known?: readonly ProjectResolution[]): Promise<ProjectResolution>;
  open(project: ProjectRequest, setup: ContextSetup, control?: RunControl): Promise<SessionOpen>;
  /** Project's path classifier over one revision's ownership table: reads nothing and
   * checks no existence. Contexts classify changed-check paths only through it. */
  classify(scope: ProjectScope, path: string): PathOwnership;
  dispose(): Promise<void>;
}
export interface ContextManagerOptions {
  readonly driver: AnalysisDriver;
  readonly watcher: WatcherPort;
  readonly clock: ClockPort;
  readonly budgets: ContextBudgets;
  readonly engine: string;
  readonly generationId: () => GenerationId;
  /** Frozen `RetainedSession.apiView` bounds; defaults to contracts.md's iteration-1
   * frozen values when omitted. */
  readonly apiViewLimits?: ApiViewQueryLimits;
  /** The injected dependency analyzer runner; without one, `dependencyDiagram`
   * answers `unavailable/resource-unavailable` and starts no work. */
  readonly dependencyDiagrams?: DependencyDiagramRunner;
}
export interface ContextManager {
  open(request: ProjectRequest, setup: ContextSetup, lease: LeaseId, control?: RunControl): Promise<OpenOutcome>;
  status(token: ContextToken): ContextStatus | Unavailable;
  list(): readonly ContextStatus[];
  check(request: CheckRequest, lease: LeaseId, control?: RunControl): Promise<CheckOutcome>;
  /** Reuses `check`'s scheduler, expected-content rendezvous, generation, lease,
   * deadline and cancellation rules: the request joins the same per-context queue
   * as revision publication, is answered from exactly one current revision, and
   * the session query runs while that revision's slot is held, its ephemeral
   * projection released once this call returns. */
  apiView(request: ApiViewRequest, lease: LeaseId, control?: RunControl): Promise<ContextApiViewOutcome>;
  /** Reuses `apiView`'s scheduler, rendezvous, lease, deadline and cancellation rules for
   * synchronized freshness. Published freshness answers from the published revision
   * when the live session still holds it; otherwise `wait` false answers `pending`, or
   * `cold` for a cold context, and `wait` true joins the next publication. The session
   * query runs at that revision's sequence while its slot is held, and an answer naming
   * another sequence is `superseded`, never relabeled. */
  affected(request: AffectedRequest, lease: LeaseId, control?: RunControl): Promise<ContextAffectedOutcome>;
  explorerDetails(request: ExplorerDetailsRequest, lease: LeaseId,
    control?: RunControl): Promise<ContextExplorerDetailsOutcome>;
  /** Answers in C4's order: superseded, invalid-current, ready from the retained
   * result, join the running job, busy while another job runs, otherwise start one.
   * A job never enters the context queue or the retained session. An unknown
   * context, an earlier generation or disposal answers as `Unavailable`. */
  dependencyDiagram(request: DependencyDiagramRequest, lease: LeaseId,
    control?: RunControl): Promise<ContextDependencyDiagramOutcome | (Unavailable & { readonly requestId: string })>;
  /** `dependencyDiagram` through the same jobs, retained result and order, whose ready
   * answer adds the test references retained with the diagram: the architect view's facts. */
  dependencyFacts(request: DependencyDiagramRequest, lease: LeaseId,
    control?: RunControl): Promise<ContextDependencyFactsOutcome | (Unavailable & { readonly requestId: string })>;
  subscribe(token: ContextToken, lease: LeaseId,
    listener: (event: ContextEvent) => void): SubscriptionHandle | Unavailable;
  release(lease: LeaseId): void;
  dispose(): Promise<void>;
}
