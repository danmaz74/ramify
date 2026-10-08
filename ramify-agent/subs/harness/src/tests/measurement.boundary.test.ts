import { afterAll, afterEach, beforeAll, describe, test } from 'vitest';
import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { measurementCase } from './helpers/measurement-flow.js';
import type { MeasurementEnvironment } from './helpers/measurement-flow.js';
import { viewedInputs } from './helpers/iterations.js';
import { copyFixture } from './helpers/fixture.js';
import { initRepository, installTestRunner, openRuns, realRamify } from './helpers/runs.js';
let daemon: Awaited<ReturnType<typeof realRamify>>;
beforeAll(async () => { daemon = await realRamify(); }, 120_000);
afterAll(async () => { await daemon?.dispose(); }, 120_000);
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'Actual measurement witness cleanup failed');
});
// The installed producer really materializes views and supplies document bytes.
// Configured audit outcomes/agents remain synthetic; no audit-publication claim.
const environment: MeasurementEnvironment = {
  cleanups,
  async target() { const fixture = await copyFixture(); cleanups.push(fixture.remove); await installTestRunner(fixture.root); await initRepository(fixture.root); return fixture.root; },
  ramify() { return daemon.ramify; },
  missing(root) { return new RamifyCli({ executable: `${root}/no-such-ramify`, timeoutMs: 10_000 }); },
  inputs() { return viewedInputs(daemon.ramify); },
  open(root, options) { return openRuns(root, { ...options, git: gitService }); },
};
describe('the frozen baseline', () => {
  test('a run freezes B from its first snapshot, and job.json names it', () => measurementCase(environment, 1), 180000);
});
describe('the recipe', () => {
  test('the architect view is measured at its publication size when one is published', () => measurementCase(environment, 7), 240000);
});
