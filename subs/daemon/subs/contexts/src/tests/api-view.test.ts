import { describe, expect, it } from 'vitest';
import type { ApiViewRequest, ContextToken } from '../interfaces/contexts.js';
import { capture, flush, hash, testApiViewLimits } from './scripted-driver.js';
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
      expect(result.projection?.sequence).toBe(1);
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

  it('never answers a failed analysis with an empty message', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      const failed = capture(2, 'incomplete');
      e.script.pending.push(() => ({ status: 'reported', report: { ...failed.report, diagnostics: [{ id: 'failure', category: 'execution',
        code: 'internal-error', message: '', location: null, related: [], importer: null, original: null, accessId: null }] } }));
      const result = await e.apiView(opened.token, { mode: 'synchronized', expect: [] });
      expect(result).toEqual({ status: 'unavailable', reason: 'analysis-failed', message: 'The analysis could not be reported',
        requestId: expect.any(String) });
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

describe('ContextManager.apiView: requested views (AV26)', () => {
  const request = (token: ContextToken, requestId: string, views?: ApiViewRequest['views']) =>
    ({ token, requestId, freshness: { mode: 'synchronized' as const, expect: [] }, selection: { scope: 'all' as const }, ...(views ? { views } : {}) });

  it('answers only the API projection without views, and calls no architect query', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open();
      const result = await e.manager.apiView(request(opened.token, 'default'), 'lease');
      expect(result).toMatchObject({ status: 'projected', architect: null, projection: { sequence: 1 } });
      expect([e.script.sessions[0]!.apiViewCalls.length, e.script.sessions[0]!.architectViewCalls.length]).toEqual([1, 0]);
    } finally { await e.dispose(); }
  });

  it('calls the architect query and the whole-project API projection for metrics at the pinned sequence', async () => {
    // Limits other than the defaults, so the query shows it received the manager's own.
    const limits = { ...testApiViewLimits, architect: { ...testApiViewLimits.architect, maxProjectionBytes: 4096,
      tests: { ...testApiViewLimits.architect.tests, maxTitlesPerRecord: 7 } } };
    const e = sessionEnvironment({}, limits);
    try {
      const opened = await e.open(); await flush();
      e.script.version = 2;
      const result = await e.manager.apiView(request(opened.token, 'architect', ['architect']), 'lease');
      if (result.status !== 'projected') throw new Error(result.status);
      expect([result.revision.sequence, result.projection, result.architect?.sequence]).toEqual([2, null, 2]);
      const session = e.script.sessions[0]!;
      expect(session.apiViewCalls).toEqual([{ sequence: 2, selection: { scope: 'all' }, details: limits.details,
        maxAreaBytes: limits.maxAreaBytes, maxInvocationBytes: limits.maxInvocationBytes }]);
      expect(session.architectViewCalls).toEqual([{ sequence: 2, ...limits.architect }]);
    } finally { await e.dispose(); }
  });

  it('keeps architect inventory measurements when the metrics-only API projection is unavailable', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open();
      e.script.apiViewPending.push(() => ({ status: 'unavailable', reason: 'resource-limit', message: 'all areas are too large' }));
      const result = await e.manager.apiView(request(opened.token, 'architect-limited', ['architect']), 'lease');
      expect(result).toMatchObject({ status: 'projected', projection: null, measurementProjection: null,
        measurements: { sequence: 1 }, measurementFailure: 'resource-unavailable', architect: { sequence: 1 } });
    } finally { await e.dispose(); }
  });

  it('answers both projections from one synchronized revision, joined with a check in the same capture', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      e.script.version = 2;
      const updates = e.script.updateCalls.length + e.script.sweepCalls.length;
      const [checked, viewed] = await Promise.all([
        e.check(opened.token, { mode: 'synchronized', expect: [] }),
        e.manager.apiView(request(opened.token, 'both', ['api', 'architect']), 'lease'),
      ]);
      if (checked.status !== 'reported' || viewed.status !== 'projected') throw new Error('Expected both to succeed');
      expect([checked.revision?.sequence, viewed.revision.sequence, viewed.projection?.sequence, viewed.architect?.sequence]).toEqual([2, 2, 2, 2]);
      const session = e.script.sessions[0]!;
      expect([session.apiViewCalls.map(call => call.sequence), session.architectViewCalls.map(call => call.sequence)]).toEqual([[2], [2]]);
      // One capture, whose required sweep found the new inputs, answered both requests.
      expect(e.script.updateCalls.length + e.script.sweepCalls.length - updates).toBe(1);
    } finally { await e.dispose(); }
  });

  it('makes the whole outcome superseded when either query is superseded, and marks the context for reconciliation', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      e.script.architectViewPending.push((_session, query) => ({ status: 'superseded', sequence: query.sequence, observedInputId: null }));
      const architect = await e.manager.apiView(request(opened.token, 'architect-superseded', ['api', 'architect']), 'lease');
      expect(architect).toEqual({ status: 'superseded', requestId: 'architect-superseded', revision: e.status(opened.token).published });
      expect(e.status(opened.token).synchronization).not.toBe('synchronized');

      e.script.apiViewPending.push((_session, query) => ({ status: 'superseded', sequence: query.sequence, observedInputId: 'input/1:newer' }));
      const calls = e.script.sessions[0]!.architectViewCalls.length;
      const api = await e.manager.apiView(request(opened.token, 'api-superseded', ['api', 'architect']), 'lease');
      expect(api).toMatchObject({ status: 'superseded', requestId: 'api-superseded' });
      // The API view is queried first; its supersession ends the request before the architect query.
      expect(e.script.sessions[0]!.architectViewCalls.length).toBe(calls);
    } finally { await e.dispose(); }
  });

  it('maps an architect resource limit to resource-unavailable and its other refusals to analysis-failed', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      e.script.architectViewPending.push(() => ({ status: 'unavailable', reason: 'resource-limit', message: 'projection is too large' }));
      expect(await e.manager.apiView(request(opened.token, 'limit', ['architect']), 'lease')).toEqual({ status: 'unavailable', requestId: 'limit',
        reason: 'resource-unavailable', message: 'resource-limit: projection is too large' });
      e.script.architectViewPending.push(() => ({ status: 'unavailable', reason: 'invalid-revision', message: 'Sequence 9 is not current' }));
      expect(await e.manager.apiView(request(opened.token, 'revision', ['architect']), 'lease')).toEqual({ status: 'unavailable', requestId: 'revision',
        reason: 'analysis-failed', message: 'invalid-revision: Sequence 9 is not current' });
      e.script.architectViewPending.push(() => { throw new Error('worker lost'); });
      expect(await e.manager.apiView(request(opened.token, 'thrown', ['architect']), 'lease'))
        .toMatchObject({ status: 'unavailable', reason: 'analysis-failed', message: expect.stringContaining('worker lost') });
    } finally { await e.dispose(); }
  });

  it('cancels a running architect query when the request is cancelled', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      let signal: AbortSignal | undefined;
      e.script.architectViewPending.push((_session, _query, querySignal) => new Promise(resolve => {
        signal = querySignal;
        querySignal!.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true });
      }));
      const controller = new AbortController();
      const pending = e.manager.apiView(request(opened.token, 'cancel-architect', ['architect']), 'lease', { signal: controller.signal });
      for (let attempt = 0; attempt < 20 && !signal; attempt++) await flush();
      expect(signal?.aborted).toBe(false);
      controller.abort();
      expect(await pending).toEqual({ status: 'cancelled', requestId: 'cancel-architect' });
      expect(signal?.aborted).toBe(true);
    } finally { await e.dispose(); }
  });
});
