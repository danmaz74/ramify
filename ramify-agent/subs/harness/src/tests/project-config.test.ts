import { finalCandidate } from './helpers/final-candidate.js';
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
    typeCheck: { output: 'tsc' },
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
  test('accepts the fixture\'s file, which names its type check\'s output and nothing of its tests or scenarios', async () => {
    const parsed = parseProjectConfig(await readFile(join(fixtureRoot, 'ramify-agent.json'), 'utf8'));
    expect(parsed).toEqual({ config: { schema: 'ramify-agent.project/1', typeCheck: { output: 'tsc' } } });
    expect(parseProjectConfig(JSON.stringify({ schema: 'ramify-agent.project/1' }))).toEqual({ config: { schema: 'ramify-agent.project/1' } });
  });

  test('refuses the removed acceptance section: the project\'s scenarios run as a check of its committed audit definition', () => {
    const acceptance = {
      support: ['subs/integration-tests/src/support/world.ts'],
      modes: { quick: { command: ['npm', 'run', 'acceptance:quick', '--'] }, full: { command: ['npm', 'run', 'acceptance:full', '--'] } },
    };
    const parsed = parseProjectConfig(changed(['acceptance'], acceptance));
    expect('invalid' in parsed ? parsed.invalid : '').toMatch(/<root>: .*acceptance/);
  });

  test('accepts setup commands in order, each with an optional name, directory, bound and environment', () => {
    const setup = [
      { name: 'build', command: ['npm', 'run', 'build'], timeoutMs: 900_000 },
      { command: ['npm', 'run', 'build'], cwd: 'packages/ui', env: { NODE_ENV: 'production' } },
      { command: ['node', 'scripts/generate.mjs'], cwd: '.' },
    ];
    const parsed = parseProjectConfig(changed(['setup'], setup));
    expect('config' in parsed && parsed.config.setup).toEqual(setup);
    // Without it, a gate runs no setup command.
    const without = parseProjectConfig(JSON.stringify(valid()));
    expect('config' in without && without.config.setup).toBeUndefined();
  });

  test.each([
    ['a setup command that is empty', [{ command: [] }], /setup\.0\.command: /],
    ['a setup command that is a string', [{ command: 'npm run build' }], /setup\.0\.command: /],
    ['a setup directory that is absolute', [{ command: ['make'], cwd: '/usr/src' }], /setup\.0\.cwd: must be a relative directory inside the project/],
    ['a setup directory that leaves the project', [{ command: ['make'], cwd: 'packages/../../elsewhere' }], /setup\.0\.cwd: must be a relative directory inside the project/],
    ['a setup directory on a drive', [{ command: ['make'], cwd: 'C:\\build' }], /setup\.0\.cwd: must be a relative directory inside the project/],
    ['a setup bound that is zero', [{ command: ['make'], timeoutMs: 0 }], /setup\.0\.timeoutMs: /],
    ['a setup bound that is not whole', [{ command: ['make'], timeoutMs: 1.5 }], /setup\.0\.timeoutMs: /],
    ['a setup environment value that is not text', [{ command: ['make'], env: { LEVEL: 3 } }], /setup\.0\.env\.LEVEL: /],
    ['a setup field it does not define', [{ command: ['make'], shell: true }], /setup\.0: .*shell/],
    ['setup that is not a list', { command: ['make'] }, /setup: /],
  ])('rejects %s with the schema\'s message', (_name, setup, message) => {
    const parsed = parseProjectConfig(changed(['setup'], setup));
    expect('invalid' in parsed ? parsed.invalid : '').toMatch(message);
  });

  test.each([
    ['text that is not JSON', '{ "schema": ', /is not JSON/],
    ['another version', changed(['schema'], 'ramify-agent.project/2'), /schema: /],
    ['an unknown type-check output', changed(['typeCheck'], { output: 'eslint' }), /typeCheck\.output: /],
    ['a field v1 does not define', changed(['tests'], { command: ['npm', 'test'] }), /<root>: .*tests/],
    ['a timeout of zero', changed(['timeouts'], { typeCheck: 0 }), /timeouts\.typeCheck: /],
    ['a timeout that is not a whole number of milliseconds', changed(['timeouts'], { typeCheck: 1.5 }), /timeouts\.typeCheck: /],
    ['a timeout above the ceiling', changed(['timeouts'], { ramifyCheck: 7_200_001 }), /timeouts\.ramifyCheck: A command timeout is at most 7200000 ms \(two hours\)/],
    ['a timeout for a command the gate does not run', changed(['timeouts'], { lint: 60_000 }), /timeouts: .*lint/],
    // The project's suites run as checks of its committed audit definition, which bounds them.
    ['a timeout for the project\'s tests', changed(['timeouts'], { tests: 1_800_000 }), /timeouts: .*tests/],
    ['a timeout for a scoped test run', changed(['timeouts'], { scopedTests: 700_000 }), /timeouts: .*scopedTests/],
  ])('rejects %s with the schema\'s message', (_name, text, message) => {
    const parsed = parseProjectConfig(text);
    expect(parsed).toHaveProperty('invalid');
    expect('invalid' in parsed ? parsed.invalid : '').toMatch(message);
    if (_name !== 'text that is not JSON') expect('invalid' in parsed ? parsed.invalid : '').toContain('does not validate against ramify-agent.project/1');
  });

  test('accepts gate command timeouts, each up to the ceiling', () => {
    const timeouts = { typeCheck: 600_000, ramifyCheck: 7_200_000 };
    const parsed = parseProjectConfig(changed(['timeouts'], timeouts));
    expect('config' in parsed && parsed.config.timeouts).toEqual(timeouts);
    expect(parseProjectConfig(changed(['timeouts'], {}))).toHaveProperty('config');
  });

  test('its timeouts replace the policy\'s own diagnosis command timeouts, and nothing else of the policy', () => {
    const policy = testPolicy('/project');
    const captured = { path: 'ramify-agent.json', hash: 'a'.repeat(64), config: { ...minimalProjectConfig, timeouts: { typeCheck: 400_000, ramifyCheck: 900_000 } } };
    const timed = withProjectTimeouts(policy, captured);
    expect(timed.commands.typeCheck.timeoutMs).toBe(400_000);
    expect(timed.commands.ramifyCheck.timeoutMs).toBe(900_000);
    // What the configuration does not name is the policy's.
    expect(timed.commands.ramifyChanged).toEqual(policy.commands.ramifyChanged);
    expect({ ...timed, commands: undefined }).toEqual({ ...policy, commands: undefined });
    expect(timed.commands.typeCheck.argv).toEqual(policy.commands.typeCheck.argv);

    // One timeout replaces one command's; a missing or invalid file changes nothing.
    const one = withProjectTimeouts(policy, { ...captured, config: { ...minimalProjectConfig, timeouts: { ramifyCheck: 1_000_000 } } });
    expect(one.commands.ramifyCheck.timeoutMs).toBe(1_000_000);
    expect(one.commands.typeCheck).toEqual(policy.commands.typeCheck);
    expect(withProjectTimeouts(policy, { path: 'ramify-agent.json', hash: null, invalid: 'missing' })).toBe(policy);
  });

  test('a missing, invalid or valid file is captured with its reason or its hash, never thrown', async () => {
    const directory = await temporaryDirectory();
    cleanups.push(directory.remove);

    expect(await captureProjectConfig(directory.path)).toEqual({ path: 'ramify-agent.json', hash: null, invalid: 'ramify-agent.json is missing at the project root' });

    await writeFile(join(directory.path, 'ramify-agent.json'), changed(['typeCheck', 'output'], 'eslint'));
    const invalid = await captureProjectConfig(directory.path);
    expect(invalid).toMatchObject({ path: 'ramify-agent.json', hash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown });
    expect('invalid' in invalid && invalid.invalid).toMatch(/^ramify-agent\.json does not validate against ramify-agent\.project\/1: typeCheck\.output: /);

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

describe('the project-config readiness step', () => {
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
      previews: passes ? finalCandidate(root, 'project-config-base').previews : [],
      checkpoints: passes ? [{ subject: 'final verification of plan "review-notes"', commit: null, changes: [] }] : [],
    });
    const { service } = await openRunsWithoutProcesses(root, git, { candidates: finalCandidate(root, 'project-config-base').candidates, script: [{ kind: 'submit', input: emptyAnalysis() }] });
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

  test('the fixture passes the step, no scenario-runner step follows it, and job.json captures its configuration beside the policy', async () => {
    const root = await fixture();
    const { snapshot, attempt, record, step } = await run(root, true);

    expect(snapshot.state).toBe('completed');
    const steps = attempt.steps.map(entry => entry.step);
    expect(steps.slice(steps.indexOf('project-config'), steps.indexOf('project-config') + 2)).toEqual(['project-config', 'ramify-daemon']);
    expect(steps).not.toContain('acceptance-runner');
    expect(step('project-config')).toMatchObject({ outcome: 'passed', detail: 'ramify-agent.json validates against ramify-agent.project/1' });

    const keys = Object.keys(record);
    expect(keys.indexOf('projectConfig')).toBe(keys.indexOf('policy') + 1);
    expect(record.projectConfig).toEqual({
      path: 'ramify-agent.json',
      hash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      config: { schema: 'ramify-agent.project/1', typeCheck: { output: 'tsc' } },
    });
  }, 180_000);

  test('diagnosis command timeouts the configuration declares are the ones job.json captures in the policy', async () => {
    const root = await fixture(async path => {
      const config = JSON.parse(await readFile(join(path, 'ramify-agent.json'), 'utf8')) as Record<string, unknown>;
      await writeProjectConfig(path, { ...config, timeouts: { ramifyCheck: 1_800_000, typeCheck: 450_000 } });
    });
    const { snapshot, record } = await run(root, true);

    expect(snapshot.state).toBe('completed');
    expect('config' in record.projectConfig && record.projectConfig.config.timeouts).toEqual({ ramifyCheck: 1_800_000, typeCheck: 450_000 });
    expect(record.policy.commands.ramifyCheck.timeoutMs).toBe(1_800_000);
    expect(record.policy.commands.typeCheck.timeoutMs).toBe(450_000);
    expect(record.policy.commands.ramifyChanged.timeoutMs).toBe(testPolicy(root).commands.ramifyChanged.timeoutMs);
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
    expect(attempt.steps.map(entry => entry.step)).not.toContain('acceptance-runner');
    expect(attempt.steps.filter(entry => entry.step.startsWith('baseline-')).every(entry => entry.outcome === 'not-verified')).toBe(true);
    expect(attempt.verdict).toBe('failed');
    // No code-repair assignment follows: the three invocations are the
    // analysis's intake, initial architect and plan check.
    expect(snapshot.counts.invocations).toBe(3);
    expect(git.branch()).toBeNull();
  }, 180_000);

  test('a file that still declares the removed acceptance section fails the same step with the schema\'s message', async () => {
    const root = await fixture(path => writeProjectConfig(path, {
      schema: 'ramify-agent.project/1',
      acceptance: { support: [], modes: { quick: { command: ['npm', 'run', 'acceptance:quick', '--'] }, full: { command: ['npm', 'run', 'acceptance:full', '--'] } } },
    }));
    const { snapshot, step } = await run(root, false);

    expect(snapshot.failure?.reason).toBe('project-config-invalid');
    expect(step('project-config').detail).toMatch(/^ramify-agent\.json does not validate against ramify-agent\.project\/1: <root>: .*acceptance/);
  }, 180_000);

  test('a project without cucumber-js passes readiness: the harness starts no scenario runner, its committed audit runs the scenarios', async () => {
    const root = await fixture(path => rm(join(path, 'node_modules', '.bin', 'cucumber-js')));
    const { snapshot, failures, attempt } = await run(root, true);

    expect(snapshot.state).toBe('completed');
    expect(failures).toEqual([]);
    expect(attempt.steps.map(entry => entry.step)).not.toContain('acceptance-runner');
  }, 180_000);

  test('every step but project-config fails as readiness-failed', () => {
    expect(readinessFailureReason('project-config')).toBe('project-config-invalid');
    expect(readinessFailureReason('acceptance-runner')).toBe('readiness-failed');
    expect(readinessFailureReason('test-runner')).toBe('readiness-failed');
    expect(readinessFailureReason(undefined)).toBe('readiness-failed');
  });
});
