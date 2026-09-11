import { it } from 'vitest';
import { completionRegressionControls } from './completion-regression-controls.js';

it('requires complete same-input Plan 1 evidence and preserves newer failures', async () => {
  await completionRegressionControls();
}, 30_000);
