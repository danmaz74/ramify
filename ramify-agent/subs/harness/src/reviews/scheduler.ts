/*
 * The review readers of one run: at most `concurrency` attempts at once,
 * beside the run's one writer, and at most `queue` requests waiting. The
 * waiting requests are read from the log each time the queue is woken, so a
 * retry is simply a request whose last attempt did not settle it, and the
 * queue holds nothing a restart would need. Waiting requests are started in
 * the order they were recorded, whatever their work item or question, so
 * no request is passed over while a later one runs.
 *
 * A request has a deadline once its work item has requested completion, or
 * once the run settles its reviews. The queue starts no attempt, first or
 * retry, that could not finish before that deadline within the policy's
 * attempt bound: such a request is finished at once as not verified, with
 * that reason, rather than started and cut off.
 *
 * The writer is never scheduled here and never waits for a reader: readers
 * hold no writer, their durable writes are short transitions under the run
 * mutex, and an invocation's start gives a waiting writer precedence over
 * waiting readers. That is the whole of the writer's priority.
 */

export interface ReviewQueueOptions {
  readonly concurrency: number;
  readonly queue: number;
  /** The unsettled requests in the order they were recorded, from the log as it stands. */
  readonly unsettled: () => readonly string[];
  /**
   * Runs one attempt of a request to its terminal record, answering whether
   * one was committed. A request whose attempt committed nothing, because it
   * was fenced or the service is closing, is parked: this queue never starts
   * it again, and recovery or a closure finishes it.
   */
  readonly attempt: (request: string) => Promise<boolean>;
  /** Finishes a request the queue has no room for, as not verified. */
  readonly overflow: (request: string) => Promise<void>;
  /** The time by which a request must be settled, in epoch milliseconds; null while it has none. */
  readonly deadline?: ((request: string) => number | null) | undefined;
  /** The longest one attempt may run: an attempt is started only if it could finish by its deadline. */
  readonly attemptMs?: number | undefined;
  /** Finishes a request no attempt of which could finish before its deadline, as not verified. */
  readonly expire?: ((request: string) => Promise<void>) | undefined;
  readonly now?: (() => number) | undefined;
  readonly warn: (message: string) => void;
}

export class ReviewQueue {
  private readonly running = new Map<string, Promise<void>>();
  private readonly finishing = new Map<string, Promise<void>>();
  private readonly parked = new Set<string>();
  /** Each waiter of `changed`, woken once when an attempt or a finish ends. */
  private readonly waiters = new Set<() => void>();
  private open = true;
  /** Wakes the queue when the earliest waiting request's last moment to start has passed. */
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: ReviewQueueOptions) {}

  /** The requests an attempt is running for now. */
  get active(): readonly string[] {
    return [...this.running.keys()];
  }

  /** Whether new attempts may still start. */
  get accepting(): boolean {
    return this.open;
  }

  /**
   * Starts what the policy has room for, oldest request first, and finishes
   * every waiting request beyond the queue's bound as overflowed. Called when
   * a request is recorded and whenever an attempt ends.
   */
  wake(): void {
    if (!this.open) return;
    const now = this.options.now?.() ?? Date.now();
    const attemptMs = this.options.attemptMs ?? 0;
    const busy = (request: string) => this.running.has(request) || this.finishing.has(request) || this.parked.has(request);
    const waiting: string[] = [];
    let nextStartBy: number | undefined;
    for (const request of this.options.unsettled()) {
      if (busy(request)) continue;
      const deadline = this.options.deadline?.(request) ?? null;
      if (deadline !== null && this.options.expire !== undefined && now + attemptMs > deadline) {
        this.finish(request, this.options.expire, 'finished as having no time before its deadline');
        continue;
      }
      if (deadline !== null) nextStartBy = Math.min(nextStartBy ?? Number.POSITIVE_INFINITY, deadline - attemptMs);
      waiting.push(request);
    }
    const room = Math.max(0, this.options.concurrency - this.running.size);
    const starting = waiting.slice(0, room);
    for (const request of waiting.slice(room + this.options.queue)) {
      this.finish(request, this.options.overflow, 'finished as overflowed');
    }
    for (const request of starting) {
      const task = this.options.attempt(request)
        .then(committed => { if (!committed) this.parked.add(request); })
        .catch(error => {
          this.parked.add(request);
          this.options.warn(`Review ${request}'s attempt failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        })
        .finally(() => {
          this.running.delete(request);
          this.wake();
          this.notify();
        });
      this.running.set(request, task);
    }
    // A request left waiting is looked at again once it could no longer
    // finish in time, even if no attempt ends before then.
    clearTimeout(this.timer);
    this.timer = undefined;
    const stillWaiting = waiting.length > starting.length;
    if (stillWaiting && nextStartBy !== undefined && Number.isFinite(nextStartBy)) {
      this.timer = setTimeout(() => this.wake(), Math.max(0, nextStartBy - now) + 1);
      this.timer.unref?.();
    }
  }

  /** Finishes one waiting request as not verified, once. */
  private finish(request: string, how: (request: string) => Promise<void>, what: string): void {
    const task = how(request)
      .catch(error => this.options.warn(`Review ${request} could not be ${what}: ${String(error)}`))
      .finally(() => {
        this.finishing.delete(request);
        this.notify();
      });
    this.finishing.set(request, task);
  }

  /** Starts nothing more; running attempts go on until they end or are stopped. */
  close(): void {
    this.open = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /**
   * Settles when the next attempt or finish ends, whichever request it
   * was for: a work item waiting for its own requests reads the log again
   * then. It is registered before the caller reads the log, so an end in
   * between still wakes it.
   */
  changed(): Promise<void> {
    return new Promise(resolve => { this.waiters.add(resolve); });
  }

  private notify(): void {
    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const waiter of waiters) waiter();
  }

  /** Settles once no attempt is running or being finished, including any started meanwhile. */
  async settled(): Promise<void> {
    while (this.running.size > 0 || this.finishing.size > 0) {
      await Promise.all([...this.running.values(), ...this.finishing.values()]);
    }
  }
}
