import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { measurementCase } from './helpers/measurement-flow.js';
import type { MeasurementEnvironment } from './helpers/measurement-flow.js';
import { measurementBoundaries } from './helpers/measurement-boundaries.js';
import { copyFixture } from './helpers/fixture.js';
import { openRuns } from './helpers/runs.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
const cleanups: Array<() => Promise<void>> = [];
const missing = new Set<string>();
const answers = new Map<string, ReturnType<typeof measurementBoundaries>>();
const required = new Map<string, string[]>();
function boundary(root: string) {
  let value = answers.get(root);
  if (!value) { value = measurementBoundaries(root); answers.set(root, value); required.set(root, ['measure']); }
  return value;
}
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
  for (const [root, answer] of answers) try { answer.assertComplete(required.get(root)!); } catch (error) { errors.push(error); }
  answers.clear(); required.clear(); missing.clear();
  try { expect(spawnAttempts(), 'ordinary measurement setup/flow/teardown process attempts').toEqual([]); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'Measurement fixture teardown failed');
});
const environment: MeasurementEnvironment = {
  cleanups,
  async target(purpose) { const fixture = await copyFixture(); cleanups.push(fixture.remove); boundary(fixture.root); if (purpose === 'publication') required.set(fixture.root, ['measure', 'materialize']); return fixture.root; },
  ramify(root) { return boundary(root).ramify; },
  missing(root) { missing.add(root); const answer = measurementBoundaries(root, true); answers.set(root, answer); required.set(root, ['measure']); return answer.ramify; },
  inputs(root) { const answer = boundary(root); required.set(root, ['measure', 'capture', '--version', 'head', 'clean', 'branch', 'trailer', 'commit']); return answer.inputs; },
  async open(root, options) {
    const selected = boundary(root);
    required.set(root, missing.has(root) ? ['measure', '--version', 'head', 'clean', 'stop-daemon'] : [...(required.get(root) ?? []), '--version', 'head', 'clean', ...(required.get(root)?.includes('branch') ? [] : ['branch', 'trailer', 'commit'])]);
    return openRuns(root, { ...options, ...selected.options, ramify: selected.ramify });
  },
};

describe('the frozen baseline', () => {
  test('a run freezes B from its first snapshot, and job.json names it', () => measurementCase(environment, 1), 180000);
  test('the initial architect\'s invocation records its snapshot reference and its S_s components', () => measurementCase(environment, 2), 180000);
});
describe('a component the producer cannot supply', () => {
  test('a project the measurement producer cannot measure leaves the baseline unavailable, never a zero', () => measurementCase(environment, 3), 120000);
  test('a run whose measurement document is absent still starts, with the reason in job.json', () => measurementCase(environment, 4), 180000);
});
describe('the recipe', () => {
  test('a subtree root covers the owners beneath it, and each is counted once', () => measurementCase(environment, 5), 180000);
  test('a module that does not exist yet has an unknown size, not a zero one', () => measurementCase(environment, 6), 180000);
  test('the architect view is measured at its publication size when one is published', () => measurementCase(environment, 7), 240000);
});

for (const operation of ['Git', 'Ramify', 'candidate'] as const) {
  test(`measurement scripts retain a caught ${operation} argument failure`, async () => {
    const answer = measurementBoundaries('/declared/project');
    if (operation === 'Git') await answer.options.git.currentHead('/wrong/project').catch(() => undefined);
    else if (operation === 'Ramify') await answer.ramify.run(['measure'], '/declared/project').catch(() => undefined);
    else await answer.options.candidates.commitTree('/declared/project', 'undeclared-commit').catch(() => undefined);
    expect(() => answer.assertAnswered()).toThrow();
  });
}
test('measurement scripts reject an unused required materialization answer', () => {
  const answer = measurementBoundaries('/declared/project');
  expect(() => answer.assertComplete(['materialize'])).toThrow('required materialize answer');
});
test('measurement scripts retain an exhausted mutation answer even when caught', async () => {
  const fixture = await copyFixture(); cleanups.push(fixture.remove);
  const answer = measurementBoundaries(fixture.root);
  await answer.ramify.materialize(fixture.root);
  await answer.ramify.materialize(fixture.root).catch(() => undefined);
  expect(() => answer.assertAnswered()).toThrow('exhausted materialize');
});
