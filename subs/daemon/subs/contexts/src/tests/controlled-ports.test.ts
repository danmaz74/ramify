import { describe, expect, it } from 'vitest';
import type { WatchEvent } from '../interfaces/contexts.js';
import { createControlledClock, createControlledWatcher } from './controlled-ports.js';

describe('controlled clock', () => {
  it('runs only due callbacks, orders equal deadlines by scheduling order and releases completed timers', () => {
    const clock = createControlledClock(1000);
    const calls: [string, number][] = [];
    try {
      clock.schedule(50, () => calls.push(['later', clock.now()]));
      clock.schedule(10, () => calls.push(['first', clock.now()]));
      clock.schedule(10, () => calls.push(['second', clock.now()]));
      clock.advance(9);
      expect(calls).toEqual([]);
      clock.advance(1);
      expect(calls).toEqual([['first', 1010], ['second', 1010]]);
      expect(clock.pending).toBe(1);
      clock.advance(100);
      expect(calls.at(-1)).toEqual(['later', 1050]);
      expect(clock.now()).toBe(1110);
      expect(clock.pending).toBe(0);
    } finally { clock.dispose(); expect(clock.pending).toBe(0); }
  });

  it('cancels idempotently and schedules new callbacks relative to the current deadline', () => {
    const clock = createControlledClock();
    const calls: number[] = [];
    try {
      const cancel = clock.schedule(10, () => calls.push(-1));
      cancel(); cancel();
      clock.schedule(50, () => { calls.push(clock.now()); clock.schedule(20, () => calls.push(clock.now())); });
      clock.advance(100);
      expect(calls).toEqual([50, 70]);
      expect(clock.pending).toBe(0);
    } finally { clock.dispose(); expect(clock.pending).toBe(0); }
  });

  it('propagates callback failure without losing later timers or leaving advance locked', () => {
    const clock = createControlledClock();
    let called = false;
    try {
      clock.schedule(10, () => { throw new Error('callback failed'); });
      clock.schedule(20, () => { called = true; });
      expect(() => clock.advance(100)).toThrow('callback failed');
      expect(clock.now()).toBe(10);
      expect(clock.pending).toBe(1);
      clock.advance(10);
      expect(called).toBe(true);
    } finally { clock.dispose(); expect(clock.pending).toBe(0); }
  });

  it('disposes pending callbacks during advance and rejects new work after disposal', () => {
    const clock = createControlledClock();
    let called = false;
    try {
      clock.schedule(10, () => clock.dispose());
      clock.schedule(10, () => { called = true; });
      clock.advance(20);
      expect(called).toBe(false);
      expect(clock.pending).toBe(0);
      expect(() => clock.schedule(0, () => {})).toThrow('disposed');
      expect(() => clock.advance(0)).toThrow('disposed');
    } finally { clock.dispose(); expect(clock.pending).toBe(0); }
  });

  it('rejects backward, fractional, overflowing and reentrant time advancement', () => {
    const clock = createControlledClock(1);
    try {
      for (const value of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
        expect(() => clock.schedule(value, () => {})).toThrow(RangeError);
        expect(() => clock.advance(value)).toThrow(RangeError);
      }
      clock.schedule(0, () => { expect(() => clock.advance(1)).toThrow('recursively'); });
      clock.advance(0);
      expect(clock.now()).toBe(1);
    } finally { clock.dispose(); expect(clock.pending).toBe(0); }
  });
});

describe('controlled watcher', () => {
  it('isolates roots, delivers complete immutable batches and closes each handle independently', async () => {
    const watcher = createControlledWatcher();
    const a: (readonly WatchEvent[])[] = [];
    const b: (readonly WatchEvent[])[] = [];
    try {
      const first = await watcher.watch('/a', events => a.push(events));
      const second = await watcher.watch('/a', events => a.push(events));
      const other = await watcher.watch('/b', events => b.push(events));
      const batch: WatchEvent[] = [{ path: 'src/x.ts', kind: 'changed' }, { path: 'src/y.ts', kind: 'created' }];
      watcher.emit('/a', batch);
      expect(a).toEqual([batch, batch]);
      expect(b).toEqual([]);
      expect(Object.isFrozen(a[0])).toBe(true);
      expect(Object.isFrozen(a[0][0])).toBe(true);
      batch.splice(0);
      expect(a[0]).toHaveLength(2);
      await first.close(); await first.close();
      watcher.emit('/a', [{ path: 'src/z.ts', kind: 'deleted' }]);
      expect(a).toHaveLength(3);
      expect(watcher.active).toBe(2);
      expect(watcher.roots).toEqual(['/a', '/b']);
      await second.close(); await other.close();
      expect(watcher.active).toBe(0);
    } finally { await watcher.dispose(); expect(watcher.active).toBe(0); expect(watcher.roots).toEqual([]); }
  });

  it('preserves overflow/error events and permits a later attachment after a scripted failure', async () => {
    const watcher = createControlledWatcher();
    const batches: (readonly WatchEvent[])[] = [];
    try {
      const failure = new Error('watch unavailable');
      watcher.failNextWatch(failure);
      await expect(watcher.watch('/a', () => {})).rejects.toBe(failure);
      expect(watcher.active).toBe(0);
      const handle = await watcher.watch('/a', events => batches.push(events));
      const batch = [{ path: '', kind: 'overflow' }, { path: '', kind: 'error' }] as const;
      watcher.emit('/a', batch);
      expect(batches).toEqual([batch]);
      await handle.close();
      await watcher.watch('/a', events => batches.push(events));
      watcher.emit('/a', [{ path: 'recovered.ts', kind: 'renamed' }]);
      expect(batches).toHaveLength(2);
    } finally { await watcher.dispose(); expect(watcher.active).toBe(0); expect(watcher.roots).toEqual([]); }
  });

  it('releases all callbacks on dispose, including disposal during delivery', async () => {
    const watcher = createControlledWatcher();
    let later = false;
    try {
      await watcher.watch('/a', () => { void watcher.dispose(); });
      const handle = await watcher.watch('/a', () => { later = true; });
      watcher.emit('/a', [{ path: 'x.ts', kind: 'changed' }]);
      watcher.emit('/a', [{ path: 'x.ts', kind: 'changed' }]);
      expect(later).toBe(false);
      expect(watcher.active).toBe(0);
      await expect(watcher.watch('/a', () => {})).rejects.toThrow('disposed');
      expect(() => watcher.failNextWatch(new Error('unused'))).toThrow('disposed');
      await handle.close();
    } finally { await watcher.dispose(); expect(watcher.active).toBe(0); expect(watcher.roots).toEqual([]); }
  });

  it('does not deliver an in-progress batch to a listener attached during its delivery', async () => {
    const watcher = createControlledWatcher();
    let later = 0;
    try {
      await watcher.watch('/a', () => { void watcher.watch('/a', () => { later++; }); });
      watcher.emit('/a', [{ path: 'one.ts', kind: 'changed' }]);
      expect(later).toBe(0);
      watcher.emit('/a', [{ path: 'two.ts', kind: 'changed' }]);
      expect(later).toBe(1);
    } finally { await watcher.dispose(); expect(watcher.active).toBe(0); expect(watcher.roots).toEqual([]); }
  });
});
