import { describe, expect, it } from 'vitest';
import { plan1Instances } from './cases.js';
import { boundedHandlers } from './bounded-cases.js';

describe('iteration 11 matrix registration', () => {
  it('implements every namespace, lazy and symbol-free instance and syntax variant', () => {
    expect([...boundedHandlers.keys()].sort()).toEqual(plan1Instances.filter(instance => instance.iteration === 11).map(instance => instance.id).sort());
    expect(boundedHandlers.size).toBe(44);
  });
});
