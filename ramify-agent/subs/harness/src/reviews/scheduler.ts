/*
 * The review readers of one run: at most `concurrency` attempts at once,
 * beside the run's one writer, and at most `queue` requests waiting. The
 * waiting requests are read from the log each time the queue is woken, so a
 * retry is simply a request whose last attempt did not settle it, and the
 * queue holds nothing a restart would need.
 *
 * The writer is never scheduled here and never waits for a reader: readers
 * hold no writer, and their durable writes are short transitions under the
 * run mutex. That is the whole of the writer's priority in this version.
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
  readonly warn: (message: string) => void;
}

export class ReviewQueue {
  private readonly running = new Map<string, Promise<void>>();
  private readonly overflowing = new Map<string, Promise<void>>();
  private readonly parked = new Set<string>();
  private open = true;

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
    const waiting = this.options.unsettled()
      .filter(request => !this.running.has(request) && !this.overflowing.has(request) && !this.parked.has(request));
    const room = Math.max(0, this.options.concurrency - this.running.size);
    const starting = waiting.slice(0, room);
    for (const request of waiting.slice(room + this.options.queue)) {
      const task = this.options.overflow(request)
        .catch(error => this.options.warn(`Review ${request} could not be finished as overflowed: ${String(error)}`))
        .finally(() => this.overflowing.delete(request));
      this.overflowing.set(request, task);
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
        });
      this.running.set(request, task);
    }
  }

  /** Starts nothing more; running attempts go on until they end or are stopped. */
  close(): void {
    this.open = false;
  }

  /** Settles once no attempt is running or being finished, including any started meanwhile. */
  async settled(): Promise<void> {
    while (this.running.size > 0 || this.overflowing.size > 0) {
      await Promise.all([...this.running.values(), ...this.overflowing.values()]);
    }
  }
}
