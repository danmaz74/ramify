import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { prepareCheckpoint } from '../run/gates.js';
import { nestedPackagesStep, recoveryFor } from '../run/readiness.js';
import type { ReadinessAttempt } from '../run/records.js';
import { testPolicy } from './helpers/runs.js';

/*
 * Only a nested package whose tests the gate runs must be installed. One
 * without a test script, such as a fixture a script installs when it runs,
 * is noted in the readiness record and fails nothing; an isolated gate
 * links its dependencies only where the project installed them.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const tested = 'examples/collection-review';
const fixture = 'scripts/reference-harness/fixtures/module-tree-consumer';

function policy(root = '/project') {
  return testPolicy(root, { nested: [{ directory: tested, testScript: 'vitest run' }, { directory: fixture, testScript: null }] });
}

function attempt(nested: ReadinessAttempt['nested'], detail: string): ReadinessAttempt {
  return {
    schema: 'ramify-agent.readiness-attempt/1',
    attempt: 1,
    head: 'head',
    steps: [{ step: 'nested-packages', outcome: 'failed', detail }],
    nested,
    verdict: 'failed',
    recovery: null,
  };
}

describe('the nested packages step', () => {
  test('a package without a test script and without node_modules is noted, and the step passes', () => {
    const step = nestedPackagesStep([
      { directory: tested, installed: true, testScript: 'vitest run' },
      { directory: fixture, installed: false, testScript: null },
    ], policy());

    expect(step.outcome).toBe('passed');
    expect(step.detail).toContain(`node_modules is missing in ${fixture}, whose tests the gate does not run, so it need not be installed`);
  });

  test('a package whose tests the gate runs fails the step when it is not installed, and only it is installed again', () => {
    const nested = [
      { directory: tested, manifest: `${tested}/package.json`, installed: false, testScript: 'vitest run' },
      { directory: fixture, manifest: `${fixture}/package.json`, installed: false, testScript: null },
    ];
    const step = nestedPackagesStep(nested, policy());

    expect(step.outcome).toBe('failed');
    expect(step.detail).toContain(`node_modules is missing in ${tested}, whose tests the gate runs`);
    expect(step.detail).toContain(`node_modules is missing in ${fixture}, whose tests the gate does not run`);
    expect(recoveryFor(attempt(nested, step.detail), null, policy()))
      .toEqual({ cause: 'infrastructure', action: 'reinstall-nested', directories: [tested] });
  });

  test('a package discovered with a test script after the policy was captured is not required either', () => {
    const step = nestedPackagesStep([{ directory: 'site', installed: false, testScript: 'vitest run' }], policy());

    expect(step.outcome).toBe('passed');
    expect(step.detail).toContain('site appeared after the policy was captured');
  });
});

describe('the dependencies an isolated gate links', () => {
  test('every package whose tests run, and any other only where the project installed it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-agent-nested-links-'));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, tested), { recursive: true });
    await mkdir(join(root, fixture), { recursive: true });
    await mkdir(join(root, 'site', 'node_modules'), { recursive: true });
    const base = testPolicy(root, {
      nested: [
        { directory: tested, testScript: 'vitest run' },
        { directory: fixture, testScript: null },
        { directory: 'site', testScript: null },
      ],
    });

    const prepared = await prepareCheckpoint({
      id: 'ga-0002', runId: 'run', checkpoint: 'final', projectRoot: root,
      directory: join(root, 'gate'), head: 'head', policy: base,
    });

    expect('schema' in prepared).toBe(false);
    if ('schema' in prepared) return;
    expect(prepared.request.dependencyDirectories).toEqual([tested, 'site']);
  });
});
