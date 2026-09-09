import { describe, expect, it } from 'vitest';

import { plan1Instances } from './cases.js';
import { readReviewedPlan, requiredIterations, validateInstancePointers, validateInstanceRecords } from './plan.js';
import { requiredCapabilities } from './runner.js';

const plan = readReviewedPlan();

describe('the reviewed Plan 1 leaf inventory', () => {
  it('retains every group, syntax variant, expectation, family and stage assignment', () => {
    expect(plan1Instances).toHaveLength(308);
    expect(validateInstanceRecords(plan1Instances, plan)).toEqual([]);
    expect(validateInstancePointers(plan1Instances)).toEqual([]);
    const counts = Array.from({ length: 15 }, (_, n) => plan1Instances.filter((record) => record.iteration === n + 1).length);
    expect(counts).toEqual([0, 0, 14, 53, 35, 3, 34, 0, 26, 36, 44, 23, 22, 15, 3]);
  });

  it('keeps TypeScript and checked JavaScript import types as separate records', () => {
    const variants = plan1Instances.filter((record) => record.matrixId === 'I1-21' && record.subcase === 'import-type');
    expect(variants.map((record) => [record.id, record.fixture.code])).toEqual([
      ['I1-21:import-type/typescript', 'F'], ['I1-21:import-type/jsdoc-javascript', 'J'],
    ]);
    expect(variants[1].expectation.variant).toContain('allowJs and checkJs both true');
    expect(variants.every((record) => record.fixture.configuration?.includes('discover'))).toBe(true);
  });

  it('does not store execution status or silently omit a required leaf', () => {
    expect(plan1Instances.every((record) => !('status' in record) && !('execution' in record))).toBe(true);
    const removed = plan1Instances.filter((record) => record.id !== 'I1-14:renamed-kinds');
    expect(validateInstanceRecords(removed, plan)).toEqual(['Missing reviewed instance: I1-14:renamed-kinds']);
  });

  it('rejects duplicates, extra records and changed independent expectations', () => {
    const first = plan1Instances[0];
    expect(validateInstanceRecords([...plan1Instances, first], plan)).toContain(`Duplicate instance: ${first.id}`);
    expect(validateInstanceRecords([...plan1Instances, { ...first, id: 'I1-01:invented' }], plan)).toContain('Unreviewed instance: I1-01:invented');
    expect(validateInstanceRecords([{ ...first, expectation: { summary: 'Always pass', variant: null } }, ...plan1Instances.slice(1)], plan))
      .toContain(`Instance differs from reviewed metadata: ${first.id}`);
  });

  it('requires transitive prerequisites while preserving parallel branches', () => {
    expect(requiredIterations(plan, 3)).toEqual([1, 2, 3]);
    expect(requiredIterations(plan, 5)).toEqual([1, 2, 4, 5]);
    expect(requiredIterations(plan, 11)).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 11]);
    expect(requiredIterations(plan)).toEqual(Array.from({ length: 15 }, (_, n) => n + 1));
    expect(() => requiredIterations(plan, 16)).toThrow('Unknown iteration');
    expect(() => requiredIterations({ ...plan, prerequisites: { 1: [2], 2: [1] } }, 1)).toThrow('Cyclic prerequisite');
  });

  it('requires source-stage prerequisites without imposing future resource checking on catalog cases', () => {
    const catalog = plan1Instances.find((record) => record.id === 'I1-23:two-css-resources')!;
    expect(requiredCapabilities(catalog)).toEqual(['acquire', 'catalog', 'parse', 'registry']);
    const baseline = plan1Instances[0];
    expect(requiredCapabilities(baseline)).toEqual(expect.arrayContaining(['registry', 'parse', 'acquire', 'catalog', 'link', 'static-access', 'resources', 'session']));
  });
});
