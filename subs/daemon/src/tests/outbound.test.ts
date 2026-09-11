import { describe, expect, it } from 'vitest';
import { createFrameDecoder, encodeJsonFrame } from '../codec.js';
import { createOutboundWriter } from '../outbound.js';
import { eventually, socketFixture } from './socket-fixture.js';

// Transport labels, not a partial WireMessage or substitute ContextEvent.
interface Message {
  readonly value: string;
  readonly event?: { readonly type: 'revision-published' | 'status-changed' | 'context-evicted';
    readonly context: string; readonly subscription: string; readonly coalesced: number };
}
function revision(value: string, overrides: Partial<NonNullable<Message['event']>> = {}): Message {
  return { value, event: { type: 'revision-published', context: 'context-a', subscription: 'sub-a', coalesced: 0, ...overrides } };
}
async function setup(limits: { maxBytes?: number; maxFrames?: number; maxFrameBytes?: number } = {}) {
  const pair = await socketFixture();
  const received: Array<{ value: string; sequence: number | null; coalesced: number }> = [];
  const reasons: string[] = [], errors: unknown[] = [];
  const decoder = createFrameDecoder(2 * 1024 * 1024, value => received.push(value as typeof received[number]));
  pair.client.on('data', bytes => { try { decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes); } catch (error) { errors.push(error); } });
  const writer = createOutboundWriter<Message>({ socket: pair.host,
    maxBytes: limits.maxBytes ?? 4 * 1024 * 1024, maxFrames: limits.maxFrames ?? 64,
    maxFrameBytes: limits.maxFrameBytes ?? 2 * 1024 * 1024,
    event: message => message.event ?? null,
    encode: (message, encoding) => encodeJsonFrame({ value: message.value, ...encoding }, 2 * 1024 * 1024),
    onClose: reason => reasons.push(reason) });
  return { ...pair, received, reasons, errors, writer,
    async dispose() { writer.dispose(); pair.client.removeAllListeners('data'); decoder.dispose(); await pair.dispose(); } };
}

describe('private outbound socket writer', () => {
  it('moves a coalesced event to the newest position and retains eviction and control frames', async () => {
    const f = await setup();
    try {
      f.writer.send(revision('revision-1'));
      f.writer.send(revision('status', { type: 'status-changed' }));
      for (let i = 2; i <= 10; i++) f.writer.send(revision(`revision-${i}`));
      f.writer.send(revision('evicted', { type: 'context-evicted' }));
      f.writer.send({ value: 'response' });
      f.writer.send({ value: 'goodbye' });
      expect(f.writer.status).toMatchObject({ frames: 5, queued: 5, coalescedEvents: 9 });
      await eventually(() => f.received.length === 5 && f.writer.status.frames === 0);
      expect(f.received).toEqual([
        { value: 'status', sequence: 2, coalesced: 0 },
        { value: 'revision-10', sequence: 11, coalesced: 9 },
        { value: 'evicted', sequence: 12, coalesced: 0 },
        { value: 'response', sequence: null, coalesced: 0 },
        { value: 'goodbye', sequence: null, coalesced: 0 },
      ]);
      expect(f.errors).toEqual([]);
      expect(f.writer.status.bytes).toBe(0);
    } finally { await f.dispose(); }
  });

  it('keeps contexts, subscriptions and event types independent, including separator-like labels', async () => {
    const f = await setup();
    try {
      f.writer.send(revision('a', { context: 'a:b', subscription: 'c' }));
      f.writer.send(revision('b', { context: 'a', subscription: 'b:c' }));
      f.writer.send(revision('c', { type: 'status-changed' }));
      f.writer.send(revision('d'));
      f.writer.send(revision('e', { subscription: 'sub-b' }));
      f.writer.send(revision('f', { type: 'context-evicted' }));
      f.writer.send(revision('g', { type: 'context-evicted' }));
      await eventually(() => f.received.length === 7);
      expect(f.received.map(message => message.value)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
      expect(f.received.map(message => message.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(f.writer.status.coalescedEvents).toBe(0);
    } finally { await f.dispose(); }
  });

  it('adds the replaced event count to incoming coalescing and accounts for replacement bytes', async () => {
    const f = await setup({ maxFrames: 1, maxBytes: 200 });
    try {
      f.writer.send(revision('long-value', { coalesced: 2 }));
      f.writer.send(revision('new', { coalesced: 3 }));
      expect(f.writer.status).toMatchObject({ frames: 1, queued: 1, coalescedEvents: 1,
        bytes: encodeJsonFrame({ value: 'new', sequence: 2, coalesced: 6 }, 200).byteLength });
      await eventually(() => f.received.length === 1);
      expect(f.received[0]).toEqual({ value: 'new', sequence: 2, coalesced: 6 });
      expect(f.reasons).toEqual([]);
    } finally { await f.dispose(); }
  });

  it('rejects an oversized candidate without replacing the queued frame or consuming its sequence', async () => {
    const f = await setup({ maxFrameBytes: 100 });
    try {
      f.writer.send(revision('first'));
      expect(f.writer.send(revision('x'.repeat(100)))).toBe('oversized');
      f.writer.send(revision('second', { context: 'context-b' }));
      await eventually(() => f.received.length === 2);
      expect(f.received.map(message => [message.value, message.sequence])).toEqual([['first', 1], ['second', 2]]);
      expect(f.reasons).toEqual([]);
    } finally { await f.dispose(); }
  });

  it.each(['bytes', 'frames'] as const)('accepts the exact %s bound and disconnects on the next frame', async bound => {
    const size = encodeJsonFrame({ value: 'a', sequence: null, coalesced: 0 }, 100).byteLength;
    const f = await setup(bound === 'bytes' ? { maxBytes: size * 2 } : { maxFrames: 2 });
    try {
      expect(f.writer.send({ value: 'a' })).toBe('accepted');
      expect(f.writer.send({ value: 'a' })).toBe('accepted');
      expect(f.writer.status).toMatchObject({ frames: 2, bytes: size * 2 });
      expect(f.writer.send({ value: 'a' })).toBe('closed');
      expect(f.writer.status).toMatchObject({ frames: 0, bytes: 0, queued: 0, closed: true });
      await eventually(() => f.host.closed && f.received.length === 1);
      expect(f.received).toEqual([{ type: 'goodbye', reason: { kind: 'slow-consumer' } }]);
      f.writer.dispose();
      expect(f.reasons).toEqual(['slow-consumer']);
      expect(f.writer.send({ value: 'late' })).toBe('closed');
    } finally { await f.dispose(); }
  });

  it('counts socket-owned bytes during real backpressure and coalesces only unsent frames', async () => {
    const f = await setup();
    try {
      f.client.pause();
      f.writer.send(revision('x'.repeat(1024 * 1024)));
      await eventually(() => f.host.writableNeedDrain);
      expect(f.writer.status).toMatchObject({ frames: 1, queued: 0 });
      expect(f.writer.status.bytes).toBeGreaterThan(1024 * 1024);
      for (let i = 1; i <= 10; i++) f.writer.send(revision(`next-${i}`));
      expect(f.writer.status).toMatchObject({ frames: 2, queued: 1, coalescedEvents: 9 });
      f.client.resume();
      await eventually(() => f.received.length === 2 && f.writer.status.frames === 0);
      expect(f.received[0].value.length).toBe(1024 * 1024);
      expect(f.received[0].coalesced).toBe(0);
      expect(f.received[1]).toEqual({ value: 'next-10', sequence: 11, coalesced: 9 });
      expect(f.errors).toEqual([]);
    } finally { await f.dispose(); }
  });

  it('destroys a non-reading peer within the deadline and reports release exactly once', async () => {
    const f = await setup({ maxBytes: 1200 * 1024 });
    try {
      f.client.pause();
      f.writer.send({ value: 'x'.repeat(1024 * 1024) });
      await eventually(() => f.host.writableNeedDrain);
      const start = performance.now();
      expect(f.writer.send({ value: 'x'.repeat(1024 * 1024) })).toBe('closed');
      expect(f.reasons).toEqual(['slow-consumer']);
      await eventually(() => f.host.closed, 2000);
      expect(performance.now() - start).toBeLessThan(2000);
      expect(f.writer.status).toMatchObject({ frames: 0, bytes: 0, closed: true });
      expect(f.reasons).toEqual(['slow-consumer']);
    } finally { await f.dispose(); }
  });

  it('releases queued data and its listeners on peer loss or repeated disposal', async () => {
    const f = await setup();
    try {
      f.writer.send({ value: 'pending' });
      f.client.destroy();
      await eventually(() => f.writer.status.closed);
      f.writer.dispose(); f.writer.dispose();
      expect(f.reasons).toHaveLength(1);
      expect(f.writer.status).toMatchObject({ bytes: 0, frames: 0, queued: 0 });
      await f.hostClosed;
      expect(f.host.listenerCount('drain')).toBe(0);
      expect(f.host.listenerCount('close')).toBe(0);
      // The fixture's one protective error listener remains owned by the fixture.
      expect(f.host.listenerCount('error')).toBe(1);
    } finally { await f.dispose(); }
  });

  it('copies accepted bytes and leaves queued data intact if encoding fails', async () => {
    const f = await socketFixture();
    const frame = encodeJsonFrame({ original: true }, 100), data: unknown[] = [];
    const decoder = createFrameDecoder(100, value => data.push(value));
    f.client.on('data', bytes => decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes));
    const writer = createOutboundWriter<boolean>({ socket: f.host, maxFrameBytes: 100, maxBytes: 100, maxFrames: 2,
      event: () => null, encode: fail => { if (fail) throw new Error('encoding'); return frame; }, onClose: () => {} });
    try {
      writer.send(false); frame.fill(0);
      expect(() => writer.send(true)).toThrow('encoding');
      await eventually(() => data.length === 1);
      expect(data).toEqual([{ original: true }]);
      expect(writer.status.closed).toBe(false);
    } finally { writer.dispose(); f.client.removeAllListeners('data'); decoder.dispose(); await f.dispose(); }
  });

  it('rejects invalid limits before attaching socket listeners', async () => {
    const f = await socketFixture();
    try {
      for (const value of [0, -1, 1.5, NaN, Infinity]) {
        expect(() => createOutboundWriter({ socket: f.host, maxBytes: value, maxFrames: 1, maxFrameBytes: 1,
          event: () => null, encode: () => new Uint8Array(), onClose: () => {} })).toThrow('limit');
      }
      expect(f.host.listenerCount('drain')).toBe(0);
    } finally { await f.dispose(); }
  });

  it.each(['classify', 'encode'] as const)('does not admit a frame after its %s callback disposes the writer', async stage => {
    const f = await socketFixture(), reasons: string[] = [];
    let encoded = 0;
    let writer: ReturnType<typeof createOutboundWriter<boolean>>;
    writer = createOutboundWriter<boolean>({ socket: f.host, maxBytes: 1024, maxFrameBytes: 1024, maxFrames: 8,
      event: () => { if (stage === 'classify') writer.dispose(); return null; },
      encode: () => { encoded++; if (stage === 'encode') writer.dispose(); return encodeJsonFrame({ value: 'late' }, 1024); },
      onClose: reason => reasons.push(reason) });
    try {
      expect(writer.send(false)).toBe('closed');
      expect(encoded).toBe(stage === 'classify' ? 0 : 1);
      expect(writer.status).toMatchObject({ bytes: 0, frames: 0, queued: 0, closed: true });
      expect(reasons).toEqual(['closed']);
      expect(writer.send(false)).toBe('closed');
      await f.hostClosed;
      expect(f.host.listenerCount('drain')).toBe(0);
      expect(f.host.listenerCount('close')).toBe(0);
    } finally { writer.dispose(); await f.dispose(); }
  });

  it('starts closed without attaching listeners when the socket already emitted close', async () => {
    const f = await socketFixture(), reasons: string[] = [];
    f.host.destroy();
    await f.hostClosed;
    const errorListeners = f.host.listenerCount('error');
    const writer = createOutboundWriter({ socket: f.host, maxBytes: 10, maxFrameBytes: 10, maxFrames: 1,
      event: () => { throw new Error('Must not classify'); },
      encode: () => { throw new Error('Must not encode'); }, onClose: reason => reasons.push(reason) });
    try {
      expect(writer.status).toMatchObject({ closed: true, bytes: 0, frames: 0 });
      expect(reasons).toEqual(['closed']);
      expect(writer.send(null)).toBe('closed');
      writer.dispose(); writer.dispose();
      expect(reasons).toEqual(['closed']);
      expect(f.host.listenerCount('drain')).toBe(0);
      expect(f.host.listenerCount('close')).toBe(0);
      expect(f.host.listenerCount('error')).toBe(errorListeners);
    } finally { writer.dispose(); await f.dispose(); }
  });
});
