import { randomUUID } from 'node:crypto';
import type { AnalysisReport, RunControl } from '../../../../analysis/src/interfaces/analysis.js';
import type { ApiViewProjection, ApiViewQueryOutcome, RetainedSession, SessionChange, SessionRevision } from '../../../../analysis/src/interfaces/session.js';
import type { ArchitectViewProjection, ArchitectViewQueryOutcome } from '../../../../analysis/src/interfaces/architect-view.js';
import type { ProjectRequest, ProjectResolution } from '../../../../analysis/subs/project/src/interfaces/project.js';
import type { DependencyAnalyzerOutcome } from '../../../../analysis/src/interfaces/dependency-analyzer.js';
import type { ApiViewQueryLimits, ApiViewRequest, CaptureTimings, CaptureWork, CheckOutcome, CheckRequest, ContextApiViewOutcome, ContextDependencyDiagramOutcome, ContextDependencyFactsOutcome, ContextEvent, ContextExplorerDetailsOutcome, ContextManager, ContextManagerOptions, ContextRevision, ContextSetup, ContextStatus, ContextToken, DependencyDiagramRequest, ExplorerDetailsRequest, FreshnessRecord, OpenOutcome, ReplyTimings, RevisionCause, Unavailable, WatchBatch, WatchEvent } from './interfaces/contexts.js';
import type { ExplorerDetailDelivery, LiveContext } from './context.js';
import { createHistory } from './history.js';
import type { HistoryEntry } from './history.js';
import { createContextId, createFingerprints, createRevisionId } from './tokens.js';
import { complete, completeApiView, completeEntry, invocationKey, projectKey, spanBatches } from './queue.js';
import type { Invocation, PendingApiView, PendingCheck, PendingEntry } from './queue.js';

/** `contracts.md`'s iteration-1 frozen `RetainedSession.apiView` bounds, and Plan 2B's
 * `architectView` bounds, used when `ContextManagerOptions.apiViewLimits` supplies none. */
const defaultApiViewLimits: ApiViewQueryLimits = {
  details: { maxSignatureBytes: 2048, maxDocumentationBytes: 512, maxOverloads: 8, maxResultBytes: 32 * 1024 ** 2 },
  maxAreaBytes: 32 * 1024 ** 2, maxInvocationBytes: 256 * 1024 ** 2,
  architect: { details: { maxSignatureBytes: 240, maxDocumentationBytes: 280, maxOverloads: 4, maxResultBytes: 32 * 1024 ** 2 },
    tests: { maxTitleBytes: 240, maxTitlesPerRecord: 40, maxResultBytes: 16 * 1024 ** 2 }, maxProjectionBytes: 64 * 1024 ** 2 },
};

const implemented = new Set(['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage']);
function unavailable(reason: Unavailable['reason'], message: string = reason): Unavailable { return { status: 'unavailable', reason, message }; }
/** A queued check entry using `published` freshness: the only kind of pending
 * entry an apiView request (always synchronized) can never be. */
function publishedCheck(entry: PendingEntry): entry is PendingCheck { return entry.kind === 'check' && entry.request.freshness.mode === 'published'; }
/** Distinct project requests whose resolutions one context keeps for reuse. */
const knownResolutions = 4;
/** Paths whose change is a configuration change: the compiler configuration, the package
 * manifests and the lockfiles. Files the configuration helper read, such as an `extends`
 * target, are recognized instead by the configuration role their observation carries. */
const configurationPath = /(?:^|\/)(?:tsconfig[^/]*\.json|package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/;
/** What an update or sweep returns; an update never returns unchanged. */
type SweepResult = Awaited<ReturnType<RetainedSession['sweep']>>;
const noWork = (): { -readonly [K in keyof CaptureWork]: number } => ({ invocationCheck: 0, promotion: 0, workerStatus: 0, workerRoundTrip: 0, sweep: 0 });
/** Every caller of a job receives the facts answer; `dependencyDiagram` drops its test references. */
type DiagramAnswer = ContextDependencyFactsOutcome | (Unavailable & { readonly requestId: string });
/** One caller waiting for the daemon's dependency diagram job. */
interface DiagramCaller {
  readonly requestId: string;
  readonly lease: string;
  readonly resolve: (outcome: DiagramAnswer) => void;
  cleanup: () => void;
  settled: boolean;
}
/** The daemon's single dependency diagram job: one context, one pinned revision and a job-owned controller. */
interface DiagramJob {
  readonly context: LiveContext;
  readonly revision: ContextRevision;
  readonly controller: AbortController;
  readonly callers: Set<DiagramCaller>;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}

export function createContextManager(options: ContextManagerOptions): ContextManager {
  const { driver, watcher, clock, budgets } = options;
  const apiViewLimits = options.apiViewLimits ?? defaultApiViewLimits;
  const contexts = new Map<string, LiveContext>();
  const lifetimes = new Set<Promise<unknown>>();
  const resolving = new Set<AbortController>();
  const cleanupFailures: unknown[] = [];
  let disposed = false;
  let pumping = false;
  let active = 0;
  let disposing: Promise<void> | undefined;
  /** At most one dependency diagram job daemon-wide; it occupies the slot until its runner settles. */
  let diagramJob: DiagramJob | null = null;
  function track<T>(promise: Promise<T>): Promise<T> {
    lifetimes.add(promise); void promise.finally(() => lifetimes.delete(promise)).catch(() => {}); return promise;
  }
  function cleanup(promise: Promise<void>): Promise<void> {
    return track(promise.catch(error => { cleanupFailures.push(error); throw error; }));
  }
  function pending(context: LiveContext): PendingEntry[] { return [...context.queue, ...context.running?.requests ?? [], ...context.deliveries]; }
  function diagramCallers(context: LiveContext): number { return diagramJob?.context === context ? diagramJob.callers.size : 0; }
  function held(context: LiveContext): boolean { return context.subscriptions.size > 0 || pending(context).some(entry => !entry.settled)
    || [...context.explorerDeliveries].some(entry => !entry.settled) || diagramCallers(context) > 0; }
  function snapshot(context: LiveContext): ContextStatus {
    const requests = new Set(pending(context).filter(entry => !entry.settled)).size
      + [...context.explorerDeliveries].filter(entry => !entry.settled).length + diagramCallers(context);
    const session = context.session?.status() ?? null;
    return freeze({ token: context.token, selection: context.selection, scope: context.scope,
      state: context.state, level: session?.level ?? 'cold', session, synchronization: context.synchronization,
      published: context.history.published?.revision ?? null, lastValid: context.lastValid,
      pending: { requests, changedPaths: context.paths.size, analysisRunning: !!context.running },
      history: { retained: context.history.count, bytes: context.history.bytes, oldest: context.history.oldest?.revision.revision ?? null },
      retainedBytes: (session?.factBytes ?? 0) + (context.diagram?.bytes ?? 0), leases: { subscriptions: context.subscriptions.size, requests },
      watcher: context.watcherState, openedAt: context.openedAt, lastActivityAt: context.lastActivityAt,
      demoting: !!context.demoting, unresponsiveSince: context.unresponsiveSince });
  }
  function emit(context: LiveContext, event: ContextEvent): void {
    for (const subscription of [...context.subscriptions.values()]) { try { subscription.listener(event); } catch { /* Consumer isolation. */ } }
  }
  function changed(context: LiveContext): void { emit(context, { type: 'status-changed', token: context.token, current: snapshot(context), coalesced: 0 }); }
  function closeWatcher(context: LiveContext): void {
    const handle = context.watcher; context.watcher = null; context.watcherState = 'disposed';
    if (handle) void cleanup(handle.close());
  }
  function stopTimers(context: LiveContext): void {
    context.debounce?.(); context.sweepTimer?.(); context.auditTimer?.(); context.idle?.();
    context.debounce = context.sweepTimer = context.auditTimer = context.idle = null;
  }
  function releaseSession(context: LiveContext): Promise<void> {
    const session = context.session; context.session = null; context.publishedSession = null; context.versions.clear(); context.observedSequence = 0;
    // An unavailable session resolves again: known resolutions leave with it.
    context.resolutions.clear();
    return session ? cleanup(session.dispose()) : Promise.resolve();
  }
  function evict(context: LiveContext, reason: 'idle' | 'pressure' | 'disposed'): void {
    context.state = 'evicted'; context.running?.controller.abort();
    for (const entry of pending(context)) completeEntry(entry, { ...unavailable(reason === 'disposed' ? 'disposed' : 'expired-generation'), requestId: entry.request.requestId });
    for (const entry of context.explorerDeliveries) completeExplorerDelivery(entry, {
      ...unavailable(reason === 'disposed' ? 'disposed' : 'expired-generation'), requestId: entry.request.requestId,
    });
    context.diagram = null;
    endDiagramJob(context, caller => ({ ...unavailable(reason === 'disposed' ? 'disposed' : 'expired-generation'), requestId: caller.requestId }));
    context.queue.length = 0; stopTimers(context); closeWatcher(context);
    // Dispose owns all remaining fact versions; do not send per-version releases after it.
    void releaseSession(context); context.history.dispose(); context.paths.clear(); context.requested.clear(); context.watched = null; context.invocations.clear(); contexts.delete(context.token.context);
    emit(context, { type: 'context-evicted', token: context.token, reason }); context.subscriptions.clear();
  }
  function answerDiagram(caller: DiagramCaller, outcome: DiagramAnswer): void {
    if (caller.settled) return;
    caller.settled = true;
    caller.cleanup();
    caller.resolve(outcome);
  }
  /** Abort this context's diagram job, if one runs, and answer each of its callers. The
   * job keeps the daemon's slot until its runner settles; it never restarts by itself. */
  function endDiagramJob(context: LiveContext, answer: (caller: DiagramCaller) => DiagramAnswer): void {
    const job = diagramJob;
    if (!job || job.context !== context) return;
    job.controller.abort();
    const callers = [...job.callers]; job.callers.clear();
    for (const caller of callers) answerDiagram(caller, answer(caller));
  }
  /** A newer revision publishes, or the published revision is gone: the retained result is
   * released and a job for another revision is aborted with its callers superseded. */
  function supersedeDiagram(context: LiveContext, current: ContextRevision | null): void {
    if (context.diagram && context.diagram.revision !== current?.revision) context.diagram = null;
    if (diagramJob?.context === context && diagramJob.revision.revision !== current?.revision) {
      endDiagramJob(context, caller => ({ status: 'superseded', requestId: caller.requestId, revision: current }));
    }
  }
  function completeExplorerDelivery(entry: ExplorerDetailDelivery, outcome: ContextExplorerDetailsOutcome): void {
    if (entry.settled) return;
    entry.settled = true;
    entry.cleanup();
    entry.resolve(outcome);
  }
  async function demote(context: LiveContext): Promise<void> {
    if (context.demoting) return context.demoting;
    const session = context.session;
    if (!session || session.status().level !== 'hot') return;
    // The released compiler leaves nothing to audit: a demotion cancels the
    // armed audit rather than letting it run against a warm session.
    cancelAudit(context);
    const work = session.releaseCompiler();
    // A session that does not answer must not hold the hot budget: the deadline
    // records the unresponsive demotion and evicts the context, whose disposal
    // ends the worker and its compiler server.
    const bounded = new Promise<void>(resolve => {
      let settled = false;
      const cancelDeadline = clock.schedule(budgets.demoteDeadlineMs, () => {
        if (settled) return;
        // A session that no longer holds the compiler answered; only its
        // acknowledgement is outstanding, which the deadline does not punish.
        if (context.session?.status().level !== 'hot') { settled = true; resolve(); return; }
        settled = true; context.unresponsiveSince = clock.now();
        if (context.state !== 'evicted') { changed(context); evict(context, 'pressure'); }
        resolve();
      });
      const finish = (): void => { if (settled) return; settled = true; cancelDeadline(); resolve(); };
      void work.then(finish, finish);
    });
    context.demoting = bounded;
    try { await bounded; } finally { context.demoting = null; if (context.state !== 'evicted') changed(context); }
  }
  async function hotBudget(preferred?: LiveContext): Promise<void> {
    const hot = [...contexts.values()].filter(item => item.session?.status().level === 'hot')
      .sort((a, b) => Number(a === preferred) - Number(b === preferred) || a.lastActivityAt - b.lastActivityAt);
    while (hot.length > budgets.maxHotContexts) await demote(hot.shift()!);
  }
  async function cool(context: LiveContext): Promise<void> {
    if (context.cooling || context.running || held(context)) return;
    context.cooling = true;
    try {
      const current = context.history.published;
      const report = current && (current.report ?? await context.session?.report(undefined, current.sequence));
      if (held(context) || context.running || disposed || context.state === 'evicted') return;
      if (current && (!report || !context.history.retainPublished(freeze(report)))) { evict(context, 'pressure'); return; }
      context.state = 'cold'; stopTimers(context); closeWatcher(context);
      await releaseSession(context); context.paths.clear(); context.requested.clear(); context.watched = null; context.sweepRequired = true; context.conservative = true;
      changed(context);
    } finally { context.cooling = false;
      if (!disposed && context.state === 'cold' && held(context)) touch(context);
      scheduleIdle(context); kick(); }
  }
  function scheduleIdle(context: LiveContext): void {
    context.idle?.(); context.idle = null;
    if (disposed || context.state === 'evicted' || context.cooling) return;
    if (held(context)) { context.hadLease = true; return; }
    if (context.hadLease) { context.lastActivityAt = clock.now(); context.hadLease = false; }
    const level = context.session?.status().level;
    const elapsed = clock.now() - context.lastActivityAt;
    const delay = context.state === 'cold' ? budgets.coldRetainMs : level === 'hot'
      ? Math.max(0, budgets.warmIdleMs - elapsed) : Math.max(0, budgets.warmIdleMs + budgets.coldRetainMs - elapsed);
    context.idle = clock.schedule(delay, () => {
      context.idle = null;
      if (held(context)) return;
      if (context.state === 'cold') { evict(context, 'idle'); return; }
      if (context.running) return; // Completion reschedules the idle transition.
      track((async () => { if (context.session?.status().level === 'hot') await demote(context); else await cool(context); scheduleIdle(context); })());
    });
  }
  function attach(context: LiveContext): void {
    if (context.attaching || context.watcher || context.state === 'cold' || context.state === 'evicted' || disposed) return;
    context.attaching = true;
    track(Promise.resolve().then(() => watcher.watch(context.selection.root, (events, batch) => watchEvents(context, events, batch)))
      .then(async handle => {
        if (context.state === 'cold' || context.state === 'evicted' || disposed) await cleanup(handle.close());
        else { context.watcher = handle; context.watcherState = 'active';
          if (context.synchronization === 'watcher-unavailable') context.synchronization = context.sweepRequired || (context.running && context.running.sweep !== 'periodic') || context.background ? 'reconciling' : 'synchronized'; }
      }).catch(() => {
        if (context.state !== 'evicted' && !disposed) { context.watcherState = 'unavailable'; context.synchronization = 'watcher-unavailable'; context.sweepRequired = true; }
      }).finally(() => { context.attaching = false; }));
  }
  /** A demotion, a disposal or a finished attempt leaves no audit armed. */
  function cancelAudit(context: LiveContext): void {
    context.auditTimer?.(); context.auditTimer = null; context.auditRequired = false;
    if (context.background === 'verify') context.background = null;
  }
  /** At most one audit per revision, and only while the session is hot: the
   * audit recomputes from the compiler, so a demoted session has nothing to
   * audit until an update makes it hot again. */
  function auditLater(context: LiveContext): void {
    context.auditTimer?.(); context.auditTimer = null;
    if (!context.session || disposed || context.state === 'cold') return;
    if (context.session.status().level !== 'hot') { cancelAudit(context); return; }
    if (context.auditedSequence === context.session.current?.sequence) return;
    if (context.auditRequired) { context.background ??= 'verify'; return; }
    context.auditTimer = clock.schedule(Math.max(1, context.lastActivityAt + budgets.sweepIntervalMs - clock.now()), () => {
      context.auditTimer = null;
      if (!context.session || context.state === 'cold' || disposed) return;
      if (context.session.status().level !== 'hot') { cancelAudit(context); return; }
      if (pending(context).some(entry => !entry.settled)) return;
      context.auditRequired = true;
      if (context.running) return;
      context.background ??= 'verify'; kick();
    });
  }
  function sweepLater(context: LiveContext): void {
    // Starting a sweep cancels this timer and its completion reschedules it.
    if (context.sweepTimer || context.running?.sweep || !context.session || disposed || context.state === 'cold') return;
    context.sweepTimer = clock.schedule(Math.max(1, context.lastSweepAt + budgets.sweepIntervalMs - clock.now()), () => {
      context.sweepTimer = null;
      if (!context.session || disposed || context.state === 'cold' || context.running?.sweep) return;
      if (clock.now() - context.lastSweepAt < budgets.sweepIntervalMs) { sweepLater(context); return; }
      // Warm inactive sessions keep their facts until activity resumes. A
      // periodic sweep is maintenance: it neither marks the context reconciling
      // nor makes a covered request wait.
      if (held(context) || clock.now() - context.lastActivityAt < budgets.warmIdleMs) { context.periodicSweepDue = true; kick(); }
    });
  }
  function touch(context: LiveContext): void {
    context.lastActivityAt = clock.now(); context.auditRequired = false;
    if (context.state === 'cold' && !context.cooling) { context.state = 'opening'; context.sweepRequired = true; context.conservative = true; context.background = 'open'; attach(context); kick(); }
    if (context.session && !context.running?.sweep && clock.now() - context.lastSweepAt >= budgets.sweepIntervalMs) { context.periodicSweepDue = true; kick(); }
    auditLater(context); sweepLater(context); scheduleIdle(context); track(hotBudget(context));
  }
  function lookup(token: ContextToken): LiveContext | Unavailable {
    if (disposed) return unavailable('disposed');
    const context = contexts.get(token.context);
    if (!context) return unavailable('unknown-context');
    if (context.token.generation !== token.generation) return unavailable('expired-generation');
    return context;
  }
  function watchEvents(context: LiveContext, events: readonly WatchEvent[], batch?: WatchBatch): void {
    if (disposed || context.state === 'cold' || context.state === 'evicted' || !events.length) return;
    const now = clock.now();
    context.watched = spanBatches(context.watched, batch ? { receivedAt: batch.receivedAt, flushedAt: batch.flushedAt } : { receivedAt: now, flushedAt: now });
    for (const event of events) {
      if (event.kind === 'overflow' || event.kind === 'error') { context.conservative = true; context.sweepRequired = true; }
      else { context.paths.set(event.path, event.kind === 'renamed' ? 'unknown' : event.kind); context.requested.delete(event.path); }
      if (configurationPath.test(event.path) && !context.sweepRequired) context.sweepRequired = 'configuration';
      if (event.kind === 'error') { closeWatcher(context); context.watcherState = 'unavailable'; }
    }
    if (context.paths.size > budgets.maxQueuedPaths) { context.paths.clear(); context.requested.clear(); context.conservative = true; context.sweepRequired = true; }
    // An active request keeps its capture; newer writes queue behind it. Idle
    // background work may be cancelled, but every consumed path is restored.
    // A cancelled periodic sweep stays maintenance; its start keeps the cadence.
    if (context.running?.background) {
      context.running.controller.abort(); if (context.running.sweep !== 'periodic') context.sweepRequired = true;
      for (const change of context.running.changes) { context.paths.set(change.path, change.kind); context.requested.delete(change.path); }
      context.watched = spanBatches(context.watched, context.running.watch);
    }
    if (context.paths.size > budgets.maxQueuedPaths) { context.paths.clear(); context.requested.clear(); context.conservative = true; context.sweepRequired = true; }
    context.synchronization = context.watcherState === 'unavailable' ? 'watcher-unavailable' : context.conservative ? 'conservative' : 'reconciling';
    context.background = context.conservative ? 'conservative' : 'watch';
    context.debounce?.(); context.debounce = clock.schedule(budgets.debounceMs, () => { context.debounce = null; kick(); }); changed(context);
  }
  function totalBytes(): number { return [...contexts.values()].reduce((sum, item) => sum + item.history.bytes + (item.session?.status().factBytes ?? 0) + (item.diagram?.bytes ?? 0), 0); }
  async function trim(context: LiveContext, candidateBytes: number): Promise<boolean> {
    // The session already bounds shared historical facts and candidate overlap.
    // Here both process locations count toward the context/global admission.
    while ((context.session?.status().factBytes ?? 0) > budgets.maxRetainedBytesPerContext
      || totalBytes() + candidateBytes > budgets.maxRetainedBytesGlobal) {
      const historical = [...contexts.values()].filter(item => item.history.count > 1)
        .sort((a, b) => a.history.oldest!.revision.publishedAt - b.history.oldest!.revision.publishedAt);
      let removed = false;
      for (const item of historical) { if (item.history.discardOldest()) { removed = true; break; } }
      if (removed) { await Promise.all([...releaseWork]); continue; }
      const cold = [...contexts.values()].filter(item => item !== context && item.state === 'cold' && !held(item))
        .sort((a, b) => a.lastActivityAt - b.lastActivityAt)[0];
      if (cold) { evict(cold, 'pressure'); continue; }
      return false;
    }
    return true;
  }
  const releaseWork = new Set<Promise<void>>();
  function releaseVersion(context: LiveContext, entry: HistoryEntry<ContextRevision>): void {
    const session = context.session;
    if (!session || entry.report !== null || entry.sequence === session.current?.sequence) return;
    context.versions.delete(entry.sequence);
    const promise = cleanup(session.releaseRevision(entry.sequence)); releaseWork.add(promise);
    void promise.finally(() => releaseWork.delete(promise)).catch(() => {});
  }
  function observeVersion(context: LiveContext): void {
    const sequence = context.session?.current?.sequence ?? context.observedSequence;
    for (let value = context.observedSequence + 1; value <= sequence; value++) context.versions.add(value);
    context.observedSequence = sequence;
  }
  async function releaseUnpublished(context: LiveContext): Promise<void> {
    const session = context.session;
    if (!session?.current) return;
    observeVersion(context);
    for (const sequence of context.versions) {
      if (sequence === session.current.sequence || context.history.hasSequence(sequence)) continue;
      await cleanup(session.releaseRevision(sequence)); context.versions.delete(sequence);
    }
  }
  /** Add an operation's timings to its capture's work; a sweep's round trip also counts as `sweep`. */
  function account(work: ReturnType<typeof noWork>, result: SweepResult, sweep: boolean): void {
    const timings = 'timings' in result ? result.timings : undefined;
    if (!timings) return;
    work.invocationCheck += timings.invocationCheck; work.promotion += timings.promotion;
    work.workerStatus += timings.workerStatus ?? 0; work.workerRoundTrip += timings.workerRoundTrip ?? 0;
    if (sweep) work.sweep += timings.workerRoundTrip ?? 0;
  }
  async function sessionWork(context: LiveContext, work: ReturnType<typeof noWork>, run: () => Promise<SweepResult>, sweep = false): Promise<SweepResult> {
    let result = await run(); observeVersion(context); account(work, result, sweep);
    if (result.status === 'reported' && result.report.diagnostics.some(item => item.limit?.name === 'maxRetainedFactBytes')) {
      // Reclaim unpinned historical versions before one bounded retry. The
      // session rejects a candidate before publication, preserving current facts.
      let released = false;
      while (context.history.discardOldest()) released = true;
      await Promise.all([...releaseWork]); await releaseUnpublished(context);
      if (released) { result = await run(); observeVersion(context); account(work, result, sweep); }
    }
    return result;
  }
  function fresh(entry: PendingEntry, started: number | null, verified: boolean, reusedRevision = false): FreshnessRecord {
    return { mode: entry.request.freshness.mode, acknowledged: entry.acknowledged, captureStarted: started, verified, reusedRevision };
  }
  /** One context serves invocations that named the root and invocations that found it from a
   * subdirectory. A report states the root selection of the invocation it answers, taken from
   * that request's own resolution; the captured inventory, and the `inputId` over it, stay the
   * context's. An invocation whose resolution the context no longer holds keeps the context's. */
  function stated(context: LiveContext, entry: PendingCheck, report: AnalysisReport): AnalysisReport {
    const scope = report.scope;
    if (!scope) return report;
    const resolution = context.resolutions.get(projectKey(entry.invocation.project));
    if (resolution?.status !== 'resolved' || resolution.root !== scope.root) return report;
    if (resolution.selection === scope.selection && resolution.invokedFrom === scope.invokedFrom) return report;
    return { ...report, scope: { ...scope, selection: resolution.selection, invokedFrom: resolution.invokedFrom } };
  }
  async function deliver(context: LiveContext, entry: PendingCheck, publication: HistoryEntry<ContextRevision>, started: number | null, reused = false,
    timings: ReplyTimings = { ...noWork(), publication: 0 }): Promise<void> {
    if (entry.settled) return;
    const baseline = entry.request.since ? context.history.get(entry.request.since) : context.history.getPrevious(publication.revision.revision);
    if (entry.request.since && !baseline) { complete(entry, { ...unavailable('evicted-revision'), requestId: entry.request.requestId }); return; }
    const unpin = context.history.pin(publication.revision.revision);
    const unpinBase = baseline ? context.history.pin(baseline.revision.revision) : () => {};
    context.deliveries.add(entry);
    try {
      const previous = new Set(baseline?.diagnostics.map(item => item.id));
      const current = new Set(publication.diagnostics.map(item => item.id));
      const delta = freeze({ since: baseline?.revision.revision ?? null,
        findings: publication.diagnostics.map(item => ({ ...item, new: !previous.has(item.id) })),
        removed: [...previous].filter(id => !current.has(id)), warnings: publication.warnings, coverage: publication.coverage });
      const report = entry.request.scope === 'report'
        ? publication.report ?? await context.session?.report(undefined, publication.sequence) ?? null : null;
      if (entry.request.scope === 'report' && !report) { complete(entry, { ...unavailable('evicted-revision'), requestId: entry.request.requestId }); return; }
      if (report) context.scope = report.scope;
      complete(entry, { status: 'reported', requestId: entry.request.requestId, published: true, revision: publication.revision,
        delta, report: freeze(report && stated(context, entry, report)), freshness: fresh(entry, started, entry.request.freshness.mode === 'synchronized', reused), timings: freeze({ ...timings }) });
    } catch (error) { complete(entry, { ...unavailable('analysis-failed', String(error)), requestId: entry.request.requestId }); }
    finally { unpinBase(); unpin(); context.deliveries.delete(entry); scheduleIdle(context); }
  }
  /**
   * Deliver one queued API-view request from `data`, the session revision this
   * same capture just published (or, for a covered request, its already-current
   * revision): call `RetainedSession.apiView` and `architectView`, each only
   * when its view is requested, both at that sequence while `publication`'s
   * history slot is pinned, translate their outcomes, and release the ephemeral
   * projections by simply letting them go out of scope once this async function
   * returns. Settling the request aborts a session query still running.
   */
  async function deliverApiView(context: LiveContext, entry: PendingApiView, publication: HistoryEntry<ContextRevision>, data: SessionRevision,
    started: number | null, reused = false, timings: ReplyTimings = { ...noWork(), publication: 0 }): Promise<void> {
    if (entry.settled) return;
    const unpin = context.history.pin(publication.revision.revision);
    const views = new Set(entry.request.views ?? ['api']);
    const controller = new AbortController();
    const release = entry.cleanup;
    entry.cleanup = () => { controller.abort(); release(); };
    const control = { signal: controller.signal };
    const requestId = entry.request.requestId;
    context.deliveries.add(entry);
    /** Either query's answer other than `projected` settles the whole request. */
    const settle = (outcome: Exclude<ApiViewQueryOutcome | ArchitectViewQueryOutcome, { readonly status: 'projected' }>): void => {
      if (outcome.status === 'superseded') {
        context.synchronization = 'reconciling'; context.sweepRequired = true;
        completeApiView(entry, { status: 'superseded', requestId, revision: publication.revision });
      } else if (outcome.status === 'cancelled') {
        completeApiView(entry, { status: 'cancelled', requestId });
      } else {
        completeApiView(entry, { ...unavailable(outcome.reason === 'resource-limit' ? 'resource-unavailable' : 'analysis-failed',
          `${outcome.reason}: ${outcome.message}`), requestId });
      }
    };
    try {
      const session = context.session;
      if (!session) { completeApiView(entry, { ...unavailable('analysis-failed', 'Session lost its published revision'), requestId }); return; }
      let projection: ApiViewProjection | null = null, architect: ArchitectViewProjection | null = null;
      if (views.has('api')) {
        const outcome = await session.apiView({ sequence: data.sequence, selection: entry.request.selection,
          details: apiViewLimits.details, maxAreaBytes: apiViewLimits.maxAreaBytes, maxInvocationBytes: apiViewLimits.maxInvocationBytes }, control);
        if (outcome.status !== 'projected') { settle(outcome); return; }
        projection = outcome.projection;
      }
      if (views.has('architect')) {
        if (entry.settled) return;
        const outcome = await session.architectView({ sequence: data.sequence, ...apiViewLimits.architect }, control);
        if (outcome.status !== 'projected') { settle(outcome); return; }
        architect = outcome.projection;
      }
      completeApiView(entry, { status: 'projected', requestId, revision: publication.revision,
        freshness: fresh(entry, started, true, reused), projection, architect, timings: freeze({ ...timings }) });
    } catch (error) { completeApiView(entry, { ...unavailable('analysis-failed', String(error)), requestId }); }
    finally { unpin(); context.deliveries.delete(entry); scheduleIdle(context); }
  }
  /** A named path the daemon already knows as configuration: one the configuration path
   * pattern matches, or one the acquisition observed with the configuration role, such as
   * an `extends` target the configuration helper read. */
  function namesConfiguration(context: LiveContext, path: string): boolean {
    return configurationPath.test(path)
      || !!context.session?.current?.inputs.some(input => input.path === path && input.role === 'configuration');
  }
  /** The expected-content rendezvous check `check` and `apiView` share: absent
   * evidence of a named path is `unobserved`, a differing hash is a mismatch,
   * synchronized freshness with nothing expected or nothing differing is null. */
  function expectationMismatch(entry: PendingEntry, data: SessionRevision):
    { readonly kind: 'unobserved'; readonly path: string }
    | { readonly kind: 'mismatch'; readonly mismatches: readonly { readonly path: string; readonly expected: string | null; readonly observed: string | null }[] }
    | null {
    if (entry.request.freshness.mode !== 'synchronized') return null;
    const mismatches: { path: string; expected: string | null; observed: string | null }[] = [];
    for (const expected of entry.request.freshness.expect) {
      const input = data.inputs.find(item => item.path === expected.path && item.role !== 'directory');
      if (!input) return { kind: 'unobserved', path: expected.path };
      const observed = input.role === 'absent' ? null : input.sha256;
      if (observed !== expected.sha256) mismatches.push({ path: expected.path, expected: expected.sha256, observed });
    }
    return mismatches.length ? { kind: 'mismatch', mismatches } : null;
  }
  function mismatch(context: LiveContext, entry: PendingCheck, data: SessionRevision): CheckOutcome | null {
    const found = expectationMismatch(entry, data);
    if (!found) return null;
    if (found.kind === 'unobserved') return { ...unavailable('unobserved-input', `Input was not observed: ${found.path}`), requestId: entry.request.requestId };
    return { status: 'superseded', requestId: entry.request.requestId, revision: context.history.published?.revision ?? null, mismatches: found.mismatches };
  }
  function mismatchApiView(context: LiveContext, entry: PendingApiView, data: SessionRevision): ContextApiViewOutcome | null {
    const found = expectationMismatch(entry, data);
    if (!found) return null;
    if (found.kind === 'unobserved') return { ...unavailable('unobserved-input', `Input was not observed: ${found.path}`), requestId: entry.request.requestId };
    return { status: 'superseded', requestId: entry.request.requestId, revision: context.history.published?.revision ?? null };
  }
  async function publish(context: LiveContext, data: SessionRevision, cause: RevisionCause, capture: CaptureTimings): Promise<boolean> {
    if (!['completed', 'invalid'].includes(data.outcome.execution)) throw new Error('Unpublishable session revision');
    if (context.publishedSession === context.session && context.history.published?.sequence === data.sequence) return trim(context, 0);
    const revision = freeze({ token: context.token, revision: createRevisionId(context.token.generation, context.sequence + 1),
      sequence: context.sequence + 1, publishedAt: clock.now(), cause,
      fingerprints: createFingerprints(data.inputId, data.inputs, context.selection.setup.registry, options.engine),
      changed: data.changed, checked: data.checked, delta: { added: data.delta.added.length, removed: data.delta.removed.length, positionOnly: data.delta.positionOnly.length },
      timings: data.timings, capture, outcome: data.outcome, summary: data.summary });
    const candidateBytes = Buffer.byteLength(JSON.stringify({ revision, sequence: data.sequence, diagnostics: data.diagnostics,
      warnings: data.warnings, coverage: data.coverage, delta: data.delta, report: null }));
    if (candidateBytes > budgets.maxHistoryBytes || !budgets.maxHistoryRevisions) return false;
    // Make room in both locations before admitting a header; pinned reads keep
    // their exact version and cause explicit pressure rather than substitution.
    while ((context.history.count >= budgets.maxHistoryRevisions || context.history.bytes + candidateBytes > budgets.maxHistoryBytes)
      && context.history.discardOldest()) { await Promise.all([...releaseWork]); }
    if (!await trim(context, candidateBytes)) return false;
    if (!context.history.append(revision, data)) return false;
    await Promise.all([...releaseWork]);
    context.sequence++; context.publishedSession = context.session;
    if (data.outcome.execution === 'completed') context.lastValid = revision;
    supersedeDiagram(context, revision);
    emit(context, { type: 'revision-published', token: context.token, revision, coalesced: 0 });
    return true;
  }
  async function abandonCandidate(context: LiveContext): Promise<void> {
    const publication = context.history.published;
    const report = publication && (publication.report ?? await context.session?.report(undefined, publication.sequence));
    if (!publication || !report || !context.history.retainPublished(freeze(report))
      || totalBytes() - (context.session?.status().factBytes ?? 0) > budgets.maxRetainedBytesGlobal) {
      context.history.dispose(); context.lastValid = null;
      context.history = createHistory(budgets.maxHistoryRevisions, budgets.maxHistoryBytes, entry => releaseVersion(context, entry));
      supersedeDiagram(context, null);
    }
    context.state = 'cold'; context.sweepRequired = true; context.background = null;
    stopTimers(context); closeWatcher(context); await releaseSession(context);
  }
  async function analyze(context: LiveContext): Promise<void> {
    const first = context.queue.find(entry => !entry.settled && entry.request.freshness.mode === 'synchronized');
    const invocation: Invocation = first?.invocation ?? context.invocation;
    const entries: PendingEntry[] = [];
    if (first) for (const entry of context.queue) {
      if (entry.settled || entry.request.freshness.mode !== 'synchronized') continue;
      if (invocationKey(entry.invocation) !== invocationKey(invocation)) break;
      entries.push(entry);
    }
    for (const entry of entries) context.queue.splice(context.queue.indexOf(entry), 1);
    const cause: RevisionCause = !context.session ? 'open' : context.conservative ? 'conservative' : entries.length ? 'request' : context.background ?? 'sweep';
    const changes: SessionChange[] = [...context.paths].map(([path, kind]) => ({ path, kind }));
    // A periodic sweep runs alone. A due one waits behind requests and known
    // changes rather than lengthening their capture.
    const sweepKind = context.sweepRequired || entries.some(entry => entry.needsSweep) ? 'required' : cause === 'sweep' ? 'periodic' : null;
    const sweep = sweepKind !== null;
    // Only a requirement from configuration path events may be satisfied by the update's reacquisition.
    const reacquirable = context.sweepRequired === 'configuration' && !entries.some(entry => entry.needsSweep);
    /** This capture is the revision's idle audit; it recomputes and compares, and changes nothing. */
    const auditing = !!context.session && cause === 'verify' && !changes.length && !sweep;
    const watch = context.watched, work = noWork();
    context.paths.clear(); context.requested.clear(); context.watched = null; context.conservative = false; context.sweepRequired = false; context.background = null;
    context.debounce?.(); context.debounce = null;
    const controller = new AbortController(); const started = clock.now();
    if (sweep) { context.periodicSweepDue = false; context.lastSweepAt = started; context.sweepTimer?.(); context.sweepTimer = null; }
    context.running = { controller, requests: entries, changes, background: !entries.length, sweep: sweepKind, started, watch }; active++;
    if (sweepKind !== 'periodic') context.synchronization = context.watcherState === 'unavailable' ? 'watcher-unavailable' : context.sequence ? 'reconciling' : 'initializing';
    changed(context);
    const control = { signal: controller.signal };
    let published = false;
    try {
      await context.demoting;
      let run: SweepResult;
      if (!context.session) {
        const opened = await driver.open(invocation.project, invocation.setup, control);
        if (opened.status === 'opened') {
          if (controller.signal.aborted || disposed || context.state === 'evicted') { await opened.session.dispose(); return; }
          context.session = opened.session; context.publishedSession = null; context.invocation = invocation; context.lastSweepAt = started;
          context.observedSequence = 0; context.versions.clear(); observeVersion(context);
          run = { status: 'revised', revision: opened.revision, identical: false, reacquired: false };
        } else run = opened;
      } else if (auditing) {
        const verified = await context.session.verify(control);
        if (verified.status === 'cancelled') run = verified;
        else {
          // The attempt counts for this revision, whether it compared the facts
          // or reported that it could not: a failed audit waits for the next
          // revision rather than running again at once.
          context.auditedSequence = verified.status === 'unavailable'
            ? context.session.current?.sequence ?? context.auditedSequence
            : verified.status === 'mismatch' ? verified.revision.sequence : verified.sequence;
          context.auditRequired = false;
          run = verified.status === 'mismatch' ? { status: 'revised', revision: verified.revision, identical: false, reacquired: false } : { status: 'unchanged' };
        }
      } else {
        const invocationChanged = invocationKey(context.invocation) !== invocationKey(invocation);
        if (changes.length || invocationChanged || !sweep) {
          run = await sessionWork(context, work, () => context.session!.update(changes, control, { project: invocation.project, capabilities: invocation.setup.capabilities }));
          if (run.status === 'revised') context.invocation = invocation;
        } else run = { status: 'unchanged' };
        // An update that acquired the project again on a fresh capture has verified everything a sweep
        // would; the capture counts as swept, as if the sweep had returned unchanged.
        const swept = reacquirable && run.status === 'revised' && run.reacquired;
        if (sweep && !swept && run.status !== 'reported' && run.status !== 'cancelled') {
          run = await sessionWork(context, work, () => context.session!.sweep(control), true);
        }
      }
      if (disposed || context.state === 'evicted' || controller.signal.aborted) return;
      if (run.status === 'cancelled') { for (const entry of entries) completeEntry(entry, { status: 'cancelled', requestId: entry.request.requestId }); context.sweepRequired = true; return; }
      if (run.status === 'reported') {
        context.synchronization = 'reconciling'; context.sweepRequired = true;
        const stragglers = context.queue.filter(publishedCheck);
        for (const entry of [...entries, ...stragglers]) {
          if (entry.kind === 'apiView') {
            completeApiView(entry, { ...unavailable('analysis-failed', run.report.diagnostics[0]?.message ?? 'The analysis could not be reported'), requestId: entry.request.requestId });
            continue;
          }
          complete(entry, { status: 'reported', requestId: entry.request.requestId, published: false, revision: null, delta: null,
            report: stated(context, entry, run.report), freshness: fresh(entry, started, false), timings: freeze({ ...work, publication: 0 }) });
        }
        return;
      }
      const data = context.session?.current;
      if (!data) throw new Error('Session lost its published revision');
      const reused = context.publishedSession === context.session && context.history.published?.sequence === data.sequence;
      await hotBudget(context);
      const publishing = performance.now();
      const admitted = await publish(context, data, cause, freeze({ ...work, watch }));
      const timings: ReplyTimings = { ...work, publication: performance.now() - publishing };
      if (!admitted) {
        context.synchronization = 'reconciling'; context.sweepRequired = true;
        // Restore the retained-byte bound before acknowledging the rejection.
        // Projection and disposal may both yield while the oversized facts live.
        await abandonCandidate(context);
        // Include callers that arrived during cleanup: the cold context has no
        // scheduled analysis left to settle those requests.
        for (const entry of [...entries, ...context.queue]) completeEntry(entry, { ...unavailable('resource-unavailable'), requestId: entry.request.requestId });
        return;
      }
      published = true;
      context.state = 'warm';
      context.synchronization = context.watcherState === 'unavailable' ? 'watcher-unavailable'
        : context.background || context.sweepRequired || context.paths.size ? 'reconciling' : 'synchronized';
      const publication = context.history.published!;
      await Promise.all(entries.map(entry => {
        if (entry.kind === 'apiView') {
          const failed = mismatchApiView(context, entry, data);
          if (failed) { completeApiView(entry, failed); return Promise.resolve(); }
          return deliverApiView(context, entry, publication, data, started, reused, timings);
        }
        const failed = mismatch(context, entry, data);
        if (failed) { complete(entry, failed); return Promise.resolve(); }
        return deliver(context, entry, publication, started, reused, timings);
      }));
      const waiting = context.queue.filter(publishedCheck);
      for (const entry of waiting) context.queue.splice(context.queue.indexOf(entry), 1);
      await Promise.all(waiting.map(entry => deliver(context, entry, publication, null, false, timings)));
      if (context.watcherState === 'unavailable') attach(context);
    } catch (error) {
      // A failed audit observed nothing and requires no re-observation; it is
      // recorded against this revision so it is not attempted again.
      if (auditing) { context.auditRequired = false; context.auditedSequence = context.session?.current?.sequence ?? context.auditedSequence; }
      else context.sweepRequired = true;
      if (!controller.signal.aborted && !disposed && context.state !== 'evicted') {
        // An audit that failed compared nothing; the context's agreement with
        // the filesystem is what it was before the attempt.
        if (!auditing) context.synchronization = 'reconciling';
        // Published readers can join a background open without entering its
        // synchronized request batch. They must observe its failure as well.
        for (const entry of [...entries, ...context.queue.filter(publishedCheck)]) {
          completeEntry(entry, { ...unavailable('analysis-failed', String(error)), requestId: entry.request.requestId });
        }
      }
    } finally {
      if (controller.signal.aborted) {
        if (sweepKind !== 'periodic') context.sweepRequired = true;
        for (const entry of entries) completeEntry(entry, disposed ? { ...unavailable('disposed'), requestId: entry.request.requestId } : { status: 'cancelled', requestId: entry.request.requestId });
      }
      try { await releaseUnpublished(context); } catch { context.synchronization = 'reconciling'; context.sweepRequired = true; }
      context.running = null; active--; context.queue.splice(0, context.queue.length, ...context.queue.filter(entry => !entry.settled));
      if (context.state !== 'evicted' && !disposed) {
        // Requests queued while this capture ran, including after the session advanced, meet the covering rule here.
        if (published && !controller.signal.aborted) coverQueued(context);
        auditLater(context); sweepLater(context); scheduleIdle(context); changed(context);
      }
      kick();
    }
  }
  function kick(): void {
    if (pumping || disposed) return; pumping = true;
    queueMicrotask(() => {
      pumping = false; if (disposed) return;
      // Waiting clients come first: one context's background maintenance can
      // never take the analysis slot from another context's pending request.
      for (const requests of [true, false]) {
        for (const context of contexts.values()) {
          if (active >= budgets.maxConcurrentAnalyses) return;
          if (context.running || context.cooling || context.state === 'cold' || context.state === 'evicted') continue;
          const request = context.queue.some(entry => !entry.settled && entry.request.freshness.mode === 'synchronized');
          if (request !== requests) continue;
          if (!request && (!(context.background || context.periodicSweepDue) || context.debounce)) continue;
          track(analyze(context));
        }
      }
    });
  }
  /** The published revision is the session's current one, and it observed every expected
   * identity under the request's invocation; no sweep is needed. */
  function identityCovered(context: LiveContext, entry: PendingEntry): boolean {
    const data = context.session?.current; const publication = context.history.published;
    return !!data && !!publication && context.publishedSession === context.session && publication.sequence === data.sequence
      && !entry.needsSweep && invocationKey(entry.invocation) === invocationKey(context.invocation) && !expectationMismatch(entry, data);
  }
  /** A covered request is answered from the published revision. Only a running
   * periodic sweep carrying no changes may coexist with coverage: the answer
   * uses the revision published before that sweep began. */
  function covers(context: LiveContext, entry: PendingEntry): boolean {
    const running = context.running;
    const maintenance = !running || (running.sweep === 'periodic' && !running.requests.length && !running.changes.length);
    return maintenance && !context.background && !context.paths.size && !context.sweepRequired
      && context.synchronization === 'synchronized' && identityCovered(context, entry);
  }
  /** The covering rule again when a revision publishes. The queued synchronized requests
   * are answered from it, and the paths they queued withdrawn, only when it covers every
   * one of them and nothing else is pending: no path a watcher event, another request or a
   * restored capture queued, no background work other than theirs, no conservative
   * reconciliation and no required sweep. Otherwise all of them wait for the next update. */
  function coverQueued(context: LiveContext): void {
    const requests = context.queue.filter(entry => !entry.settled && entry.request.freshness.mode === 'synchronized');
    if (!requests.length || context.state !== 'warm' || context.running || context.conservative || context.sweepRequired
      || context.watcherState === 'unavailable' || (context.background !== null && context.background !== 'request')) return;
    const answered = new Set(requests);
    for (const path of context.paths.keys()) {
      const owners = context.requested.get(path);
      if (!owners || [...owners].some(owner => !answered.has(owner))) return;
    }
    if (!requests.every(entry => identityCovered(context, entry))) return;
    context.paths.clear(); context.requested.clear(); context.background = null; context.synchronization = 'synchronized';
    context.queue.splice(0, context.queue.length, ...context.queue.filter(entry => !answered.has(entry)));
    for (const entry of requests) {
      if (entry.kind === 'apiView') track(deliverApiView(context, entry, context.history.published!, context.session!.current!, null, true));
      else track(deliver(context, entry, context.history.published!, null, true));
    }
  }
  function check(request: CheckRequest, lease: string, control?: RunControl): Promise<CheckOutcome> {
    const found = lookup(request.token); if ('status' in found) return Promise.resolve({ ...found, requestId: request.requestId });
    const context = found;
    if (control?.signal?.aborted) return Promise.resolve({ status: 'cancelled', requestId: request.requestId });
    return new Promise(resolve => {
      const entry: PendingCheck = { kind: 'check', request: freeze(structuredClone(request)), lease, acknowledged: clock.now(),
        invocation: context.invocations.get(lease) ?? { project: context.project, setup: context.selection.setup },
        revisionAtAcknowledgment: context.history.published?.revision ?? null,
        needsSweep: request.freshness.mode === 'synchronized' && (request.scope === 'report' || !request.freshness.expect.length),
        resolve, cleanup: () => {}, settled: false, deadlineExpired: false };
      // Test coverage before touch() can mark a periodic sweep due for this activity.
      const covered = request.freshness.mode === 'synchronized' && covers(context, entry);
      touch(context);
      let stopDeadline: (() => void) | undefined;
      const unpinSince = request.since && context.history.get(request.since) ? context.history.pin(request.since) : () => {};
      const cancel = () => {
        complete(entry, { status: 'cancelled', requestId: request.requestId });
        const position = context.queue.indexOf(entry); if (position !== -1) context.queue.splice(position, 1);
        if (context.running?.requests.includes(entry) && context.running.requests.every(item => item.settled) && !context.running.requests.some(item => item.deadlineExpired)) context.running.controller.abort();
        scheduleIdle(context);
      };
      control?.signal?.addEventListener('abort', cancel, { once: true });
      entry.cleanup = () => { control?.signal?.removeEventListener('abort', cancel); stopDeadline?.(); unpinSince(); };
      // Plain report clients retain Plan 2's unbounded synchronized wait unless
      // they explicitly request a deadline. Delta requests use the hook default.
      const deadline = request.deadlineMs ?? (request.scope === 'delta' ? budgets.updateDeadlineMs : undefined);
      if (deadline !== undefined) stopDeadline = clock.schedule(deadline, () => {
        const elapsedMs = clock.now() - entry.acknowledged;
        entry.deadlineExpired = true;
        complete(entry, entry.revisionAtAcknowledgment
          ? { status: 'deadline-exceeded', requestId: request.requestId, elapsedMs, revision: entry.revisionAtAcknowledgment }
          : { status: 'cold', requestId: request.requestId, elapsedMs, current: snapshot(context) });
        // A deadline releases only the waiter. Its queued changes and active
        // session operation still run and may publish after this reply.
        scheduleIdle(context);
      });
      if (request.since && !context.history.get(request.since)) { complete(entry, { ...unavailable('evicted-revision'), requestId: request.requestId }); return; }
      if (request.freshness.mode === 'published') {
        const publication = request.freshness.revision ? context.history.get(request.freshness.revision) : context.history.published;
        if (publication) { track(deliver(context, entry, publication, null)); return; }
        if (request.freshness.revision) { complete(entry, { ...unavailable('evicted-revision'), requestId: request.requestId }); return; }
        if (!request.freshness.wait) { complete(entry, { status: 'pending', requestId: request.requestId, current: snapshot(context) }); return; }
      } else {
        if (covered) { track(deliver(context, entry, context.history.published!, null, true)); return; }
        // A hook verifies a module's exports and their use. A configuration change is not
        // that kind of change and its verdict is not needed at once, so the request is
        // answered immediately as not checked. Its paths still queue an update, which the
        // next request waits for, so the answer after it is exact.
        const configuration = request.freshness.expect.filter(expectation => namesConfiguration(context, expectation.path));
        // A hook identifies a path to re-observe. The observer determines its
        // actual creation/deletion and role; preserve stronger watcher hints.
        // A path only requests named stays theirs, for withdrawal on a covering publication.
        // An immediately answered request withdraws nothing and claims none.
        for (const expected of request.freshness.expect) {
          if (!context.paths.has(expected.path)) { context.paths.set(expected.path, 'changed'); if (!configuration.length) context.requested.set(expected.path, new Set([entry])); }
          else if (!configuration.length) context.requested.get(expected.path)?.add(entry);
        }
        if (context.paths.size > budgets.maxQueuedPaths) { context.paths.clear(); context.requested.clear(); context.conservative = true; context.sweepRequired = true; }
        if (entry.needsSweep) context.sweepRequired = true;
        context.background ??= 'request';
        if (configuration.length) {
          // No caller waits for this capture, so a pending debounce keeps coalescing the
          // watcher's own batch for the same edit.
          complete(entry, { ...unavailable('configuration-changed',
            `Configuration changed: ${configuration.map(item => item.path).join(', ')}. Verification continues in the background.`),
          requestId: request.requestId });
          scheduleIdle(context); kick(); return;
        }
        context.debounce?.(); context.debounce = null;
      }
      context.queue.push(entry); scheduleIdle(context); kick();
    });
  }
  /**
   * One serialized API-view request: always synchronized freshness, the same
   * queue/rendezvous/deadline/cancellation rules as `check`, joined into the
   * exact same capture when a matching one is due, and delivered by
   * `deliverApiView` while that capture still holds its published revision's
   * slot. Unlike `check`, there is no `published`-mode wait and no `since`
   * baseline: materialization always asks for the current revision.
   */
  function apiView(request: ApiViewRequest, lease: string, control?: RunControl): Promise<ContextApiViewOutcome> {
    const found = lookup(request.token); if ('status' in found) return Promise.resolve({ ...found, requestId: request.requestId });
    const context = found;
    if (control?.signal?.aborted) return Promise.resolve({ status: 'cancelled', requestId: request.requestId });
    return new Promise(resolve => {
      const entry: PendingApiView = { kind: 'apiView', request: freeze(structuredClone(request)), lease, acknowledged: clock.now(),
        invocation: context.invocations.get(lease) ?? { project: context.project, setup: context.selection.setup },
        revisionAtAcknowledgment: context.history.published?.revision ?? null,
        needsSweep: !request.freshness.expect.length,
        resolve, cleanup: () => {}, settled: false, deadlineExpired: false };
      // Test coverage before touch() can mark a periodic sweep due for this activity.
      const covered = covers(context, entry);
      touch(context);
      let stopDeadline: (() => void) | undefined;
      const cancel = () => {
        completeApiView(entry, { status: 'cancelled', requestId: request.requestId });
        const position = context.queue.indexOf(entry); if (position !== -1) context.queue.splice(position, 1);
        if (context.running?.requests.includes(entry) && context.running.requests.every(item => item.settled) && !context.running.requests.some(item => item.deadlineExpired)) context.running.controller.abort();
        scheduleIdle(context);
      };
      control?.signal?.addEventListener('abort', cancel, { once: true });
      entry.cleanup = () => { control?.signal?.removeEventListener('abort', cancel); stopDeadline?.(); };
      if (request.deadlineMs !== undefined) stopDeadline = clock.schedule(request.deadlineMs, () => {
        const elapsedMs = clock.now() - entry.acknowledged;
        entry.deadlineExpired = true;
        completeApiView(entry, entry.revisionAtAcknowledgment
          ? { status: 'deadline-exceeded', requestId: request.requestId, elapsedMs, revision: entry.revisionAtAcknowledgment }
          : { status: 'cold', requestId: request.requestId, current: snapshot(context) });
        // A deadline releases only the waiter. Its queued changes and active
        // session operation still run and may publish after this reply.
        scheduleIdle(context);
      });
      if (covered) { track(deliverApiView(context, entry, context.history.published!, context.session!.current!, null, true)); return; }
      // A hook identifies a path to re-observe, exactly as `check`'s own synchronized rendezvous does.
      const configuration = request.freshness.expect.filter(expectation => namesConfiguration(context, expectation.path));
      for (const expected of request.freshness.expect) {
        if (!context.paths.has(expected.path)) { context.paths.set(expected.path, 'changed'); if (!configuration.length) context.requested.set(expected.path, new Set([entry])); }
        else if (!configuration.length) context.requested.get(expected.path)?.add(entry);
      }
      if (context.paths.size > budgets.maxQueuedPaths) { context.paths.clear(); context.requested.clear(); context.conservative = true; context.sweepRequired = true; }
      if (entry.needsSweep) context.sweepRequired = true;
      context.background ??= 'request';
      if (configuration.length) {
        completeApiView(entry, { ...unavailable('configuration-changed',
          `Configuration changed: ${configuration.map(item => item.path).join(', ')}. Verification continues in the background.`),
        requestId: request.requestId });
        scheduleIdle(context); kick(); return;
      }
      context.debounce?.(); context.debounce = null;
      context.queue.push(entry); scheduleIdle(context); kick();
    });
  }
  function explorerDetails(request: ExplorerDetailsRequest, lease: string,
    control?: RunControl): Promise<ContextExplorerDetailsOutcome> {
    const found = lookup(request.token);
    if ('status' in found) return Promise.resolve({ ...found, requestId: request.requestId });
    const context = found;
    if (control?.signal?.aborted) return Promise.resolve({ status: 'cancelled', requestId: request.requestId });
    if (context.state === 'cold' || !context.session || !context.history.published) {
      return Promise.resolve({ status: 'unavailable', requestId: request.requestId,
        reason: 'resource-unavailable', message: 'The current context has no retained compiler session' });
    }
    if (context.history.published.revision.revision !== request.revision) {
      return Promise.resolve({ status: 'superseded', requestId: request.requestId,
        revision: context.history.published.revision });
    }
    return new Promise(resolve => {
      const controller = new AbortController();
      const entry: ExplorerDetailDelivery = {
        request: freeze(structuredClone(request)), lease, controller, resolve,
        cleanup: () => {}, settled: false,
      };
      const cancel = () => {
        controller.abort();
        completeExplorerDelivery(entry, { status: 'cancelled', requestId: request.requestId });
      };
      control?.signal?.addEventListener('abort', cancel, { once: true });
      entry.cleanup = () => control?.signal?.removeEventListener('abort', cancel);
      context.explorerDeliveries.add(entry);
      touch(context);
      track((async () => {
        const publication = context.history.published;
        const session = context.session;
        if (!publication || !session || publication.revision.revision !== request.revision) {
          completeExplorerDelivery(entry, { status: 'superseded', requestId: request.requestId,
            revision: context.history.published?.revision ?? null });
          return;
        }
        const unpin = context.history.pin(publication.revision.revision);
        try {
          const outcome = await session.explorerDetails(publication.sequence, request.requests, { signal: controller.signal });
          if (outcome.status === 'ready') {
            completeExplorerDelivery(entry, { status: 'ready', requestId: request.requestId,
              revision: publication.revision, details: outcome.details });
          } else if (outcome.status === 'superseded') {
            completeExplorerDelivery(entry, { status: 'superseded', requestId: request.requestId,
              revision: context.history.published?.revision ?? null });
          } else if (outcome.status === 'cancelled') {
            completeExplorerDelivery(entry, { status: 'cancelled', requestId: request.requestId });
          } else {
            completeExplorerDelivery(entry, { ...outcome, requestId: request.requestId });
          }
        } catch (error) {
          completeExplorerDelivery(entry, { status: 'unavailable', requestId: request.requestId,
            reason: 'analysis-failed', message: String(error) });
        } finally {
          unpin();
        }
      })().finally(() => {
        context.explorerDeliveries.delete(entry);
        scheduleIdle(context);
      }));
    });
  }
  function mapDiagram(job: DiagramJob, outcome: DependencyAnalyzerOutcome): (caller: DiagramCaller) => DiagramAnswer {
    const revision = job.revision;
    switch (outcome.status) {
      case 'ready': {
        const failed = (reason: 'analysis-failed' | 'resource-limit', message: string) =>
          (caller: DiagramCaller): DiagramAnswer => ({ status: 'unavailable', requestId: caller.requestId, reason, message });
        if (outcome.diagram.inputId !== revision.fingerprints.inputId) {
          return failed('analysis-failed', `The dependency diagram input ${outcome.diagram.inputId} is not the revision's ${revision.fingerprints.inputId}`);
        }
        if (outcome.testReferences && outcome.testReferences.inputId !== outcome.diagram.inputId) {
          return failed('analysis-failed', `The test references input ${outcome.testReferences.inputId} is not the diagram's ${outcome.diagram.inputId}`);
        }
        const bytes = Buffer.byteLength(JSON.stringify(outcome.diagram), 'utf8');
        const context = job.context;
        const contextBytes = (context.session?.status().factBytes ?? 0) + bytes;
        if (contextBytes > budgets.maxRetainedBytesPerContext) {
          return failed('resource-limit', `Retaining the dependency diagram needs ${contextBytes} bytes in its context; the maximum is ${budgets.maxRetainedBytesPerContext}`);
        }
        const globalBytes = totalBytes() + bytes;
        if (globalBytes > budgets.maxRetainedBytesGlobal) {
          return failed('resource-limit', `Retaining the dependency diagram needs ${globalBytes} bytes in the daemon; the maximum is ${budgets.maxRetainedBytesGlobal}`);
        }
        // The references are retained beside the diagram while both fit the budgets; the
        // diagram's answer never depends on them, so a diagram that fits alone is kept without them.
        const referenceBytes = outcome.testReferences ? Buffer.byteLength(JSON.stringify(outcome.testReferences), 'utf8') : 0;
        const testReferences = outcome.testReferences && contextBytes + referenceBytes <= budgets.maxRetainedBytesPerContext
          && globalBytes + referenceBytes <= budgets.maxRetainedBytesGlobal ? freeze(outcome.testReferences) : null;
        const retained = freeze({ revision: revision.revision, diagram: freeze(outcome.diagram), testReferences,
          bytes: bytes + (testReferences ? referenceBytes : 0) });
        context.diagram = retained;
        return caller => ({ status: 'ready', requestId: caller.requestId, revision, diagram: retained.diagram, testReferences: retained.testReferences });
      }
      case 'inputs-changed':
        return caller => ({ status: 'busy', requestId: caller.requestId, revision, reason: 'inputs-changed' });
      case 'cancelled':
        return caller => ({ status: 'cancelled', requestId: caller.requestId });
      case 'unavailable':
        return caller => ({ status: 'unavailable', requestId: caller.requestId,
          reason: outcome.reason === 'resource-limit' ? 'resource-limit' : 'analysis-failed', message: `${outcome.reason}: ${outcome.message}` });
    }
  }
  /** One job: read the pinned revision's published report, run the injected analyzer in its own
   * process and answer every caller still attached. Nothing enters the context queue, and the
   * retained session is asked only for the report it already published. */
  async function runDiagram(job: DiagramJob): Promise<void> {
    const { context, controller } = job;
    const answerAll = (answer: (caller: DiagramCaller) => DiagramAnswer): void => {
      const callers = [...job.callers]; job.callers.clear();
      for (const caller of callers) answerDiagram(caller, answer(caller));
    };
    const current = (): boolean => !controller.signal.aborted && !disposed && context.state !== 'evicted'
      && context.history.published?.revision.revision === job.revision.revision;
    try {
      const publication = context.history.published;
      if (!publication || publication.revision.revision !== job.revision.revision) {
        answerAll(caller => ({ status: 'superseded', requestId: caller.requestId, revision: publication?.revision ?? null })); return;
      }
      const unpin = context.history.pin(publication.revision.revision);
      let report: AnalysisReport | null;
      try { report = publication.report ?? await context.session?.report(undefined, publication.sequence) ?? null; }
      finally { unpin(); }
      if (!current()) return;
      if (!report) {
        answerAll(caller => ({ status: 'unavailable', requestId: caller.requestId, reason: 'resource-unavailable',
          message: 'The published revision no longer retains its report' })); return;
      }
      const outcome = await options.dependencyDiagrams!.run({ project: report.request.project, report }, { signal: controller.signal });
      report = null;
      if (!current()) return;
      answerAll(mapDiagram(job, outcome));
    } catch (error) {
      if (current()) answerAll(caller => ({ status: 'unavailable', requestId: caller.requestId, reason: 'analysis-failed', message: String(error) }));
    } finally {
      if (diagramJob === job) diagramJob = null;
      if (!disposed && context.state !== 'evicted') { scheduleIdle(context); changed(context); }
    }
  }
  function dependencyFacts(request: DependencyDiagramRequest, lease: string, control?: RunControl): Promise<DiagramAnswer> {
    const found = lookup(request.token);
    if ('status' in found) return Promise.resolve({ ...found, requestId: request.requestId });
    const context = found;
    const { requestId } = request;
    if (control?.signal?.aborted) return Promise.resolve({ status: 'cancelled', requestId });
    const publication = context.history.published;
    if (!publication || publication.revision.revision !== request.revision) {
      return Promise.resolve({ status: 'superseded', requestId, revision: publication?.revision ?? null });
    }
    const revision = publication.revision;
    if (revision.outcome.execution !== 'completed') {
      return Promise.resolve({ status: 'unavailable', requestId, reason: 'invalid-current',
        message: `The published revision's analysis is ${revision.outcome.execution}` });
    }
    if (!options.dependencyDiagrams) {
      return Promise.resolve({ status: 'unavailable', requestId, reason: 'resource-unavailable', message: 'No dependency analyzer is configured' });
    }
    if (context.diagram?.revision === revision.revision) {
      return Promise.resolve({ status: 'ready', requestId, revision, diagram: context.diagram.diagram, testReferences: context.diagram.testReferences });
    }
    const running = diagramJob;
    const joins = !!running && running.context === context && running.revision.revision === revision.revision && !running.controller.signal.aborted;
    if (running && !joins) return Promise.resolve({ status: 'busy', requestId, revision, reason: 'analysis-running' });
    return new Promise(resolve => {
      const job = running ?? { context, revision, controller: new AbortController(), callers: new Set<DiagramCaller>() };
      const caller: DiagramCaller = { requestId, lease, resolve, cleanup: () => {}, settled: false };
      // A cancelled caller detaches alone; the job aborts once no caller remains.
      const cancel = () => {
        job.callers.delete(caller);
        answerDiagram(caller, { status: 'cancelled', requestId });
        if (!job.callers.size) job.controller.abort();
        scheduleIdle(context);
      };
      control?.signal?.addEventListener('abort', cancel, { once: true });
      caller.cleanup = () => control?.signal?.removeEventListener('abort', cancel);
      job.callers.add(caller);
      scheduleIdle(context);
      if (!running) { diagramJob = job; track(runDiagram(job)); changed(context); }
    });
  }
  /** The diagram's own answer: the facts answer without the test references. */
  async function dependencyDiagram(request: DependencyDiagramRequest, lease: string,
    control?: RunControl): Promise<ContextDependencyDiagramOutcome | (Unavailable & { readonly requestId: string })> {
    const answer = await dependencyFacts(request, lease, control);
    if (answer.status !== 'ready') return answer;
    return { status: 'ready', requestId: answer.requestId, revision: answer.revision, diagram: answer.diagram };
  }
  /** Resolutions of an equal request held by contexts with a live session. */
  function knownFor(key: string): { readonly context: LiveContext; readonly resolution: ProjectResolution }[] {
    const known: { context: LiveContext; resolution: ProjectResolution }[] = [];
    for (const context of contexts.values()) {
      const resolution = context.resolutions.get(key);
      if (resolution && context.session && !context.cooling && context.state !== 'cold' && context.state !== 'evicted') known.push({ context, resolution });
    }
    return known;
  }
  function rememberResolution(context: LiveContext, key: string, resolution: ProjectResolution): void {
    context.resolutions.delete(key); context.resolutions.set(key, resolution);
    for (const oldest of context.resolutions.keys()) { if (context.resolutions.size <= knownResolutions) break; context.resolutions.delete(oldest); }
  }
  async function open(request: ProjectRequest, setup: ContextSetup, lease: string, control?: RunControl): Promise<OpenOutcome> {
    if (disposed) return unavailable('disposed');
    if (setup.registry !== 'default' || setup.capabilities.some(item => !implemented.has(item))) return unavailable('unsupported-setup');
    const controller = new AbortController(); const abort = () => controller.abort();
    control?.signal?.addEventListener('abort', abort, { once: true }); if (control?.signal?.aborted) controller.abort(); resolving.add(controller);
    try {
      const project = freeze(structuredClone(request)); const requestedSetup = freeze(structuredClone(setup));
      // A known context's resolution of an equal request is reused while its discovery
      // queries answer the same; the driver validates it against the filesystem.
      const key = projectKey(project); const known = knownFor(key);
      const resolution = await driver.resolve(project, { signal: controller.signal }, known.map(item => item.resolution));
      for (const item of known) if (item.resolution !== resolution && item.context.resolutions.get(key) === item.resolution) item.context.resolutions.delete(key);
      if (disposed) return unavailable('disposed');
      if (controller.signal.aborted) return unavailable('analysis-failed', 'Opening request was cancelled');
      if (resolution.status !== 'resolved') {
        const run = await driver.open(project, requestedSetup, { signal: controller.signal });
        if (run.status === 'opened') { try { const report = await run.session.report();
          return report ? { status: 'unresolved', resolution, report } : unavailable('analysis-failed'); } finally { await run.session.dispose(); } }
        return run.status === 'cancelled' ? unavailable('analysis-failed', 'Opening request was cancelled') : { status: 'unresolved', resolution, report: run.report };
      }
      const selection = freeze({ root: resolution.root, scope: project.scope, configuration: project.configuration, setup: requestedSetup });
      const id = createContextId(selection); const existing = contexts.get(id);
      if (existing) { existing.invocations.set(lease, { project, setup: requestedSetup }); rememberResolution(existing, key, resolution); touch(existing);
        return { status: 'opened', token: existing.token, created: false, current: snapshot(existing) }; }
      if (contexts.size >= budgets.maxContexts) {
        const victim = [...contexts.values()].filter(item => !held(item)).sort((a, b) => a.lastActivityAt - b.lastActivityAt)[0];
        if (!victim || !budgets.maxContexts) return unavailable('resource-unavailable'); evict(victim, 'pressure');
      }
      const now = clock.now();
      const context: LiveContext = {
        token: freeze({ context: id, generation: options.generationId() }), selection, project, invocation: { project, setup: requestedSetup },
        openedAt: now, lastActivityAt: now, hadLease: false, invocations: new Map([[lease, { project, setup: requestedSetup }]]), resolutions: new Map([[key, resolution]]), subscriptions: new Map(),
        history: createHistory(budgets.maxHistoryRevisions, budgets.maxHistoryBytes, entry => releaseVersion(context, entry)),
        queue: [], deliveries: new Set(), explorerDeliveries: new Set(), diagram: null, paths: new Map(), requested: new Map(), watched: null, scope: null, state: 'opening', synchronization: 'initializing', lastValid: null,
        session: null, publishedSession: null, versions: new Set(), observedSequence: 0, sequence: 0, sweepRequired: true, periodicSweepDue: false, lastSweepAt: now, auditedSequence: 0, auditRequired: false, demoting: null, unresponsiveSince: null, cooling: false,
        watcher: null, watcherState: 'disposed', attaching: false, conservative: true, background: 'open', running: null,
        debounce: null, sweepTimer: null, auditTimer: null, idle: null,
      };
      contexts.set(id, context); const current = snapshot(context); attach(context); scheduleIdle(context); kick();
      return { status: 'opened', token: context.token, created: true, current };
    } catch (error) { return unavailable(disposed ? 'disposed' : 'analysis-failed', String(error)); }
    finally { resolving.delete(controller); control?.signal?.removeEventListener('abort', abort); }
  }
  return {
    open: (request, setup, lease, control) => track(open(request, setup, lease, control)), check, apiView, explorerDetails, dependencyDiagram, dependencyFacts,
    status(token) { const found = lookup(token); if ('status' in found) return found; touch(found); return snapshot(found); },
    list: () => [...contexts.values()].map(snapshot),
    subscribe(token, lease, listener) {
      const found = lookup(token); if ('status' in found) return found; touch(found);
      const id = randomUUID(); found.subscriptions.set(id, { lease, listener }); scheduleIdle(found);
      return { id, current: snapshot(found), close() { found.subscriptions.delete(id); scheduleIdle(found); } };
    },
    release(lease) {
      for (const context of contexts.values()) {
        context.invocations.delete(lease);
        for (const [id, subscription] of context.subscriptions) if (subscription.lease === lease) context.subscriptions.delete(id);
        for (const entry of pending(context)) if (entry.lease === lease) completeEntry(entry, { status: 'cancelled', requestId: entry.request.requestId });
        for (const entry of context.explorerDeliveries) if (entry.lease === lease) {
          entry.controller.abort();
          completeExplorerDelivery(entry, { status: 'cancelled', requestId: entry.request.requestId });
        }
        const job = diagramJob;
        if (job?.context === context) {
          for (const caller of [...job.callers]) if (caller.lease === lease) {
            job.callers.delete(caller); answerDiagram(caller, { status: 'cancelled', requestId: caller.requestId });
          }
          if (!job.callers.size) job.controller.abort();
        }
        context.queue.splice(0, context.queue.length, ...context.queue.filter(entry => !entry.settled));
        if (context.running && !context.running.background && context.running.requests.every(entry => entry.settled) && !context.running.requests.some(entry => entry.deadlineExpired)) context.running.controller.abort();
        scheduleIdle(context);
      }
    },
    dispose() {
      if (disposing) return disposing; disposed = true;
      for (const controller of resolving) controller.abort(); for (const context of [...contexts.values()]) evict(context, 'disposed');
      disposing = (async () => { while (lifetimes.size) await Promise.allSettled([...lifetimes]);
        try { await driver.dispose(); } catch (error) { cleanupFailures.push(error); }
        if (cleanupFailures.length) throw new AggregateError(cleanupFailures, 'Context resource cleanup failed');
      })(); return disposing;
    },
  };
}
