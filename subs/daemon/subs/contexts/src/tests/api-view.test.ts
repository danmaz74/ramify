import { describe, expect, it } from 'vitest';
import { capture, flush, hash } from './scripted-driver.js';
import { sessionEnvironment } from './session-fixture.js';

describe('ContextManager.apiView: revision-bound projection', () => {
  it('projects from the published revision and records exactly one session apiView call', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open();
      const result = await e.apiView(opened.token, { mode: 'synchronized', expect: [] });
      expect(result.status).toBe('projected');
      if (result.status !== 'projected') throw new Error(result.status);
      expect(result.revision.sequence).toBe(1);
      expect(result.projection.sequence).toBe(1);
      expect(e.status(opened.token).published?.sequence).toBe(1);
      expect(e.script.sessions).toHaveLength(1);
      expect(e.script.sessions[0]!.apiViewCalls).toHaveLength(1);
      expect(e.script.sessions[0]!.apiViewCalls[0]!.sequence).toBe(1);
    } finally { await e.dispose(); }
  });

  it('joins a queued check and an apiView request into the same capture and revision', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      const [checked, viewed] = await Promise.all([
        e.check(opened.token, { mode: 'synchronized', expect: [] }),
        e.apiView(opened.token, { mode: 'synchronized', expect: [] }),
      ]);
      expect(checked.status).toBe('reported');
      expect(viewed.status).toBe('projected');
      if (checked.status !== 'reported' || viewed.status !== 'projected') throw new Error('Expected both to succeed');
      expect(checked.revision?.sequence).toBe(viewed.revision.sequence);
      expect(e.script.sessions).toHaveLength(1);
      expect(e.script.sessions[0]!.apiViewCalls).toHaveLength(1);
    } finally { await e.dispose(); }
  });

  it('answers a covered apiView request from the existing publication, with no new session operation', async () => {
    const e = sessionEnvironment();
    try {
      // A non-empty expectation that matches the default capture's own input
      // needs no sweep, so a second identical request can be answered covered.
      const expect_ = [{ path: 'src/index.ts', sha256: hash('1') }];
      const opened = await e.open();
      await e.apiView(opened.token, { mode: 'synchronized', expect: expect_ });
      await flush();
      expect(e.status(opened.token).synchronization).toBe('synchronized');
      const before = e.script.updateCalls.length + e.script.sweepCalls.length;
      const covered = await e.apiView(opened.token, { mode: 'synchronized', expect: expect_ });
      expect(covered.status).toBe('projected');
      expect(e.script.updateCalls.length + e.script.sweepCalls.length).toBe(before);
      expect(e.script.sessions[0]!.apiViewCalls.length).toBeGreaterThanOrEqual(2);
    } finally { await e.dispose(); }
  });

  it('reuses the published revision on a second synchronized apiView request with an empty expectation, when nothing on disk changed', async () => {
    // A synchronized, empty-`expect` apiView request (exactly what `materialize`
    // always sends) always needs a sweep, precisely as `check` does: neither
    // request is ever covered by covers()'s fast path. Contexts must still
    // answer a second such request from the already-published revision once
    // that sweep reports nothing changed, exactly like `check` already does
    // (see context-manager.test.ts's "reuses exact reports" case) — the same
    // rendezvous, not a duplicated one. iteration8-results.md's "Required
    // follow-up" #1 suspected an asymmetry here; the real cause turned out to
    // sit outside contexts (subs/analysis/subs/project's own observation of
    // materialize's freshly created `.ramify` output as a false structural
    // change), so this leaf documents that contexts' own rendezvous was
    // always correct.
    const e = sessionEnvironment();
    try {
      const opened = await e.open();
      const first = await e.apiView(opened.token, { mode: 'synchronized', expect: [] });
      expect(first.status).toBe('projected');
      if (first.status !== 'projected') throw new Error(first.status);
      expect(first.revision.sequence).toBe(1);
      const before = e.script.sweepCalls.length;
      const second = await e.apiView(opened.token, { mode: 'synchronized', expect: [] });
      expect(second.status).toBe('projected');
      if (second.status !== 'projected') throw new Error(second.status);
      // A required sweep still ran (never covered for an empty expectation),
      // but it reported nothing changed, so no new revision published.
      expect(e.script.sweepCalls.length).toBeGreaterThan(before);
      expect(second.revision.sequence).toBe(1);
      expect(second.freshness.reusedRevision).toBe(true);
    } finally { await e.dispose(); }
  });

  it('reports superseded, not stale content, when expected content mismatches the captured revision', async () => {
    const e = sessionEnvironment();
    try {
      e.script.pending.push(() => capture(1, 'completed', [{ path: 'src/index.ts', role: 'source', sha256: hash('actual'), bytes: 1 }]));
      const opened = await e.open();
      const result = await e.apiView(opened.token, { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('different') }] });
      expect(result.status).toBe('superseded');
      if (result.status !== 'superseded') throw new Error(result.status);
      expect(result.revision?.sequence).toBe(1);
      expect(result).not.toHaveProperty('mismatches');
    } finally { await e.dispose(); }
  });

  it('answers immediately with configuration-changed for an expected configuration path', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open();
      const result = await e.apiView(opened.token, { mode: 'synchronized', expect: [{ path: 'tsconfig.json', sha256: null }] });
      expect(result).toMatchObject({ status: 'unavailable', reason: 'configuration-changed' });
    } finally { await e.dispose(); }
  });

  it('translates a session resource-limit outcome into a context resource-unavailable outcome', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open();
      e.script.apiViewPending.push(() => ({ status: 'unavailable', reason: 'resource-limit', message: 'projection is too large' }));
      const result = await e.apiView(opened.token, { mode: 'synchronized', expect: [] });
      expect(result).toEqual({ status: 'unavailable', reason: 'resource-unavailable',
        message: 'resource-limit: projection is too large', requestId: expect.any(String) });
    } finally { await e.dispose(); }
  });

  it('returns cold when the deadline elapses before any revision has ever published', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open();
      // Never answers on its own, but resolves once the eventual disposal aborts it.
      e.script.pending.push(call => new Promise(resolve => call.signal!.addEventListener('abort', () => resolve({ status: 'cancelled' }))));
      const pendingView = e.apiView(opened.token, { mode: 'synchronized', expect: [] }, { scope: 'all' }, { deadlineMs: 1000 });
      await flush(); e.clock.advance(1000); await flush();
      const result = await pendingView;
      expect(result.status).toBe('cold');
      if (result.status !== 'cold') throw new Error(result.status);
      expect(result.current.token).toEqual(opened.token);
    } finally { await e.dispose(); }
  });

  it('cancels a pending apiView request without publishing or leaking a session operation', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      e.script.pending.push(call => new Promise(resolve => call.signal!.addEventListener('abort', () => resolve({ status: 'cancelled' }))));
      const controller = new AbortController();
      const pendingView = e.manager.apiView({ token: opened.token, requestId: 'cancel-apiview', freshness: { mode: 'synchronized', expect: [] },
        selection: { scope: 'all' } }, 'lease', { signal: controller.signal });
      await flush(); controller.abort();
      expect(await pendingView).toEqual({ status: 'cancelled', requestId: 'cancel-apiview' });
    } finally { await e.dispose(); }
  });
});
