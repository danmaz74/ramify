import { createConnection } from 'node:net';
import type { RamifyService, ServiceResult } from '../../../src/interfaces/service.js';
import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { ContextEvent } from '../subs/contexts/src/interfaces/contexts.js';
import type { ConnectOptions, DisconnectReason, EndpointSelection, Welcome, WireMessage } from './interfaces/daemon.js';
import { createFrameDecoder, encodeMessage, validateWireMessage } from './codec.js';

export class ConnectionFailure extends Error {
  constructor(readonly reason: DisconnectReason) { super('message' in reason ? reason.message : reason.kind); }
}
export interface SocketConnection extends RamifyService {
  readonly daemon: Welcome;
  readonly reason: DisconnectReason | null;
  readonly connected: boolean;
  close(): Promise<void>;
}

export async function openSocketConnection(endpoint: EndpointSelection, options: ConnectOptions, handshakeMs: number,
  lost: (reason: DisconnectReason) => void): Promise<SocketConnection> {
  options.signal?.throwIfAborted();
  const socket = createConnection(endpoint.socket);
  let welcome: Welcome | undefined, disconnect: DisconnectReason | null = null;
  let closing = false, settled = false, serial = 0, sequence = 0;
  let ping: ReturnType<typeof setInterval> | undefined;
  let accept!: () => void, reject!: (error: unknown) => void;
  let resolveClosed!: () => void;
  const closed = new Promise<void>(resolve => { resolveClosed = resolve; });
  const ready = new Promise<void>((resolve, decline) => { accept = resolve; reject = decline; });
  const pending = new Map<string, { finish: (result: ServiceResult<unknown>) => void; cleanup: () => void;
    listen?: (event: ContextEvent) => void }>();
  const subscriptions = new Map<string, (event: ContextEvent) => void>();
  function fail(reason: DisconnectReason): void {
    if (disconnect) return;
    disconnect = reason;
    clearInterval(ping); clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
    if (!settled) { settled = true; reject(new ConnectionFailure(reason)); }
    for (const request of pending.values()) {
      request.cleanup(); request.finish({ ok: false, error: {
        code: reason.kind === 'explicit-stop' || reason.kind === 'idle-exit' ? 'stopping' : reason.kind === 'closed' ? 'cancelled' : 'internal-error',
        message: 'message' in reason ? reason.message : `Daemon disconnected: ${reason.kind}`, details: { reason: reason.kind },
      } });
    }
    pending.clear(); subscriptions.clear();
    if (welcome && !closing) lost(reason);
  }
  function send(message: WireMessage): void {
    const frame = encodeMessage(message);
    if (welcome && frame.byteLength - 4 > welcome.limits.maxRequestBytes) throw new Error('Request exceeds maxRequestBytes');
    socket.write(frame);
  }
  function receive(value: unknown): void {
    const message = validateWireMessage(value);
    if (!welcome) {
      if (message.type === 'reject') {
        fail(message.error.code === 'incompatible' ? { kind: 'incompatible', daemon: message.daemon.version, client: options.client.version }
          : { kind: 'rejected', code: message.error.code, message: message.error.message }); socket.destroy(); return;
      }
      if (message.type === 'goodbye') { fail(message.reason); socket.end(); return; }
      if (message.type !== 'welcome') throw new Error('Expected daemon welcome');
      if (message.welcome.instance.buildKey !== endpoint.buildKey || message.welcome.instance.engine !== options.engine) {
        fail({ kind: 'incompatible', daemon: message.welcome.instance.version, client: options.client.version }); socket.destroy(); return;
      }
      welcome = message.welcome; decoder.setMaximumBytes(welcome.limits.maxResponseBytes); clearTimeout(timeout); options.signal?.removeEventListener('abort', abort);
      settled = true; ping = setInterval(() => { if (!disconnect) send({ type: 'ping' }); }, welcome.limits.pingMs);
      ping.unref(); accept(); return;
    }
    switch (message.type) {
      case 'pong': return;
      case 'goodbye': fail(message.reason); socket.end(); return;
      case 'response': {
        const request = pending.get(message.id);
        if (!request) throw new Error('Response names an unknown request');
        pending.delete(message.id); request.cleanup();
        if (request.listen && message.result.ok) {
          const value = message.result.value as { subscription?: unknown };
          if (!value || typeof value.subscription !== 'string') throw new Error('Invalid subscription result');
          subscriptions.set(value.subscription, request.listen);
        }
        request.finish(message.result); return;
      }
      case 'event':
        if (message.seq <= sequence) throw new Error('Out-of-order daemon event');
        sequence = message.seq;
        subscriptions.get(message.subscription)?.(message.event); return;
      default: throw new Error(`Unexpected daemon frame: ${message.type}`);
    }
  }
  const decoder = createFrameDecoder(64 * 1024, receive);
  const abort = () => { fail({ kind: 'closed' }); socket.destroy(); };
  const timeout = setTimeout(() => { fail({ kind: 'failure', message: 'Daemon handshake timed out' }); socket.destroy(); }, handshakeMs);
  socket.on('connect', () => send({ type: 'hello', handshake: { protocol: 'ramify.ipc/1', client: options.client,
    buildKey: endpoint.buildKey, engine: options.engine } }));
  socket.on('data', bytes => { try { decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes); } catch (error) {
    const reason: DisconnectReason = { kind: 'failure', message: (error as Error).message };
    fail(reason); if (socket.writable) socket.end(encodeMessage({ type: 'goodbye', reason })); else socket.destroy();
  } });
  socket.on('end', () => { try { decoder.finish(); } catch (error) { fail({ kind: 'failure', message: (error as Error).message }); } socket.end(); });
  socket.on('error', error => fail({ kind: 'failure', message: error.message }));
  socket.once('close', () => { fail(closing ? { kind: 'closed' } : { kind: 'failure', message: 'Daemon socket closed unexpectedly' }); decoder.dispose(); resolveClosed(); });
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  await ready;
  function request<T>(op: Extract<WireMessage, { type: 'request' }>['op'], params: unknown, control?: RunControl,
    listen?: (event: ContextEvent) => void): Promise<ServiceResult<T>> {
    if (disconnect) return Promise.resolve({ ok: false, error: {
      code: disconnect.kind === 'explicit-stop' || disconnect.kind === 'idle-exit' ? 'stopping' : disconnect.kind === 'closed' ? 'cancelled' : 'internal-error',
      message: 'message' in disconnect ? disconnect.message : `Connection is ${disconnect.kind}`, details: { reason: disconnect.kind },
    } });
    const id = String(++serial);
    return new Promise(resolve => {
      const abortRequest = () => { if (pending.has(id)) send({ type: 'cancel', id }); };
      pending.set(id, { finish: result => resolve(result as ServiceResult<T>),
        cleanup: () => control?.signal?.removeEventListener('abort', abortRequest), listen });
      try {
        send({ type: 'request', id, op, params });
        control?.signal?.addEventListener('abort', abortRequest, { once: true });
        if (control?.signal?.aborted) abortRequest();
      } catch (error) {
        pending.delete(id); resolve({ ok: false, error: { code: 'resource-unavailable', message: (error as Error).message, details: {} } });
      }
    });
  }
  return {
    get daemon() { return welcome!; }, get reason() { return disconnect; }, get connected() { return disconnect === null; },
    openContext: (params, control) => request('openContext', params, control),
    contextStatus: params => request('contextStatus', params),
    check: (params, control) => request('check', params, control),
    subscribe: (params, listener) => request('subscribe', params, undefined, listener),
    unsubscribe: async params => { const result = await request<null>('unsubscribe', params); if (result.ok) subscriptions.delete(params.subscription); return result; },
    closeContext: params => request('closeContext', params), daemonStatus: () => request('daemonStatus', {}),
    stopDaemon: params => request('stopDaemon', params),
    async close() {
      if (!closing && !socket.destroyed) { closing = true; send({ type: 'goodbye', reason: { kind: 'closed' } }); }
      const force = setTimeout(() => socket.destroy(), welcome!.limits.leaseMs);
      await closed; clearTimeout(force);
    },
  };
}
