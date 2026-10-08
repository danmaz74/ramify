import { invokeProbe, probeOperations } from './helpers/spec.js';
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

describe('preserving session operations', () => {
  test('creates a neutral point and continues the exact appended checkpoint', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }]);
    const first = await invokeProbe(agent, probeSpec().spec); await first.outcome;
    const operations = probeOperations(agent); const point = JSON.parse(first.ref);
    const added = await operations.appendContext({ runId: 'probe', operationId: 'brief-1', sessionId: point.sessionId, expectedPoint: point, additions: [{ key: 'brief-1', kind: 'brief', text: 'ALPHA', revision: '1' }] });
    expect(added.status).toBe('completed');
    const next = await invokeProbe(agent, probeSpec({ session: { mode: 'continue', ref: JSON.stringify(added.point) } }).spec); await next.outcome;
    expect(JSON.parse(next.ref).sessionId).toBe(point.sessionId);
    expect(agent.sessions[1]!.inherited).toContain('ALPHA');
  });
  test('forks the pinned checkpoint while later parent additions stay out of the child', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }]); const parent = await invokeProbe(agent, probeSpec().spec); await parent.outcome;
    const operations = probeOperations(agent); const P = JSON.parse(parent.ref);
    const C1 = await operations.appendContext({ runId: 'probe', operationId: 'brief-a', sessionId: P.sessionId, expectedPoint: P, additions: [{ key: 'a', kind: 'brief', text: 'ALPHA', revision: '1' }] });
    const C2 = await operations.appendContext({ runId: 'probe', operationId: 'brief-b', sessionId: P.sessionId, expectedPoint: C1.point!, additions: [{ key: 'b', kind: 'brief', text: 'BETA', revision: '1' }] });
    const child = await invokeProbe(agent, probeSpec({ session: { mode: 'fork', from: JSON.stringify(C1.point) } }).spec); await child.outcome;
    expect(agent.sessions[1]!.inherited).toContain('ALPHA'); expect(agent.sessions[1]!.inherited).not.toContain('BETA');
    expect((await operations.inspect('probe', P.sessionId))!.currentPoint).toEqual(C2.point);
    expect(JSON.parse(child.ref).sessionId).not.toBe(P.sessionId);
  });
  test('a missing point is unavailable without a fresh fallback or dispatch', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }]); const operations = probeOperations(agent);
    const absent = { sessionId: 'missing', kind: 'turn' as const, turn: 1, checkpoint: 'missing' };
    expect((await operations.fork({ runId: 'probe', operationId: 'missing', sourcePoint: absent })).status).toBe('unavailable'); expect(agent.sessions).toHaveLength(0);
  });
  test('a repeated model-free append has one identity and conflicting bytes do not replace it', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }]); const parent = await invokeProbe(agent, probeSpec().spec); await parent.outcome;
    const operations = probeOperations(agent); const P = JSON.parse(parent.ref); const before = agent.sessions.length;
    const request = { runId: 'probe', operationId: 'one-brief', sessionId: P.sessionId, expectedPoint: P, additions: [{ key: 'brief', kind: 'brief' as const, text: 'ONCE', revision: '1' }] };
    const first = await operations.appendContext(request); expect(await operations.appendContext(request)).toEqual(first);
    expect((await operations.appendContext({ ...request, additions: [{ ...request.additions[0]!, text: 'CHANGED' }] })).status).toBe('conflict');
    expect(agent.sessions).toHaveLength(before); expect((await operations.inspect('probe', P.sessionId))!.additions.map(item => item.text)).toEqual(['ONCE']);
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
    await (await invokeProbe(agent, probe.spec)).outcome;

    expect(probe.guarded.map(call => call.tool)).toEqual(['write', 'edit', 'write']);
    const record = agent.sessions[0]!;
    expect(probe.guarded.filter(call => call.tool === 'edit')).toHaveLength(1);
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
    await (await invokeProbe(agent, probe.spec)).outcome;
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
    await (await invokeProbe(agent, probe.spec)).outcome;
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
    await (await invokeProbe(agent, probe.spec)).outcome;
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
    await (await invokeProbe(agent, probe.spec)).outcome;
    expect(probe.events.filter(event => event.type === 'tool-finished').map(event => [event.tool, event.reachedTool, event.isError]))
      .toEqual([['echo', false, true], ['echo', true, false], ['submit', true, false]]);
  });

  test('a call the guard denied still passed the implementation\'s validation', async () => {
    const agent = createScriptedAgent([{ kind: 'tool', tool: 'write', input: {} }, { kind: 'end' }]);
    const probe = probeSpec({ deny: { write: 'Not in scope.' } });
    await (await invokeProbe(agent, probe.spec)).outcome;
    const finished = probe.events.filter(event => event.type === 'tool-finished');
    expect(finished).toEqual([{ type: 'tool-finished', callId: 'probe-1:call-1', tool: 'write', isError: true, errorText: 'Not in scope.', reachedTool: true }]);
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
    expect(await (await invokeProbe(agent, probe.spec)).outcome).toEqual({
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
    expect(await (await invokeProbe(agent, probe.spec)).outcome).toEqual({ kind: 'submitted', input: 'done' });
  });

  test('the budget still ends the session when no final response follows', async () => {
    const agent = createScriptedAgent([{ kind: 'context', tokens: 39_000, window }]);
    const probe = probeSpec({ context: policy });
    expect(await (await invokeProbe(agent, probe.spec)).outcome).toEqual({ kind: 'context-budget-reached', tokens: 39_000, report: undefined });
  });
});

describe('settlement', () => {
  test('a session that ended is settled', async () => {
    const agent = createScriptedAgent([{ kind: 'end' }], { settleMs: 50 });
    const session = (await invokeProbe(agent, probeSpec().spec));
    expect(await session.settled()).toBe('settled');
  });

  test('a session that never settles answers timed-out, which is not settlement', async () => {
    const agent = createScriptedAgent([{ kind: 'hang' }], { settleMs: 30 });
    const session = (await invokeProbe(agent, probeSpec().spec));
    const idle = session.settled(); expect(await Promise.race([idle.then(() => 'settled'), new Promise(resolve => setTimeout(() => resolve('pending'), 30))])).toBe('pending');
  });
});

describe('the ref', () => {
  test('advances as the session runs, so a ref names a point and not a session', async () => {
    const agent = createScriptedAgent([{ kind: 'message', text: 'one' }, { kind: 'wait', ms: 5 }, { kind: 'message', text: 'two' }, { kind: 'end' }]);
    const session = (await invokeProbe(agent, probeSpec().spec));
    const before = session.ref;
    await session.outcome;
    expect(session.ref).not.toBe(before);
  });
});
