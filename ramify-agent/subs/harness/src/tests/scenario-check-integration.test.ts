import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { planScenarioCheck, type ScenarioCheckInputs } from '../checks/checkpoint.js';
import { inPlaceCheckExecution, type CheckExecutionPort } from '../checks/execution.js';
import { runGate } from '../checks/gate.js';
import type { Checkpoint, GateAttempt } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { captureProjectConfig } from '../run/project-config.js';
import { failingStep, recoveryFor, runReadiness } from '../run/readiness.js';
import { createAuditCheckExecution } from '../../subs/audit/src/check-execution.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { testPolicy } from './helpers/runs.js';
import { scriptedGit } from './helpers/scripted-git.js';
import { expectedFeatureFiles } from '../run/feature-files.js';
import { scenarioRecordSchema, scenarioSourceHash } from '../../subs/scenarios/src/records.js';
import { initialScenarioStates } from '../../subs/scenarios/src/states.js';

/*
 * The scenario check with the real cucumber-js 13.2.1, in each runner, over a
 * small project this file writes: one module whose tracked scenario either
 * binds or has a step no definition matches, and one scenario of the
 * project's own. The in-place runner runs it in the project; the audit's
 * executor in its worktree of the committed project, with the profiles and
 * streams in the attempt's directory outside both. Readiness runs its two
 * acceptance steps over the same project through the in-place runner.
 */

const packageModules = fileURLToPath(new URL('../../../../node_modules', import.meta.url));
const featureFile = 'subs/shelf/src/tests/features/demo-plan/shelf.feature';
const stepsFile = 'subs/shelf/src/tests/steps/shelf.steps.js';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

beforeAll(() => {
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
});

async function directory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporary.push(path);
  return path;
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  }).trim();
}

/** The project, committed, with this package's installed dependencies linked beside it. */
async function project(lastStep: string, extra: Record<string, string> = {}): Promise<{ root: string; commit: string }> {
  const root = await directory('ramify-agent-scenario-project-');
  const files: Record<string, string> = {
    'package.json': '{ "name": "scenario-project", "private": true, "type": "module" }\n',
    '.gitignore': 'node_modules\n',
    'src/tests/support/world.js': [
      "import { setWorldConstructor } from '@cucumber/cucumber';",
      'setWorldConstructor(class { books = []; });',
      '',
    ].join('\n'),
    [stepsFile]: [
      "import assert from 'node:assert/strict';",
      "import { Given, Then, When } from '@cucumber/cucumber';",
      "Given('an empty shelf', function () { this.books = []; });",
      "When('the user shelves {string}', function (title) { this.books.push(title); });",
      "Then('the shelf lists {int} book(s)', function (count) { assert.equal(this.books.length, count); });",
      '',
    ].join('\n'),
    [featureFile]: [
      'Feature: shelf-books',
      '',
      '  @ramify-sc-001',
      '  Scenario: A shelved book is listed',
      '    Given an empty shelf',
      '    When the user shelves "Dune"',
      `    ${lastStep}`,
      '',
    ].join('\n'),
    'subs/shelf/src/tests/features/own.feature': [
      'Feature: the project\'s own',
      '',
      '  Scenario: An empty shelf lists nothing',
      '    Given an empty shelf',
      '    Then the shelf lists 0 books',
      '',
    ].join('\n'),
    ...extra,
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  await symlink(packageModules, join(root, 'node_modules'), 'dir');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['add', '--all']);
  git(root, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '-q', '--no-gpg-sign', '-m', 'fixture']);
  return { root, commit: git(root, ['rev-parse', 'HEAD']) };
}

function inputs(state: 'pending' | 'declared'): ScenarioCheckInputs {
  const command = ['node_modules/.bin/cucumber-js'];
  return {
    harness: { support: ['src/tests/support/world.js'], modes: { quick: { command }, full: { command } } },
    modules: [{ module: 'demo/shelf', dir: 'subs/shelf', testing: false }],
    scenarios: [{ id: 'sc-001', owner: 'demo/shelf', file: featureFile, state }],
  };
}

function check(checkpoint: Checkpoint, root: string): PlannedCheck {
  const planned = planScenarioCheck(checkpoint, inputs('declared'), { projectRoot: root, scope: { exactOwners: ['demo/shelf'], subtrees: [] } });
  if (!('check' in planned)) throw new Error('A scenario check was expected');
  return planned.check;
}

async function gate(execution: CheckExecutionPort, checkpoint: Checkpoint, fixture: { root: string; commit: string }): Promise<{ attempt: GateAttempt; attemptDirectory: string }> {
  const attemptDirectory = await directory('ramify-agent-scenario-attempt-');
  const attempt = await runGate(execution, checkpoint, {
    id: 'ga-0001',
    runId: 'run-scenario-integration',
    projectRoot: fixture.root,
    directory: attemptDirectory,
    head: fixture.commit,
    checks: [check(checkpoint, fixture.root)],
  });
  return { attempt, attemptDirectory };
}

const audit = () => createAuditCheckExecution({
  workspaceOwnership: { async recordIntendedWorkspace() {}, async recoverAbandonedWorkspaces() {}, async recordWorkspaceCleaned() {} },
});

describe.each([
  ['the in-place runner', 'work-item' as const, () => inPlaceCheckExecution],
  ['the audit executor', 'iteration' as const, audit],
])('%s with the real cucumber-js', (_name, checkpoint, execution) => {
  test('a bound scenario passes, with its binding read from the stream', async () => {
    const fixture = await project('Then the shelf lists 1 book');
    const { attempt, attemptDirectory } = await gate(execution(), checkpoint, fixture);
    const command = attempt.commands[0]!;
    expect(command.scenarios?.failures).toEqual([]);
    expect(attempt.verdict).toBe('passed');
    expect(command).toMatchObject({ kind: 'scenarios', outcome: 'passed', exitCode: 0 });
    expect(command.scenarios!.scenarios).toMatchObject([{
      id: 'sc-001', run: 'demo/shelf', status: 'passed', file: featureFile, line: 4,
      binding: [
        { step: 'Given an empty shelf', definition: `${stepsFile}:3` },
        { step: 'When the user shelves "Dune"', definition: `${stepsFile}:4` },
        { step: 'Then the shelf lists 1 book', definition: `${stepsFile}:5` },
      ],
    }]);
    expect(command.scenarios!.runs).toEqual([{ module: 'demo/shelf', exit: 0, profile: 'scenarios/subs-shelf.profile.mjs', messages: 'scenarios/subs-shelf.ndjson' }]);
    // The profile and the stream are the attempt's, outside the project.
    await access(join(attemptDirectory, 'scenarios/subs-shelf.profile.mjs'));
    await access(join(attemptDirectory, 'scenarios/subs-shelf.ndjson'));
    if (checkpoint === 'work-item') {
      expect(command.scenarios!.untracked).toEqual({ passed: 1, skipped: 0, failed: 0 });
    } else {
      // An identity run executes the selected scenario and nothing of the project's own.
      expect(command.scenarios!.untracked).toEqual({ passed: 0, skipped: 0, failed: 0 });
      expect(attempt.audited).toBe(fixture.commit);
      expect(attempt.evidence).not.toBeNull();
    }
  }, 60_000);

  test('a step no definition matches fails the check strictly, naming the step', async () => {
    const fixture = await project('Then the shelf is dusted');
    const { attempt } = await gate(execution(), checkpoint, fixture);
    const command = attempt.commands[0]!;
    expect(attempt.verdict).toBe('failed');
    expect(command.outcome).toBe('failed');
    expect(command.scenarios!.scenarios).toMatchObject([{ id: 'sc-001', status: 'undefined', undefined: ['the shelf is dusted'] }]);
    expect(command.scenarios!.failures).toContain('sc-001 undefined: no step definition matches "the shelf is dusted"');
    expect(command.output.tail).toContain('- sc-001 undefined');
  }, 60_000);
});

describe('a materialized feature file with the real cucumber-js', () => {
  test('its pending scenarios are kept out of the work-item gate by the pending tag, although no definition binds their steps', async () => {
    // The file exactly as the harness materializes it: the scenario is
    // pending, and its last step has no definition, so a run that selected
    // it would fail as undefined.
    const source = ['Scenario: A shelved book is dusted', '  Given an empty shelf', '  When the user shelves "Dune"', '  Then the shelf is dusted'];
    const record = scenarioRecordSchema.parse({
      schema: 'ramify-agent.scenario/1', id: 'sc-001', kind: 'entry', entry: 'shelf-books', owner: 'demo/shelf',
      origin: { kind: 'architect', refs: [] }, partOf: null, subScenarios: [], name: 'A shelved book is dusted',
      source, hash: scenarioSourceHash(source), file: featureFile,
    });
    const [rendered] = expectedFeatureFiles(
      { records: [record], states: initialScenarioStates(['sc-001']), entries: [{ capability: 'shelf-books', description: 'Books are shelved.' }] },
      { planId: 'demo-plan', runId: 'run-scenario-integration' },
    );
    expect(rendered!.content).toContain('@ramify-sc-001 @ramify-pending');
    const fixture = await project('Then the shelf is dusted', { [featureFile]: rendered!.content });

    const attemptDirectory = await directory('ramify-agent-scenario-attempt-');
    const planned = planScenarioCheck('work-item', inputs('pending'), { projectRoot: fixture.root });
    if (!('check' in planned)) throw new Error('A scenario check was expected');
    const attempt = await runGate(inPlaceCheckExecution, 'work-item', {
      id: 'ga-0003', runId: 'run-scenario-integration', projectRoot: fixture.root, directory: attemptDirectory, head: fixture.commit, checks: [planned.check],
    });
    const command = attempt.commands[0]!;
    expect(command.scenarios).toMatchObject({ selection: { kind: 'all-untagged' }, excluded: 1, scenarios: [], untracked: { passed: 1, skipped: 0, failed: 0 }, failures: [] });
    expect(attempt.verdict).toBe('passed');
  }, 60_000);
});

describe('readiness\'s acceptance steps with the real cucumber-js', () => {
  /** What readiness needs beyond the scenario harness: modules, a test script and a discoverable test. */
  function readinessFiles(full: Record<string, unknown>, steps = ''): Record<string, string> {
    return {
      'package.json': '{ "name": "scenario-project", "private": true, "type": "module", "scripts": { "test": "vitest run" } }\n',
      'tsconfig.json': '{}\n',
      'module.ramify': 'ramify 1\nmodule demo\n',
      'subs/shelf/module.ramify': 'ramify 1\nmodule shelf\n',
      'src/tests/placeholder.test.ts': '',
      'ramify-agent.json': `${JSON.stringify({
        schema: 'ramify-agent.project/1',
        acceptance: {
          support: ['src/tests/support/world.js'],
          modes: { quick: { command: ['node_modules/.bin/cucumber-js'] }, full },
        },
      })}\n`,
      ...(steps === '' ? {} : { 'subs/shelf/src/tests/steps/full-only.steps.js': steps }),
    };
  }

  /** A command that records that it ran by writing `marker` at the project root. */
  const marking = (marker: string) => [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, '')`];

  async function readiness(fixture: { root: string; commit: string }) {
    const gateDirectory = await directory('ramify-agent-scenario-readiness-');
    const result = await runReadiness(inPlaceCheckExecution, {
      runId: 'run-readiness',
      attempt: 1,
      projectRoot: fixture.root,
      gateDirectory,
      gateId: 'ga-0001',
      policy: testPolicy(fixture.root),
      projectConfig: await captureProjectConfig(fixture.root),
      index: null,
      ramify: new FakeRamifyCli(),
      git: scriptedGit(fixture.root, { head: fixture.commit, checkpoints: [] }),
      head: fixture.commit,
    });
    const step = (name: string) => result.attempt.steps.find(entry => entry.step === name)!;
    expect(result.gate, JSON.stringify(result.attempt.steps.filter(entry => entry.outcome !== 'passed'))).not.toBeNull();
    const scenarioCommands = result.gate!.commands.filter(command => command.kind === 'scenarios');
    return { result, step, scenarioCommands };
  }

  test('by default full mode is loaded with --dry-run, running no setup, and all four acceptance steps pass', async () => {
    const full = { command: ['node_modules/.bin/cucumber-js'], setup: marking('setup-ran'), teardown: marking('teardown-ran') };
    const fixture = await project('Then the shelf lists 1 book', readinessFiles(full));
    const { result, step, scenarioCommands } = await readiness(fixture);

    expect(result.attempt.verdict).toBe('passed');
    for (const name of ['project-config', 'acceptance-runner', 'baseline-acceptance', 'acceptance-full']) expect(step(name).outcome).toBe('passed');
    expect(step('baseline-acceptance').gate).toBe('ga-0001');
    expect(step('baseline-acceptance').detail).toContain('the project\'s own scenarios: 2 passed');
    expect(step('acceptance-full').detail).toMatch(/^full mode, loaded with --dry-run: passed/);
    const [quick, dry] = scenarioCommands;
    expect(quick!.scenarios).toMatchObject({ mode: 'quick', selection: { kind: 'all-untagged' }, dryRun: false, setup: null, teardown: null });
    expect(dry!.scenarios).toMatchObject({ mode: 'full', selection: { kind: 'all-untagged' }, dryRun: true, setup: null, teardown: null, untracked: { passed: 0, skipped: 2, failed: 0 } });
    await expect(access(join(fixture.root, 'setup-ran'))).rejects.toThrow();
  }, 60_000);

  test('with readiness: run, full mode executes strictly between its setup and teardown', async () => {
    const full = { command: ['node_modules/.bin/cucumber-js'], setup: marking('setup-ran'), teardown: marking('teardown-ran'), readiness: 'run' };
    const fixture = await project('Then the shelf lists 1 book', readinessFiles(full));
    const { result, step, scenarioCommands } = await readiness(fixture);

    expect(result.attempt.verdict).toBe('passed');
    expect(step('acceptance-full').detail).toMatch(/^the project's own scenarios in full mode: passed/);
    expect(scenarioCommands[1]!.scenarios).toMatchObject({ mode: 'full', dryRun: false, setup: { exit: 0 }, teardown: { exit: 0 }, untracked: { passed: 2, skipped: 0, failed: 0 } });
    await access(join(fixture.root, 'setup-ran'));
    await access(join(fixture.root, 'teardown-ran'));
  }, 60_000);

  test('a full mode whose dry run finds an undefined step fails acceptance-full as a baseline fails, with no recovery', async () => {
    // Full mode loads the steps without the shelf's own definition of its
    // last step, which only quick mode's process defines.
    const steps = [
      "import { Then } from '@cucumber/cucumber';",
      "if (process.env.SCENARIO_MODE !== 'full') Then('the shelf is dusted', function () {});",
      '',
    ].join('\n');
    const full = { command: ['sh', '-c', 'SCENARIO_MODE=full exec node_modules/.bin/cucumber-js "$@"', 'full'] };
    const fixture = await project('Then the shelf is dusted', readinessFiles(full, steps));
    const { result, step } = await readiness(fixture);

    expect(result.attempt.verdict).toBe('failed');
    expect(step('baseline-acceptance').outcome).toBe('passed');
    expect(step('acceptance-full').outcome).toBe('failed');
    expect(step('acceptance-full').detail).toContain('did not pass');
    expect(failingStep(result.attempt)?.step).toBe('acceptance-full');
    expect(recoveryFor(result.attempt, result.gate, testPolicy(fixture.root))).toBeNull();
  }, 60_000);
});
