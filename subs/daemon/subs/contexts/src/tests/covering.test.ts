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
      expect(results.every(result => result.status === 'reported' && result.published && result.revision.sequence === 2)).toBe(true);
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
});
