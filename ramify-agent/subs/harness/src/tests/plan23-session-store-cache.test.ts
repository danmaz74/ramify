import { mkdtemp, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { statSync, type BigIntStats } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSessionStore, type LedgerSessionStore } from '../run/session-store.js';
import type { SessionStoreRecord } from '../../subs/agent/src/interfaces/session-operations.js';
import type { openLedger as PublicOpenLedger } from '../../subs/ledger/src/ledger.js';

const observed = vi.hoisted(() => ({ opens: 0, replays: 0, journalReads: [] as string[], bodyReads: [] as string[], payloadReads: [] as string[], metadataChecks: [] as string[], failAppend: null as 'before' | 'after' | null, failBodyWrite: false, frozenLog: null as { path: string; metadata: BigIntStats } | null, duringAppend: null as (() => Promise<void>) | null, afterOpen: null as (() => Promise<void>) | null }));
vi.mock('node:fs/promises', async original => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, readFile: (...args: Parameters<typeof fs.readFile>) => {
    const path = String(args[0]);
    if (/\/payloads\/[a-f0-9]{64}$/.test(path)) observed.payloadReads.push(path);
    return fs.readFile(...args);
  }, stat: (...args: Parameters<typeof fs.stat>) => {
    const path = String(args[0]);
    if (/\/payloads\/[a-f0-9]{64}$/.test(path)) observed.metadataChecks.push(path);
    return fs.stat(...args);
  } };
});
vi.mock('node:fs', async original => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, readFileSync: (...args: Parameters<typeof fs.readFileSync>) => {
    const path = String(args[0]);
    if (path.endsWith('/session-ledger.jsonl')) observed.journalReads.push(path);
    if (/\/record-bodies\/[a-f0-9]{64}\.json$/.test(path)) observed.bodyReads.push(path);
    return fs.readFileSync(...args);
  }, statSync: (...args: Parameters<typeof fs.statSync>) => {
    const path = String(args[0]);
    if (/\/payloads\/[a-f0-9]{64}$/.test(path)) observed.metadataChecks.push(path);
    if (observed.frozenLog?.path === path) return observed.frozenLog.metadata;
    return fs.statSync(...args);
  } };
});
vi.mock('../../subs/ledger/src/atomic.js', async original => {
  const module = await original<typeof import('../../subs/ledger/src/atomic.js')>();
  return { ...module, async writeFileExclusive(...args: Parameters<typeof module.writeFileExclusive>) {
    if (String(args[0]).includes('/record-bodies/') && observed.failBodyWrite) { observed.failBodyWrite = false; throw new Error('injected immutable body write failure'); }
    return module.writeFileExclusive(...args);
  } };
});
vi.mock('../../subs/ledger/src/ledger.js', async original => {
  const module = await original<{ openLedger: typeof PublicOpenLedger }>();
  return { openLedger: async (...args: Parameters<typeof module.openLedger>) => {
    observed.opens++;
    const ledger = await module.openLedger(...args);
    const afterOpen = observed.afterOpen; observed.afterOpen = null; if (afterOpen) await afterOpen();
    return { ...ledger, get committedContentHash() { return ledger.committedContentHash; }, replay() { observed.replays++; return ledger.replay(); }, async append(input: Parameters<typeof ledger.append>[0]) {
      const failure = observed.failAppend; observed.failAppend = null;
      if (failure === 'before') throw new Error('injected append failure before durable write');
      const result = await ledger.append(input);
      const during = observed.duringAppend; observed.duringAppend = null; if (during) await during();
      if (failure === 'after') throw new Error('injected append failure after durable write');
      return result;
    } };
  } };
});

const stores: LedgerSessionStore[] = [];
const directories: string[] = [];
beforeEach(() => { observed.opens = 0; observed.replays = 0; observed.journalReads.length = 0; observed.bodyReads.length = 0; observed.payloadReads.length = 0; observed.metadataChecks.length = 0; observed.failAppend = null; observed.failBodyWrite = false; observed.frozenLog = null; observed.duringAppend = null; observed.afterOpen = null; });
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function setup(directory?: string) {
  const path = directory ?? await mkdtemp(join(tmpdir(), 'plan23-store-cache-'));
  if (!directory) directories.push(path);
  const store = await openSessionStore({ directory: path }); stores.push(store);
  return { path, store };
}
const record = (revision: number, body: Record<string, unknown> = {}): SessionStoreRecord => ({ runId: 'A', id: 'session:s', revision, schema: 'ramify-agent.session/1', body });
const bodyHash = (body: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(body)).digest('hex');
const bodyHeader = (item: SessionStoreRecord) => ({ runId: item.runId, id: item.id, revision: item.revision, schema: item.schema, bodyId: bodyHash(item.body) });
const commit = (store: LedgerSessionStore, revision: number, payloads: string[] = [], body?: Record<string, unknown>) => store.commit({
  runId: 'A', expected: [{ id: 'session:s', revision: revision === 1 ? null : revision - 1 }], records: [record(revision, body)], payloads,
});
async function storedRawBody(bytes: string) {
  const { path, store } = await setup(); await store.close();
  const bodyId = createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(path, 'record-bodies', `${bodyId}.json`), bytes);
  const transaction = { sequence: 1, at: '2026-01-01T00:00:00.000Z', event: {
    type: 'session-store-commit/2', runId: 'A', records: [{ runId: 'A', id: 'session:s', revision: 1, schema: 'ramify-agent.session/1', bodyId }], payloads: [],
  }, records: [] };
  await writeFile(join(path, 'session-ledger.jsonl'), `${JSON.stringify(transaction)}\n`);
  return { path, bodyId, store: (await setup(path)).store };
}

describe('owned normalized record reads', () => {
  it('returns independently owned envelopes and nested bodies while physically authenticating every read', async () => {
    const { path, store } = await setup(); const second = (await setup(path)).store;
    const body = { nested: { values: [{ literal: 'original' }] }, date: new Date('2026-01-02T03:04:05.000Z'), omitted: undefined };
    await commit(store, 1, [], body);
    const expected = { nested: { values: [{ literal: 'original' }] }, date: '2026-01-02T03:04:05.000Z' };
    const target = join(path, 'record-bodies', `${bodyHash(expected)}.json`);
    observed.bodyReads.length = 0; observed.journalReads.length = 0;
    const first = (await store.readDetached('A', 'session:s'))!;
    expect(first).toEqual(record(1, expected));
    (first as { id: string }).id = 'caller mutation';
    ((first.body['nested'] as typeof expected.nested).values[0]!).literal = 'changed';
    (first.body['nested'] as typeof expected.nested).values.push({ literal: 'added' });
    const next = (await second.readDetached('A', 'session:s'))!;
    expect(next).toEqual(record(1, expected)); expect(next.body).not.toBe(first.body);
    expect(next.body['nested']).not.toBe(first.body['nested']);
    expect(observed.bodyReads).toEqual([target, target]);
    expect(observed.journalReads).toEqual(Array(4).fill(join(path, 'session-ledger.jsonl')));
    expect(await store.readDetached('A', 'missing')).toBeNull();
    await store.close(); await second.close();
    expect(await (await setup(path)).store.readDetached('A', 'session:s')).toEqual(record(1, expected));
  });
  it('normalizes authenticated anomalous numbers only for the optional capability and omits only validated root keys', async () => {
    const bytes = '{"__proto__":{"discarded":true},"10":"ten","2":"two","negativeZero":-0,"overflow":1e400,"nested":{"__proto__":{"kept":true},"constructor":"data","values":[-0,1e400,-1e400]}}';
    const { path, bodyId, store } = await storedRawBody(bytes);
    const raw = (await store.read('A', 'session:s'))!;
    expect(Object.is(raw.body['negativeZero'], -0)).toBe(true); expect(raw.body['overflow']).toBe(Infinity);
    const normalized = (await store.readDetached('A', 'session:s'))!;
    const expected = JSON.parse('{"2":"two","10":"ten","negativeZero":0,"overflow":null,"nested":{"__proto__":{"kept":true},"constructor":"data","values":[0,null,null]}}');
    expect(normalized).toEqual(record(1, expected)); expect(Object.is(normalized.body['negativeZero'], -0)).toBe(false);
    expect(Object.keys(normalized.body)).toEqual(['2', '10', 'negativeZero', 'overflow', 'nested']);
    expect(Object.hasOwn(normalized.body, '__proto__')).toBe(false);
    const nested = normalized.body['nested'] as { __proto__: { kept: boolean }; values: unknown[] };
    expect(Object.getPrototypeOf(nested)).toBe(Object.prototype); expect(Object.hasOwn(nested, '__proto__')).toBe(true);
    nested.__proto__.kept = false; nested.values.push('changed');
    expect(await store.readDetached('A', 'session:s')).toEqual(record(1, expected));
    expect(Object.is((await store.read('A', 'session:s'))!.body['negativeZero'], -0)).toBe(true);
    await store.close(); const reopened = (await setup(path)).store;
    expect(await reopened.readDetached('A', 'session:s')).toEqual(record(1, expected));
    expect((await reopened.read('A', 'session:s'))!.body['overflow']).toBe(Infinity);
    expect(await readFile(join(path, 'record-bodies', `${bodyId}.json`), 'utf8')).toBe(bytes);
  });
  it('preserves root omission and nested prototype data for raw ordinary JSON without normalizing quoted numeric text', async () => {
    const { store } = await storedRawBody('{"__proto__":{"number":1e400},"literal":"-0 1e400","nested":{"__proto__":{"text":"unchanged"}}}');
    const expected = JSON.parse('{"literal":"-0 1e400","nested":{"__proto__":{"text":"unchanged"}}}');
    expect(await store.read('A', 'session:s')).toEqual(record(1, expected));
    expect(await store.readDetached('A', 'session:s')).toEqual(record(1, expected));
  });
  it.each(['corrupt', 'missing'] as const)('refuses actual immutable body %s through the optional capability and invalidates shared state', async change => {
    const { path, store } = await setup(); const second = (await setup(path)).store;
    const original = { value: 'original' }; await commit(store, 1, [], original);
    const target = join(path, 'record-bodies', `${bodyHash(original)}.json`);
    if (change === 'corrupt') await writeFile(target, '{"value":"changed"}'); else await rm(target);
    await expect(store.readDetached('A', 'session:s')).rejects.toThrow(/session record body/);
    await expect(second.readDetached('A', 'session:s')).rejects.toThrow(/session record body/);
    await expect(second.read('A', 'session:s')).rejects.toThrow(/session record body/);
  });
  it('keeps same-metadata journal rewrites unavailable on optional reads even after original bytes return', async () => {
    const { path, store } = await setup(); const second = (await setup(path)).store; await commit(store, 1);
    const log = join(path, 'session-ledger.jsonl'); const original = await readFile(log, 'utf8');
    observed.frozenLog = { path: log, metadata: statSync(log, { bigint: true }) };
    await writeFile(log, original.replace('session:s', 'session:x'));
    await expect(store.readDetached('A', 'session:s')).rejects.toThrow(/changed outside the owned writer/);
    await writeFile(log, original);
    await expect(second.readDetached('A', 'session:s')).rejects.toThrow(/changed outside the owned writer/);
  });
  it('fences optional reads after ownership loss and after close', async () => {
    const { path, store } = await setup(); const second = (await setup(path)).store; await commit(store, 1);
    await rm(join(path, 'plans', '.harness', 'lock'));
    await expect(store.readDetached('A', 'session:s')).rejects.toThrow(/ownership unavailable/);
    await expect(second.readDetached('A', 'session:s')).rejects.toThrow(/ownership unavailable/);
    await store.close(); await expect(store.readDetached('A', 'session:s')).rejects.toThrow(/ownership unavailable/);
  });
});

describe('Plan 23 owned session store replay cache', () => {
  it('detaches every nested data property across adapters and reopening without prototype setters or shared arrays', async () => {
    const { path, store } = await setup(); const second = (await setup(path)).store;
    const body = JSON.parse('{"nested":{"__proto__":{"kind":"data"},"constructor":{"value":"ctor"},"array":[{"value":"first"},{"inner":{"value":"second"}}]}}');
    expect(await commit(store, 1, [], body)).toEqual({ kind: 'committed' });
    const first = (await store.read('A', 'session:s'))!.body as typeof body;
    expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(first.nested)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(first.nested, '__proto__')).toEqual({ value: { kind: 'data' }, enumerable: true, writable: true, configurable: true });
    expect(Object.getOwnPropertyDescriptor(first.nested.array, 'length')).toEqual({ value: 2, enumerable: false, writable: true, configurable: false });
    first.nested.__proto__.kind = 'caller mutation'; first.nested.constructor.value = 'changed';
    first.nested.array[0].value = 'changed'; first.nested.array[1].inner.value = 'changed'; first.nested.array.push({ added: true });
    expect((await second.read('A', 'session:s'))!.body).toEqual(body);
    const another = (await second.read('A', 'session:s'))!.body as typeof body;
    expect(another.nested).not.toBe(first.nested); expect(another.nested.array).not.toBe(first.nested.array);
    await store.close(); await second.close(); const fresh = (await setup(path)).store;
    expect((await fresh.read('A', 'session:s'))!.body).toEqual(body);
  });
  it('preserves numeric primitives and ordered own data keys from authenticated noncanonical body bytes', async () => {
    const bytes = '{"10":"ten","2":"two","negativeZero":-0,"overflow":1e400,"nested":{"__proto__":{"plain":true},"values":[-0,1e400]}}';
    const { path, bodyId, store } = await storedRawBody(bytes); const second = (await setup(path)).store;
    const value = (await store.read('A', 'session:s'))!.body;
    expect(Object.keys(value)).toEqual(['2', '10', 'negativeZero', 'overflow', 'nested']);
    expect(Object.is(value['negativeZero'], -0)).toBe(true); expect(value['overflow']).toBe(Infinity);
    const nested = value['nested'] as { __proto__: { plain: boolean }; values: number[] };
    expect(Object.getPrototypeOf(nested)).toBe(Object.prototype); expect(Object.hasOwn(nested, '__proto__')).toBe(true);
    expect(Object.is(nested.values[0], -0)).toBe(true); expect(nested.values[1]).toBe(Infinity);
    nested.__proto__.plain = false; nested.values[0] = 42;
    const freshCopy = (await second.read('A', 'session:s'))!.body;
    expect(Object.is(freshCopy['negativeZero'], -0)).toBe(true); expect(freshCopy['overflow']).toBe(Infinity);
    expect(freshCopy['nested']).toEqual({ ['__proto__']: { plain: true }, values: [-0, Infinity] });
    await store.close(); await second.close(); const reopened = (await setup(path)).store;
    const restored = (await reopened.read('A', 'session:s'))!.body;
    expect(Object.is(restored['negativeZero'], -0)).toBe(true); expect(restored['overflow']).toBe(Infinity);
    expect(await readFile(join(path, 'record-bodies', `${bodyId}.json`), 'utf8')).toBe(bytes);
  });
  it('keeps deeply nested valid JSON readable and detached without recursive traversal limits', async () => {
    const depth = 12_000;
    const bytes = `${'{"child":'.repeat(depth)}{"leaf":"unchanged"}${'}'.repeat(depth)}`;
    const { path, store } = await storedRawBody(bytes);
    const leaf = (body: Readonly<Record<string, unknown>>) => {
      let current = body;
      for (let index = 0; index < depth; index++) current = current['child'] as Readonly<Record<string, unknown>>;
      return current as Record<string, unknown>;
    };
    const first = (await store.read('A', 'session:s'))!.body; expect(leaf(first)['leaf']).toBe('unchanged');
    leaf(first)['leaf'] = 'caller mutation';
    expect(leaf((await store.read('A', 'session:s'))!.body)['leaf']).toBe('unchanged');
    await store.close(); const reopened = (await setup(path)).store;
    expect(leaf((await reopened.read('A', 'session:s'))!.body)['leaf']).toBe('unchanged');
  });
  it('persists exact post-validation body JSON with numeric keys, own prototype keys and nested normalization', async () => {
    const { path, store } = await setup();
    const body = JSON.parse('{"__proto__":{"removed":true},"10":"ten","2":"two","nested":{"__proto__":{"kept":true}}}') as Record<string, unknown>;
    const nested = body['nested'] as Record<string, unknown>;
    nested['arr'] = [undefined, Number.NaN, Infinity, -Infinity];
    nested['date'] = new Date('2026-01-02T03:04:05.000Z');
    body['date'] = new Date('2026-01-02T03:04:05.000Z'); body['nan'] = Number.NaN; body['omitted'] = undefined;
    const expectedBytes = '{"2":"two","10":"ten","nested":{"__proto__":{"kept":true},"arr":[null,null,null,null],"date":"2026-01-02T03:04:05.000Z"},"date":"2026-01-02T03:04:05.000Z","nan":null}';
    const expectedBody = JSON.parse(expectedBytes) as Record<string, unknown>;
    const bodyId = createHash('sha256').update(expectedBytes).digest('hex');
    const pending = commit(store, 1, [], body);
    body['nan'] = 123; nested['arr'] = ['caller mutation'];
    expect(await pending).toEqual({ kind: 'committed' });
    expect(await readFile(join(path, 'record-bodies', `${bodyId}.json`), 'utf8')).toBe(expectedBytes);
    const line = JSON.parse(await readFile(join(path, 'session-ledger.jsonl'), 'utf8'));
    expect(line.event.records).toEqual([{ runId: 'A', id: 'session:s', revision: 1, schema: 'ramify-agent.session/1', bodyId }]);
    expect(await store.read('A', 'session:s')).toEqual(record(1, expectedBody));
    await store.close(); const fresh = (await setup(path)).store;
    expect(await fresh.read('A', 'session:s')).toEqual(record(1, expectedBody));
    expect(Object.hasOwn((await fresh.read('A', 'session:s'))!.body, '__proto__')).toBe(false);
  });
  it.each([undefined, null, [], 'scalar'])('refuses invalid body JSON without publishing or replacing an authenticated transaction: %j', async invalid => {
    const { path, store } = await setup(); await commit(store, 1, [], { original: true });
    const original = await readFile(join(path, 'session-ledger.jsonl'), 'utf8');
    await expect(store.commit({ runId: 'A', expected: [{ id: 'session:s', revision: 1 }], records: [{ ...record(2), body: invalid as unknown as Record<string, unknown> }], payloads: [] })).rejects.toThrow();
    expect(await readFile(join(path, 'session-ledger.jsonl'), 'utf8')).toBe(original);
    expect(await store.read('A', 'session:s')).toEqual(record(1, { original: true }));
  });
  it('shared adapters see successful commits and one competing CAS without reopening or replaying the ledger', async () => {
    const { path, store } = await setup(); const second = (await setup(path)).store;
    const results = await Promise.all([commit(store, 1), commit(second, 1)]);
    expect(results.map(result => result.kind).sort()).toEqual(['committed', 'conflict']);
    expect(await second.read('A', 'session:s')).toEqual(record(1));
    expect(await commit(second, 2, [], { current: true })).toEqual({ kind: 'committed' });
    const value = await store.read('A', 'session:s'); expect(value).toEqual(record(2, { current: true }));
    (value!.body as Record<string, unknown>)['current'] = false;
    expect(await second.read('A', 'session:s')).toEqual(record(2, { current: true }));
    expect(observed.opens).toBe(1); expect(observed.replays).toBe(1);
  });
  it('captures transaction input before awaiting ownership or append and never caches caller mutations', async () => {
    const { store } = await setup(); const body = { value: 'original' }; const item = record(1, body);
    const pending = store.commit({ runId: 'A', expected: [{ id: item.id, revision: null }], records: [item], payloads: [] });
    body.value = 'mutated while awaiting';
    expect(await pending).toEqual({ kind: 'committed' });
    body.value = 'mutated after append';
    expect(await store.read('A', item.id)).toEqual(record(1, { value: 'original' }));
  });
  it('cached committed bodies match authoritative JSON bytes across a completely fresh writer lifetime', async () => {
    const { path, store } = await setup();
    await commit(store, 1, [], { date: new Date('2026-01-01T00:00:00Z'), missing: undefined, number: Number.NaN });
    const expected = record(1, { date: '2026-01-01T00:00:00.000Z', number: null });
    expect(await store.read('A', 'session:s')).toEqual(expected);
    await store.close();
    expect(await (await setup(path)).store.read('A', 'session:s')).toEqual(expected);
  });
  it('one flushed event keeps every atomic CAS envelope and payload identity without advisory record copies', async () => {
    const { path, store } = await setup();
    const bytes = new Uint8Array([0, 255, 10, 128]);
    const payload = await store.putPayload(bytes);
    const session = record(1, { refs: [payload], point: { sessionId: 's', sequence: 1 } });
    const operation: SessionStoreRecord = { runId: 'A', id: 'operation:o', revision: 1, schema: 'ramify-agent.session-operation/1', body: { receipt: { status: 'submitted', point: { sessionId: 's', sequence: 1 } } } };
    expect(await store.commit({ runId: 'A', expected: [{ id: session.id, revision: null }, { id: operation.id, revision: null }], records: [session, operation], payloads: [payload] })).toEqual({ kind: 'committed' });
    const lines = (await readFile(join(path, 'session-ledger.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ sequence: 1, at: expect.any(String), event: { type: 'session-store-commit/2', runId: 'A', records: [bodyHeader(session), bodyHeader(operation)], payloads: [payload] }, records: [] });
    expect(JSON.parse(await readFile(join(path, 'record-bodies', `${bodyHash(session.body)}.json`), 'utf8'))).toEqual(session.body);
    expect(JSON.parse(await readFile(join(path, 'record-bodies', `${bodyHash(operation.body)}.json`), 'utf8'))).toEqual(operation.body);
    await store.close();
    const reopened = (await setup(path)).store;
    expect(await reopened.read('A', session.id)).toEqual(session);
    expect(await reopened.read('A', operation.id)).toEqual(operation);
    expect(await reopened.getPayload(payload)).toEqual(bytes);
    expect((await reopened.commit({ runId: 'A', expected: [{ id: session.id, revision: null }, { id: operation.id, revision: null }], records: [session, operation], payloads: [payload] })).kind).toBe('conflict');
    expect(await readFile(join(path, 'session-ledger.jsonl'), 'utf8')).toEqual(`${JSON.stringify(lines[0])}\n`);
  });
  it('replays existing complete v1 envelopes and later compact v2 headers with identical normalized values', async () => {
    const { path, store } = await setup(); const bytes = new Uint8Array([0, 255, 128]); const payload = await store.putPayload(bytes); await store.close();
    const original = record(1, { value: 'original', refs: [payload] });
    const legacy = { sequence: 1, at: '2026-01-01T00:00:00.000Z', event: { type: 'session-store-commit', runId: 'A', records: [original], payloads: [payload] }, records: [] };
    const originalBytes = `  ${JSON.stringify(legacy)} \n`; await writeFile(join(path, 'session-ledger.jsonl'), originalBytes);
    const reopened = (await setup(path)).store; expect(await reopened.read('A', original.id)).toEqual(original);
    const changed = record(2, { date: '2026-01-01T00:00:00.000Z', value: null });
    expect(await commit(reopened, 2, [payload], { date: new Date('2026-01-01T00:00:00Z'), value: Number.NaN, omitted: undefined })).toEqual({ kind: 'committed' });
    const raw = await readFile(join(path, 'session-ledger.jsonl'), 'utf8'); expect(raw.startsWith(originalBytes)).toBe(true);
    const lines = raw.trim().split('\n').map(line => JSON.parse(line));
    expect(lines).toEqual([legacy, { sequence: 2, at: expect.any(String), event: { type: 'session-store-commit/2', runId: 'A', records: [bodyHeader(changed)], payloads: [payload] }, records: [] }]);
    await reopened.close(); const fresh = (await setup(path)).store;
    expect(await fresh.read('A', original.id)).toEqual(changed); expect(await fresh.getPayload(payload)).toEqual(bytes);
  });
  it('authenticates the actual journal despite identical metadata and keeps unexpected rewrites unavailable across adapters', async () => {
    const { path, store } = await setup(); const second = (await setup(path)).store; await commit(store, 1);
    const log = join(path, 'session-ledger.jsonl'); const original = await readFile(log, 'utf8');
    observed.frozenLog = { path: log, metadata: statSync(log, { bigint: true }) };
    observed.journalReads.length = 0; expect(await second.read('A', 'session:s')).toEqual(record(1)); expect(observed.journalReads).toEqual([log, log]);
    await writeFile(log, original.replace('session:s', 'session:x'));
    await expect(store.read('A', 'session:s')).rejects.toThrow(/changed outside the owned writer/);
    await writeFile(log, original); // Restoration cannot erase the known foreign writer.
    await expect(second.read('A', 'session:s')).rejects.toThrow(/changed outside the owned writer/);
    await expect(commit(second, 2)).rejects.toThrow(/changed outside the owned writer/);
  });
  it('binds the first loaded owner bytes and never reopens to learn a different valid journal prefix', async () => {
    const { path, store } = await setup(); await commit(store, 1); await store.close();
    const log = join(path, 'session-ledger.jsonl'); const original = await readFile(log, 'utf8'); observed.opens = 0;
    observed.afterOpen = () => writeFile(log, original.replace('session:s', 'session:x'));
    await expect(openSessionStore({ directory: path })).rejects.toThrow(/changed while opening/);
    expect(observed.opens).toBe(1);
  });
  it('accepts only the owning ledger complete prefix after a legitimate torn-tail repair', async () => {
    const { path, store } = await setup(); await commit(store, 1, [], { value: 'original' }); await store.close();
    const log = join(path, 'session-ledger.jsonl'); const original = await readFile(log, 'utf8'); await writeFile(log, `${original}{"sequence":2,"unfinished":`);
    const fresh = (await setup(path)).store;
    expect(await fresh.read('A', 'session:s')).toEqual(record(1, { value: 'original' }));
    expect(await readFile(log, 'utf8')).toEqual(original);
    expect(await commit(fresh, 2, [], { value: 'next' })).toEqual({ kind: 'committed' });
  });
  it.each(['corrupt', 'missing'] as const)('checks actual current body bytes for reads and every existing expected CAS record: %s', async change => {
    const { path, store } = await setup(); const second = (await setup(path)).store;
    const a = record(1, { value: 'original' }); const b: SessionStoreRecord = { ...a, id: 'session:b', body: { value: 'another' } };
    await store.commit({ runId: 'A', expected: [{ id: a.id, revision: null }, { id: b.id, revision: null }], records: [a, b], payloads: [] });
    const journal = await readFile(join(path, 'session-ledger.jsonl'), 'utf8');
    const target = join(path, 'record-bodies', `${bodyHash(b.body)}.json`);
    if (change === 'corrupt') await writeFile(target, JSON.stringify({ value: 'changed' })); else await rm(target);
    // Validate B even when A's revision is already a mismatch.
    await expect(store.commit({ runId: 'A', expected: [{ id: a.id, revision: 99 }, { id: b.id, revision: 1 }], records: [record(100)], payloads: [] })).rejects.toThrow(/session record body/);
    await expect(second.read('A', a.id)).rejects.toThrow(/session record body/); // Shared cache invalidated; complete history is replayed.
    expect(await readFile(join(path, 'session-ledger.jsonl'), 'utf8')).toEqual(journal);
  });
  it('validates unreferenced historical record bodies on a fresh writer lifetime', async () => {
    const { path, store } = await setup(); const original = { value: 'history' };
    await commit(store, 1, [], original); await commit(store, 2, [], { value: 'current' });
    await writeFile(join(path, 'record-bodies', `${bodyHash(original)}.json`), JSON.stringify({ value: 'changed' }));
    expect(await store.read('A', 'session:s')).toEqual(record(2, { value: 'current' }));
    await store.close(); await expect(openSessionStore({ directory: path })).rejects.toThrow(/Corrupt session record body/);
  });
  it('direct current-body read hashes actual bytes and invalidates the shared writer cache on damage', async () => {
    const { path, store } = await setup(); const second = (await setup(path)).store; const body = { value: 'original' };
    await commit(store, 1, [], body);
    await writeFile(join(path, 'record-bodies', `${bodyHash(body)}.json`), JSON.stringify({ value: 'modified' }));
    await expect(second.read('A', 'session:s')).rejects.toThrow(/Corrupt session record body/);
    await expect(store.read('A', 'unrelated')).rejects.toThrow(/Corrupt session record body/);
  });
  it('body persistence failure leaves the atomic journal and current records unchanged', async () => {
    const { path, store } = await setup(); await commit(store, 1, [], { value: 'original' }); const journal = await readFile(join(path, 'session-ledger.jsonl'), 'utf8');
    observed.failBodyWrite = true;
    await expect(commit(store, 2, [], { value: 'new body' })).rejects.toThrow(/immutable body write failure/);
    expect(await readFile(join(path, 'session-ledger.jsonl'), 'utf8')).toEqual(journal);
    expect(await store.read('A', 'session:s')).toEqual(record(1, { value: 'original' }));
    expect(await commit(store, 2, [], { value: 'new body' })).toEqual({ kind: 'committed' });
  });
  it('rejects a newly committed body corrupted at the append boundary and never publishes speculative cached values', async () => {
    const { path, store } = await setup(); const body = { value: 'original' };
    observed.duringAppend = () => writeFile(join(path, 'record-bodies', `${bodyHash(body)}.json`), JSON.stringify({ value: 'modified' }));
    await expect(commit(store, 1, [], body)).rejects.toThrow(/Corrupt session record body/);
    await expect(store.read('A', 'session:s')).rejects.toThrow(/Corrupt session record body/);
    await expect(commit(store, 1, [], body)).rejects.toThrow(/Corrupt session record body/);
  });
  it('poisons known foreign journal writes during append while ordinary uncertain append failure remains recoverable', async () => {
    const { path, store } = await setup(); const second = (await setup(path)).store;
    observed.duringAppend = async () => { const log = join(path, 'session-ledger.jsonl'); const raw = await readFile(log, 'utf8'); await writeFile(log, raw.replace('session:s', 'session:x')); };
    await expect(commit(store, 1)).rejects.toThrow(/changed outside the owned writer/);
    await expect(second.read('A', 'session:s')).rejects.toThrow(/changed outside the owned writer/);
  });
  it.each(['session-store-commit', 'session-store-commit/2'] as const)('refuses a %s journal envelope whose run differs from its transaction', async type => {
    const { path, store } = await setup(); await store.close(); const item = { ...record(1), runId: 'B' };
    if (type === 'session-store-commit/2') await writeFile(join(path, 'record-bodies', `${bodyHash(item.body)}.json`), JSON.stringify(item.body));
    const event = { type, runId: 'A', records: [type === 'session-store-commit' ? item : bodyHeader(item)], payloads: [] };
    await writeFile(join(path, 'session-ledger.jsonl'), `${JSON.stringify({ sequence: 1, at: '2026-01-01T00:00:00Z', event, records: [] })}\n`);
    await expect(openSessionStore({ directory: path })).rejects.toThrow(/transaction run identity/);
  });
  it('reuses replay and unchanged provider payload proofs while checking actual journal bytes on every read and transaction', async () => {
    const { path, store } = await setup(); const id = await store.putPayload(new TextEncoder().encode('immutable transcript'));
    observed.payloadReads.length = 0; observed.journalReads.length = 0;
    for (let revision = 1; revision <= 6; revision++) {
      expect((await commit(store, revision, [id, id], { payload: id })).kind).toBe('committed');
      await store.read('A', 'session:s');
    }
    const second = (await setup(path)).store;
    expect(await second.read('A', 'session:s')).toEqual(record(6, { payload: id }));
    expect(observed.opens).toBe(1); expect(observed.replays).toBe(1); expect(observed.payloadReads).toHaveLength(1);
    expect(observed.journalReads).toHaveLength(40); // Two per read/open, four per committed transaction.
    await second.getPayload(id); await store.getPayload(id);
    expect(observed.payloadReads).toHaveLength(3); // Direct requests always validate exact bytes.
    await store.close(); await second.close();
    observed.payloadReads.length = 0;
    const reopened = (await setup(path)).store;
    expect(await reopened.read('A', 'session:s')).toEqual(record(6, { payload: id }));
    expect(observed.opens).toBe(2); expect(observed.replays).toBe(2); expect(observed.payloadReads).toHaveLength(1);
  });
  it('checks every unique historical payload on each read and commit even after current records stop referring to it', async () => {
    const { path, store } = await setup();
    const first = await store.putPayload(new TextEncoder().encode('history-first'));
    const second = await store.putPayload(new TextEncoder().encode('history-second'));
    // Establish an exactly representable historical mtime before validation.
    await utimes(join(path, 'payloads', first), new Date(0), new Date(0));
    expect(statSync(join(path, 'payloads', first), { bigint: true }).mtimeNs).toBe(0n);
    await commit(store, 1, [first, second, first], { payload: first });
    await commit(store, 2, [second], { payload: second });
    const expected = [join(path, 'payloads', first), join(path, 'payloads', second)].sort();
    observed.metadataChecks.length = 0; observed.payloadReads.length = 0;
    expect(await store.read('A', 'session:s')).toEqual(record(2, { payload: second }));
    expect(observed.metadataChecks.sort()).toEqual(expected);
    expect(observed.payloadReads).toEqual([]);
    observed.metadataChecks.length = 0;
    expect(await commit(store, 3, [], { current: 'no payload' })).toEqual({ kind: 'committed' });
    expect(observed.metadataChecks.sort()).toEqual(expected);
    expect(observed.payloadReads).toEqual([]);
    // An unreferenced historical parent still has to be available and authentic.
    await writeFile(join(path, 'payloads', first), 'history-other');
    await utimes(join(path, 'payloads', first), new Date(0), new Date(0));
    expect(statSync(join(path, 'payloads', first), { bigint: true }).mtimeNs).toBe(0n);
    await expect(store.read('A', 'session:s')).rejects.toThrow(`Corrupt transcript payload ${first}`);
    await expect(commit(store, 4, [], { accepted: false })).rejects.toThrow(`Corrupt transcript payload ${first}`);
  });
  it('never publishes speculative cached records or payload references after a failed append', async () => {
    const { path, store } = await setup(); const second = (await setup(path)).store;
    const id = await store.putPayload(new TextEncoder().encode('new payload'));
    observed.failAppend = 'before';
    await expect(commit(store, 1, [id], { speculative: true })).rejects.toThrow(/before durable write/);
    expect(await second.read('A', 'session:s')).toBeNull();
    expect(await commit(second, 1, [id], { accepted: true })).toEqual({ kind: 'committed' });
    expect(await store.read('A', 'session:s')).toEqual(record(1, { accepted: true }));
    expect(observed.opens).toBe(2); expect(observed.replays).toBe(2);
  });
  it('replays authoritative completed bytes after an uncertain append failure instead of repeating a durable CAS', async () => {
    const { store } = await setup(); observed.failAppend = 'after';
    await expect(commit(store, 1)).rejects.toThrow(/after durable write/);
    expect(await store.read('A', 'session:s')).toEqual(record(1));
    expect((await commit(store, 1)).kind).toBe('conflict');
    expect(observed.opens).toBe(2); expect(observed.replays).toBe(2);
  });
  it.each(['rewrite', 'replace', 'delete'] as const)('invalidates unexpected ledger %s for every shared adapter', async change => {
    const { path, store } = await setup(); const second = (await setup(path)).store; await commit(store, 1);
    const log = join(path, 'session-ledger.jsonl'); const bytes = await readFile(log, 'utf8');
    if (change === 'delete') await rm(log);
    else if (change === 'replace') { const replacement = join(path, 'replacement'); await writeFile(replacement, bytes); await rename(replacement, log); }
    else await writeFile(log, bytes.replace('session:s', 'session:x')); // Same length, different bytes.
    await expect(store.read('A', 'session:s')).rejects.toThrow(/changed outside the owned writer/);
    await expect(second.read('A', 'session:s')).rejects.toThrow(/changed outside the owned writer/);
    await expect(commit(second, 2)).rejects.toThrow(/changed outside the owned writer/);
  });
  it.each(['corrupt', 'delete'] as const)('detects committed payload %s without trusting a cached record or duplicate historical references', async change => {
    const { path, store } = await setup(); const id = await store.putPayload(new TextEncoder().encode('original'));
    await commit(store, 1, [id, id]); const second = (await setup(path)).store;
    const payload = join(path, 'payloads', id);
    if (change === 'delete') await rm(payload);
    else { await writeFile(payload, 'modified'); await utimes(payload, new Date(0), new Date(0)); }
    await expect(second.read('A', 'session:s')).rejects.toThrow(/Corrupt transcript|Committed transcript payload unavailable/);
    await expect(commit(store, 2, [id])).rejects.toThrow(/Corrupt transcript|Committed transcript payload unavailable/);
    await store.close(); await second.close();
    await expect(openSessionStore({ directory: path })).rejects.toThrow(/Corrupt transcript|Committed transcript payload unavailable/);
  });
  it('materialized record deletion or corruption cannot replace ledger-authoritative cached or reopened state', async () => {
    const { path, store } = await setup(); await commit(store, 1);
    await rm(join(path, 'records'), { recursive: true, force: true });
    expect(await store.read('A', 'session:s')).toEqual(record(1));
    await store.close();
    expect(await (await setup(path)).store.read('A', 'session:s')).toEqual(record(1));
  });
  it('ownership loss invalidates all shared reads, direct payload access and writes even if the old lock bytes return', async () => {
    const { path, store } = await setup(); const second = (await setup(path)).store;
    const id = await store.putPayload(new TextEncoder().encode('original')); await commit(store, 1, [id]);
    const lock = join(path, 'plans', '.harness', 'lock'); const original = await readFile(lock);
    await rm(lock);
    await expect(second.read('A', 'session:s')).rejects.toThrow(/ownership unavailable/);
    await writeFile(lock, original);
    await expect(store.getPayload(id)).rejects.toThrow(/ownership unavailable/);
    await expect(store.putPayload(new Uint8Array([1]))).rejects.toThrow(/ownership unavailable/);
    await expect(commit(store, 2)).rejects.toThrow(/ownership unavailable/);
  });
  it('fully closed stores cannot read payloads or reuse a previous writer lifetime cache', async () => {
    const { path, store } = await setup(); const id = await store.putPayload(new Uint8Array([1])); await commit(store, 1, [id]); await store.close();
    await expect(store.getPayload(id)).rejects.toThrow(/ownership unavailable/);
    await writeFile(join(path, 'session-ledger.jsonl'), 'malformed complete line\n');
    await expect(openSessionStore({ directory: path })).rejects.toThrow();
  });
});

function captureGate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

describe('synchronous logical JSON commit admission', () => {
  it('detaches complete metadata before envelope body accessors, encodes each body once in order, and rejects caller aliases', async () => {
    const { path, store } = await setup(); const payload = await store.putPayload(new Uint8Array([1, 2, 3]));
    const trace: string[] = []; const firstBody = Object.assign(Object.create(null), { '10': 'ten', '2': 'two', negative: -0, huge: Infinity, omitted: undefined,
      date: new Date('2026-01-02T03:04:05.000Z'), nested: { ['__proto__']: { kept: true }, constructor: 'data', values: [undefined, NaN, -Infinity] }, fn: () => 'omitted', ['__proto__']: { dropped: true } });
    Object.defineProperty(firstBody, 'getter', { enumerable: true, get() { trace.push('nested getter'); return 'captured'; } });
    firstBody.custom = { toJSON() { trace.push('nested toJSON'); return { exact: 'native' }; } };
    const input = { runId: 'A', expected: [{ id: 'session:s', revision: null }, { id: 'session:other', revision: null }], payloads: [payload], records: [record(1), { ...record(1), id: 'session:other' }] };
    Object.defineProperty(input.records[0]!, 'id', { enumerable: true, configurable: true, get() { trace.push('header first'); return 'session:s'; } });
    Object.defineProperty(input.records[1]!, 'id', { enumerable: true, configurable: true, get() { trace.push('header second'); return 'session:other'; } });
    Object.defineProperty(input.records[0]!, 'body', { enumerable: true, get() {
      trace.push('body first'); input.runId = 'changed-by-body'; input.expected[0]!.id = 'changed-by-body'; input.payloads.splice(0);
      Object.defineProperty(input.records[1]!, 'id', { value: 'changed-by-body', configurable: true, enumerable: true });
      return firstBody;
    } });
    Object.defineProperty(input.records[1]!, 'body', { enumerable: true, get() { trace.push('body second'); return { toJSON() { trace.push('root toJSON'); return { label: 'second' }; } }; } });
    const pending = store.commitCaptured(input);
    expect(trace).toEqual(['header first', 'header second', 'body first', 'nested getter', 'nested toJSON', 'body second', 'root toJSON']);
    firstBody.nested.values.push('caller mutation'); firstBody.nested.__proto__.kept = false; input.records.splice(0); input.expected.splice(0); input.payloads.push('unavailable');
    expect(await pending).toEqual({ kind: 'committed' });
    const firstBytes = '{"2":"two","10":"ten","negative":0,"huge":null,"date":"2026-01-02T03:04:05.000Z","nested":{"__proto__":{"kept":true},"constructor":"data","values":[null,null,null]},"getter":"captured","custom":{"exact":"native"}}';
    const secondBytes = '{"label":"second"}';
    const firstHash = createHash('sha256').update(firstBytes).digest('hex'); const secondHash = createHash('sha256').update(secondBytes).digest('hex');
    expect(await readFile(join(path, 'record-bodies', `${firstHash}.json`), 'utf8')).toBe(firstBytes);
    expect(await readFile(join(path, 'record-bodies', `${secondHash}.json`), 'utf8')).toBe(secondBytes);
    const entry = JSON.parse((await readFile(join(path, 'session-ledger.jsonl'), 'utf8')).trim());
    expect(entry.event).toEqual({ type: 'session-store-commit/2', runId: 'A', records: [
      { runId: 'A', id: 'session:s', revision: 1, schema: 'ramify-agent.session/1', bodyId: firstHash },
      { runId: 'A', id: 'session:other', revision: 1, schema: 'ramify-agent.session/1', bodyId: secondHash },
    ], payloads: [payload] });
    expect(entry.records).toEqual([]);
    await store.close(); const reopened = (await setup(path)).store;
    expect(await reopened.read('A', 'session:s')).toEqual(record(1, JSON.parse(firstBytes)));
    expect(await reopened.read('A', 'session:other')).toEqual({ ...record(1, JSON.parse(secondBytes)), id: 'session:other' });
  });

  it('captures all input synchronously while an earlier durable append blocks the writer queue', async () => {
    const { store } = await setup(); const entered = captureGate(); const release = captureGate();
    observed.duringAppend = async () => { entered.resolve(); await release.promise; };
    const earlier = commit(store, 1, [], { value: 'earlier' }); await entered.promise;
    let getters = 0; const body = { nested: { values: ['original'] }, get literal() { getters++; return 'captured'; } };
    const input = { runId: 'A', expected: [{ id: 'session:s', revision: 1 }], records: [record(2, body)], payloads: [] as string[] };
    const pending = store.commitCaptured(input); expect(getters).toBe(1);
    input.runId = 'B'; input.expected[0]!.revision = 0; (input.records[0] as { id: string }).id = 'changed'; input.payloads.push('missing'); body.nested.values.push('changed');
    release.resolve(); expect(await earlier).toEqual({ kind: 'committed' }); expect(await pending).toEqual({ kind: 'committed' });
    expect(await store.read('A', 'session:s')).toEqual(record(2, { nested: { values: ['original'] }, literal: 'captured' })); expect(getters).toBe(1);
  });

  it.each(['array', 'undefined', 'cycle', 'bigint', 'throwing getter'] as const)('refuses unsupported %s bodies before publishing any record or journal', async shape => {
    const { path, store } = await setup(); let body: unknown;
    if (shape === 'array') body = ['invalid']; else if (shape === 'undefined') body = undefined;
    else if (shape === 'bigint') body = { integer: 1n };
    else if (shape === 'cycle') { const value: Record<string, unknown> = {}; value['self'] = value; body = value; }
    else body = { get value() { throw new Error('capture getter refused'); } };
    const pending = store.commitCaptured({ runId: 'A', expected: [{ id: 'session:s', revision: null }], records: [{ ...record(1), body: body as Record<string, unknown> }], payloads: [] });
    await expect(pending).rejects.toThrow(); expect(await store.read('A', 'session:s')).toBeNull();
    await expect(readFile(join(path, 'session-ledger.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses a later body getter without publishing an earlier prepared member of the same transaction', async () => {
    const { path, store } = await setup(); await commit(store, 1, [], { value: 'original' });
    const before = await readFile(join(path, 'session-ledger.jsonl')); const trace: string[] = [];
    const first = record(2, { toJSON() { trace.push('first'); return { value: 'prepared only' }; } });
    const second = { ...record(1), id: 'session:new' };
    Object.defineProperty(second, 'body', { enumerable: true, get() { trace.push('second'); throw new Error('Later body refused'); } });
    await expect(store.commitCaptured({ runId: 'A', expected: [{ id: 'session:s', revision: 1 }, { id: 'session:new', revision: null }], records: [first, second], payloads: [] })).rejects.toThrow('Later body refused');
    expect(trace).toEqual(['first', 'second']); expect(await readFile(join(path, 'session-ledger.jsonl'))).toEqual(before);
    expect(await store.read('A', 'session:s')).toEqual(record(1, { value: 'original' })); expect(await store.read('A', 'session:new')).toBeNull();
    await expect(readFile(join(path, 'record-bodies', `${bodyHash({ value: 'prepared only' })}.json`))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['body', 'journal', 'payload', 'owner'] as const)('retains actual %s refusal before a captured CAS conflict can bypass physical proof', async damage => {
    const { path, store } = await setup(); const payload = await store.putPayload(new Uint8Array([3, 4, 5])); const body = { value: 'original' };
    await commit(store, 1, [payload], body);
    if (damage === 'body') await writeFile(join(path, 'record-bodies', `${bodyHash(body)}.json`), '{"value":"changed"}');
    if (damage === 'payload') await writeFile(join(path, 'payloads', payload), new Uint8Array([9, 8, 7]));
    if (damage === 'owner') await rm(join(path, 'plans', '.harness', 'lock'));
    if (damage === 'journal') {
      const log = join(path, 'session-ledger.jsonl'); observed.frozenLog = { path: log, metadata: statSync(log, { bigint: true }) };
      await writeFile(log, (await readFile(log, 'utf8')).replace('session:s', 'session:x'));
    }
    const pending = store.commitCaptured({ runId: 'A', expected: [{ id: 'session:s', revision: 0 }], records: [record(1, { value: 'new' })], payloads: [payload] });
    await expect(pending).rejects.toThrow(damage === 'body' ? /record body/ : damage === 'journal' ? /changed outside/ : damage === 'owner' ? /ownership unavailable/ : /payload/);
  });

  it.each(['body write', 'append before', 'append after'] as const)('keeps captured commit %s uncertainty and authoritative recovery without a speculative cache', async fault => {
    const { path, store } = await setup(); await commit(store, 1, [], { value: 'original' });
    if (fault === 'body write') observed.failBodyWrite = true; else observed.failAppend = fault === 'append before' ? 'before' : 'after';
    await expect(store.commitCaptured({ runId: 'A', expected: [{ id: 'session:s', revision: 1 }], records: [record(2, { value: 'captured' })], payloads: [] })).rejects.toThrow(/injected/);
    const expected = fault === 'append after' ? record(2, { value: 'captured' }) : record(1, { value: 'original' });
    expect(await store.read('A', 'session:s')).toEqual(expected);
    await store.close(); expect(await (await setup(path)).store.read('A', 'session:s')).toEqual(expected);
  });

  it('keeps captured multi-record CAS conflict atomic and matches the ordinary normalized body wire', async () => {
    const { path, store } = await setup(); const body = { nested: { value: 'original' }, date: new Date('2026-01-01T00:00:00.000Z'), values: [-0, Infinity, undefined] };
    const normalized = { nested: { value: 'original' }, date: '2026-01-01T00:00:00.000Z', values: [0, null, null] };
    await commit(store, 1, [], body); const before = await readFile(join(path, 'session-ledger.jsonl'));
    expect(await store.commitCaptured({ runId: 'A', expected: [{ id: 'session:s', revision: 0 }, { id: 'session:new', revision: null }], records: [record(1, body), { ...record(1, body), id: 'session:new' }], payloads: [] })).toMatchObject({ kind: 'conflict' });
    expect(await readFile(join(path, 'session-ledger.jsonl'))).toEqual(before); expect(await store.read('A', 'session:new')).toBeNull();
    expect(await store.commitCaptured({ runId: 'A', expected: [{ id: 'session:s', revision: 1 }], records: [record(2, body)], payloads: [] })).toEqual({ kind: 'committed' });
    expect(await store.read('A', 'session:s')).toEqual(record(2, normalized));
    expect(await readFile(join(path, 'record-bodies', `${bodyHash(normalized)}.json`), 'utf8')).toBe(JSON.stringify(normalized));
  });
});
