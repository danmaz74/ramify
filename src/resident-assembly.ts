import { reportCapacity } from './report-capacity.js';
import { analyzeIncrement, resolveProject } from '../subs/analysis/src/index.js';
import type { AnalysisLimits, RunControl } from '../subs/analysis/src/interfaces/analysis.js';
import { createDefaultTagRegistry } from '../subs/analysis/subs/model/src/registry.js';
import type { AnalysisDriver, WatcherPort, ClockPort, ContextBudgets } from '../subs/daemon/src/context-types.js';
import type { DaemonInstance, LogEntry, DaemonService } from '../subs/daemon/src/interfaces/daemon.js';
import { createDaemonService } from '../subs/daemon/src/service.js';

export interface ResidentAssemblyOptions {
  readonly watcher: WatcherPort;
  readonly clock: ClockPort;
  readonly budgets: ContextBudgets;
  readonly instance: DaemonInstance;
  readonly log: (entry: LogEntry) => void;
}

// Preserve the batch dispatch limits; equality is exercised at the public flow.
const limits: AnalysisLimits = {
  acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
    maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2,
    maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
  source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000,
    maxForwardingDepth: 256, deadlineMs: 90_000 },
  maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: reportCapacity.reportBytes,
  disposeTimeoutMs: 5000, deadlineMs: 120_000,
};

/** Session lifetime stays inside analysis; only detached products leave it. */
export function createAnalysisDriverFromSessions(): AnalysisDriver {
  let disposed = false;
  const active = new Map<AbortController, Promise<unknown>>();
  async function tracked<T>(control: RunControl | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort(control?.signal?.reason);
    control?.signal?.addEventListener('abort', abort, { once: true });
    if (control?.signal?.aborted) abort();
    // Defer invocation until it is tracked, including providers which throw synchronously.
    const promise = Promise.resolve().then(() => operation(controller.signal));
    active.set(controller, promise);
    try { return await promise; }
    finally { active.delete(controller); control?.signal?.removeEventListener('abort', abort); }
  }
  return {
    async resolve(request, control) {
      if (disposed) throw new Error('Analysis driver is disposed');
      control?.signal?.throwIfAborted();
      return tracked(control, signal => resolveProject(request, { signal }));
    },
    async check(input, control) {
      if (disposed || control?.signal?.aborted) return { status: 'cancelled' };
      return tracked(control, signal => analyzeIncrement({ inputs: { project: input.project,
        registry: createDefaultTagRegistry(), capabilities: input.setup.capabilities, limits },
      previous: input.previous, changes: input.changes }, { signal }));
    },
    async dispose() {
      disposed = true;
      for (const controller of active.keys()) controller.abort();
      await Promise.allSettled(active.values());
    },
  };
}

export function assembleResidentService(options: ResidentAssemblyOptions): DaemonService {
  return createDaemonService({ ...options, driver: createAnalysisDriverFromSessions() });
}
