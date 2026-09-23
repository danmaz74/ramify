import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { ToolDefinition } from '../../../../src/interfaces/port.js';
import { builtinAction, createPiAgentOn } from '../pi-agent.js';
import { startPi, validMap } from './helpers/session.js';
import { call, calls } from './helpers/scripted-provider.js';

/*
 * The adapter classifies pi's own tools as neutral actions, from pi's names
 * and inputs, and takes a harness tool's action from its declaration. This
 * is the one place pi's tool and argument names are read; the events, the
 * guard and the after-mutation hook carry the action.
 */

beforeAll(() => { process.env.PI_OFFLINE = '1'; });

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe('pi\'s tools as actions', () => {
  test('each of pi\'s read, search and write tools, by its own input names', () => {
    expect(builtinAction('read', { path: 'a.ts' })).toEqual({ kind: 'read', path: 'a.ts', range: null });
    expect(builtinAction('read', { path: 'a.ts', offset: 40, limit: 20 })).toEqual({ kind: 'read', path: 'a.ts', range: { start: 40, count: 20 } });
    expect(builtinAction('read', { path: 'a.ts', limit: 20 })).toEqual({ kind: 'read', path: 'a.ts', range: { start: null, count: 20 } });
    expect(builtinAction('grep', { pattern: 'x', path: 'src', glob: '*.ts', ignoreCase: true }))
      .toEqual({ kind: 'search', pattern: 'x', path: 'src', glob: '*.ts' });
    expect(builtinAction('find', { pattern: '*.ts' })).toEqual({ kind: 'search', pattern: '*.ts', path: null, glob: null });
    expect(builtinAction('ls', { path: 'src' })).toEqual({ kind: 'search', pattern: null, path: 'src', glob: null });
    expect(builtinAction('edit', { path: 'a.ts', edits: [] })).toEqual({ kind: 'write', paths: ['a.ts'] });
    expect(builtinAction('write', { path: 'b.ts', content: '' })).toEqual({ kind: 'write', paths: ['b.ts'] });
  });

  test('a call that names no path, another executor\'s names and an unknown tool are not guessed at', () => {
    expect(builtinAction('read', {})).toEqual({ kind: 'other' });
    expect(builtinAction('write', { content: 'x' })).toEqual({ kind: 'write', paths: [] });
    // `file_path` is not pi's argument, so it is not read as one.
    expect(builtinAction('read', { file_path: 'a.ts' })).toEqual({ kind: 'other' });
    expect(builtinAction('Read', { path: 'a.ts' })).toEqual({ kind: 'other' });
    expect(builtinAction('bash', { command: 'ls' })).toEqual({ kind: 'other' });
    expect(builtinAction('read', null)).toEqual({ kind: 'other' });
  });

  test('the events, the guard and the hook carry the action of each call', async () => {
    const run: ToolDefinition = {
      name: 'run', description: 'Runs a command', mutating: true,
      inputSchema: { type: 'object', properties: { line: { type: 'string' } }, required: ['line'] },
      action: input => ({ kind: 'command', command: (input as { line: string }).line }),
      execute: async () => ({ text: 'ran' }),
    };
    const harness = await startPi(cleanups, [
      calls(
        { type: 'toolCall', name: 'read', arguments: { path: 'module.ramify', offset: 1, limit: 2 }, id: 'c-read' },
        { type: 'toolCall', name: 'ls', arguments: {}, id: 'c-ls' },
      ),
      call('write', { path: 'made.ts', content: 'export const made = 1;\n' }, 'c-write'),
      call('run', { line: 'npm test' }, 'c-run'),
      call('submit_implementation_map', validMap, 'c-submit'),
    ], { builtinTools: ['read', 'ls', 'write'], tools: [run], guard: true, hookCheck: 'checked' });
    await expect(harness.session.outcome).resolves.toMatchObject({ kind: 'submitted' });

    expect(harness.events.flatMap(event => (event.type === 'tool-started' ? [[event.callId, event.action]] : []))).toEqual([
      ['c-read', { kind: 'read', path: 'module.ramify', range: { start: 1, count: 2 } }],
      ['c-ls', { kind: 'search', pattern: null, path: null, glob: null }],
      ['c-write', { kind: 'write', paths: ['made.ts'] }],
      ['c-run', { kind: 'command', command: 'npm test' }],
      ['c-submit', { kind: 'harness' }],
    ]);
    expect(harness.guarded.map(guarded => [guarded.callId, guarded.action])).toEqual([
      ['c-write', { kind: 'write', paths: ['made.ts'] }],
      ['c-run', { kind: 'command', command: 'npm test' }],
    ]);
    expect(harness.settledMutations.map(settled => [settled.callId, settled.action])).toEqual([
      ['c-write', { kind: 'write', paths: ['made.ts'] }],
      ['c-run', { kind: 'command', command: 'npm test' }],
    ]);
  });

  test('pi declares everything the port asks of an executor', () => {
    const agent = createPiAgentOn({ agentDirectory: '/nonexistent', runtime: () => Promise.reject(new Error('not used')) });
    expect(Object.entries(agent.support).filter(([, entry]) => !entry.available)).toEqual([]);
    expect(Object.keys(agent.support).sort()).toEqual([
      'afterMutation', 'appendContext', 'compaction', 'context', 'continue', 'exactSystemPrompt',
      'fork', 'forkAtPoint', 'guard', 'usage',
    ]);
  });
});
