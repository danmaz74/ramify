import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { openSessionStore, type LedgerSessionStore } from '../run/session-store.js';
const stores: LedgerSessionStore[] = []; const directories: string[] = [];
afterEach(async () => { for (const store of stores.splice(0)) await store.close(); for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
async function setup(path: string) { const store = await openSessionStore({ directory: path }); stores.push(store); return { store }; }
async function storedRawBody(bytes: string) {
  const path = await mkdtemp(join(tmpdir(), 'session-store-stress-')); directories.push(path);
  const initial = (await setup(path)).store; await initial.close();
  const bodyId = createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(path, 'record-bodies', `${bodyId}.json`), bytes);
  const transaction = { sequence: 1, at: '2026-01-01T00:00:00.000Z', event: { type: 'session-store-commit/2', runId: 'A', records: [{ runId: 'A', id: 'session:s', revision: 1, schema: 'ramify-agent.session/1', bodyId }], payloads: [] }, records: [] };
  await writeFile(join(path, 'session-ledger.jsonl'), `${JSON.stringify(transaction)}\n`);
  return { path, store: (await setup(path)).store };
}
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
