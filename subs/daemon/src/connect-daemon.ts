import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConnectOptions, ConnectOutcome, ConnectTimeouts, ConnectionState, DisconnectReason, RecoveryOutcome, ServiceConnection } from './interfaces/daemon.js';
import { selectEndpoint, readDaemonRecord } from './discovery.js';
import { processAlive } from './records.js';
import { launchDaemon, readStartOwner } from './launcher.js';
import { ConnectionFailure, openSocketConnection, type SocketConnection } from './connection.js';

const defaults: ConnectTimeouts = { handshakeMs: 2000, startupMs: 10_000, startAttempts: 2,
  reconnectAttempts: 3, reconnectBackoffMs: [250, 500, 1000], restartAttempts: 1, totalRecoveryMs: 20_000 };
async function packageRoot(): Promise<string> {
  let path = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try { const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')); if (manifest.name === 'ramify.ts') return path; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = dirname(path); if (parent === path) throw new Error('Cannot locate ramify.ts package root'); path = parent;
  }
}
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason ?? new Error('Connection aborted')); };
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  });
}
const failure = (error: unknown): DisconnectReason => error instanceof ConnectionFailure ? error.reason
  : { kind: 'failure', message: error instanceof Error ? error.message : String(error) };
const terminal = (reason: DisconnectReason) => ['incompatible', 'rejected', 'closed'].includes(reason.kind);

export async function connectDaemon(options: ConnectOptions): Promise<ConnectOutcome> {
  let attempts = 0;
  try {
    options.signal?.throwIfAborted();
    const timeouts = { ...defaults, ...options.timeouts };
    for (const [key, value] of Object.entries(timeouts)) {
      if (key === 'reconnectBackoffMs') { if (!Array.isArray(value) || value.some(item => !Number.isSafeInteger(item) || item < 0)) throw new Error('Invalid reconnect backoff'); }
      else if (!Number.isSafeInteger(value) || Number(value) < (key.endsWith('Attempts') ? 0 : 1)) throw new Error(`Invalid timeout: ${key}`);
    }
    const endpoint = await selectEndpoint({ packageRoot: await packageRoot(), version: options.client.version, endpointDirectory: options.endpointDirectory });
    let current: SocketConnection | undefined;
    let state: ConnectionState = 'unavailable';
    let reason: DisconnectReason | null = null;
    let closed = false;
    const lifetime = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, lifetime.signal]) : lifetime.signal;
    let recovering: Promise<RecoveryOutcome> | undefined;
    const notify = (next: ConnectionState, why: DisconnectReason | null) => { if (closed && next !== 'closed') return; state = next; reason = why; options.onState?.(next, why); };
    const lost = (why: DisconnectReason) => notify(why.kind === 'explicit-stop' || why.kind === 'idle-exit' ? 'stopped' : 'unavailable', why);
    async function connect(handshakeMs = timeouts.handshakeMs): Promise<void> {
      const opened = await openSocketConnection(endpoint, { ...options, signal }, handshakeMs, lost);
      if (closed) { await opened.close(); throw new ConnectionFailure({ kind: 'closed' }); }
      current = opened; notify('connected', null);
    }
    let record = await readDaemonRecord(endpoint);
    const holder = !record ? await readStartOwner(endpoint) : null;
    if (record?.state === 'starting' && processAlive(record.pid) || !record && holder !== null && processAlive(holder)) {
      const deadline = performance.now() + timeouts.startupMs;
      while (performance.now() < deadline) {
        if (record?.state === 'running' || record?.state === 'stopped') break;
        if (!record) { const owner = await readStartOwner(endpoint); if (owner === null || !processAlive(owner)) break; }
        await delay(50, signal); record = await readDaemonRecord(endpoint);
      }
    }
    let started = false;
    if (record?.state === 'running' && processAlive(record.pid)) {
      attempts++;
      try { await connect(); }
      catch (error) { if (terminal(failure(error))) throw error; if (options.start === 'never') throw error; }
    }
    if (!current) {
      if (options.start === 'never') return record?.state === 'stopped' ? { status: 'stopped', record } : { status: 'not-running' };
      if (!options.daemonEntry) throw new Error('No daemon entry configured');
      let last: unknown = new Error('Daemon startup attempts exhausted');
      for (let attempt = 0; attempt < timeouts.startAttempts && !current; attempt++) {
        attempts++;
        try {
          const launched = await launchDaemon({ endpoint, daemonEntry: options.daemonEntry, version: options.client.version,
            engine: options.engine, startupMs: timeouts.startupMs, signal });
          started ||= launched.started; await connect();
        } catch (error) { last = error; if (terminal(failure(error)) || options.signal?.aborted) throw error; }
      }
      if (!current) throw last;
    }
    async function recovery(authorization: 'automatic' | 'explicit'): Promise<RecoveryOutcome> {
      if (closed) return { status: 'unavailable', attempts: 0, reason: { kind: 'closed' } };
      if (current!.connected) return { status: 'recovered', instance: current!.daemon.instance, restarted: false };
      const observed = reason ?? { kind: 'failure' as const, message: 'Connection lost' };
      let attempts = 0;
      const deadline = performance.now() + timeouts.totalRecoveryMs;
      let record = await readDaemonRecord(endpoint);
      if (closed) return { status: 'unavailable', attempts, reason: { kind: 'closed' } };
      if (authorization === 'automatic' && (observed.kind === 'explicit-stop' || observed.kind === 'idle-exit'
        || record?.state === 'stopped' && ['idle', 'explicit', 'retired'].includes(record.stopped!.reason))) {
        notify('stopped', record?.stopped?.reason === 'explicit' ? { kind: 'explicit-stop', requestId: record.stopped.requestId } : { kind: 'idle-exit' });
        return record ? { status: 'stopped', record } : { status: 'unavailable', attempts, reason: observed };
      }
      if (terminal(observed)) return { status: 'unavailable', attempts, reason: observed };
      let last = observed;
      notify('reconnecting', observed);
      for (let attempt = 0; attempt < timeouts.reconnectAttempts; attempt++) {
        const wait = timeouts.reconnectBackoffMs[Math.min(attempt, timeouts.reconnectBackoffMs.length - 1)] ?? 0;
        if (performance.now() + wait >= deadline || closed) break;
        await delay(wait, signal);
        record = await readDaemonRecord(endpoint);
        if (authorization === 'automatic' && record?.state === 'stopped' && ['idle', 'explicit', 'retired'].includes(record.stopped!.reason)) {
          notify('stopped', record.stopped?.reason === 'explicit' ? { kind: 'explicit-stop', requestId: record.stopped.requestId } : { kind: 'idle-exit' }); return { status: 'stopped', record };
        }
        attempts++;
        try { await connect(Math.min(timeouts.handshakeMs, Math.max(1, deadline - performance.now()))); return { status: 'recovered', instance: current!.daemon.instance, restarted: false }; }
        catch (error) { last = failure(error); if (terminal(last)) break; }
      }
      if (!terminal(last) && !closed && options.daemonEntry && options.start === 'if-needed') {
        notify('restarting', last);
        for (let attempt = 0; attempt < timeouts.restartAttempts && performance.now() < deadline; attempt++) {
          record = await readDaemonRecord(endpoint);
          if (authorization === 'automatic' && record?.state === 'stopped' && ['idle', 'explicit', 'retired'].includes(record.stopped!.reason)) {
            notify('stopped', record.stopped?.reason === 'explicit' ? { kind: 'explicit-stop', requestId: record.stopped.requestId } : { kind: 'idle-exit' }); return { status: 'stopped', record };
          }
          attempts++;
          try {
            const launched = await launchDaemon({ endpoint, daemonEntry: options.daemonEntry, version: options.client.version,
              engine: options.engine, startupMs: Math.max(1, Math.floor(Math.min(timeouts.startupMs, deadline - performance.now()))), signal });
            await connect(Math.min(timeouts.handshakeMs, Math.max(1, deadline - performance.now())));
            return { status: 'recovered', instance: current!.daemon.instance, restarted: launched.started };
          } catch (error) { last = failure(error); if (terminal(last)) break; }
        }
      }
      if (closed) return { status: 'unavailable', attempts, reason: { kind: 'closed' } };
      notify('unavailable', last); return { status: 'unavailable', attempts, reason: last };
    }
    const connection: ServiceConnection = {
      get state() { return state; }, get reason() { return reason; }, get daemon() { return current!.daemon; },
      openContext: (...args) => current!.openContext(...args), contextStatus: params => current!.contextStatus(params),
      check: (...args) => current!.check(...args), subscribe: (...args) => current!.subscribe(...args),
      unsubscribe: params => current!.unsubscribe(params), closeContext: params => current!.closeContext(params),
      daemonStatus: () => current!.daemonStatus(), stopDaemon: params => current!.stopDaemon(params),
      recover(authorization) {
        recovering ??= recovery(authorization).catch(error => {
          const reason = closed ? { kind: 'closed' as const } : failure(error); if (!closed) notify('unavailable', reason);
          return { status: 'unavailable' as const, attempts: 0, reason };
        }).finally(() => { recovering = undefined; });
        return recovering;
      },
      async close() { closed = true; lifetime.abort(); await current!.close(); notify('closed', { kind: 'closed' }); },
    };
    return { status: 'connected', connection, started };
  } catch (error) {
    const reason = options.signal?.aborted ? { kind: 'closed' as const } : failure(error);
    return { status: 'unavailable', reason, attempts, message: error instanceof Error ? error.message : String(error) };
  }
}
