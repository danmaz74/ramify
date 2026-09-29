/** A running-time budget. Concurrent pauses exclude their union once. */
export class PausableDeadline {
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private remainingMs: number;
  private armedAt = 0;
  private pauses = 0;
  private disposed = false;

  constructor(budgetMs: number, private readonly now: () => number = Date.now) {
    this.remainingMs = budgetMs;
    this.signal = this.controller.signal;
    this.arm();
  }

  /** Returns an idempotent release. A second wait cannot resume the first. */
  pause(): () => void {
    if (this.disposed) return () => undefined;
    if (this.pauses++ === 0) {
      this.remainingMs = Math.max(0, this.remainingMs - (this.now() - this.armedAt));
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.pauses--;
      if (this.pauses === 0 && !this.disposed) this.arm();
    };
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  get remaining(): number {
    return this.pauses > 0 || this.disposed ? this.remainingMs
      : Math.max(0, this.remainingMs - (this.now() - this.armedAt));
  }

  private arm(): void {
    if (this.disposed || this.signal.aborted) return;
    if (this.remainingMs <= 0) {
      this.controller.abort(new Error('Deadline exceeded'));
      return;
    }
    this.armedAt = this.now();
    this.timer = setTimeout(() => this.controller.abort(new Error('Deadline exceeded')), this.remainingMs);
  }
}
