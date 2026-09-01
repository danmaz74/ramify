import { describe, expect, it } from 'vitest';

import {
  CENTER,
  MAX_SCALE,
  MIN_SCALE,
  clampPan,
  isReset,
  normalizeWheelDelta,
  panBy,
  scaleOf,
  wheelFactor,
  zoomAt,
  type ViewRect,
} from './viewport.js';

const base: ViewRect = { x: 0, y: 0, width: 1000, height: 800 };

describe('zoom', () => {
  it('keeps the anchored point under the anchor', () => {
    // The point 25% across the viewport must still be 25% across after zooming.
    const zoomed = zoomAt(base, base, { u: 0.25, v: 0.75 }, 2);
    expect(zoomed.x + 0.25 * zoomed.width).toBeCloseTo(base.x + 0.25 * base.width, 6);
    expect(zoomed.y + 0.75 * zoomed.height).toBeCloseTo(base.y + 0.75 * base.height, 6);
    expect(scaleOf(base, zoomed)).toBeCloseTo(2, 6);
  });

  it('keeps the aspect ratio, so responsive height stays right', () => {
    const zoomed = zoomAt(base, base, CENTER, 1.7);
    expect(zoomed.width / zoomed.height).toBeCloseTo(base.width / base.height, 6);
  });

  it('clamps at both limits, and settles on them rather than refusing', () => {
    let view = base;
    for (let step = 0; step < 40; step += 1) {
      view = zoomAt(base, view, CENTER, 1.25);
    }
    expect(scaleOf(base, view)).toBeCloseTo(MAX_SCALE, 6);

    for (let step = 0; step < 60; step += 1) {
      view = zoomAt(base, view, CENTER, 1 / 1.25);
    }
    expect(scaleOf(base, view)).toBeCloseTo(MIN_SCALE, 6);

    // Already at the limit: a further request changes nothing at all.
    expect(zoomAt(base, view, CENTER, 1 / 4)).toBe(view);
  });

  it('turns wheel deltas into gentle, symmetric steps', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-100) * wheelFactor(100)).toBeCloseTo(1, 6);
    // A violent trackpad flick is capped, not obeyed.
    expect(wheelFactor(-100000)).toBeCloseTo(wheelFactor(-240), 6);
  });

  it('normalises line- and page-mode wheels, which otherwise do nothing', () => {
    // Firefox reports ~3 lines per notch, not ~100 pixels. Taken raw that is a
    // 0.7% zoom step, which reads as "the wheel is broken".
    expect(normalizeWheelDelta(-3, 1)).toBe(-48);
    expect(normalizeWheelDelta(-1, 2)).toBe(-400);
    expect(normalizeWheelDelta(-100, 0)).toBe(-100);

    const oneNotchInLines = wheelFactor(-3, 1);
    const oneNotchInPixels = wheelFactor(-100, 0);
    // Both units produce a step a reader can see, within the same order of
    // magnitude of each other - not the same number, since 3 lines and 100
    // pixels are not the same distance.
    expect(oneNotchInLines).toBeGreaterThan(1.1);
    expect(oneNotchInPixels).toBeGreaterThan(1.1);
    expect(oneNotchInPixels / oneNotchInLines).toBeLessThan(1.5);
    // The regression itself: unnormalised, a line-mode notch is invisible.
    expect(Math.exp(-(-3) * 0.0025)).toBeLessThan(1.01);
  });
});

describe('pan', () => {
  it('moves the window opposite the drag, so content follows the pointer', () => {
    const zoomed = zoomAt(base, base, CENTER, 2);
    const panned = panBy(base, zoomed, 100, 50);
    expect(panned.x).toBeCloseTo(zoomed.x - 100, 6);
    expect(panned.y).toBeCloseTo(zoomed.y - 50, 6);
  });

  it('never lets the diagram be dragged entirely out of sight', () => {
    const zoomed = zoomAt(base, base, CENTER, 2);
    const far = panBy(base, zoomed, -100000, -100000);
    // At least half the viewport still overlaps the diagram.
    expect(far.x + far.width).toBeGreaterThan(base.x);
    expect(far.x).toBeLessThan(base.x + base.width);
    expect(clampPan(base, far)).toEqual(far);
  });
});

describe('reset', () => {
  it('recognises the untouched view', () => {
    expect(isReset(base, base)).toBe(true);
    expect(isReset(base, zoomAt(base, base, CENTER, 1.25))).toBe(false);
  });
});
