import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeAll, expect, test } from 'vitest';
import { nativeCall, preservingPi } from './helpers/session.js';
const cleanups: Array<() => Promise<void>> = [];
beforeAll(() => { process.env.PI_OFFLINE = '1'; });
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
for (const role of ['engineer', 'local-architect', 'capability-architect']) test(`${role}: current authority guard denies both edit and write`, async () => {
  const f = await preservingPi(cleanups, [[nativeCall('edit', { path: 'owned.ts', edits: [{ oldText: 'before', newText: 'after' }] }, 'edit'), nativeCall('write', { path: 'owned.ts', content: 'after' }, 'write')], [nativeCall('submit_map', { summary: 'Denied both' })]], { builtins: ['edit', 'write'], files: { 'owned.ts': 'before' } }); const calls: string[] = [];
  const task = { ...f.task, role }; const bindings = { ...f.bindings, task, guard: async (call: { tool: string }) => { calls.push(call.tool); return { allow: false as const, text: 'Current assignment denies mutation' }; } };
  await (await f.operations.continue(f.input(undefined, role, bindings))).settled();
  expect(calls).toEqual(['edit', 'write']); expect(await readFile(join(f.workingDirectory, 'owned.ts'), 'utf8')).toBe('before'); f.native.verify();
});
