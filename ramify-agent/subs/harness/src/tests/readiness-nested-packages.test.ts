import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { prepareCheckpoint } from '../run/gates.js';
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

describe('historical gate dependency links', () => {
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
