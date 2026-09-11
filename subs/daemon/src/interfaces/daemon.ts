import type { ServiceErrorCode } from '../../../../src/interfaces/service.js';

// Independent lifecycle vocabulary from Plan 2. Service and connection types
// follow when the real context manager and root service contract are available.
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
  readonly reason: 'idle' | 'explicit' | 'retired' | 'failed'; // retired has no Plan 2 writer
  readonly requestId: string | null;
}
export interface Handshake {
  readonly protocol: 'ramify.ipc/1';
  readonly client: { readonly name: string; readonly version: string };
  readonly buildKey: string;
  readonly engine: string;
}
export type ConnectionState = 'connected' | 'reconnecting' | 'restarting' | 'stopped'
  | 'unavailable' | 'closed';

export interface EndpointSelection {
  readonly directory: string;
  readonly buildKey: string;
  readonly socket: string;
  readonly record: string;
  readonly lock: string;
  readonly log: string;
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
export type DisconnectReason =
  | { readonly kind: 'idle-exit' }
  | { readonly kind: 'explicit-stop'; readonly requestId: string | null }
  | { readonly kind: 'failure'; readonly message: string }
  | { readonly kind: 'slow-consumer' }
  | { readonly kind: 'incompatible'; readonly daemon: string; readonly client: string }
  | { readonly kind: 'rejected'; readonly code: ServiceErrorCode; readonly message: string }
  | { readonly kind: 'closed' };
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
