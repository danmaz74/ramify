import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { acquireProjectLock, type ProjectLock } from '../store/lock.js';
import type { SessionStore, SessionStoreCommit, SessionStoreRecord } from '../../subs/agent/src/interfaces/session-operations.js';
import { openLedger } from '../../subs/ledger/src/ledger.js';
import { writeFileExclusive } from '../../subs/ledger/src/atomic.js';

/** Session adapters share this writer domain; ledger still rejects an unrelated concurrent process writer. */
const queues = new Map<string, Promise<unknown>>();
async function serialized<T>(path: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(path) ?? Promise.resolve();
  const pending = previous.then(work, work);
  const tail = pending.then(() => undefined, () => undefined);
  queues.set(path, tail);
  try { return await pending; } finally { if (queues.get(path) === tail) queues.delete(path); }
}
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const envelope = z.object({
  runId: z.string().min(1), id: z.string().min(1), revision: z.number().int().positive(),
  schema: z.enum(['ramify-agent.session/1', 'ramify-agent.session-operation/1']), body: z.record(z.string(), z.unknown()),
}).strict();
const eventSchema = z.object({ type: z.literal('session-store-commit'), runId: z.string().min(1), records: z.array(envelope), payloads: z.array(z.string().regex(/^[a-f0-9]{64}$/)) }).strict();
export interface LedgerSessionStoreOptions { readonly directory: string }
export interface LedgerSessionStore extends SessionStore { close(): Promise<void> }
const writers = new Map<string, { lock: ProjectLock; references: number }>();

/** Ledger replay, rather than materialized copies or provider files, is authoritative. */
export async function openSessionStore(options: LedgerSessionStoreOptions): Promise<LedgerSessionStore> {
  const directory = resolve(options.directory);
  const logPath = join(directory, 'session-ledger.jsonl');
  const payloadDirectory = join(directory, 'payloads');
  const writer = await serialized(directory, async () => {
    const prior = writers.get(directory);
    if (prior) { prior.references++; return prior; }
    const created = { lock: await acquireProjectLock(directory), references: 1 };
    writers.set(directory, created); return created;
  });
  let closed = false;
  const assertWriter = async () => {
    if (closed || !await writer.lock.held()) throw new Error('Session store writer ownership unavailable');
  };
  await mkdir(payloadDirectory, { recursive: true });
  const ledger = () => openLedger({ logPath, recordsRoot: join(directory, 'records'), eventSchema });
  const payloadPath = (id: string) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid transcript payload identity');
    return join(payloadDirectory, id);
  };
  async function getPayload(id: string): Promise<Uint8Array | null> {
    let bytes: Uint8Array;
    try { bytes = await readFile(payloadPath(id)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    if (hash(bytes) !== id) throw new Error(`Corrupt transcript payload ${id}`);
    return new Uint8Array(bytes);
  }
  async function load(opened?: Awaited<ReturnType<typeof ledger>>): Promise<Map<string, SessionStoreRecord>> {
    await assertWriter();
    const current = opened ?? await ledger();
    const records = new Map<string, SessionStoreRecord>();
    for (const entry of current.replay()) {
      for (const item of entry.transaction.event.records) {
        const id = JSON.stringify([item.runId, item.id]);
        const expected = (records.get(id)?.revision ?? 0) + 1;
        if (item.revision !== expected) throw new Error(`Corrupt session record revision for ${item.id}`);
        records.set(id, item);
      }
      for (const id of entry.transaction.event.payloads) {
        if (await getPayload(id) === null) throw new Error(`Committed transcript payload unavailable: ${id}`);
      }
    }
    return records;
  }
  // Opening validates existing new-format data; missing records do not become fresh sessions.
  try { await serialized(logPath, () => load()); }
  catch (error) {
    await serialized(directory, async () => { writer.references--; if (writer.references === 0) { writers.delete(directory); await writer.lock.release(); } });
    throw error;
  }
  return {
    async close() {
      await serialized(logPath, async () => {
        if (closed) return; closed = true;
        await serialized(directory, async () => { writer.references--; if (writer.references === 0) { writers.delete(directory); await writer.lock.release(); } });
      });
    },
    async read(runId, id) {
      return serialized(logPath, async () => {
        const value = (await load()).get(JSON.stringify([runId, id]));
        return value ? structuredClone(value) : null;
      });
    },
    async putPayload(bytes) {
      await assertWriter();
      const copy = new Uint8Array(bytes);
      const id = hash(copy);
      await writeFileExclusive(payloadPath(id), copy);
      const stored = await getPayload(id);
      if (stored === null || !Buffer.from(stored).equals(Buffer.from(copy))) throw new Error(`Transcript payload identity collision: ${id}`);
      return id;
    },
    getPayload,
    async commit(input: SessionStoreCommit) {
      return serialized(logPath, async () => {
        await assertWriter();
        if (!input.runId) throw new Error('Missing run identity');
        const records = input.records.map(item => envelope.parse(item));
        const ids = records.map(item => item.id);
        if (new Set(ids).size !== ids.length || new Set(input.expected.map(item => item.id)).size !== input.expected.length) throw new Error('Duplicate CAS record identity');
        const writer = await ledger();
        const current = await load(writer);
        for (const expected of input.expected) {
          const actual = current.get(JSON.stringify([input.runId, expected.id]));
          if ((actual?.revision ?? null) !== expected.revision) return { kind: 'conflict' as const, reason: `Revision conflict for ${expected.id}` };
        }
        for (const item of records) {
          const expected = input.expected.find(value => value.id === item.id);
          if (item.runId !== input.runId || !expected || item.revision !== (expected.revision ?? 0) + 1) throw new Error(`Invalid CAS envelope for ${item.id}`);
        }
        for (const id of input.payloads) if (await getPayload(id) === null) throw new Error(`Missing committed payload ${id}`);
        const event = eventSchema.parse({ type: 'session-store-commit', runId: input.runId, records, payloads: [...input.payloads] });
        await writer.append({ event, records: records.map(item => ({ id: item.id, revision: item.revision, path: `${hash(JSON.stringify([item.runId, item.id]))}.json`, body: item })) });
        return { kind: 'committed' as const };
      });
    },
  };
}
