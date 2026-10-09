import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { readFileSync, statSync, type BigIntStats } from 'node:fs';
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
const contentId = z.string().regex(/^[a-f0-9]{64}$/);
const headerSchema = envelope.omit({ body: true }).extend({ bodyId: contentId }).strict();
const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session-store-commit'), runId: z.string().min(1), records: z.array(envelope), payloads: z.array(contentId) }).strict(),
  z.object({ type: z.literal('session-store-commit/2'), runId: z.string().min(1), records: z.array(headerSchema), payloads: z.array(contentId) }).strict(),
]);
export interface LedgerSessionStoreOptions { readonly directory: string }
export interface LedgerSessionStore extends SessionStore { close(): Promise<void> }
type SessionLedger = Awaited<ReturnType<typeof openLedger<z.infer<typeof eventSchema>>>>;
type Fingerprint = Pick<BigIntStats, 'dev' | 'ino' | 'size' | 'mtimeNs' | 'ctimeNs'>;
const sameFingerprint = (left: Fingerprint | null, right: Fingerprint | null): boolean => left === right || (left !== null && right !== null && left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs);
interface ValidatedState {
  readonly ledger: SessionLedger;
  readonly records: Map<string, SessionStoreRecord>;
  readonly serializedRecords: Map<string, string>;
  readonly bodyRefs: Map<string, string>;
  readonly payloads: Map<string, Fingerprint>;
  log: Fingerprint | null;
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
 * rewrites with a restored mtime; inode/device detect replacement. The finite
 * owned identity scan uses immediate metadata reads: enqueueing one async fs
 * task per historical payload on every operation overwhelms the worker queue.
 * Every identity is still checked, and changed bytes are read and hashed.
 */
function fingerprint(path: string): Fingerprint | null {
  try {
    const value = statSync(path, { bigint: true });
    if (!value.isFile()) throw new Error(`Session store path is not a file: ${path}`);
    return value;
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
  const bodyDirectory = join(directory, 'record-bodies');
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
  await mkdir(bodyDirectory, { recursive: true });
  const ledger = () => openLedger({ logPath, recordsRoot: join(directory, 'records'), eventSchema });
  function journalProof() {
    const before = fingerprint(logPath);
    let bytes: Buffer | null;
    try { bytes = readFileSync(logPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') bytes = null; else throw error; }
    const after = fingerprint(logPath);
    if (!sameFingerprint(before, after) || (before === null) !== (bytes === null)) {
      writer.state = null; writer.unavailable = 'Session ledger changed while validating'; throw new Error(writer.unavailable);
    }
    return { log: after, bytes: bytes ?? Buffer.alloc(0) };
  }
  const bodyPath = (id: string) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid session record body identity');
    return join(bodyDirectory, `${id}.json`);
  };
  function bodyBytes(id: string): Buffer {
    let bytes: Buffer;
    try { bytes = readFileSync(bodyPath(id)); }
    catch (error) { writer.state = null; if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Committed session record body unavailable: ${id}`); throw error; }
    if (hash(bytes) !== id) { writer.state = null; throw new Error(`Corrupt session record body ${id}`); }
    return bytes;
  }
  function readBody(id: string): Record<string, unknown> {
    return z.record(z.string(), z.unknown()).parse(JSON.parse(bodyBytes(id).toString('utf8')));
  }
  function detachedRecord(state: ValidatedState, key: string): SessionStoreRecord | null {
    const record = state.records.get(key);
    if (!record) return null;
    const bodyId = state.bodyRefs.get(key);
    if (bodyId !== undefined) return { runId: record.runId, id: record.id, revision: record.revision, schema: record.schema, body: readBody(bodyId) };
    return JSON.parse(state.serializedRecords.get(key)!) as SessionStoreRecord;
  }
  const payloadPaths = new Map<string, string>();
  const payloadPath = (id: string) => {
    const prior = payloadPaths.get(id);
    if (prior !== undefined) return prior;
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid transcript payload identity');
    const path = join(payloadDirectory, id);
    payloadPaths.set(id, path);
    return path;
  };
  async function readPayload(id: string): Promise<Uint8Array | null> {
    let bytes: Uint8Array;
    try { bytes = await readFile(payloadPath(id)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    if (hash(bytes) !== id) throw new Error(`Corrupt transcript payload ${id}`);
    return new Uint8Array(bytes);
  }
  async function validatePayload(id: string, prior?: Fingerprint, missing = 'Committed transcript payload unavailable'): Promise<Fingerprint> {
    const path = payloadPath(id);
    const before = fingerprint(path);
    if (before === null) throw new Error(`${missing}: ${id}`);
    if (prior !== undefined && sameFingerprint(before, prior)) return before;
    if (await readPayload(id) === null) throw new Error(`${missing}: ${id}`);
    const after = fingerprint(path);
    if (!sameFingerprint(before, after)) throw new Error(`Transcript payload changed while validating: ${id}`);
    return before;
  }
  async function load(): Promise<ValidatedState> {
    await assertWriter();
    const cached = writer.state;
    if (cached !== null) {
      const before = journalProof();
      if (!sameFingerprint(before.log, cached.log) || !cached.ledger.matchesCommittedContent(before.bytes)) {
        writer.state = null;
        writer.unavailable = 'Session ledger changed outside the owned writer';
        throw new Error(writer.unavailable);
      }
      // Each immutable identity is checked once, not once per historical
      // reference. Unchanged payloads need no historical read or hash.
      const changed: string[] = [];
      try {
        let scanned = 0;
        for (const [id, prior] of cached.payloads) {
          const current = fingerprint(payloadPath(id));
          if (current === null) throw new Error(`Committed transcript payload unavailable: ${id}`);
          if (!sameFingerprint(current, prior)) changed.push(id);
          // Keep large owned histories cooperative with Stop and other event-loop work.
          if (++scanned % 128 === 0) await new Promise<void>(resolve => setImmediate(resolve));
        }
      } catch (error) { writer.state = null; throw error; }
      // Only changed identities need asynchronous reads and before/after hash validation.
      if (changed.length > 0) {
        const checked = await Promise.allSettled(changed.map(async id => [id, await validatePayload(id)] as const));
        for (const result of checked) {
          if (result.status === 'rejected') { writer.state = null; throw result.reason; }
        }
        for (const result of checked) if (result.status === 'fulfilled') cached.payloads.set(...result.value);
      }
      const after = journalProof();
      if (!sameFingerprint(after.log, cached.log) || !after.bytes.equals(before.bytes) || !cached.ledger.matchesCommittedContent(after.bytes)) {
        writer.state = null;
        writer.unavailable = 'Session ledger changed outside the owned writer';
        throw new Error(writer.unavailable);
      }
      await assertWriter();
      return cached;
    }
    journalProof();
    const current = await ledger();
    const proof = journalProof();
    // The owner authenticates exactly the complete bytes it loaded, including
    // its legitimate torn-tail repair. Never reopen to learn a changed prefix.
    if (!current.matchesCommittedContent(proof.bytes)) {
      writer.state = null; writer.unavailable = 'Session ledger changed while opening'; throw new Error(writer.unavailable);
    }
    const records = new Map<string, SessionStoreRecord>();
    const bodyRefs = new Map<string, string>();
    const bodies = new Map<string, Record<string, unknown>>();
    const payloadIds = new Set<string>();
    for (const entry of current.replay()) {
      for (const item of entry.transaction.event.records) {
        if (item.runId !== entry.transaction.event.runId) throw new Error('Corrupt session transaction run identity');
        const id = JSON.stringify([item.runId, item.id]);
        const expected = (records.get(id)?.revision ?? 0) + 1;
        if (item.revision !== expected) throw new Error(`Corrupt session record revision for ${item.id}`);
        if (entry.transaction.event.type === 'session-store-commit/2') {
          const header = headerSchema.parse(item);
          let body = bodies.get(header.bodyId);
          if (body === undefined) { body = readBody(header.bodyId); bodies.set(header.bodyId, body); }
          records.set(id, envelope.parse({ runId: header.runId, id: header.id, revision: header.revision, schema: header.schema, body }));
          bodyRefs.set(id, header.bodyId);
        } else {
          records.set(id, envelope.parse(item));
          bodyRefs.delete(id);
        }
      }
      for (const id of entry.transaction.event.payloads) payloadIds.add(id);
    }
    const payloads = new Map<string, Fingerprint>();
    for (const id of payloadIds) payloads.set(id, await validatePayload(id));
    await assertWriter();
    const after = journalProof();
    if (!sameFingerprint(after.log, proof.log) || !after.bytes.equals(proof.bytes) || !current.matchesCommittedContent(after.bytes)) {
      writer.state = null; writer.unavailable = 'Session ledger changed while validating'; throw new Error(writer.unavailable);
    }
    const serializedRecords = new Map([...records].filter(([id]) => !bodyRefs.has(id)).map(([id, item]) => [id, JSON.stringify(item)]));
    const loaded: ValidatedState = { ledger: current, records, serializedRecords, bodyRefs, payloads, log: proof.log };
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
        return detachedRecord(await load(), JSON.stringify([runId, id]));
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
        const records = input.records.map(item => envelope.parse(JSON.parse(JSON.stringify(item))));
        const ids = records.map(item => item.id);
        if (new Set(ids).size !== ids.length || new Set(input.expected.map(item => item.id)).size !== input.expected.length) throw new Error('Duplicate CAS record identity');
        const state = await load();
        const current = state.records;
        const checkedExpected = input.expected.map(expected => {
          const key = JSON.stringify([input.runId, expected.id]);
          const bodyId = state.bodyRefs.get(key);
          // The complete owned journal authenticates the private header.
          // Validate every actual referenced body before deciding any conflict;
          // comparing its revision needs no additional decoded body copy.
          if (bodyId !== undefined) bodyBytes(bodyId);
          return { expected, actual: current.get(key) ?? null };
        });
        for (const { expected, actual } of checkedExpected) {
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
        const headers: z.infer<typeof headerSchema>[] = [];
        for (const item of records) {
          const bytes = JSON.stringify(item.body);
          const bodyId = hash(bytes);
          await writeFileExclusive(bodyPath(bodyId), bytes);
          bodyBytes(bodyId);
          headers.push({ runId: item.runId, id: item.id, revision: item.revision, schema: item.schema, bodyId });
        }
        const event = eventSchema.parse({ type: 'session-store-commit/2', runId: input.runId, records: headers, payloads: [...new Set(input.payloads)] });
        await assertWriter();
        const expectedBodyIds = new Set(input.expected.map(item => state.bodyRefs.get(JSON.stringify([input.runId, item.id]))).filter((id): id is string => id !== undefined));
        for (const id of expectedBodyIds) bodyBytes(id);
        for (const item of headers) bodyBytes(item.bodyId);
        const beforeAppend = journalProof();
        if (!sameFingerprint(beforeAppend.log, state.log) || !state.ledger.matchesCommittedContent(beforeAppend.bytes)) {
          writer.state = null; writer.unavailable = 'Session ledger changed outside the owned writer'; throw new Error(writer.unavailable);
        }
        try {
          // One flushed header transaction references complete authenticated
          // bodies already persisted atomically. Advisory record copies add
          // no recovery proof to this private adapter.
          await state.ledger.append({ event, records: [] });
          const proof = journalProof();
          if (proof.log === null || !state.ledger.matchesCommittedContent(proof.bytes)) {
            writer.unavailable = 'Session ledger changed outside the owned writer'; throw new Error(writer.unavailable);
          }
          for (const id of expectedBodyIds) bodyBytes(id);
          for (const item of headers) bodyBytes(item.bodyId);
          state.log = proof.log;
          await assertWriter();
        } catch (error) {
          // A failed append can leave a torn or complete durable line. Replay
          // is authoritative on the next operation; never publish speculative
          // records or keep the old ledger's potentially stale byte position.
          writer.state = null;
          throw error;
        }
        for (const item of records) {
          const key = JSON.stringify([item.runId, item.id]);
          current.set(key, item);
          state.serializedRecords.delete(key);
        }
        for (const item of headers) state.bodyRefs.set(JSON.stringify([item.runId, item.id]), item.bodyId);
        for (const [id, value] of payloads) state.payloads.set(id, value);
        return { kind: 'committed' as const };
      });
    },
  };
}
