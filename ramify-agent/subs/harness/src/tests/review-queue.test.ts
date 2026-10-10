import { describe, expect, test } from 'vitest';
import { ReviewQueue } from '../reviews/scheduler.js';

describe('the bounded queue of readers', () => {
  test('starts at most its concurrency, overflows beyond its queue, retries an unsettled request and parks a fenced one', async () => {
    const unsettled = ['rq-1', 'rq-2', 'rq-3', 'rq-4', 'rq-5'];
    const started: string[] = [];
    const overflowed: string[] = [];
    const releases = new Map<string, () => void>();
    const results = new Map<string, boolean>([['rq-2', false]]);
    let attempts = 0;
    const queue = new ReviewQueue({
      concurrency: 2,
      queue: 2,
      unsettled: () => unsettled,
      attempt: async request => {
        attempts += 1;
        started.push(request);
        await new Promise<void>(resolve => releases.set(request, resolve));
        const committed = results.get(request) ?? true;
        // A committed attempt settles its request unless the test keeps it for a retry.
        if (committed && request !== 'rq-1') unsettled.splice(unsettled.indexOf(request), 1);
        return committed;
      },
      overflow: async request => {
        overflowed.push(request);
        unsettled.splice(unsettled.indexOf(request), 1);
      },
      warn: () => undefined,
    });
    queue.wake();
    // Two run, two wait, and the fifth has no room.
    expect(started).toEqual(['rq-1', 'rq-2']);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(overflowed).toEqual(['rq-5']);
    expect(queue.active).toEqual(['rq-1', 'rq-2']);

    // rq-1's attempt did not settle it: it is retried, oldest request first.
    releases.get('rq-1')!();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(started).toEqual(['rq-1', 'rq-2', 'rq-1']);
    unsettled.splice(unsettled.indexOf('rq-1'), 1);
    releases.get('rq-1')!();
    // rq-2's attempt committed nothing: it is parked, never started again.
    releases.get('rq-2')!();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(started).toEqual(['rq-1', 'rq-2', 'rq-1', 'rq-3', 'rq-4']);
    queue.close();
    releases.get('rq-3')!();
    releases.get('rq-4')!();
    await queue.settled();
    expect(queue.active).toEqual([]);
    expect(unsettled).toEqual(['rq-2']);
    expect(attempts).toBe(5);
  });
});

// Caller-controlled suspension is reversible; the already admitted pipeline owns settlement.
test('B02 B03: suspension suppresses timer expiry, overflow and completion wakeups, preserving waiting residuals once', async () => {
  const { vi } = await import('vitest');
  vi.useFakeTimers();
  try {
    const pending = ['active', 'queued'];
    const started: string[] = [];
    const ended: string[] = [];
    let finishActive!: () => void;
    const queue = new ReviewQueue({ concurrency: 1, queue: 1, attemptMs: 10,
      unsettled: () => pending, deadline: () => 100,
      attempt: async request => {
        started.push(request);
        if (request === 'active') await new Promise<void>(resolve => { finishActive = resolve; });
        pending.splice(pending.indexOf(request), 1);
        return true;
      },
      expire: async request => { ended.push(`expired:${request}`); pending.splice(pending.indexOf(request), 1); },
      overflow: async request => { ended.push(`overflow:${request}`); pending.splice(pending.indexOf(request), 1); },
      now: () => Date.now(), warn: () => undefined,
    });
    vi.setSystemTime(0);
    queue.wake();
    await vi.advanceTimersByTimeAsync(30);
    const first = queue.suspend();
    await vi.advanceTimersByTimeAsync(200);
    const second = queue.suspend();
    // Arrivals while paused cannot overflow or expire merely because the caller waits.
    pending.push('new-queued');
    queue.wake();
    finishActive();
    await queue.settled();
    expect(queue.active).toEqual([]);
    expect(started).toEqual(['active']);
    expect(ended).toEqual([]);
    expect(queue.deadline('queued')! - Date.now()).toBe(70);
    first(); first();
    await vi.advanceTimersByTimeAsync(200);
    expect(started).toEqual(['active']);
    expect(queue.deadline('queued')! - Date.now()).toBe(70);
    second(); second();
    await queue.settled();
    expect(started).toContain('queued');
    // The extra request had expired before it arrived and never received fresh budget.
    expect(ended).toContain('expired:new-queued');
    queue.close();
  } finally { vi.useRealTimers(); }
});

test('B03: an expired deadline is not revived, and releasing suspension after permanent close starts nothing', async () => {
  let now = 110;
  const pending = ['expired'];
  const started: string[] = [];
  const expired: string[] = [];
  const queue = new ReviewQueue({ concurrency: 1, queue: 1, attemptMs: 10,
    unsettled: () => pending, deadline: () => 100, now: () => now,
    attempt: async request => { started.push(request); return false; },
    expire: async request => { expired.push(request); pending.splice(pending.indexOf(request), 1); },
    overflow: async () => undefined, warn: () => undefined,
  });
  const release = queue.suspend();
  now += 1_000;
  expect(queue.deadline('expired')).toBe(100);
  release();
  await queue.settled();
  expect(started).toEqual([]);
  expect(expired).toEqual(['expired']);
  pending.push('new');
  const releaseClosed = queue.suspend();
  queue.close();
  releaseClosed();
  expect(started).toEqual([]);
});
