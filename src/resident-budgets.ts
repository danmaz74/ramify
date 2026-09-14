import { reportCapacity } from './report-capacity.js';
import type { ContextBudgets } from '../subs/daemon/src/context-types.js';
import type { DaemonBudgets } from '../subs/daemon/src/interfaces/daemon.js';
import type { SessionLimits } from '../subs/analysis/src/interfaces/session.js';

/** Fixed dispatch defaults from the Plan 2 scope; test overrides are explicit. */
export const contextBudgets: ContextBudgets = Object.freeze({
  maxContexts: 8, maxHistoryRevisions: 8, maxHistoryBytes: reportCapacity.historyBytes,
  maxRetainedBytesPerContext: 96 * 1024 ** 2, maxRetainedBytesGlobal: 512 * 1024 ** 2,
  maxQueuedPaths: 10_000, maxConcurrentAnalyses: 1, warmIdleMs: 600_000,
  coldRetainMs: 1_800_000, debounceMs: 100, maxHotContexts: 2,
  sweepIntervalMs: 30_000, updateDeadlineMs: 2_000, demoteDeadlineMs: 5_000,
});

/** Session capacities extend the existing resident dispatch limits. */
export const sessionLimits: SessionLimits = Object.freeze({
  updateDeadlineMs: contextBudgets.updateDeadlineMs, sweepIntervalMs: contextBudgets.sweepIntervalMs,
  workerHeapMiB: 512, maxRetainedFactBytes: contextBudgets.maxRetainedBytesPerContext,
});

export const daemonBudgets: DaemonBudgets = Object.freeze({
  maxConnections: 64, maxRequestBytes: 1024 ** 2, maxResponseBytes: reportCapacity.responseBytes,
  maxOutboundBytes: reportCapacity.outboundBytes, maxOutboundFrames: 256, maxRequestsInFlight: 16,
  leaseMs: 45_000, pingMs: 15_000, idleExitMs: 1_800_000, shutdownGraceMs: 5_000,
});
