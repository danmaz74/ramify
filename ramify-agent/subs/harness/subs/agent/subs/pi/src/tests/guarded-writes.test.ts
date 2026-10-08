import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { nativeCall, preservingPi } from './helpers/session.js';
const cleanups: Array<() => Promise<void>> = [];
beforeAll(() => { process.env.PI_OFFLINE = '1'; });
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
describe('current preserving-operation write guards', () => {
  test('a denied edit writes nothing, executes no mutation hook and its reason reaches the model', async () => {
    const f = await preservingPi(cleanups, [[nativeCall('edit', { path: 'owned.ts', edits: [{ oldText: 'before', newText: 'after' }] })], [nativeCall('submit_map', { summary: 'Stopped edit' })]], { builtins: ['edit'], files: { 'owned.ts': 'before' } }); let hooks = 0; let guards = 0;
    const bindings = { ...f.bindings, guard: async () => { guards++; return { allow: false as const, text: 'Current scope denies edit.' }; }, afterMutation: async () => { hooks++; return null; } };
    await (await f.operations.continue(f.input(undefined, 'guarded', bindings))).settled();
    expect(await readFile(join(f.workingDirectory, 'owned.ts'), 'utf8')).toBe('before'); expect([guards, hooks]).toEqual([1, 0]); expect(JSON.stringify(f.native.requests[1]!['input'])).toContain('Current scope denies edit.'); f.native.verify();
  });
  test('an allowed write runs its settled mutation hook and returns its evidence to the model', async () => {
    const f = await preservingPi(cleanups, [[nativeCall('write', { path: 'owned.ts', content: 'after' })], [nativeCall('submit_map', { summary: 'Wrote' })]], { builtins: ['write'] }); let hooks = 0;
    const bindings = { ...f.bindings, guard: async () => ({ allow: true as const }), afterMutation: async (call: { failed: boolean }) => { expect(call.failed).toBe(false); hooks++; return { text: 'Verified current candidate' }; } };
    await (await f.operations.continue(f.input(undefined, 'allowed', bindings))).settled();
    expect(await readFile(join(f.workingDirectory, 'owned.ts'), 'utf8')).toBe('after'); expect(hooks).toBe(1); expect(JSON.stringify(f.native.requests[1]!['input'])).toContain('Verified current candidate'); f.native.verify();
  });
  test('an admitted failed custom mutation reaches its hook while a denied mutation does not', async () => {
    const f = await preservingPi(cleanups, [[nativeCall('mutate', {})], [nativeCall('submit_map', { summary: 'Failed mutation' })]], { tools: [{ name: 'mutate', description: 'Mutate', inputSchema: {}, mutating: true, execute: async () => ({ text: 'Actual mutation failed', isError: true }) }] }); const failures: boolean[] = [];
    const bindings = { ...f.bindings, afterMutation: async (call: { failed: boolean }) => { failures.push(call.failed); return null; } };
    await (await f.operations.continue(f.input(undefined, 'failed-mutation', bindings))).settled(); expect(failures).toEqual([true]); f.native.verify();
  });
});
