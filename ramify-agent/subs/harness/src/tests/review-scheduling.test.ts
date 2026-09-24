import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';
import { PriorityMutex } from '../jobs/mutex.js';
import { ReviewQueue } from '../reviews/scheduler.js';
import { snapshotToolNames } from '../reviews/snapshot.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { completionProposed, submit, write } from './helpers/iterations.js';
import { attemptRecord, eventsOf, gate, limit, notesDirectory, plan, reviewRun, reviewTarget, store, tool } from './helpers/reviews.js';
import { onlyRun } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * The bounded review scheduler (Plan 12 iteration 4, CF15's queue, retry
 * and deadline part): waiting requests drain in the order they were
 * recorded beside the writer, beyond the queue they overflow, a failed
 * attempt is retried once, and a request no attempt of which could finish
 * before its work item's deadline is finished at once as not verified. The
 * writer's start goes before a waiting reader's. None of these is ever a
 * clean review, and none changes a gate.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const index = `${notesDirectory}/src/index.ts`;
const changed = { 1: [store], 2: [limit], 3: [store, index] } as const;
const clean = (paths: readonly string[]): ScriptStep[] => [
  ...paths.map(path => tool(snapshotToolNames.diff, { path })),
  { kind: 'submit', input: { inspected: [...paths], missing: [], concerns: [] } },
];
const engineers = (third: readonly ScriptStep[] = []): ReadonlyArray<readonly ScriptStep[]> => [
  submit(completionProposed('Added the note store.'), write(store, 'export const store = new Map(); // v1\n')),
  submit(completionProposed('Stated the note limit.'), write(limit, 'export const limit = (text: string) => text.length <= 50;\n')),
  submit(completionProposed('Exported the store.'), ...third, write(store, 'export const store = new Map(); // v3\n'), write(index, 'export * from \'./store.js\';\n')),
];

describe('the queue itself', () => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  test('waiting requests start in the order they were recorded, and those beyond the queue overflow', async () => {
    const waiting = ['rq-0001', 'rq-0002', 'rq-0003', 'rq-0004', 'rq-0005'];
    const started: string[] = [];
    const overflowed: string[] = [];
    const releases = new Map<string, () => void>();
    const queue = new ReviewQueue({
      concurrency: 2,
      queue: 2,
      unsettled: () => [...waiting],
      attempt: request => new Promise(resolve => { started.push(request); releases.set(request, () => { waiting.splice(waiting.indexOf(request), 1); resolve(true); }); }),
      overflow: async request => { overflowed.push(request); waiting.splice(waiting.indexOf(request), 1); },
      warn: () => undefined,
    });
    queue.wake();
    expect(started).toEqual(['rq-0001', 'rq-0002']);
    expect(overflowed).toEqual(['rq-0005']);
    releases.get('rq-0002')!();
    await settle();
    expect(started).toEqual(['rq-0001', 'rq-0002', 'rq-0003']);
    releases.get('rq-0001')!();
    await settle();
    expect(started).toEqual(['rq-0001', 'rq-0002', 'rq-0003', 'rq-0004']);
    releases.get('rq-0003')!();
    releases.get('rq-0004')!();
    await queue.settled();
    expect(waiting).toEqual([]);
  });

  test('a request no attempt of which could finish before its deadline is finished at once, first or retry, and a waiting one when its time runs out', async () => {
    let now = 1_000_000;
    const waiting = ['rq-0001', 'rq-0002', 'rq-0003'];
    const deadlines = new Map<string, number | null>([['rq-0001', null], ['rq-0002', now + 50], ['rq-0003', now + 200]]);
    const started: string[] = [];
    const expired: Array<[string, number]> = [];
    let release!: () => void;
    const queue = new ReviewQueue({
      concurrency: 1,
      queue: 12,
      attemptMs: 100,
      now: () => now,
      deadline: request => deadlines.get(request) ?? null,
      unsettled: () => [...waiting],
      attempt: request => new Promise(resolve => { started.push(request); release = () => { waiting.splice(waiting.indexOf(request), 1); resolve(true); }; }),
      overflow: async () => undefined,
      expire: async request => { expired.push([request, now]); waiting.splice(waiting.indexOf(request), 1); },
      warn: () => undefined,
    });
    queue.wake();
    // rq-0002 cannot finish 100 ms of attempt within 50 ms: finished at once,
    // although no slot was free. rq-0003 still can, and waits for the slot.
    expect(started).toEqual(['rq-0001']);
    expect(expired).toEqual([['rq-0002', 1_000_000]]);
    // Time passes while rq-0001 runs; rq-0003's last moment to start goes by.
    now += 150;
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(expired.map(([request]) => request)).toEqual(['rq-0002', 'rq-0003']);
    expect(started).toEqual(['rq-0001']);
    release();
    await queue.settled();
    queue.close();
  });

  test('a writer\'s start goes before every reader\'s start that is waiting', async () => {
    const lock = new PriorityMutex();
    const order: string[] = [];
    let open!: () => void;
    const held = lock.run(() => new Promise<void>(resolve => { open = resolve; }), 'after');
    const readers = [lock.run(async () => { order.push('reader-1'); }, 'after'), lock.run(async () => { order.push('reader-2'); }, 'after')];
    const writer = lock.run(async () => { order.push('writer'); }, 'first');
    open();
    await Promise.all([held, writer, ...readers]);
    expect(order).toEqual(['writer', 'reader-1', 'reader-2']);
    // A failing task passes the lock on like any other.
    await expect(lock.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await lock.run(async () => { order.push('after-failure'); });
    expect(order.at(-1)).toBe('after-failure');
  });
});

describe('a driven run', () => {
  test('one reader drains nine requests in their recorded order beside the writer, retrying one once, and a small queue overflows the newest', async () => {
    const root = await reviewTarget(cleanups);
    const firstRunning = gate();
    const writerDone = gate();
    const run = await reviewRun(root, cleanups, {
      policy: { kinds: ['code', 'scope', 'design'], concurrency: 1, queue: 12, retries: 1, attemptMs: 10_000, settleMs: 60_000 },
      engineer: engineers([{ kind: 'await', until: () => firstRunning.opened }, { kind: 'await', until: async () => { writerDone.open(); } }]),
      reviewers: {
        // The first reader holds the only slot until the third writer runs:
        // the writer is never held back by it.
        'rq-0001': [{ kind: 'await', until: async () => { firstRunning.open(); await writerDone.opened; } }, ...clean(changed[1])],
        // An invalid scope submission, then a valid one: one retry.
        'rq-0002#1': [{ kind: 'submit', input: { inspected: [], missing: [], concerns: [] } }, { kind: 'submit', input: { verdict: 'fine' } }, { kind: 'submit', input: { nothing: true } }],
        'rq-0002#2': clean(changed[1]),
        'rq-0004': clean(changed[2]), 'rq-0005': clean(changed[2]),
        'rq-0007': clean(changed[3]), 'rq-0008': clean(changed[3]),
      },
    });
    const { service, runId, events } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    // Design requests have no guidance in these candidates: unavailable at once, never started.
    const started = eventsOf(events, 'review-attempt-started').map(event => event.data.attempt);
    expect(started).toEqual(['rq-0001.a01', 'rq-0002.a01', 'rq-0002.a02', 'rq-0004.a01', 'rq-0005.a01', 'rq-0007.a01', 'rq-0008.a01']);
    // Never more than one reader at once, and a reader ran while the writer did.
    const invocations = [...events].filter(event => event.type === 'invocation-started' || event.type === 'invocation-ended');
    let live = 0;
    let most = 0;
    const readers = new Set(eventsOf(events, 'invocation-started').filter(event => event.data.role === 'reviewer').map(event => event.data.invocation));
    for (const event of invocations) {
      if (!readers.has(event.data.invocation)) continue;
      live += event.type === 'invocation-started' ? 1 : -1;
      most = Math.max(most, live);
    }
    expect(most).toBe(1);
    const third = eventsOf(events, 'invocation-started').find(event => event.data.role === 'engineer' && event.data.work.iteration === 'wi-001.i03')!;
    const firstReader = eventsOf(events, 'review-attempt-started')[0]!.data.invocation;
    const firstEnd = eventsOf(events, 'invocation-ended').find(event => event.data.invocation === firstReader)!;
    expect(third.sequence).toBeLessThan(firstEnd.sequence);
    const finished = eventsOf(events, 'review-attempt-finished');
    expect(finished.filter(event => event.data.request === 'rq-0002').map(event => [event.data.attempt, event.data.result, event.data.reason, event.data.settles]))
      .toEqual([['rq-0002.a01', 'not-verified', 'invalid-output', false], ['rq-0002.a02', 'complete', null, true]]);
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 9, complete: 6, partial: 0, notVerified: 3, pending: 0 });
    expect(eventsOf(events, 'gate-attempted').every(event => event.data.verdict === 'passed')).toBe(true);
  }, 120_000);

  test('with a queue of two, the requests recorded while the slot is taken and the queue full are finished as overflowed', async () => {
    const root = await reviewTarget(cleanups);
    const completionRequested = gate();
    let revisions = 0;
    const run = await reviewRun(root, cleanups, {
      policy: { kinds: ['code', 'scope'], concurrency: 1, queue: 2, attemptMs: 10_000, settleMs: 60_000 },
      afterWrite: async write => {
        if (write === 'outline-revised' && (revisions += 1) === 2) completionRequested.open();
      },
      engineer: engineers(),
      reviewers: {
        // The first reader holds the only slot until every iteration has closed.
        'rq-0001': [{ kind: 'await', until: () => completionRequested.opened }, ...clean(changed[1])],
        'rq-0002': clean(changed[1]), 'rq-0003': clean(changed[2]),
      },
    });
    const { service, runId, events } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    // rq-0002 and rq-0003 wait; rq-0004 of the second iteration, and both
    // requests of the third, arrive with the queue full.
    const finished = eventsOf(events, 'review-attempt-finished');
    expect(finished.filter(event => event.data.reason === 'queue-overflow').map(event => event.data.request).sort()).toEqual(['rq-0004', 'rq-0005', 'rq-0006']);
    for (const attempt of ['rq-0004.a01', 'rq-0005.a01', 'rq-0006.a01']) {
      expect(await attemptRecord(root, runId, attempt)).toMatchObject({ startedAt: null, invocation: null, actualStart: null, settles: true, checkFindings: [] });
    }
    // The scope requests intended a fork; the overflowed one records that it never started.
    expect(await attemptRecord(root, runId, 'rq-0004.a01')).toMatchObject({ requestedStart: 'fork' });
    expect(eventsOf(events, 'review-attempt-started').map(event => event.data.request)).toEqual(['rq-0001', 'rq-0002', 'rq-0003']);
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 6, complete: 3, partial: 0, notVerified: 3, pending: 0 });
  }, 120_000);

  test('after the completion request, a waiting request that could not finish before the work item\'s deadline is finished at once', async () => {
    const root = await reviewTarget(cleanups);
    const completionRequested = gate();
    let revisions = 0;
    const run = await reviewRun(root, cleanups, {
      // One attempt may take a minute and the work item waits one second.
      policy: { kinds: ['code'], concurrency: 1, attemptMs: 60_000, settleMs: 1_000 },
      afterWrite: async write => {
        // The first revision comes with the first assignment; the second is the completion request's.
        if (write === 'outline-revised' && (revisions += 1) === 2) completionRequested.open();
      },
      engineer: engineers(),
      reviewers: {
        'rq-0001': [{ kind: 'await', until: () => completionRequested.opened }, ...clean(changed[1])],
      },
    });
    const { service, runId, events } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    const finished = eventsOf(events, 'review-attempt-finished');
    expect(finished.map(event => [event.data.attempt, event.data.result, event.data.reason])).toEqual(expect.arrayContaining([
      ['rq-0001.a01', 'complete', null],
      ['rq-0002.a01', 'not-verified', 'no-time-before-deadline'],
      ['rq-0003.a01', 'not-verified', 'no-time-before-deadline'],
    ]));
    const completion = eventsOf(events, 'outline-revised').find(event => event.data.architectRef !== undefined)!;
    for (const attempt of ['rq-0002.a01', 'rq-0003.a01']) {
      const record = await attemptRecord(root, runId, attempt);
      expect(record).toMatchObject({ startedAt: null, invocation: null, settles: true, result: { detail: expect.stringContaining('60000 ms') } });
      expect(Date.parse(record.finishedAt)).toBeGreaterThanOrEqual(Date.parse(completion.at));
    }
    expect(eventsOf(events, 'review-attempt-started').map(event => event.data.request)).toEqual(['rq-0001']);
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 3, complete: 1, partial: 0, notVerified: 2, pending: 0 });
    expect(eventsOf(events, 'gate-attempted').every(event => event.data.verdict === 'passed')).toBe(true);
  }, 120_000);
});
