import { randomUUID } from 'node:crypto';
import { assembleResidentService, createSessionDriver, residentPublishLimits } from '../resident-assembly.js';
import { contextBudgets, daemonBudgets } from '../resident-budgets.js';
import { runBatch } from '../batch.js';
import type { BatchOperation } from '../interfaces/batch.js';
import type { ServiceOperation, ServiceResult, SubscriptionOpened } from '../interfaces/service.js';
import type { RunControl } from '../../subs/analysis/src/interfaces/analysis.js';
import type { DependencyDiagramRunner } from '../../subs/analysis/src/interfaces/dependency-analyzer.js';
import type { AnalysisDriver, ContextBudgets, ContextEvent } from '../../subs/daemon/src/context-types.js';
import { createDaemonService, dispatchServiceRequest } from '../../subs/daemon/src/service.js';
import { createControlledClock, createControlledWatcher } from '../../subs/daemon/subs/contexts/src/tests/controlled-ports.js';
import type { ControlledClock, ControlledWatcher } from '../../subs/daemon/subs/contexts/src/tests/controlled-ports.js';
import type { ApiViewPublisher, DaemonInstance, DaemonService, ServiceConnector, ServiceConnection, WireMessage, DaemonRecord,
  DisconnectReason, StopDisposition } from '../../subs/daemon/src/interfaces/daemon.js';
import { createFilesystemApiViewPublisher } from '../../subs/daemon/src/api-view-publisher.js';
import { encodeMessage, decodeMessage } from '../../subs/daemon/src/codec.js';

export interface QuickEnvironment {
  readonly service: DaemonService;
  readonly watcher: ControlledWatcher;
  readonly clock: ControlledClock;
  readonly connect: ServiceConnector;
  readonly batch: BatchOperation;
  /** A production session driver independent of the service's own, for tests that
   * compare a daemon answer with a directly opened retained session. The caller may
   * dispose it; `dispose()` disposes every driver handed out, so none outlives the environment. */
  sessionDriver(): AnalysisDriver;
  request(operation: string, params: unknown, control?: RunControl): Promise<ServiceResult<unknown>>;
  dispose(): Promise<void>;
}

/** Real service and analysis, with only time, watching and transport controlled. */
export async function createQuickEnvironment(options: Partial<ContextBudgets> = {},
  fixture: { readonly instance?: DaemonInstance; readonly driver?: AnalysisDriver; readonly publisher?: ApiViewPublisher;
    readonly dependencyDiagrams?: DependencyDiagramRunner; readonly architectMetricsPolicy?: 'measure' | 'omit';
    readonly maxResponseBytes?: number } = {}): Promise<QuickEnvironment> {
  const watcher = createControlledWatcher(), clock = createControlledClock(Date.now());
  const instance = fixture.instance ?? { instanceId: randomUUID(), pid: process.pid, version: '0.0.0',
    engine: 'ramify.ts@0.0.0+typescript@7.0.2', buildKey: '0000000000000000' };
  const startedAt = clock.now();
  const publisher = fixture.publisher ?? createFilesystemApiViewPublisher(residentPublishLimits);
  const assembly = { watcher, clock, budgets: { ...contextBudgets, ...options }, instance, log() {}, publisher,
    maxResponseBytes: fixture.maxResponseBytes ?? daemonBudgets.maxResponseBytes,
    ...(fixture.dependencyDiagrams ? { dependencyDiagrams: fixture.dependencyDiagrams } : {}),
    ...(fixture.architectMetricsPolicy ? { architectMetricsPolicy: fixture.architectMetricsPolicy } : {}) };
  const service = fixture.driver ? createDaemonService({ ...assembly, driver: fixture.driver }) : assembleResidentService(assembly);
  const connections = new Set<ServiceConnection>();
  const drivers = new Set<AnalysisDriver>();
  let disposed = false, stopped: StopDisposition | null = null;
  const stopListener = service.onStop(value => { stopped = value; });
  const through = (message: WireMessage) => decodeMessage(encodeMessage(message));
  function record(): DaemonRecord {
    return { schemaVersion: 'ramify.daemon-record/1', ...instance, protocol: 'ramify.ipc/1',
      socket: '/quick', startedAt, state: stopped ? 'stopped' : 'running', stopped };
  }
  const connect: ServiceConnector = async options => {
    options.signal?.throwIfAborted();
    if (disposed) return { status: 'unavailable', attempts: 0, message: 'Quick environment is disposed', reason: { kind: 'closed' } };
    if (stopped) return { status: 'stopped', record: record() };
    const lease = service.lease(randomUUID());
    let closed = false, seq = 0;
    const requests = new Map<string, AbortController>();
    const hello = through({ type: 'hello', handshake: { protocol: 'ramify.ipc/1',
      client: { name: 'quick', version: instance.version }, buildKey: instance.buildKey, engine: instance.engine } });
    if (hello.type !== 'hello') throw new Error('Unexpected quick handshake');
    const welcome = through({ type: 'welcome', welcome: { protocol: 'ramify.ipc/1', instance,
      capabilities: ['contexts', 'check', 'subscribe', 'daemon-control', 'materialize', 'measure', 'explorerDetails', 'dependencyDiagram', 'materialize-views', 'affected'],
      limits: { maxRequestBytes: daemonBudgets.maxRequestBytes, maxResponseBytes: daemonBudgets.maxResponseBytes,
        leaseMs: daemonBudgets.leaseMs, pingMs: daemonBudgets.pingMs } } });
    if (welcome.type !== 'welcome') throw new Error('Unexpected quick welcome');
    async function call<T>(op: ServiceOperation, params: unknown, control?: RunControl,
      listener?: (event: ContextEvent) => void): Promise<ServiceResult<T>> {
      const cancelled = (): ServiceResult<T> => ({ ok: false, error: {
        code: 'cancelled', message: closed ? 'Connection closed' : 'Request cancelled', details: {} } });
      if (closed || control?.signal?.aborted) return cancelled();
      const request = through({ type: 'request', id: randomUUID(), op, params });
      if (request.type !== 'request') throw new Error('Unexpected quick request');
      const controller = new AbortController();
      requests.set(request.id, controller);
      const abort = () => {
        const message = through({ type: 'cancel', id: request.id });
        if (message.type === 'cancel') requests.get(message.id)?.abort(control?.signal?.reason);
      };
      control?.signal?.addEventListener('abort', abort, { once: true });
      try {
        const result = await dispatchServiceRequest(lease.service, request.op, request.params,
          { signal: controller.signal }, listener, request.id, daemonBudgets.maxResponseBytes);
        if (closed || controller.signal.aborted) return cancelled();
        const response = through({ type: 'response', id: request.id, result });
        if (response.type !== 'response') throw new Error('Unexpected quick response');
        return response.result as ServiceResult<T>;
      } finally {
        requests.delete(request.id);
        control?.signal?.removeEventListener('abort', abort);
      }
    }
    const connection: ServiceConnection = {
      daemon: welcome.welcome,
      get state() { return closed ? 'closed' : stopped ? 'stopped' : 'connected'; },
      get reason(): DisconnectReason | null { return closed ? { kind: 'closed' } : stopped
        ? stopped.reason === 'explicit' ? { kind: 'explicit-stop', requestId: stopped.requestId } : { kind: 'idle-exit' } : null; },
      openContext: (params, control) => call('openContext', params, control),
      contextStatus: params => call('contextStatus', params),
      check: (params, control) => call('check', params, control),
      explorerDetails: (params, control) => call('explorerDetails', params, control),
      dependencyDiagram: (params, control) => call('dependencyDiagram', params, control),
      materialize: (params, control) => call('materialize', params, control),
      measure: (params, control) => call('measure', params, control),
      affected: (params, control) => call('affected', params, control),
      async subscribe(params, listener) {
        let subscriptionId: string | undefined;
        const initial: ContextEvent[] = [];
        const deliver = (event: ContextEvent) => {
          if (subscriptionId === undefined) { initial.push(event); return; }
          const message = through({ type: 'event', seq: ++seq, subscription: subscriptionId, event });
          if (!closed && message.type === 'event') listener(message.event);
        };
        const result = await call<SubscriptionOpened>('subscribe', params, undefined, deliver);
        if (result.ok) { subscriptionId = result.value.subscription; for (const event of initial.splice(0)) deliver(event); }
        return result;
      },
      unsubscribe: params => call('unsubscribe', params),
      closeContext: params => call('closeContext', params),
      daemonStatus: () => call('daemonStatus', {}),
      stopDaemon: params => call('stopDaemon', params),
      async recover() {
        if (stopped) return { status: 'stopped', record: record() };
        if (!closed) return { status: 'recovered', instance, restarted: false };
        return { status: 'unavailable', attempts: 0, reason: { kind: 'closed' } };
      },
      async close() {
        if (closed) return;
        closed = true;
        for (const controller of requests.values()) controller.abort();
        lease.release(); connections.delete(connection);
      },
    };
    connections.add(connection);
    return { status: 'connected', connection, started: false };
  };
  return { service, watcher, clock, connect, batch: runBatch,
    sessionDriver() {
      const driver = createSessionDriver();
      drivers.add(driver);
      return driver;
    },
    async request(operation, params, control) {
      const message = through({ type: 'request', id: randomUUID(), op: operation, params });
      if (message.type !== 'request') throw new Error('Unexpected quick request');
      const response = through({ type: 'response', id: message.id,
        result: await dispatchServiceRequest(service, message.op, message.params, control, undefined, message.id,
          fixture.maxResponseBytes ?? daemonBudgets.maxResponseBytes) });
      if (response.type !== 'response') throw new Error('Unexpected quick response');
      return response.result;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      try {
        await Promise.all([...connections].map(connection => connection.close()));
        stopListener();
        await service.dispose();
        if (connections.size || watcher.active || clock.pending) {
          throw new Error(`Quick environment leaked ${connections.size} connections, ${watcher.active} watchers and ${clock.pending} timers`);
        }
      } finally {
        stopListener();
        // A driver's disposal is idempotent, so one the caller already disposed is harmless here.
        const closed = await Promise.allSettled([...drivers].map(driver => driver.dispose()));
        drivers.clear();
        try { await watcher.dispose(); } finally { clock.dispose(); }
        const failures = closed.filter(result => result.status === 'rejected');
        if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Quick environment session driver cleanup failed');
      }
    },
  };
}
