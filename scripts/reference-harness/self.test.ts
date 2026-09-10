import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plan1Instances } from './cases.js';
import { readReviewedPlan, repositoryRoot } from './plan.js';
import { verifyInstances } from './runner.js';
import { referenceRuntime } from './runtime.js';
import { selfHandlers } from './self-cases.js';
import { relocationHandlers } from './relocation.js';

describe('final toolkit acceptance instances', () => {
  it('registers exactly the three reviewed iteration 15 obligations', () => {
    expect([...selfHandlers.keys(), ...relocationHandlers.keys()].sort())
      .toEqual(plan1Instances.filter(instance => instance.iteration === 15).map(instance => instance.id).sort());
  });

  it('checks the real toolkit and detects the independently specified dispatch type violation', async () => {
    const report = await verifyInstances({ plan: readReviewedPlan(), records: plan1Instances,
      runtime: { capabilities: referenceRuntime.capabilities, handlers: selfHandlers },
      workRoot: join(repositoryRoot, '.reference-work') });
    expect(report.instances.filter(instance => selfHandlers.has(instance.id)).map(instance => ({ id: instance.id, status: instance.status, error: instance.error })))
      .toEqual([...selfHandlers.keys()].map(id => ({ id, status: 'passed', error: undefined })));
    expect(report.planComplete).toBe(false);
  }, 180_000);
});
