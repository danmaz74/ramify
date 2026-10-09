import { mkdtemp, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { statSync, type BigIntStats } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('../run/session-store.js');
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
