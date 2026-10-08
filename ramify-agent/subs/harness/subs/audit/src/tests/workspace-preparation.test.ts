import { afterEach, expect, it, vi } from 'vitest';
import { spawnAttempts } from '../../../../src/tests/helpers/process-guard.js';

vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('../../../../src/tests/helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});

afterEach(() => {
  expect(spawnAttempts(), 'ordinary setup/flow/teardown process attempts').toEqual([]);
});

import { configuredAuditProgress } from '../check-execution.js';

it('keeps the readiness wait paused until every parallel provider command has acquired or settled', async () => {
  const events: string[] = [];
  const check = { kind: 'configured' as const, name: 'parallel-check', position: 1, total: 1 };
  const progress = configuredAuditProgress(new Map([['parallel-check', check]]), {
    waiting: async (_command, line) => { events.push(`wait:${line}`); },
    lockAcquired: () => { events.push('released'); },
  });
  const emit = async (event: object) => progress.emit(event as Parameters<typeof progress.emit>[0]);
  await emit({ type: 'check.waiting', checkId: 'parallel-check', command: 'A', lockPath: '/private-lock' });
  await emit({ type: 'check.waiting', checkId: 'parallel-check', command: 'B', lockPath: '/private-lock' });
  await emit({ type: 'check.lock-acquired', checkId: 'parallel-check', command: 'A', waitedMs: 1 });
  expect(events).toEqual(['wait:Waiting for audit test lock /private-lock', 'wait:Waiting for audit test lock /private-lock']);
  await emit({ type: 'check.lock-acquired', checkId: 'parallel-check', command: 'B', waitedMs: 2 });
  expect(events.at(-1)).toBe('released');
  await emit({ type: 'check.waiting', checkId: 'parallel-check', command: 'C', lockPath: '/private-lock' });
  await emit({ type: 'check.completed', checkId: 'parallel-check', result: {}, durationMs: 0 });
  expect(events.filter(event => event === 'released')).toHaveLength(2);
  progress.settleAll();
}, 30_000);
