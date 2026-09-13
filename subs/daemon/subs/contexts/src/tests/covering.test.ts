import { describe, expect, it } from 'vitest';
import { sessionEnvironment } from './session-fixture.js';
import { capture, flush, hash } from './scripted-driver.js';

const expected = (path = 'src/index.ts', content = '1') => [{ path, sha256: hash(content) }];

describe('covered identity rendezvous', () => {
  it('answers an already covered delta request immediately without update or report projection', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush(); const before = e.script.calls.length;
      e.clock.advance(15);
      const result = await e.check(opened.token, { mode: 'synchronized', expect: expected() });
      expect(result).toMatchObject({ status: 'reported', published: true, report: null,
        freshness: { acknowledged: 15, captureStarted: null, verified: true, reusedRevision: true } });
      expect(e.script.calls).toHaveLength(before); expect(e.script.reportCalls).toEqual([]);
    } finally { await e.dispose(); }
  });

  it('flushes debounce and combines named paths from concurrent hooks in one update', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush(); const before = e.script.calls.length;
      e.watcher.emit('/fixture', [{ path: 'src/provider.ts', kind: 'changed' }]);
      e.script.pending.push(() => capture(2, 'completed', [
        { path: 'src/provider.ts', role: 'source', sha256: hash('provider'), bytes: 8 },
        { path: 'src/a.ts', role: 'source', sha256: hash('a'), bytes: 1 },
        { path: 'src/b.ts', role: 'source', sha256: hash('b'), bytes: 1 },
      ]));
      const results = await Promise.all([
        e.check(opened.token, { mode: 'synchronized', expect: expected('src/a.ts', 'a') }),
        e.check(opened.token, { mode: 'synchronized', expect: expected('src/b.ts', 'b') }),
      ]);
      expect(e.clock.now()).toBe(0); expect(e.script.calls).toHaveLength(before + 1);
      expect(e.script.updateCalls.at(-1)?.inputs.changes.map(change => change.path).sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/provider.ts']);
      expect(e.script.updateCalls.at(-1)?.inputs.changes.every(change => change.kind === 'changed')).toBe(true);
      expect(results.every(result => result.status === 'reported' && result.published && result.revision.sequence === 2)).toBe(true);
    } finally { await e.dispose(); }
  });

  it.each(['created', 'deleted', 'renamed'] as const)('preserves a pending %s watcher hint when a hook names the same path', async kind => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      e.watcher.emit('/fixture', [{ path: 'src/index.ts', kind }]);
      e.script.version = 2;
      const result = await e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') });
      expect(result).toMatchObject({ status: 'reported', published: true });
      expect(e.script.updateCalls).toHaveLength(1);
      expect(e.script.updateCalls[0]?.inputs.changes).toEqual([{ path: 'src/index.ts', kind: kind === 'renamed' ? 'unknown' : kind }]);
    } finally { await e.dispose(); }
  });

  it('waits for a known provider change even when the named file is already covered', async () => {
    const e = sessionEnvironment();
    let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      const opened = await e.open(); await flush();
      e.watcher.emit('/fixture', [{ path: 'subs/provider/module.ramify', kind: 'changed' }]);
      e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      let answered = false;
      const request = e.check(opened.token, { mode: 'synchronized', expect: expected() }).then(result => { answered = true; return result; });
      await flush(); expect(answered).toBe(false); expect(e.script.updateCalls).toHaveLength(1);
      expect(e.script.updateCalls[0]?.inputs.changes.map(change => change.path)).toContain('subs/provider/module.ramify');
      finish!(capture()); expect((await request).status).toBe('reported');
    } finally { finish?.(capture()); await flush(); await e.dispose(); }
  });

  it('requires a fresh sweep for empty expectations and never treats them as vacuous coverage', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush(); e.clock.advance(25);
      const result = await e.check(opened.token, { mode: 'synchronized', expect: [] }, { scope: 'report' });
      expect(e.script.sweepCalls).toHaveLength(1);
      expect(result.status === 'reported' && result.freshness).toMatchObject({ acknowledged: 25, captureStarted: 25, verified: true });
      expect(result.status === 'reported' && result.report?.summary.owners).toBe(1);
    } finally { await e.dispose(); }
  });

  it('does not reuse another lease invocation despite equal file identities', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open('/fixture', 'a', '/fixture/src'); await flush();
      await e.open('/fixture', 'b', '/other');
      const result = await e.check(opened.token, { mode: 'synchronized', expect: expected() }, { scope: 'report' }, 'b');
      expect(e.script.updateCalls).toHaveLength(1);
      expect(e.script.updateCalls[0]?.inputs.project.cwd).toBe('/other');
      expect(result.status === 'reported' && result.report?.request.project.cwd).toBe('/other');
    } finally { await e.dispose(); }
  });

  it.each(['never-observed.ts', '../outside.ts', '/elsewhere/outside.ts'])('reports %s as unobserved after discovery is given a chance', async path => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      expect(await e.check(opened.token, { mode: 'synchronized', expect: [{ path, sha256: null }] })).toMatchObject({ status: 'unavailable', reason: 'unobserved-input' });
      if (path === 'never-observed.ts') expect(e.script.updateCalls).toHaveLength(1);
    } finally { await e.dispose(); }
  });

  it('returns the expected and observed identities on a superseded write', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush(); e.script.version = 3;
      const result = await e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') });
      expect(result).toMatchObject({ status: 'superseded', mismatches: [{ path: 'src/index.ts', expected: hash('2'), observed: hash('3') }] });
      expect(e.script.updateCalls).toHaveLength(1);
    } finally { await e.dispose(); }
  });

  it('waits for a required configuration sweep before trusting a covered identity', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      e.watcher.emit('/fixture', [{ path: 'tsconfig.json', kind: 'changed' }]);
      const before = e.script.sweepCalls.length;
      const result = await e.check(opened.token, { mode: 'synchronized', expect: expected() });
      expect(result.status).toBe('reported'); expect(e.script.sweepCalls.length).toBeGreaterThan(before);
      expect(result.status === 'reported' && result.freshness.captureStarted).not.toBeNull();
    } finally { await e.dispose(); }
  });

  describe('periodic sweeps as maintenance', () => {
    it('covered-during-periodic-sweep: answers a covered hook from the revision published before a held-open periodic sweep', async () => {
      const e = sessionEnvironment();
      let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
      try {
        const opened = await e.open(); await flush();
        e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
        e.clock.advance(30_000); await flush();
        expect(e.script.sweepCalls).toHaveLength(1); expect(e.script.updateCalls).toHaveLength(0);
        expect(e.status(opened.token)).toMatchObject({ synchronization: 'synchronized', pending: { analysisRunning: true } });
        const before = e.status(opened.token).published!;
        let answered = false;
        const hook = e.check(opened.token, { mode: 'synchronized', expect: expected() }).then(result => { answered = true; return result; });
        await flush(); expect(answered).toBe(true);
        expect(await hook).toMatchObject({ status: 'reported', published: true, revision: { revision: before.revision, sequence: 1 },
          freshness: { acknowledged: 30_000, captureStarted: null, verified: true, reusedRevision: true } });
        expect(e.script.updateCalls).toHaveLength(0); expect(e.script.sweepCalls).toHaveLength(1);
        // Control: an identity the published revision does not cover still waits for the sweep.
        let controlAnswered = false;
        const control = e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') }).then(result => { controlAnswered = true; return result; });
        await flush(); expect(controlAnswered).toBe(false); expect(e.script.updateCalls).toHaveLength(0);
        // The sweep finds an out-of-band change and publishes it after the covered reply.
        finish!(capture(2));
        expect(await control).toMatchObject({ status: 'reported', published: true, revision: { sequence: 2, cause: 'sweep' } });
        expect(e.script.updateCalls).toHaveLength(1); expect(e.script.sweepCalls).toHaveLength(1);
      } finally { finish?.(capture()); await flush(); await e.dispose(); }
    });

    it('covered-when-interval-elapsed: answers from coverage before the elapsed interval marks a periodic sweep due', async () => {
      // The inactive timer lapses without a sweep, so only the hook's own activity finds the interval elapsed.
      const e = sessionEnvironment({ warmIdleMs: 20_000 });
      try {
        const opened = await e.open(); await flush();
        e.clock.advance(31_000); await flush();
        expect(e.script.sweepCalls).toHaveLength(0); expect(e.status(opened.token).synchronization).toBe('synchronized');
        let sweepsAtReply = -1;
        const hook = e.check(opened.token, { mode: 'synchronized', expect: expected() }).then(result => { sweepsAtReply = e.script.sweepCalls.length; return result; });
        expect(e.status(opened.token).synchronization).toBe('synchronized');
        expect(await hook).toMatchObject({ status: 'reported', published: true, revision: { sequence: 1 },
          freshness: { acknowledged: 31_000, captureStarted: null, verified: true, reusedRevision: true } });
        expect(sweepsAtReply).toBe(0); expect(e.script.updateCalls).toHaveLength(0);
        // Control: the interval had elapsed, so the hook's activity starts a periodic sweep after the reply.
        await flush(); expect(e.script.sweepCalls).toHaveLength(1); expect(e.script.updateCalls).toHaveLength(0);
        expect(e.status(opened.token)).toMatchObject({ synchronization: 'synchronized', published: { sequence: 1 } });
      } finally { await e.dispose(); }
    });

    it.each([
      ['configuration', [{ path: 'tsconfig.json', kind: 'changed' }], 'reconciling'],
      ['manifest', [{ path: 'package.json', kind: 'changed' }], 'reconciling'],
      ['overflow', [{ path: '', kind: 'overflow' }], 'reconciling'],
      ['watcher error', [{ path: '', kind: 'error' }], 'watcher-unavailable'],
    ] as const)('required-sweeps-still-wait: a %s sweep makes a covered hook wait', async (_trigger, events, synchronization) => {
      const e = sessionEnvironment();
      let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
      try {
        const opened = await e.open(); await flush();
        // Control: the same identity is covered before the trigger arrives.
        expect(await e.check(opened.token, { mode: 'synchronized', expect: expected() })).toMatchObject({ freshness: { captureStarted: null, reusedRevision: true } });
        const hold = (call: { kind: string }) => call.kind === 'sweep' ? new Promise<ReturnType<typeof capture>>(resolve => { finish = resolve; }) : capture();
        e.script.pending.push(hold, hold);
        e.watcher.emit('/fixture', events);
        expect(e.status(opened.token).synchronization).not.toBe('synchronized');
        e.clock.advance(5);
        let answered = false;
        const hook = e.check(opened.token, { mode: 'synchronized', expect: expected() }).then(result => { answered = true; return result; });
        await flush();
        expect(answered).toBe(false); expect(e.script.sweepCalls).toHaveLength(1); expect(e.script.updateCalls).toHaveLength(1);
        expect(e.status(opened.token)).toMatchObject({ synchronization, pending: { analysisRunning: true } });
        finish!(capture());
        expect(await hook).toMatchObject({ status: 'reported', published: true, freshness: { acknowledged: 5, captureStarted: 5, verified: true } });
      } finally { finish?.(capture()); e.script.pending.length = 0; await flush(); await e.dispose(); }
    });
  });
});

describe('timing fields outside the revision total', () => {
  it('timing-fields: a revision carries its capture\'s session work and a reply adds publication, zero when covered', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      const stages = capture(2).revision.timings;
      // Opening reports no operation timings.
      expect(e.status(opened.token).published!.capture).toEqual({ invocationCheck: 0, workerStatus: 0, workerRoundTrip: 0, watch: null });
      e.script.pending.push(() => ({ ...capture(2), timings: { invocationCheck: 3, workerStatus: 2, workerRoundTrip: 40 } }));
      const fresh = await e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') });
      if (fresh.status !== 'reported' || !fresh.published) throw new Error(fresh.status);
      expect(fresh.revision).toMatchObject({ sequence: 2, timings: stages, capture: { invocationCheck: 3, workerStatus: 2, workerRoundTrip: 40, watch: null } });
      expect(Object.keys(fresh.revision.timings).sort()).toEqual(Object.keys(stages).sort());
      expect(Object.keys(fresh.timings!).sort()).toEqual(['invocationCheck', 'publication', 'workerRoundTrip', 'workerStatus']);
      expect(fresh.timings).toMatchObject({ invocationCheck: 3, workerStatus: 2, workerRoundTrip: 40 });
      expect(Number.isFinite(fresh.timings!.publication) && fresh.timings!.publication >= 0).toBe(true);
      expect(Object.isFrozen(fresh.timings) && Object.isFrozen(fresh.revision.capture)).toBe(true);
      expect(e.status(opened.token).published).toEqual(fresh.revision);
      // A racing hook runs an identical update: its reply reports that update while the revision keeps its own capture.
      e.watcher.emit('/fixture', [{ path: 'src/index.ts', kind: 'changed' }]);
      e.script.pending.push(() => ({ ...capture(2), timings: { invocationCheck: 5, workerStatus: 1, workerRoundTrip: 30 } }));
      const racing = await e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') });
      expect(racing).toMatchObject({ status: 'reported', published: true, freshness: { reusedRevision: true },
        revision: { sequence: 2, capture: { invocationCheck: 3, workerStatus: 2, workerRoundTrip: 40 } },
        timings: { invocationCheck: 5, workerStatus: 1, workerRoundTrip: 30 } });
      expect(e.script.updateCalls).toHaveLength(2); await flush();
      // A covered answer runs no capture and pays nothing.
      const covered = await e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') });
      expect(covered).toMatchObject({ status: 'reported', freshness: { captureStarted: null, reusedRevision: true },
        timings: { invocationCheck: 0, workerStatus: 0, workerRoundTrip: 0, publication: 0 } });
      expect(e.script.updateCalls).toHaveLength(2);
    } finally { await e.dispose(); }
  });
});
