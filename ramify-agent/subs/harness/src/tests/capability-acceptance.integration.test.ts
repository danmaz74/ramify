import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { runAcceptedHandback } from './helpers/acceptance-flow.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
const cleanups: Array<() => Promise<void>> = [];
beforeEach(resetSpawnAttempts);
afterEach(async () => {
  const failures: unknown[] = [];
  try {
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { await cleanup(); } catch (error) { failures.push(error); }
    }
    if (failures.length > 0) throw new AggregateError(failures, 'Acceptance cleanup/response assertions failed');
  }
  finally { expect(spawnAttempts(), 'ordinary setup/flow/teardown attempted child processes').toEqual([]); }
});

test('CA08 CA11–CA15 CA17 CA25 CA30: scripted multi-owner migration, repair, handback and linked revision',
  () => runAcceptedHandback('revision', cleanups), 150_000);
test('CA28: deferred B entry receives accepted handback and replans from current source',
  () => runAcceptedHandback('deferred', cleanups), 150_000);
test('CA31: source drift after a passing combined gate cannot be handed back',
  () => runAcceptedHandback('drift', cleanups), 150_000);
test('CA17 CA19 CA28 CA30: restart after handback continues the original A assignment once',
  () => runAcceptedHandback('restart', cleanups), 180_000);
test('CA17 CA20 CA30: restart after verification reuses the accepted gate and review for one handback',
  () => runAcceptedHandback('verify-restart', cleanups), 180_000);
test('CA20 CA30: restart after the passing gate reuses its audited candidate',
  () => runAcceptedHandback('gate-restart', cleanups), 180_000);
test('CA19: in-flight combined capability gate intent recovers one audited commit and handback',
  () => runAcceptedHandback('gate-intent-restart', cleanups), 180_000);
test('CA19: in-flight combined capability gate commit recovers one audited commit and handback',
  () => runAcceptedHandback('gate-committing-restart', cleanups), 180_000);
test('CA20 CA30: restart after the passing review reuses the same gate and review',
  () => runAcceptedHandback('review-restart', cleanups), 180_000);
test('CA19: accepted reviewer submissions replay before their combined review record',
  () => runAcceptedHandback('review-submission-restart', cleanups), 180_000);
test('CA19: a submitted reviewer concern replays into one exact pending attempt and CheckFinding',
  () => runAcceptedHandback('concern-submission-restart', cleanups), 180_000);
test('CA26: failed combined gates exhaust the captured repair bound with the first cause and no handback',
  () => runAcceptedHandback('repair-exhaustion', cleanups), 180_000);
