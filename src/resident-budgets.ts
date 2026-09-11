import { reportCapacity } from './report-capacity.js';
import type { ContextBudgets } from '../subs/daemon/src/context-types.js';
import type { DaemonBudgets } from '../subs/daemon/src/interfaces/daemon.js';

/** Fixed dispatch defaults from the Plan 2 scope; test overrides are explicit. */
export const contextBudgets: ContextBudgets = Object.freeze({
  maxContexts: 8, maxHistoryRevisions: 8, maxHistoryBytes: reportCapacity.historyBytes,
  maxRetainedBytesPerContext: 96 * 1024 ** 2, maxRetainedBytesGlobal: 512 * 1024 ** 2,
  maxQueuedPaths: 10_000, maxConcurrentAnalyses: 1, warmIdleMs: 600_000,
  coldRetainMs: 1_800_000, debounceMs: 100, verificationIntervalMs: 60_000,
});

export const daemonBudgets: DaemonBudgets = Object.freeze({
  maxConnections: 64, maxRequestBytes: 1024 ** 2, maxResponseBytes: reportCapacity.responseBytes,
  maxOutboundBytes: reportCapacity.outboundBytes, maxOutboundFrames: 256, maxRequestsInFlight: 16,
  leaseMs: 45_000, pingMs: 15_000, idleExitMs: 1_800_000, shutdownGraceMs: 5_000,
});
