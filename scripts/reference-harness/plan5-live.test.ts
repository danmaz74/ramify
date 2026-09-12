import { expect, it } from 'vitest';
import { plan5Instances } from './plan5-instances.js';
import { plan5LiveHandlers } from './plan5-live-cases.js';
import { liveInstanceSelection } from './plan5-live-smoke.js';
import { liveSelectionWitness } from './plan5-live-selection-witness.js';
import { Assertions } from './runner.js';

it('rejects empty selections and missing live providers before claiming execution', liveSelectionWitness);

// The same real-process providers run under automatic regression and the
// focused developer entry. Neither registration alone establishes acceptance.
it.each(liveInstanceSelection())('%s exercises live publication and cleanup', async id => {
  const handler = plan5LiveHandlers.get(id)!;
  if (handler.kind !== 'memory') throw new Error('Expected self-owned process fixture');
  const assertions = new Assertions();
  await handler.run({ instance: plan5Instances.find(instance => instance.id === id)!, assertions });
  const evidence = assertions.finish();
  expect(evidence.length).toBeGreaterThan(0);
  expect(evidence.every(item => item.status === 'passed')).toBe(true);
}, 1_800_000);
