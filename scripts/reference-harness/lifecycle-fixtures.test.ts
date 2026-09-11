import { it } from 'vitest';
import { lifecycleFixtureCases } from './lifecycle-fixture-cases.js';

for (const test of lifecycleFixtureCases) it(test.name, test.run, 10_000);
