import { describe, expect, it } from 'vitest';
import { plan5Instances } from './plan5-instances.js';
import { plan2Instances } from './plan2-instances.js';
import { assertPlan2SupersessionAdmission } from './plan5-supersession-cases.js';
import { readReviewedPlan2 } from './plan.js';
import { Assertions, verifyInstances } from './runner.js';

describe('accepted Plan 2 supersession', () => {
  it('retains exact membership and rejects invented retirements, missing and failed counterparts', async () => {
    const assertions = new Assertions();
    await assertPlan2SupersessionAdmission(assertions);
    expect(assertions.finish()).toHaveLength(12);
  });
  it('reports retirement separately from execution and retains missing historical records as errors', async () => {
    const plan = readReviewedPlan2();
    const options = { plan, records: plan2Instances, runtime: { capabilities: new Set<never>(), handlers: new Map() }, workRoot: '.reference-work' };
    const report = await verifyInstances(options);
    expect(report.summary).toEqual({ required: 174, passed: 0, failed: 0, notExecuted: 174 });
    expect(report.instances.filter(instance => instance.status === 'superseded')).toHaveLength(10);
    expect(report.instances.filter(instance => instance.status === 'superseded').every(instance => !instance.required && instance.assertions.length === 0 && instance.supersededBy?.startsWith('I5-'))).toBe(true);
    const missing = await verifyInstances({ ...options, records: plan2Instances.filter(instance => instance.id !== 'I2-10:metadata-only-reuse') });
    expect(missing.inventoryIssues).toContain('Missing reviewed instance: I2-10:metadata-only-reuse');
    expect(missing.passed).toBe(false);
    expect(missing.instances.find(instance => instance.id === 'I5-07:readme-metadata-only')?.required).toBe(true);
    const missingCounterpart = await verifyInstances({ ...options, counterpartRecords: plan5Instances.filter(instance => instance.id !== 'I5-07:readme-metadata-only') });
    expect(missingCounterpart.inventoryIssues).toContain('Missing reviewed counterpart: I5-07:readme-metadata-only');
    expect(missingCounterpart.instances.find(instance => instance.id === 'I5-07:readme-metadata-only')?.reason).toBe('missing-record');
  });
});
