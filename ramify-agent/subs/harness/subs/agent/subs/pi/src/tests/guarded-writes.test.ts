import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { ToolDefinition } from '../../../../src/interfaces/port.js';
import { startPi, until, validMap } from './helpers/session.js';
import { call, calls, text } from './helpers/scripted-provider.js';

/*
 * The write built-ins, the guard and the after-mutation hook through the
 * real pi adapter. A denied call writes nothing, its reason reaches the
 * model as that call's error result, and the session continues.
 */

beforeAll(() => { process.env.PI_OFFLINE = '1'; });

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const writers = ['read', 'edit', 'write'] as const;

describe('the write built-ins and the guard', () => {
  test('a denied edit returns a useful error result and writes nothing', async () => {
    const harness = await startPi(cleanups, [
      call('write', { path: 'outside/blocked.txt', content: 'must not appear' }, 'c-write-denied'),
      call('edit', { path: 'guarded.ts', edits: [{ oldText: 'original', newText: 'tampered' }] }, 'c-edit-denied'),
      call('write', { path: 'allowed.ts', content: 'export const ok = 1;\n' }, 'c-write-allowed'),
      call('submit_implementation_map', validMap, 'c-submit'),
    ], {
      builtinTools: [...writers],
      files: { 'guarded.ts': 'original\n' },
      deny: {
        write: 'The write scope does not contain outside/blocked.txt. Report the need; do not widen the scope yourself.',
        edit: 'The write scope does not contain guarded.ts. Report the need; do not widen the scope yourself.',
      },
    });
    await expect(harness.session.outcome).resolves.toMatchObject({ kind: 'submitted' });

    // Nothing the guard denied was written.
    expect(existsSync(join(harness.workingDirectory, 'outside', 'blocked.txt'))).toBe(false);
    expect(readFileSync(join(harness.workingDirectory, 'guarded.ts'), 'utf8')).toBe('original\n');
    // The reason reached the model as the call's error result, and the session went on.
    const sent = harness.requestText(harness.scripted.requests.length - 1);
    expect(sent).toContain('The write scope does not contain guarded.ts');
    expect(harness.events).toContainEqual(expect.objectContaining({ type: 'tool-finished', callId: 'c-edit-denied', isError: true }));
    expect(harness.guarded.map(guarded => guarded.tool)).toEqual(['write', 'edit', 'write']);
  });

  test('a call the guard allows runs, and the hook check reaches the agent', async () => {
    const harness = await startPi(cleanups, [
      call('write', { path: 'allowed.ts', content: 'export const ok = 1;\n' }, 'c-1'),
      call('submit_implementation_map', validMap, 'c-2'),
    ], {
      builtinTools: [...writers],
      guard: true,
      hookCheck: 'RAMIFY-HOOK-CHECK: ramify check --changed reported 1 new finding.',
    });
    await expect(harness.session.outcome).resolves.toMatchObject({ kind: 'submitted' });
    expect(readFileSync(join(harness.workingDirectory, 'allowed.ts'), 'utf8')).toBe('export const ok = 1;\n');
    expect(harness.settledMutations).toEqual([{ callId: 'c-1', tool: 'write', failed: false }]);
    expect(harness.requestText(1)).toContain('RAMIFY-HOOK-CHECK');
  });

  test('afterMutation sees a mutating call that failed, and never a call the guard denied', async () => {
    const harness = await startPi(cleanups, [
      call('write', { path: 'a-directory', content: 'cannot be written' }, 'c-failing'),
      call('write', { path: 'outside/blocked.txt', content: 'must not appear' }, 'c-denied'),
      call('submit_implementation_map', validMap, 'c-submit'),
    ], {
      builtinTools: [...writers],
      files: { 'a-directory': '' },
      deny: { write: 'Denied.' },
      hookCheck: 'RAMIFY-HOOK-CHECK: observed.',
    });
    await harness.session.outcome;
    // Both writes were denied by this guard, so nothing executed and the hook never fired.
    expect(harness.settledMutations).toEqual([]);
    expect(harness.guarded.map(guarded => guarded.callId)).toEqual(['c-failing', 'c-denied']);
  });

  test('a mutating tool that failed on its own still reaches afterMutation', async () => {
    const harness = await startPi(cleanups, [
      call('write', { path: 'a-directory/impossible', content: 'x' }, 'c-1'),
      call('submit_implementation_map', validMap, 'c-2'),
    ], {
      builtinTools: [...writers],
      files: { 'a-directory': 'this is a file, so a path beneath it cannot be written' },
      guard: true,
      hookCheck: 'RAMIFY-HOOK-CHECK: the tree is dirty.',
    });
    await harness.session.outcome;
    expect(harness.settledMutations).toEqual([{ callId: 'c-1', tool: 'write', failed: true }]);
    const finished = harness.events.filter(event => event.type === 'tool-finished' && event.callId === 'c-1');
    expect(finished[0]).toMatchObject({ isError: true, reachedTool: true });
  });

  test('a harness tool declares its own mutation, and the shell is never offered', async () => {
    const applied: unknown[] = [];
    const patcher: ToolDefinition = {
      name: 'apply_patch', description: 'Applies a patch', mutating: true,
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
      execute: async input => { applied.push(input); return { text: 'applied' }; },
    };
    const harness = await startPi(cleanups, [
      call('apply_patch', { path: 'a.ts' }, 'c-1'),
      call('bash', { command: 'rm -rf /' }, 'c-shell'),
      call('submit_implementation_map', validMap, 'c-2'),
    ], { builtinTools: [...writers], tools: [patcher], guard: true, hookCheck: 'RAMIFY-HOOK-CHECK: checked.' });
    await harness.session.outcome;

    expect(applied).toEqual([{ path: 'a.ts' }]);
    expect(harness.guarded.map(guarded => guarded.tool)).toEqual(['apply_patch']);
    expect(harness.settledMutations).toEqual([{ callId: 'c-1', tool: 'apply_patch', failed: false }]);
    // pi's own shell is withheld: it is not offered and the call has no effect.
    expect(harness.toolNames(0)).not.toContain('bash');
    expect(harness.events).toContainEqual(expect.objectContaining({ type: 'tool-finished', callId: 'c-shell', isError: true }));
    expect(harness.events.filter(event => event.type === 'tool-started').map(event => [event.tool, event.mutating]))
      .toEqual([['apply_patch', true], ['bash', false], ['submit_implementation_map', false]]);
  });
});

describe('input pi rejected before the tool ran', () => {
  const strict: ToolDefinition = {
    name: 'run_scope_tests', description: 'Runs the scoped tests',
    inputSchema: { type: 'object', properties: { suite: { type: 'string' }, retries: { type: 'number' } }, required: ['suite'], additionalProperties: false },
    execute: async () => ({ text: 'ran' }),
  };

  test('is reported with reachedTool false, so every rejection is counted', async () => {
    const harness = await startPi(cleanups, [
      call('run_scope_tests', { retries: 'two' }, 'c-invalid'),
      call('run_scope_tests', { suite: 'unit' }, 'c-valid'),
      call('submit_implementation_map', validMap, 'c-submit'),
    ], { tools: [strict] });
    await expect(harness.session.outcome).resolves.toMatchObject({ kind: 'submitted' });
    const finished = harness.events.filter(event => event.type === 'tool-finished');
    expect(finished.map(event => [event.callId, event.isError, event.reachedTool])).toEqual([
      ['c-invalid', true, false],
      ['c-valid', false, true],
      ['c-submit', false, true],
    ]);
    // The model was told, so it can correct itself in the same session.
    expect(harness.requestText(1)).toContain('Validation failed');
  });

  test('the submission tool keeps the permissive schema, so every submission is the harness\'s to judge', async () => {
    const harness = await startPi(cleanups, [
      call('submit_implementation_map', { kind: 'nonsense' }, 'c-1'),
      call('submit_implementation_map', validMap, 'c-2'),
    ], { verdicts: [{ accepted: false, errors: ['summary: required'] }, { accepted: true }] });
    await expect(harness.session.outcome).resolves.toMatchObject({ kind: 'submitted' });
    // Both calls reached the harness; none was rejected by pi.
    expect(harness.judged).toEqual([{ kind: 'nonsense' }, validMap]);
    expect(harness.events.filter(event => event.type === 'tool-finished').map(event => event.reachedTool)).toEqual([true, true]);
  });
});

describe('settlement', () => {
  test('a session that ended is settled, and settlement is pi\'s belief only', async () => {
    const harness = await startPi(cleanups, [call('submit_implementation_map', validMap)]);
    await harness.session.outcome;
    expect(await harness.session.settled()).toBe('settled');
  });

  test('a session still waiting on a tool that ignores its signal answers timed-out', async () => {
    const stubborn: ToolDefinition = {
      name: 'slow', description: 'Ignores abort', inputSchema: { type: 'object' },
      execute: () => new Promise(resolve => setTimeout(() => resolve({ text: 'done' }), 1_500)),
    };
    const harness = await startPi(cleanups, [
      calls({ type: 'toolCall', name: 'slow', arguments: {}, id: 'c-1' }),
      text('finished late'),
    ], { tools: [stubborn], settleMs: 100 });
    await until(() => harness.events.some(event => event.type === 'tool-started'));
    expect(await harness.session.settled()).toBe('timed-out');
    // And once it does end, it settles.
    await harness.session.outcome;
    expect(await harness.session.settled()).toBe('settled');
  }, 20_000);
});
