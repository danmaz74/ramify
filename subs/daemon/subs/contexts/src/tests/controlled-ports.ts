import type { ClockPort, WatchBatch, WatchEvent, WatcherPort, WatchScope } from '../interfaces/contexts.js';

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
  /** Every scope each attachment received, in order: its `watch` scope, then each
   * `reconfigure`, as the sequence and the rooted exclusion directories. */
  readonly registrations: readonly { readonly root: string; readonly sequence: number | null; readonly exclusions: readonly string[] }[];
  /** Without `batch` the listener receives no watcher times, as a port that records none. */
  emit(root: string, events: readonly WatchEvent[], batch?: WatchBatch): void;
  /** Keep every later `reconfigure` pending until the returned release runs; a release
   * given a count makes those reconfigurations report it as the registered directories. */
  holdReconfiguration(): (registered?: number) => void;
  /** Reject the next attachment once, allowing a later reattachment to succeed. */
  failNextWatch(error: Error): void;
  dispose(): Promise<void>;
}

function duration(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Time must be a nonnegative safe integer');
}

export function createControlledClock(initialTime: number = 0): ControlledClock {
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
  let hold: Promise<number | undefined> | null = null;
  const listeners = new Map<number, { readonly root: string; readonly listener: (events: readonly WatchEvent[], batch?: WatchBatch) => void }>();
  const registrations: { readonly root: string; readonly sequence: number | null; readonly exclusions: readonly string[] }[] = [];
  const record = (root: string, scope: WatchScope) =>
    registrations.push(Object.freeze({ root, sequence: scope.sequence, exclusions: Object.freeze(scope.exclusions.map(item => item.directory)) }));

  return {
    get active() { return listeners.size; },
    get roots() { return [...new Set([...listeners.values()].map(entry => entry.root))].sort(); },
    get registrations() { return [...registrations]; },
    async watch(root, scope, listener) {
      if (disposed) throw new Error('Controlled watcher is disposed');
      if (failure) {
        const error = failure;
        failure = undefined;
        throw error;
      }
      const id = nextId++;
      listeners.set(id, { root, listener });
      record(root, scope);
      let current = scope;
      // No directory is registered: the controlled port delivers only what a test emits.
      return {
        // Each exclusion the new scope drops stands for one registered directory.
        async reconfigure(next) {
          if (!listeners.has(id)) return 0;
          const registered = current.exclusions.filter(item => !next.exclusions.some(other => other.directory === item.directory)).length;
          current = next; record(root, next);
          const override = hold ? await hold : undefined;
          return override ?? registered;
        },
        registrations: () => ({ sequence: current.sequence, directories: 0, pruned: [], prunedCount: 0 }),
        async close() { listeners.delete(id); },
      };
    },
    emit(root, events, times) {
      if (disposed) return;
      const batch = Object.freeze(events.map(event => Object.freeze({ ...event })));
      const frozen = times && Object.freeze({ ...times });
      for (const id of [...listeners.keys()]) {
        const entry = listeners.get(id);
        if (entry?.root === root) { if (frozen) entry.listener(batch, frozen); else entry.listener(batch); }
      }
    },
    holdReconfiguration() {
      let release!: (registered?: number) => void;
      const held = new Promise<number | undefined>(resolve => { release = resolve; });
      hold = held;
      return registered => { if (hold === held) hold = null; release(registered); };
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
