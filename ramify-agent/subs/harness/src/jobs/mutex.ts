/** Runs tasks one at a time, in the order they were queued. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/**
 * Runs tasks one at a time, like `Mutex`, but a task queued `first` runs
 * before every task queued `after` that is still waiting. Tasks of one
 * priority keep the order they were queued in.
 */
export class PriorityMutex {
  private busy = false;
  private readonly first: Array<() => void> = [];
  private readonly after: Array<() => void> = [];

  async run<T>(task: () => Promise<T>, priority: 'first' | 'after' = 'after'): Promise<T> {
    if (this.busy) await new Promise<void>(resolve => (priority === 'first' ? this.first : this.after).push(resolve));
    else this.busy = true;
    try {
      return await task();
    } finally {
      // The lock passes straight to the next waiter, so nothing queued later can take it in between.
      const next = this.first.shift() ?? this.after.shift();
      if (next === undefined) this.busy = false;
      else next();
    }
  }
}
