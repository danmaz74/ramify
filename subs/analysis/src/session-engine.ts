import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseDescription, readRootMarker } from '../subs/descriptions/src/parse.js';
import type { ParsedDescription } from '../subs/descriptions/src/interfaces/syntax.js';
import { originalKey, resolveTagRegistry } from '../subs/model/src/index.js';
import type { CapturedInput, ProjectObserver, ProjectRequest, ProjectResolution } from '../subs/project/src/interfaces/project.js';
import { observeProject } from '../subs/project/src/observer.js';
import { resolveProjectRoot } from '../subs/project/src/resolve-root.js';
import type { ExportShape, SymbolDetail, SymbolDetailRequest, TestFileTitles } from '../subs/typescript/src/interfaces/source.js';
import { planApiViewRequests, projectApiView } from './api-view.js';
import { architectLimitIssue, planArchitectView, projectArchitectView } from './architect-view.js';
import type { AnalysisDiagnostic, AnalysisInputs, AnalysisReport, RunControl } from './interfaces/analysis.js';
import type { ArchitectViewQuery, ArchitectViewQueryOutcome } from './interfaces/architect-view.js';
import type { InventoryModuleMeasurement, MeasurementFileRecord, SessionMeasurementsOutcome } from './interfaces/measurements.js';
import type { AffectedQuery, SessionAffectedOutcome } from './interfaces/affected.js';
import { affectedLimits, assembleAffectedFacts, projectAffected } from './affected-query.js';
import type { ApiViewQuery, ApiViewQueryOutcome, FindingDelta, OperationTimings, RetainedSession, SessionChange, SessionInputs, SessionOpen,
  SessionExplorerDetailsOutcome, SessionRevision, SessionStatus, SessionUpdate, VerifyOutcome } from './interfaces/session.js';
import { detached, diagnostic } from './report-data.js';
import { copyReport } from './report-copy.js';
import { ReportDraft, WorkLimit, availableCapabilities } from './report.js';
import type { PublishedReport } from './report.js';
import { auditFacts } from './session-audit.js';
import { measureContextSize, resolveDeclaredMeasurementInputs } from './module-measurements.js';
import type { SessionFacts } from './session-facts.js';
import { FactLedger, deepFreeze, diagnosticSurface, draftPublication, draftReport, sortedPaths } from './session-facts.js';
import { acquisitionDiagnostics, failureReport, invalidFacts, isCancellation, isStaleCancellation, parseRefused, recomputeAll, releaseObserver,
  revise, wholeCheckedSet, zeroTimings } from './session-revision.js';
import type { Computed, SessionState } from './session-revision.js';

/** One published version: the facts a report projection needs. */
interface Version {
  readonly facts: SessionFacts;
  readonly inputs: readonly CapturedInput[];
  readonly inputId: string | null;
  readonly request: AnalysisInputs;
}

/** Distinct invocation requests whose resolutions a session keeps for reuse. */
const knownResolutions = 4;
/** Two project requests that resolve alike: the same raw fields, before any path is canonicalized. */
const sameRequest = (a: ProjectRequest, b: ProjectRequest): boolean =>
  a.cwd === b.cwd && (a.root ?? null) === (b.root ?? null) && a.scope === b.scope && a.configuration === b.configuration;
const explorerDetailLimits = {
  maxSignatureBytes: 2048,
  maxDocumentationBytes: 512,
  maxOverloads: 8,
  maxResultBytes: 32 * 1024 ** 2,
} as const;
const maximumExplorerDetailRequests = 50;
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

/** What a rehydrating query answers instead of its projection. */
type RehydrationOutcome =
  | { readonly status: 'superseded'; readonly sequence: number; readonly observedInputId: string }
  | { readonly status: 'unavailable'; readonly reason: 'analysis-failed'; readonly message: string }
  | { readonly status: 'cancelled' };
type FeatureRead =
  | { readonly status: 'read'; readonly features: readonly { readonly file: string; readonly text: string }[] }
  | { readonly status: 'changed' }
  | { readonly status: 'unavailable'; readonly reason: 'analysis-failed'; readonly message: string }
  | { readonly status: 'cancelled' };

/**
 * Read each `.feature` file from disk and keep it only while its bytes equal
 * the revision's captured input. A changed, removed or replaced file means the
 * revision no longer describes the project; a file the revision did not capture,
 * or one that cannot be read for another reason, fails the query.
 */
async function readCapturedFeatures(root: string, files: readonly string[], inputs: readonly CapturedInput[],
  signal?: AbortSignal): Promise<FeatureRead> {
  const captured = new Map(inputs.map(input => [input.path, input]));
  const features: { file: string; text: string }[] = [];
  for (const file of files) {
    if (signal?.aborted) return { status: 'cancelled' };
    const expected = captured.get(file);
    if (!expected) return { status: 'unavailable', reason: 'analysis-failed', message: `The revision captured no input for ${file}` };
    let bytes: Buffer;
    try { bytes = await readFile(join(root, file), signal ? { signal } : {}); }
    catch (error) {
      if (isCancellation(error, signal)) return { status: 'cancelled' };
      const code = error instanceof Object && 'code' in error ? (error as { code?: unknown }).code : undefined;
      if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') return { status: 'changed' };
      return { status: 'unavailable', reason: 'analysis-failed',
        message: `Cannot read ${file}: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) return { status: 'changed' };
    features.push({ file, text: bytes.toString('utf8') });
  }
  return { status: 'read', features };
}

/** A failed compiler request of a query: cancellation, a byte bound, or any other failure. */
function queryFailure(error: unknown, signal?: AbortSignal): { readonly status: 'cancelled' }
  | { readonly status: 'unavailable'; readonly reason: 'resource-limit' | 'analysis-failed'; readonly message: string } {
  if (isCancellation(error, signal)) return { status: 'cancelled' };
  const message = error instanceof Error ? error.message : String(error);
  const reason = error instanceof Object && 'code' in error && (error as { code?: unknown }).code === 'resource-limit'
    ? 'resource-limit' : 'analysis-failed';
  return { status: 'unavailable', reason, message };
}

/** Session identity of an invalid acquisition; the projected report keeps its null. */
const sealedIdentity = (inputs: readonly CapturedInput[] | null): string =>
  `invalid/1:${createHash('sha256').update(JSON.stringify(inputs ?? [])).digest('hex')}`;

class Session implements RetainedSession {
  readonly #state: SessionState;
  readonly #versions = new Map<number, Version>();
  /** The retained versions' facts, each distinct object counted once across all of them. */
  readonly #ledger = new FactLedger();
  #current: SessionRevision | null = null;
  #sequence = 0;
  #queue: Promise<unknown> = Promise.resolve();
  #disposed = false;
  #lastSweepAt: number | null = null;
  /** Sealed inputs of an invalid acquisition retained before an observer exists. */
  #sealed: readonly CapturedInput[] | null = null;
  readonly #acquisition: AnalysisInputs['limits']['acquisition'];
  /** Resolutions an invocation check may reuse, most recent first: the observer's and earlier checks'. */
  #resolutions: ProjectResolution[] = [];
  #observedResolution: ProjectResolution | null = null;

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
    const observed = await observeProject({ request: state.project, parse: this.#parse, marker: readRootMarker, limits: this.#acquisition,
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
      const facts = invalidFacts(state, issues, observed.inventory, parseRefused(observed.issues), observed.sealedInputs ?? []);
      const revision = this.#publish({ status: 'computed', facts, checked: { path: 'cold', files: [], accesses: 0, modelRebuilt: false },
        changed: [], timings, positionRefreshed: [] }, observed.sealedInputs ?? [], sealedIdentity(observed.sealedInputs), started);
      if ('report' in revision) return { status: 'reported', report: revision.report };
      return { status: 'opened', session: this, revision: revision.revision };
    }
    state.observer = observed.observer;
    try {
      start = performance.now();
      const facts = await recomputeAll(state, observed.observer.inventory, timings, signal);
      await this.#promote(signal);
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
      let republish = false, invocationCheck = 0;
      // The invocation check runs before `total` starts; the update reports it beside the revision
      // and beside the promotion its computation reported.
      const timed = (update: SessionUpdate): SessionUpdate => update.status === 'cancelled' ? update
        : { ...update, timings: { invocationCheck, promotion: update.timings?.promotion ?? 0 } };
      if (invocation) {
        // A retained session neither reconfigures nor queues work for a batch-only capability.
        const unsupported = invocation.capabilities.filter(capability => !availableCapabilities.includes(capability));
        if (unsupported.length) {
          const draft = new ReportDraft({ ...state.request, capabilities: invocation.capabilities });
          const item = diagnostic('unavailable-capability', `Retained analysis cannot execute: ${unsupported.join(', ')}`, 'unavailable');
          draft.registry = state.registry; draft.stage('registry', 'completed');
          draft.diagnostics.push(item); draft.stage('access', 'unavailable', [item]); draft.execution = 'unavailable';
          return timed({ status: 'reported', report: draft.finish() });
        }
        const checking = performance.now();
        const problem = await this.#invocationProblem(invocation, signal);
        invocationCheck = performance.now() - checking;
        if (problem) return timed({ status: 'reported', report: failureReport(state, problem, 'acquisition', state.facts?.inventory) });
        const next = detached({ ...state.request, project: invocation.project, capabilities: invocation.capabilities });
        if (JSON.stringify(next) !== JSON.stringify(state.request)) { state.request = next; republish = true; }
        invocationCheck = performance.now() - checking;
      }
      const started = performance.now();
      if (!state.observer) return timed(await this.#reopen(changes, started, signal));
      const result = await revise(state, changes, signal);
      if (result.status === 'cancelled') return { status: 'cancelled' };
      if (result.status === 'released') return timed(await this.#reopen(changes, started, signal));
      if (result.status === 'reported') return timed(result);
      if (result.status === 'identical') {
        if (!republish || !state.facts) return timed({ status: 'revised', revision: this.#current!, identical: true, reacquired: false });
        const facts = state.facts;
        const published = this.#publish({ status: 'computed', facts, checked: { ...this.#current!.checked, files: [], accesses: 0, modelRebuilt: false },
          changed: [], timings: zeroTimings(), positionRefreshed: [] }, state.observer.inputs, facts.invalid ? null : state.observer.inputId, started);
        return timed('report' in published ? { status: 'reported', report: published.report }
          : { status: 'revised', revision: published.revision, identical: false, reacquired: false });
      }
      return timed(await this.#complete(result, started, signal));
    });
  }

  sweep(control: RunControl = {}): Promise<SessionUpdate | { readonly status: 'unchanged'; readonly timings?: OperationTimings }> {
    return this.#serialize(async () => {
      if (this.#disposed) return { status: 'reported', report: this.#disposedReport() };
      const observer = this.#state.observer;
      this.#lastSweepAt = Date.now();
      if (control.signal?.aborted) return { status: 'cancelled' };
      if (!observer) return this.#reopen([], performance.now(), control.signal);
      let changes: readonly SessionChange[];
      try { changes = await observer.reobserve(control.signal); }
      catch (error) {
        if (isStaleCancellation(error, control.signal)) {
          await releaseObserver(this.#state);
          return this.#reopen([], performance.now(), control.signal);
        }
        if (isCancellation(error, control.signal)) return this.#cancelledSweep(observer);
        this.#state.stale = true;
        return { status: 'reported', report: failureReport(this.#state, error, 'acquisition', this.#state.facts?.inventory) };
      }
      // A cancellation reobservation completed without noticing stops here,
      // before the revision step applies anything.
      if (control.signal?.aborted) return this.#cancelledSweep(observer);
      if (!changes.length) return { status: 'unchanged' };
      const started = performance.now();
      const result = await revise(this.#state, changes, control.signal);
      if (result.status === 'cancelled') return { status: 'cancelled' };
      if (result.status === 'released') return this.#reopen(changes, started, control.signal);
      if (result.status === 'reported') return result;
      if (result.status === 'identical') return { status: 'revised', revision: this.#current!, identical: true, reacquired: false };
      return this.#complete(result, started, control.signal);
    });
  }

  verify(control: RunControl = {}): Promise<VerifyOutcome> {
    return this.#serialize(async () => {
      if (this.#disposed) throw new Error('Retained session is disposed');
      if (control.signal?.aborted) return { status: 'cancelled' };
      // The audit recomputes every fact from the compiler. A released one has
      // nothing to recompute with, which is a reported outcome rather than a
      // failure; only invalid facts are recomputed without a compiler.
      if (!this.#state.facts?.invalid && !this.#state.adapter?.hot) {
        return { status: 'unavailable', reason: 'compiler-released',
          message: 'The compiler is released; the audit needs a hot session' };
      }
      const started = performance.now();
      try {
        const audit = await auditFacts(this.#state, control.signal);
        const sequence = this.#sequence;
        if (audit.status === 'equal') return { status: 'equal', sequence, elapsedMs: audit.elapsedMs };
        const observer = this.#state.observer;
        if (!audit.facts.invalid) await this.#promote(control.signal);
        const published = this.#publish({ status: 'computed', facts: audit.facts, checked: wholeCheckedSet('broad', audit.facts), changed: [],
          timings: audit.timings, positionRefreshed: [] }, observer?.inputs ?? [], audit.facts.invalid ? null : observer!.inputId, started);
        if ('report' in published) throw new Error(`The audit could not publish its recomputed facts: ${published.report.diagnostics.map(item => item.message).join('; ')}`);
        return { status: 'mismatch', sequence, fields: audit.fields, revision: published.revision };
      } catch (error) {
        this.#state.stale = true;
        if (isCancellation(error, control.signal)) return { status: 'cancelled' };
        throw error;
      }
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
      const version = this.#versions.get(sequence);
      if (!version) return;
      this.#versions.delete(sequence);
      this.#ledger.release(version.facts);
    });
  }

  status(): SessionStatus {
    const memory = process.memoryUsage();
    return Object.freeze({
      level: this.#state.adapter?.hot ? 'hot' : 'warm', sequence: this.#sequence,
      observedInputs: this.#state.observer?.inputs.length ?? this.#sealed?.length ?? 0, factBytes: this.#ledger.total,
      worker: Object.freeze({ heapUsed: memory.heapUsed, rss: memory.rss }),
      compiler: Object.freeze({ pid: null, rss: null }), lastSweepAt: this.#lastSweepAt,
    });
  }

  releaseCompiler(): Promise<void> {
    return this.#serialize(async () => { await this.#state.adapter?.releaseCompiler(); });
  }

  /**
   * Project one ephemeral API-view directly from the retained `SessionFacts` of
   * the session's current valid revision; `report()` and a second project
   * inventory or model are never used. Only `query.sequence` equal to the
   * session's current sequence is accepted. A hot compiler answers directly; a
   * warm one is recreated from the observer's retained captured view (see
   * `#rehydrate`) without publishing a revision. Newly observed content during
   * that rehydration, or a sequence that stopped being current while this
   * queued operation waited, makes the query `superseded`/`invalid-revision`
   * instead of substituting stale or historical data.
   */
  apiView(query: ApiViewQuery, control: RunControl = {}): Promise<ApiViewQueryOutcome> {
    return this.#serialize(async () => {
      if (this.#disposed) return { status: 'unavailable', reason: 'invalid-revision', message: 'Retained session is disposed' };
      const signal = control.signal;
      if (signal?.aborted) return { status: 'cancelled' };
      const state = this.#state;
      if (!this.#current || query.sequence !== this.#sequence) {
        return { status: 'unavailable', reason: 'invalid-revision',
          message: `Sequence ${query.sequence} is not the session's current revision (${this.#sequence})` };
      }
      const facts = state.facts;
      if (!facts) return { status: 'unavailable', reason: 'analysis-failed', message: 'Session facts are not retained' };
      const planned = planApiViewRequests(facts, query.selection);
      if (planned.status === 'unavailable') return planned;
      if (planned.requests.length) {
        if (!state.adapter) return { status: 'unavailable', reason: 'analysis-failed', message: 'No retained compiler is available for this session' };
        if (!state.adapter.hot) {
          const rehydration = await this.#rehydrate(signal);
          if (rehydration) return rehydration;
        }
      }
      let details: readonly SymbolDetail[];
      try {
        details = planned.requests.length ? await state.adapter!.details(planned.requests, query.details, signal) : [];
      } catch (error) {
        if (isCancellation(error, signal)) return { status: 'cancelled' };
        const message = error instanceof Error ? error.message : String(error);
        const reason = error instanceof Object && 'code' in error && (error as { code?: unknown }).code === 'resource-limit'
          ? 'resource-limit' : 'analysis-failed';
        return { status: 'unavailable', reason, message };
      }
      const lookup = new Map(details.map(detail => [`${originalKey(detail.original)} ${detail.exportName}`, detail]));
      const detailsOf = (request: SymbolDetailRequest): SymbolDetail => {
        const found = lookup.get(`${originalKey(request.original)} ${request.exportName}`);
        if (!found) throw new Error(`No symbol detail was returned for ${request.exportName} of ${originalKey(request.original)}`);
        return found;
      };
      return projectApiView(facts, query.sequence, this.#current.inputId, query.selection, detailsOf,
        { maxAreaBytes: query.maxAreaBytes, maxInvocationBytes: query.maxInvocationBytes });
    });
  }

  /**
   * Project the architect view's facts from the current valid revision, as
   * `apiView` projects its own: serialized with every other operation, only
   * for the current sequence, from the retained facts and the live or
   * rehydrated compiler, without publishing a revision. The compiler gives
   * each selected original's detail and shape and each TypeScript or
   * JavaScript test file's titles. `.feature` files are read from disk and
   * used only while their bytes equal the revision's captured input; a changed
   * one answers `superseded` with no observed input identity.
   */
  architectView(query: ArchitectViewQuery, control: RunControl = {}): Promise<ArchitectViewQueryOutcome> {
    return this.#serialize(async () => {
      if (this.#disposed) return { status: 'unavailable', reason: 'invalid-revision', message: 'Retained session is disposed' };
      const signal = control.signal;
      if (signal?.aborted) return { status: 'cancelled' };
      const state = this.#state;
      const current = this.#current;
      if (!current || query.sequence !== this.#sequence) {
        return { status: 'unavailable', reason: 'invalid-revision',
          message: `Sequence ${query.sequence} is not the session's current revision (${this.#sequence})` };
      }
      const facts = state.facts;
      if (!facts) return { status: 'unavailable', reason: 'analysis-failed', message: 'Session facts are not retained' };
      const limitIssue = architectLimitIssue(query);
      if (limitIssue) return { status: 'unavailable', reason: 'resource-limit', message: limitIssue };
      const planned = planArchitectView(facts);
      if (planned.status === 'unavailable') return planned;
      const read = await readCapturedFeatures(facts.inventory!.scope.root, planned.features, current.inputs, signal);
      if (read.status === 'changed') return { status: 'superseded', sequence: this.#sequence, observedInputId: null };
      if (read.status !== 'read') return read;
      const compiled = planned.requests.length > 0 || planned.testFiles.length > 0;
      if (compiled) {
        if (!state.adapter) return { status: 'unavailable', reason: 'analysis-failed', message: 'No retained compiler is available for this session' };
        if (!state.adapter.hot) {
          const rehydration = await this.#rehydrate(signal);
          if (rehydration) return rehydration;
        }
      }
      let details: readonly SymbolDetail[] = [], shapes: readonly ExportShape[] = [], tests: readonly TestFileTitles[] = [];
      try {
        if (planned.requests.length) {
          details = await state.adapter!.details(planned.requests, query.details, signal);
          shapes = await state.adapter!.shapes(planned.requests, signal);
        }
        if (planned.testFiles.length) tests = await state.adapter!.testTitles(planned.testFiles, query.tests, signal);
      } catch (error) {
        return queryFailure(error, signal);
      }
      if (signal?.aborted) return { status: 'cancelled' };
      return projectArchitectView(facts, query.sequence, current.inputId, { details, shapes, tests, features: read.features }, query);
    });
  }

  measurements(sequence: number, control: RunControl = {}): Promise<SessionMeasurementsOutcome> {
    return this.#serialize(async () => {
      if (control.signal?.aborted) return { status: 'cancelled' };
      if (this.#disposed) {
        return { status: 'unavailable', reason: 'invalid-revision', message: 'Retained session is disposed' };
      }
      const current = this.#current;
      if (!current || sequence !== this.#sequence) {
        return { status: 'unavailable', reason: 'invalid-revision',
          message: `Sequence ${sequence} is not the session's current revision (${this.#sequence})` };
      }
      const facts = this.#state.facts;
      if (!facts || facts.invalid || !facts.inventory || facts.areaIssues.length) {
        return { status: 'unavailable', reason: 'invalid-current',
          message: 'The current revision has no valid complete inventory' };
      }
      const resolved = resolveDeclaredMeasurementInputs(facts.inventory, facts.areas, current.inputs);
      if (resolved.status === 'unavailable') {
        return { status: 'unavailable', reason: 'analysis-failed', message: resolved.message };
      }
      const children = new Map<string, string[]>();
      for (const module of facts.inventory.modules) {
        if (module.parent === null) continue;
        const list = children.get(module.parent) ?? [];
        list.push(module.id);
        children.set(module.parent, list);
      }
      const descendants = (owner: string): Set<string> => {
        const found = new Set<string>();
        const pending = [owner];
        while (pending.length) {
          const next = pending.pop()!;
          if (found.has(next)) continue;
          found.add(next);
          pending.push(...children.get(next) ?? []);
        }
        return found;
      };
      const modules: InventoryModuleMeasurement[] = [...facts.inventory.modules]
        .sort((a, b) => Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)))
        .map(module => ({
          id: module.id, dir: module.directory === '.' ? '' : module.directory, parent: module.parent,
          exact: measureContextSize(resolved.files, resolved.documentation, new Set([module.id])),
          subtree: measureContextSize(resolved.files, resolved.documentation, descendants(module.id)),
        }));
      const files: MeasurementFileRecord[] = [...resolved.files, ...resolved.documentation]
        .sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))
        .map(({ path, owner, area, kind, bytes }) => ({ path, owner, area, kind, bytes }));
      if (control.signal?.aborted) return { status: 'cancelled' };
      return { status: 'measured', measurements: {
        sequence, inputId: current.inputId, modules, files,
        outsideModuleFiles: [...facts.inventory.outsideModuleFiles],
      } };
    });
  }

  /**
   * Select the modules affected by the query's seeds from the current
   * revision's retained facts, as `measurements` reads its inventory: only the
   * current sequence, no compiler, no disk and no `report()`. A revision whose
   * access interpretation did not complete, because the link stage is invalid
   * and access is blocked, answers `missing-facts`; the revision's published
   * `outcome.execution` is `completed` exactly when the access and decide
   * stages completed over a linked model.
   */
  affected(query: AffectedQuery, control: RunControl = {}): Promise<SessionAffectedOutcome> {
    return this.#serialize(async () => {
      if (control.signal?.aborted) return { status: 'cancelled' };
      const unavailable = (reason: Extract<SessionAffectedOutcome, { status: 'unavailable' }>['reason'], message: string):
        SessionAffectedOutcome => ({ status: 'unavailable', reason, message, unknownModules: [] });
      if (this.#disposed) return unavailable('invalid-revision', 'Retained session is disposed');
      if (typeof query !== 'object' || query === null) return unavailable('invalid-query', 'An affected query must be an object');
      const current = this.#current;
      if (!current || query.sequence !== this.#sequence) {
        return unavailable('invalid-revision', `Sequence ${query.sequence} is not the session's current revision (${this.#sequence})`);
      }
      const facts = this.#state.facts;
      if (!facts || facts.invalid || !facts.inventory || facts.areaIssues.length) {
        return unavailable('invalid-current', 'The current revision has no valid complete inventory');
      }
      const check = current.outcome.check;
      if (current.outcome.execution !== 'completed' || check === 'not-run' || !facts.model || facts.linkIssues.length) {
        return unavailable('missing-facts', 'The current revision did not complete access interpretation');
      }
      const outcome = projectAffected(assembleAffectedFacts(facts, current.inputId, facts.inventory.scope, check),
        { modules: query.modules === undefined ? [] : query.modules, paths: query.paths === undefined ? [] : query.paths },
        affectedLimits, control);
      if (control.signal?.aborted) return { status: 'cancelled' };
      return outcome.status === 'answered' ? { status: 'answered', sequence: current.sequence, result: outcome.result } : outcome;
    });
  }

  explorerDetails(sequence: number, requests: readonly SymbolDetailRequest[],
    control: RunControl = {}): Promise<SessionExplorerDetailsOutcome> {
    return this.#serialize(async () => {
      if (control.signal?.aborted) return { status: 'cancelled' };
      if (this.#disposed) return { status: 'unavailable', reason: 'compiler-released', message: 'Retained session is disposed' };
      if (!this.#current || sequence !== this.#sequence) return { status: 'superseded', sequence: this.#sequence };
      if (this.#state.facts?.invalid || this.#current.outcome.execution !== 'completed') {
        return { status: 'unavailable', reason: 'invalid-current', message: 'The current revision is not a valid completed analysis' };
      }
      const adapter = this.#state.adapter;
      if (!adapter?.hot) {
        return { status: 'unavailable', reason: 'compiler-released', message: 'The current revision no longer has a retained compiler' };
      }
      const unique = new Set(requests.map(request => `${originalKey(request.original)}\u0000${request.exportName}`));
      if (unique.size > maximumExplorerDetailRequests) {
        return { status: 'unavailable', reason: 'resource-limit',
          message: `Explorer details accept at most ${maximumExplorerDetailRequests} distinct requests` };
      }
      try {
        const details = await adapter.details(requests, explorerDetailLimits, control.signal);
        return { status: 'ready', sequence, details };
      } catch (error) {
        if (isCancellation(error, control.signal)) return { status: 'cancelled' };
        const reason = error instanceof Object && 'code' in error
          && (error as { code?: unknown }).code === 'resource-limit' ? 'resource-limit' : 'analysis-failed';
        return { status: 'unavailable', reason,
          message: error instanceof Error ? error.message : String(error) };
      }
    });
  }

  /**
   * Recreate one compiler from the observer's retained captured view: an
   * update with no named changes reopens a released adapter directly from
   * disk, exactly as a real structural or broad revision step would, without a
   * project inventory walk (the observer's inventory and inputs are reused,
   * only the compiler's own reads are repeated). `#promote` then compares
   * those reads against the retained capture exactly as it does after every
   * real revision computation; any discrepancy (or an incomplete/invalid
   * re-observation) marks the session stale for the next real update and
   * reports the query as superseded rather than answering from drifted state.
   * Returns null when rehydration observed nothing new.
   */
  async #rehydrate(signal?: AbortSignal): Promise<RehydrationOutcome | null> {
    const state = this.#state;
    if (!state.observer) return { status: 'unavailable', reason: 'analysis-failed', message: 'Session has no observer to rehydrate a compiler from' };
    try {
      await state.adapter!.update({ changed: [], created: [], deleted: [], inventory: null, invalidateAll: false }, signal);
      await this.#promote(signal);
    } catch (error) {
      if (isCancellation(error, signal)) return { status: 'cancelled' };
      state.stale = true;
      return { status: 'superseded', sequence: this.#sequence, observedInputId: state.observer.inputId };
    }
    return null;
  }

  dispose(): Promise<void> {
    return this.#serialize(async () => {
      if (this.#disposed) return;
      this.#disposed = true;
      const { adapter, observer } = this.#state;
      this.#state.adapter = null; this.#state.observer = null; this.#state.adapterAreas = null;
      try { await adapter?.dispose(); }
      finally {
        try { await observer?.dispose(); }
        finally {
          this.#versions.clear(); this.#ledger.clear();
          this.#current = null; this.#sealed = null; this.#resolutions = []; this.#observedResolution = null;
          this.#state.facts = null; this.#state.parsed.clear();
        }
      }
    });
  }

  readonly #parse = (file: string, text: string): ParsedDescription => {
    const result = parseDescription(file, text);
    this.#state.parsed.set(file, result);
    return result;
  };

  /** Publication only commits facts after all compiler reads were observed. */
  async #complete(computed: Computed, started: number, signal?: AbortSignal): Promise<SessionUpdate> {
    const state = this.#state;
    let promotion = 0;
    const timings = (): OperationTimings => ({ invocationCheck: 0, promotion });
    // A structural update acquired a fresh capture; promotion then observes every compiler read
    // into it. Invalid facts skip promotion, so they never report a reacquisition.
    const reacquired = computed.reacquired === true && !computed.facts.invalid;
    try {
      if (!computed.facts.invalid) {
        const promoting = performance.now();
        try { await this.#promote(signal); } finally { promotion = performance.now() - promoting; }
      }
      const observer = state.observer!;
      const published = this.#publish(computed, observer.inputs, computed.facts.invalid ? null : observer.inputId, started);
      return 'report' in published ? { status: 'reported', report: published.report, timings: timings() }
        : { status: 'revised', revision: published.revision, identical: false, reacquired, timings: timings() };
    } catch (error) {
      // The revision step applied its changes to the observer before
      // returning them, so even a cancellation before promotion leaves the
      // session past its published revision: the same event would otherwise
      // compare identical and its edit would never be published.
      state.stale = true;
      if (isCancellation(error, signal)) return { status: 'cancelled' };
      return { status: 'reported', report: failureReport(state, error, 'acquisition', state.facts?.inventory), timings: timings() };
    }
  }

  /**
   * A cancelled sweep leaves the session as published unless reobservation
   * already promoted reported compiler reads that moved the observer's inputs;
   * those changes would not be observed again.
   */
  #cancelledSweep(observer: ProjectObserver): { readonly status: 'cancelled' } {
    if (observer.inputId !== this.#current?.inputId) this.#state.stale = true;
    return { status: 'cancelled' };
  }

  async #promote(signal?: AbortSignal): Promise<void> {
    const observer = this.#state.observer!;
    // Reads already carry content hashes, including pending compiler reads.
    // Probe and directory identities gain acquisition metadata at promotion,
    // so only actual file bytes can be compared across this boundary.
    const listed = observer.inputs;
    const result = await observer.apply([], signal);
    if (result.kind === 'incomplete' || result.kind === 'invalid') {
      const first = result.issues[0];
      throw Object.assign(new Error(result.issues.map(issue => issue.message).join('; ')),
        { code: first?.code ?? 'read-failure', path: first?.path });
    }
    // The observer returns the same list object until an observation changes.
    const after = observer.inputs;
    if (after === listed) return;
    const empty = createHash('sha256').update('').digest('hex');
    const reads = new Map(listed.filter(input => input.bytes > 0 || input.sha256 === empty)
      .map(input => [input.path, input]));
    for (const current of after) {
      const before = reads.get(current.path);
      if (before && (before.sha256 !== current.sha256 || before.bytes !== current.bytes)) {
        throw Object.assign(new Error(`Input changed while promoting compiler reads: ${current.path}`),
          { code: 'changed-input', path: current.path });
      }
    }
  }

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
    // An equal invocation reuses a known resolution while every discovery query
    // it made answers the same on disk; the scope comparison below still runs.
    const observed = state.observer?.resolution ?? null;
    if (observed && observed !== this.#observedResolution) { this.#observedResolution = observed; this.#remember(observed); }
    const resolved = await resolveProjectRoot(invocation.project, readRootMarker, signal, this.#resolutions);
    // The opening request resolving to an invalid root (a missing or unmarked root
    // description, or a symlink) is the project's current state, not another project:
    // the update's acquisition, made with that request, reports it as a batch read does.
    if (resolved.status === 'invalid' && sameRequest(invocation.project, state.project)) return null;
    if (resolved.status !== 'resolved') return problem(`The invocation does not resolve to a project: ${resolved.issues.map(issue => issue.message).join('; ')}`);
    this.#remember(resolved);
    if (resolved.root !== scope.root || resolved.configuration !== scope.configuration) {
      return problem(`The invocation resolves to ${resolved.root}, not this session's ${scope.root}`);
    }
    return null;
  }

  /** Keep a resolution first among a few; requests from other directories keep their own. */
  #remember(resolution: ProjectResolution): void {
    if (this.#resolutions[0] === resolution) return;
    this.#resolutions = [resolution, ...this.#resolutions.filter(item => item !== resolution)].slice(0, knownResolutions);
  }

  /** Retry observation for a session opened over a coherent invalid capture, with the request it was
   * opened with, as every acquisition of the session does. Its acquisition is a cold open, not a
   * structural update, so it reports no reacquisition and a required sweep still runs. */
  async #reopen(changes: readonly SessionChange[], started: number, signal?: AbortSignal): Promise<SessionUpdate> {
    const state = this.#state;
    const timings = zeroTimings();
    let start = performance.now();
    const observed = await observeProject({ request: state.project, parse: this.#parse, marker: readRootMarker, limits: this.#acquisition,
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
      if (identity === this.#current?.inputId && !changes.length) return { status: 'revised', revision: this.#current, identical: true, reacquired: false };
      this.#sealed = observed.sealedInputs;
      const facts = invalidFacts(state, issues, observed.inventory, parseRefused(observed.issues), observed.sealedInputs ?? []);
      const published = this.#publish({ status: 'computed', facts, checked: { path: 'broad', files: [], accesses: 0, modelRebuilt: false },
        changed: sortedPaths(changes.map(change => change.path)), timings, positionRefreshed: [] }, observed.sealedInputs ?? [], identity, started);
      return 'report' in published ? { status: 'reported', report: published.report }
        : { status: 'revised', revision: published.revision, identical: false, reacquired: false };
    }
    state.observer = observed.observer;
    this.#sealed = null;
    try {
      start = performance.now();
      const facts = await recomputeAll(state, observed.observer.inventory, timings, signal);
      state.stale = false;
      const promoting = performance.now();
      await this.#promote(signal);
      const promotion = performance.now() - promoting;
      const published = this.#publish({ status: 'computed', facts, checked: wholeCheckedSet('broad', facts),
        changed: sortedPaths(changes.map(change => change.path)), timings, positionRefreshed: [] },
        observed.observer.inputs, facts.invalid ? null : observed.observer.inputId, started);
      const operation: OperationTimings = { invocationCheck: 0, promotion };
      return 'report' in published ? { status: 'reported', report: published.report, timings: operation }
        : { status: 'revised', revision: published.revision, identical: false, reacquired: false, timings: operation };
    } catch (error) {
      if (isCancellation(error, signal)) return { status: 'cancelled' };
      state.stale = true;
      return { status: 'reported', report: failureReport(state, error, 'catalog', observed.observer.inventory) };
    }
  }

  /**
   * Publish computed facts as the next revision: project the outcome, the
   * summary and the sorted lists through the stages a batch run drives, without
   * the snapshot, compute the finding delta against the previous revision and
   * retain the version for later full report projections.
   */
  #publish(computed: Computed, inputs: readonly CapturedInput[], inputId: string | null, started: number):
  { readonly revision: SessionRevision } | { readonly report: AnalysisReport } {
    const state = this.#state;
    if (computed.facts.invalid) { inputs = computed.facts.invalid.inputs; inputId = null; }
    const publishStart = performance.now();
    let report: PublishedReport;
    try {
      const projected = draftPublication(computed.facts, state.request).publication();
      if (projected) report = projected;
      else {
        // What the revision keeps exceeds maxReportBytes: the full report's
        // bounded failure describes the refusal.
        const full = draftReport(computed.facts, state.request, inputs, inputId).bounded();
        if (full.outcome.execution !== 'completed' && full.outcome.execution !== 'invalid') {
          state.stale = true;
          return { report: copyReport(full) };
        }
        report = full;
      }
    }
    catch (error) {
      state.stale = true;
      return { report: failureReport(state, error, 'report', computed.facts.inventory) };
    }
    // The candidate is counted jointly with every retained version: objects it
    // shares with them add nothing. A refused candidate is released again.
    this.#ledger.retain(computed.facts);
    const retained = this.#ledger.total;
    if (retained > state.limits.maxRetainedFactBytes) {
      this.#ledger.release(computed.facts);
      state.stale = true;
      return { report: failureReport(state, new WorkLimit('maxRetainedFactBytes', state.limits.maxRetainedFactBytes, retained), 'report', computed.facts.inventory) };
    }
    const sequence = this.#sequence + 1;
    let revision: SessionRevision;
    try {
      const delta = findingDelta(this.#current?.diagnostics ?? [], report.diagnostics);
      const publish = performance.now() - publishStart;
      const timings = { ...computed.timings, publish, total: performance.now() - started };
      revision = deepFreeze({
        sequence, inputId: inputId ?? sealedIdentity(inputs), inputs, changed: computed.changed, checked: computed.checked,
        outcome: report.outcome, summary: report.summary, diagnostics: report.diagnostics, warnings: report.warnings, coverage: report.coverage,
        delta, timings,
      });
    } catch (error) { this.#ledger.release(computed.facts); throw error; }
    this.#versions.set(sequence, { facts: computed.facts, inputs, inputId, request: state.request });
    this.#sequence = sequence;
    this.#current = revision;
    state.facts = computed.facts;
    return { revision };
  }
}

/**
 * Open a retained session over one project: observe it, create the retained
 * compiler adapter with the observer's sink, run the cold path and return
 * revision 1. Invalid, incomplete and unavailable cold results are reported
 * the way a batch run reports them.
 */
export async function openSessionEngine(inputs: SessionInputs, control: RunControl = {}): Promise<SessionOpen> {
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
  const state: SessionState = { request, project: request.project, limits, registry: registry.value, observer: null, adapter: null,
    adapterAreas: null, facts: null, stale: false, parsed: new Map() };
  const session = new Session(state, request.limits.acquisition);
  return session.open(control.signal);
}
