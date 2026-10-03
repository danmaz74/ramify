import type { RunControl } from '../../subs/analysis/src/interfaces/analysis.js';
import type { ProjectRequest } from '../../subs/analysis/subs/project/src/interfaces/project.js';
import type { ApiViewSelection } from '../../subs/analysis/src/interfaces/session.js';
import type { ArchitectDependencyReason } from '../../subs/analysis/src/interfaces/architect-view.js';
import type { MeasurementFileRecord, MeasurementViews, ModuleMeasurement } from '../../subs/analysis/src/interfaces/measurements.js';
import type { MaterializedTarget } from '../../subs/daemon/src/interfaces/daemon.js';
import type { ContextToken, ContextSetup, ContextStatus, ContextBudgets, CheckOutcome, Freshness, RevisionId,
  ContextRevision, FreshnessRecord, UnavailableReason, ReplyTimings,
  OpenOutcome, ContextEvent, ExplorerDetailsRequest, ContextExplorerDetailsOutcome,
  DependencyDiagramRequest, ContextDependencyDiagramOutcome, AffectedRequest, ContextAffectedOutcome } from '../../subs/daemon/src/context-types.js';

export type ServiceOperation = 'openContext' | 'contextStatus' | 'check' | 'subscribe'
  | 'unsubscribe' | 'closeContext' | 'daemonStatus' | 'stopDaemon' | 'materialize' | 'measure' | 'explorerDetails' | 'dependencyDiagram'
  | 'affected';
export type ServiceCapability = 'contexts' | 'check' | 'subscribe' | 'daemon-control' | 'materialize' | 'explorerDetails'
  | 'dependencyDiagram' | 'measure' | 'affected'
  /** `materialize` accepts `views`. */
  | 'materialize-views';
export type ServiceErrorCode = 'invalid-request' | 'unsupported-operation'
  | 'unknown-context' | 'expired-generation' | 'resource-unavailable'
  | 'unknown-subscription' | 'wrong-instance' | 'stopping' | 'cancelled' | 'internal-error' | 'incompatible';
export interface ServiceError {
  readonly code: ServiceErrorCode;
  readonly message: string;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}
export type ServiceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ServiceError };
export interface OpenContextParams { readonly project: ProjectRequest; readonly setup: ContextSetup }
export interface ContextParams { readonly token: ContextToken }
export interface CheckParams {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Freshness;
  readonly scope?: 'report' | 'delta';
  readonly since?: RevisionId;
  readonly deadlineMs?: number;
}
export interface SubscriptionOpened {
  readonly subscription: string;
  readonly current: ContextStatus;
  readonly replay: 'not-available';
}
export interface UnsubscribeParams { readonly subscription: string }
export interface DaemonCounters {
  readonly sweeps: number;
  readonly audits: number;
  readonly auditMismatches: number;
  readonly coveredRequests: number;
  readonly coldOutcomes: number;
  readonly deadlineOutcomes: number;
  readonly revisions: number;
  readonly analyses: number;
  readonly cancelledAnalyses: number;
  readonly reusedRevisions: number;
  readonly coalescedEvents: number;
  readonly evictions: number;
  readonly rejectedRequests: number;
  readonly disconnectedSlowConsumers: number;
  /** Classifier runs the dependency analyzer reported for ready diagrams. */
  readonly behaviorRuns: number;
  /** Dependency analyzer jobs the daemon started. */
  readonly dependencyDiagrams: number;
  /** Dependency analyzer jobs that ended because the project's inputs differed from the published revision. */
  readonly dependencyDiagramInputChanges: number;
}
export interface DaemonStatus {
  readonly instanceId: string;
  readonly pid: number;
  readonly version: string;
  readonly engine: string;
  readonly buildKey: string;
  readonly protocol: 'ramify.ipc/2';
  readonly startedAt: number;
  readonly state: 'running' | 'stopping';
  readonly connections: number;
  readonly subscriptions: number;
  readonly contexts: readonly ContextStatus[];
  readonly budgets: ContextBudgets;
  readonly counters: DaemonCounters;
  readonly memory: { readonly rss: number; readonly heapUsed: number; readonly external: number };
}
export interface StopParams { readonly instanceId: string }
export interface StopAcknowledged { readonly instanceId: string; readonly stopping: true }
/** A generated view `materialize` can publish. */
export type MaterializeViewId = 'api' | 'architect';
/** One serialized, synchronized materialize request: joins iteration 7's
 * revision-bound projection query to iteration 6's transactional filesystem
 * publication. Always synchronized freshness; never falls back to batch. */
export interface MaterializeParams {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Extract<Freshness, { readonly mode: 'synchronized' }>;
  /** Selects the API view's modules; ignored when `views` omits `api`. */
  readonly selection: ApiViewSelection;
  readonly deadlineMs?: number;
  /** Distinct views to publish in one transaction; absent means `['api']`. Requires `materialize-views`. */
  readonly views?: readonly MaterializeViewId[];
}
/** The published architect view, reported when `views` names it. */
export interface MaterializedArchitectSummary {
  readonly modules: number;
  readonly records: number;
  readonly dependencies: 'measured' | { readonly unavailable: ArchitectDependencyReason };
}
export type MaterializeOutcome =
  | { readonly status: 'materialized'; readonly requestId: string;
      readonly revision: ContextRevision; readonly freshness: FreshnessRecord;
      readonly targets: readonly MaterializedTarget[];
      readonly bytesWritten: number; readonly timings?: ReplyTimings;
      readonly architect?: MaterializedArchitectSummary }
  | { readonly status: 'pending' | 'cold'; readonly requestId: string;
      readonly current: ContextStatus }
  | { readonly status: 'deadline-exceeded'; readonly requestId: string;
      readonly revision: ContextRevision | null; readonly elapsedMs: number }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | { readonly status: 'unavailable'; readonly requestId: string;
      readonly reason: UnavailableReason | 'invalid-location' | 'invalid-projection'
        | 'symlink' | 'output-failure' | 'rollback-failure';
      readonly message: string };
/** One synchronized, read-only whole-project measurement request. */
export interface MeasureParams {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Extract<Freshness, { readonly mode: 'synchronized' }>;
  readonly deadlineMs?: number;
}
/** The deterministic machine document returned by a successful measurement. */
export interface MeasureDocument {
  readonly schema: 'ramify.measure/1';
  readonly revision: RevisionId;
  readonly root: string;
  readonly ownershipRule: string;
  readonly views: MeasurementViews;
  readonly modules: readonly ModuleMeasurement[];
  readonly files: readonly MeasurementFileRecord[];
  readonly outsideModuleFiles: readonly string[];
}
export type MeasureOutcome =
  | { readonly status: 'measured'; readonly requestId: string;
      readonly freshness: FreshnessRecord; readonly document: MeasureDocument }
  | { readonly status: 'pending' | 'cold'; readonly requestId: string;
      readonly current: ContextStatus }
  | { readonly status: 'deadline-exceeded'; readonly requestId: string;
      readonly revision: ContextRevision | null; readonly elapsedMs: number }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | { readonly status: 'unavailable'; readonly requestId: string;
      readonly reason: UnavailableReason; readonly message: string };
/** One read-only affected-module query against the covering revision. */
export type AffectedParams = AffectedRequest;
/** The selection from one revision's retained facts, or an explicit reason there is none. */
export type AffectedOutcome = ContextAffectedOutcome;
export interface RamifyService {
  openContext(params: OpenContextParams, control?: RunControl): Promise<ServiceResult<OpenOutcome>>;
  contextStatus(params: ContextParams): Promise<ServiceResult<ContextStatus>>;
  check(params: CheckParams, control?: RunControl): Promise<ServiceResult<CheckOutcome>>;
  explorerDetails(params: ExplorerDetailsRequest,
    control?: RunControl): Promise<ServiceResult<ContextExplorerDetailsOutcome>>;
  dependencyDiagram(params: DependencyDiagramRequest, control?: RunControl):
    Promise<ServiceResult<ContextDependencyDiagramOutcome>>;
  subscribe(params: ContextParams, listener: (event: ContextEvent) => void): Promise<ServiceResult<SubscriptionOpened>>;
  unsubscribe(params: UnsubscribeParams): Promise<ServiceResult<null>>;
  closeContext(params: ContextParams): Promise<ServiceResult<null>>;
  daemonStatus(): Promise<ServiceResult<DaemonStatus>>;
  stopDaemon(params: StopParams): Promise<ServiceResult<StopAcknowledged>>;
  materialize(params: MaterializeParams, control?: RunControl): Promise<ServiceResult<MaterializeOutcome>>;
  measure(params: MeasureParams, control?: RunControl): Promise<ServiceResult<MeasureOutcome>>;
  affected(params: AffectedParams, control?: RunControl): Promise<ServiceResult<AffectedOutcome>>;
}
