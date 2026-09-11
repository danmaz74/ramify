import { describe, expect, it } from 'vitest';
import { createFrameDecoder, decodeJsonFrame, encodeJsonFrame, encodeMessage, decodeMessage } from '../codec.js';

function rawFrame(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(4 + payload.byteLength);
  new DataView(frame.buffer).setUint32(0, payload.byteLength, false);
  frame.set(payload, 4);
  return frame;
}

describe('private JSON byte framing', () => {
  it('writes a four-byte big-endian UTF-8 byte count and decodes exactly one value', () => {
    const value = { text: 'é🙂', n: 7, missing: null };
    const frame = encodeJsonFrame(value, 1024);
    expect(Array.from(frame.subarray(0, 4))).toEqual([0, 0, 0, 38]);
    expect(decodeJsonFrame(frame, 1024)).toEqual(value);
    const slab = new Uint8Array(frame.byteLength + 10);
    slab.set(frame, 3);
    expect(decodeJsonFrame(slab.subarray(3, 3 + frame.byteLength), 1024)).toEqual(value);
  });

  it.each([1024 * 1024, 32 * 1024 * 1024 + 64 * 1024])('honors the inclusive %i-byte payload bound', maximum => {
    const value = 'x'.repeat(maximum - 2); // JSON string quotes occupy two bytes.
    const frame = encodeJsonFrame(value, maximum);
    expect(frame.byteLength).toBe(maximum + 4);
    expect(decodeJsonFrame(frame, maximum)).toBe(value);
    expect(() => encodeJsonFrame(value + 'x', maximum)).toThrow('exceeds');
    expect(() => decodeJsonFrame(frame, maximum - 1)).toThrow('exceeds');
  });

  it('rejects invalid bounds, non-JSON values, truncation and extra frames', () => {
    for (const maximum of [0, -1, 1.5, NaN, Infinity, 0x1_0000_0000]) {
      expect(() => encodeJsonFrame(null, maximum)).toThrow('limit');
      expect(() => createFrameDecoder(maximum, () => {})).toThrow('limit');
      expect(() => decodeJsonFrame(new Uint8Array(), maximum)).toThrow('limit');
    }
    expect(() => encodeJsonFrame(undefined, 32)).toThrow('not JSON');
    expect(() => encodeJsonFrame(1n, 32)).toThrow();
    const circular: { self?: unknown } = {}; circular.self = circular;
    expect(() => encodeJsonFrame(circular, 32)).toThrow();
    expect(() => decodeJsonFrame(new Uint8Array(3), 32)).toThrow('header');
    expect(() => decodeJsonFrame(new Uint8Array(4), 32)).toThrow('Zero-length');
    const frame = encodeJsonFrame({ a: 1 }, 32);
    expect(() => decodeJsonFrame(frame.subarray(0, frame.byteLength - 1), 32)).toThrow('length');
    expect(() => decodeJsonFrame(Buffer.concat([frame, frame]), 32)).toThrow('length');
  });

  it('rejects invalid UTF-8, invalid JSON and an encoded BOM', () => {
    const bad = [new Uint8Array([0xff]), Buffer.from([0x22, 0xc3, 0x22]), Buffer.from('{'),
      Buffer.from('{} {}'), Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])];
    for (const payload of bad) expect(() => decodeJsonFrame(rawFrame(payload), 1024)).toThrow();
  });

  it('delivers coalesced frames and every possible split through headers and multibyte text', () => {
    const value = { text: 'é🙂' }, frame = encodeJsonFrame(value, 1024);
    for (let split = 0; split <= frame.byteLength; split++) {
      const received: unknown[] = [];
      const decoder = createFrameDecoder(1024, message => received.push(message));
      decoder.push(frame.subarray(0, split));
      if (split < frame.byteLength) expect(received).toHaveLength(0);
      decoder.push(frame.subarray(split));
      decoder.push(Buffer.concat([frame, encodeJsonFrame(null, 1024)]));
      decoder.finish();
      expect(received).toEqual([value, value, null]);
    }
  });

  it('copies partial chunks and handles one-byte fragments without retaining caller memory', () => {
    const value = { text: 'partial' }, frame = encodeJsonFrame(value, 1024), received: unknown[] = [];
    const decoder = createFrameDecoder(1024, message => received.push(message));
    for (const byte of frame) {
      const chunk = new Uint8Array([byte]);
      decoder.push(chunk);
      chunk.fill(0xff);
    }
    decoder.finish();
    expect(received).toEqual([value]);
  });

  it('rejects zero and oversized lengths immediately on the fourth header byte', () => {
    for (const length of [0, 33, 0xffff_ffff]) {
      const header = new Uint8Array(4);
      new DataView(header.buffer).setUint32(0, length, false);
      const decoder = createFrameDecoder(32, () => { throw new Error('Must not deliver'); });
      decoder.push(header.subarray(0, 3));
      expect(() => decoder.push(header.subarray(3))).toThrow(length ? 'exceeds' : 'Zero-length');
      expect(() => decoder.push(encodeJsonFrame(null, 32))).toThrow('closed');
    }
  });

  it('fails closed on payload errors and never delivers subsequent data', () => {
    const received: unknown[] = [], decoder = createFrameDecoder(32, message => received.push(message));
    const good = encodeJsonFrame(null, 32);
    expect(() => decoder.push(Buffer.concat([good, rawFrame(Buffer.from('{')), good]))).toThrow();
    expect(received).toEqual([null]);
    expect(() => decoder.push(good)).toThrow('closed');
    decoder.dispose(); decoder.dispose();
  });

  it('detects an incomplete header or body at EOF and releases pending state', () => {
    const frame = encodeJsonFrame({ a: 1 }, 32);
    for (let length = 1; length < frame.byteLength; length++) {
      const decoder = createFrameDecoder(32, () => { throw new Error('Must not deliver'); });
      decoder.push(frame.subarray(0, length));
      expect(() => decoder.finish()).toThrow('Truncated');
      expect(() => decoder.push(frame)).toThrow('closed');
      decoder.finish();
    }
  });

  it('disposes during delivery without calling the listener again', () => {
    const received: unknown[] = [];
    const decoder = createFrameDecoder(32, message => { received.push(message); decoder.dispose(); });
    decoder.push(Buffer.concat([encodeJsonFrame(1, 32), encodeJsonFrame(2, 32)]));
    expect(received).toEqual([1]);
    expect(() => decoder.push(new Uint8Array())).toThrow('closed');
  });

  it('preserves listener errors and rejects reentrant delivery', () => {
    const failure = new Error('schema validation failed');
    const decoder = createFrameDecoder(32, () => { throw failure; });
    expect(() => decoder.push(encodeJsonFrame(null, 32))).toThrow(failure);
    expect(() => decoder.push(new Uint8Array())).toThrow('closed');
    const reentrant = createFrameDecoder(32, () => reentrant.push(encodeJsonFrame(null, 32)));
    expect(() => reentrant.push(encodeJsonFrame(null, 32))).toThrow('Reentrant');
    expect(() => reentrant.push(new Uint8Array())).toThrow('closed');
  });
});


describe('large bounded service messages', () => {
  it('round-trips a message above the former 64 MiB codec ceiling', () => {
    const message = { type: 'goodbye' as const, reason: { kind: 'failure' as const, message: 'x'.repeat(65 * 1024 ** 2) } };
    expect(() => encodeJsonFrame(message, 32 * 1024 ** 2 + 64 * 1024)).toThrow('exceeds');
    const frame = encodeMessage(message);
    expect(decodeJsonFrame(frame, 96 * 1024 ** 2 + 64 * 1024)).toEqual(message);
    expect(frame.byteLength).toBeGreaterThan(64 * 1024 ** 2);
    const decoded = decodeMessage(frame);
    expect(decoded.type).toBe('goodbye');
    if (decoded.type !== 'goodbye' || decoded.reason.kind !== 'failure') throw new Error('Wrong message');
    expect(decoded.reason.message).toBe(message.reason.message);
  });

  it('rejects a declared payload above the 128 MiB codec ceiling before allocation', () => {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(128 * 1024 ** 2 + 1);
    expect(() => decodeMessage(header)).toThrow('exceeds 134217728 bytes');
    header.writeUInt32BE(96 * 1024 ** 2 + 64 * 1024 + 1);
    expect(() => decodeJsonFrame(header, 96 * 1024 ** 2 + 64 * 1024)).toThrow('exceeds');
  });
});
