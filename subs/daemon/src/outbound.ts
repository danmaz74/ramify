import type { Socket } from 'node:net';
import { channel } from 'node:diagnostics_channel';
const observation = channel('ramify.daemon.outbound');
let connectionSerial = 0;
import { encodeJsonFrame } from './codec.js';

// Transport metadata only. The host must validate WireMessage and derive these
// labels from it; this private writer neither validates nor dispatches services.
interface EventLabel {
  readonly context: string;
  readonly subscription: string;
  readonly type: 'revision-published' | 'status-changed' | 'context-evicted';
  readonly coalesced: number;
}
interface Encoding {
  readonly sequence: number | null;
  readonly coalesced: number;
}
interface PendingFrame {
  readonly bytes: Uint8Array;
  readonly key: string | null;
  readonly coalesced: number;
}
type CloseReason = 'closed' | 'failure' | 'slow-consumer';
interface OutboundOptions<T> {
  readonly socket: Socket;
  readonly maxFrameBytes: number;
  readonly maxBytes: number;
  readonly maxFrames: number;
  readonly event: (value: T) => EventLabel | null;
  readonly encode: (value: T, encoding: Encoding) => Uint8Array;
  readonly onClose: (reason: CloseReason) => void;
}

/** One connection's encoded outbound frames, including writes still owned by
 * Node. Only frames not yet handed to the socket can be replaced. */
export function createOutboundWriter<T>(options: OutboundOptions<T>) {
  for (const value of [options.maxFrameBytes, options.maxBytes, options.maxFrames]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid outbound limit');
  }
  const { socket, maxFrameBytes, maxBytes, maxFrames } = options;
  const connectionId = String(++connectionSerial);
  let finalReason: CloseReason = 'closed';
  let classify: OutboundOptions<T>['event'] | null = options.event;
  let encode: OutboundOptions<T>['encode'] | null = options.encode;
  let onClose: OutboundOptions<T>['onClose'] | null = options.onClose;
  let queue: PendingFrame[] = [];
  const writing = new Set<PendingFrame>();
  let bytes = 0, frames = 0, sequence = 0, coalescedEvents = 0;
  let blocked = false, closed = false;
  let scheduled: NodeJS.Immediate | undefined;
  let deadline: NodeJS.Timeout | undefined;

  function terminate(reason: CloseReason): void {
    if (closed) return;
    closed = true; finalReason = reason;
    clearImmediate(scheduled);
    scheduled = undefined;
    queue = [];
    writing.clear();
    bytes = 0; frames = 0;
    classify = null; encode = null;
    const notify = onClose;
    onClose = null;
    socket.off('drain', drain);
    try {
      if (reason === 'slow-consumer' && socket.writable && !socket.destroyed) {
        // One best-effort control frame bypasses the exhausted data queue.
        deadline = setTimeout(() => socket.destroy(), 1000);
        socket.end(encodeJsonFrame({ type: 'goodbye', reason: { kind: 'slow-consumer' } }, 1024),
          () => socket.destroy());
      } else socket.destroy();
    } catch { socket.destroy(); }
    finally { notify?.(reason); }
  }

  function flush(): void {
    scheduled = undefined;
    while (!closed && !blocked && queue.length) {
      const frame = queue.shift()!;
      writing.add(frame);
      try {
        blocked = !socket.write(frame.bytes, error => {
          if (writing.delete(frame)) { bytes -= frame.bytes.byteLength; frames--; }
          if (error) terminate('failure');
        });
      } catch { terminate('failure'); }
    }
  }
  function schedule(): void {
    if (!closed && !blocked && !scheduled) scheduled = setImmediate(flush);
  }
  function drain(): void { blocked = false; schedule(); }
  function error(): void { terminate('failure'); }
  function close(): void {
    if (observation.hasSubscribers) observation.publish({ event: 'closed', connectionId, reason: finalReason, at: performance.now(), bytes, frames });
    clearTimeout(deadline);
    socket.off('error', error);
    socket.off('close', close);
    terminate('closed');
  }
  if (socket.closed) terminate('closed');
  else {
    socket.on('drain', drain);
    socket.on('error', error);
    socket.once('close', close);
  }

  return {
    send(value: T): 'accepted' | 'oversized' | 'closed' {
      if (closed) return 'closed';
      if (socket.destroyed || !socket.writable) { terminate('closed'); return 'closed'; }
      const event = classify!(value);
      // The owning host can dispose while a callback is producing this frame.
      if (closed) return 'closed';
      if (event && (!Number.isSafeInteger(event.coalesced) || event.coalesced < 0)) {
        throw new Error('Invalid coalesced event count');
      }
      const key = event && event.type !== 'context-evicted'
        ? JSON.stringify([event.subscription, event.context, event.type]) : null;
      const index = key === null ? -1 : queue.findIndex(frame => frame.key === key);
      const previous = index < 0 ? undefined : queue[index];
      const coalesced = (event?.coalesced ?? 0) + (previous ? previous.coalesced + 1 : 0);
      const nextSequence = event ? sequence + 1 : null;
      if (!Number.isSafeInteger(coalesced) || (nextSequence !== null && !Number.isSafeInteger(nextSequence))) {
        throw new Error('Outbound event counter exhausted');
      }
      const encoded = encode!(value, { sequence: nextSequence, coalesced });
      if (closed) return 'closed';
      if (encoded.byteLength > maxFrameBytes) return 'oversized';
      const nextBytes = bytes - (previous?.bytes.byteLength ?? 0) + encoded.byteLength;
      const nextFrames = frames + (previous ? 0 : 1);
      if (nextBytes > maxBytes || nextFrames > maxFrames) {
        if (observation.hasSubscribers) observation.publish({ event: 'overflow', connectionId, reason: 'slow-consumer', at: performance.now(), bytes, frames, attemptedBytes: nextBytes });
        terminate('slow-consumer');
        return 'closed';
      }
      // Copy only after admission: callers cannot mutate an accepted frame.
      const frame = { bytes: Uint8Array.from(encoded), key, coalesced };
      if (previous) { queue.splice(index, 1); coalescedEvents++; }
      queue.push(frame);
      bytes = nextBytes; frames = nextFrames;
      if (observation.hasSubscribers) observation.publish({ event: 'admitted', connectionId, at: performance.now(), bytes, frames });
      if (nextSequence !== null) sequence = nextSequence;
      schedule();
      return 'accepted';
    },
    get status() { return Object.freeze({ bytes, frames, queued: queue.length, coalescedEvents, closed }); },
    dispose(): void { terminate('closed'); },
  };
}
