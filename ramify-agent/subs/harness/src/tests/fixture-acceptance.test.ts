import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { inPlaceCheckExecution } from '../checks/execution.js';
import { runCheckpoint } from '../run/gates.js';
import { captureProjectConfig, scenarioModules } from '../run/project-config.js';
import { runReadiness } from '../run/readiness.js';
import type { ScenarioCheckInputs } from '../checks/checkpoint.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { copyFixture } from './helpers/fixture.js';
import { initRepository, testPolicy } from './helpers/runs.js';
import { scriptedGit } from './helpers/scripted-git.js';

/*
 * The `collection-review` fixture's own scenario harness under the scenario
 * check, with the fixture's toolchain installed and the real cucumber-js:
 * readiness passes its four acceptance steps, and the work-item and final
 * gates run the fixture's existing scenario, in quick and in full mode. The
 * other commands of each gate are the test policy's, which exit 0.
 *
 * Not part of the default suite: preparing the copy runs `npm ci`, which
 * needs the registry or npm's cache. Run it with
 *
 *   RAMIFY_AGENT_FIXTURE_ACCEPTANCE=1 node_modules/.bin/vitest run subs/harness/src/tests/fixture-acceptance.test.ts
 */

const exec = promisify(execFile);
const enabled = process.env.RAMIFY_AGENT_FIXTURE_ACCEPTANCE === '1';

describe.runIf(enabled)('the fixture\'s scenario harness with its toolchain installed', () => {
  let root = '';
  let head = '';
  let remove: () => Promise<void> = async () => undefined;

  beforeAll(async () => {
    const copy = await copyFixture();
    root = copy.root;
    remove = copy.remove;
    // Node's own flags for vitest must not reach the fixture's processes.
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'NODE_OPTIONS'));
    await exec('npm', ['ci', '--no-audit', '--no-fund'], { cwd: root, env, timeout: 600_000 });
    head = await initRepository(root);
  }, 660_000);

  afterAll(async () => {
    await remove();
  });

  async function inputs(): Promise<ScenarioCheckInputs> {
    const captured = await captureProjectConfig(root);
    if (!('config' in captured)) throw new Error(captured.invalid);
    return { harness: captured.config.acceptance, modules: await scenarioModules(root, null), scenarios: [] };
  }

  test('readiness passes all four acceptance steps', async () => {
    const result = await runReadiness(inPlaceCheckExecution, {
      runId: 'run-readiness',
      attempt: 1,
      projectRoot: root,
      gateDirectory: `${root}/plans/.harness-readiness`,
      gateId: 'ga-0001',
      policy: testPolicy(root),
      projectConfig: await captureProjectConfig(root),
      index: null,
      ramify: new FakeRamifyCli(),
      git: scriptedGit(root, { head, checkpoints: [] }),
      head,
    });
    const steps = new Map(result.attempt.steps.map(step => [step.step, step]));
    for (const step of ['project-config', 'acceptance-runner', 'baseline-acceptance', 'acceptance-full']) {
      expect(steps.get(step as never), `${step}: ${steps.get(step as never)?.detail}`).toMatchObject({ outcome: 'passed' });
    }
    expect(result.attempt.verdict).toBe('passed');
    const [quick, dry] = result.gate!.commands.filter(command => command.kind === 'scenarios');
    expect(quick!.scenarios).toMatchObject({ mode: 'quick', runs: [{ module: 'collection-review/integration-tests', exit: 0 }], untracked: { passed: 1, skipped: 0, failed: 0 } });
    expect(dry!.scenarios).toMatchObject({ mode: 'full', dryRun: true, untracked: { passed: 0, skipped: 1, failed: 0 } });
  }, 300_000);

  test.each([
    ['work-item', 'quick'],
    ['final', 'full'],
  ] as const)('the %s gate runs the fixture\'s existing scenario in %s mode', async (checkpoint, mode) => {
    const attempt = await runCheckpoint(inPlaceCheckExecution, {
      id: checkpoint === 'final' ? 'ga-0003' : 'ga-0002',
      checkpoint,
      projectRoot: root,
      directory: `${root}/plans/.harness-${checkpoint}`,
      head,
      policy: testPolicy(root),
      scenarios: await inputs(),
    });
    const command = attempt.commands.find(entry => entry.kind === 'scenarios')!;
    expect(command.scenarios?.failures, command.output.tail).toEqual([]);
    expect(command.scenarios).toMatchObject({ mode, dryRun: false, runs: [{ module: 'collection-review/integration-tests', exit: 0 }], untracked: { passed: 1, skipped: 0, failed: 0 } });
    expect(attempt.verdict).toBe('passed');
  }, 300_000);
});
