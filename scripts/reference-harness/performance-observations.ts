import assert from 'node:assert/strict';

/** Advisory comparisons require actual finite measurements; absent or invalid
 * evidence still fails the gate independently of the empirical target. */
export function requireMeasuredBytes(values: readonly number[]): void {
  assert.ok(values.length > 0 && values.every(value => Number.isFinite(value) && value > 0),
    'Memory evidence requires positive finite byte measurements');
}

export function advisoryUpperBound(observed: number, maximum: number) {
  assert.ok(Number.isFinite(observed) && Number.isFinite(maximum) && maximum > 0,
    'Advisory comparison requires finite observations and a positive target');
  return { observed, maximum, enforcement: 'advisory' as const, targetMet: observed <= maximum };
}
