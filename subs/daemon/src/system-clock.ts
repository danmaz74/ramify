import type { ClockPort } from '../subs/contexts/src/interfaces/contexts.js';

const maximumDelay = 2 ** 31 - 1;

/** Each scheduled callback belongs to its returned cancellation function. */
export function createSystemClock(): ClockPort {
  return {
    now: () => Date.now(),
    schedule(delayMs, run) {
      if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
        throw new RangeError('Time must be a nonnegative safe integer');
      }
      let callback: (() => void) | undefined = run;
      let remaining = delayMs;
      let timer: ReturnType<typeof setTimeout>;
      function schedule(): void {
        const delay = Math.min(remaining, maximumDelay);
        remaining -= delay;
        timer = setTimeout(() => {
          if (!callback) return;
          if (remaining > 0) { schedule(); return; }
          const invoke = callback;
          callback = undefined;
          invoke();
        }, delay);
      }
      schedule();
      return () => { callback = undefined; clearTimeout(timer); };
    },
  };
}
