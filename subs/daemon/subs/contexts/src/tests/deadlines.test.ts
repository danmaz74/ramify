import { describe, expect, it } from 'vitest';
import { sessionEnvironment } from './session-fixture.js';
import { capture, flush, hash, testBudgets } from './scripted-driver.js';

describe('request deadlines leave session work running', () => {
  it('answers cold explicitly at the deadline and subsequently publishes the completed open', async () => {
    const e = sessionEnvironment();
    let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
    try {
      const opened = await e.open(); await flush(); let answered = false;
      const waiting = e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('1') }] }, { deadlineMs: 50 })
        .then(result => { answered = true; return result; });
      await flush(); e.clock.advance(49); await flush(); expect(answered).toBe(false);
      e.clock.advance(1); await flush();
      expect(await waiting).toMatchObject({ status: 'cold', elapsedMs: 50, current: { published: null } });
      expect(e.script.openCalls[0]?.signal?.aborted).toBe(false);
      expect(e.status(opened.token).published).toBeNull();
      finish!(capture()); await flush();
      expect(e.status(opened.token).published).toMatchObject({ sequence: 1, outcome: { execution: 'completed' } });
      expect(e.script.openCalls).toHaveLength(1);
    } finally { finish?.(capture()); await flush(); await e.dispose(); }
  });

  it('answers deadline-exceeded with the acknowledged revision and publishes the unfinished update later', async () => {
    const e = sessionEnvironment();
    let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      const opened = await e.open(); await flush(); const acknowledged = e.status(opened.token).published;
      e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      const waiting = e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('2') }] }, { deadlineMs: 25 });
      await flush(); e.clock.advance(25); await flush();
      expect(await waiting).toMatchObject({ status: 'deadline-exceeded', elapsedMs: 25, revision: acknowledged });
      expect(e.script.updateCalls[0]?.signal?.aborted).toBe(false);
      expect(e.status(opened.token).published).toEqual(acknowledged);
      finish!(capture(2)); await flush();
      expect(e.status(opened.token).published?.sequence).toBe(2);
      const covered = await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('2') }] });
      expect(covered).toMatchObject({ status: 'reported', published: true, freshness: { reusedRevision: true } });
      expect(e.script.updateCalls).toHaveLength(1);
    } finally { finish?.(capture(2)); await flush(); await e.dispose(); }
  });

  it('uses the configured request deadline when no override is supplied', async () => {
    const e = sessionEnvironment();
    let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      const opened = await e.open(); await flush();
      e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      const waiting = e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('2') }] });
      await flush(); e.clock.advance(testBudgets.updateDeadlineMs); await flush();
      expect(await waiting).toMatchObject({ status: 'deadline-exceeded', elapsedMs: testBudgets.updateDeadlineMs });
      expect(e.status(opened.token).published?.sequence).toBe(1);
    } finally { finish?.(capture(2)); await flush(); await e.dispose(); }
  });

  it('continues the update when an expired hook releases its client lease', async () => {
    const e = sessionEnvironment();
    let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      const opened = await e.open(); await flush();
      e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      const waiting = e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('2') }] }, { deadlineMs: 10 });
      await flush(); e.clock.advance(10); await flush();
      expect((await waiting).status).toBe('deadline-exceeded');
      e.manager.release('lease'); await flush();
      expect(e.script.updateCalls[0]?.signal?.aborted).toBe(false);
      finish!(capture(2)); await flush();
      expect(e.status(opened.token).published?.sequence).toBe(2);
    } finally { finish?.(capture(2)); await flush(); await e.dispose(); }
  });

  it('does not let an expired waiter cancel another waiter sharing its update', async () => {
    const e = sessionEnvironment();
    let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      const opened = await e.open(); await flush();
      e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      const freshness = { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('2') }] } as const;
      const early = e.check(opened.token, freshness, { deadlineMs: 10 });
      const patient = e.check(opened.token, freshness, { deadlineMs: 100 });
      await flush(); e.clock.advance(10); await flush();
      expect((await early).status).toBe('deadline-exceeded');
      expect(e.script.updateCalls[0]?.signal?.aborted).toBe(false);
      finish!(capture(2));
      expect(await patient).toMatchObject({ status: 'reported', published: true, revision: { sequence: 2 } });
      expect(e.script.updateCalls).toHaveLength(1);
    } finally { finish?.(capture(2)); await flush(); await e.dispose(); }
  });
});
