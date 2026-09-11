import type { RunControl } from '../../subs/analysis/src/interfaces/analysis.js';
import type { ProjectRequest } from '../../subs/analysis/subs/project/src/interfaces/project.js';
import type { ContextToken, ContextSetup, ContextStatus, ContextBudgets, CheckOutcome, Freshness,
  OpenOutcome, ContextEvent } from '../../subs/daemon/src/context-types.js';

export type ServiceOperation = 'openContext' | 'contextStatus' | 'check' | 'subscribe'
  | 'unsubscribe' | 'closeContext' | 'daemonStatus' | 'stopDaemon';
export type ServiceCapability = 'contexts' | 'check' | 'subscribe' | 'daemon-control';
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
}
export interface SubscriptionOpened {
  readonly subscription: string;
  readonly current: ContextStatus;
  readonly replay: 'not-available';
}
export interface UnsubscribeParams { readonly subscription: string }
export interface DaemonCounters {
  readonly revisions: number;
  readonly analyses: number;
  readonly cancelledAnalyses: number;
  readonly reusedRevisions: number;
  readonly coalescedEvents: number;
  readonly evictions: number;
  readonly rejectedRequests: number;
  readonly disconnectedSlowConsumers: number;
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
export interface RamifyService {
  openContext(params: OpenContextParams, control?: RunControl): Promise<ServiceResult<OpenOutcome>>;
  contextStatus(params: ContextParams): Promise<ServiceResult<ContextStatus>>;
  check(params: CheckParams, control?: RunControl): Promise<ServiceResult<CheckOutcome>>;
  subscribe(params: ContextParams, listener: (event: ContextEvent) => void): Promise<ServiceResult<SubscriptionOpened>>;
  unsubscribe(params: UnsubscribeParams): Promise<ServiceResult<null>>;
  closeContext(params: ContextParams): Promise<ServiceResult<null>>;
  daemonStatus(): Promise<ServiceResult<DaemonStatus>>;
  stopDaemon(params: StopParams): Promise<ServiceResult<StopAcknowledged>>;
}
