import { expect, it } from 'vitest';
import { cliHandlers } from './cli-cases.js';
import { plan1Instances } from './cases.js';

it('registers all 22 reviewed iteration 13 process and CLI variants separately', () => {
  expect(cliHandlers.size).toBe(22);
  expect([...cliHandlers.keys()].sort()).toEqual(plan1Instances.filter(instance => instance.iteration === 13).map(instance => instance.id).sort());
});
