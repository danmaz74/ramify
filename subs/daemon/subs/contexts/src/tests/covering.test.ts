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
        // The sweep finds an out-of-band change and publishes it after the covered reply;
        // that publication covers the queued control, which runs no update of its own.
        finish!(capture(2));
        expect(await control).toMatchObject({ status: 'reported', published: true, revision: { sequence: 2, cause: 'sweep' },
          freshness: { captureStarted: null, reusedRevision: true } });
        expect(e.script.updateCalls).toHaveLength(0); expect(e.script.sweepCalls).toHaveLength(1);
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

describe('covering on publication', () => {
  type Held = ReturnType<typeof capture> | { readonly status: 'cancelled' };
  const pause = () => { let finish: (value: Held) => void = () => {}; const promise = new Promise<Held>(resolve => { finish = resolve; }); return { promise, finish }; };
  const observed = (version: string) => [
    { path: 'src/index.ts', role: 'source' as const, sha256: hash(version), bytes: 1 },
    { path: 'src/other.ts', role: 'source' as const, sha256: hash('other'), bytes: 5 },
  ];
  const zero = { invocationCheck: 0, workerStatus: 0, workerRoundTrip: 0, publication: 0 };
  /** Resolves the promise's outcome when it settles and records whether it has. */
  function watch<T>(promise: Promise<T>) { const state = { answered: false, result: promise.then(value => { state.answered = true; return value; }) }; return state; }

  it('covered-on-publication: hooks queued during the watcher update are answered from its revision with no second update', async () => {
    const e = sessionEnvironment();
    const held = pause();
    try {
      const opened = await e.open(); await flush();
      e.script.pending.push(() => held.promise);
      e.clock.advance(10); e.watcher.emit('/fixture', [{ path: 'src/index.ts', kind: 'changed' }], { receivedAt: 5, flushedAt: 10 });
      e.clock.advance(100); await flush();
      expect(e.script.updateCalls).toHaveLength(1); expect(e.status(opened.token).pending.analysisRunning).toBe(true);
      // Two hooks race the running update: one for the watched write, one for a path it did not name.
      const hooks = [watch(e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') })),
        watch(e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/other.ts', sha256: hash('other') }] }))];
      await flush();
      expect(hooks.map(hook => hook.answered)).toEqual([false, false]);
      expect(e.status(opened.token).pending).toMatchObject({ requests: 2, changedPaths: 2, analysisRunning: true });
      held.finish(capture(2, 'completed', observed('2')));
      for (const hook of hooks) {
        expect(await hook.result).toMatchObject({ status: 'reported', published: true,
          revision: { sequence: 2, cause: 'watch', capture: { watch: { receivedAt: 5, flushedAt: 10 } } },
          freshness: { acknowledged: 110, captureStarted: null, verified: true, reusedRevision: true }, timings: zero });
      }
      e.clock.advance(1_000); await flush();
      expect(e.script.updateCalls).toHaveLength(1); expect(e.script.sweepCalls).toHaveLength(0);
      expect(e.status(opened.token)).toMatchObject({ synchronization: 'synchronized', published: { sequence: 2 },
        pending: { requests: 0, changedPaths: 0, analysisRunning: false } });
      // Control: an arriving hook with the same identity is covered on arrival as before.
      expect(await e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') }))
        .toMatchObject({ revision: { sequence: 2 }, freshness: { captureStarted: null, reusedRevision: true } });
      expect(e.script.updateCalls).toHaveLength(1);
    } finally { held.finish(capture(2, 'completed', observed('2'))); await flush(); await e.dispose(); }
  });

  describe('uncovered-after-publication', () => {
    it('uncovered-after-publication: a queued differing expectation runs an update, and a covered companion waits with it', async () => {
      const e = sessionEnvironment();
      const first = pause(), second = pause();
      try {
        const opened = await e.open(); await flush();
        e.script.pending.push(() => first.promise, () => second.promise);
        e.watcher.emit('/fixture', [{ path: 'src/index.ts', kind: 'changed' }]); e.clock.advance(100); await flush();
        const companion = watch(e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/other.ts', sha256: hash('other') }] }));
        const differing = watch(e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '3') }));
        first.finish(capture(2, 'completed', observed('2'))); await flush();
        expect(e.status(opened.token).published?.sequence).toBe(2);
        expect([companion.answered, differing.answered]).toEqual([false, false]);
        expect(e.script.updateCalls).toHaveLength(2);
        expect(e.script.updateCalls[1]?.inputs.changes.map(change => change.path).sort()).toEqual(['src/index.ts', 'src/other.ts']);
        second.finish(capture(3, 'completed', observed('3')));
        for (const hook of [companion, differing]) {
          expect(await hook.result).toMatchObject({ status: 'reported', published: true, revision: { sequence: 3, cause: 'request' },
            freshness: { acknowledged: 100, captureStarted: 100, verified: true, reusedRevision: false } });
        }
        expect(e.script.updateCalls).toHaveLength(2);
      } finally { first.finish({ status: 'cancelled' }); second.finish({ status: 'cancelled' }); await flush(); await e.dispose(); }
    });

    it.each([
      ['a watcher change to another path', [{ path: 'src/provider.ts', kind: 'changed' }], 'src/provider.ts', 0],
      ['the watcher event for the hook\'s own path', [{ path: 'src/index.ts', kind: 'changed' }], 'src/index.ts', 0],
      ['a configuration change that requires a sweep', [{ path: 'tsconfig.json', kind: 'changed' }], 'tsconfig.json', 1],
    ] as const)('uncovered-after-publication: %s pending at publication runs an update', async (_case, events, path, sweeps) => {
      const e = sessionEnvironment();
      const first = pause(), second = pause();
      try {
        const opened = await e.open(); await flush();
        const hold = (call: { kind: string }) => call.kind === 'update' && e.script.updateCalls.length === 1 ? first.promise
          : call.kind === 'update' ? second.promise : capture(2);
        e.script.pending.push(hold, hold, hold);
        // A request's update is not background work, so the watcher event queues behind it rather than cancelling it.
        const running = e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') });
        await flush(); expect(e.script.updateCalls).toHaveLength(1);
        e.watcher.emit('/fixture', events);
        const hook = watch(e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') }));
        first.finish(capture(2)); await flush();
        expect(await running).toMatchObject({ status: 'reported', revision: { sequence: 2 }, freshness: { captureStarted: 0 } });
        expect(hook.answered).toBe(false);
        expect(e.script.updateCalls).toHaveLength(2);
        expect(e.script.updateCalls[1]?.inputs.changes.map(change => change.path)).toContain(path);
        second.finish(capture(2)); await flush();
        expect(await hook.result).toMatchObject({ status: 'reported', published: true, revision: { sequence: 2 },
          freshness: { captureStarted: 0, verified: true } });
        expect(e.script.updateCalls).toHaveLength(2); expect(e.script.sweepCalls).toHaveLength(sweeps);
      } finally { first.finish({ status: 'cancelled' }); second.finish({ status: 'cancelled' }); e.script.pending.length = 0; await flush(); await e.dispose(); }
    });

    it('uncovered-after-publication: a queued request from another invocation runs an update despite an equal identity', async () => {
      const e = sessionEnvironment();
      const held = [pause(), pause()];
      try {
        const opened = await e.open('/fixture', 'lease'); await e.open('/fixture', 'other', '/other'); await flush();
        e.script.pending.push(() => held[0]!.promise, () => held[1]!.promise);
        e.watcher.emit('/fixture', [{ path: 'src/index.ts', kind: 'changed' }]); e.clock.advance(100); await flush();
        const other = watch(e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') }, {}, 'other'));
        held[0]!.finish(capture(2)); await flush();
        expect(other.answered).toBe(false); expect(e.script.updateCalls).toHaveLength(2);
        expect(e.script.updateCalls[1]?.inputs.project.cwd).toBe('/other');
        held[1]!.finish(capture(2));
        expect(await other.result).toMatchObject({ status: 'reported', published: true, freshness: { captureStarted: 100, verified: true } });
        expect(e.script.updateCalls).toHaveLength(2);
      } finally { for (const item of held) item.finish({ status: 'cancelled' }); await flush(); await e.dispose(); }
    });

    it.each(['expired', 'cancelled'] as const)('uncovered-after-publication: a queued path of a request that %s still runs, and a covered hook sharing it waits', async ending => {
      const e = sessionEnvironment();
      const held = [pause(), pause()];
      try {
        const opened = await e.open(); await flush();
        e.script.pending.push(() => held[0]!.promise, () => held[1]!.promise);
        e.watcher.emit('/fixture', [{ path: 'src/index.ts', kind: 'changed' }]); e.clock.advance(100); await flush();
        const controller = new AbortController();
        const ended = e.manager.check({ token: opened.token, requestId: 'ended', scope: 'delta', deadlineMs: 10,
          freshness: { mode: 'synchronized', expect: expected('src/index.ts', '2') } }, 'lease', { signal: controller.signal });
        if (ending === 'expired') e.clock.advance(10); else controller.abort();
        expect(await ended).toMatchObject({ status: ending === 'expired' ? 'deadline-exceeded' : 'cancelled' });
        const hook = watch(e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') }));
        held[0]!.finish(capture(2)); await flush();
        expect(hook.answered).toBe(false); expect(e.script.updateCalls).toHaveLength(2);
        expect(e.script.updateCalls[1]?.inputs.changes).toEqual([{ path: 'src/index.ts', kind: 'changed' }]);
        held[1]!.finish(capture(2));
        expect(await hook.result).toMatchObject({ status: 'reported', published: true, revision: { sequence: 2 }, freshness: { verified: true } });
        expect((await hook.result as { freshness: { captureStarted: number | null } }).freshness.captureStarted).not.toBeNull();
        expect(e.script.updateCalls).toHaveLength(2);
      } finally { for (const item of held) item.finish({ status: 'cancelled' }); await flush(); await e.dispose(); }
    });
  });

  it('advance-before-publish: a hook arriving after the session advanced and before publication waits and is answered from that revision', async () => {
    // Every hot session is demoted before publication; a held demotion keeps the window open.
    const e = sessionEnvironment({ maxHotContexts: 0 });
    let release: () => void = () => {};
    try {
      const opened = await e.open(); await flush();
      const session = e.script.sessions[0]!.session;
      const demote = session.releaseCompiler.bind(session);
      Object.assign(session, { releaseCompiler: () => new Promise<void>(resolve => { release = resolve; }).then(demote) });
      e.script.pending.push(() => capture(2));
      const running = watch(e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') }));
      await flush();
      expect(session.current?.sequence).toBe(2);
      expect(e.status(opened.token)).toMatchObject({ published: { sequence: 1 }, pending: { analysisRunning: true } });
      const hook = watch(e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') }));
      await flush();
      expect([running.answered, hook.answered]).toEqual([false, false]);
      release(); await flush();
      expect(await running.result).toMatchObject({ status: 'reported', revision: { sequence: 2 }, freshness: { captureStarted: 0, reusedRevision: false } });
      expect(await hook.result).toMatchObject({ status: 'reported', published: true, revision: { sequence: 2 },
        freshness: { captureStarted: null, verified: true, reusedRevision: true }, timings: zero });
      await flush(); expect(e.script.updateCalls).toHaveLength(1);
      // Control: in the same window, a hook expecting the still-published identity is not answered from it.
      e.script.pending.push(() => capture(3));
      const advancing = e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '3') });
      await flush();
      expect(session.current?.sequence).toBe(3); expect(e.status(opened.token).published?.sequence).toBe(2);
      const stale = watch(e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') }));
      await flush(); expect(stale.answered).toBe(false);
      release(); await flush(); release(); await flush();
      expect(await advancing).toMatchObject({ status: 'reported', revision: { sequence: 3 } });
      expect(await stale.result).toMatchObject({ status: 'superseded', revision: { sequence: 3 },
        mismatches: [{ path: 'src/index.ts', expected: hash('2'), observed: hash('3') }] });
      expect(e.script.updateCalls).toHaveLength(3);
    } finally { release(); await flush(); release(); await flush(); await e.dispose(); }
  });

  it('advance-before-publish: a hook arriving from the publication event before its capture ends is answered from it', async () => {
    const e = sessionEnvironment();
    const held = pause();
    try {
      const opened = await e.open(); await flush();
      let late: ReturnType<typeof watch<Awaited<ReturnType<typeof e.check>>>> | undefined;
      const subscription = e.manager.subscribe(opened.token, 'lease', event => {
        if (event.type === 'revision-published' && event.revision.sequence === 2 && !late) {
          expect(e.status(opened.token).pending.analysisRunning).toBe(true);
          late = watch(e.check(opened.token, { mode: 'synchronized', expect: expected('src/index.ts', '2') }));
        }
      });
      if ('status' in subscription) throw new Error(subscription.status);
      e.script.pending.push(() => held.promise);
      e.watcher.emit('/fixture', [{ path: 'src/index.ts', kind: 'changed' }]); e.clock.advance(100); await flush();
      held.finish(capture(2)); await flush();
      expect(late).toBeDefined();
      expect(await late!.result).toMatchObject({ status: 'reported', revision: { sequence: 2, cause: 'watch' },
        freshness: { captureStarted: null, reusedRevision: true } });
      await flush(); expect(e.script.updateCalls).toHaveLength(1);
      subscription.close();
    } finally { held.finish(capture(2)); await flush(); await e.dispose(); }
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
