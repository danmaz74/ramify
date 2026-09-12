import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDescription } from '../subs/descriptions/src/parse.js';
import type { ParsedDescription } from '../subs/descriptions/src/interfaces/syntax.js';
import { resolveTagRegistry } from '../subs/model/src/index.js';
import type { CapturedInput } from '../subs/project/src/interfaces/project.js';
import { observeProject } from '../subs/project/src/observer.js';
import { resolveProjectRoot } from '../subs/project/src/resolve-root.js';
import type { AnalysisDiagnostic, AnalysisInputs, AnalysisReport, RunControl } from './interfaces/analysis.js';
import type { FindingDelta, RetainedSession, SessionChange, SessionInputs, SessionOpen, SessionRevision, SessionStatus,
  SessionUpdate, VerifyOutcome } from './interfaces/session.js';
import { detached, diagnostic } from './report-data.js';
import { ReportDraft, WorkLimit, availableCapabilities } from './report.js';
import { auditFacts } from './session-audit.js';
import type { SessionFacts } from './session-facts.js';
import { deepFreeze, diagnosticSurface, draftReport, factBytes, sortedPaths } from './session-facts.js';
import { acquisitionDiagnostics, failureReport, invalidFacts, isCancellation, recomputeAll, revise, wholeCheckedSet, zeroTimings } from './session-revision.js';
import type { Computed, SessionState } from './session-revision.js';

/** One published version: the facts a report projection needs, and its measured size. */
interface Version {
  readonly facts: SessionFacts;
  readonly inputs: readonly CapturedInput[];
  readonly inputId: string | null;
  readonly request: AnalysisInputs;
  readonly bytes: number;
}

const positiveIntegers = (values: readonly unknown[]): boolean => values.every(value => Number.isSafeInteger(value) && (value as number) > 0);

/** Findings that appeared, disappeared or only moved between two complete lists. */
export function findingDelta(previous: readonly AnalysisDiagnostic[], current: readonly AnalysisDiagnostic[]): FindingDelta {
  const before = new Set(previous.map(item => item.id)), after = new Set(current.map(item => item.id));
  const vanished = new Map<string, string[]>();
  for (const item of previous) {
    if (after.has(item.id)) continue;
    const surface = diagnosticSurface(item);
    const list = vanished.get(surface) ?? []; list.push(item.id); vanished.set(surface, list);
  }
  const added: AnalysisDiagnostic[] = [], positionOnly: string[] = [];
  for (const item of current) {
    if (before.has(item.id)) continue;
    const moved = vanished.get(diagnosticSurface(item));
    if (moved?.length) { moved.shift(); positionOnly.push(item.id); } else added.push(item);
  }
  const removed = [...vanished.values()].flat();
  return { added, removed: sortedPaths(removed), positionOnly: sortedPaths(positionOnly) };
}

/** Session identity of an invalid acquisition; the projected report keeps its null. */
const sealedIdentity = (inputs: readonly CapturedInput[] | null): string =>
  `invalid/1:${createHash('sha256').update(JSON.stringify(inputs ?? [])).digest('hex')}`;

class Session implements RetainedSession {
  readonly #state: SessionState;
  readonly #versions = new Map<number, Version>();
  #current: SessionRevision | null = null;
  #sequence = 0;
  #queue: Promise<unknown> = Promise.resolve();
  #disposed = false;
  #lastSweepAt: number | null = null;
  /** Sealed inputs of an invalid acquisition retained before an observer exists. */
  #sealed: readonly CapturedInput[] | null = null;
  readonly #acquisition: AnalysisInputs['limits']['acquisition'];

  constructor(state: SessionState, acquisition: AnalysisInputs['limits']['acquisition']) {
    this.#state = state;
    this.#acquisition = acquisition;
  }

  get current(): SessionRevision | null { return this.#current; }

  /** Open cold: observe, run the whole recomputation and publish revision 1. */
  async open(signal?: AbortSignal): Promise<SessionOpen> {
    const state = this.#state;
    const started = performance.now();
    const timings = zeroTimings();
    let start = performance.now();
    const observed = await observeProject({ request: state.request.project, parse: this.#parse, limits: this.#acquisition,
      registry: state.registry.id, ...(signal ? { signal } : {}) });
    timings.inventory = performance.now() - start;
    if (observed.status === 'cancelled') return { status: 'cancelled' };
    if (observed.status !== 'observing') {
      const issues = await acquisitionDiagnostics(state.parsed, observed.inventory, observed.issues);
      if (observed.status !== 'invalid') {
        const draft = new ReportDraft(state.request);
        draft.registry = state.registry; draft.stage('registry', 'completed');
        if (observed.inventory) draft.inventory(observed.inventory);
        draft.record(issues);
        draft.stage('acquisition', observed.status === 'incomplete' ? 'failed' : observed.status, draft.diagnostics);
        draft.execution = observed.status;
        return { status: 'reported', report: draft.finish() };
      }
      // A coherent invalid capture opens a session that retries observation on
      // the next update; it holds the sealed inputs and no compiler.
      this.#sealed = observed.sealedInputs;
      state.facts = invalidFacts(state, issues, observed.inventory);
      const revision = this.#publish({ status: 'computed', facts: state.facts, checked: { path: 'cold', files: [], accesses: 0, modelRebuilt: false },
        changed: [], timings, positionRefreshed: [] }, observed.sealedInputs ?? [], sealedIdentity(observed.sealedInputs), started);
      if ('report' in revision) return { status: 'reported', report: revision.report };
      return { status: 'opened', session: this, revision: revision.revision };
    }
    state.observer = observed.observer;
    try {
      start = performance.now();
      const facts = await recomputeAll(state, observed.observer.inventory, timings, signal);
      state.facts = facts;
      await observed.observer.apply([]);
      const published = this.#publish({ status: 'computed', facts, checked: wholeCheckedSet('cold', facts), changed: [], timings, positionRefreshed: [] },
        observed.observer.inputs, facts.invalid ? null : observed.observer.inputId, started);
      if ('report' in published) { await this.dispose(); return { status: 'reported', report: published.report }; }
      return { status: 'opened', session: this, revision: published.revision };
    } catch (error) {
      await this.dispose();
      if (isCancellation(error, signal)) return { status: 'cancelled' };
      return { status: 'reported', report: failureReport(state, error, 'catalog', observed.observer.inventory) };
    }
  }

  update(changes: readonly SessionChange[], control: RunControl = {},
    invocation?: Pick<AnalysisInputs, 'project' | 'capabilities'>): Promise<SessionUpdate> {
    return this.#serialize(async () => {
      if (this.#disposed) return { status: 'reported', report: this.#disposedReport() };
      const signal = control.signal;
      if (signal?.aborted) return { status: 'cancelled' };
      const state = this.#state;
      let republish = false;
      if (invocation) {
        const problem = await this.#invocationProblem(invocation, signal);
        if (problem) return { status: 'reported', report: failureReport(state, problem, 'acquisition', state.facts?.inventory) };
        const next = detached({ ...state.request, project: invocation.project, capabilities: invocation.capabilities });
        if (JSON.stringify(next) !== JSON.stringify(state.request)) { state.request = next; republish = true; }
      }
      const started = performance.now();
      if (!state.observer) return this.#reopen(changes, started, signal);
      const result = await revise(state, changes, signal);
      if (result.status === 'cancelled') return { status: 'cancelled' };
      if (result.status === 'reported') return result;
      if (result.status === 'identical') {
        if (!republish || !state.facts) return { status: 'revised', revision: this.#current!, identical: true };
        const facts = state.facts;
        const published = this.#publish({ status: 'computed', facts, checked: { ...this.#current!.checked, files: [], accesses: 0, modelRebuilt: false },
          changed: [], timings: zeroTimings(), positionRefreshed: [] }, state.observer.inputs, facts.invalid ? null : state.observer.inputId, started);
        return 'report' in published ? { status: 'reported', report: published.report } : { status: 'revised', revision: published.revision, identical: false };
      }
      state.facts = result.facts;
      // Promote the compiler's reads of this update so the published inputs
      // and identity cover them, as a batch capture of the same state would.
      await state.observer.apply([]);
      const published = this.#publish(result, state.observer.inputs, result.facts.invalid ? null : state.observer.inputId, started);
      return 'report' in published ? { status: 'reported', report: published.report } : { status: 'revised', revision: published.revision, identical: false };
    });
  }

  sweep(control: RunControl = {}): Promise<SessionUpdate | { readonly status: 'unchanged' }> {
    return this.#serialize(async () => {
      if (this.#disposed) return { status: 'reported', report: this.#disposedReport() };
      const observer = this.#state.observer;
      this.#lastSweepAt = Date.now();
      if (!observer) return { status: 'unchanged' };
      const changes = await observer.reobserve(control.signal);
      if (!changes.length) return { status: 'unchanged' };
      const started = performance.now();
      const result = await revise(this.#state, changes, control.signal);
      if (result.status === 'cancelled') return { status: 'cancelled' };
      if (result.status === 'reported') return result;
      if (result.status === 'identical') return { status: 'revised', revision: this.#current!, identical: true };
      this.#state.facts = result.facts;
      await observer.apply([]);
      const published = this.#publish(result, observer.inputs, result.facts.invalid ? null : observer.inputId, started);
      return 'report' in published ? { status: 'reported', report: published.report } : { status: 'revised', revision: published.revision, identical: false };
    });
  }

  verify(control: RunControl = {}): Promise<VerifyOutcome> {
    return this.#serialize(async () => {
      if (this.#disposed) throw new Error('Retained session is disposed');
      if (control.signal?.aborted) return { status: 'cancelled' };
      const started = performance.now();
      let audit;
      try { audit = await auditFacts(this.#state, control.signal); }
      catch (error) {
        if (isCancellation(error, control.signal)) return { status: 'cancelled' };
        throw error;
      }
      const sequence = this.#sequence;
      if (audit.status !== 'mismatch') return { status: 'equal', sequence, elapsedMs: audit.status === 'equal' ? audit.elapsedMs : performance.now() - started };
      const observer = this.#state.observer!;
      this.#state.facts = audit.facts;
      await observer.apply([]);
      const published = this.#publish({ status: 'computed', facts: audit.facts, checked: wholeCheckedSet('broad', audit.facts), changed: [],
        timings: audit.timings, positionRefreshed: [] }, observer.inputs, audit.facts.invalid ? null : observer.inputId, started);
      if ('report' in published) throw new Error(`The audit could not publish its recomputed facts: ${published.report.diagnostics.map(item => item.message).join('; ')}`);
      return { status: 'mismatch', sequence, fields: audit.fields, revision: published.revision };
    });
  }

  report(control: RunControl = {}, sequence?: number): Promise<AnalysisReport | null> {
    return this.#serialize(async () => {
      if (this.#disposed || control.signal?.aborted) return null;
      const version = this.#versions.get(sequence ?? this.#sequence);
      if (!version) return null;
      return draftReport(version.facts, version.request, version.inputs, version.inputId).finish();
    });
  }

  releaseRevision(sequence: number): Promise<void> {
    return this.#serialize(async () => {
      if (sequence === this.#sequence) throw new Error('The current revision cannot be released');
      this.#versions.delete(sequence);
    });
  }

  status(): SessionStatus {
    const memory = process.memoryUsage();
    let bytes = 0;
    for (const version of this.#versions.values()) bytes += version.bytes;
    return Object.freeze({
      level: this.#state.adapter?.hot ? 'hot' : 'warm', sequence: this.#sequence,
      observedInputs: this.#state.observer?.inputs.length ?? this.#sealed?.length ?? 0, factBytes: bytes,
      worker: Object.freeze({ heapUsed: memory.heapUsed, rss: memory.rss }),
      compiler: Object.freeze({ pid: null, rss: null }), lastSweepAt: this.#lastSweepAt,
    });
  }

  releaseCompiler(): Promise<void> {
    return this.#serialize(async () => { await this.#state.adapter?.releaseCompiler(); });
  }

  dispose(): Promise<void> {
    return this.#serialize(async () => {
      if (this.#disposed) return;
      this.#disposed = true;
      const { adapter, observer } = this.#state;
      this.#state.adapter = null; this.#state.observer = null; this.#state.adapterAreas = null;
      try { await adapter?.dispose(); }
      finally { await observer?.dispose(); }
      this.#versions.clear();
    });
  }

  readonly #parse = (file: string, text: string): ParsedDescription => {
    const result = parseDescription(file, text);
    this.#state.parsed.set(file, result);
    return result;
  };

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  #disposedReport(): AnalysisReport {
    const draft = new ReportDraft(this.#state.request);
    const item = diagnostic('session-disposed', 'Retained session is disposed', 'execution');
    draft.diagnostics.push(item); draft.stage('acquisition', 'failed', [item]);
    return draft.finish();
  }

  async #invocationProblem(invocation: Pick<AnalysisInputs, 'project' | 'capabilities'>, signal?: AbortSignal): Promise<Error | null> {
    const state = this.#state;
    const wanted = [...new Set(invocation.capabilities)].sort(), have = [...new Set(state.request.capabilities)].sort();
    const problem = (message: string): Error => Object.assign(new Error(message), { code: 'invalid-invocation' });
    if (JSON.stringify(wanted) !== JSON.stringify(have)) return problem('The invocation requests a different capability set than the session');
    const scope = state.facts?.inventory?.scope ?? state.facts?.invalid?.inventory?.scope;
    if (!scope) return null;
    const resolved = await resolveProjectRoot(invocation.project, signal);
    if (resolved.status !== 'resolved') return problem(`The invocation does not resolve to a project: ${resolved.issues.map(issue => issue.message).join('; ')}`);
    if (resolved.root !== scope.root || resolved.configuration !== scope.configuration) {
      return problem(`The invocation resolves to ${resolved.root}, not this session's ${scope.root}`);
    }
    return null;
  }

  /** Retry observation for a session opened over a coherent invalid capture. */
  async #reopen(changes: readonly SessionChange[], started: number, signal?: AbortSignal): Promise<SessionUpdate> {
    const state = this.#state;
    const timings = zeroTimings();
    let start = performance.now();
    const observed = await observeProject({ request: state.request.project, parse: this.#parse, limits: this.#acquisition,
      registry: state.registry.id, ...(signal ? { signal } : {}) });
    timings.inventory = performance.now() - start;
    if (observed.status === 'cancelled') return { status: 'cancelled' };
    if (observed.status !== 'observing') {
      const issues = await acquisitionDiagnostics(state.parsed, observed.inventory, observed.issues);
      if (observed.status !== 'invalid') {
        const first = observed.issues[0];
        return { status: 'reported', report: failureReport(state, Object.assign(new Error(issues.map(item => item.message).join('; ')),
          { code: first?.code ?? 'read-failure', path: first?.path }), 'acquisition', observed.inventory) };
      }
      const identity = sealedIdentity(observed.sealedInputs);
      if (identity === this.#current?.inputId && !changes.length) return { status: 'revised', revision: this.#current, identical: true };
      this.#sealed = observed.sealedInputs;
      state.facts = invalidFacts(state, issues, observed.inventory);
      const published = this.#publish({ status: 'computed', facts: state.facts, checked: { path: 'broad', files: [], accesses: 0, modelRebuilt: false },
        changed: sortedPaths(changes.map(change => change.path)), timings, positionRefreshed: [] }, observed.sealedInputs ?? [], identity, started);
      return 'report' in published ? { status: 'reported', report: published.report } : { status: 'revised', revision: published.revision, identical: false };
    }
    state.observer = observed.observer;
    this.#sealed = null;
    try {
      start = performance.now();
      const facts = await recomputeAll(state, observed.observer.inventory, timings, signal);
      state.facts = facts; state.stale = false;
      await observed.observer.apply([]);
      const published = this.#publish({ status: 'computed', facts, checked: wholeCheckedSet('broad', facts),
        changed: sortedPaths(changes.map(change => change.path)), timings, positionRefreshed: [] },
        observed.observer.inputs, facts.invalid ? null : observed.observer.inputId, started);
      return 'report' in published ? { status: 'reported', report: published.report } : { status: 'revised', revision: published.revision, identical: false };
    } catch (error) {
      if (isCancellation(error, signal)) return { status: 'cancelled' };
      state.stale = true;
      return { status: 'reported', report: failureReport(state, error, 'catalog', observed.observer.inventory) };
    }
  }

  /**
   * Publish computed facts as the next revision: project the outcome, the
   * summary and the sorted lists through the same draft a batch run uses,
   * compute the finding delta against the previous revision and retain the
   * version for later report projections.
   */
  #publish(computed: Computed, inputs: readonly CapturedInput[], inputId: string | null, started: number):
  { readonly revision: SessionRevision } | { readonly report: AnalysisReport } {
    const state = this.#state;
    const publishStart = performance.now();
    let report: AnalysisReport;
    try {
      const draft = draftReport(computed.facts, state.request, inputs, inputId);
      draft.stage('report', 'completed');
      report = draft.build();
    }
    catch (error) {
      state.stale = true;
      return { report: failureReport(state, error, 'report', computed.facts.inventory) };
    }
    const bytes = factBytes(computed.facts);
    let retained = bytes;
    for (const version of this.#versions.values()) retained += version.bytes;
    if (retained > state.limits.maxRetainedFactBytes) {
      state.stale = true;
      return { report: failureReport(state, new WorkLimit('maxRetainedFactBytes', state.limits.maxRetainedFactBytes, retained), 'report', computed.facts.inventory) };
    }
    const sequence = this.#sequence + 1;
    const delta = findingDelta(this.#current?.diagnostics ?? [], report.diagnostics);
    const publish = performance.now() - publishStart;
    const timings = { ...computed.timings, publish, total: performance.now() - started };
    const revision: SessionRevision = deepFreeze({
      sequence, inputId: inputId ?? sealedIdentity(this.#sealed), inputs, changed: computed.changed, checked: computed.checked,
      outcome: report.outcome, summary: report.summary, diagnostics: report.diagnostics, warnings: report.warnings, coverage: report.coverage,
      delta, timings,
    });
    this.#versions.set(sequence, { facts: computed.facts, inputs, inputId, request: state.request, bytes });
    this.#sequence = sequence;
    this.#current = revision;
    return { revision };
  }
}

/**
 * Open a retained session over one project: observe it, create the retained
 * compiler adapter with the observer's sink, run the cold path and return
 * revision 1. Invalid, incomplete and unavailable cold results are reported
 * the way a batch run reports them.
 */
export async function openRetainedSession(inputs: SessionInputs, control: RunControl = {}): Promise<SessionOpen> {
  const { session: limits, ...request } = detached(inputs);
  if (control.signal?.aborted) return { status: 'cancelled' };
  const draft = new ReportDraft(request);
  const reject = (item: AnalysisDiagnostic, stage: 'acquisition' | 'registry' | 'access', execution: 'unavailable' | 'invalid'): SessionOpen => {
    draft.diagnostics.push(item); draft.stage(stage, execution, [item]); draft.execution = execution;
    return { status: 'reported', report: draft.finish() };
  };
  const limitValues = Object.values(request.limits).flatMap(value => typeof value === 'object' ? Object.values(value) : [value]);
  if (!positiveIntegers(limitValues) || request.limits.acquisition.attempts > 3) {
    return reject(diagnostic('invalid-invocation', 'Analysis limits must be positive safe integers; acquisition permits at most three attempts', 'invocation'), 'acquisition', 'unavailable');
  }
  if (!limits || !positiveIntegers(Object.values(limits))) {
    return reject(diagnostic('invalid-invocation', 'Session limits must be positive safe integers', 'invocation'), 'acquisition', 'unavailable');
  }
  const registry = resolveTagRegistry(request.registry?.definitions);
  if (registry.status === 'invalid') {
    for (const issue of registry.issues) draft.diagnostics.push(diagnostic(issue.code, issue.message, 'registry', issue.locations));
    draft.stage('registry', 'invalid', draft.diagnostics); draft.execution = 'invalid';
    return { status: 'reported', report: draft.finish() };
  }
  if (registry.value.id !== request.registry.id || registry.value.isDefault !== request.registry.isDefault) {
    return reject(diagnostic('invalid-registry', 'Resolved registry identity does not match its definitions', 'registry'), 'registry', 'invalid');
  }
  draft.registry = registry.value; draft.stage('registry', 'completed');
  const unsupported = request.capabilities.filter(capability => !availableCapabilities.includes(capability));
  if (unsupported.length) {
    return reject(diagnostic('unavailable-capability', `Analysis cannot execute: ${unsupported.join(', ')}`, 'unavailable'), 'access', 'unavailable');
  }
  const state: SessionState = { request, limits, registry: registry.value, observer: null, adapter: null, adapterAreas: null,
    facts: null, stale: false, parsed: new Map() };
  const session = new Session(state, request.limits.acquisition);
  return session.open(control.signal);
}
