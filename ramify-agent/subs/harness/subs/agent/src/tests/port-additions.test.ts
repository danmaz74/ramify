import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { ToolDefinition } from '../interfaces/port.js';
import { createScriptedAgent } from '../scripted.js';
import { probeSpec } from './helpers/spec.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/*
 * The scripted fake's parity with the port additions: session modes,
 * appended context, the guard and the after-mutation hook, the write
 * built-ins, settlement and the context budget. The harness's own tests run
 * against this fake, so every one of these must be reachable without pi.
 */

const window = 40_000;

describe('session modes', () => {
  test('a fresh session reports the mode that was actual', () => {
    const agent = createScriptedAgent([{ kind: 'end' }]);
    const session = agent.startSession(probeSpec().spec);
    expect(session.start).toEqual({ mode: 'fresh' });
    expect(session.ref).not.toBe('');
  });

  test('a continue starts from the session the ref names', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }]);
    const first = agent.startSession(probeSpec().spec);
    await first.outcome;
    const appended = await agent.appendContext(first.ref, 'decision-1', 'The local architect assigned iteration two.');
    expect(appended).toMatchObject({ outcome: 'appended' });

    const resumed = agent.startSession(probeSpec({ session: { mode: 'continue', ref: first.ref } }).spec);
    expect(resumed.start).toEqual({ mode: 'continue' });
    expect(agent.sessions[1]!.inherited).toEqual(['The local architect assigned iteration two.']);
  });

  test('a fork starts from the parent\'s point and does not carry the parent\'s later entries', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }]);
    const parent = agent.startSession(probeSpec().spec);
    await parent.outcome;
    const first = await agent.appendContext(parent.ref, 'brief-1', 'ALPHA');
    expect(first.outcome).toBe('appended');
    const point = 'ref' in first ? first.ref : parent.ref;
    await agent.appendContext(parent.ref, 'brief-2', 'BETA');

    const fork = agent.startSession(probeSpec({ session: { mode: 'fork', from: point } }).spec);
    expect(fork.start).toEqual({ mode: 'fork' });
    expect(agent.sessions[1]!.inherited).toEqual(['ALPHA']);

    // The parent is untouched: a session continuing it still holds both.
    agent.startSession(probeSpec({ session: { mode: 'continue', ref: parent.ref } }).spec);
    expect(agent.sessions[2]!.inherited).toEqual(['ALPHA', 'BETA']);
  });

  test('a mode that degraded says why, so a fork that became fresh cannot pass for one', () => {
    const agent = createScriptedAgent([{ kind: 'end' }]);
    const forked = agent.startSession(probeSpec({ session: { mode: 'fork', from: 'gone@0#0' } }).spec);
    expect(forked.start.mode).toBe('fresh');
    expect(forked.start.degradedReason).toContain('gone@0#0');

    const resumed = agent.startSession(probeSpec({ session: { mode: 'continue', ref: 'gone@0#0' } }).spec);
    expect(resumed.start).toMatchObject({ mode: 'fresh' });
    expect(resumed.start.degradedReason).not.toBeUndefined();
  });
});

describe('appendContext', () => {
  test('a repeated key answers already-present and adds nothing', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }]);
    const session = agent.startSession(probeSpec().spec);
    await session.outcome;
    expect(await agent.appendContext(session.ref, 'decision-7', 'once')).toMatchObject({ outcome: 'appended' });
    expect(await agent.appendContext(session.ref, 'decision-7', 'once')).toMatchObject({ outcome: 'already-present' });
    expect(await agent.appendContext(session.ref, 'decision-8', 'twice')).toMatchObject({ outcome: 'appended' });

    agent.startSession(probeSpec({ session: { mode: 'continue', ref: session.ref } }).spec);
    expect(agent.sessions[1]!.inherited).toEqual(['once', 'twice']);
  });

  test('a lost session answers session-lost and no ref', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }]);
    expect(await agent.appendContext('no-such-session@3#1', 'decision-1', 'text')).toEqual({ outcome: 'session-lost' });
  });

  test('an append causes no model activity', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }]);
    const probe = probeSpec();
    const session = agent.startSession(probe.spec);
    await session.outcome;
    const before = probe.events.length;
    await agent.appendContext(session.ref, 'decision-1', 'text');
    expect(probe.events.length).toBe(before);
  });
});

describe('the guard and the after-mutation hook', () => {
  test('a denial becomes the call\'s error result, nothing runs, and afterMutation is not called for it', async () => {
    const agent = createScriptedAgent([
      { kind: 'tool', tool: 'write', input: { path: 'outside/blocked.txt' } },
      { kind: 'tool', tool: 'edit', input: { path: 'guarded.ts' } },
      { kind: 'tool', tool: 'write', input: { path: 'allowed.ts' } },
      { kind: 'end' },
    ]);
    // The write built-ins really write, so the session needs a real
    // directory: a call the guard allows changes the tree, and one it denies
    // leaves it as it was.
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-port-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'guarded.ts'), 'original\n');
    const probe = probeSpec({
      workingDirectory: directory,
      deny: { edit: 'The write scope does not contain guarded.ts.' },
      hookCheck: 'RAMIFY-HOOK-CHECK: ramify check --changed reported no new finding.',
    });
    await agent.startSession(probe.spec).outcome;

    expect(probe.guarded.map(call => call.tool)).toEqual(['write', 'edit', 'write']);
    const record = agent.sessions[0]!;
    expect(record.denied).toHaveLength(1);
    // The denial reached the agent as that call's error result.
    expect(record.results.map(result => [result.tool, result.isError])).toEqual([['write', false], ['edit', true], ['write', false]]);
    expect(record.results[1]!.text).toBe('The write scope does not contain guarded.ts.');
    // afterMutation ran for the two calls that executed, and not for the denied one.
    expect(probe.settledMutations).toEqual([{ tool: 'write', failed: false }, { tool: 'write', failed: false }]);
    expect(record.results[0]!.text).toContain('RAMIFY-HOOK-CHECK');
    expect(record.results[1]!.text).not.toContain('RAMIFY-HOOK-CHECK');
    // The denied edit changed nothing; the two writes the guard allowed did.
    expect(await readFile(join(directory, 'guarded.ts'), 'utf8')).toBe('original\n');
    expect(existsSync(join(directory, 'outside', 'blocked.txt'))).toBe(true);
    expect(existsSync(join(directory, 'allowed.ts'))).toBe(true);
  });

  test('afterMutation runs for a mutating tool that failed, and its text reaches the agent', async () => {
    const failing: ToolDefinition = {
      name: 'apply_patch', description: 'Applies a patch', inputSchema: { type: 'object' }, mutating: true,
      execute: async () => ({ text: 'The patch did not apply.', isError: true }),
    };
    const agent = createScriptedAgent([{ kind: 'tool', tool: 'apply_patch', input: {} }, { kind: 'end' }]);
    const probe = probeSpec({ tools: [failing], guard: true, hookCheck: 'RAMIFY-HOOK-CHECK: one new finding.' });
    await agent.startSession(probe.spec).outcome;
    expect(probe.guarded).toEqual([{ tool: 'apply_patch', input: {} }]);
    expect(probe.settledMutations).toEqual([{ tool: 'apply_patch', failed: true }]);
    expect(agent.sessions[0]!.results[0]!.text).toBe('The patch did not apply.\nRAMIFY-HOOK-CHECK: one new finding.');
  });

  test('a read is not guarded, and a tool declares its own mutation', async () => {
    const agent = createScriptedAgent([
      { kind: 'tool', tool: 'read', input: { path: 'a.ts' } },
      { kind: 'tool', tool: 'echo', input: {} },
      { kind: 'end' },
    ]);
    const probe = probeSpec({ guard: true, hookCheck: 'checked' });
    await agent.startSession(probe.spec).outcome;
    expect(probe.guarded).toEqual([]);
    expect(probe.settledMutations).toEqual([]);
    expect(probe.events.filter(event => event.type === 'tool-started').map(event => event.mutating)).toEqual([false, false]);
  });

  test('the write built-ins are mutating and the read ones are not', async () => {
    const agent = createScriptedAgent([
      { kind: 'tool', tool: 'edit', input: {} },
      { kind: 'tool', tool: 'write', input: {} },
      { kind: 'tool', tool: 'grep', input: {} },
      { kind: 'end' },
    ]);
    const probe = probeSpec();
    await agent.startSession(probe.spec).outcome;
    expect(probe.events.filter(event => event.type === 'tool-started').map(event => [event.tool, event.mutating]))
      .toEqual([['edit', true], ['write', true], ['grep', false]]);
  });
});

describe('rejected input', () => {
  test('a call the implementation rejected before the tool ran is reported with reachedTool false', async () => {
    const agent = createScriptedAgent([
      { kind: 'tool', tool: 'echo', input: { bad: true }, reachedTool: false },
      { kind: 'tool', tool: 'echo', input: { ok: true } },
      { kind: 'submit', input: 'done' },
    ]);
    const probe = probeSpec();
    await agent.startSession(probe.spec).outcome;
    expect(probe.events.filter(event => event.type === 'tool-finished').map(event => [event.tool, event.reachedTool, event.isError]))
      .toEqual([['echo', false, true], ['echo', true, false], ['submit', true, false]]);
  });

  test('a call the guard denied still passed the implementation\'s validation', async () => {
    const agent = createScriptedAgent([{ kind: 'tool', tool: 'write', input: {} }, { kind: 'end' }]);
    const probe = probeSpec({ deny: { write: 'Not in scope.' } });
    await agent.startSession(probe.spec).outcome;
    const finished = probe.events.filter(event => event.type === 'tool-finished');
    expect(finished).toEqual([{ type: 'tool-finished', callId: 'call-1', tool: 'write', isError: true, errorText: 'Not in scope.', reachedTool: true }]);
  });
});

describe('the context budget', () => {
  const policy = { compaction: 'forbidden' as const, budgetTokens: null, budgetFraction: 0.7, reportReserveTokens: 4_000 };

  test('reaching the budget disables the tools, allows one final response and ends the session', async () => {
    const agent = createScriptedAgent([
      { kind: 'message', text: 'working' },
      { kind: 'context', tokens: 10_000, window },
      { kind: 'tool', tool: 'read', input: { path: 'a.ts' } },
      { kind: 'context', tokens: 24_500, window },
      { kind: 'tool', tool: 'write', input: { path: 'b.ts' } },
      { kind: 'message', text: 'Here is my partial report: iteration two is half done.' },
      { kind: 'submit', input: 'never reached' },
    ]);
    const probe = probeSpec({ context: policy });
    expect(await agent.startSession(probe.spec).outcome).toEqual({
      kind: 'context-budget-reached', tokens: 24_500,
      report: 'Here is my partial report: iteration two is half done.',
    });
    // One tool ran before the budget; the write after it did not, and the
    // final response ended the session before the submission could be tried.
    expect(probe.events.filter(event => event.type === 'tool-started').map(event => event.tool)).toEqual(['read']);
    expect(agent.sessions[0]!.refusedAfterBudget).toBe(1);
    expect(probe.judged).toEqual([]);
    // A forbidden role reaches its budget without compacting.
    expect(probe.events.filter(event => event.type === 'compaction')).toEqual([]);
  });

  test('a session under its budget ends as it otherwise would', async () => {
    const agent = createScriptedAgent([
      { kind: 'context', tokens: 20_000, window },
      { kind: 'submit', input: 'done' },
    ]);
    const probe = probeSpec({ context: policy });
    expect(await agent.startSession(probe.spec).outcome).toEqual({ kind: 'submitted', input: 'done' });
  });

  test('the budget still ends the session when no final response follows', async () => {
    const agent = createScriptedAgent([{ kind: 'context', tokens: 39_000, window }]);
    const probe = probeSpec({ context: policy });
    expect(await agent.startSession(probe.spec).outcome).toEqual({ kind: 'context-budget-reached', tokens: 39_000, report: undefined });
  });
});

describe('settlement', () => {
  test('a session that ended is settled', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }], { settleMs: 50 });
    const session = agent.startSession(probeSpec().spec);
    expect(await session.settled()).toBe('settled');
  });

  test('a session that never settles answers timed-out, which is not settlement', async () => {
    const agent = createScriptedAgent([{ kind: 'hang' }], { settleMs: 30 });
    const session = agent.startSession(probeSpec().spec);
    expect(await session.settled()).toBe('timed-out');
  });
});

describe('the ref', () => {
  test('advances as the session runs, so a ref names a point and not a session', async () => {
    const agent = createScriptedAgent([{ kind: 'message', text: 'one' }, { kind: 'wait', ms: 5 }, { kind: 'message', text: 'two' }, { kind: 'end' }]);
    const session = agent.startSession(probeSpec().spec);
    const before = session.ref;
    await session.outcome;
    expect(session.ref).not.toBe(before);
  });
});
