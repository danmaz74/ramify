import type { ChildProcess } from 'node:child_process';
import { channel } from 'node:diagnostics_channel';
import { describe, expect, it } from 'vitest';
import { openWorkerSession } from '../session-host.js';
import { createRssSampler, processRss } from '../session-processes.js';
import { paths, replace, fixture, timeout } from './session-test-fixture.js';
import { eventually, workerSuite } from './session-worker-fixture.js';

/** `/bin/ps` RSS reads started in this process while observing. */
function psReads(): { count: () => number; stop: () => void } {
  const children: ChildProcess[] = [];
  const created = (message: unknown): void => { children.push((message as { process: ChildProcess }).process); };
  const events = channel('child_process');
  events.subscribe(created);
  return {
    // Arguments are assigned after the creation event, so inspect them on demand.
    count: () => children.filter(child => child.spawnfile === '/bin/ps' && child.spawnargs.includes('rss=')).length,
    stop: () => { events.unsubscribe(created); },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

describe('compiler RSS sampling', () => {
  it('rss-sampling: Linux reads /proc for every status message and starts no process', async () => {
    const reads: number[] = [];
    const sampler = createRssSampler(() => { throw new Error('Linux has no background read'); },
      { platform: 'linux', read: async pid => { reads.push(pid); return pid * 10; }, now: () => 0, intervalMs: 1_000 });
    for (let index = 0; index < 5; index++) expect(await sampler.sample(7)).toBe(70);
    expect(reads).toEqual([7, 7, 7, 7, 7]);
    if (process.platform !== 'linux') return;
    const observed = psReads();
    try {
      expect(await processRss(process.pid, 'linux')).toBeGreaterThan(0);
      await settle();
      expect(observed.count()).toBe(0);
    } finally { observed.stop(); }
  }, 30_000);

  it('rss-sampling: elsewhere a compiler is read when first reported, then at most once per interval in the background', async () => {
    let clock = 0;
    const pending: { pid: number; read: ReturnType<typeof deferred<number | null>> }[] = [];
    const refreshed: [number, number | null][] = [];
    const sampler = createRssSampler((pid, rss) => { refreshed.push([pid, rss]); }, {
      platform: 'darwin', now: () => clock, intervalMs: 1_000,
      read: pid => { const read = deferred<number | null>(); pending.push({ pid, read }); return read.promise; },
    });
    // The first report of a pid waits for its read.
    const first = sampler.sample(7);
    expect(pending).toHaveLength(1);
    pending[0]!.read.resolve(100);
    expect(await first).toBe(100);
    // Messages within the interval reuse the sample and read nothing.
    for (clock = 0; clock < 1_000; clock += 100) expect(await sampler.sample(7)).toBe(100);
    expect(pending).toHaveLength(1);
    // At the interval a message still reports the sample, and one read starts.
    clock = 1_000;
    expect(await sampler.sample(7)).toBe(100);
    expect(pending).toHaveLength(2);
    // A message while that read runs starts no other.
    clock = 1_500;
    expect(await sampler.sample(7)).toBe(100);
    expect(pending).toHaveLength(2);
    pending[1]!.read.resolve(250);
    await settle();
    expect(refreshed).toEqual([[7, 250]]);
    expect(await sampler.sample(7)).toBe(250);
    // The refreshed sample is dated when its read started.
    expect(pending).toHaveLength(2);
    clock = 2_000;
    expect(await sampler.sample(7)).toBe(250);
    expect(pending).toHaveLength(3);
    // A failed read reports nothing and lets a later message read again.
    pending[2]!.read.reject(new Error('ps failed'));
    await settle();
    expect(refreshed).toHaveLength(1);
    expect(await sampler.sample(7)).toBe(250);
    expect(pending).toHaveLength(4);
    // A new compiler is read before its first report; the old compiler's read is discarded.
    const replacement = sampler.sample(8);
    expect(pending).toHaveLength(5);
    pending[4]!.read.resolve(300);
    expect(await replacement).toBe(300);
    pending[3]!.read.resolve(999);
    await settle();
    expect(refreshed).toHaveLength(1);
    expect(await sampler.sample(8)).toBe(300);
    // After disposal an in-flight read reports nothing.
    clock = 10_000;
    expect(await sampler.sample(8)).toBe(300);
    expect(pending).toHaveLength(6);
    sampler.dispose();
    pending[5]!.read.resolve(400);
    await settle();
    expect(refreshed).toHaveLength(1);
  }, 30_000);
});

workerSuite('compiler RSS sampling in a worker session', import.meta.url, () => {
  it('rss-sampling: on the macOS path worker messages start no process until a new compiler or the interval', () => fixture(async (root, inputs) => {
    let clock = 0;
    const reads: number[] = [];
    const observed = psReads();
    const opened = await openWorkerSession(inputs, {}, undefined, { platform: 'darwin', now: () => clock, intervalMs: 1_000,
      read: pid => { reads.push(pid); return processRss(pid, 'darwin'); } });
    if (opened.status !== 'opened') { observed.stop(); throw new Error(JSON.stringify(opened)); }
    const handle = opened.session;
    try {
      const hot = handle.status();
      expect(hot.compiler.pid).not.toBeNull();
      expect(hot.compiler.rss).toBeGreaterThan(0);
      expect(reads).toEqual([hot.compiler.pid]);
      await settle();
      expect(observed.count()).toBe(1);
      // Updates, a source edit and a sweep each carry a status message and reuse the sample.
      for (let index = 0; index < 10; index++) expect((await handle.update([])).status).toBe('revised');
      await replace(root, paths.provider, '  return 2;', '  void 0;\n  return 2;');
      expect((await handle.update([{ path: paths.provider, kind: 'changed' }])).status).toBe('revised');
      await handle.sweep();
      expect(handle.status().compiler).toEqual(hot.compiler);
      expect(reads).toHaveLength(1);
      await settle();
      expect(observed.count()).toBe(1);
      // Once the interval passes, the next message starts one read and its result replaces the status.
      clock = 1_000;
      const before = handle.status();
      expect((await handle.update([])).status).toBe('revised');
      expect(reads).toEqual([hot.compiler.pid, hot.compiler.pid]);
      await eventually(() => handle.status() !== before && observed.count() === 2);
      expect(handle.status().compiler.pid).toBe(hot.compiler.pid);
      expect(handle.status().compiler.rss).toBeGreaterThan(0);
      for (let index = 0; index < 3; index++) await handle.update([]);
      expect(reads).toHaveLength(2);
      // A released compiler reports no RSS; its replacement is read when first reported.
      await handle.releaseCompiler();
      expect(handle.status().compiler).toEqual({ pid: null, rss: null });
      expect((await handle.update([])).status).toBe('revised');
      const replaced = handle.status().compiler;
      expect(replaced.pid).not.toBeNull();
      expect(replaced.pid).not.toBe(hot.compiler.pid);
      expect(replaced.rss).toBeGreaterThan(0);
      expect(reads).toEqual([hot.compiler.pid, hot.compiler.pid, replaced.pid]);
      await settle();
      expect(observed.count()).toBe(3);
    } finally { await handle.dispose(); observed.stop(); }
  }), timeout);
});
