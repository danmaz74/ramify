import { describe, expect, it } from 'vitest';
import { plan1Instances } from './cases.js';
import { staticHandlers } from './static-cases.js';

describe('iteration 9 matrix registration', () => {
  it('implements every assigned row and syntax variant without activating later iterations', () => {
    expect([...staticHandlers.keys()].sort()).toEqual(plan1Instances.filter(instance => instance.iteration === 9).map(instance => instance.id).sort());
    expect(staticHandlers.size).toBe(26);
  });
});
