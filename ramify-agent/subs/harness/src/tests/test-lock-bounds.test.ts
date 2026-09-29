import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import type { AgentSession } from '../../subs/agent/src/interfaces/port.js';
import { runGate } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import { InvocationBounds } from '../run/port-events.js';
import { PausableDeadline } from '../run/pausable-deadline.js';

afterEach(() => vi.useRealTimers());

test('repeated and overlapping waits exclude their union and retain the running budget', async () => {
  vi.useFakeTimers();
  const bound = new PausableDeadline(100);
  await vi.advanceTimersByTimeAsync(30);
  const first = bound.pause();
  await vi.advanceTimersByTimeAsync(200);
  const second = bound.pause();
  first();
  await vi.advanceTimersByTimeAsync(200);
  expect(bound.remaining).toBe(70);
  second();
  await vi.advanceTimersByTimeAsync(40);
  const third = bound.pause();
  await vi.advanceTimersByTimeAsync(300);
  third();
  await vi.advanceTimersByTimeAsync(29);
  expect(bound.signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(bound.signal.aborted).toBe(true);
  bound.dispose();
});

test('a gate finishes after a lock wait longer than its bound and records running time separately', async () => {
  vi.useFakeTimers();
  const root = await mkdtemp(join(tmpdir(), 'ramify-gate-pause-'));
  try {
    const command = checkCommand({ argv: [process.execPath, '-e', ''], cwd: root, timeoutMs: 50 });
    const waiting: string[] = [];
    const pending = runGate({
      async run(checks, request) {
        const release = request.pauseForTestLock!();
        await request.waiting?.({ kind: 'tests', position: 1, total: 1 }, 'Waiting for another test run (fixture)');
        await vi.advanceTimersByTimeAsync(200_000);
        expect(request.signal.aborted).toBe(false);
        release();
        await vi.advanceTimersByTimeAsync(20);
        const run = {
          outcome: { kind: 'completed' as const, exitCode: 0 }, startedAt: new Date().toISOString(),
          elapsedMs: 20, lockWaitMs: 200_000,
          output: { path: null, bytes: 0, truncated: false, tail: '' }, stdout: '', stderr: '',
        };
        return { commands: [request.classify(checks[0]!, run, join(root, 'test.log'))], audited: null, evidence: null };
      },
    }, 'readiness', {
      id: 'wait-bound', projectRoot: root, directory: join(root, 'attempt'), head: 'HEAD',
      checks: [{ kind: 'tests', command }], waiting: async (_command, line) => { waiting.push(line); },
    });
    const gate = await pending;
    expect(gate.verdict).toBe('passed');
    expect(gate.commands[0]).toMatchObject({ elapsedMs: 20, lockWaitMs: 200_000 });
    expect(waiting).toEqual(['Waiting for another test run (fixture)']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an invocation survives a wait past its absolute bound and expires after its remaining budget', async () => {
  vi.useFakeTimers();
  const bounds = new InvocationBounds({ invocationIdleMs: 10_000, invocationAbsoluteMs: 100, writerSettleMs: 1 } as ConstructorParameters<typeof InvocationBounds>[0]);
  let stopCount = 0;
  const session = { outcome: new Promise<never>(() => undefined), stop: async () => { stopCount++; } } as unknown as AgentSession;
  const pending = bounds.outcome(session);
  await vi.advanceTimersByTimeAsync(40);
  const release = bounds.pauseAbsoluteForTestLock();
  await vi.advanceTimersByTimeAsync(500);
  expect(bounds.interruption).toBeUndefined();
  release();
  await vi.advanceTimersByTimeAsync(59);
  expect(bounds.interruption).toBeUndefined();
  await vi.advanceTimersByTimeAsync(2);
  await pending;
  expect(bounds.interruption).toBe('absolute-timeout');
  expect(stopCount).toBe(1);
});
