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
