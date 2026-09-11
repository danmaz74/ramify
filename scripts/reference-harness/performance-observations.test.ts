import { describe, expect, it } from 'vitest';
import { advisoryUpperBound, requireMeasuredBytes } from './performance-observations.js';

describe('advisory memory observations retain evidence requirements', () => {
  it('records high valid RSS and growth without enforcing empirical targets', () => {
    const rss = 256 * 1024 ** 2;
    requireMeasuredBytes([rss]);
    expect(advisoryUpperBound(rss, 64 * 1024 ** 2)).toEqual({ observed: rss, maximum: 64 * 1024 ** 2,
      enforcement: 'advisory', targetMet: false });
    expect(advisoryUpperBound(128 * 1024 ** 2, 16 * 1024 ** 2).targetMet).toBe(false);
    expect(advisoryUpperBound(-1024, 16 * 1024 ** 2).targetMet).toBe(true);
  });

  it('rejects absent, nonfinite and nonpositive raw memory evidence', () => {
    for (const values of [[], [NaN], [Infinity], [-Infinity], [0], [-1], [undefined as unknown as number]]) {
      expect(() => requireMeasuredBytes(values)).toThrow('Memory evidence');
    }
    for (const value of [NaN, Infinity, undefined as unknown as number]) {
      expect(() => advisoryUpperBound(value, 64 * 1024 ** 2)).toThrow('finite observations');
    }
  });
});
