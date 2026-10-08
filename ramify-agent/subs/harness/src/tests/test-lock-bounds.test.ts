import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import type { AgentSession } from '../../subs/agent/src/interfaces/port.js';
import { executeConfiguredGate, prepareGate } from '../checks/gate.js';
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

test('a configured gate finishes after a lock wait longer than its bound, and only running time counts', async () => {
  vi.useFakeTimers();
  const root = await mkdtemp(join(tmpdir(), 'ramify-gate-pause-'));
  try {
    const waiting: string[] = [];
    const prepared = await prepareGate('iteration', {
      id: 'ga-0001', runId: 'run-pause', projectRoot: root, directory: join(root, 'attempt'), head: 'HEAD', checks: [],
      audit: { mode: 'project-default', timeoutMs: 50 },
      waiting: async (_command, line) => { waiting.push(line); },
    });
    if ('schema' in prepared) throw new Error('The configured gate was not prepared');
    let abortedWhileWaiting: boolean | undefined;
    let abortedAfterBound: boolean | undefined;
    const gate = await executeConfiguredGate(async request => {
      await request.waiting?.({ kind: 'configured', name: 'agent-tests', position: 1, total: 1 }, 'Waiting for another test run (fixture)');
      await vi.advanceTimersByTimeAsync(200_000);
      abortedWhileWaiting = request.signal.aborted;
      request.lockAcquired?.();
      await vi.advanceTimersByTimeAsync(20);
      expect(request.signal.aborted).toBe(false);
      const result = {
        status: 'completed' as const, requestId: 'run-pause:ga-0001', mode: 'project-default' as const, requestedSourceCommit: 'candidate',
        auditedSourceCommit: 'candidate', reused: false, reuse: null, requestedMode: 'ramify-partial' as const,
        executedMode: 'ramify-partial' as const, fallbackReason: null, verdict: 'pass' as const,
        reportCommit: 'report', runRef: 'refs/run', treeRef: 'refs/tree', definition: { path: 'ramify-audit.json', blob: 'blob' },
        detail: 'composed pass', provider: { status: 'completed' }, checks: {},
      };
      // The running budget left after the wait still bounds the request.
      await vi.advanceTimersByTimeAsync(40);
      abortedAfterBound = request.signal.aborted;
      return result;
    }, prepared, 'candidate', 'candidate');
    expect(abortedWhileWaiting).toBe(false);
    expect(abortedAfterBound).toBe(true);
    expect(gate.verdict).toBe('passed');
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
