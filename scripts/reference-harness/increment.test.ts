import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { incrementHandlers } from './increment-cases.js';
import { plan2Instances } from './plan2-instances.js';
import { readReviewedPlan2, repositoryRoot } from './plan.js';
import { verifyInstances } from './runner.js';

describe('real incremental analysis providers', () => {
  it('implements exactly the eighteen reviewed iteration-3 instances', () => {
    expect([...incrementHandlers.keys()].sort()).toEqual(plan2Instances.filter(instance => instance.iteration === 3).map(instance => instance.id).sort());
  });
  it.each([...incrementHandlers])('%s exercises actual providers and its independent expectation', async (id, handler) => {
    const report = await verifyInstances({ plan: readReviewedPlan2(), records: plan2Instances, iteration: 3,
      runtime: { capabilities: new Set(['increment']), handlers: new Map([[id, handler]]) },
      workRoot: join(repositoryRoot, '.reference-work/increment-tests'), preserveOnFailure: true });
    const result = report.instances.find(instance => instance.id === id)!;
    expect({ status: result.status, error: result.error, failedAssertions: result.assertions.filter(a => a.status === 'failed') })
      .toEqual({ status: 'passed', error: undefined, failedAssertions: [] });
  }, 180_000);
});
