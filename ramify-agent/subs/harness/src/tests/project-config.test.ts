import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { captureProjectConfig, moduleTestAreas, parseProjectConfig } from '../run/project-config.js';
import { withProjectTimeouts } from '../run/policy.js';
import { readinessFailureReason } from '../run/readiness.js';
import { runLayout, type ReadinessAttempt, type RunRecord } from '../run/records.js';
import type { ArchitectIndex, ModuleEntry } from '../../subs/evidence/src/views.js';
import { copyFixture, fixtureRoot, temporaryDirectory } from './helpers/fixture.js';
import { expectNoProcesses, forgetExternalTools, openRunsWithoutProcesses } from './helpers/external-tools.js';
import { minimalProjectConfig, writeProjectConfig } from './helpers/project-config.js';
import { emptyAnalysis, installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun, testPolicy } from './helpers/runs.js';
import { scriptedGit } from './helpers/scripted-git.js';

/*
 * The project's configuration, `ramify-agent.json`, and the two readiness
 * steps that read it. The schema is exercised on its own; the steps through
 * a run on a copy of the fixture, whose Git, command line and baseline are
 * answered rather than run, so that what each step records and the reason
 * the run fails with are what the harness established.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { expectNoProcesses(); } finally { forgetExternalTools(); }
});

/** A valid configuration, as the fixture declares it, to derive each rejection from. */
function valid(): Record<string, unknown> {
  return {
    schema: 'ramify-agent.project/1',
    acceptance: {
      support: ['subs/integration-tests/src/support/world.ts', 'subs/integration-tests/src/support/hooks.ts'],
      modes: {
        quick: { command: ['npm', 'run', 'acceptance:quick', '--'] },
        full: { command: ['npm', 'run', 'acceptance:full', '--'] },
      },
    },
  };
}

/** The configuration with one change at a path, `undefined` removing the field. */
function changed(path: readonly string[], value: unknown): string {
  const config = valid();
  let node = config as Record<string, unknown>;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>;
  if (value === undefined) delete node[path.at(-1)!];
  else node[path.at(-1)!] = value;
  return JSON.stringify(config);
}

describe('the ramify-agent.project/1 schema', () => {
  test('accepts the fixture\'s file, with full mode\'s readiness defaulting to dry-run', async () => {
    const parsed = parseProjectConfig(await readFile(join(fixtureRoot, 'ramify-agent.json'), 'utf8'));
    expect('config' in parsed).toBe(true);
    if (!('config' in parsed)) return;
    expect(parsed.config.acceptance.support).toEqual([
      'subs/integration-tests/src/support/world.ts',
      'subs/integration-tests/src/support/hooks.ts',
    ]);
    expect(parsed.config.acceptance.modes.quick).toEqual({ command: ['npm', 'run', 'acceptance:quick', '--'] });
    expect(parsed.config.acceptance.modes.full.readiness).toBe('dry-run');
    expect(parsed.config.typeCheck).toEqual({ output: 'tsc' });

    const defaulted = parseProjectConfig(JSON.stringify(valid()));
    expect('config' in defaulted && defaulted.config.acceptance.modes.full.readiness).toBe('dry-run');
  });

  test('accepts setup and teardown on either mode, globs in support, and readiness run', () => {
    const config = valid();
    const acceptance = config['acceptance'] as { support: string[]; modes: Record<string, Record<string, unknown>> };
    acceptance.support = ['src/tests/support/*.ts'];
    acceptance.modes['quick']!['setup'] = ['npm', 'run', 'db:start'];
    acceptance.modes['full']!['setup'] = ['npm', 'run', 'acceptance:server:start'];
    acceptance.modes['full']!['teardown'] = ['npm', 'run', 'acceptance:server:stop'];
    acceptance.modes['full']!['readiness'] = 'run';

    const parsed = parseProjectConfig(JSON.stringify(config));
    expect('config' in parsed).toBe(true);
    if (!('config' in parsed)) return;
    expect(parsed.config.acceptance.modes.full).toEqual({
      command: ['npm', 'run', 'acceptance:full', '--'],
      setup: ['npm', 'run', 'acceptance:server:start'],
      teardown: ['npm', 'run', 'acceptance:server:stop'],
      readiness: 'run',
    });
    expect(parseProjectConfig(changed(['acceptance', 'support'], []))).toHaveProperty('config');
  });

  test.each([
    ['text that is not JSON', '{ "schema": ', /is not JSON/],
    ['another version', changed(['schema'], 'ramify-agent.project/2'), /schema: /],
    ['no acceptance section', changed(['acceptance'], undefined), /acceptance: /],
    ['no support list', changed(['acceptance', 'support'], undefined), /acceptance\.support: /],
    ['a support entry that is empty', changed(['acceptance', 'support'], ['']), /acceptance\.support\.0: /],
    ['no quick mode', changed(['acceptance', 'modes', 'quick'], undefined), /acceptance\.modes\.quick: /],
    ['no full mode', changed(['acceptance', 'modes', 'full'], undefined), /acceptance\.modes\.full: /],
    ['an empty command', changed(['acceptance', 'modes', 'quick', 'command'], []), /acceptance\.modes\.quick\.command: /],
    ['a command that is a string', changed(['acceptance', 'modes', 'full', 'command'], 'npm run acceptance:full'), /acceptance\.modes\.full\.command: /],
    ['an unknown readiness', changed(['acceptance', 'modes', 'full', 'readiness'], 'skip'), /acceptance\.modes\.full\.readiness: /],
    ['readiness on quick mode', changed(['acceptance', 'modes', 'quick', 'readiness'], 'run'), /acceptance\.modes\.quick: .*readiness/],
    ['a third mode', changed(['acceptance', 'modes', 'browser'], { command: ['x'] }), /acceptance\.modes: .*browser/],
    ['a field v1 does not define', changed(['tests'], { command: ['npm', 'test'] }), /<root>: .*tests/],
    ['a timeout of zero', changed(['timeouts'], { tests: 0 }), /timeouts\.tests: /],
    ['a timeout that is not a whole number of milliseconds', changed(['timeouts'], { typeCheck: 1.5 }), /timeouts\.typeCheck: /],
    ['a timeout above the ceiling', changed(['timeouts'], { ramifyCheck: 7_200_001 }), /timeouts\.ramifyCheck: A command timeout is at most 7200000 ms \(two hours\)/],
    ['a timeout for a command the gate does not run', changed(['timeouts'], { lint: 60_000 }), /timeouts: .*lint/],
  ])('rejects %s with the schema\'s message', (_name, text, message) => {
    const parsed = parseProjectConfig(text);
    expect(parsed).toHaveProperty('invalid');
    expect('invalid' in parsed ? parsed.invalid : '').toMatch(message);
    if (_name !== 'text that is not JSON') expect('invalid' in parsed ? parsed.invalid : '').toContain('does not validate against ramify-agent.project/1');
  });

  test('accepts gate command timeouts, each up to the ceiling', () => {
    const timeouts = { typeCheck: 600_000, tests: 7_200_000, scopedTests: 900_000, ramifyCheck: 1_200_000 };
    const parsed = parseProjectConfig(changed(['timeouts'], timeouts));
    expect('config' in parsed && parsed.config.timeouts).toEqual(timeouts);
    expect(parseProjectConfig(changed(['timeouts'], {}))).toHaveProperty('config');
  });

  test('its timeouts replace the policy\'s own gate command timeouts, and nothing else of the policy', () => {
    const policy = testPolicy('/project', { nested: [{ directory: 'tools/catalog', testScript: 'vitest run' }] });
    const captured = { path: 'ramify-agent.json', hash: 'a'.repeat(64), config: { ...minimalProjectConfig, timeouts: { typeCheck: 400_000, tests: 1_800_000, scopedTests: 700_000, ramifyCheck: 900_000 } } };
    const timed = withProjectTimeouts(policy, captured);
    expect(timed.commands.typeCheck.timeoutMs).toBe(400_000);
    expect(timed.commands.allTests.timeoutMs).toBe(1_800_000);
    expect(timed.commands.nestedPackages[0]!.tests!.timeoutMs).toBe(1_800_000);
    expect(timed.commands.scopedTests.timeoutMs).toBe(700_000);
    expect(timed.commands.ramifyCheck.timeoutMs).toBe(900_000);
    // What the configuration does not name is the policy's.
    expect(timed.commands.ramifyChanged).toEqual(policy.commands.ramifyChanged);
    expect(timed.commands.nestedPackages[0]!.install).toEqual(policy.commands.nestedPackages[0]!.install);
    expect({ ...timed, commands: undefined }).toEqual({ ...policy, commands: undefined });
    expect(timed.commands.typeCheck.argv).toEqual(policy.commands.typeCheck.argv);

    // One timeout replaces one command's; a missing or invalid file changes nothing.
    const one = withProjectTimeouts(policy, { ...captured, config: { ...minimalProjectConfig, timeouts: { tests: 1_000_000 } } });
    expect(one.commands.allTests.timeoutMs).toBe(1_000_000);
    expect(one.commands.typeCheck).toEqual(policy.commands.typeCheck);
    expect(withProjectTimeouts(policy, { path: 'ramify-agent.json', hash: null, invalid: 'missing' })).toBe(policy);
  });

  test('a missing, invalid or valid file is captured with its reason or its hash, never thrown', async () => {
    const directory = await temporaryDirectory();
    cleanups.push(directory.remove);

    expect(await captureProjectConfig(directory.path)).toEqual({ path: 'ramify-agent.json', hash: null, invalid: 'ramify-agent.json is missing at the project root' });

    await writeFile(join(directory.path, 'ramify-agent.json'), changed(['acceptance', 'modes', 'full'], undefined));
    const invalid = await captureProjectConfig(directory.path);
    expect(invalid).toMatchObject({ path: 'ramify-agent.json', hash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown });
    expect('invalid' in invalid && invalid.invalid).toMatch(/^ramify-agent\.json does not validate against ramify-agent\.project\/1: acceptance\.modes\.full: /);

    await writeProjectConfig(directory.path);
    expect(await captureProjectConfig(directory.path)).toEqual({
      path: 'ramify-agent.json', hash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown, config: minimalProjectConfig,
    });
  });
});

describe('the test areas support code must lie in', () => {
  test('without a view, the declarations on disk name every module, a testing module by its whole src/', async () => {
    const areas = await moduleTestAreas(fixtureRoot, null);
    expect(areas.map(area => area.area)).toContain('src/tests');
    expect(areas).toContainEqual({ module: 'integration-tests', area: 'subs/integration-tests/src' });
    expect(areas).toContainEqual({ module: 'shared-ui', area: 'subs/workspace/subs/shared-ui/src/tests' });
    expect(areas).toContainEqual({ module: 'ui', area: 'subs/workspace/subs/reviews/subs/ui/src/tests' });
    expect(areas).toHaveLength(15);
  });

  test('with a view, its modules and their header tags decide', async () => {
    const entry = (module: string, dir: string, tags: string[]): ModuleEntry => ({ module, dir, parent: null, children: [], tags, areas: [] });
    const index: ArchitectIndex = {
      revision: 'r', input: 'i', symbols: new Map(),
      modules: new Map([
        ['shop', entry('shop', '', [])],
        ['shop/acceptance', entry('shop/acceptance', 'subs/acceptance', ['testing'])],
      ]),
    };
    expect(await moduleTestAreas('/nonexistent', index)).toEqual([
      { module: 'shop', area: 'src/tests' },
      { module: 'shop/acceptance', area: 'subs/acceptance/src' },
    ]);
  });
});

describe('the project-config and acceptance-runner readiness steps', () => {
  /** A fresh copy of the fixture, with its runners installed, changed by `prepare`. */
  async function fixture(prepare: (root: string) => Promise<void> = async () => undefined): Promise<string> {
    const copy = await copyFixture();
    cleanups.push(copy.remove);
    await installTestRunner(copy.root);
    await prepare(copy.root);
    return copy.root;
  }

  /** Runs the fixture's `review-notes` plan to its end with an empty analysis, and answers what readiness recorded. */
  async function run(root: string, passes: boolean) {
    const git = scriptedGit(root, {
      head: 'project-config-base',
      checkpoints: passes ? [{ subject: 'final verification of plan "review-notes"', commit: null, changes: [] }] : [],
    });
    const { service } = await openRunsWithoutProcesses(root, git, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    git.assertComplete();

    const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    const failures = events.flatMap(event => (event.type === 'readiness-failed' ? [event.data] : []));
    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.readiness(1)), 'utf8')) as ReadinessAttempt;
    const record = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.record), 'utf8')) as RunRecord;
    const step = (name: string) => attempt.steps.find(entry => entry.step === name)!;
    return { snapshot: onlyRun(service, 'review-notes'), failures, attempt, record, step, git };
  }

  test('the fixture passes both steps, after test-runner, and job.json captures its configuration beside the policy', async () => {
    const root = await fixture();
    const { snapshot, attempt, record, step } = await run(root, true);

    expect(snapshot.state).toBe('completed');
    expect(attempt.steps.map(entry => entry.step).slice(3, 6)).toEqual(['test-runner', 'project-config', 'acceptance-runner']);
    expect(step('project-config')).toMatchObject({ outcome: 'passed' });
    expect(step('project-config').detail).toBe(
      'ramify-agent.json validates against ramify-agent.project/1; its support code is subs/integration-tests/src/support/world.ts, subs/integration-tests/src/support/hooks.ts; full mode\'s readiness is dry-run',
    );
    expect(step('acceptance-runner')).toMatchObject({ outcome: 'passed' });
    expect(step('acceptance-runner').detail).toContain('quick mode runs `npm run acceptance:quick --`, full mode `npm run acceptance:full --`');

    const keys = Object.keys(record);
    expect(keys.indexOf('projectConfig')).toBe(keys.indexOf('policy') + 1);
    expect(record.projectConfig).toEqual({
      path: 'ramify-agent.json',
      hash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      config: {
        schema: 'ramify-agent.project/1',
        typeCheck: { output: 'tsc' },
        acceptance: {
          support: ['subs/integration-tests/src/support/world.ts', 'subs/integration-tests/src/support/hooks.ts'],
          modes: {
            quick: { command: ['npm', 'run', 'acceptance:quick', '--'] },
            full: { command: ['npm', 'run', 'acceptance:full', '--'], readiness: 'dry-run' },
          },
        },
      },
    });
  }, 180_000);

  test('gate command timeouts the configuration declares are the ones job.json captures in the policy', async () => {
    const root = await fixture(async path => {
      const config = JSON.parse(await readFile(join(path, 'ramify-agent.json'), 'utf8')) as Record<string, unknown>;
      await writeProjectConfig(path, { ...config, timeouts: { tests: 1_800_000, typeCheck: 450_000 } });
    });
    const { snapshot, record } = await run(root, true);

    expect(snapshot.state).toBe('completed');
    expect('config' in record.projectConfig && record.projectConfig.config.timeouts).toEqual({ tests: 1_800_000, typeCheck: 450_000 });
    expect(record.policy.commands.allTests.timeoutMs).toBe(1_800_000);
    expect(record.policy.commands.typeCheck.timeoutMs).toBe(450_000);
    expect(record.policy.commands.scopedTests.timeoutMs).toBe(testPolicy(root).commands.scopedTests.timeoutMs);
  }, 180_000);

  test('a configuration asking readiness to run full mode is captured with it', async () => {
    const root = await fixture(async path => {
      const config = valid();
      ((config['acceptance'] as { modes: { full: Record<string, unknown> } }).modes.full)['readiness'] = 'run';
      await writeProjectConfig(path, config);
    });
    const { snapshot, record } = await run(root, true);

    expect(snapshot.state).toBe('completed');
    expect('config' in record.projectConfig && record.projectConfig.config.acceptance.modes.full.readiness).toBe('run');
  }, 180_000);

  test('a project without the file starts, and fails readiness with project-config-invalid and no recovery', async () => {
    const root = await fixture(path => rm(join(path, 'ramify-agent.json')));
    const { snapshot, failures, attempt, record, step, git } = await run(root, false);

    expect(record.projectConfig).toEqual({ path: 'ramify-agent.json', hash: null, invalid: 'ramify-agent.json is missing at the project root' });
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('project-config-invalid');
    expect(snapshot.failure?.message).toContain('Readiness failed at project-config after 1 attempt: ramify-agent.json is missing at the project root');
    expect(failures).toEqual([{ attempt: 1, gate: 'ga-0001', step: 'project-config', detail: 'ramify-agent.json is missing at the project root', recovery: null, final: true }]);
    expect(step('project-config').outcome).toBe('failed');
    expect(step('acceptance-runner')).toMatchObject({ outcome: 'not-verified' });
    expect(attempt.steps.filter(entry => entry.step.startsWith('baseline-')).every(entry => entry.outcome === 'not-verified')).toBe(true);
    expect(attempt.verdict).toBe('failed');
    // No code-repair assignment follows: the one invocation is the analysis.
    expect(snapshot.counts.invocations).toBe(1);
    expect(git.branch()).toBeNull();
  }, 180_000);

  test('an invalid file fails the same step with the schema\'s message', async () => {
    const root = await fixture(path => writeFile(join(path, 'ramify-agent.json'), changed(['acceptance', 'modes', 'quick'], undefined)));
    const { snapshot, step } = await run(root, false);

    expect(snapshot.failure?.reason).toBe('project-config-invalid');
    expect(step('project-config').detail).toMatch(/^ramify-agent\.json does not validate against ramify-agent\.project\/1: acceptance\.modes\.quick: /);
  }, 180_000);

  test('a support entry that matches nothing, or matches source outside every test area, fails the step', async () => {
    const root = await fixture(async path => {
      const config = valid();
      (config['acceptance'] as { support: string[] }).support = [
        'subs/integration-tests/src/support/*.ts',
        'subs/integration-tests/src/support/driver.ts',
        'src/*.ts',
      ];
      await writeProjectConfig(path, config);
    });
    const { snapshot, step } = await run(root, false);

    expect(snapshot.failure?.reason).toBe('project-config-invalid');
    const detail = step('project-config').detail;
    expect(detail).not.toContain('`subs/integration-tests/src/support/*.ts`');
    expect(detail).toContain('`subs/integration-tests/src/support/driver.ts` matches no file');
    expect(detail).toContain('`src/*.ts` matches src/assembly.ts, src/main.ts, src/protocol.ts, … outside every module\'s test area');
  }, 180_000);

  test('a project without cucumber-js fails acceptance-runner with acceptance-harness-missing and no recovery', async () => {
    const root = await fixture(path => rm(join(path, 'node_modules', '.bin', 'cucumber-js')));
    const { snapshot, failures, step } = await run(root, false);

    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('acceptance-harness-missing');
    expect(step('project-config').outcome).toBe('passed');
    expect(failures).toEqual([{ attempt: 1, gate: 'ga-0001', step: 'acceptance-runner', detail: 'node_modules/.bin/cucumber-js is not installed', recovery: null, final: true }]);
  }, 180_000);

  test('a mode whose npm script or executable does not exist fails acceptance-runner, naming each', async () => {
    const root = await fixture(async path => {
      const config = valid();
      const modes = (config['acceptance'] as { modes: Record<string, Record<string, unknown>> }).modes;
      modes['quick']!['command'] = ['npm', 'run', 'acceptance:missing', '--'];
      modes['full']!['setup'] = ['no-such-server-command', 'start'];
      await writeProjectConfig(path, config);
    });
    const { snapshot, step } = await run(root, false);

    expect(snapshot.failure?.reason).toBe('acceptance-harness-missing');
    expect(step('acceptance-runner').detail).toBe([
      'quick mode\'s command `npm run acceptance:missing --` does not resolve: package.json declares no `acceptance:missing` script',
      'full mode\'s setup `no-such-server-command start` does not resolve: `no-such-server-command` is neither in node_modules/.bin nor on the PATH',
    ].join('; '));
  }, 180_000);

  test('every other step still fails as readiness-failed', () => {
    expect(readinessFailureReason('project-config')).toBe('project-config-invalid');
    expect(readinessFailureReason('acceptance-runner')).toBe('acceptance-harness-missing');
    expect(readinessFailureReason('test-runner')).toBe('readiness-failed');
    expect(readinessFailureReason(undefined)).toBe('readiness-failed');
  });
});
