import { createServer, type Socket } from 'node:net';
import type { ServiceResult } from '../../../src/interfaces/service.js';
import type { ContextEvent } from '../subs/contexts/src/interfaces/contexts.js';
import type { DisconnectReason, ServiceLease, StartDaemonOptions, WireMessage } from './interfaces/daemon.js';
import { createFrameDecoder, encodeMessage, validateWireMessage } from './codec.js';
import { createOutboundWriter } from './outbound.js';
import { transportCounters } from './host-counters.js';
import { dispatchServiceRequest, withStopRequestId } from './service.js';
import { createRequestIdentities } from './request-identities.js';

const tokenKey = (params: unknown): string => { const token = (params as { token: { context: string; generation: string } }).token; return `${token.context}\0${token.generation}`; };
const failure = (code: 'invalid-request' | 'resource-unavailable' | 'internal-error' | 'stopping', message: string): ServiceResult<never> =>
  ({ ok: false, error: { code, message, details: {} } });

/** Each accepted socket owns exactly one service lease and bounded request and
 * notification queues. Service validation and domain execution remain shared. */
export function createSocketHost(options: StartDaemonOptions, activityChanged: () => void) {
  const { budgets, service, clock } = options;
  const counters = transportCounters(service);
  const peers = new Set<ReturnType<typeof peer>>();
  let stopping = false;
  let active = 0;
  function change(delta: number): void { active += delta; activityChanged(); }
  function peer(socket: Socket) {
    let lease: ServiceLease | undefined;
    let ready = false, closed = false;
    let lastFrame = clock.now();
    let cancelLeaseTimer: (() => void) | undefined;
    const pending = new Map<string, AbortController>();
    const used = createRequestIdentities();
    const subscriptions = new Map<string, string>();
    let coalesced = 0;
    const writer = createOutboundWriter<WireMessage>({ socket, maxFrameBytes: budgets.maxResponseBytes + 4,
      maxBytes: budgets.maxOutboundBytes, maxFrames: budgets.maxOutboundFrames,
      event: message => message.type === 'event' ? { context: message.event.token.context, subscription: message.subscription,
        type: message.event.type, coalesced: 'coalesced' in message.event ? message.event.coalesced : 0 } : null,
      encode: (message, encoding) => encodeMessage(message.type === 'event' ? { ...message, seq: encoding.sequence!,
        event: 'coalesced' in message.event ? { ...message.event, coalesced: encoding.coalesced } : message.event } : message),
      onClose: why => { if (why === 'slow-consumer') counters.disconnectedSlowConsumers++; release(); },
    });
    function send(message: WireMessage): void {
      let result: ReturnType<typeof writer.send>;
      try { result = writer.send(message); }
      catch { result = 'oversized'; }
      counters.coalescedEvents += writer.status.coalescedEvents - coalesced;
      coalesced = writer.status.coalescedEvents;
      if (result === 'oversized') {
        if (message.type === 'response') {
          counters.rejectedRequests++;
          if (writer.send({ type: 'response', id: message.id, result: failure('resource-unavailable', 'Response exceeds maxResponseBytes') }) !== 'accepted') socket.destroy();
        } else goodbye({ kind: 'failure', message: 'Control or event frame exceeds maxResponseBytes' });
      }
    }
    function release(): void {
      if (closed) return;
      closed = true;
      cancelLeaseTimer?.();
      decoder.dispose();
      for (const controller of pending.values()) controller.abort();
      change(-pending.size - subscriptions.size);
      pending.clear(); subscriptions.clear(); used.clear();
      lease?.release(); lease = undefined;
      peers.delete(handle);
      counters.connections = peers.size;
    }
    function goodbye(reason: DisconnectReason): void {
      if (closed) return;
      release();
      if (socket.writable && !socket.destroyed) socket.end(encodeMessage({ type: 'goodbye', reason }));
      else socket.destroy();
    }
    function checkLease(): void {
      if (closed) return;
      const needsPing = !ready || subscriptions.size > 0;
      const elapsed = clock.now() - lastFrame;
      if (needsPing && elapsed >= budgets.leaseMs) { goodbye({ kind: 'closed' }); return; }
      cancelLeaseTimer = clock.schedule(needsPing ? Math.max(1, budgets.leaseMs - elapsed) : budgets.leaseMs, checkLease);
    }
    async function dispatch(message: Extract<WireMessage, { type: 'request' }>, controller: AbortController): Promise<ServiceResult<unknown>> {
      const adapter = lease!.service;
      const params = message.params as never;
      const control = { signal: controller.signal };
      if (message.op === 'subscribe') {
        let subscription: string | undefined;
        const buffered: ContextEvent[] = [];
        const result = await dispatchServiceRequest(adapter, message.op, message.params, control, event => {
          if (closed) return;
          if (subscription) {
            send({ type: 'event', seq: 1, subscription, event });
            if (event.type === 'context-evicted' && subscriptions.delete(subscription)) change(-1);
          } else if (buffered.length < budgets.maxOutboundFrames) buffered.push(event);
          else goodbye({ kind: 'slow-consumer' });
        });
        if (result.ok) {
          subscription = (result.value as { subscription: string }).subscription;
          if (closed) { await adapter.unsubscribe({ subscription }); return result; }
          subscriptions.set(subscription, tokenKey(message.params)); change(1);
          send({ type: 'response', id: message.id, result });
          for (const event of buffered) {
            send({ type: 'event', seq: 1, subscription, event });
            if (event.type === 'context-evicted' && subscriptions.delete(subscription)) change(-1);
          }
        }
        return result;
      }
      const result = await (message.op === 'stopDaemon'
        ? withStopRequestId(message.id, () => dispatchServiceRequest(adapter, message.op, params, control))
        : dispatchServiceRequest(adapter, message.op, params, control));
      if (message.op === 'unsubscribe' && result.ok
        && subscriptions.delete((message.params as { subscription: string }).subscription)) change(-1);
      if (message.op === 'closeContext' && result.ok) {
        const token = tokenKey(message.params);
        for (const [subscription, selected] of subscriptions) if (selected === token) { subscriptions.delete(subscription); change(-1); }
      }
      return result;
    }

    function receive(value: unknown): void {
      const message = validateWireMessage(value);
      lastFrame = clock.now();
      if (!ready) {
        if (message.type !== 'hello') throw new Error('First client frame must be hello');
        const handshake = message.handshake;
        const incompatible = handshake.protocol !== 'ramify.ipc/1' || handshake.buildKey !== service.instance.buildKey || handshake.engine !== service.instance.engine;
        if (incompatible || peers.size > budgets.maxConnections || stopping) {
          counters.rejectedRequests++;
          socket.end(encodeMessage({ type: 'reject', daemon: service.instance, error: {
            code: incompatible ? 'incompatible' : 'resource-unavailable',
            message: incompatible ? `Incompatible daemon ${service.instance.version} (${service.instance.engine}) and client ${handshake.client.version} (${handshake.engine})` : 'Daemon connection limit reached',
            details: { daemon: service.instance.version, client: handshake.client.version },
          } })); release(); return;
        }
        ready = true; lease = service.lease(handshake.client.name);
        send({ type: 'welcome', welcome: { protocol: 'ramify.ipc/1', instance: service.instance,
          capabilities: ['contexts', 'check', 'subscribe', 'daemon-control'], limits: {
            maxRequestBytes: budgets.maxRequestBytes, maxResponseBytes: budgets.maxResponseBytes, leaseMs: budgets.leaseMs, pingMs: budgets.pingMs,
          } } });
        return;
      }
      switch (message.type) {
        case 'ping': send({ type: 'pong' }); return;
        case 'goodbye': goodbye({ kind: 'closed' }); return;
        case 'cancel': pending.get(message.id)?.abort(); return;
        case 'request': {
          const admission = used.admit(message.id);
          if (admission === 'duplicate') { counters.rejectedRequests++; send({ type: 'response', id: message.id, result: failure('invalid-request', 'Duplicate request id') }); return; }
          if (admission === 'exhausted') { goodbye({ kind: 'failure', message: 'Connection request identity limit reached; reconnect' }); return; }
          if (stopping || pending.size >= budgets.maxRequestsInFlight) {
            counters.rejectedRequests++;
            send({ type: 'response', id: message.id, result: failure(stopping ? 'stopping' : 'resource-unavailable', 'Daemon request capacity unavailable') }); return;
          }
          const controller = new AbortController(); pending.set(message.id, controller); change(1);
          void dispatch(message, controller).then(result => {
            if (!pending.has(message.id)) return;
            if (!(message.op === 'subscribe' && result.ok)) send({ type: 'response', id: message.id, result });
          }, error => { if (pending.has(message.id)) send({ type: 'response', id: message.id,
            result: failure('internal-error', error instanceof Error ? error.message : String(error)) }); })
            .finally(() => { if (pending.delete(message.id)) change(-1); });
          return;
        }
        default: throw new Error(`Unexpected client frame: ${message.type}`);
      }
    }
    const decoder = createFrameDecoder(budgets.maxRequestBytes, receive);
    socket.on('data', bytes => { try { decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes); } catch (error) { goodbye({ kind: 'failure', message: (error as Error).message }); } });
    socket.on('end', () => { try { decoder.finish(); } catch (error) { goodbye({ kind: 'failure', message: (error as Error).message }); } });
    socket.on('error', () => release());
    socket.once('close', () => { release(); writer.dispose(); });
    cancelLeaseTimer = clock.schedule(budgets.leaseMs, checkLease);
    const handle = { socket, shutdown(reason: DisconnectReason) {
      for (const [id, controller] of pending) { controller.abort(); send({ type: 'response', id, result: failure('stopping', reason.kind === 'explicit-stop'
        ? `daemon stopped explicitly${reason.requestId === null ? '' : ` (request ${reason.requestId})`}` : 'Daemon is stopping') }); }
      // Let the bounded writer put acknowledged responses ahead of goodbye.
      setImmediate(() => goodbye(reason));
    } };
    return handle;
  }
  const server = createServer(socket => {
    const value = peer(socket); peers.add(value); counters.connections = peers.size;
  });
  return {
    server,
    get activity() { return active; },
    async shutdown(reason: DisconnectReason): Promise<void> {
      stopping = true;
      const closed = new Promise<void>(resolve => { if (!server.listening) resolve(); else server.close(() => resolve()); });
      const closingPeers = [...peers];
      for (const value of closingPeers) value.shutdown(reason);
      // Releasing a lease removes its peer before a suspended process can
      // acknowledge FIN. Retain the actual sockets through the grace period.
      const force = setTimeout(() => { for (const value of closingPeers) value.socket.destroy(); }, budgets.shutdownGraceMs);
      await closed; clearTimeout(force);
    },
  };
}
