import { afterEach, expect, test } from 'vitest';
import { openSessionStore } from '../run/session-store.js';
import { forgetMemorySessionStores } from './helpers/memory-session-store.js';
import type { SessionStoreRecord } from '../../subs/agent/src/interfaces/session-operations.js';

afterEach(forgetMemorySessionStores);
const record = (id: string, revision: number, body: Record<string, unknown>): SessionStoreRecord => ({
  runId: 'run', id, revision, schema: 'ramify-agent.session/1', body,
});

test('workflow storage detaches input and returned values across close/reopen', async () => {
  const directory = '/workflow-fixture/session-store';
  const store = await openSessionStore({ directory });
  const body = { nested: { value: 'original' }, omitted: undefined };
  const committed = store.commitCaptured({ runId: 'run', expected: [{ id: 'session', revision: null }], records: [record('session', 1, body)], payloads: [] });
  body.nested.value = 'caller changed';
  expect(await committed).toEqual({ kind: 'committed' });
  const first = (await store.readDetached('run', 'session'))!;
  expect(first.body).toEqual({ nested: { value: 'original' } });
  (first.body['nested'] as { value: string }).value = 'reader changed';
  await store.close();
  await expect(store.read('run', 'session')).rejects.toThrow('ownership unavailable');
  const reopened = await openSessionStore({ directory });
  expect((await reopened.read('run', 'session'))?.body).toEqual({ nested: { value: 'original' } });
  await reopened.close();
});

test('a competing multi-record CAS publishes all records or none across shared adapters', async () => {
  const directory = '/workflow-fixture/session-store';
  const first = await openSessionStore({ directory });
  const second = await openSessionStore({ directory });
  const input = { runId: 'run', expected: [{ id: 'a', revision: null }, { id: 'b', revision: null }], records: [record('a', 1, { value: 'A' }), record('b', 1, { value: 'B' })], payloads: [] };
  expect((await Promise.all([first.commit(input), second.commit(input)])).map(result => result.kind)).toEqual(['committed', 'conflict']);
  expect((await second.read('run', 'b'))?.body).toEqual({ value: 'B' });
  expect((await first.commit({ ...input, expected: [{ id: 'a', revision: 1 }, { id: 'b', revision: null }], records: [record('a', 2, { value: 'changed' }), record('b', 2, { value: 'changed' })] })).kind).toBe('conflict');
  expect((await first.read('run', 'a'))?.body).toEqual({ value: 'A' });
  expect(await first.read('other-run', 'a')).toBeNull();
  await first.close(); await second.close();
});

test('payloads are copied in both directions and missing payloads cannot publish records', async () => {
  const store = await openSessionStore({ directory: '/workflow-fixture/session-store' });
  const bytes = new Uint8Array([1, 2]);
  const id = await store.putPayload(bytes); bytes[0] = 9;
  const returned = (await store.getPayload(id))!; returned[0] = 8;
  expect(await store.getPayload(id)).toEqual(new Uint8Array([1, 2]));
  await expect(store.commit({ runId: 'run', expected: [{ id: 'a', revision: null }], records: [record('a', 1, {})], payloads: ['missing'] })).rejects.toThrow('Missing committed payload');
  expect(await store.read('run', 'a')).toBeNull();
  await store.close();
});
