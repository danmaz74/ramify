import { mkdtemp, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { statSync, type BigIntStats } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSessionStore, type LedgerSessionStore } from '../run/session-store.js';
import type { SessionStoreRecord } from '../../subs/agent/src/interfaces/session-operations.js';
import type { openLedger as PublicOpenLedger } from '../../subs/ledger/src/ledger.js';

const observed = vi.hoisted(() => ({ opens: 0, replays: 0, journalReads: [] as string[], payloadReads: [] as string[], metadataChecks: [] as string[], failAppend: null as 'before' | 'after' | null, failBodyWrite: false, frozenLog: null as { path: string; metadata: BigIntStats } | null, duringAppend: null as (() => Promise<void>) | null, afterOpen: null as (() => Promise<void>) | null }));
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
beforeEach(() => { observed.opens = 0; observed.replays = 0; observed.journalReads.length = 0; observed.payloadReads.length = 0; observed.metadataChecks.length = 0; observed.failAppend = null; observed.failBodyWrite = false; observed.frozenLog = null; observed.duringAppend = null; observed.afterOpen = null; });
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
  it('hashes the actual journal despite identical metadata and keeps unexpected rewrites unavailable across adapters', async () => {
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
  it('binds the first loaded owner digest and never reopens to learn a different valid journal prefix', async () => {
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
