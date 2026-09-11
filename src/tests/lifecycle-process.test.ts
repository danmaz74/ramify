import { it } from 'vitest';
import { lifecycleProcessCases } from './lifecycle-process-cases.js';

for (const test of lifecycleProcessCases) it(test.name, test.run, 20_000);
