import { randomUUID } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { RetainedSession } from '../../analysis/src/interfaces/session.js';
import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { DependencyDiagramRunner } from '../../analysis/src/interfaces/dependency-analyzer.js';
import type { ApiViewQueryLimits, CheckOutcome, ContextEvent, ContextStatus, ContextToken, OpenOutcome, SubscriptionHandle, Unavailable } from '../subs/contexts/src/interfaces/contexts.js';
import { createContextManager } from '../subs/contexts/src/context-manager.js';
import type { DaemonCounters, MaterializeOutcome, MaterializeParams, RamifyService, ServiceErrorCode, ServiceResult } from '../../../src/interfaces/service.js';
import type { DaemonService, DaemonServiceOptions, ServiceLease, StopDisposition } from './interfaces/daemon.js';
import { validateServiceRequest } from './validation.js';
import { transportCounters } from './host-counters.js';

/** `contracts.md`'s iteration-1 frozen `RetainedSession.apiView` bounds. Passed
 * explicitly to `createContextManager`, rather than relying on its own equal
 * default, so the production wiring self-documents the frozen numbers. */
const apiViewLimits: ApiViewQueryLimits = {
  details: { maxSignatureBytes: 2048, maxDocumentationBytes: 512, maxOverloads: 8, maxResultBytes: 32 * 1024 ** 2 },
  maxAreaBytes: 32 * 1024 ** 2, maxInvocationBytes: 256 * 1024 ** 2,
};

const serviceDiagnostics = channel('ramify.daemon.service');
const stopRequests = new AsyncLocalStorage<string>();

/** The host supplies the wire envelope identity without changing StopParams. */
export function withStopRequestId<T>(requestId: string, operation: () => T): T {
  return stopRequests.run(requestId, operation);
}
const rejectedDispatches = new WeakMap<RamifyService, () => void>();

function success<T>(value: T): ServiceResult<T> { return { ok: true, value }; }
function failure<T>(code: ServiceErrorCode, message: string): ServiceResult<T> { return { ok: false, error: { code, message, details: {} } }; }
function domainError<T>(value: Unavailable): ServiceResult<T> {
  return failure(value.reason === 'unknown-context' || value.reason === 'expired-generation' ? value.reason : 'internal-error', value.message);
}

export function createDaemonService(options: DaemonServiceOptions): DaemonService {
  const startedAt = options.clock.now();
  const counters = { revisions: 0, analyses: 0, cancelledAnalyses: 0, reusedRevisions: 0, coalescedEvents: 0,
    evictions: 0, rejectedRequests: 0, disconnectedSlowConsumers: 0, sweeps: 0, audits: 0, auditMismatches: 0,
    coveredRequests: 0, coldOutcomes: 0, deadlineOutcomes: 0, behaviorRuns: 0, dependencyDiagrams: 0,
    dependencyDiagramInputChanges: 0 } satisfies DaemonCounters;
  const runner = options.dependencyDiagrams;
  /** Counts each analyzer job and its reported classifier runs; the daemon never classifies itself. */
  const dependencyDiagrams: DependencyDiagramRunner | undefined = runner && {
    async run(input, control) {
      counters.dependencyDiagrams++;
      const outcome = await runner.run(input, control);
      if (outcome.status === 'ready') counters.behaviorRuns += outcome.behaviorRuns;
      if (outcome.status === 'inputs-changed') counters.dependencyDiagramInputChanges++;
      return outcome;
    },
  };
  let stopping = false;
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  const observed = new Map<string, number>();
  const manager = createContextManager({ ...options, apiViewLimits, dependencyDiagrams, engine: options.instance.engine, generationId: () => `gen/1:${randomUUID()}`,
    driver: {
      resolve: (request, control, known) => options.driver.resolve(request, control, known),
      async open(project, setup, control) {
        const opened = await measured(control, () => options.driver.open(project, setup, control));
        if (opened.status !== 'opened') return opened;
        const session = opened.session;
        const counted: RetainedSession = {
          get current() { return session.current; },
          update: (changes, control, invocation) => measured(control, () => session.update(changes, control, invocation)),
          sweep: control => { counters.sweeps++; return measured(control, () => session.sweep(control)); },
          async verify(control) {
            counters.audits++;
            const result = await measured(control, () => session.verify(control));
            if (result.status === 'mismatch') {
              counters.auditMismatches++;
              options.log({ at: options.clock.now(), level: 'error', event: 'audit-mismatch', message: `Retained analysis audit mismatch: ${result.fields.join(', ')}` });
            }
            return result;
          },
          report: session.report.bind(session), releaseRevision: session.releaseRevision.bind(session),
          status: session.status.bind(session), releaseCompiler: session.releaseCompiler.bind(session),
          apiView: session.apiView.bind(session), architectView: session.architectView.bind(session),
          explorerDetails: session.explorerDetails.bind(session), dispose: session.dispose.bind(session),
        };
        return { ...opened, session: counted };
      },
      dispose: () => options.driver.dispose(),
    } });
  async function measured<T extends { readonly status: string }>(control: RunControl | undefined, run: () => Promise<T>): Promise<T> {
    counters.analyses++;
    let cancelled = false;
    const abort = () => { if (!cancelled) { cancelled = true; counters.cancelledAnalyses++; } };
    control?.signal?.addEventListener('abort', abort, { once: true });
    if (control?.signal?.aborted) abort();
    try { const result = await run(); if (result.status === 'cancelled') abort(); return result; }
    finally { control?.signal?.removeEventListener('abort', abort); }
  }
  const clients = new Map<string, { pairs: Map<string, string>; subscriptions: Map<string, { handle: SubscriptionHandle; token: ContextToken }>;
    opening: Set<AbortController>; released: boolean }>();
  const stops = new Set<(disposition: StopDisposition) => void>();
  const key = (token: ContextToken) => `${token.context}/${token.generation}`;
  // A per-project-root FIFO chain: `apiView`'s revision slot is released before
  // `materialize` publishes, so two overlapping materialize invocations for the
  // same project could otherwise publish out of order. Acquired before calling
  // `contexts.apiView`, released once `publisher.publish` settles (including
  // cancellation or disconnect); never blocks `check`. See contracts.md "Root
  // service and wire", Revision (iteration 8).
  const publicationLocks = new Map<string, Promise<unknown>>();
  function withPublicationLock<T>(root: string, run: () => Promise<T>): Promise<T> {
    const prior = publicationLocks.get(root) ?? Promise.resolve();
    const settledPrior = prior.then(() => undefined, () => undefined);
    const result = settledPrior.then(run);
    const tail = result.then(() => undefined, () => undefined);
    publicationLocks.set(root, tail);
    void tail.finally(() => { if (publicationLocks.get(root) === tail) publicationLocks.delete(root); });
    return result;
  }
  function observe(): readonly ContextStatus[] {
    const list = manager.list();
    const live = new Set<string>();
    for (const status of list) {
      const id = key(status.token); live.add(id);
      const previous = observed.get(id) ?? 0;
      const current = status.published?.sequence ?? 0;
      counters.revisions += current - previous;
      observed.set(id, current);
    }
    for (const id of observed.keys()) if (!live.has(id)) { counters.evictions++; observed.delete(id); }
    for (const client of clients.values()) {
      for (const id of client.pairs.keys()) if (!live.has(id)) client.pairs.delete(id);
      for (const [id, subscription] of client.subscriptions) if (!live.has(key(subscription.token))) {
        subscription.handle.close(); client.subscriptions.delete(id);
      }
    }
    return list;
  }
  function bind(client: string): ServiceLease {
    const id = `lease/1:${randomUUID()}`;
    const state = { pairs: new Map<string, string>(), subscriptions: new Map<string, { handle: SubscriptionHandle; token: ContextToken }>(),
      opening: new Set<AbortController>(), released: false };
    clients.set(id, state);
    function guard<T>(operation: string, params: unknown): ServiceResult<T> | null {
      const invalid = validateServiceRequest(operation, params);
      if (invalid) { counters.rejectedRequests++; return { ok: false, error: invalid }; }
      if (stopping || disposed) return failure('stopping', 'Daemon is stopping');
      if (state.released) return failure('cancelled', 'Client lease was released');
      return null;
    }
    function pair(token: ContextToken): string {
      const selection = key(token);
      let lease = state.pairs.get(selection);
      if (!lease) {
        lease = `${id}/${randomUUID()}`;
        // A fabricated token must not retain an unbounded per-client pair.
        if (manager.list().some(context => key(context.token) === selection)) state.pairs.set(selection, lease);
      }
      return lease;
    }
    function releasePair(token: ContextToken): void {
      const selection = key(token);
      const lease = state.pairs.get(selection);
      if (lease) { manager.release(lease); state.pairs.delete(selection); }
      for (const [subscription, value] of state.subscriptions) if (key(value.token) === selection) {
        value.handle.close(); state.subscriptions.delete(subscription);
      }
    }
    /** Query the revision-bound projection, then publish it while the per-root
     * lock is held; maps every context and publisher outcome without ever
     * converting a domain failure to success. Runs entirely inside
     * `withPublicationLock`, so a queued sibling invocation for the same root
     * cannot start until this one's publish (or non-projected outcome) settles. */
    async function runMaterialize(params: MaterializeParams, root: string, control?: RunControl): Promise<MaterializeOutcome> {
      const outcome = await manager.apiView({ token: params.token, requestId: params.requestId, freshness: params.freshness,
        selection: params.selection, ...(params.deadlineMs === undefined ? {} : { deadlineMs: params.deadlineMs }) }, pair(params.token), control);
      // `outcome.status === 'projected'` is checked first (a positive equality
      // narrow, which TS handles correctly) so every other branch below never
      // needs to touch `.revision`/`.projection`: TS does not narrow away the
      // remaining `{ status: 'pending' | 'cold'; ... }` member by elimination
      // (confirmed: neither `||`-combined nor separate equality checks against
      // both of its literal values remove it from what a later branch sees),
      // so every branch here is an explicit positive check, never a fallthrough.
      if (outcome.status === 'projected') {
        // The API view alone: no materialize request names the architect view yet.
        const published = await options.publisher.publish(root, outcome.revision.revision, { api: outcome.projection, architect: null },
          params.requestId, control);
        if (published.status === 'cancelled') return { status: 'cancelled', requestId: outcome.requestId };
        if (published.status === 'unavailable') {
          // The publisher's own reason vocabulary ('invalid-path'/'resource-limit') is
          // one layer lower than MaterializeOutcome's frozen reason union, which has no
          // member of either exact name; fold them onto their nearest existing member
          // ('invalid-location'/'resource-unavailable', already how the session layer
          // folds its own 'resource-limit') rather than widening the frozen union.
          const reason = published.reason === 'invalid-path' ? 'invalid-location'
            : published.reason === 'resource-limit' ? 'resource-unavailable' : published.reason;
          return { status: 'unavailable', requestId: outcome.requestId, reason, message: published.message };
        }
        return { status: 'materialized', requestId: outcome.requestId, revision: outcome.revision, freshness: outcome.freshness,
          targets: published.targets, bytesWritten: published.bytesWritten, ...(outcome.timings ? { timings: outcome.timings } : {}) };
      }
      if (outcome.status === 'pending') return { status: 'pending', requestId: outcome.requestId, current: outcome.current };
      if (outcome.status === 'cold') return { status: 'cold', requestId: outcome.requestId, current: outcome.current };
      if (outcome.status === 'deadline-exceeded') return { status: 'deadline-exceeded', requestId: outcome.requestId, revision: outcome.revision, elapsedMs: outcome.elapsedMs };
      if (outcome.status === 'superseded') return { status: 'superseded', requestId: outcome.requestId, revision: outcome.revision };
      if (outcome.status === 'cancelled') return { status: 'cancelled', requestId: outcome.requestId };
      if (outcome.status === 'unavailable') return { status: 'unavailable', requestId: outcome.requestId, reason: outcome.reason, message: outcome.message };
      throw new Error(`Unhandled apiView outcome status: ${(outcome as { status: string }).status}`);
    }
    const service: RamifyService = {
      async openContext(params, control) {
        const invalid = guard<OpenOutcome>('openContext', params); if (invalid) return invalid;
        if (control?.signal?.aborted) return failure('cancelled', 'Opening request was cancelled');
        const controller = new AbortController();
        const abort = () => controller.abort();
        control?.signal?.addEventListener('abort', abort, { once: true });
        state.opening.add(controller);
        const temporary = `${id}/${randomUUID()}`;
        try {
          let outcome = await manager.open(params.project, params.setup, temporary, { signal: controller.signal });
          if (controller.signal.aborted && !disposed) { manager.release(temporary); return failure('cancelled', 'Opening request was cancelled'); }
          if (outcome.status === 'opened') {
            const existing = state.pairs.get(key(outcome.token));
            if (existing) {
              outcome = await manager.open(params.project, params.setup, existing, { signal: controller.signal });
              manager.release(temporary);
            } else state.pairs.set(key(outcome.token), temporary);
          } else manager.release(temporary);
          observe();
          return success(outcome);
        } finally { state.opening.delete(controller); control?.signal?.removeEventListener('abort', abort); }
      },
      async contextStatus(params) {
        const started = serviceDiagnostics.hasSubscribers ? performance.now() : null;
        try {
          const invalid = guard<ContextStatus>('contextStatus', params); if (invalid) return invalid;
          const result = manager.status(params.token);
          return 'status' in result ? domainError(result) : success(result);
        } finally {
          if (started !== null) serviceDiagnostics.publish({ operation: 'contextStatus', durationMs: performance.now() - started });
        }
      },
      async check(params, control) {
        const invalid = guard<CheckOutcome>('check', params); if (invalid) return invalid;
        const handling = performance.now();
        const result = await manager.check({ ...params, scope: params.scope ?? 'report' }, pair(params.token), control);
        if (result.status === 'reported' && result.freshness.reusedRevision) {
          counters.reusedRevisions++;
          if (result.freshness.captureStarted === null && result.freshness.verified) counters.coveredRequests++;
        }
        if (result.status === 'cold') counters.coldOutcomes++;
        if (result.status === 'deadline-exceeded') counters.deadlineOutcomes++;
        observe();
        // A client subtracts the service's own handling from its round trip to find transport.
        return success(result.status === 'reported' && result.timings
          ? { ...result, timings: Object.freeze({ ...result.timings, service: performance.now() - handling }) } : result);
      },
      async explorerDetails(params, control) {
        const invalid = guard<Awaited<ReturnType<RamifyService['explorerDetails']>> extends ServiceResult<infer T> ? T : never>('explorerDetails', params);
        if (invalid) return invalid;
        const result = await manager.explorerDetails(params, pair(params.token), control);
        observe();
        return success(result);
      },
      async dependencyDiagram(params, control) {
        const invalid = guard<Awaited<ReturnType<RamifyService['dependencyDiagram']>> extends ServiceResult<infer T> ? T : never>('dependencyDiagram', params);
        if (invalid) return invalid;
        const result = await manager.dependencyDiagram(params, pair(params.token), control);
        observe();
        if (result.status !== 'unavailable') return success(result);
        switch (result.reason) {
          case 'resource-unavailable': case 'invalid-current': case 'analysis-failed': case 'resource-limit':
            return success({ status: 'unavailable', requestId: result.requestId, reason: result.reason, message: result.message });
          case 'disposed': return failure('stopping', 'Daemon is stopping');
          default: return domainError(result as Unavailable);
        }
      },
      async materialize(params, control) {
        const invalid = guard<MaterializeOutcome>('materialize', params); if (invalid) return invalid;
        const status = manager.status(params.token);
        if ('status' in status) {
          return success({ status: 'unavailable', requestId: params.requestId, reason: status.reason, message: status.message });
        }
        const root = status.selection.root;
        const handling = performance.now();
        const result = await withPublicationLock(root, () => runMaterialize(params, root, control));
        observe();
        return success(result.status === 'materialized' && result.timings
          ? { ...result, timings: Object.freeze({ ...result.timings, service: performance.now() - handling }) } : result);
      },
      async subscribe(params, listener) {
        const invalid = guard<Awaited<ReturnType<RamifyService['subscribe']>> extends ServiceResult<infer T> ? T : never>('subscribe', params);
        if (invalid) return invalid;
        if (typeof listener !== 'function') return failure('invalid-request', 'Subscription listener must be a function');
        const handle = manager.subscribe(params.token, pair(params.token), (event: ContextEvent) => {
          observe();
          if (event.type === 'context-evicted') {
            for (const [id, subscription] of state.subscriptions) if (key(subscription.token) === key(event.token)) state.subscriptions.delete(id);
            state.pairs.delete(key(event.token));
          }
          if (!state.released) listener(event);
        });
        if ('status' in handle) return domainError(handle);
        state.subscriptions.set(handle.id, { handle, token: params.token });
        return success({ subscription: handle.id, current: handle.current, replay: 'not-available' });
      },
      async unsubscribe(params) {
        const invalid = guard<null>('unsubscribe', params); if (invalid) return invalid;
        const subscription = state.subscriptions.get(params.subscription);
        if (!subscription) return failure('unknown-subscription', 'Subscription does not belong to this client');
        subscription.handle.close(); state.subscriptions.delete(params.subscription);
        return success(null);
      },
      async closeContext(params) {
        const invalid = guard<null>('closeContext', params); if (invalid) return invalid;
        const status = manager.status(params.token);
        if ('status' in status) return domainError(status);
        releasePair(params.token);
        return success(null);
      },
      async daemonStatus(params: unknown = {}) {
        const invalid = guard<Awaited<ReturnType<RamifyService['daemonStatus']>> extends ServiceResult<infer T> ? T : never>('daemonStatus', params);
        if (invalid) return invalid;
        const contexts = observe();
        const memory = process.memoryUsage();
        const host = transportCounters(result);
        return success({ ...options.instance, protocol: 'ramify.ipc/1', startedAt, state: stopping ? 'stopping' : 'running',
          connections: host.connections || Math.max(0, clients.size - 1),
          subscriptions: [...clients.values()].reduce((sum, client) => sum + client.subscriptions.size, 0), contexts,
          budgets: options.budgets, counters: { ...counters, coalescedEvents: counters.coalescedEvents + host.coalescedEvents,
            rejectedRequests: counters.rejectedRequests + host.rejectedRequests,
            disconnectedSlowConsumers: counters.disconnectedSlowConsumers + host.disconnectedSlowConsumers },
          memory: { rss: memory.rss, heapUsed: memory.heapUsed, external: memory.external } });
      },
      async stopDaemon(params) {
        const invalid = guard<{ readonly instanceId: string; readonly stopping: true }>('stopDaemon', params); if (invalid) return invalid;
        if (params.instanceId !== options.instance.instanceId) return failure('wrong-instance', 'The daemon instance does not match');
        stopping = true;
        const disposition: StopDisposition = { reason: 'explicit', at: options.clock.now(), requestId: stopRequests.getStore() ?? null };
        for (const listener of [...stops]) {
          try { listener(disposition); } catch (error) {
            options.log({ at: options.clock.now(), level: 'error', event: 'stop-listener-failed', message: String(error) });
          }
        }
        return success({ instanceId: options.instance.instanceId, stopping: true });
      },
    };
    rejectedDispatches.set(service, () => { counters.rejectedRequests++; });
    return { id, service, release() {
      if (state.released) return;
      state.released = true;
      for (const controller of state.opening) controller.abort();
      for (const value of state.subscriptions.values()) value.handle.close();
      state.subscriptions.clear();
      for (const lease of state.pairs.values()) manager.release(lease);
      state.pairs.clear(); clients.delete(id);
      options.log({ at: options.clock.now(), level: 'info', event: 'client-released', message: `Released ${client}` });
    } };
  }
  const direct = bind('direct');
  const result: DaemonService = { ...direct.service, instance: options.instance, lease: bind,
    onStop(listener) { stops.add(listener); return () => { stops.delete(listener); }; },
    dispose() {
      if (disposePromise) return disposePromise;
      disposed = true;
      disposePromise = manager.dispose().finally(() => {
        for (const state of clients.values()) { state.released = true; state.pairs.clear(); state.subscriptions.clear(); }
        clients.clear(); stops.clear();
      });
      return disposePromise;
    } };
  rejectedDispatches.set(result, () => { counters.rejectedRequests++; });
  return result;
}

/** Shared request dispatch for actual IPC and codec-backed direct channels. */
export async function dispatchServiceRequest(service: RamifyService, operation: string, params: unknown,
  control?: RunControl, listener?: (event: ContextEvent) => void, requestId?: string): Promise<ServiceResult<unknown>> {
  const input = params as never;
  switch (operation) {
    case 'openContext': return service.openContext(input, control);
    case 'contextStatus': return service.contextStatus(input);
    case 'check': return service.check(input, control);
    case 'explorerDetails': return service.explorerDetails(input, control);
    case 'dependencyDiagram': return service.dependencyDiagram(input, control);
    case 'materialize': return service.materialize(input, control);
    case 'subscribe': return listener ? service.subscribe(input, listener) : failure('invalid-request', 'Subscription listener is required');
    case 'unsubscribe': return service.unsubscribe(input);
    case 'closeContext': return service.closeContext(input);
    case 'daemonStatus': return (service.daemonStatus as (params: unknown) => ReturnType<RamifyService['daemonStatus']>)(params);
    case 'stopDaemon': return requestId === undefined ? service.stopDaemon(input)
      : withStopRequestId(requestId, () => service.stopDaemon(input));
    default:
      rejectedDispatches.get(service)?.();
      return failure('unsupported-operation', 'Unsupported service operation');
  }
}
