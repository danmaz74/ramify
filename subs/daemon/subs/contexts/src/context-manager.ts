import { randomUUID } from 'node:crypto';
import type { AnalysisReport, IncrementRun, InputChange, RunControl } from '../../../../analysis/src/interfaces/analysis.js';
import type { ProjectRequest } from '../../../../analysis/subs/project/src/interfaces/project.js';
import type { CheckOutcome, CheckRequest, ContextEvent, ContextManager, ContextManagerOptions, ContextRevision, ContextSetup, ContextStatus, ContextToken, FreshnessRecord, OpenOutcome, RevisionCause, Unavailable, WatchEvent } from './interfaces/contexts.js';
import type { LiveContext } from './context.js';
import { createHistory } from './history.js';
import { createContextId, createFingerprints, createRevisionId } from './tokens.js';
import { complete, invocationKey } from './queue.js';
import type { Invocation, PendingCheck } from './queue.js';

const implemented = new Set(['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage']);
function unavailable(reason: Unavailable['reason'], message: string = reason): Unavailable { return { status: 'unavailable', reason, message }; }
function equalReport(left: AnalysisReport, right: AnalysisReport): boolean {
  return JSON.stringify({ ...left, runId: '' }) === JSON.stringify({ ...right, runId: '' });
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export function createContextManager(options: ContextManagerOptions): ContextManager {
  const { driver, watcher, clock, budgets } = options;
  const contexts = new Map<string, LiveContext>();
  const lifetimes = new Set<Promise<unknown>>();
  const resolving = new Set<AbortController>();
  let disposed = false;
  let pumping = false;
  let active = 0;
  let disposing: Promise<void> | undefined;

  function track<T>(promise: Promise<T>): Promise<T> {
    lifetimes.add(promise);
    void promise.finally(() => lifetimes.delete(promise)).catch(() => {});
    return promise;
  }
  function held(context: LiveContext): boolean {
    return context.subscriptions.size > 0 || context.queue.some(entry => !entry.settled)
      || !!context.running?.requests.some(entry => !entry.settled);
  }
  function snapshot(context: LiveContext): ContextStatus {
    const requests = [...context.queue, ...context.running?.requests ?? []].filter(entry => !entry.settled).length;
    return freeze({ token: context.token, selection: context.selection, scope: context.scope,
      state: context.state, synchronization: context.synchronization,
      published: context.history.published?.revision ?? null, lastValid: context.lastValid,
      pending: { requests, changedPaths: context.paths.size, analysisRunning: !!context.running },
      history: { retained: context.history.count, bytes: context.history.bytes, oldest: context.history.oldest?.revision.revision ?? null },
      retainedBytes: context.retained?.bytes ?? 0,
      leases: { subscriptions: context.subscriptions.size, requests }, watcher: context.watcherState,
      openedAt: context.openedAt, lastActivityAt: context.lastActivityAt });
  }
  function emit(context: LiveContext, event: ContextEvent): void {
    for (const subscription of [...context.subscriptions.values()]) {
      try { subscription.listener(event); } catch { /* A consumer cannot break publication. */ }
    }
  }
  function changed(context: LiveContext): void {
    emit(context, { type: 'status-changed', token: context.token, current: snapshot(context), coalesced: 0 });
  }
  function closeWatcher(context: LiveContext): void {
    const handle = context.watcher;
    context.watcher = null;
    context.watcherState = 'disposed';
    if (handle) track(handle.close().catch(() => {}));
  }
  function stopTimers(context: LiveContext): void {
    context.debounce?.(); context.verification?.(); context.idle?.();
    context.debounce = context.verification = context.idle = null;
  }
  function evict(context: LiveContext, reason: 'idle' | 'pressure' | 'disposed'): void {
    context.state = 'evicted';
    context.running?.controller.abort();
    for (const entry of [...context.queue, ...context.running?.requests ?? []]) {
      complete(entry, { ...unavailable(reason === 'disposed' ? 'disposed' : 'expired-generation'), requestId: entry.request.requestId });
    }
    context.queue.length = 0;
    stopTimers(context);
    closeWatcher(context);
    context.retained = null;
    context.history.dispose();
    context.paths.clear();
    context.invocations.clear();
    contexts.delete(context.token.context);
    emit(context, { type: 'context-evicted', token: context.token, reason });
    context.subscriptions.clear();
  }
  function scheduleIdle(context: LiveContext): void {
    context.idle?.(); context.idle = null;
    if (disposed || context.state === 'evicted') return;
    if (held(context)) { context.hadLease = true; return; }
    if (context.hadLease) { context.lastActivityAt = clock.now(); context.hadLease = false; }
    const delay = context.state === 'cold' ? budgets.coldRetainMs : Math.max(0, context.lastActivityAt + budgets.warmIdleMs - clock.now());
    context.idle = clock.schedule(delay, () => {
      context.idle = null;
      if (held(context)) return;
      if (context.state === 'cold') { evict(context, 'idle'); return; }
      context.state = 'cold';
      context.running?.controller.abort();
      context.background = null;
      context.debounce?.(); context.debounce = null;
      context.verification?.(); context.verification = null;
      closeWatcher(context);
      context.retained = null;
      context.history.retainPublished();
      context.paths.clear();
      context.conservative = true;
      changed(context);
      scheduleIdle(context);
    });
  }
  function attach(context: LiveContext): void {
    if (context.attaching || context.watcher || context.state === 'cold' || context.state === 'evicted' || disposed) return;
    context.attaching = true;
    track(Promise.resolve().then(() => watcher.watch(context.selection.root, events => watchEvents(context, events)))
      .then(async handle => {
        if (context.state === 'cold' || context.state === 'evicted' || disposed) await handle.close();
        else { context.watcher = handle; context.watcherState = 'active'; }
      }).catch(() => {
        if (context.state !== 'evicted' && !disposed) {
          context.watcherState = 'unavailable'; context.synchronization = 'watcher-unavailable'; context.conservative = true;
        }
      }).finally(() => { context.attaching = false; }));
  }
  function touch(context: LiveContext): void {
    context.lastActivityAt = clock.now();
    if (context.state === 'cold') {
      context.state = 'warm'; context.synchronization = 'reconciling'; context.conservative = true;
      context.background = 'conservative'; attach(context); kick();
    }
    scheduleIdle(context);
  }
  function lookup(token: ContextToken): LiveContext | Unavailable {
    if (disposed) return unavailable('disposed');
    const context = contexts.get(token.context);
    if (!context) return unavailable('unknown-context');
    if (context.token.generation !== token.generation) return unavailable('expired-generation');
    return context;
  }
  function verifyLater(context: LiveContext): void {
    context.verification?.(); context.verification = null;
    if (disposed || context.state !== 'warm') return;
    context.verification = clock.schedule(budgets.verificationIntervalMs, () => {
      context.verification = null;
      context.background ??= 'verify';
      if (context.synchronization !== 'watcher-unavailable') context.synchronization = context.conservative ? 'conservative' : 'reconciling';
      changed(context); kick();
    });
  }
  function watchEvents(context: LiveContext, events: readonly WatchEvent[]): void {
    if (disposed || context.state === 'cold' || context.state === 'evicted' || !events.length) return;
    for (const event of events) {
      if (event.kind === 'overflow' || event.kind === 'error') context.conservative = true;
      else if (!context.conservative) context.paths.set(event.path, event.kind === 'renamed' ? 'unknown' : event.kind);
      if (event.kind === 'error') {
        closeWatcher(context); context.watcherState = 'unavailable';
      }
      if (context.paths.size > budgets.maxQueuedPaths) { context.paths.clear(); context.conservative = true; }
    }
    if (context.running?.background) {
      context.running.controller.abort();
      if (context.running.changes === null) context.conservative = true;
      else for (const change of context.running.changes) context.paths.set(change.path, change.kind);
    }
    if (context.paths.size > budgets.maxQueuedPaths) { context.paths.clear(); context.conservative = true; }
    context.synchronization = context.watcherState === 'unavailable' ? 'watcher-unavailable' : context.conservative ? 'conservative' : 'reconciling';
    context.background = context.conservative ? 'conservative' : 'watch';
    context.debounce?.();
    context.debounce = clock.schedule(budgets.debounceMs, () => { context.debounce = null; kick(); });
    changed(context);
  }
  function totalBytes(): number {
    return [...contexts.values()].reduce((sum, context) => sum + context.history.bytes + (context.retained?.bytes ?? 0), 0);
  }
  function reserve(context: LiveContext, report: AnalysisReport, retainedBytes: number): number | null {
    const bytes = Buffer.byteLength(JSON.stringify(report), 'utf8');
    if (!budgets.maxHistoryRevisions || bytes > budgets.maxHistoryBytes) return null;
    // Published replacement can release the previous current report. Account
    // only history that will remain after the candidate's per-context trimming.
    let projected = Math.min(budgets.maxHistoryBytes, context.history.bytes + bytes);
    if (budgets.maxHistoryRevisions === 1) projected = bytes;
    let delta = projected - context.history.bytes + retainedBytes - (context.retained?.bytes ?? 0);
    while (totalBytes() + delta > budgets.maxRetainedBytesGlobal) {
      const eligible = [...contexts.values()].filter(item => item.history.count > 1)
        .sort((a, b) => a.history.oldest!.revision.publishedAt - b.history.oldest!.revision.publishedAt);
      if (eligible.length) {
        const item = eligible[0]!;
        item.history.discardOldest();
        if (item === context) {
          projected = Math.min(budgets.maxHistoryBytes, context.history.bytes + bytes);
          if (budgets.maxHistoryRevisions === 1) projected = bytes;
          delta = projected - context.history.bytes + retainedBytes - (context.retained?.bytes ?? 0);
        }
        continue;
      }
      const cold = [...contexts.values()].filter(item => item !== context && item.state === 'cold' && !held(item))
        .sort((a, b) => a.lastActivityAt - b.lastActivityAt)[0];
      if (cold) { evict(cold, 'pressure'); continue; }
      // Dropping the previous publication is allowed as part of replacing it,
      // but only if the candidate itself fits all global limits.
      if (totalBytes() - context.history.bytes - (context.retained?.bytes ?? 0) + bytes + retainedBytes <= budgets.maxRetainedBytesGlobal) {
        return budgets.maxRetainedBytesGlobal - (totalBytes() - context.history.bytes - (context.retained?.bytes ?? 0)) - retainedBytes;
      }
      return null;
    }
    return Math.min(budgets.maxHistoryBytes, budgets.maxRetainedBytesGlobal - (totalBytes() - context.history.bytes - (context.retained?.bytes ?? 0)) - retainedBytes);
  }
  function fresh(entry: PendingCheck, started: number | null, verified: boolean, reusedRevision = false): FreshnessRecord {
    return { mode: entry.request.freshness.mode, acknowledged: entry.acknowledged, captureStarted: started, verified, reusedRevision };
  }
  function reported(entry: PendingCheck, revision: ContextRevision, report: AnalysisReport, started: number | null, reused = false): void {
    complete(entry, { status: 'reported', requestId: entry.request.requestId, published: true, revision,
      report, freshness: fresh(entry, started, entry.request.freshness.mode === 'synchronized', reused) });
  }
  function satisfy(context: LiveContext, entries: readonly PendingCheck[], run: Extract<IncrementRun, { status: 'reported' }>, revision: ContextRevision | null, started: number, reused: boolean): void {
    for (const entry of entries) {
      if (entry.settled) continue;
      if (!run.retained || !revision) {
        complete(entry, { status: 'reported', requestId: entry.request.requestId, published: false, revision: null,
          report: run.report, freshness: fresh(entry, started, false) }); continue;
      }
      if (entry.request.freshness.mode === 'synchronized') {
        const mismatches: { path: string; expected: string | null; observed: string | null }[] = [];
        let missing = false;
        for (const expected of entry.request.freshness.expect) {
          const input = run.retained.inputs.find(input => input.path === expected.path && input.role !== 'directory');
          if (!input) { missing = true; break; }
          const observed = input.role === 'absent' ? null : input.sha256;
          if (expected.sha256 !== observed) mismatches.push({ path: expected.path, expected: expected.sha256, observed });
        }
        if (missing) { complete(entry, { ...unavailable('unobserved-input'), requestId: entry.request.requestId }); continue; }
        if (mismatches.length) { complete(entry, { status: 'superseded', requestId: entry.request.requestId, revision, mismatches }); continue; }
      }
      reported(entry, revision, reused ? context.history.published!.report : run.report, started, reused);
    }
  }
  async function analyze(context: LiveContext): Promise<void> {
    const first = context.queue.find(entry => !entry.settled && entry.request.freshness.mode === 'synchronized');
    const invocation: Invocation = first?.invocation ?? { project: context.project, setup: context.selection.setup };
    const entries: PendingCheck[] = [];
    if (first) {
      const key = invocationKey(invocation);
      for (const entry of context.queue) {
        if (entry.settled || entry.request.freshness.mode !== 'synchronized') continue;
        if (invocationKey(entry.invocation) !== key) break;
        entries.push(entry);
      }
      for (const entry of entries) context.queue.splice(context.queue.indexOf(entry), 1);
    }
    const cause: RevisionCause = context.conservative ? (context.sequence === 0 ? 'open' : 'conservative') : entries.length ? 'request' : context.background ?? 'verify';
    const changes: readonly InputChange[] | null = context.conservative ? null : [...context.paths].map(([path, kind]) => ({ path, kind }));
    context.paths.clear(); context.conservative = false; context.background = null;
    context.debounce?.(); context.debounce = null;
    const previous = context.retained;
    const controller = new AbortController();
    const started = clock.now();
    const running = { controller, requests: entries, changes, background: !entries.length, started };
    context.running = running;
    active++;
    if (context.synchronization !== 'watcher-unavailable') context.synchronization = context.sequence === 0 ? 'initializing' : cause === 'conservative' ? 'conservative' : 'reconciling';
    changed(context);
    try {
      const run = await driver.check({ ...invocation, previous, changes }, { signal: controller.signal });
      if (disposed || context.state === 'evicted' || context.state === 'cold' || contexts.get(context.token.context) !== context || controller.signal.aborted) return;
      if (run.status === 'cancelled') {
        for (const entry of entries) complete(entry, { status: 'cancelled', requestId: entry.request.requestId });
        return;
      }
      if (!run.retained || !['completed', 'invalid'].includes(run.report.outcome.execution)) {
        context.synchronization = 'reconciling';
        satisfy(context, entries, { ...run, retained: null }, null, started, false);
        return;
      }
      const fingerprints = createFingerprints(run.retained.inputId, run.retained.inputs,
        run.report.registry?.id ?? run.report.request.registry.id, options.engine);
      const current = context.history.published;
      const reuse = !!current && JSON.stringify(current.revision.fingerprints) === JSON.stringify(fingerprints) && equalReport(current.report, run.report);
      const keepProducts = run.retained.bytes <= budgets.maxRetainedBytesPerContext ? run.retained : null;
      let revision: ContextRevision;
      if (reuse) {
        const retainedDelta = (keepProducts?.bytes ?? 0) - (context.retained?.bytes ?? 0);
        while (totalBytes() + retainedDelta > budgets.maxRetainedBytesGlobal) {
          const historical = [...contexts.values()].filter(item => item.history.count > 1)
            .sort((a, b) => a.history.oldest!.revision.publishedAt - b.history.oldest!.revision.publishedAt)[0];
          if (historical) { historical.history.discardOldest(); continue; }
          const cold = [...contexts.values()].filter(item => item !== context && item.state === 'cold' && !held(item))
            .sort((a, b) => a.lastActivityAt - b.lastActivityAt)[0];
          if (cold) { evict(cold, 'pressure'); continue; }
          context.synchronization = 'reconciling';
          for (const entry of entries) complete(entry, { ...unavailable('resource-unavailable'), requestId: entry.request.requestId });
          return;
        }
        revision = current.revision;
      } else {
        const availableBytes = reserve(context, run.report, keepProducts?.bytes ?? 0);
        if (availableBytes === null) {
          context.synchronization = 'reconciling';
          for (const entry of entries) complete(entry, { ...unavailable('resource-unavailable'), requestId: entry.request.requestId });
          return;
        }
        revision = freeze({ token: context.token, revision: createRevisionId(context.token.generation, context.sequence + 1),
          sequence: context.sequence + 1, publishedAt: clock.now(), cause, fingerprints,
          changed: previous ? run.changed : null, reused: run.reused, outcome: run.report.outcome, summary: run.report.summary });
        if (!context.history.append(revision, freeze(run.report), availableBytes)) throw new Error('Reserved report did not fit history');
        context.sequence++;
        if (run.report.outcome.execution === 'completed') context.lastValid = revision;
      }
      context.scope = run.report.scope;
      context.retained = keepProducts;
      if (!keepProducts) context.conservative = true;
      context.state = 'warm';
      context.synchronization = context.background ? (context.conservative ? 'conservative' : 'reconciling') : 'synchronized';
      if (context.watcherState === 'unavailable') attach(context);
      satisfy(context, entries, run, revision, started, reuse);
      for (const waiting of context.queue.filter(entry => entry.request.freshness.mode === 'published')) {
        reported(waiting, revision, context.history.published!.report, null);
        context.queue.splice(context.queue.indexOf(waiting), 1);
      }
      if (!reuse) emit(context, { type: 'revision-published', token: context.token, revision, coalesced: 0 });
    } catch (error) {
      if (!controller.signal.aborted && !disposed && context.state !== 'evicted') {
        context.synchronization = 'reconciling';
        for (const entry of entries) complete(entry, { ...unavailable('analysis-failed', String(error)), requestId: entry.request.requestId });
      }
    } finally {
      if (controller.signal.aborted) for (const entry of entries) complete(entry,
        disposed ? { ...unavailable('disposed'), requestId: entry.request.requestId } : { status: 'cancelled', requestId: entry.request.requestId });
      context.running = null; active--;
      if (context.state !== 'evicted' && !disposed) { verifyLater(context); scheduleIdle(context); changed(context); }
      kick();
    }
  }
  function kick(): void {
    if (pumping || disposed) return;
    pumping = true;
    queueMicrotask(() => {
      pumping = false;
      if (disposed) return;
      for (const context of contexts.values()) {
        if (active >= budgets.maxConcurrentAnalyses) break;
        if (context.running || context.state === 'cold' || context.state === 'evicted') continue;
        const request = context.queue.some(entry => !entry.settled && entry.request.freshness.mode === 'synchronized');
        if (!request && (!context.background || context.debounce)) continue;
        track(analyze(context));
      }
    });
  }
  function check(request: CheckRequest, lease: string, control?: RunControl): Promise<CheckOutcome> {
    const found = lookup(request.token);
    if ('status' in found) return Promise.resolve({ ...found, requestId: request.requestId });
    const context = found;
    if (control?.signal?.aborted) return Promise.resolve({ status: 'cancelled', requestId: request.requestId });
    touch(context);
    return new Promise(resolve => {
      const entry: PendingCheck = { request: freeze(structuredClone(request)), lease, acknowledged: clock.now(),
        invocation: context.invocations.get(lease) ?? { project: context.project, setup: context.selection.setup }, resolve, cleanup: () => {}, settled: false };
      const cancel = () => {
        complete(entry, { status: 'cancelled', requestId: request.requestId });
        const position = context.queue.indexOf(entry);
        if (position !== -1) context.queue.splice(position, 1);
        if (context.running?.requests.includes(entry) && context.running.requests.every(item => item.settled)) context.running.controller.abort();
        scheduleIdle(context);
      };
      control?.signal?.addEventListener('abort', cancel, { once: true });
      entry.cleanup = () => control?.signal?.removeEventListener('abort', cancel);
      if (request.freshness.mode === 'published') {
        const published = request.freshness.revision ? context.history.get(request.freshness.revision) : context.history.published;
        if (published) { reported(entry, published.revision, published.report, null); return; }
        if (request.freshness.revision) { complete(entry, { ...unavailable('evicted-revision'), requestId: request.requestId }); return; }
        if (!request.freshness.wait) { complete(entry, { status: 'pending', requestId: request.requestId, current: snapshot(context) }); return; }
      }
      context.queue.push(entry);
      scheduleIdle(context); kick();
    });
  }
  async function open(request: ProjectRequest, setup: ContextSetup, lease: string, control?: RunControl): Promise<OpenOutcome> {
    if (disposed) return unavailable('disposed');
    if (setup.registry !== 'default' || setup.capabilities.some(item => !implemented.has(item))) return unavailable('unsupported-setup');
    const controller = new AbortController();
    const abort = () => controller.abort();
    control?.signal?.addEventListener('abort', abort, { once: true });
    if (control?.signal?.aborted) controller.abort();
    resolving.add(controller);
    try {
      const project = freeze(structuredClone(request));
      const requestedSetup = freeze(structuredClone(setup));
      const resolution = await driver.resolve(project, { signal: controller.signal });
      if (disposed) return unavailable('disposed');
      if (controller.signal.aborted) return unavailable('analysis-failed', 'Opening request was cancelled');
      if (resolution.status !== 'resolved') {
        const run = await driver.check({ project, setup: requestedSetup, previous: null, changes: null }, { signal: controller.signal });
        if (disposed) return unavailable('disposed');
        return run.status === 'cancelled' ? unavailable('analysis-failed', 'Opening request was cancelled') : { status: 'unresolved', resolution, report: run.report };
      }
      const selection = freeze({ root: resolution.root, scope: project.scope, configuration: project.configuration, setup: requestedSetup });
      const id = createContextId(selection);
      const existing = contexts.get(id);
      if (existing) {
        existing.invocations.set(lease, { project, setup: requestedSetup }); touch(existing);
        return { status: 'opened', token: existing.token, created: false, current: snapshot(existing) };
      }
      if (contexts.size >= budgets.maxContexts) {
        const victim = [...contexts.values()].filter(item => !held(item)).sort((a, b) => a.lastActivityAt - b.lastActivityAt)[0];
        if (!victim || budgets.maxContexts === 0) return unavailable('resource-unavailable');
        evict(victim, 'pressure');
      }
      const now = clock.now();
      const context: LiveContext = {
        token: freeze({ context: id, generation: options.generationId() }), selection, project, openedAt: now, lastActivityAt: now, hadLease: false,
        invocations: new Map([[lease, { project, setup: requestedSetup }]]), subscriptions: new Map(),
        history: createHistory(budgets.maxHistoryRevisions, budgets.maxHistoryBytes), queue: [], paths: new Map(),
        scope: null, state: 'opening', synchronization: 'initializing', lastValid: null, retained: null, sequence: 0,
        watcher: null, watcherState: 'disposed', attaching: false, conservative: true, background: 'open', running: null,
        debounce: null, verification: null, idle: null,
      };
      contexts.set(id, context);
      const current = snapshot(context);
      attach(context); scheduleIdle(context); kick();
      return { status: 'opened', token: context.token, created: true, current };
    } catch (error) { return unavailable(disposed ? 'disposed' : 'analysis-failed', String(error)); }
    finally { resolving.delete(controller); control?.signal?.removeEventListener('abort', abort); }
  }
  return {
    open: (request, setup, lease, control) => track(open(request, setup, lease, control)), check,
    status(token) { const found = lookup(token); if ('status' in found) return found; touch(found); return snapshot(found); },
    list: () => [...contexts.values()].map(snapshot),
    subscribe(token, lease, listener) {
      const found = lookup(token); if ('status' in found) return found;
      touch(found);
      const id = randomUUID();
      found.subscriptions.set(id, { lease, listener }); scheduleIdle(found);
      return { id, current: snapshot(found), close() { found.subscriptions.delete(id); scheduleIdle(found); } };
    },
    release(lease) {
      for (const context of contexts.values()) {
        context.invocations.delete(lease);
        for (const [id, subscription] of context.subscriptions) if (subscription.lease === lease) context.subscriptions.delete(id);
        for (const entry of [...context.queue, ...context.running?.requests ?? []]) if (entry.lease === lease) complete(entry, { status: 'cancelled', requestId: entry.request.requestId });
        for (let index = context.queue.length - 1; index >= 0; index--) if (context.queue[index]!.settled) context.queue.splice(index, 1);
        if (context.running && !context.running.background && context.running.requests.every(entry => entry.settled)) context.running.controller.abort();
        scheduleIdle(context);
      }
    },
    dispose() {
      if (disposing) return disposing;
      disposed = true;
      for (const controller of resolving) controller.abort();
      for (const context of [...contexts.values()]) evict(context, 'disposed');
      disposing = (async () => { while (lifetimes.size) await Promise.allSettled([...lifetimes]); await driver.dispose(); })();
      return disposing;
    },
  };
}
