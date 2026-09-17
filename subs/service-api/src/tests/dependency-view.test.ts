import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServiceResult } from '../../../../src/interfaces/service.js';
import type { ContextDependencyDiagramOutcome, ContextRevision, ContextSetup } from '../../../daemon/src/context-types.js';
import { createControlledClock } from '../../../daemon/subs/contexts/src/tests/controlled-ports.js';
import { createExplorerDependencyModel, maximumDependencyViewBytes } from '../dependency-model.js';
import { createDependencyViews, dependencyBusyMemoryMs, type DependencyViews } from '../dependency-view.js';
import { createProjectBinding, type ProjectBinding } from '../project-binding.js';
import { createExplorerRouter } from '../router.js';
import { createFakeConnector, fakeDiagram, fakeRevision, type FakeConnection, type FakeDiagramCall } from './project-binding-fakes.js';

const setup: ContextSetup = { registry: 'default', capabilities: ['registry', 'layout', 'metadata', 'descriptions',
  'source-catalog', 'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access',
  'symbol-free-access', 'resource-access', 'coverage'] };

async function flush(rounds = 20): Promise<void> {
  for (let round = 0; round < rounds; round++) await new Promise(resolve => setImmediate(resolve));
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of closers.splice(0).reverse()) await close(); vi.restoreAllMocks(); });

interface Harness {
  readonly binding: ProjectBinding;
  readonly views: DependencyViews;
  readonly caller: ReturnType<ReturnType<typeof createExplorerRouter>['createCaller']>;
  readonly connection: () => FakeConnection;
  readonly revision: (sequence: number, inputId?: string) => ContextRevision;
  readonly time: { now: number };
  readonly call: (index: number) => FakeDiagramCall;
}

/** A real binding over the fake connector, with a router whose dependency state reads a test-controlled time. */
function harness(): Harness {
  const fake = createFakeConnector();
  const clock = createControlledClock(0);
  const binding = createProjectBinding({ root: '/project', setup, connect: fake.connect, clock });
  const time = { now: 10_000 };
  let requests = 0;
  const views = createDependencyViews({ binding, now: () => time.now, requestId: () => `dependency-${++requests}` });
  const caller = createExplorerRouter({ binding, dependencyViews: views, requestId: () => 'router' }).createCaller({});
  closers.push(async () => { views.close(); await binding.close(); });
  const connection = () => fake.connections.at(-1)!;
  const revision = (sequence: number, inputId?: string) => {
    const state = binding.state();
    if (state.kind !== 'ready') throw new Error(JSON.stringify(state));
    return fakeRevision(state.token, sequence, inputId);
  };
  return { binding, views, caller, connection, revision, time, call: index => connection().diagramCalls[index]! };
}

const ok = (value: ContextDependencyDiagramOutcome): ServiceResult<ContextDependencyDiagramOutcome> => ({ ok: true, value });
const ready = (revision: ContextRevision, boundaries = 1) =>
  ok({ status: 'ready', requestId: 'r', revision, diagram: fakeDiagram(revision.fingerprints.inputId, boundaries) });
const busy = (revision: ContextRevision, reason: 'analysis-running' | 'inputs-changed') =>
  ok({ status: 'busy', requestId: 'r', revision, reason });

describe('BD26: dependencyView follows the router table', () => {
  it('answers unavailable, superseded, analyzing, waiting for one second, start and ready', async () => {
    const h = harness();
    // Binding not ready.
    expect(h.binding.state().kind).toBe('connecting');
    expect(await h.caller.dependencyView({ revision: 'rev/1:00000000-0000-4000-8000-000000000000:1' }))
      .toEqual({ status: 'unavailable', reason: 'Connecting to the project' });
    await flush();
    expect(h.binding.state().kind).toBe('ready');
    // Only `{ revision }` with a revision ID is accepted.
    await expect(h.caller.dependencyView({} as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(h.caller.dependencyView({ revision: 'rev/invalid' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(h.caller.dependencyView({ revision: h.revision(1).revision, token: {} } as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // Nothing published yet, then an older revision: superseded, no daemon request.
    const r1 = h.revision(1), r2 = h.revision(2);
    expect(await h.caller.dependencyView({ revision: r1.revision })).toEqual({ status: 'superseded', current: null, reason: expect.any(String) });
    h.connection().published = r2;
    expect(await h.caller.dependencyView({ revision: r1.revision })).toEqual({ status: 'superseded', current: r2.revision, reason: expect.any(String) });
    expect(h.connection().diagramCalls).toHaveLength(0);

    // Start: the answer is pending while the daemon request is still unsettled.
    expect(await h.caller.dependencyView({ revision: r2.revision })).toEqual({ status: 'pending', revision: r2, phase: 'analyzing' });
    expect(h.connection().diagramCalls).toHaveLength(1);
    expect(h.call(0).settled).toBe(false);
    expect(h.call(0).request).toEqual({ token: r2.token, requestId: 'dependency-1', revision: r2.revision });
    // In flight: analyzing, no second request.
    expect(await h.caller.dependencyView({ revision: r2.revision })).toEqual({ status: 'pending', revision: r2, phase: 'analyzing' });
    expect(h.connection().diagramCalls).toHaveLength(1);

    // Busy is remembered for one second as waiting.
    h.call(0).settle(busy(r2, 'analysis-running'));
    await flush();
    expect(await h.caller.dependencyView({ revision: r2.revision })).toEqual({ status: 'pending', revision: r2, phase: 'waiting' });
    h.time.now += dependencyBusyMemoryMs - 1;
    expect(await h.caller.dependencyView({ revision: r2.revision })).toEqual({ status: 'pending', revision: r2, phase: 'waiting' });
    expect(h.connection().diagramCalls).toHaveLength(1);
    h.time.now += 1;
    expect(await h.caller.dependencyView({ revision: r2.revision })).toEqual({ status: 'pending', revision: r2, phase: 'analyzing' });
    expect(h.connection().diagramCalls).toHaveLength(2);
    h.call(1).settle(busy(r2, 'inputs-changed'));
    await flush();
    // Polling every 100 ms for a second starts no request.
    for (let poll = 0; poll < 10; poll++) {
      expect(await h.caller.dependencyView({ revision: r2.revision })).toMatchObject({ status: 'pending', phase: 'waiting' });
      h.time.now += 100;
    }
    expect(h.connection().diagramCalls).toHaveLength(2);
    expect(await h.caller.dependencyView({ revision: r2.revision })).toMatchObject({ status: 'pending', phase: 'analyzing' });
    expect(h.connection().diagramCalls).toHaveLength(3);

    // Ready: the mapped model at the published revision and input ID; later requests start nothing.
    h.call(2).settle(ready(r2, 3));
    await flush();
    const expected = createExplorerDependencyModel({ revision: r2, diagram: fakeDiagram(r2.fingerprints.inputId, 3), maxBytes: maximumDependencyViewBytes });
    if (expected.status !== 'mapped') throw new Error(JSON.stringify(expected));
    const answer = await h.caller.dependencyView({ revision: r2.revision });
    expect(answer).toEqual({ status: 'ready', revision: r2, view: expected.model });
    if (answer.status !== 'ready') throw new Error('Expected ready');
    expect(answer.view.inputId).toBe(r2.fingerprints.inputId);
    for (let index = 0; index < 10; index++) expect(await h.caller.dependencyView({ revision: r2.revision })).toMatchObject({ status: 'ready' });
    expect(h.connection().diagramCalls).toHaveLength(3);
    expect(h.views.status()).toMatchObject({ inFlight: null, busy: null,
      settled: { revision: r2.revision, encodedBytes: expected.encodedBytes },
      counters: { daemonRequests: 3, busyAnswers: 2, readyAnswers: 1, aborted: 0 } });
  });

  it('never retries a superseded daemon answer, delivers failures once, and is unavailable without a ready binding', async () => {
    const h = harness();
    await flush();
    const r4 = h.revision(4), r5 = h.revision(5);
    h.connection().published = r4;
    expect(await h.caller.dependencyView({ revision: r4.revision })).toMatchObject({ status: 'pending', phase: 'analyzing' });
    // The daemon has already published r5 while the explorer still reports r4.
    h.call(0).settle(ok({ status: 'superseded', requestId: 'r', revision: r5 }));
    await flush();
    for (let poll = 0; poll < 3; poll++) {
      expect(await h.caller.dependencyView({ revision: r4.revision })).toEqual({ status: 'superseded', current: r5.revision, reason: expect.any(String) });
    }
    expect(h.connection().diagramCalls).toHaveLength(1);

    // After r5 publishes, its request is a new explicit request.
    h.connection().publish(r5);
    expect(await h.caller.dependencyView({ revision: r5.revision })).toMatchObject({ status: 'pending', phase: 'analyzing' });
    expect(h.call(1).request.revision).toBe(r5.revision);
    h.call(1).settle(ok({ status: 'unavailable', requestId: 'r', reason: 'resource-limit', message: 'Diagram of 20000000 bytes exceeds 16777216' }));
    await flush();
    expect(await h.caller.dependencyView({ revision: r5.revision }))
      .toEqual({ status: 'unavailable', reason: 'resource-limit: Diagram of 20000000 bytes exceeds 16777216' });
    // Delivered once; the next explicit request starts again.
    expect(await h.caller.dependencyView({ revision: r5.revision })).toMatchObject({ status: 'pending', phase: 'analyzing' });
    h.call(2).settle({ ok: false, error: { code: 'expired-generation', message: 'Generation expired', details: {} } });
    await flush();
    expect(await h.caller.dependencyView({ revision: r5.revision })).toEqual({ status: 'unavailable', reason: 'Generation expired' });
    // A ready diagram whose identity differs from the revision is refused by the mapping.
    expect(await h.caller.dependencyView({ revision: r5.revision })).toMatchObject({ status: 'pending' });
    h.call(3).settle(ok({ status: 'ready', requestId: 'r', revision: r5, diagram: fakeDiagram('input/1:other') }));
    await flush();
    expect(await h.caller.dependencyView({ revision: r5.revision })).toEqual({ status: 'unavailable', reason: expect.stringMatching(/^identity-mismatch: /) });
    expect(h.views.status().settled).toBeNull();

    // A dropped daemon connection makes the binding not ready.
    h.connection().drop('unavailable', { kind: 'failure', message: 'socket closed' });
    expect(await h.caller.dependencyView({ revision: r5.revision })).toEqual({ status: 'unavailable', reason: 'socket closed' });
  });
});

describe('BD27: bounded per-binding dependency state', () => {
  it('keeps one in-flight request and one settled DTO, aborts on another revision, releases on publication, eviction and close', async () => {
    const h = harness();
    await flush();
    const r1 = h.revision(1), r2 = h.revision(2), r3 = h.revision(3);
    h.connection().published = r1;
    await h.caller.dependencyView({ revision: r1.revision });
    expect(h.views.status().inFlight).toBe(r1.revision);

    // Newer publication aborts the in-flight request at once, without a browser request.
    h.connection().publish(r2);
    expect(h.call(0).signal?.aborted).toBe(true);
    expect(h.views.status()).toMatchObject({ inFlight: null, counters: { aborted: 1 } });
    await flush();
    expect(h.connection().abortedDiagrams).toBe(1);
    expect(h.views.status().settled).toBeNull();

    // A request for another (published) revision aborts the old one; only one request is in flight.
    await h.caller.dependencyView({ revision: r2.revision });
    h.connection().published = r3; // published without an event: the next request notices
    await h.caller.dependencyView({ revision: r3.revision });
    expect(h.call(1).signal?.aborted).toBe(true);
    expect(h.connection().diagramCalls.filter(call => !call.settled)).toHaveLength(1);
    expect(h.views.status()).toMatchObject({ inFlight: r3.revision, counters: { daemonRequests: 3, aborted: 2 } });
    // A late answer for the aborted request stores nothing.
    h.call(1).settle(ready(r2));
    await flush();
    expect(h.views.status().settled).toBeNull();

    // Settle r3; a newer publication releases the DTO.
    h.call(2).settle(ready(r3, 50));
    await flush();
    expect(h.views.status().settled).toMatchObject({ revision: r3.revision });
    const r4 = h.revision(4);
    h.connection().publish(r4);
    expect(h.views.status()).toMatchObject({ settled: null, inFlight: null, counters: { released: 1 } });
    expect(await h.caller.dependencyView({ revision: r3.revision })).toMatchObject({ status: 'superseded', current: r4.revision });

    // Eviction releases the DTO too.
    await h.caller.dependencyView({ revision: r4.revision });
    h.call(3).settle(ready(r4));
    await flush();
    expect(h.views.status().settled).toMatchObject({ revision: r4.revision });
    const evicted = h.binding.state();
    if (evicted.kind !== 'ready') throw new Error('Expected ready');
    h.connection().emit({ type: 'context-evicted', token: evicted.token, reason: 'pressure' });
    expect(h.views.status()).toMatchObject({ settled: null, counters: { released: 2 } });
    await flush();

    // Close aborts the in-flight request and releases everything, with no timer created by the state.
    const reopened = h.revision(5);
    h.connection().published = reopened;
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const intervals = vi.spyOn(globalThis, 'setInterval');
    await h.caller.dependencyView({ revision: reopened.revision });
    const last = h.connection().diagramCalls.at(-1)!;
    expect(last.settled).toBe(false);
    h.views.close();
    expect(last.signal?.aborted).toBe(true);
    expect(h.views.status()).toMatchObject({ closed: true, inFlight: null, settled: null, busy: null });
    last.settle(ready(reopened));
    await flush();
    expect(h.views.status()).toMatchObject({ closed: true, inFlight: null, settled: null, busy: null });
    expect(await h.caller.dependencyView({ revision: reopened.revision })).toEqual({ status: 'unavailable', reason: 'Explorer server closed' });
    expect([timers.mock.calls.length, intervals.mock.calls.length]).toEqual([0, 0]);
  });
});
