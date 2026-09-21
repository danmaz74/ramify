import { describe, expect, it } from 'vitest';
import { frozenData, immutable } from '../data.js';

describe('frozenData', () => {
  it('accepts deeply frozen plain JSON data, including what immutable returns', () => {
    expect(frozenData(immutable({ a: [1, 'b', { c: null, d: true }], e: {} }))).toBe(true);
    expect(frozenData('text')).toBe(true);
    expect(frozenData(null)).toBe(true);
  });

  it('rejects data that could change or is not JSON', () => {
    expect(frozenData({ a: 1 })).toBe(false);
    expect(frozenData(Object.freeze({ a: { b: 1 } }))).toBe(false);
    expect(frozenData(Object.freeze([Object.freeze([]), []]))).toBe(false);
    expect(frozenData(Object.freeze({ a: Number.NaN }))).toBe(false);
    expect(frozenData(Object.freeze({ a: undefined }))).toBe(false);
    expect(frozenData(Object.freeze(new Date(0)))).toBe(false);
    expect(frozenData(Object.freeze(Object.defineProperty({}, 'a', { get: () => 1, enumerable: true })))).toBe(false);
    expect(frozenData(Object.freeze(Object.defineProperty({}, 'a', { value: 1, enumerable: false })))).toBe(false);
    expect(frozenData(Object.freeze({ [Symbol('a')]: 1 }))).toBe(false);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(frozenData(Object.freeze(cycle))).toBe(false);
  });

  it('shares a verified subtree between parents', () => {
    const shared = immutable({ a: [1] });
    expect(frozenData(Object.freeze({ left: shared, right: shared }))).toBe(true);
  });
});
