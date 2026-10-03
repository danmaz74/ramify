import { describe, expect, it } from 'vitest';
import type { AffectedRequest, ContextToken } from '../interfaces/contexts.js';
import type { AffectedSelection } from '../../../../../analysis/src/interfaces/affected.js';
import { capture, flush, hash } from './scripted-driver.js';
import { sessionEnvironment } from './session-fixture.js';

/** The inputId of a scripted capture that observed only `src/index.ts` with `content`. */
const inputIdOf = (content: string) => `input/1:${hash(JSON.stringify([{ path: 'src/index.ts', role: 'source', sha256: hash(content), bytes: 1 }]))}`;
const observed = (content: string) => [{ path: 'src/index.ts', sha256: hash(content) }];
/** The scripted session's fixed answer: the named seeds changed and nothing depends on them. */
const selection = (inputId: string, modules: readonly string[]): AffectedSelection => ({
  schemaVersion: 'ramify.affected/2', inputId, paths: [],
  changedModules: modules.map(id => ({ id, directory: id === 'fixture' ? '.' : `subs/${id}` })), affectedModules: [],
  testModules: modules.map(id => ({ id, directory: id === 'fixture' ? '.' : `subs/${id}` })),
  selection: 'dependency-closure', widening: [],
  scope: { root: '/fixture', selection: 'given', invokedFrom: '/fixture', configuration: 'tsconfig.json', walkedAreas: [], ownership: { modules: [], exclusions: [] } },
  coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed',
});
const cooling = { warmIdleMs: 100, coldRetainMs: 200, sweepIntervalMs: 1_000 };

function request(token: ContextToken, requestId: string, freshness: AffectedRequest['freshness'],
  options: Partial<Pick<AffectedRequest, 'modules' | 'paths' | 'deadlineMs'>> = {}): AffectedRequest {
  return { token, requestId, freshness, ...options };
}

describe('ContextManager.affected (A7-06)', () => {
  it('A7-06:covering-revision answers from the published revision with its freshness record and the session answer', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      e.clock.advance(15);
      const published = e.status(opened.token).published;
      expect(published?.sequence).toBe(1);
      // The expectation names the published input exactly, so the revision covers the request.
      const covered = await e.manager.affected(request(opened.token, 'covered', { mode: 'synchronized', expect: observed('1') },
        { modules: ['fixture'], paths: ['src/index.ts'] }), 'lease');
      expect(covered).toEqual({ status: 'answered', requestId: 'covered', revision: published,
        freshness: { mode: 'synchronized', acknowledged: 15, captureStarted: null, verified: true, reusedRevision: true },
        result: selection(inputIdOf('1'), ['fixture']),
        timings: { invocationCheck: 0, promotion: 0, workerStatus: 0, workerRoundTrip: 0, sweep: 0, publication: 0 } });
      // One session query at the published sequence, with the seeds unchanged; no capture ran.
      expect(e.script.sessions[0]!.affectedCalls).toEqual([{ sequence: 1, modules: ['fixture'], paths: ['src/index.ts'] }]);
      expect([e.script.updateCalls.length, e.script.sweepCalls.length]).toEqual([0, 0]);

      // Published freshness answers from the same revision, and records no verification.
      const read = await e.manager.affected(request(opened.token, 'published', { mode: 'published', wait: false }, { modules: ['core'] }), 'lease');
      expect(read).toMatchObject({ status: 'answered', revision: published, result: selection(inputIdOf('1'), ['core']),
        freshness: { mode: 'published', captureStarted: null, verified: false, reusedRevision: false } });

      // A request for new content waits for the capture that observes it and answers from that revision.
      e.script.pending.push(() => capture(2));
      const updated = await e.manager.affected(request(opened.token, 'updated', { mode: 'synchronized', expect: observed('2') },
        { modules: ['fixture'] }), 'lease');
      expect(updated).toMatchObject({ status: 'answered', revision: { sequence: 2, cause: 'request' },
        freshness: { mode: 'synchronized', verified: true, reusedRevision: false }, result: selection(inputIdOf('2'), ['fixture']) });
      expect(e.script.sessions[0]!.affectedCalls.map(call => call.sequence)).toEqual([1, 1, 2]);
    } finally { await e.dispose(); }
  });

  it('A7-06:superseded answers superseded for a session answer naming another sequence, never relabeling it', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      const published = e.status(opened.token).published;
      e.script.affectedPending.push((_session, query) => ({ status: 'answered', sequence: query.sequence + 1,
        result: selection(inputIdOf('elsewhere'), ['fixture']) }));
      expect(await e.manager.affected(request(opened.token, 'other-sequence', { mode: 'synchronized', expect: observed('1') },
        { modules: ['fixture'] }), 'lease')).toEqual({ status: 'superseded', requestId: 'other-sequence', revision: published });

      // A named revision other than the published one is superseded, with no session query.
      const calls = e.script.sessions[0]!.affectedCalls.length;
      const named = `${published!.revision.slice(0, published!.revision.lastIndexOf(':'))}:9`;
      expect(await e.manager.affected(request(opened.token, 'named', { mode: 'published', wait: false, revision: named }), 'lease'))
        .toEqual({ status: 'superseded', requestId: 'named', revision: published });
      expect(e.script.sessions[0]!.affectedCalls).toHaveLength(calls);

      // Expected content that differs from the captured revision is superseded as well.
      e.script.pending.push(() => capture(2));
      expect(await e.manager.affected(request(opened.token, 'mismatch', { mode: 'synchronized', expect: observed('other') }), 'lease'))
        .toMatchObject({ status: 'superseded', requestId: 'mismatch', revision: { sequence: 2 } });
      expect(e.script.sessions[0]!.affectedCalls).toHaveLength(calls);
    } finally { await e.dispose(); }
  });

  it('A7-06:superseded named-revision-after-wait answers superseded when a named revision waits for a later publication', async () => {
    const e = sessionEnvironment();
    let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      const opened = await e.open(); await flush();
      const first = e.status(opened.token).published;
      expect(first?.sequence).toBe(1);
      // A synchronized request for new content starts a capture that has not yet published.
      e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      const updating = e.manager.affected(request(opened.token, 'updating', { mode: 'synchronized', expect: observed('2') },
        { modules: ['fixture'] }), 'lease');
      await flush();
      expect(e.script.updateCalls).toHaveLength(1);
      // Revision 1 is still published when the named request arrives, so it waits for the capture.
      const named = e.manager.affected(request(opened.token, 'named', { mode: 'published', wait: true, revision: first!.revision },
        { modules: ['core'] }), 'lease');
      await flush();
      finish!(capture(2)); await flush();
      const second = e.status(opened.token).published;
      expect(second).toMatchObject({ sequence: 2, cause: 'request' });
      // The capture published revision 2, which the request did not name: superseded, not answered from 2.
      expect(await named).toEqual({ status: 'superseded', requestId: 'named', revision: second });
      expect(await updating).toMatchObject({ status: 'answered', requestId: 'updating', revision: { sequence: 2 } });
      // Only the synchronized request queried the session.
      expect(e.script.sessions[0]!.affectedCalls).toEqual([{ sequence: 2, modules: ['fixture'] }]);
    } finally { finish?.(capture(2)); await flush(); await e.dispose(); }
  });

  it('A7-06:cold-wait-false answers cold for a cold context and pending before any publication, without a session query', async () => {
    const e = sessionEnvironment(cooling);
    let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      const opened = await e.open(); await flush();
      e.clock.advance(100); await flush(); e.clock.advance(200); await flush();
      expect(e.status(opened.token)).toMatchObject({ state: 'cold', session: null });
      const answer = await e.manager.affected(request(opened.token, 'cold', { mode: 'published', wait: false }, { modules: ['fixture'] }), 'lease');
      expect(answer).toMatchObject({ status: 'cold', requestId: 'cold', current: { state: 'cold', session: null, published: { sequence: 1 } } });
      expect(e.script.sessions[0]!.affectedCalls).toEqual([]);

      // A context whose first capture has not published answers pending.
      e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      const other = await e.open('/other'); await flush();
      expect(await e.manager.affected(request(other.token, 'pending', { mode: 'published', wait: false }), 'lease'))
        .toMatchObject({ status: 'pending', requestId: 'pending', current: { published: null } });
    } finally { finish?.(capture()); await flush(); await e.dispose(); }
  });

  it('A7-06:cold-wait-true reopens a cold context and answers from its new publication', async () => {
    const e = sessionEnvironment(cooling);
    try {
      const opened = await e.open(); await flush();
      e.clock.advance(100); await flush(); e.clock.advance(200); await flush();
      expect(e.status(opened.token)).toMatchObject({ state: 'cold', session: null });
      e.script.pending.push(() => capture(2));
      const answer = await e.manager.affected(request(opened.token, 'reopen', { mode: 'published', wait: true }, { modules: ['fixture'] }), 'lease');
      expect(answer).toMatchObject({ status: 'answered', requestId: 'reopen', revision: { sequence: 2, cause: 'open' },
        freshness: { mode: 'published', verified: false }, result: selection(inputIdOf('2'), ['fixture']) });
      // The reopened session answered at its own first revision; the disposed one was never asked.
      expect(e.script.openCalls).toHaveLength(2);
      expect(e.script.sessions[0]!.affectedCalls).toEqual([]);
      expect(e.script.sessions[1]!.affectedCalls).toEqual([{ sequence: 1, modules: ['fixture'] }]);

      // A synchronized request at a cold context reopens it the same way.
      for (let step = 0; step < 5 && e.status(opened.token).state !== 'cold'; step++) { e.clock.advance(300); await flush(); }
      expect(e.status(opened.token)).toMatchObject({ state: 'cold', session: null });
      e.script.pending.push(() => capture(3));
      expect(await e.manager.affected(request(opened.token, 'synchronized', { mode: 'synchronized', expect: observed('3') }), 'lease'))
        .toMatchObject({ status: 'answered', revision: { sequence: 3, cause: 'open' }, result: selection(inputIdOf('3'), []) });
    } finally { await e.dispose(); }
  });

  it('A7-06:invalid-current answers unavailable from the invalid published revision, never from lastValid', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      const valid = e.status(opened.token).published;
      e.script.pending.push(() => capture(2, 'invalid'));
      const answer = await e.manager.affected(request(opened.token, 'invalid', { mode: 'synchronized', expect: observed('2') },
        { modules: ['fixture'] }), 'lease');
      const status = e.status(opened.token);
      expect(status.lastValid).toEqual(valid);
      expect(status.published).toMatchObject({ sequence: 2, outcome: { execution: 'invalid' } });
      expect(answer).toEqual({ status: 'unavailable', requestId: 'invalid', revision: status.published,
        reason: 'invalid-current', message: 'The current revision has no valid complete inventory', unknownModules: [] });
      // The session was asked at the invalid revision only.
      expect(e.script.sessions[0]!.affectedCalls.map(call => call.sequence)).toEqual([2]);

      // A domain refusal passes through with its unknown module IDs.
      e.script.affectedPending.push(() => ({ status: 'unavailable', reason: 'unknown-module', message: 'Unknown module IDs: ghost',
        unknownModules: ['ghost'] }));
      expect(await e.manager.affected(request(opened.token, 'unknown', { mode: 'synchronized', expect: observed('2') },
        { modules: ['ghost'] }), 'lease')).toEqual({ status: 'unavailable', requestId: 'unknown', revision: status.published,
        reason: 'unknown-module', message: 'Unknown module IDs: ghost', unknownModules: ['ghost'] });
    } finally { await e.dispose(); }
  });

  it('A7-06:deadline answers deadline-exceeded with the elapsed time, or cold before any publication, while the update continues', async () => {
    const e = sessionEnvironment();
    let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      const opened = await e.open(); await flush();
      const acknowledged = e.status(opened.token).published;
      e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      const waiting = e.manager.affected(request(opened.token, 'late', { mode: 'synchronized', expect: observed('2') },
        { modules: ['fixture'], deadlineMs: 25 }), 'lease');
      await flush(); e.clock.advance(24); await flush();
      e.clock.advance(1); await flush();
      expect(await waiting).toEqual({ status: 'deadline-exceeded', requestId: 'late', elapsedMs: 25, revision: acknowledged });
      expect(e.script.updateCalls[0]?.signal?.aborted).toBe(false);
      finish!(capture(2)); await flush();
      expect(e.status(opened.token).published?.sequence).toBe(2);
      expect(e.script.sessions[0]!.affectedCalls).toEqual([]);
    } finally { finish?.(capture(2)); await flush(); await e.dispose(); }
  });

  it('A7-06:deadline answers cold at the deadline when no revision was ever published', async () => {
    const e = sessionEnvironment();
    let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      const opened = await e.open(); await flush();
      const waiting = e.manager.affected(request(opened.token, 'never', { mode: 'published', wait: true }, { deadlineMs: 50 }), 'lease');
      await flush(); e.clock.advance(50); await flush();
      expect(await waiting).toMatchObject({ status: 'cold', requestId: 'never', current: { published: null } });
      expect(e.script.openCalls[0]?.signal?.aborted).toBe(false);
    } finally { finish?.(capture()); await flush(); await e.dispose(); }
  });

  it('A7-06:cancel-lease answers cancelled and releases the request lease, aborting a running session query', async () => {
    const e = sessionEnvironment();
    let finish: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      const opened = await e.open(); await flush();
      // Cancellation while the request waits for its capture.
      e.script.pending.push(() => new Promise(resolve => { finish = resolve; }));
      const controller = new AbortController();
      const waiting = e.manager.affected(request(opened.token, 'cancel-wait', { mode: 'synchronized', expect: observed('2') }), 'lease',
        { signal: controller.signal });
      await flush();
      expect(e.status(opened.token).leases.requests).toBe(1);
      controller.abort();
      expect(await waiting).toEqual({ status: 'cancelled', requestId: 'cancel-wait' });
      expect(e.status(opened.token).leases.requests).toBe(0);
      // The cancelled request was the capture's only waiter, so the capture was cancelled too.
      expect(e.script.updateCalls[0]?.signal?.aborted).toBe(true);
      finish!(capture(2)); await flush();

      // A released lease cancels its request during the session query and aborts that query.
      let signal: AbortSignal | undefined;
      e.script.affectedPending.push((_session, _query, querySignal) => new Promise(resolve => {
        signal = querySignal;
        querySignal!.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true });
      }));
      const running = e.manager.affected(request(opened.token, 'cancel-query', { mode: 'published', wait: false }), 'query-lease');
      for (let attempt = 0; attempt < 20 && !signal; attempt++) await flush();
      expect(signal?.aborted).toBe(false);
      expect(e.status(opened.token).leases.requests).toBe(1);
      e.manager.release('query-lease');
      expect(await running).toEqual({ status: 'cancelled', requestId: 'cancel-query' });
      expect(signal?.aborted).toBe(true);
      await flush();
      expect(e.status(opened.token).leases.requests).toBe(0);
      // The context still answers afterwards.
      expect(await e.manager.affected(request(opened.token, 'after', { mode: 'published', wait: false }), 'lease'))
        .toMatchObject({ status: 'answered', revision: { sequence: 1 } });
    } finally { finish?.(capture(2)); await flush(); await e.dispose(); }
  });
});
