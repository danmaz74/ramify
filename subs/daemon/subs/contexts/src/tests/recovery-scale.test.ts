import { describe, expect, it } from 'vitest';
import { sessionEnvironment } from './session-fixture.js';
import { capture, flush } from './scripted-driver.js';

describe('FR25 long invalid context history', () => {
  it('publishes 1,000 scripted invalid revisions over 32 paths, overflows, repairs and disposes', async () => {
    const env = sessionEnvironment({ sweepIntervalMs: 1_000_000_000, warmIdleMs: 1_000_000_000, maxQueuedPaths: 10_000 });
    const started = performance.now();
    try {
      const opened = await env.open(); await flush();
      const baseline = env.status(opened.token).lastValid;
      expect(baseline).not.toBeNull();
      for (let index = 0; index < 1_000; index++) {
        env.script.version = index + 2;
        env.script.pending.push(() => capture(index + 2, 'invalid'));
        env.watcher.emit('/fixture', [{ path: `src/changed-${index % 32}.ts`, kind: 'changed' }]);
        env.clock.advance(100); await flush();
        expect(env.status(opened.token).published).toMatchObject({ outcome: { execution: 'invalid' } });
      }
      const answer = await env.manager.check({ token: opened.token, requestId: 'scale-evidence', scope: 'report',
        freshness: { mode: 'published', wait: false } }, 'lease');
      expect(answer).toMatchObject({ status: 'reported', recovery: { lastCompleted: { revision: baseline?.revision },
        changes: { coverage: 'observed', reason: null } } });
      if (answer.status !== 'reported') throw new Error('Expected invalid publication');
      expect(answer.recovery?.changes.paths).toHaveLength(32);
      expect(env.status(opened.token).history.retained).toBeLessThanOrEqual(8);
      expect(env.script.sessions).toHaveLength(1);
      const retained = env.status(opened.token).retainedBytes + env.status(opened.token).history.bytes;
      expect(retained).toBeLessThanOrEqual(96 * 1024 ** 2);

      env.script.version = 1_002;
      env.script.pending.push(() => capture(1_002, 'invalid'));
      env.watcher.emit('/fixture', Array.from({ length: 11_000 }, (_, index) =>
        ({ path: `src/overflow-${index}.ts`, kind: 'changed' as const })));
      env.clock.advance(100); await flush();
      const overflow = await env.manager.check({ token: opened.token, requestId: 'scale-overflow', scope: 'report',
        freshness: { mode: 'published', wait: false } }, 'lease');
      if (overflow.status !== 'reported') throw new Error(`Expected overflow publication, received ${overflow.status}`);
      expect(overflow.recovery?.changes.paths).toHaveLength(10_000);
      expect(overflow.recovery?.changes.reason).toContain('path-overflow');
      const overflowBytes = env.status(opened.token).retainedBytes + env.status(opened.token).history.bytes;
      expect(overflowBytes).toBeLessThanOrEqual(96 * 1024 ** 2);

      env.script.version = 1_003;
      const repaired = await env.check(opened.token, { mode: 'synchronized', expect: [] });
      expect(repaired).toMatchObject({ status: 'reported', published: true });
      expect(env.status(opened.token).published).toMatchObject({ outcome: { execution: 'completed' } });
      expect(env.status(opened.token).lastValid?.sequence).toBeGreaterThan(1_001);
      expect(env.manager.recovery(opened.token)).toMatchObject({ changes: { paths: [], reason: null } });
      process.stdout.write(`FR25 scripted context publications=1000 distinctPaths=32 overflowObserved=11000 retainedBeforeOverflow=${retained} retainedAtOverflow=${overflowBytes} elapsedMs=${Math.round(performance.now() - started)}\n`);
    } finally {
      await env.dispose();
      expect(env.manager.list()).toEqual([]);
    }
  }, 120_000);
});
