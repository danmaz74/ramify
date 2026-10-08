import { mkdtemp, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSessionStore, type LedgerSessionStore } from '../run/session-store.js';
import type { SessionStoreRecord } from '../../subs/agent/src/interfaces/session-operations.js';
import type { openLedger as PublicOpenLedger } from '../../subs/ledger/src/ledger.js';

const observed = vi.hoisted(() => ({ opens: 0, replays: 0, payloadReads: [] as string[], failAppend: null as 'before' | 'after' | null }));
vi.mock('node:fs/promises', async original => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, readFile: (...args: Parameters<typeof fs.readFile>) => {
    const path = String(args[0]);
    if (/\/payloads\/[a-f0-9]{64}$/.test(path)) observed.payloadReads.push(path);
    return fs.readFile(...args);
  } };
});
vi.mock('../../subs/ledger/src/ledger.js', async original => {
  const module = await original<{ openLedger: typeof PublicOpenLedger }>();
  return { openLedger: async (...args: Parameters<typeof module.openLedger>) => {
    observed.opens++;
    const ledger = await module.openLedger(...args);
    return { ...ledger, replay() { observed.replays++; return ledger.replay(); }, async append(input: Parameters<typeof ledger.append>[0]) {
      const failure = observed.failAppend; observed.failAppend = null;
      if (failure === 'before') throw new Error('injected append failure before durable write');
      const result = await ledger.append(input);
      if (failure === 'after') throw new Error('injected append failure after durable write');
      return result;
    } };
  } };
});

const stores: LedgerSessionStore[] = [];
const directories: string[] = [];
beforeEach(() => { observed.opens = 0; observed.replays = 0; observed.payloadReads.length = 0; observed.failAppend = null; });
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
const commit = (store: LedgerSessionStore, revision: number, payloads: string[] = [], body?: Record<string, unknown>) => store.commit({
  runId: 'A', expected: [{ id: 'session:s', revision: revision === 1 ? null : revision - 1 }], records: [record(revision, body)], payloads,
});

describe('Plan 23 owned session store replay cache', () => {
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
  it('deduplicates historical payload identities and validates unchanged bytes once across repeated reads and transactions', async () => {
    const { path, store } = await setup(); const id = await store.putPayload(new TextEncoder().encode('immutable transcript'));
    observed.payloadReads.length = 0;
    for (let revision = 1; revision <= 6; revision++) {
      expect((await commit(store, revision, [id, id], { payload: id })).kind).toBe('committed');
      await store.read('A', 'session:s');
    }
    const second = (await setup(path)).store;
    expect(await second.read('A', 'session:s')).toEqual(record(6, { payload: id }));
    expect(observed.opens).toBe(1); expect(observed.replays).toBe(1); expect(observed.payloadReads).toHaveLength(1);
    await second.getPayload(id); await store.getPayload(id);
    expect(observed.payloadReads).toHaveLength(3); // Direct requests always validate exact bytes.
    await store.close(); await second.close();
    observed.payloadReads.length = 0;
    const reopened = (await setup(path)).store;
    expect(await reopened.read('A', 'session:s')).toEqual(record(6, { payload: id }));
    expect(observed.opens).toBe(2); expect(observed.replays).toBe(2); expect(observed.payloadReads).toHaveLength(1);
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
