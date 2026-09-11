import type { ClockPort, WatchEvent, WatcherPort } from '../interfaces/contexts.js';

export interface ControlledClock extends ClockPort {
  readonly pending: number;
  /** Run due callbacks synchronously in deadline order, then reach the target.
   * Await the operation being exercised separately for asynchronous work. */
  advance(milliseconds: number): void;
  dispose(): void;
}

export interface ControlledWatcher extends WatcherPort {
  readonly active: number;
  readonly roots: readonly string[];
  emit(root: string, events: readonly WatchEvent[]): void;
  /** Reject the next attachment once, allowing a later reattachment to succeed. */
  failNextWatch(error: Error): void;
  dispose(): Promise<void>;
}

function duration(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Time must be a nonnegative safe integer');
}

export function createControlledClock(initialTime = 0): ControlledClock {
  duration(initialTime);
  let current = initialTime;
  let nextId = 0;
  let disposed = false;
  let advancing = false;
  const scheduled = new Map<number, { readonly at: number; readonly run: () => void }>();

  function assertActive(): void {
    if (disposed) throw new Error('Controlled clock is disposed');
  }

  return {
    now: () => current,
    get pending() { return scheduled.size; },
    schedule(delayMs, run) {
      assertActive();
      duration(delayMs);
      duration(current + delayMs);
      const id = nextId++;
      scheduled.set(id, { at: current + delayMs, run });
      return () => { scheduled.delete(id); };
    },
    advance(milliseconds) {
      assertActive();
      duration(milliseconds);
      const target = current + milliseconds;
      duration(target);
      if (advancing) throw new Error('Controlled clock cannot advance recursively');
      advancing = true;
      try {
        while (scheduled.size) {
          let next: { id: number; at: number; run: () => void } | undefined;
          for (const [id, task] of scheduled) {
            // Map insertion order breaks ties by scheduling order.
            if (task.at <= target && (!next || task.at < next.at)) next = { id, ...task };
          }
          if (!next) break;
          scheduled.delete(next.id);
          current = next.at;
          next.run();
        }
        current = target;
      } finally { advancing = false; }
    },
    dispose() {
      disposed = true;
      scheduled.clear();
    },
  };
}

export function createControlledWatcher(): ControlledWatcher {
  let disposed = false;
  let nextId = 0;
  let failure: Error | undefined;
  const listeners = new Map<number, { readonly root: string; readonly listener: (events: readonly WatchEvent[]) => void }>();

  return {
    get active() { return listeners.size; },
    get roots() { return [...new Set([...listeners.values()].map(entry => entry.root))].sort(); },
    async watch(root, listener) {
      if (disposed) throw new Error('Controlled watcher is disposed');
      if (failure) {
        const error = failure;
        failure = undefined;
        throw error;
      }
      const id = nextId++;
      listeners.set(id, { root, listener });
      return { async close() { listeners.delete(id); } };
    },
    emit(root, events) {
      if (disposed) return;
      const batch = Object.freeze(events.map(event => Object.freeze({ ...event })));
      for (const id of [...listeners.keys()]) {
        const entry = listeners.get(id);
        if (entry?.root === root) entry.listener(batch);
      }
    },
    failNextWatch(error) {
      if (disposed) throw new Error('Controlled watcher is disposed');
      failure = error;
    },
    async dispose() {
      disposed = true;
      failure = undefined;
      listeners.clear();
    },
  };
}
