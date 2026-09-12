import { describe, expect, it } from 'vitest';
import { sessionEnvironment } from './session-fixture.js';
import { capture, flush, hash } from './scripted-driver.js';

describe('hot and warm session budgets', () => {
  it('demotes the least recently used hot context when a third opens', async () => {
    const e = sessionEnvironment({ maxHotContexts: 2 });
    try {
      const first = await e.open('/first'); await flush(); e.clock.advance(1);
      const second = await e.open('/second'); await flush(); e.clock.advance(1);
      await e.check(first.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('1') }] });
      e.clock.advance(1); const third = await e.open('/third'); await flush();
      expect(e.status(first.token).level).toBe('hot'); expect(e.status(second.token).level).toBe('warm');
      expect(e.status(third.token).level).toBe('hot');
      expect(e.script.sessions.map(session => [session.project.root, session.releaseCompilerCalls])).toEqual([['/first', 0], ['/second', 1], ['/third', 0]]);
      expect(e.script.sessions.every(session => session.disposeCalls === 0)).toBe(true);
      expect(e.status(second.token)).toMatchObject({ retainedBytes: 100, session: { level: 'warm', compiler: { pid: null } } });
    } finally { await e.dispose(); }
  });

  it('reuses a warm session handle on an edit and reapplies the hot context bound', async () => {
    const e = sessionEnvironment({ maxHotContexts: 1 });
    try {
      const first = await e.open('/first'); await flush(); e.clock.advance(1);
      const second = await e.open('/second'); await flush(); e.clock.advance(1);
      expect(e.status(first.token).level).toBe('warm'); e.script.version = 2;
      const result = await e.check(first.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('2') }] });
      expect(result).toMatchObject({ status: 'reported', published: true });
      expect(e.status(first.token).level).toBe('hot'); expect(e.status(second.token).level).toBe('warm');
      expect(e.script.openCalls).toHaveLength(2); expect(e.script.sessions[0]?.disposeCalls).toBe(0);
    } finally { await e.dispose(); }
  });

  it('releases only the compiler after idle and projects the current report before cold disposal', async () => {
    const e = sessionEnvironment({ warmIdleMs: 100, coldRetainMs: 200, sweepIntervalMs: 1000 });
    try {
      const opened = await e.open(); await flush(); e.clock.advance(100); await flush();
      expect(e.status(opened.token)).toMatchObject({ level: 'warm', retainedBytes: 100 });
      expect(e.script.sessions[0]?.releaseCompilerCalls).toBe(1); expect(e.script.sessions[0]?.disposeCalls).toBe(0);
      expect(e.script.reportCalls).toHaveLength(0);
      e.clock.advance(200); await flush();
      expect(e.status(opened.token)).toMatchObject({ level: 'cold', session: null, retainedBytes: 0, history: { retained: 1 } });
      expect(e.script.reportCalls).toEqual([{ root: '/fixture', sequence: 1 }]);
      expect(e.script.sessions[0]?.disposeCalls).toBe(1); expect(e.watcher.active).toBe(0);
      const result = await e.check(opened.token, { mode: 'published', wait: true }, { scope: 'report' });
      expect(result.status === 'reported' && result.report?.summary.owners).toBe(1);
      expect(e.script.reportCalls).toHaveLength(1);
    } finally { await e.dispose(); }
  });

  it('reopens and answers a check that arrives during asynchronous cold disposal', async () => {
    const e = sessionEnvironment({ warmIdleMs: 100, coldRetainMs: 200, sweepIntervalMs: 1000 });
    let finishDisposal!: () => void;
    const disposalGate = new Promise<void>(resolve => { finishDisposal = resolve; });
    try {
      const opened = await e.open(); await flush();
      const first = e.script.sessions[0]!;
      const originalDispose = first.session.dispose.bind(first.session);
      let disposing = false;
      first.session.dispose = async () => {
        disposing = true;
        await disposalGate;
        await originalDispose();
      };
      e.clock.advance(100); await flush(); e.clock.advance(200); await flush();
      expect(disposing).toBe(true); expect(first.disposeCalls).toBe(0);
      e.script.version = 2;
      let answered = false;
      const waiting = e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('2') }] })
        .then(result => { answered = true; return result; });
      await flush(); expect(answered).toBe(false); expect(e.script.openCalls).toHaveLength(1);
      finishDisposal();
      expect(await waiting).toMatchObject({ status: 'reported', published: true, revision: { summary: { owners: 2 } } });
      await flush(); expect(e.script.openCalls).toHaveLength(2); expect(first.disposeCalls).toBe(1);
      expect(e.status(opened.token).level).toBe('hot');
    } finally { finishDisposal(); await flush(); await e.dispose(); }
  });

  it('schedules an idle audit at most once for the same revision', async () => {
    const e = sessionEnvironment({ sweepIntervalMs: 100, warmIdleMs: 1000 });
    try {
      const opened = await e.open(); await flush();
      e.clock.advance(100); await flush(); e.clock.advance(1); await flush();
      expect(e.script.verifyCalls).toEqual(['/fixture']);
      e.clock.advance(100); await flush(); e.clock.advance(1); await flush(); expect(e.script.verifyCalls).toHaveLength(1);
      e.script.version = 2;
      await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('2') }] });
      e.clock.advance(100); await flush(); e.clock.advance(1); await flush(); expect(e.script.verifyCalls).toHaveLength(2);
    } finally { await e.dispose(); }
  });

  it('publishes the recomputed audit revision with a verify cause', async () => {
    const e = sessionEnvironment({ sweepIntervalMs: 100, warmIdleMs: 1000 });
    try {
      const opened = await e.open(); await flush();
      e.script.verifyPending.push(session => ({ status: 'mismatch', sequence: session.current!.sequence,
        fields: ['diagnostics'], revision: capture(2).revision }));
      e.clock.advance(100); await flush(); e.clock.advance(1); await flush();
      expect(e.status(opened.token).published).toMatchObject({ sequence: 2, cause: 'verify' });
      expect(e.script.verifyCalls).toEqual(['/fixture']);
    } finally { await e.dispose(); }
  });
  it('does not release a new session version when an older detached cold report has the same sequence', async () => {
    const e = sessionEnvironment({ maxHistoryRevisions: 2, warmIdleMs: 100, coldRetainMs: 200, sweepIntervalMs: 1000 });
    try {
      const opened = await e.open(); await flush();
      e.clock.advance(100); await flush(); e.clock.advance(200); await flush();
      expect(e.status(opened.token).level).toBe('cold');
      await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('1') }] });
      const reopened = e.status(opened.token).published!.revision;
      e.script.version = 2;
      await e.check(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('2') }] });
      expect(e.script.sessions).toHaveLength(2);
      expect(e.script.sessions[1]!.releasedRevisions).not.toContain(1);
      const report = await e.check(opened.token, { mode: 'published', wait: false, revision: reopened }, { scope: 'report' });
      expect(report.status === 'reported' && report.report?.summary.owners).toBe(1);
    } finally { await e.dispose(); }
  });

});
