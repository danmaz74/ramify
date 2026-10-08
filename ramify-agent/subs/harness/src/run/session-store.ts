import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
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
type SessionLedger = Awaited<ReturnType<typeof openLedger<z.infer<typeof eventSchema>>>>;
interface ValidatedState {
  readonly ledger: SessionLedger;
  readonly records: Map<string, SessionStoreRecord>;
  readonly payloads: Map<string, string>;
  log: string | null;
}
interface WriterDomain {
  readonly lock: ProjectLock;
  references: number;
  state: ValidatedState | null;
  unavailable: string | null;
}
const writers = new Map<string, WriterDomain>();

/** Metadata is checked even under ownership: an out-of-band edit must not hide
 * behind previously validated bytes. Nanosecond ctime also detects same-size
 * rewrites with a restored mtime; inode/device detect replacement.
 */
async function fingerprint(path: string): Promise<string | null> {
  try {
    const value = await stat(path, { bigint: true });
    if (!value.isFile()) throw new Error(`Session store path is not a file: ${path}`);
    return [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(':');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Ledger replay, rather than materialized copies or provider files, is authoritative. */
export async function openSessionStore(options: LedgerSessionStoreOptions): Promise<LedgerSessionStore> {
  const directory = resolve(options.directory);
  const logPath = join(directory, 'session-ledger.jsonl');
  const payloadDirectory = join(directory, 'payloads');
  const writer = await serialized(directory, async () => {
    const prior = writers.get(directory);
    if (prior) { prior.references++; return prior; }
    const created: WriterDomain = { lock: await acquireProjectLock(directory), references: 1, state: null, unavailable: null };
    writers.set(directory, created); return created;
  });
  let closed = false;
  const assertWriter = async () => {
    if (closed) throw new Error('Session store writer ownership unavailable');
    if (!await writer.lock.held()) {
      writer.state = null;
      writer.unavailable = 'Session store writer ownership unavailable';
    }
    if (writer.unavailable !== null) throw new Error(writer.unavailable);
  };
  await mkdir(payloadDirectory, { recursive: true });
  const ledger = () => openLedger({ logPath, recordsRoot: join(directory, 'records'), eventSchema });
  const payloadPath = (id: string) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid transcript payload identity');
    return join(payloadDirectory, id);
  };
  async function readPayload(id: string): Promise<Uint8Array | null> {
    let bytes: Uint8Array;
    try { bytes = await readFile(payloadPath(id)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    if (hash(bytes) !== id) throw new Error(`Corrupt transcript payload ${id}`);
    return new Uint8Array(bytes);
  }
  async function validatePayload(id: string, prior?: string, missing = 'Committed transcript payload unavailable'): Promise<string> {
    const path = payloadPath(id);
    const before = await fingerprint(path);
    if (before === null) throw new Error(`${missing}: ${id}`);
    if (before === prior) return before;
    if (await readPayload(id) === null) throw new Error(`${missing}: ${id}`);
    const after = await fingerprint(path);
    if (before !== after) throw new Error(`Transcript payload changed while validating: ${id}`);
    return before;
  }
  async function load(): Promise<ValidatedState> {
    await assertWriter();
    const cached = writer.state;
    if (cached !== null) {
      if (await fingerprint(logPath) !== cached.log) {
        writer.state = null;
        writer.unavailable = 'Session ledger changed outside the owned writer';
        throw new Error(writer.unavailable);
      }
      // Each immutable identity is checked once, not once per historical
      // reference. Unchanged payloads need no historical read or hash.
      const checked = await Promise.allSettled([...cached.payloads].map(async ([id, prior]) => [id, await validatePayload(id, prior)] as const));
      for (const result of checked) {
        if (result.status === 'rejected') { writer.state = null; throw result.reason; }
      }
      for (const result of checked) if (result.status === 'fulfilled') cached.payloads.set(...result.value);
      if (await fingerprint(logPath) !== cached.log) {
        writer.state = null;
        writer.unavailable = 'Session ledger changed outside the owned writer';
        throw new Error(writer.unavailable);
      }
      await assertWriter();
      return cached;
    }
    const before = await fingerprint(logPath);
    let current = await ledger();
    const log = await fingerprint(logPath);
    // openLedger may repair a torn final line. Open that repaired immutable
    // revision once more; never stamp bytes different from those replayed.
    if (before !== log) {
      current = await ledger();
      if (await fingerprint(logPath) !== log) throw new Error('Session ledger changed while opening');
    }
    const records = new Map<string, SessionStoreRecord>();
    const payloadIds = new Set<string>();
    for (const entry of current.replay()) {
      for (const item of entry.transaction.event.records) {
        const id = JSON.stringify([item.runId, item.id]);
        const expected = (records.get(id)?.revision ?? 0) + 1;
        if (item.revision !== expected) throw new Error(`Corrupt session record revision for ${item.id}`);
        records.set(id, item);
      }
      for (const id of entry.transaction.event.payloads) payloadIds.add(id);
    }
    const payloads = new Map<string, string>();
    for (const id of payloadIds) payloads.set(id, await validatePayload(id));
    await assertWriter();
    if (await fingerprint(logPath) !== log) throw new Error('Session ledger changed while validating');
    const loaded: ValidatedState = { ledger: current, records, payloads, log };
    writer.state = loaded;
    return loaded;
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
        const value = (await load()).records.get(JSON.stringify([runId, id]));
        return value ? structuredClone(value) : null;
      });
    },
    async putPayload(bytes) {
      const copy = new Uint8Array(bytes);
      return serialized(logPath, async () => {
        await assertWriter();
        const id = hash(copy);
        await writeFileExclusive(payloadPath(id), copy);
        const stored = await readPayload(id);
        if (stored === null || !Buffer.from(stored).equals(Buffer.from(copy))) throw new Error(`Transcript payload identity collision: ${id}`);
        return id;
      });
    },
    getPayload: id => serialized(logPath, async () => { await assertWriter(); return readPayload(id); }),
    async commit(input: SessionStoreCommit) {
      const captured = structuredClone(input);
      return serialized(logPath, async () => {
        await assertWriter();
        const input = captured;
        if (!input.runId) throw new Error('Missing run identity');
        const records = input.records.map(item => envelope.parse(item));
        const ids = records.map(item => item.id);
        if (new Set(ids).size !== ids.length || new Set(input.expected.map(item => item.id)).size !== input.expected.length) throw new Error('Duplicate CAS record identity');
        const state = await load();
        const current = state.records;
        for (const expected of input.expected) {
          const actual = current.get(JSON.stringify([input.runId, expected.id]));
          if ((actual?.revision ?? null) !== expected.revision) return { kind: 'conflict' as const, reason: `Revision conflict for ${expected.id}` };
        }
        for (const item of records) {
          const expected = input.expected.find(value => value.id === item.id);
          if (item.runId !== input.runId || !expected || item.revision !== (expected.revision ?? 0) + 1) throw new Error(`Invalid CAS envelope for ${item.id}`);
        }
        const payloads = new Map(state.payloads);
        for (const id of new Set(input.payloads)) {
          // load already validated cached identities for this transaction.
          if (!payloads.has(id)) payloads.set(id, await validatePayload(id, undefined, 'Missing committed payload'));
        }
        // Cache the JSON representation the ledger actually commits. In
        // particular, Dates, undefined fields and non-finite numbers must not
        // read differently before and after reopening the authoritative log.
        const event = eventSchema.parse(JSON.parse(JSON.stringify({ type: 'session-store-commit', runId: input.runId, records, payloads: [...new Set(input.payloads)] })));
        await assertWriter();
        try {
          await state.ledger.append({ event, records: event.records.map(item => ({ id: item.id, revision: item.revision, path: `${hash(JSON.stringify([item.runId, item.id]))}.json`, body: item })) });
          state.log = await fingerprint(logPath);
          if (state.log === null) throw new Error('Committed session ledger unavailable');
          await assertWriter();
        } catch (error) {
          // A failed append can leave a torn or complete durable line. Replay
          // is authoritative on the next operation; never publish speculative
          // records or keep the old ledger's potentially stale byte position.
          writer.state = null;
          throw error;
        }
        for (const item of event.records) current.set(JSON.stringify([item.runId, item.id]), item);
        for (const [id, value] of payloads) state.payloads.set(id, value);
        return { kind: 'committed' as const };
      });
    },
  };
}
