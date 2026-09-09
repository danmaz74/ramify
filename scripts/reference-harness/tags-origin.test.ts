import { describe, expect, it } from 'vitest';
import { plan1Instances } from './cases.js';
import { tagsOriginHandlers } from './tags-origin-cases.js';

describe('iteration 10 matrix registration', () => {
  it('implements every tag and origin instance with all reviewed variants', () => {
    expect([...tagsOriginHandlers.keys()].sort()).toEqual(plan1Instances.filter(instance => instance.iteration === 10).map(instance => instance.id).sort());
    expect(tagsOriginHandlers.size).toBe(36);
  });
});
