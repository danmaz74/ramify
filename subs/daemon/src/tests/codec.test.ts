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

describe('revision capture timings', () => {
  const token = { context: `ctx/1:${'a'.repeat(64)}`, generation: 'gen/1:00000000-0000-4000-8000-000000000000' };
  const revision = { token, revision: 'rev/1:00000000-0000-4000-8000-000000000000:2', sequence: 2, publishedAt: 260, cause: 'watch',
    fingerprints: { inputId: 'input', declarations: 'd', source: 's', configuration: 'c', registry: 'r', engine: 'e' }, changed: ['src/a.ts'],
    checked: { path: 'source', files: ['src/a.ts'], accesses: 1, modelRebuilt: false }, delta: { added: 0, removed: 0, positionOnly: 0 },
    timings: { classify: 1, inventory: 1, compiler: 1, descriptions: 1, accesses: 1, link: 1, decide: 1, companions: 0, publish: 1, total: 9 },
    capture: { invocationCheck: 0.5, promotion: 3.5, workerStatus: 0.25, workerRoundTrip: 20.5, sweep: 8, watch: { receivedAt: 150, flushedAt: 250 } },
    outcome: { execution: 'completed', check: 'passed', coverage: 'complete' },
    summary: { complete: true, owners: 1, sourceFiles: 1, resources: 0, originals: 0, accesses: 1, allowed: 1, denied: 0, errors: 0, warnings: 0, coverageNotes: 0, external: 0 } };
  const event = (value: unknown) => ({ type: 'event', seq: 1, subscription: 'subscription-1', event: { type: 'revision-published', token, revision: value, coalesced: 0 } });

  it('timing-fields: accepts a published revision whose capture carries session work, promotion, sweep round trips and watcher times beside unchanged stage timings', () => {
    const message = event(revision);
    expect(decodeMessage(encodeMessage(message as never))).toEqual(message);
    expect(decodeMessage(encodeMessage(event({ ...revision, capture: { ...revision.capture, watch: null } }) as never))).toMatchObject({ type: 'event' });
  });

  it('rejects a revision without its capture or with malformed capture timings', () => {
    const { capture, ...missing } = revision;
    for (const value of [missing, { ...revision, timings: { ...revision.timings, invocationCheck: 0 } },
      { ...revision, capture: { ...capture, workerRoundTrip: -1 } }, { ...revision, capture: { ...capture, extra: 0 } },
      { ...revision, capture: { ...capture, promotion: -1 } }, { ...revision, capture: { ...capture, sweep: Number.POSITIVE_INFINITY } },
      { ...revision, capture: (({ promotion: _promotion, ...rest }) => rest)(capture) }, { ...revision, capture: (({ sweep: _sweep, ...rest }) => rest)(capture) },
      { ...revision, capture: { ...capture, watch: { receivedAt: 150 } } }, { ...revision, capture: { ...capture, watch: { receivedAt: 1.5, flushedAt: 2 } } }]) {
      expect(() => encodeMessage(event(value) as never)).toThrow('Invalid IPC message schema');
    }
  });
});

describe('BD23: service capability negotiation', () => {
  const welcome = (capabilities: readonly string[]) => ({ type: 'welcome', welcome: { protocol: 'ramify.ipc/2',
    instance: { instanceId: 'daemon-1', pid: 1, version: '0.0.0', engine: 'engine', buildKey: '0000000000000000' },
    capabilities, limits: { maxRequestBytes: 1, maxResponseBytes: 1, leaseMs: 1, pingMs: 1 } } });
  it('accepts the dependencyDiagram capability beside the existing capabilities and still rejects unknown names', () => {
    const message = welcome(['contexts', 'check', 'subscribe', 'daemon-control', 'materialize', 'explorerDetails', 'dependencyDiagram']);
    expect(decodeMessage(encodeMessage(message as never))).toEqual(message);
    expect(() => encodeMessage(welcome(['dependencyDiagrams']) as never)).toThrow('Invalid IPC message schema');
  });
  it('AV25: accepts the materialize-views capability and still rejects near names', () => {
    const message = welcome(['contexts', 'check', 'subscribe', 'daemon-control', 'materialize', 'explorerDetails', 'dependencyDiagram', 'materialize-views']);
    expect(decodeMessage(encodeMessage(message as never))).toEqual(message);
    for (const name of ['materialize-view', 'materializeViews']) expect(() => encodeMessage(welcome([name]) as never)).toThrow('Invalid IPC message schema');
  });
  it('MM09: accepts the measure capability and rejects near names', () => {
    const message = welcome(['contexts', 'check', 'measure']);
    expect(decodeMessage(encodeMessage(message as never))).toEqual(message);
    for (const name of ['measurements', 'module-measure']) expect(() => encodeMessage(welcome([name]) as never))
      .toThrow('Invalid IPC message schema');
  });
  it('A7-07:capability accepts the affected capability beside measure and rejects near names', () => {
    const message = welcome(['contexts', 'check', 'measure', 'affected']);
    expect(decodeMessage(encodeMessage(message as never))).toEqual(message);
    for (const name of ['affected-modules', 'Affected', 'affect']) expect(() => encodeMessage(welcome([name]) as never))
      .toThrow('Invalid IPC message schema');
  });
});

describe('ramify.ipc/2: the strict context-status scope carries its ownership table', () => {
  const token = { context: `ctx/1:${'b'.repeat(64)}`, generation: 'gen/1:00000000-0000-4000-8000-000000000001' };
  const ownership = {
    modules: [{ id: 'app', parent: null, directory: '.' }, { id: 'app/a', parent: 'app', directory: 'subs/a' }],
    exclusions: [{ kind: 'output', directory: 'dist', owner: null }, { kind: 'external', directory: 'external-project', owner: null },
      { kind: 'owned-nested-project', directory: 'fixture-project', owner: 'app' }, { kind: 'scratch', directory: 'src/tmp', owner: 'app' },
      { kind: 'scratch', directory: 'subs/a/src/tmp', owner: 'app/a' }],
  };
  const scope = { root: '/project', selection: 'given', invokedFrom: '/project', configuration: '/project/tsconfig.json',
    walkedAreas: ['src', 'src/tests'], ownership };
  const status = (value: unknown) => ({ token, selection: { root: '/project', scope: 'whole-project', configuration: 'discover',
    setup: { registry: 'registry', capabilities: [] } }, scope: value, state: 'warm', synchronization: 'synchronized', published: null,
  lastValid: null, pending: { requests: 0, changedPaths: 0, analysisRunning: false }, history: { retained: 0, bytes: 0, oldest: null },
  retainedBytes: 0, leases: { subscriptions: 0, requests: 0 }, watcher: 'active',
  registrations: { sequence: 1, directories: 3, pruned: ['dist', 'external-project', 'fixture-project'], prunedCount: 3 },
  openedAt: 1, lastActivityAt: 1, level: 'warm',
  session: null, demoting: false, unresponsiveSince: null });
  const event = (value: unknown) => ({ type: 'event', seq: 1, subscription: 'subscription-1',
    event: { type: 'status-changed', token, current: status(value), coalesced: 0 } });

  it('round-trips a scope with modules and owned and unowned exclusions, and a null scope', () => {
    for (const value of [scope, { ...scope, ownership: { modules: [], exclusions: [] } }, null]) {
      expect(decodeMessage(encodeMessage(event(value) as never))).toEqual(event(value));
    }
  });

  it('rejects a scope without its ownership table or with a malformed one', () => {
    const { ownership: _ownership, ...missing } = scope;
    const exclusion = (value: unknown) => ({ ...scope, ownership: { ...ownership, exclusions: [value] } });
    for (const value of [missing, { ...scope, ownership: null }, { ...scope, ownership: { modules: [] } },
      { ...scope, ownership: { ...ownership, extra: [] } },
      { ...scope, ownership: { ...ownership, modules: [{ id: 'app', directory: '.' }] } },
      { ...scope, ownership: { ...ownership, modules: [{ id: 'app', parent: 1, directory: '.' }] } },
      exclusion({ kind: 'scratch', directory: 'src/tmp', owner: null }), exclusion({ kind: 'owned-unwired', directory: 'x', owner: null }),
      exclusion({ kind: 'external', directory: 'x', owner: 'app' }), exclusion({ kind: 'packages', directory: 'node_modules', owner: 'app' }),
      exclusion({ kind: 'ignored', directory: 'x', owner: null }), exclusion({ kind: 'output', directory: 1, owner: null }),
      exclusion({ kind: 'output', directory: 'dist' })]) {
      expect(() => encodeMessage(event(value) as never)).toThrow('Invalid IPC message schema');
    }
  });

  it('accepts only the version 2 protocol in a welcome', () => {
    const welcome = (protocol: string) => ({ type: 'welcome', welcome: { protocol,
      instance: { instanceId: 'daemon-1', pid: 1, version: '0.0.0', engine: 'engine', buildKey: '0000000000000000' },
      capabilities: ['contexts'], limits: { maxRequestBytes: 1, maxResponseBytes: 1, leaseMs: 1, pingMs: 1 } } });
    expect(decodeMessage(encodeMessage(welcome('ramify.ipc/2') as never))).toEqual(welcome('ramify.ipc/2'));
    for (const protocol of ['ramify.ipc/1', 'ramify.ipc/0', 'ramify.ipc/3']) {
      expect(() => encodeMessage(welcome(protocol) as never)).toThrow('Invalid IPC message schema');
    }
  });
});
