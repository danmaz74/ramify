import { createHash } from 'node:crypto';
import type { ApiViewQueryLimits, AnalysisDriver, ContextBudgets, ContextSetup } from '../interfaces/contexts.js';
import type { AnalysisInputs, AnalysisReport, RunControl } from '../../../../../analysis/src/interfaces/analysis.js';
import type { ApiViewQuery, ApiViewQueryOutcome, OperationTimings, RetainedSession, SessionChange, SessionRevision, SessionStatus, SessionUpdate, VerifyOutcome } from '../../../../../analysis/src/interfaces/session.js';
import type { ArchitectViewQuery, ArchitectViewQueryOutcome } from '../../../../../analysis/src/interfaces/architect-view.js';
import type { AffectedQuery, AffectedSelection, SessionAffectedOutcome } from '../../../../../analysis/src/interfaces/affected.js';
import type { SymbolDetailRequest } from '../../../../../analysis/subs/typescript/src/interfaces/source.js';
import type { CapturedInput, ProjectRequest, ProjectResolution, ProjectScope } from '../../../../../analysis/subs/project/src/interfaces/project.js';
import { classifyProjectPath } from '../../../../../analysis/subs/project/src/ownership.js';
import { historyReport } from './history-fixture.js';

export const testBudgets: ContextBudgets = {
  maxContexts: 8, maxHotContexts: 2, maxHistoryRevisions: 8, maxHistoryBytes: 64 * 1024 ** 2,
  maxRetainedBytesPerContext: 96 * 1024 ** 2, maxRetainedBytesGlobal: 512 * 1024 ** 2,
  maxQueuedPaths: 10_000, maxConcurrentAnalyses: 1, warmIdleMs: 600_000,
  coldRetainMs: 1_800_000, debounceMs: 100, sweepIntervalMs: 30_000, updateDeadlineMs: 2000,
  demoteDeadlineMs: 5000,
};
export const testApiViewLimits: ApiViewQueryLimits = {
  details: { maxSignatureBytes: 2048, maxDocumentationBytes: 512, maxOverloads: 8, maxResultBytes: 32 * 1024 ** 2 },
  maxAreaBytes: 32 * 1024 ** 2, maxInvocationBytes: 256 * 1024 ** 2,
  architect: { details: { maxSignatureBytes: 240, maxDocumentationBytes: 280, maxOverloads: 4, maxResultBytes: 32 * 1024 ** 2 },
    tests: { maxTitleBytes: 240, maxTitlesPerRecord: 40, maxResultBytes: 16 * 1024 ** 2 }, maxProjectionBytes: 64 * 1024 ** 2 },
};
export function hash(content: string): string { return createHash('sha256').update(content).digest('hex'); }

/** Independently supplied facts for a scripted session operation. The fake does
 * no filesystem discovery or Ramify analysis and cannot establish equivalence. */
export interface ScriptedCapture {
  readonly status: 'captured';
  readonly report: AnalysisReport;
  readonly revision: SessionRevision;
  readonly factBytes?: number;
  /** Operation durations the session reports beside the revision, when the script supplies them. */
  readonly timings?: OperationTimings;
  /** The update acquired the project again on a fresh capture; false unless the script says so. */
  readonly reacquired?: boolean;
}
export function capture(version = 1, execution: 'completed' | 'invalid' | 'incomplete' = 'completed', inputs?: readonly CapturedInput[],
  scope: ProjectScope | null = null): ScriptedCapture {
  const base = historyReport(`run/1:${version}`);
  const observed = inputs ?? [{ path: 'src/index.ts', role: 'source' as const, sha256: hash(String(version)), bytes: 1 }];
  const inputId = `input/1:${hash(JSON.stringify(observed))}`;
  const report: AnalysisReport = {
    ...base, inputId, scope,
    outcome: { execution, check: execution === 'completed' ? 'passed' : 'not-run', coverage: execution === 'completed' ? 'complete' : 'not-run' },
    summary: { ...base.summary, complete: execution === 'completed', owners: version },
  };
  return { status: 'captured', report, revision: {
    sequence: version, inputId, inputs: observed, scope, changed: observed.map(input => input.path),
    checked: { path: version === 1 ? 'cold' : 'source', files: observed.filter(input => input.role === 'source').map(input => input.path), accesses: 0, modelRebuilt: version === 1 },
    outcome: report.outcome, summary: report.summary, diagnostics: report.diagnostics, warnings: report.warnings, coverage: report.coverage,
    delta: { added: [], removed: [], positionOnly: [] },
    timings: { classify: 1, inventory: 2, compiler: 3, descriptions: 4, accesses: 5, link: 6, decide: 7, companions: 0, publish: 8, total: 36 },
  } };
}
export interface ScriptedCall {
  readonly kind: 'open' | 'update' | 'sweep';
  readonly inputs: { readonly project: ProjectRequest; readonly setup: ContextSetup; readonly changes: readonly SessionChange[] };
  readonly signal: AbortSignal | undefined;
}
type ScriptedResult = ScriptedCapture | SessionUpdate | { readonly status: 'unchanged'; readonly timings?: OperationTimings };
/** One `resolve` call: the known resolutions it received and whether one was returned. */
export interface ScriptedResolve {
  readonly request: ProjectRequest;
  readonly known: readonly ProjectResolution[];
  readonly reused: boolean;
}
export interface ScriptedSession {
  readonly session: RetainedSession;
  readonly project: ProjectRequest;
  readonly reportCalls: number[];
  readonly releasedRevisions: number[];
  readonly apiViewCalls: ApiViewQuery[];
  readonly architectViewCalls: ArchitectViewQuery[];
  readonly affectedCalls: AffectedQuery[];
  readonly explorerDetailsCalls: readonly { readonly sequence: number; readonly requests: readonly SymbolDetailRequest[] }[];
  releaseCompilerCalls: number;
  disposeCalls: number;
}

export function createScriptedDriver() {
  const calls: ScriptedCall[] = [];
  const pending: ((call: ScriptedCall) => Promise<ScriptedResult> | ScriptedResult)[] = [];
  const sessions: ScriptedSession[] = [];
  const reportCalls: { readonly root: string; readonly sequence: number }[] = [];
  const verifyCalls: string[] = [];
  const verifyPending: ((session: RetainedSession) => Promise<VerifyOutcome> | VerifyOutcome)[] = [];
  /** Scripted `releaseCompiler` answers; one that never resolves models an unresponsive session. */
  const releasePending: ((session: RetainedSession) => Promise<void> | void)[] = [];
  /** Scripted `apiView` answers, consumed in order; the default projects an
   * empty, deterministic projection from the session's current revision. */
  const apiViewPending: ((session: RetainedSession, query: ApiViewQuery) => Promise<ApiViewQueryOutcome> | ApiViewQueryOutcome)[] = [];
  /** Scripted `architectView` answers, consumed in order, each with the query's signal; the
   * default projects an empty, deterministic projection from the session's current revision. */
  const architectViewPending: ((session: RetainedSession, query: ArchitectViewQuery, signal: AbortSignal | undefined)
    => Promise<ArchitectViewQueryOutcome> | ArchitectViewQueryOutcome)[] = [];
  /** Scripted `affected` answers, consumed in order, each with the query's signal; the
   * default answers `scriptedSelection` for the current revision and refuses another sequence. */
  const affectedPending: ((session: RetainedSession, query: AffectedQuery, signal: AbortSignal | undefined)
    => Promise<SessionAffectedOutcome> | SessionAffectedOutcome)[] = [];
  const missingReports = new Set<number>();
  let fallback = capture(1);
  let factBytes = 100;
  let disposed = false;
  const resolveCalls: ScriptedResolve[] = [];
  // A stand-in for discovery answers: a resolution stays valid until they change.
  let discovery = 0;
  let movedRoot: string | undefined;
  const answered = new WeakMap<ProjectResolution, number>();
  const invoke = async (call: ScriptedCall): Promise<ScriptedResult> => {
    calls.push(call);
    const next = pending.shift();
    const result = next ? await next(call) : fallback;
    if (result.status === 'captured') fallback = result;
    return result;
  };
  const driver: AnalysisDriver = {
    classify: classifyProjectPath,
    async resolve(request, _control, known = []) {
      const candidate = known[0];
      if (candidate && answered.get(candidate) === discovery) { resolveCalls.push({ request, known, reused: true }); return candidate; }
      const resolution: ProjectResolution = { status: 'resolved', root: movedRoot ?? request.root ?? '/fixture', selection: request.root ? 'given' : 'found', invokedFrom: request.cwd, configuration: 'tsconfig.json' };
      answered.set(resolution, discovery);
      resolveCalls.push({ request, known, reused: false });
      return resolution;
    },
    async open(project, setup, control) {
      const first = await invoke({ kind: 'open', inputs: { project, setup, changes: [] }, signal: control?.signal });
      if (control?.signal?.aborted || first.status === 'cancelled') return { status: 'cancelled' };
      if (first.status === 'reported') return first;
      if (first.status !== 'captured') throw new Error(`A scripted open needs a capture, received ${first.status}`);
      if (first.report.outcome.execution === 'incomplete' || first.report.outcome.execution === 'unavailable') return { status: 'reported', report: first.report };
      let current: SessionRevision | null = null;
      let currentReport: AnalysisReport | null = null;
      let level: SessionStatus['level'] = 'hot';
      let retainedBytes = factBytes;
      let sessionDisposed = false;
      let invocation: Pick<AnalysisInputs, 'project' | 'capabilities'> = { project, capabilities: setup.capabilities };
      const reports = new Map<number, AnalysisReport>();
      const explorerDetailsCalls: { sequence: number; requests: readonly SymbolDetailRequest[] }[] = [];
      function accept(next: ScriptedCapture): Extract<SessionUpdate, { status: 'revised' }> {
        const report: AnalysisReport = { ...next.report, request: { ...next.report.request, project: invocation.project, capabilities: invocation.capabilities } };
        const comparable = (value: AnalysisReport) => JSON.stringify({ ...value, runId: '' });
        retainedBytes = next.factBytes ?? factBytes;
        if (current && currentReport && comparable(report) === comparable(currentReport)) return { status: 'revised', revision: current, identical: true, reacquired: false };
        const sequence = (current?.sequence ?? 0) + 1;
        const previous = new Map((current?.diagnostics ?? []).map(diagnostic => [diagnostic.id, diagnostic]));
        const nextIds = new Set(report.diagnostics.map(diagnostic => diagnostic.id));
        current = { ...next.revision, sequence, outcome: report.outcome, summary: report.summary,
          diagnostics: report.diagnostics, warnings: report.warnings, coverage: report.coverage,
          delta: { added: report.diagnostics.filter(diagnostic => !previous.has(diagnostic.id)),
            removed: [...previous.keys()].filter(identity => !nextIds.has(identity)), positionOnly: next.revision.delta.positionOnly } };
        currentReport = report;
        reports.set(sequence, report);
        return { status: 'revised', revision: current, identical: false, reacquired: next.reacquired ?? false };
      }
      async function run(kind: 'update' | 'sweep', changes: readonly SessionChange[], runControl?: RunControl,
        nextInvocation?: Pick<AnalysisInputs, 'project' | 'capabilities'>): Promise<SessionUpdate | { readonly status: 'unchanged'; readonly timings?: OperationTimings }> {
        if (sessionDisposed) throw new Error('Scripted session is disposed');
        if (nextInvocation) invocation = nextInvocation;
        const result = await invoke({ kind, inputs: { project: invocation.project, setup: { ...setup, capabilities: invocation.capabilities }, changes }, signal: runControl?.signal });
        if (runControl?.signal?.aborted) return { status: 'cancelled' };
        if (result.status !== 'captured') return result;
        if (result.report.outcome.execution === 'incomplete' || result.report.outcome.execution === 'unavailable') return { status: 'reported', report: result.report };
        level = 'hot';
        const accepted = accept(result);
        return result.timings ? { ...accepted, timings: result.timings } : accepted;
      }
      const initial = accept(first);
      const session: RetainedSession = {
        get current() { return current; },
        async update(changes, runControl, nextInvocation) {
          const result = await run('update', changes, runControl, nextInvocation);
          return result.status === 'unchanged' ? { status: 'revised', revision: current!, identical: true, reacquired: false } : result;
        },
        sweep: runControl => run('sweep', [], runControl),
        async verify(runControl) {
          verifyCalls.push(project.root ?? project.cwd);
          if (runControl?.signal?.aborted) return { status: 'cancelled' };
          const next = verifyPending.shift();
          const result = next ? await next(session) : { status: 'equal' as const, sequence: current!.sequence, elapsedMs: 1 };
          if (result.status === 'mismatch') current = result.revision;
          return result;
        },
        async report(_runControl, sequence = current?.sequence ?? 0) {
          entry.reportCalls.push(sequence);
          reportCalls.push({ root: project.root ?? project.cwd, sequence });
          return missingReports.has(sequence) ? null : reports.get(sequence) ?? null;
        },
        async releaseRevision(sequence) { entry.releasedRevisions.push(sequence); reports.delete(sequence); },
        status() { return { level, sequence: current?.sequence ?? 0, observedInputs: current?.inputs.length ?? 0,
          factBytes: retainedBytes, worker: { heapUsed: 1000, rss: 2000 }, compiler: { pid: level === 'hot' ? 123 : null, rss: level === 'hot' ? 1000 : null }, lastSweepAt: null }; },
        async releaseCompiler() {
          entry.releaseCompilerCalls++;
          const next = releasePending.shift();
          if (next) await next(session);
          level = 'warm';
        },
        async apiView(query, runControl) {
          entry.apiViewCalls.push(query);
          if (runControl?.signal?.aborted) return { status: 'cancelled' };
          const next = apiViewPending.shift();
          if (next) return await next(session, query);
          if (!current || query.sequence !== current.sequence) {
            return { status: 'unavailable', reason: 'invalid-revision', message: `Sequence ${query.sequence} is not current` };
          }
          return { status: 'projected', projection: { schema: 'ramify.api-view-projection/1', sequence: query.sequence,
            inputId: current.inputId, modules: [], bytes: 0 } };
        },
        async architectView(query, runControl) {
          entry.architectViewCalls.push(query);
          if (runControl?.signal?.aborted) return { status: 'cancelled' };
          const next = architectViewPending.shift();
          if (next) return await next(session, query, runControl?.signal);
          if (!current || query.sequence !== current.sequence) {
            return { status: 'unavailable', reason: 'invalid-revision', message: `Sequence ${query.sequence} is not current` };
          }
          return { status: 'projected', sequence: query.sequence, inputId: current.inputId, projection: {
            schema: 'ramify.architect-projection/3', sequence: query.sequence, inputId: current.inputId, root: 'fixture',
            modules: [], symbols: [], tests: [],
            counts: { coverage: 0, detailsUnavailable: 0, unknownShapes: 0, dynamicTitles: 0, testsUnavailable: 0, cut: 0 }, bytes: 0 } };
        },
        async measurements(sequence, runControl) {
          if (runControl?.signal?.aborted) return { status: 'cancelled' };
          if (!current || sequence !== current.sequence) {
            return { status: 'unavailable', reason: 'invalid-revision', message: `Sequence ${sequence} is not current` };
          }
          return { status: 'measured', measurements: { sequence, inputId: current.inputId,
            modules: [], files: [] } };
        },
        async affected(query, runControl) {
          entry.affectedCalls.push(query);
          if (runControl?.signal?.aborted) return { status: 'cancelled' };
          const next = affectedPending.shift();
          if (next) return await next(session, query, runControl?.signal);
          if (!current || query.sequence !== current.sequence) {
            return { status: 'unavailable', reason: 'invalid-revision', message: `Sequence ${query.sequence} is not current`, unknownModules: [] };
          }
          if (current.outcome.execution !== 'completed') {
            return { status: 'unavailable', reason: 'invalid-current', message: 'The current revision has no valid complete inventory', unknownModules: [] };
          }
          return { status: 'answered', sequence: query.sequence, result: scriptedSelection(current.inputId, query.modules ?? []) };
        },
        async explorerDetails(sequence, requests, runControl) {
          explorerDetailsCalls.push({ sequence, requests });
          if (runControl?.signal?.aborted) return { status: 'cancelled' };
          if (!current || sequence !== current.sequence) return { status: 'superseded', sequence: current?.sequence ?? 0 };
          if (level !== 'hot') return { status: 'unavailable', reason: 'compiler-released', message: 'Compiler released' };
          return { status: 'ready', sequence, details: requests.map(request => ({
            state: 'unavailable' as const, original: request.original, exportName: request.exportName,
            reason: 'missing-export' as const,
          })) };
        },
        async dispose() { if (sessionDisposed) return; entry.disposeCalls++; sessionDisposed = true; current = null; currentReport = null; reports.clear(); retainedBytes = 0; },
      };
      const entry: ScriptedSession = { session, project, reportCalls: [], releasedRevisions: [], apiViewCalls: [], architectViewCalls: [], affectedCalls: [], explorerDetailsCalls,
        releaseCompilerCalls: 0, disposeCalls: 0 };
      sessions.push(entry);
      return { status: 'opened', session, revision: initial.revision };
    },
    async dispose() { disposed = true; },
  };
  return { driver, calls, pending, sessions, reportCalls, verifyCalls, verifyPending, releasePending, apiViewPending, architectViewPending, affectedPending, missingReports, resolveCalls,
    /** Resolutions actually performed: calls that returned no known resolution. */
    get resolutions() { return resolveCalls.filter(call => !call.reused).length; },
    /** Change the discovery answers: every earlier resolution is invalid, optionally with a moved root. */
    changeDiscovery(root?: string) { discovery++; movedRoot = root; },
    get openCalls() { return calls.filter(call => call.kind === 'open'); },
    get updateCalls() { return calls.filter(call => call.kind === 'update'); },
    get sweepCalls() { return calls.filter(call => call.kind === 'sweep'); },
    set version(value: number) { fallback = capture(value); },
    set factBytes(value: number) { factBytes = value; },
    get disposed() { return disposed; },
  };
}
/** A fixed selection for a scripted revision: the seeds are the changed modules and
 * nothing depends on them. The fake computes no dependency closure. */
export function scriptedSelection(inputId: string, modules: readonly string[]): AffectedSelection {
  const changed = modules.map(id => ({ id, directory: id === 'fixture' ? '.' : `subs/${id}` }));
  return { schemaVersion: 'ramify.affected/4', inputId, paths: [], changedModules: changed, affectedModules: [], testModules: changed,
    selection: 'dependency-closure', widening: [], scope: { root: '/fixture', selection: 'given', invokedFrom: '/fixture',
      configuration: 'tsconfig.json', walkedAreas: [], ownership: { modules: [], exclusions: [] } },
    coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed' };
}
export async function flush(): Promise<void> { for (let index = 0; index < 80; index++) await Promise.resolve(); }
