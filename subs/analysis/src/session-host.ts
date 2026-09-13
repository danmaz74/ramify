import { SessionWorker as Worker } from './session-supervisor.js';
import type { AnalysisInputs, AnalysisReport, RunControl } from './interfaces/analysis.js';
import type { OperationTimings, RetainedSession, SessionChange, SessionInputs, SessionOpen, SessionRevision, SessionStatus, SessionUpdate, VerifyOutcome } from './interfaces/session.js';
import type { SessionCommand, WorkerMessage, WorkerOpen, WorkerResult } from './session-messages.js';
import { timedResult } from './session-messages.js';
import { diagnostic } from './report-data.js';
import { ReportDraft } from './report.js';
import { deepFreeze } from './session-facts.js';
import { createRssSampler, releaseSessionChildren } from './session-processes.js';
import type { RssSampler, RssSampling } from './session-processes.js';

interface Pending {
  readonly operation: SessionCommand['operation'];
  /** When the request was posted, for the update's worker round trip. */
  readonly sent: number;
  readonly resolve: (value: WorkerResult) => void;
  readonly reject: (error: Error) => void;
  readonly cleanup: () => void;
}
type Failure = Error & { readonly code: 'resource-unavailable' | 'analysis-failed' | 'session-disposed' };
const failure = (code: Failure['code'], message: string): Failure => Object.assign(new Error(`${code}: ${message}`), { code });
const emptyStatus = (): SessionStatus => deepFreeze({ level: 'warm', sequence: 0, observedInputs: 0, factBytes: 0,
  worker: { heapUsed: 0, rss: 0 }, compiler: { pid: null, rss: null }, lastSweepAt: null });

function failureReport(inputs: SessionInputs, error: Failure | Error, invalid = false): AnalysisReport {
  const { session: _session, ...request } = inputs;
  const draft = new ReportDraft(request);
  const code = invalid ? 'invalid-invocation' : 'code' in error && error.code === 'resource-unavailable' ? 'resource-limit'
    : 'code' in error && error.code === 'session-disposed' ? 'session-disposed' : 'internal-error';
  const item = diagnostic(code, error.message, invalid ? 'invocation' : 'unavailable');
  draft.diagnostics.push(item); draft.stage('acquisition', 'unavailable', [item]); draft.execution = 'unavailable';
  return draft.finish();
}

/** Private host implementation; the public factory fixes its worker entry. */
class SessionHost implements RetainedSession {
  readonly #inputs: SessionInputs;
  readonly #worker: Worker;
  readonly #pending = new Map<number, Pending>();
  readonly #children = new Set<number>();
  readonly #exit: Promise<void>;
  readonly #rss: RssSampler;
  #messages: Promise<void> = Promise.resolve();
  #nextId = 0;
  #current: SessionRevision | null = null;
  #status = emptyStatus();
  #failed: Failure | null = null;
  #closing = false;
  #disposal: Promise<void> | null = null;
  #ready: Promise<void>;

  constructor(inputs: SessionInputs, entry: URL, sampling?: RssSampling) {
    this.#inputs = inputs;
    // A background compiler sample replaces only the status of the compiler it read.
    this.#rss = createRssSampler((pid, rss) => {
      if (this.#failed || this.#closing || this.#status.compiler.pid !== pid) return;
      this.#status = deepFreeze({ ...this.#status, compiler: { pid, rss } });
    }, sampling);
    const source = entry.pathname.endsWith('.ts');
    const loader = new URL('./session-source-loader.js', import.meta.url);
    if (source) loader.pathname = loader.pathname.replace(/\.js$/, '.ts');
    this.#worker = new Worker(entry, { workerData: inputs,
      execArgv: source ? ['--experimental-transform-types', '--import', loader.href] : [],
      resourceLimits: { maxOldGenerationSizeMb: inputs.session.workerHeapMiB, maxYoungGenerationSizeMb: 8 } });
    let ready: () => void, rejectReady: (error: Error) => void;
    this.#ready = new Promise<void>((resolve, reject) => { ready = resolve; rejectReady = reject; });
    // Attach the rejection handler immediately, including startup failures.
    void this.#ready.catch(() => undefined);
    this.#worker.on('message', (message: WorkerMessage) => {
      if (message.kind === 'child') {
        if (message.active) this.#children.add(message.pid); else this.#children.delete(message.pid);
        return;
      }
      if (message.kind === 'ready') {
        // V8's heap includes young space as well as the old-generation budget.
        // With an 8 MiB young generation V8 reserves at most 12 MiB for it.
        if (message.oldGenerationMiB !== inputs.session.workerHeapMiB
          || message.heapLimit > (inputs.session.workerHeapMiB + 12) * 1024 ** 2) {
          const error = failure('resource-unavailable', `Effective worker heap ${message.heapLimit} bytes does not enforce ${inputs.session.workerHeapMiB} MiB; remove overriding V8 heap flags`);
          this.#fail(error); rejectReady(error); void this.#worker.terminate();
        } else ready();
        return;
      }
      if (message.kind !== 'reply' && message.kind !== 'error') return;
      const received = performance.now();
      this.#messages = this.#messages.then(async () => {
        if (this.#failed) return;
        if (message.status) {
          const pid = message.status.compiler.pid;
          const rss = pid === null ? null : await this.#rss.sample(pid);
          if (this.#failed) return;
          this.#status = deepFreeze({ ...message.status, compiler: { pid, rss } });
        }
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id); pending.cleanup();
        if (message.kind === 'error') { pending.reject(new Error(message.message)); return; }
        let result = deepFreeze(message.result);
        if (result && 'revision' in result) {
          if (this.#current?.sequence === result.revision.sequence) result = { ...result, revision: this.#current };
          else this.#current = result.revision;
        }
        if (timedResult(pending.operation, result)) {
          result = { ...result, timings: { invocationCheck: 0, promotion: 0, ...result.timings, workerRoundTrip: received - pending.sent } };
        }
        pending.resolve(deepFreeze(result));
      }).catch(error => this.#fail(failure('analysis-failed', String(error))));
    });
    this.#worker.on('error', error => {
      const problem = failure((error as NodeJS.ErrnoException).code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'resource-unavailable' : 'analysis-failed', error instanceof Error ? error.message : String(error));
      this.#fail(problem); rejectReady(problem);
    });
    this.#exit = new Promise(resolve => this.#worker.once('exit', code => {
      if (!this.#closing) {
        const error = this.#failed ?? failure('analysis-failed', `Session worker exited (${code})`);
        this.#fail(error); rejectReady(error);
      }
      resolve();
    }));
  }

  get current(): SessionRevision | null { return this.#current; }
  status(): SessionStatus { return this.#status; }

  async open(control: RunControl): Promise<SessionOpen> {
    try {
      await this.#ready;
      if (control.signal?.aborted) { await this.dispose(); return { status: 'cancelled' }; }
      const result = await this.#request({ operation: 'open' }, control) as WorkerOpen;
      if (result.status === 'opened') return { ...result, session: this };
      await this.dispose(); return result;
    } catch (error) {
      return this.#reportedFailure(error as Error, true);
    }
  }

  async update(changes: readonly SessionChange[], control: RunControl = {},
    invocation?: Pick<AnalysisInputs, 'project' | 'capabilities'>): Promise<SessionUpdate> {
    if (control.signal?.aborted) return { status: 'cancelled' };
    try { return await this.#request({ operation: 'update', changes, ...(invocation ? { invocation } : {}) }, control) as SessionUpdate; }
    catch (error) { return this.#reportedFailure(error as Error); }
  }
  async sweep(control: RunControl = {}): Promise<SessionUpdate | { readonly status: 'unchanged'; readonly timings?: OperationTimings }> {
    if (control.signal?.aborted) return { status: 'cancelled' };
    try { return await this.#request({ operation: 'sweep' }, control) as SessionUpdate | { status: 'unchanged'; timings?: OperationTimings }; }
    catch (error) { return this.#reportedFailure(error as Error); }
  }
  async verify(control: RunControl = {}): Promise<VerifyOutcome> {
    if (control.signal?.aborted) return { status: 'cancelled' };
    return await this.#request({ operation: 'verify' }, control) as VerifyOutcome;
  }
  async report(control: RunControl = {}, sequence?: number): Promise<AnalysisReport | null> {
    if (this.#closing || control.signal?.aborted) return null;
    return await this.#request({ operation: 'report', ...(sequence !== undefined ? { sequence } : {}) }, control) as AnalysisReport | null;
  }
  async releaseRevision(sequence: number): Promise<void> { await this.#request({ operation: 'releaseRevision', sequence }); }
  async releaseCompiler(): Promise<void> { await this.#request({ operation: 'releaseCompiler' }); }

  dispose(): Promise<void> {
    if (this.#disposal) return this.#disposal;
    this.#closing = true;
    this.#disposal = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (!this.#failed) {
          const graceful = this.#request({ operation: 'dispose' }).then(() => this.#exit);
          await Promise.race([graceful, new Promise<void>(resolve => { timer = setTimeout(resolve, this.#inputs.limits.disposeTimeoutMs); })]);
        }
      } catch { /* The unconditional termination and child cleanup still run. */ }
      finally {
        if (timer) clearTimeout(timer);
        let released = false;
        try {
          // The supervisor ends the worker's owning process when necessary,
          // then awaits its process group and observed children being reaped.
          await this.#worker.terminate();
          await releaseSessionChildren([...this.#children], this.#inputs.limits.disposeTimeoutMs);
          released = true;
        } finally {
          await this.#exit;
          await this.#messages;
          this.#rss.dispose();
          if (released) this.#children.clear();
          this.#worker.removeAllListeners();
          this.#rejectPending(failure('session-disposed', 'Retained session is disposed'));
          this.#current = null;
          this.#status = deepFreeze({ ...emptyStatus(), sequence: this.#status.sequence, lastSweepAt: this.#status.lastSweepAt });
        }
      }
    })();
    return this.#disposal;
  }

  #request(command: SessionCommand, control: RunControl = {}): Promise<WorkerResult> {
    if (this.#failed) return Promise.reject(this.#failed);
    if (this.#closing && command.operation !== 'dispose') return Promise.reject(failure('session-disposed', 'Retained session is disposed'));
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const abort = (): void => { this.#worker.postMessage(Object.freeze({ operation: 'cancel', id })); };
      this.#pending.set(id, { operation: command.operation, sent: performance.now(), resolve, reject, cleanup: () => control.signal?.removeEventListener('abort', abort) });
      try {
        this.#worker.postMessage(deepFreeze(structuredClone({ ...command, id })));
        control.signal?.addEventListener('abort', abort, { once: true });
        if (control.signal?.aborted) abort();
      } catch (error) {
        this.#pending.delete(id); control.signal?.removeEventListener('abort', abort); reject(error);
      }
    });
  }
  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) { pending.cleanup(); pending.reject(error); }
    this.#pending.clear();
  }
  #fail(error: Failure): void {
    if (this.#failed) return;
    this.#failed = error; this.#current = null; this.#status = emptyStatus();
    this.#rejectPending(error);
    // Failure must release an idle session too, even without another RPC.
    void this.dispose().catch(() => undefined);
  }
  async #reportedFailure(error: Error, dispose = this.#failed !== null): Promise<Extract<SessionUpdate, { status: 'reported' }>> {
    let problem = error;
    if (dispose) {
      try { await this.dispose(); }
      catch (cleanup) {
        problem = Object.assign(new Error(`${error.message}; cleanup failed: ${cleanup instanceof Error ? cleanup.message : String(cleanup)}`),
          'code' in error ? { code: error.code } : {});
      }
    }
    return { status: 'reported', report: failureReport(this.#inputs, problem) };
  }
}

export async function openWorkerSession(inputs: SessionInputs, control: RunControl = {}, entry?: URL,
  sampling?: RssSampling): Promise<SessionOpen> {
  if (control.signal?.aborted) return { status: 'cancelled' };
  const detached = deepFreeze(structuredClone(inputs));
  if (!detached.session || Object.values(detached.session).some(value => !Number.isSafeInteger(value) || value <= 0)) {
    return { status: 'reported', report: failureReport(detached, new Error('Session limits must be positive safe integers'), true) };
  }
  // V8 can abort the entire process during bootstrap below this floor, before
  // Node can deliver ERR_WORKER_OUT_OF_MEMORY. Reject before creating a thread.
  if (detached.session.workerHeapMiB < 8) {
    return { status: 'reported', report: failureReport(detached,
      failure('resource-unavailable', 'The worker requires at least 8 MiB to start safely')) };
  }
  const workerEntry = entry ?? new URL('./session-worker.js', import.meta.url);
  if (!entry && import.meta.url.endsWith('.ts')) workerEntry.pathname = workerEntry.pathname.replace(/\.js$/, '.ts');
  try { return await new SessionHost(detached, workerEntry, sampling).open(control); }
  catch (error) { return { status: 'reported', report: failureReport(detached, error as Error) }; }
}
