import type { RunControl } from '../../subs/analysis/src/interfaces/analysis.js';
import type { ProjectRequest } from '../../subs/analysis/subs/project/src/interfaces/project.js';
import type { ApiViewSelection } from '../../subs/analysis/src/interfaces/session.js';
import type { MaterializedTarget } from '../../subs/daemon/src/interfaces/daemon.js';
import type { ContextToken, ContextSetup, ContextStatus, ContextBudgets, CheckOutcome, Freshness, RevisionId,
  ContextRevision, FreshnessRecord, UnavailableReason, ReplyTimings,
  OpenOutcome, ContextEvent, ExplorerDetailsRequest, ContextExplorerDetailsOutcome,
  DependencyDiagramRequest, ContextDependencyDiagramOutcome } from '../../subs/daemon/src/context-types.js';

export type ServiceOperation = 'openContext' | 'contextStatus' | 'check' | 'subscribe'
  | 'unsubscribe' | 'closeContext' | 'daemonStatus' | 'stopDaemon' | 'materialize' | 'explorerDetails' | 'dependencyDiagram';
export type ServiceCapability = 'contexts' | 'check' | 'subscribe' | 'daemon-control' | 'materialize' | 'explorerDetails'
  | 'dependencyDiagram';
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
  readonly protocol: 'ramify.ipc/1';
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
/** One serialized, synchronized materialize request: joins iteration 7's
 * revision-bound projection query to iteration 6's transactional filesystem
 * publication. Always synchronized freshness; never falls back to batch. */
export interface MaterializeParams {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Extract<Freshness, { readonly mode: 'synchronized' }>;
  readonly selection: ApiViewSelection;
  readonly deadlineMs?: number;
}
export type MaterializeOutcome =
  | { readonly status: 'materialized'; readonly requestId: string;
      readonly revision: ContextRevision; readonly freshness: FreshnessRecord;
      readonly targets: readonly MaterializedTarget[];
      readonly bytesWritten: number; readonly timings?: ReplyTimings }
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
}
