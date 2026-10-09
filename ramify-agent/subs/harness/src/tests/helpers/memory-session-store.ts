import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { LedgerSessionStore } from '../../run/session-store.js';
import type { SessionStoreCommit, SessionStoreRecord } from '../../../subs/agent/src/interfaces/session-operations.js';

// A directory identifies one test repository across service close/reopen.
// Values cross a JSON/byte-copy boundary, without repeated filesystem work.
type Stored = { header: Omit<SessionStoreRecord, 'body'>; body: string };
const repositories = new Map<string, { records: Map<string, Stored>; payloads: Map<string, Uint8Array> }>();
export function forgetMemorySessionStores(): void { repositories.clear(); }
export async function openMemorySessionStore({ directory }: { directory: string }): Promise<LedgerSessionStore> {
  const path = resolve(directory);
  let state = repositories.get(path);
  if (!state) { state = { records: new Map(), payloads: new Map() }; repositories.set(path, state); }
  const { records, payloads } = state;
  let closed = false;
  const assertOpen = () => { if (closed) throw new Error('Session store writer ownership unavailable'); };
  const key = (runId: string, id: string) => JSON.stringify([runId, id]);
  const read = async (runId: string, id: string): Promise<SessionStoreRecord | null> => {
    assertOpen();
    const stored = records.get(key(runId, id));
    return stored === undefined ? null : { ...stored.header, body: JSON.parse(stored.body) as Record<string, unknown> };
  };
  const commit = async (input: SessionStoreCommit): ReturnType<LedgerSessionStore['commit']> => {
    // Capture before returning, including the optional captured-commit path.
    const runId = input.runId;
    const expected = input.expected.map(item => ({ ...item }));
    const ids = [...input.payloads];
    const updates = input.records.map(({ body, ...header }) => ({ header: { ...header }, body: JSON.stringify(body) }));
    assertOpen();
    for (const item of expected) {
      const prior = records.get(key(runId, item.id));
      if ((prior?.header.revision ?? null) !== item.revision) return { kind: 'conflict', reason: `Revision conflict for ${item.id}` };
    }
    for (const id of ids) if (!payloads.has(id)) throw new Error(`Missing committed payload: ${id}`);
    for (const stored of updates) records.set(key(stored.header.runId, stored.header.id), stored);
    return { kind: 'committed' };
  };
  return {
    read, readDetached: read, commit, commitCaptured: commit,
    async putPayload(bytes) {
      assertOpen();
      const copy = new Uint8Array(bytes);
      const id = createHash('sha256').update(copy).digest('hex');
      payloads.set(id, copy);
      return id;
    },
    async getPayload(id) { assertOpen(); const bytes = payloads.get(id); return bytes === undefined ? null : new Uint8Array(bytes); },
    async close() { closed = true; },
  };
}
