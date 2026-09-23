import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { GuardedCall, SettledMutation, ToolDefinition } from '../interfaces/port.js';
import { createScriptedAgent } from '../scripted.js';
import { probeSpec } from './helpers/spec.js';

/*
 * Every `tool-started` carries a neutral action. The scripted fake takes it
 * from its script, from a harness tool's declaration, or classifies the
 * port's own names itself, as an implementation classifies its own tools.
 * The guard and the after-mutation hook are told the same action.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'scripted-actions-'));
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

describe('the scripted fake\'s actions', () => {
  test('it classifies the port\'s own names from the input they take', async () => {
    const agent = createScriptedAgent([
      { kind: 'tool', tool: 'read', input: { path: 'a.ts' } },
      { kind: 'tool', tool: 'read', input: { path: 'a.ts', offset: 5, limit: 10 } },
      { kind: 'tool', tool: 'read', input: {} },
      { kind: 'tool', tool: 'grep', input: { pattern: 'x', path: 'src', glob: '*.ts' } },
      { kind: 'tool', tool: 'ls', input: {} },
      { kind: 'end' },
    ]);
    const probe = probeSpec({ builtinTools: ['read', 'grep', 'ls'] });
    await agent.startSession(probe.spec).outcome;
    expect(probe.events.flatMap(event => (event.type === 'tool-started' ? [event.action] : []))).toEqual([
      { kind: 'read', path: 'a.ts', range: null },
      { kind: 'read', path: 'a.ts', range: { start: 5, count: 10 } },
      // A read that names no file reads nothing the harness could record.
      { kind: 'other' },
      { kind: 'search', pattern: 'x', path: 'src', glob: '*.ts' },
      { kind: 'search', pattern: null, path: null, glob: null },
    ]);
  });

  test('a harness tool declares its action, an undeclared one is a harness action, and so is the submission', async () => {
    const run: ToolDefinition = {
      name: 'run', description: 'Runs a command', inputSchema: { type: 'object' },
      action: input => ({ kind: 'command', command: (input as { line: string }).line }),
      execute: async () => ({ text: 'ran' }),
    };
    const echo: ToolDefinition = {
      name: 'echo', description: 'Echoes', inputSchema: { type: 'object' }, execute: async input => ({ text: JSON.stringify(input) }),
    };
    const agent = createScriptedAgent([
      { kind: 'tool', tool: 'run', input: { line: 'npm test' } },
      { kind: 'tool', tool: 'echo', input: { command: 'not a command' } },
      { kind: 'tool', tool: 'echo', input: {}, action: { kind: 'other' } },
      { kind: 'submit', input: 'done' },
    ]);
    const probe = probeSpec({ tools: [run, echo] });
    await agent.startSession(probe.spec).outcome;
    expect(probe.events.flatMap(event => (event.type === 'tool-started' ? [[event.tool, event.action]] : []))).toEqual([
      ['run', { kind: 'command', command: 'npm test' }],
      ['echo', { kind: 'harness' }],
      // The script's own action wins over the declaration.
      ['echo', { kind: 'other' }],
      ['submit', { kind: 'harness' }],
    ]);
  });

  test('an executor naming its tools otherwise is enabled, guarded and hooked by the action its script gives', async () => {
    const workingDirectory = await directory();
    const guarded: GuardedCall[] = [];
    const settled: SettledMutation[] = [];
    const agent = createScriptedAgent([
      { kind: 'tool', tool: 'Read', input: { file_path: 'a.ts' }, action: { kind: 'read', path: 'a.ts', range: null } },
      {
        kind: 'tool', tool: 'CreateFile', input: { file_path: 'made.ts', content: 'export const made = 1;\n' },
        action: { kind: 'write', paths: ['made.ts'] },
      },
      // The port's own name is not this executor's tool.
      { kind: 'tool', tool: 'read', input: { path: 'a.ts' } },
      { kind: 'end' },
    ], { toolNames: { read: 'Read', write: 'CreateFile' } });
    const probe = probeSpec({ workingDirectory, builtinTools: ['read', 'write'] });
    await agent.startSession({
      ...probe.spec,
      guard: async call => { guarded.push(call); return { allow: true }; },
      afterMutation: async call => { settled.push(call); return null; },
    }).outcome;

    const started = probe.events.filter(event => event.type === 'tool-started');
    expect(started.map(event => [event.tool, event.mutating])).toEqual([['Read', false], ['CreateFile', true], ['read', false]]);
    expect(agent.sessions[0]!.results.map(result => [result.tool, result.isError])).toEqual([
      ['Read', false], ['CreateFile', false], ['read', true],
    ]);
    expect(guarded.map(call => [call.tool, call.action])).toEqual([['CreateFile', { kind: 'write', paths: ['made.ts'] }]]);
    expect(settled.map(call => [call.tool, call.action, call.failed])).toEqual([['CreateFile', { kind: 'write', paths: ['made.ts'] }, false]]);
    // The write went to the path its action named.
    expect(await readFile(join(workingDirectory, 'made.ts'), 'utf8')).toBe('export const made = 1;\n');
  });

  test('a renamed tool the spec did not enable is not found, and writes nothing', async () => {
    const workingDirectory = await directory();
    const agent = createScriptedAgent([
      {
        kind: 'tool', tool: 'CreateFile', input: { file_path: 'made.ts', content: 'x' },
        action: { kind: 'write', paths: ['made.ts'] }, mutating: false,
      },
      { kind: 'end' },
    ], { toolNames: { write: 'CreateFile' } });
    const probe = probeSpec({ workingDirectory, builtinTools: ['read'] });
    await agent.startSession(probe.spec).outcome;
    expect(agent.sessions[0]!.results).toEqual([{ callId: 'call-1', tool: 'CreateFile', text: 'Tool CreateFile not found', isError: true }]);
    expect(existsSync(join(workingDirectory, 'made.ts'))).toBe(false);
  });
});
