import { reportCapacity } from './report-capacity.js';
import { sessionLimits } from './resident-budgets.js';
import { fileURLToPath } from 'node:url';
// Direct owner files, not the analysis package entry: the daemon process never loads the dependency analyzer.
import { openRetainedSession } from '../subs/analysis/src/retained-session.js';
import { resolveProject } from '../subs/analysis/src/resolve-project.js';
import type { DependencyDiagramRunner } from '../subs/analysis/src/interfaces/dependency-analyzer.js';
import { createProcessDependencyAnalyzer } from './dependency-analyzer-process.js';
import type { AnalysisLimits, RunControl } from '../subs/analysis/src/interfaces/analysis.js';
import type { RetainedSession, SessionLimits } from '../subs/analysis/src/interfaces/session.js';
import { createDefaultTagRegistry } from '../subs/analysis/subs/model/src/registry.js';
import type { AnalysisDriver, WatcherPort, ClockPort, ContextBudgets } from '../subs/daemon/src/context-types.js';
import type { ApiViewPublisher, DaemonInstance, LogEntry, DaemonService } from '../subs/daemon/src/interfaces/daemon.js';
import { createDaemonService } from '../subs/daemon/src/service.js';
import { createFilesystemApiViewPublisher } from '../subs/daemon/src/api-view-publisher.js';

export interface ResidentAssemblyOptions {
  readonly watcher: WatcherPort;
  readonly clock: ClockPort;
  readonly budgets: ContextBudgets;
  readonly instance: DaemonInstance;
  readonly log: (entry: LogEntry) => void;
  /** Injected transactional filesystem publisher for `materialize`; defaults to
   * `createFilesystemApiViewPublisher` at contracts.md's frozen iteration-1
   * limits. Tests inject a controlled publisher. */
  readonly publisher?: ApiViewPublisher;
  /** Injected dependency diagram runner; defaults to one analyzer process per job running the built
   * `dependency-analyzer-entry.js` with this Node runtime. */
  readonly dependencyDiagrams?: DependencyDiagramRunner;
}

/** The built analyzer entry beside this module; source runs use the package's built entry. */
export const dependencyAnalyzerEntry = fileURLToPath(new URL(import.meta.url.endsWith('.ts')
  ? '../dist/src/dependency-analyzer-entry.js' : './dependency-analyzer-entry.js', import.meta.url));

// Frozen (iteration 1): see contracts.md's "Renderer and publisher" section.
const publishLimits = { maxAreaBytes: 32 * 1024 ** 2, maxInvocationBytes: 256 * 1024 ** 2, maxStagedBytes: 256 * 1024 ** 2 };

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

/** Contexts hold the handles; driver disposal closes any remaining sessions. */
export function createSessionDriver(): AnalysisDriver {
  return sessionDriver(sessionLimits);
}

function sessionDriver(capacity: SessionLimits): AnalysisDriver {
  let disposed = false;
  let disposal: Promise<void> | undefined;
  const active = new Map<AbortController, Promise<unknown>>();
  const sessions = new Set<RetainedSession>();
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
  function ownedSession(session: RetainedSession): RetainedSession {
    let closing: Promise<void> | undefined;
    const handle: RetainedSession = Object.freeze({
      get current() { return session.current; },
      update: session.update.bind(session), sweep: session.sweep.bind(session),
      verify: session.verify.bind(session), report: session.report.bind(session),
      releaseRevision: session.releaseRevision.bind(session), status: session.status.bind(session),
      releaseCompiler: session.releaseCompiler.bind(session), apiView: session.apiView.bind(session),
      explorerDetails: session.explorerDetails.bind(session),
      dispose() {
        closing ??= Promise.resolve().then(() => session.dispose()).then(() => { sessions.delete(handle); });
        return closing;
      },
    });
    sessions.add(handle);
    return handle;
  }
  return {
    async resolve(request, control, known) {
      if (disposed) throw new Error('Analysis driver is disposed');
      control?.signal?.throwIfAborted();
      return tracked(control, signal => resolveProject(request, { signal }, known));
    },
    async open(project, setup, control) {
      if (disposed || control?.signal?.aborted) return { status: 'cancelled' };
      return tracked(control, async signal => {
        const opened = await openRetainedSession({ project, registry: createDefaultTagRegistry(),
          capabilities: setup.capabilities, limits, session: capacity }, { signal });
        if (opened.status !== 'opened') return opened;
        const session = ownedSession(opened.session);
        if (disposed || signal.aborted) {
          await session.dispose();
          return { status: 'cancelled' as const };
        }
        return { ...opened, session };
      });
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      for (const controller of active.keys()) controller.abort();
      disposal = Promise.resolve().then(async () => {
        await Promise.allSettled(active.values());
        const closed = await Promise.allSettled([...sessions].map(session => session.dispose()));
        const failures = closed.filter(result => result.status === 'rejected');
        if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Analysis session cleanup failed');
      });
      return disposal;
    },
  };
}

export function assembleResidentService(options: ResidentAssemblyOptions): DaemonService {
  return createDaemonService({ ...options, publisher: options.publisher ?? createFilesystemApiViewPublisher(publishLimits),
    dependencyDiagrams: options.dependencyDiagrams ?? createProcessDependencyAnalyzer(process.execPath, dependencyAnalyzerEntry),
    driver: sessionDriver({ ...sessionLimits,
      maxRetainedFactBytes: Math.min(sessionLimits.maxRetainedFactBytes, options.budgets.maxRetainedBytesPerContext),
      updateDeadlineMs: options.budgets.updateDeadlineMs, sweepIntervalMs: options.budgets.sweepIntervalMs,
    }) });
}
