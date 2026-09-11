import type { RamifyService, ServiceOperation, ServiceCapability, ServiceResult, ServiceError, ServiceErrorCode } from '../../../../src/interfaces/service.js';
import type { AnalysisDriver, WatcherPort, ClockPort, ContextBudgets, ContextEvent } from '../../subs/contexts/src/interfaces/contexts.js';

export interface DaemonInstance {
  readonly instanceId: string;
  readonly pid: number;
  readonly version: string;
  readonly engine: string;
  readonly buildKey: string;
}
export interface LogEntry {
  readonly at: number;
  readonly level: 'info' | 'warn' | 'error';
  readonly event: string;
  readonly context?: string;
  readonly generation?: string;
  readonly request?: string;
  readonly revision?: string;
  readonly message: string;
}
export interface DaemonServiceOptions {
  readonly driver: AnalysisDriver;
  readonly watcher: WatcherPort;
  readonly clock: ClockPort;
  readonly budgets: ContextBudgets;
  readonly instance: DaemonInstance;
  readonly log: (entry: LogEntry) => void;
}
export interface ServiceLease {
  readonly id: string;
  readonly service: RamifyService;
  release(): void;
}
export interface DaemonService extends RamifyService {
  readonly instance: DaemonInstance;
  lease(client: string): ServiceLease;
  onStop(listener: (disposition: StopDisposition) => void): () => void;
  dispose(): Promise<void>;
}
export interface DaemonBudgets {
  readonly maxConnections: number;
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  readonly maxOutboundBytes: number;
  readonly maxOutboundFrames: number;
  readonly maxRequestsInFlight: number;
  readonly leaseMs: number;
  readonly pingMs: number;
  readonly idleExitMs: number;
  readonly shutdownGraceMs: number;
}
export interface EndpointSelection {
  readonly directory: string;
  readonly buildKey: string;
  readonly socket: string;
  readonly record: string;
  readonly lock: string;
  readonly log: string;
}
export interface DaemonRecord {
  readonly schemaVersion: 'ramify.daemon-record/1';
  readonly instanceId: string;
  readonly pid: number;
  readonly buildKey: string;
  readonly version: string;
  readonly engine: string;
  readonly protocol: 'ramify.ipc/1';
  readonly socket: string;
  readonly startedAt: number;
  readonly state: 'starting' | 'running' | 'stopped';
  readonly stopped: StopDisposition | null;
}
export interface StopDisposition {
  readonly at: number;
  readonly reason: 'idle' | 'explicit' | 'retired' | 'failed'; // 'retired' reserved: no Plan 2 operation produces it
  readonly requestId: string | null;
}
export interface Handshake {
  readonly protocol: 'ramify.ipc/1';
  readonly client: { readonly name: string; readonly version: string };
  readonly buildKey: string;
  readonly engine: string;
}
export interface Welcome {
  readonly protocol: 'ramify.ipc/1';
  readonly instance: DaemonInstance;
  readonly capabilities: readonly ServiceCapability[];
  readonly limits: { readonly maxRequestBytes: number; readonly maxResponseBytes: number;
    readonly leaseMs: number; readonly pingMs: number };
}
export interface ConnectTimeouts {
  readonly handshakeMs: number;
  readonly startupMs: number;
  readonly startAttempts: number;
  readonly reconnectAttempts: number;
  readonly reconnectBackoffMs: readonly number[];
  readonly restartAttempts: number;
  readonly totalRecoveryMs: number;
}
export interface ConnectOptions {
  readonly signal?: AbortSignal;
  readonly client: { readonly name: string; readonly version: string };
  readonly engine: string;
  readonly start: 'if-needed' | 'never';
  readonly daemonEntry: string | null;
  readonly endpointDirectory?: string;
  readonly timeouts?: Partial<ConnectTimeouts>;
  readonly onState?: (state: ConnectionState, reason: DisconnectReason | null) => void;
}
export type ConnectionState = 'connected' | 'reconnecting' | 'restarting' | 'stopped'
  | 'unavailable' | 'closed';
export type DisconnectReason =
  | { readonly kind: 'idle-exit' }
  | { readonly kind: 'explicit-stop'; readonly requestId: string | null }
  | { readonly kind: 'failure'; readonly message: string }
  | { readonly kind: 'slow-consumer' }
  | { readonly kind: 'incompatible'; readonly daemon: string; readonly client: string }
  | { readonly kind: 'rejected'; readonly code: ServiceErrorCode; readonly message: string }
  | { readonly kind: 'closed' };
export type RecoveryOutcome =
  | { readonly status: 'recovered'; readonly instance: DaemonInstance; readonly restarted: boolean }
  | { readonly status: 'stopped'; readonly record: DaemonRecord }
  | { readonly status: 'unavailable'; readonly attempts: number; readonly reason: DisconnectReason };
export interface ServiceConnection extends RamifyService {
  readonly state: ConnectionState;
  readonly daemon: Welcome;
  readonly reason: DisconnectReason | null;
  recover(authorization: 'automatic' | 'explicit'): Promise<RecoveryOutcome>;
  close(): Promise<void>;
}
export type ConnectOutcome =
  | { readonly status: 'connected'; readonly connection: ServiceConnection; readonly started: boolean }
  | { readonly status: 'stopped'; readonly record: DaemonRecord }
  | { readonly status: 'not-running' }
  | { readonly status: 'unavailable'; readonly reason: DisconnectReason; readonly attempts: number;
      readonly message: string };
export type ServiceConnector = (options: { readonly start: 'if-needed' | 'never';
  readonly signal?: AbortSignal }) => Promise<ConnectOutcome>;
export interface StartDaemonOptions {
  readonly service: DaemonService;
  readonly endpoint: EndpointSelection;
  readonly budgets: DaemonBudgets;
  readonly clock: ClockPort;
  readonly log: (entry: LogEntry) => void;
}
export interface DaemonHost {
  readonly record: DaemonRecord;
  stop(reason: 'explicit', requestId: string | null): Promise<StopDisposition>;
  readonly stopped: Promise<StopDisposition>;
}
export type StartDaemonOutcome =
  | { readonly status: 'started'; readonly host: DaemonHost }
  | { readonly status: 'already-running'; readonly record: DaemonRecord }
  | { readonly status: 'failed'; readonly message: string };

export type WireMessage =
  | { readonly type: 'hello'; readonly handshake: Handshake }
  | { readonly type: 'welcome'; readonly welcome: Welcome }
  | { readonly type: 'reject'; readonly error: ServiceError; readonly daemon: DaemonInstance }
  | { readonly type: 'request'; readonly id: string; readonly op: string;
      readonly params: unknown }
  | { readonly type: 'cancel'; readonly id: string }
  | { readonly type: 'response'; readonly id: string; readonly result: ServiceResult<unknown> }
  | { readonly type: 'event'; readonly seq: number; readonly subscription: string;
      readonly event: ContextEvent }
  | { readonly type: 'ping' }
  | { readonly type: 'pong' }
  | { readonly type: 'goodbye'; readonly reason: DisconnectReason };
