import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { checkpointPolicies, planScenarioCheck, type PlannedScenario, type ScenarioCheckInputs } from '../checks/checkpoint.js';
import type { CheckExecutionPort } from '../checks/execution.js';
import { prepareGate, runGate } from '../checks/gate.js';
import { checkCommand, type Checkpoint, type GateAttempt } from '../checks/records.js';
import { runScenarioCheck, scenarioTimeouts, type ScenarioCheckPlan } from '../checks/scenario-check.js';
import type { PlannedCheck } from '../checks/verify.js';
import { runCheckpoint } from '../run/gates.js';
import type { CommandRequest, CommandRun, CommandRunner } from '../../subs/evidence/src/run-command.js';
import { createPassingCheckExecution } from './helpers/direct-check-execution.js';
import { installTestRunner, testPolicy } from './helpers/runs.js';

/*
 * The scenario check: what each checkpoint plans, and how a check executes
 * with a scripted runner whose message streams are the `scenarios` module's
 * recordings of the real cucumber-js. No test here starts the runner; the
 * integration tests beside this file do.
 */

const streams = fileURLToPath(new URL('../../subs/scenarios/src/tests/fixtures/streams/', import.meta.url));
const shelfFile = 'subs/shelf/src/tests/features/demo-plan/shelf.feature';
const shelf = { module: 'sample/shelf', dir: 'subs/shelf', testing: false };
const acceptance = { module: 'sample/acceptance', dir: 'subs/acceptance', testing: true };
const tracked = ['sc-001', 'sc-002', 'sc-003', 'sc-004', 'sc-005', 'sc-006', 'sc-007'].map(id => ({ id, file: shelfFile }));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()));
});

test('a scenario check reports lock wait apart from its running time', async () => {
  vi.useFakeTimers();
  const root = await directory();
  const command = checkCommand({ argv: ['fixture'], cwd: root, timeoutMs: 1000 });
  const result = await runScenarioCheck({
    command,
    plan: { mode: 'quick', selection: { kind: 'all' }, strict: true, dryRun: false, support: [], runs: [],
      setup: command, teardown: null, runTimeoutMs: 1000, tracked: [] },
    projectRoot: root, attemptDirectory: root, outputFile: join(root, 'scenario.log'), signal: new AbortController().signal,
    runner: async () => {
      await vi.advanceTimersByTimeAsync(900);
      return { outcome: { kind: 'completed', exitCode: 0 }, startedAt: new Date().toISOString(),
        elapsedMs: 0, lockWaitMs: 900,
        output: { path: null, bytes: 0, truncated: false, tail: '' }, stdout: '', stderr: '' };
    },
  });
  expect(result.run.lockWaitMs).toBe(900);
  expect(result.run.elapsedMs).toBe(0);
});

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'ramify-agent-scenario-check-'));
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

const harness = {
  support: ['src/tests/support/world.ts'],
  modes: {
    quick: { command: ['npm', 'run', 'acceptance:quick', '--'] },
    full: { command: ['npm', 'run', 'acceptance:full', '--'], setup: ['npm', 'run', 'server:start'], teardown: ['npm', 'run', 'server:stop'] },
  },
};

function scenario(id: string, owner: string, state: PlannedScenario['state'], file = `subs/${owner.split('/').at(-1)}/src/tests/features/demo-plan/x.feature`): PlannedScenario {
  return { id, owner, file, state };
}

function inputs(scenarios: PlannedScenario[], modules = [acceptance, shelf]): ScenarioCheckInputs {
  return { harness, modules, scenarios };
}

describe('planning per checkpoint', () => {
  const allPending = [scenario('sc-001', 'sample/shelf', 'pending'), scenario('sc-002', 'sample/shelf', 'pending')];

  test.each([
    ['readiness', 'quick', 'all-untagged'],
    ['breaking-iteration', 'quick', 'all-untagged'],
    ['work-item', 'quick', 'all-untagged'],
    ['final', 'full', 'all'],
  ] as const)('%s runs every module with feature files in %s mode, selecting %s, strictly', (checkpoint, mode, kind) => {
    const planned = planScenarioCheck(checkpoint, inputs(allPending), { projectRoot: '/project' });
    expect('check' in planned).toBe(true);
    const check = (planned as { check: PlannedCheck }).check;
    const plan = check.scenarios!;
    expect(check.kind).toBe('scenarios');
    expect(check.attribution).toBe('project');
    expect(plan).toMatchObject({ mode, selection: { kind }, strict: true, dryRun: false, support: harness.support });
    expect(plan.runs).toEqual([
      { module: acceptance, selection: { kind } },
      { module: shelf, selection: { kind } },
    ]);
    expect(plan.tracked).toEqual(allPending.map(entry => ({ id: entry.id, file: entry.file })));
    expect(check.command.argv).toEqual(harness.modes[mode].command);
    expect(check.command.cwd).toBe('/project');
    expect(checkpointPolicies[checkpoint].scenarios).toEqual({ mode, selection: kind === 'all' ? 'all' : 'all-untagged', strict: true });
  });

  test('the final gate runs full mode with its setup and teardown, and its bound is their sum', () => {
    const planned = planScenarioCheck('final', inputs(allPending), { projectRoot: '/project' }) as { check: PlannedCheck };
    const plan = planned.check.scenarios!;
    expect(plan.setup?.argv).toEqual(harness.modes.full.setup);
    expect(plan.teardown?.argv).toEqual(harness.modes.full.teardown);
    expect(plan.runTimeoutMs).toBe(1_800_000);
    expect(planned.check.command.timeoutMs).toBe(2 * 1_800_000 + scenarioTimeouts.setup + scenarioTimeouts.teardown);
  });

  test('a quick run is bounded at 600 s, and a mode without setup or teardown adds neither', () => {
    const planned = planScenarioCheck('work-item', inputs(allPending), { projectRoot: '/project' }) as { check: PlannedCheck };
    expect(planned.check.scenarios!.runTimeoutMs).toBe(600_000);
    expect(planned.check.scenarios!.setup).toBeNull();
    expect(planned.check.command.timeoutMs).toBe(2 * 600_000);
  });

  test('a dry run starts no setup or teardown', () => {
    const planned = planScenarioCheck('readiness', inputs(allPending), { projectRoot: '/project', mode: 'full', dryRun: true }) as { check: PlannedCheck };
    expect(planned.check.scenarios).toMatchObject({ mode: 'full', dryRun: true, setup: null, teardown: null, selection: { kind: 'all-untagged' } });
  });

  test.each(['iteration', 'contract'] as const)('an %s gate whose scope holds only pending scenarios selects none', checkpoint => {
    const planned = planScenarioCheck(checkpoint, inputs(allPending), { projectRoot: '/project', scope: { exactOwners: ['sample/shelf'], subtrees: [] } });
    expect(planned).toEqual({ none: 'none-selected' });
  });

  test('an iteration gate selects the scope owners\' bound, declared and implemented scenarios by identity, one run per owner', () => {
    const scenarios = [
      scenario('sc-001', 'sample/shelf', 'declared'),
      scenario('sc-002', 'sample/shelf', 'pending'),
      scenario('sc-003', 'sample/shelf', 'bound'),
      scenario('sc-004', 'sample/lending', 'implemented'),
      scenario('sc-005', 'sample/elsewhere', 'declared'),
      scenario('sc-010', 'sample/lending/ui', 'implemented', 'subs/lending/subs/ui/src/features/demo-plan/x.feature'),
    ];
    const planned = planScenarioCheck('iteration', inputs(scenarios), {
      projectRoot: '/project',
      scope: { exactOwners: ['sample/shelf'], subtrees: ['sample/lending'] },
    }) as { check: PlannedCheck };
    const plan = planned.check.scenarios!;
    expect(planned.check.attribution).toBe('in-scope');
    expect(plan.mode).toBe('quick');
    expect(plan.selection).toEqual({ kind: 'identity', scenarios: ['sc-001', 'sc-003', 'sc-004', 'sc-010'] });
    expect(plan.runs).toEqual([
      { module: shelf, selection: { kind: 'identity', scenarios: ['sc-001', 'sc-003'] } },
      // Not among the modules with feature files: placed by its scenario's file.
      { module: { module: 'sample/lending', dir: 'subs/lending', testing: false }, selection: { kind: 'identity', scenarios: ['sc-004'] } },
      { module: { module: 'sample/lending/ui', dir: 'subs/lending/subs/ui', testing: true }, selection: { kind: 'identity', scenarios: ['sc-010'] } },
    ]);
    // Every tracked scenario, so the reducer tells them from the project's own.
    expect(plan.tracked.map(entry => entry.id)).toEqual(['sc-001', 'sc-002', 'sc-003', 'sc-004', 'sc-005', 'sc-010']);
  });

  test('a work-item gate with no module that has feature files selects none', () => {
    expect(planScenarioCheck('work-item', inputs(allPending, []), { projectRoot: '/project' })).toEqual({ none: 'none-selected' });
  });

  test('an iteration gate that selects none records none-selected and runs no scenario command', async () => {
    const root = await directory();
    await installTestRunner(root);
    const attempt = await runCheckpoint(createPassingCheckExecution(), {
      id: 'ga-0002',
      checkpoint: 'iteration',
      projectRoot: root,
      directory: join(root, 'gate'),
      head: 'head',
      policy: testPolicy(root),
      tests: {
        selection: { policy: 'owned-by-scope', exactOwners: ['sample/shelf'], subtrees: [], extraSuites: [], resolved: ['subs/shelf/src/tests/shelf.test.ts'] },
        failure: null,
      },
      scenarios: inputs(allPending),
    });
    expect(attempt.schema).toBe('ramify-agent.gate-attempt/3');
    expect(attempt.scenarios).toBe('none-selected');
    expect(attempt.commands.map(command => command.kind)).toEqual(['tests', 'type-check', 'ramify-check']);
    expect(attempt.verdict).toBe('passed');
  });

  test('a work-item gate plans its scenario check after the other commands, and a gate without a harness plans none', async () => {
    const root = await directory();
    const request = { id: 'ga-0003', checkpoint: 'work-item' as const, projectRoot: root, directory: join(root, 'gate'), head: 'head', policy: testPolicy(root) };
    const withHarness = await runCheckpoint(createPassingCheckExecution(), { ...request, scenarios: inputs(allPending) });
    expect(withHarness.commands.map(command => command.kind)).toEqual(['tests', 'type-check', 'ramify-check', 'scenarios']);
    expect(withHarness.scenarios).toBeUndefined();
    const without = await runCheckpoint(createPassingCheckExecution(), request);
    expect(without.commands.map(command => command.kind)).toEqual(['tests', 'type-check', 'ramify-check']);
    expect(without.scenarios).toBeUndefined();
  });
});

// Execution.

interface Call {
  readonly argv: readonly string[];
  readonly timeoutMs: number;
}

/**
 * A scripted runner. A run named by `--config` gets the recorded stream
 * `streamFor` names copied to where its profile asks, and the exit code
 * `exitFor` names; setup and teardown exit 0 unless `aroundExit` says so.
 */
function scriptedRunner(options: {
  streamFor: (run: number) => string | null;
  exitFor?: (run: number) => CommandRun['outcome'];
  aroundExit?: (argv: readonly string[]) => CommandRun['outcome'];
}): { runner: CommandRunner; calls: Call[] } {
  const calls: Call[] = [];
  let runs = 0;
  const runner: CommandRunner = async (request: CommandRequest) => {
    calls.push({ argv: request.argv, timeoutMs: request.timeoutMs });
    const config = request.argv.indexOf('--config');
    let outcome: CommandRun['outcome'];
    if (config >= 0) {
      const index = runs++;
      const profile = await readFile(resolve(request.cwd, request.argv[config + 1]!), 'utf8');
      const target = /"message:([^"]+)"/u.exec(profile)![1]!;
      const stream = options.streamFor(index);
      if (stream !== null) await copyFile(join(streams, `${stream}.ndjson`), target);
      outcome = options.exitFor?.(index) ?? { kind: 'completed', exitCode: 0 };
    } else {
      outcome = options.aroundExit?.(request.argv) ?? { kind: 'completed', exitCode: 0 };
    }
    return {
      outcome,
      startedAt: new Date(0).toISOString(),
      elapsedMs: 1,
      output: { path: null, bytes: 0, truncated: false, tail: '' },
      stdout: `ran ${request.argv.join(' ')}\n`,
      stderr: '',
    };
  };
  return { runner, calls };
}

function plan(overrides: Partial<ScenarioCheckPlan> = {}): ScenarioCheckPlan {
  return {
    mode: 'quick',
    selection: { kind: 'all-untagged' },
    strict: true,
    dryRun: false,
    support: ['src/tests/support/*.ts'],
    runs: [{ module: shelf, selection: { kind: 'all-untagged' } }],
    setup: null,
    teardown: null,
    runTimeoutMs: scenarioTimeouts.quick,
    tracked,
    ...overrides,
  };
}

const identity = (...scenarios: string[]) => ({ kind: 'identity' as const, scenarios });

async function execute(scenarioPlan: ScenarioCheckPlan, runner: CommandRunner, signal = new AbortController().signal) {
  const root = await directory();
  const attemptDirectory = join(root, 'attempt');
  const project = join(root, 'project');
  const outcome = await runScenarioCheck({
    command: checkCommand({ argv: ['npm', 'run', 'acceptance:quick', '--'], cwd: project, timeoutMs: 1 }),
    plan: scenarioPlan,
    projectRoot: project,
    attemptDirectory,
    outputFile: join(root, 'check.log'),
    signal,
    runner,
  });
  return { ...outcome, attemptDirectory, project, output: await readFile(join(root, 'check.log'), 'utf8') };
}

describe('execution over the recorded streams', () => {
  test('a passing identity run: the profile written outside the project, its argv, and a summary that passes', async () => {
    const { runner, calls } = scriptedRunner({ streamFor: () => 'passing' });
    const { summary, run, attemptDirectory, output } = await execute(plan({ selection: identity('sc-001'), runs: [{ module: shelf, selection: identity('sc-001') }] }), runner);

    expect(summary.failures).toEqual([]);
    expect(run.outcome).toEqual({ kind: 'completed', exitCode: 0 });
    expect(summary.runs).toEqual([{ module: 'sample/shelf', exit: 0, profile: 'scenarios/subs-shelf.profile.mjs', messages: 'scenarios/subs-shelf.ndjson' }]);
    expect(summary.scenarios).toMatchObject([{ id: 'sc-001', run: 'sample/shelf', status: 'passed', file: shelfFile, line: 10 }]);
    expect(summary.excluded).toBe(6);
    const profile = await readFile(join(attemptDirectory, 'scenarios/subs-shelf.profile.mjs'), 'utf8');
    expect(profile).toContain('"subs/shelf/src/tests/steps/**/*.{ts,js}"');
    expect(profile).toContain('tags: "@ramify-sc-001"');
    expect(profile).toContain('strict: true');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.argv.slice(0, 5)).toEqual(['npm', 'run', 'acceptance:quick', '--', '--config']);
    expect(calls[0]!.argv).toHaveLength(6);
    expect(calls[0]!.timeoutMs).toBe(600_000);
    expect(output).toContain('Scenario check, quick mode, identity sc-001, 1 run(s): passed.');
  });

  test.each([
    ['failing', 'sc-002', /^sc-002 failed: Then the shelf lists 2 books: AssertionError/],
    ['undefined', 'sc-003', /^sc-003 undefined: no step definition matches "the user lends "Dune" to Ada"$/],
    ['ambiguous', 'sc-004', /^sc-004 ambiguous: /],
    ['pending', 'sc-005', /^sc-005 pending: /],
    ['outline', 'sc-006', /^sc-006 failed: /],
  ])('a %s scenario fails the check although the runner\'s exit alone would not say which', async (stream, id, failure) => {
    const { runner } = scriptedRunner({ streamFor: () => stream });
    const { summary } = await execute(plan({ selection: identity(id), runs: [{ module: shelf, selection: identity(id) }] }), runner);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]).toMatch(failure);
    expect(summary.scenarios[0]).toMatchObject({ id, run: 'sample/shelf' });
  });

  test('a bound scenario selected by identity runs although it carries the pending tag', async () => {
    const { runner } = scriptedRunner({ streamFor: () => 'bound' });
    const { summary } = await execute(plan({ selection: identity('sc-001', 'sc-007'), runs: [{ module: shelf, selection: identity('sc-001', 'sc-007') }] }), runner);
    expect(summary.failures).toEqual([]);
    expect(summary.scenarios.map(result => [result.id, result.status])).toEqual([['sc-001', 'passed'], ['sc-007', 'passed']]);
  });

  test('a selected scenario the run did not execute fails the check', async () => {
    const { runner } = scriptedRunner({ streamFor: () => 'passing' });
    const { summary } = await execute(plan({ selection: identity('sc-001', 'sc-005'), runs: [{ module: shelf, selection: identity('sc-001', 'sc-005') }] }), runner);
    expect(summary.failures).toEqual(['sc-005 was selected and the run of sample/shelf did not execute it']);
  });

  test('all-untagged: every tracked failure by ID, the project\'s own by count, and the pending one excluded', async () => {
    const { runner } = scriptedRunner({ streamFor: () => 'all-untagged', exitFor: () => ({ kind: 'completed', exitCode: 1 }) });
    const { summary, run } = await execute(plan(), runner);
    expect(run.outcome).toEqual({ kind: 'completed', exitCode: 1 });
    expect(summary.excluded).toBe(1);
    expect(summary.untracked).toEqual({ passed: 2, skipped: 0, failed: 1 });
    expect(summary.failures[0]).toBe('the run of sample/shelf exited with 1');
    expect(summary.failures.slice(1, 6).map(line => line.split(':')[0])).toEqual(['sc-002 failed', 'sc-003 undefined', 'sc-004 ambiguous', 'sc-005 pending', 'sc-006 failed']);
    expect(summary.failures.at(-1)).toBe('1 of the project\'s own scenarios in sample/shelf did not pass');
  });

  test('a dry run passes skipped scenarios and fails on undefined and ambiguous steps', async () => {
    const { runner, calls } = scriptedRunner({ streamFor: () => 'dry-run' });
    const { summary } = await execute(plan({ dryRun: true, selection: { kind: 'all' }, runs: [{ module: shelf, selection: { kind: 'all' } }] }), runner);
    expect(calls[0]!.argv.at(-1)).toBe('--dry-run');
    expect(summary.dryRun).toBe(true);
    expect(summary.failures.map(line => line.split(':')[0])).toEqual(['sc-003 undefined', 'sc-004 ambiguous']);
  });

  test('a zero exit with a passing stream is not enough when the stream is missing', async () => {
    const { runner } = scriptedRunner({ streamFor: () => null });
    const { summary, run } = await execute(plan(), runner);
    expect(run.outcome).toEqual({ kind: 'completed', exitCode: 0 });
    expect(summary.failures).toEqual(['the run of sample/shelf wrote no message stream']);
  });

  test('a non-zero exit fails a check whose stream passed', async () => {
    const { runner } = scriptedRunner({ streamFor: () => 'passing', exitFor: () => ({ kind: 'completed', exitCode: 2 }) });
    const { summary } = await execute(plan({ selection: identity('sc-001'), runs: [{ module: shelf, selection: identity('sc-001') }] }), runner);
    expect(summary.failures).toEqual(['the run of sample/shelf exited with 2']);
  });
});

describe('setup, teardown and timeouts', () => {
  const setup = checkCommand({ argv: ['npm', 'run', 'server:start'], cwd: '/project', timeoutMs: scenarioTimeouts.setup });
  const teardown = checkCommand({ argv: ['npm', 'run', 'server:stop'], cwd: '/project', timeoutMs: scenarioTimeouts.teardown });
  const two = [{ module: acceptance, selection: { kind: 'all' as const } }, { module: shelf, selection: { kind: 'all' as const } }];
  const full = (overrides: Partial<ScenarioCheckPlan> = {}) => plan({ mode: 'full', selection: { kind: 'all' }, runs: two, setup, teardown, runTimeoutMs: scenarioTimeouts.full, ...overrides });
  const kinds = (calls: Call[]) => calls.map(call => call.argv.includes('--config') ? `run ${call.argv[call.argv.indexOf('--config') + 1]!.split('/').at(-1)}` : call.argv.at(-1));

  test('setup runs before the first run and teardown after the last, each run with the full-mode bound', async () => {
    const { runner, calls } = scriptedRunner({ streamFor: () => 'bound' });
    const { summary } = await execute(full(), runner);
    expect(kinds(calls)).toEqual(['server:start', 'run subs-acceptance.profile.mjs', 'run subs-shelf.profile.mjs', 'server:stop']);
    expect(calls.map(call => call.timeoutMs)).toEqual([600_000, 1_800_000, 1_800_000, 600_000]);
    expect(summary.setup).toEqual({ exit: 0 });
    expect(summary.teardown).toEqual({ exit: 0 });
    expect(summary.runs.map(run => run.exit)).toEqual([0, 0]);
  });

  test('a failed run is followed by the next run and by teardown', async () => {
    const { runner, calls } = scriptedRunner({ streamFor: index => (index === 0 ? 'failing' : 'passing'), exitFor: index => ({ kind: 'completed', exitCode: index === 0 ? 1 : 0 }) });
    const { summary, run } = await execute(full(), runner);
    expect(kinds(calls)).toEqual(['server:start', 'run subs-acceptance.profile.mjs', 'run subs-shelf.profile.mjs', 'server:stop']);
    expect(run.outcome).toEqual({ kind: 'completed', exitCode: 1 });
    expect(summary.failures[0]).toBe('the run of sample/acceptance exited with 1');
  });

  test('a failed setup starts no run, and teardown still runs', async () => {
    const { runner, calls } = scriptedRunner({ streamFor: () => 'passing', aroundExit: argv => ({ kind: 'completed', exitCode: argv.at(-1) === 'server:start' ? 1 : 0 }) });
    const { summary } = await execute(full(), runner);
    expect(kinds(calls)).toEqual(['server:start', 'server:stop']);
    expect(summary.runs.map(run => run.exit)).toEqual([null, null]);
    expect(summary.failures).toEqual(['setup `npm run server:start` exited with 1, so no run started']);
  });

  test('a run that times out ends the runs, teardown still runs, and the gate records a timeout', async () => {
    const { runner, calls } = scriptedRunner({ streamFor: () => null, exitFor: () => ({ kind: 'timed-out', timeoutMs: scenarioTimeouts.full }) });
    const outcome = await execute(full(), runner);
    expect(kinds(calls)).toEqual(['server:start', 'run subs-acceptance.profile.mjs', 'server:stop']);
    expect(outcome.run.outcome).toEqual({ kind: 'timed-out', timeoutMs: 1_800_000 });
    expect(outcome.summary.failures).toEqual(['the run of sample/acceptance timed out after 1800000 ms']);
  });

  test('a failing teardown fails the check', async () => {
    const { runner } = scriptedRunner({ streamFor: () => 'bound', aroundExit: argv => ({ kind: 'completed', exitCode: argv.at(-1) === 'server:stop' ? 3 : 0 }) });
    const { summary } = await execute(full(), runner);
    expect(summary.teardown).toEqual({ exit: 3 });
    expect(summary.failures).toEqual(['teardown `npm run server:stop` exited with 3']);
  });

  test('the gate\'s bound includes the scenario check\'s runs, setup and teardown', async () => {
    const root = await directory();
    const check: PlannedCheck = { kind: 'scenarios', command: checkCommand({ argv: [process.execPath], cwd: root, timeoutMs: 2 * 1_800_000 + 1_200_000 }), scenarios: full({ setup: null, teardown: null }) };
    const prepared = await prepareGate('final', { id: 'ga-0009', projectRoot: root, directory: join(root, 'gate'), head: 'head', checks: [check] });
    expect('timeoutMs' in prepared && prepared.timeoutMs).toBe(2 * 1_800_000 + 1_200_000 + 30_000);
  });
});

describe('the verdict', () => {
  /** A port whose scenario checks run over the scripted runner, and whose other commands pass. */
  function port(runner: CommandRunner): CheckExecutionPort {
    return {
      async run(checks, request) {
        const commands = [];
        for (const [index, check] of checks.entries()) {
          const outputFile = join(request.directory, `${index}.log`);
          if (check.scenarios !== undefined) {
            const outcome = await runScenarioCheck({ command: check.command, plan: check.scenarios, projectRoot: check.command.cwd, attemptDirectory: request.directory, outputFile, signal: request.signal, runner });
            commands.push(request.classify(check, outcome.run, outputFile, outcome.summary));
          } else {
            commands.push(request.classify(check, { outcome: { kind: 'completed', exitCode: 0 }, startedAt: '', elapsedMs: 0, output: { path: outputFile, bytes: 0, truncated: false, tail: '' }, stdout: '', stderr: '' }, outputFile));
          }
        }
        return { commands, audited: null, evidence: null };
      },
    };
  }

  async function gate(checkpoint: Checkpoint, stream: string, id: string, exitCode = 0): Promise<GateAttempt> {
    const root = await directory();
    const scenarioPlan = plan({ selection: identity(id), runs: [{ module: shelf, selection: identity(id) }] });
    const { runner } = scriptedRunner({ streamFor: () => stream, exitFor: () => ({ kind: 'completed', exitCode }) });
    const checks: PlannedCheck[] = [
      { kind: 'tests', command: checkCommand({ argv: [process.execPath], cwd: root, timeoutMs: 1_000 }), attribution: 'project' },
      { kind: 'scenarios', command: checkCommand({ argv: [process.execPath], cwd: root, timeoutMs: 600_000 }), scenarios: scenarioPlan, attribution: 'project' },
    ];
    return runGate(port(runner), checkpoint, { id: 'ga-0004', projectRoot: root, directory: join(root, 'gate'), head: 'head', checks, limits: { repairRounds: 3, infrastructureRetries: 2 } });
  }

  test('a failed scenario check is repaired like failed tests, with the failure in its output', async () => {
    const attempt = await gate('work-item', 'failing', 'sc-002');
    const command = attempt.commands[1]!;
    expect(command.kind).toBe('scenarios');
    expect(command.outcome).toBe('failed');
    expect(command.exitCode).toBe(0);
    expect(command.scenarios?.failures).toHaveLength(1);
    expect(command.scenarios?.failures[0]).toMatch(/^sc-002 failed: Then the shelf lists 2 books/);
    expect(attempt).toMatchObject({ verdict: 'failed', cause: 'in-scope', next: 'repair' });
    expect(command.output.tail).toContain('- sc-002 failed');
  });

  test('a passing scenario check passes the gate and keeps its summary on the command record', async () => {
    const attempt = await gate('work-item', 'passing', 'sc-001');
    expect(attempt.verdict).toBe('passed');
    expect(attempt.commands[1]!.scenarios).toMatchObject({ mode: 'quick', selection: identity('sc-001'), failures: [] });
  });

  test('a scenario check without a summary was not verified', async () => {
    const root = await directory();
    const check: PlannedCheck = { kind: 'scenarios', command: checkCommand({ argv: [process.execPath], cwd: root, timeoutMs: 600_000 }), scenarios: plan() };
    const bare: CheckExecutionPort = {
      async run(checks, request) {
        return { commands: checks.map(entry => request.classify(entry, { outcome: { kind: 'completed', exitCode: 0 }, startedAt: '', elapsedMs: 0, output: { path: null, bytes: 0, truncated: false, tail: '' }, stdout: '', stderr: '' }, join(request.directory, 'x.log'))), audited: null, evidence: null };
      },
    };
    const attempt = await runGate(bare, 'work-item', { id: 'ga-0005', projectRoot: root, directory: join(root, 'gate'), head: 'head', checks: [check] });
    expect(attempt.commands[0]).toMatchObject({ outcome: 'not-verified', notVerified: 'runner-error', runnerError: { kind: 'scenario-summary-missing' } });
    expect(attempt.cause).toBe('infrastructure');
  });
});
