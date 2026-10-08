import { afterEach, beforeAll, expect, test } from 'vitest';
import { builtinAction } from '../pi-agent.js';
import { nativeCall, preservingPi } from './helpers/session.js';
const cleanups: Array<() => Promise<void>> = [];
beforeAll(() => { process.env.PI_OFFLINE = '1'; });
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
test('Pi action descriptions use exact declared tool inputs rather than guesses', () => {
  expect(builtinAction('read', { path: 'a.ts', offset: 2, limit: 4 })).toEqual({ kind: 'read', path: 'a.ts', range: { start: 2, count: 4 } });
  expect(builtinAction('grep', { pattern: 'x', path: 'src', glob: '*.ts' })).toEqual({ kind: 'search', pattern: 'x', path: 'src', glob: '*.ts' });
  expect(builtinAction('write', { path: 'a.ts' })).toEqual({ kind: 'write', paths: ['a.ts'] }); expect(builtinAction('Read', { path: 'a.ts' })).toEqual({ kind: 'other' });
});
test('current events and guard share the declared write action and no shell is offered', async () => {
  const f = await preservingPi(cleanups, [[nativeCall('write', { path: 'a.ts', content: 'a' })], [nativeCall('submit_map', { summary: 'Denied' })]], { builtins: ['write'] }); const actions: unknown[] = [];
  const bindings = { ...f.bindings, guard: async (call: { action: unknown }) => { actions.push(call.action); return { allow: false as const, text: 'Denied' }; } };
  await (await f.operations.continue(f.input(undefined, 'actions', bindings))).settled();
  expect(actions).toEqual([{ kind: 'write', paths: ['a.ts'] }]); expect(f.events.find(event => event.type === 'tool-started' && event.tool === 'write')).toMatchObject({ action: actions[0], mutating: true });
  expect((f.native.requests[0]!['tools'] as Array<{ name: string }>).map(tool => tool.name)).not.toContain('bash'); f.native.verify();
});
