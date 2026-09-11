import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSystemClock } from '../system-clock.js';

afterEach(() => { try { expect(vi.getTimerCount()).toBe(0); } finally { vi.useRealTimers(); } });

describe('system clock', () => {
  it('reports wall-clock milliseconds and schedules without early delivery', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    const clock = createSystemClock();
    const run = vi.fn();
    const cancel = clock.schedule(100, run);
    try {
      expect(clock.now()).toBe(1_000_000);
      vi.advanceTimersByTime(99); expect(run).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1); expect(run).toHaveBeenCalledTimes(1);
      expect(clock.now()).toBe(1_000_100);
      cancel(); cancel();
      vi.advanceTimersByTime(100); expect(run).toHaveBeenCalledTimes(1);
    } finally { cancel(); }
  });

  it('cancels idempotently and allows callbacks to cancel another timer', () => {
    vi.useFakeTimers();
    const clock = createSystemClock();
    const run = vi.fn();
    const cancelSecond = clock.schedule(20, run);
    const cancelFirst = clock.schedule(10, cancelSecond);
    try {
      vi.advanceTimersByTime(30);
      expect(run).not.toHaveBeenCalled();
      cancelSecond(); cancelSecond();
    } finally { cancelFirst(); cancelSecond(); }
  });

  it('defers a zero-delay callback until the event loop advances', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const cancel = createSystemClock().schedule(0, run);
    try {
      expect(run).not.toHaveBeenCalled();
      vi.runOnlyPendingTimers(); expect(run).toHaveBeenCalledTimes(1);
    } finally { cancel(); }
  });

  it('splits long delays instead of letting Node overflow them to one millisecond', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const cancel = createSystemClock().schedule(2 ** 31 + 99, run);
    try {
      vi.advanceTimersByTime(2 ** 31 - 1); expect(run).not.toHaveBeenCalled();
      vi.advanceTimersByTime(99); expect(run).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1); expect(run).toHaveBeenCalledTimes(1);
    } finally { cancel(); }
  });

  it('cancels long delays after an intermediate timer has elapsed', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const cancel = createSystemClock().schedule(2 ** 31 + 99, run);
    try {
      vi.advanceTimersByTime(2 ** 31 - 1); cancel();
      vi.advanceTimersByTime(100); expect(run).not.toHaveBeenCalled();
    } finally { cancel(); }
  });

  it('rejects invalid durations without scheduling anything', () => {
    vi.useFakeTimers();
    const clock = createSystemClock();
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => clock.schedule(value, () => {})).toThrow(RangeError);
    }
  });
});
