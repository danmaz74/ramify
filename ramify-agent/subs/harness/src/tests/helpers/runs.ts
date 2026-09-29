import { execFile, spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createScriptedAgent, type Script, type ScriptedAgent, type ScriptedAgentOptions } from '../../../subs/agent/src/scripted.js';
import { declaringScenarios } from './declarations.js';
import { childEnvironment } from '../../../subs/evidence/src/run-command.js';
import { checkCommand } from '../../checks/records.js';
import { privateRamify, RamifyCli, ramifyExecutable } from '../../../subs/evidence/src/ramify-cli.js';
import type { InputManifest } from '../../interfaces/protocol/evidence.js';
import type { RunCommand } from '../../interfaces/protocol/runs.js';
import { sha256 } from '../../prompts/packages.js';
import type { RunEvent } from '../../run/log.js';
import { defaultContextPolicies, defaultRunPolicy } from '../../run/policy.js';
import type { RunPolicy } from '../../run/records.js';
import type { RunInputs } from '../../run/inputs.js';
import { RunService, type RunServiceOptions } from '../../run/service.js';
import type { CapabilityWorkflow } from '../../capability/workflow.js';
import { acquireProjectLock, lockPath } from '../../store/lock.js';
import { FakeRamifyCli } from './fake-ramify.js';
import { installScriptedCucumber } from './project-config.js';
import {
  createDirectCheckExecution, createMappedCheckExecution, createPassingCheckExecution,
  type DirectCheckScript, type DirectCheckStep,
} from './direct-check-execution.js';

const exec = promisify(execFile);

/*
 * What a test needs to drive an implementation run: a target project that is
 * a git repository, a policy whose commands are valid but cheap, inputs that
 * need no materialized view, and the scripted agent fake.
 *
 * `openRuns` uses a direct check-execution fake by default. Tests of actual
 * command execution or audit publication opt into those executors explicitly.
 */

const identity = ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost'];

/** Runs git in a project under a fixed identity, with no person's configuration in reach. */
export async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, {
    cwd: root,
    env: childEnvironment({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }),
  });
  return stdout;
}

/** Makes a copied project a git repository with one commit, as a run requires. */
export async function initRepository(root: string): Promise<string> {
  await git(root, 'init', '--initial-branch=main');
  await git(root, 'add', '--all');
  await git(root, ...identity, 'commit', '--message', 'fixture');
  return (await git(root, 'rev-parse', 'HEAD')).trim();
}

/**
 * The test runners readiness looks for. The fixture project carries no
 * `node_modules`, so a copy that a run works in is given the two binaries the
 * `test-runner` and `acceptance-runner` steps require. Neither runs anything:
 * the commands a lifecycle test's gates run are its policy's, and the
 * scenario runner is a scripted command wherever one runs, which writes a
 * message stream of a successful run with no scenario in it.
 */
export async function installTestRunner(root: string): Promise<void> {
  const directory = join(root, 'node_modules', '.bin');
  await mkdir(directory, { recursive: true });
  const vitest = join(directory, 'vitest');
  await writeFile(vitest, '#!/bin/sh\nexit 0\n');
  await chmod(vitest, 0o755);
  await installScriptedCucumber(join(directory, 'cucumber-js'));
}

/** A command that runs for real and answers `code`. */
export function exits(code: number, cwd: string, timeoutMs = 30_000) {
  return checkCommand({ argv: [process.execPath, '-e', `process.exit(${code})`], cwd, timeoutMs });
}

/**
 * A command that runs for real, counts its own runs in a file outside the
 * project, and fails from the `failFrom`-th run on. Readiness and the final
 * gate run the same captured command, so this is how one of them passes and
 * the other does not.
 */
export function exitsAfter(failFrom: number, cwd: string, counter: string, timeoutMs = 30_000) {
  const program = [
    'const fs = require("fs");',
    `const p = ${JSON.stringify(counter)};`,
    'const n = (fs.existsSync(p) ? Number(fs.readFileSync(p, "utf8")) : 0) + 1;',
    'fs.writeFileSync(p, String(n));',
    `process.exit(n >= ${failFrom} ? 1 : 0);`,
  ].join('');
  return checkCommand({ argv: [process.execPath, '-e', program], cwd, timeoutMs });
}

export interface TestPolicyOptions {
  /** Which of the three baseline commands fails, and with which code. */
  readonly failing?: 'allTests' | 'typeCheck' | 'ramifyCheck' | undefined;
  /** Runs the installed Ramify CLI for the complete check instead of a cheap command. */
  readonly realRamifyCheck?: boolean | undefined;
  /** A command whose executable is not there, which is never recoverable. */
  readonly missingCommand?: 'allTests' | 'typeCheck' | undefined;
  /** A test command that passes at readiness and fails from the given run on. */
  readonly testsFailFrom?: { readonly run: number; readonly counter: string } | undefined;
  /** A command that never answers, so its checkpoint records a timeout. */
  readonly timingOut?: 'allTests' | undefined;
  readonly nested?: ReadonlyArray<{ directory: string; testScript: string | null }> | undefined;
  /**
   * The review policy the run captures. A test policy requests no reviews
   * unless it says so, so the invocations and events of every other
   * scenario are the ones it states.
   */
  readonly reviews?: RunPolicy['reviews'];
}

/**
 * A policy over one project whose commands are cheap. Its limits and its
 * context policies are the hardcoded ones: only the commands differ, and a
 * run records the policy it ran under, so what it ran is in `job.json`.
 */
export function testPolicy(projectRoot: string, options: TestPolicyOptions = {}): RunPolicy {
  const base = defaultRunPolicy({
    projectRoot,
    nested: (options.nested ?? []).map(entry => ({ directory: entry.directory, manifest: `${entry.directory}/package.json`, installed: true, testScript: entry.testScript })),
  });
  const command = (name: 'allTests' | 'typeCheck' | 'ramifyCheck') => {
    if (options.missingCommand === name) {
      return checkCommand({ argv: [join(projectRoot, 'no-such-command')], cwd: projectRoot, timeoutMs: 30_000 });
    }
    if (name === 'allTests' && options.timingOut === 'allTests') {
      return checkCommand({ argv: [process.execPath, '-e', 'setTimeout(() => undefined, 60000)'], cwd: projectRoot, timeoutMs: 500 });
    }
    if (name === 'allTests' && options.testsFailFrom !== undefined) {
      return exitsAfter(options.testsFailFrom.run, projectRoot, options.testsFailFrom.counter);
    }
    if (name === 'ramifyCheck' && options.realRamifyCheck === true) {
      return { ...base.commands.ramifyCheck, argv: [ramifyExecutable, 'check', '--batch', '--root', projectRoot, '--format', 'json', '--no-snapshot'] };
    }
    return exits(options.failing === name ? 1 : 0, projectRoot);
  };
  const { reviews: _reviews, ...unreviewed } = base;
  return {
    ...unreviewed,
    version: 'run-policy/4',
    // Historical fixture runs use the captured contract role. New production
    // policy/5 deliberately omits it from its context and prompt manifest.
    context: { ...base.context, 'contract-engineer': defaultContextPolicies['contract-engineer'] },
    ...(options.reviews === undefined ? {} : { reviews: options.reviews }),
    commands: {
      ...base.commands,
      allTests: command('allTests'),
      typeCheck: command('typeCheck'),
      ramifyCheck: command('ramifyCheck'),
      nestedPackages: base.commands.nestedPackages.map(entry => ({
        ...entry,
        install: exits(0, entry.install.cwd, 60_000),
        tests: entry.tests === null ? null : exits(0, entry.tests.cwd),
      })),
    },
  };
}

/**
 * Inputs for tests of the run's lifecycle, which need no evidence: the plan
 * hash is real, the architect view is a placeholder marked as such, and the
 * analysis is checked by its schema and the rules that need no view.
 */
export const shapeOnlyInputs: RunInputs = {
  async capture(_projectRoot, capturedPlan) {
    return {
      planHash: sha256(capturedPlan),
      source: null,
      versions: { architectPrompt: null, procedure: null, skill: null, ramify: null },
      architectView: { status: 'placeholder' },
    } satisfies InputManifest;
  },
  async index() {
    return null;
  },
  async changes() {
    return [];
  },
  async refresh() {
    return null;
  },
};

/**
 * A `ramify` that answers its version and nothing else, for a test of the
 * run's lifecycle. It is a real executable, spawned like any other, and its
 * exit codes are its own: the version the `ramify-daemon` readiness step
 * asks for, and not-checked for everything else, so a run's baseline is
 * unavailable with that reason.
 *
 * The installed command line is the measurement test's, which works over one
 * project at a time. A run test that made a resident daemon analyse a
 * temporary project would leave it with a compiler helper whose working
 * directory the next test removes.
 */
export async function stubRamify(): Promise<RamifyCli> {
  if (stubbed === undefined) {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-stub-'));
    const executable = join(directory, 'ramify');
    await writeFile(executable, STUB);
    await chmod(executable, 0o755);
    stubbed = new RamifyCli({ executable, timeoutMs: 30_000 });
  }
  return stubbed;
}

let stubbed: RamifyCli | undefined;

const STUB = [
  '#!/bin/sh',
  'if [ "$1" = "--version" ]; then echo "ramify 0.0.0 (the run tests\' stub)"; exit 0; fi',
  'echo \'{"schemaVersion":"ramify.cli/1","status":"unavailable","reason":"stub","exitCode":2}\'',
  'exit 2',
  '',
].join('\n');

/** This package's own root, which no test removes. */
const packageRoot = fileURLToPath(new URL('../../../../../', import.meta.url));

/**
 * The installed command line, with a daemon of its own, for a test that
 * needs real evidence.
 *
 * The daemon inherits the working directory of the invocation that starts
 * it and spawns its compiler helper from there. Started from a temporary
 * project, that helper fails with `getwd` as soon as the project is removed,
 * and every later analysis with it. It is therefore started from this
 * package's own root, by a bounded check that analyses nothing.
 */
export async function realRamify(): Promise<Awaited<ReturnType<typeof privateRamify>>> {
  const daemon = await privateRamify({ timeoutMs: 180_000 });
  await daemon.ramify.run(['check', '--changed', 'package.json', '--format', 'json', '--deadline', '1'], packageRoot);
  return daemon;
}

export interface OpenRunsOptions extends Partial<RunServiceOptions> {
  /** Exercise the public production constructor and its fixed policy. */
  readonly production?: boolean | undefined;
  /** Test-only workflow factory; production composition never receives it. */
  readonly capabilityWorkflowFactory?: (() => CapabilityWorkflow) | undefined;
  /** Every test chooses its Git boundary explicitly; this helper has no production fallback. */
  readonly git: NonNullable<RunServiceOptions['git']>;
  readonly script?: Script | undefined;
  /** Script for the direct test executor. Ignored when `checkExecution` is supplied. */
  readonly checkScript?: readonly DirectCheckStep[] | DirectCheckScript | undefined;
  /** What the scripted fake declares, such as a fork it lacks. */
  readonly agentOptions?: ScriptedAgentOptions | undefined;
}

/** The scripted fake a test drove the run with, where it gave a script. */
export type TestAgent = ScriptedAgent | undefined;

/**
 * Opens a run service with direct, deterministic gate execution.
 *
 * Synthetic evidence from this helper exercises harness policy only. It is
 * not a published audit and cannot establish MCP acceptance evidence.
 */
export async function openRuns(root: string, options: OpenRunsOptions) {
  const lock = await acquireProjectLock(root);
  const scripted = options.script === undefined ? undefined : createScriptedAgent(declaringScenarios(options.script), options.agentOptions);
  const agent = scripted ?? options.agent;
  const warnings: string[] = [];
  const { script: _script, checkScript, agentOptions: _agentOptions, capabilityWorkflowFactory, production, ...rest } = options;
  const checkExecution = checkScript === undefined
    ? createPassingCheckExecution()
    : typeof checkScript === 'function'
      ? createMappedCheckExecution({ script: checkScript })
      : createDirectCheckExecution({ script: checkScript });
  const serviceOptions: RunServiceOptions = {
    projectRoot: root,
    lock,
    inputs: shapeOnlyInputs,
    ramify: options.ramify ?? new FakeRamifyCli(),
    checkExecution,
    stopGraceMs: 500,
    ...(production === true ? {} : { policy: (projectRoot: string) => testPolicy(projectRoot) }),
    warn: message => warnings.push(message),
    ...rest,
    ...(agent === undefined ? {} : { agent }),
  };
  const { service, recovery } = production === true
    ? await RunService.open(serviceOptions)
    : capabilityWorkflowFactory === undefined
      ? await RunService.openForHistoricalTests(serviceOptions)
      : await RunService.openForCapabilityTests(serviceOptions, capabilityWorkflowFactory);
  return { service, recovery, agent: scripted, lock, warnings };
}

let commandCount = 0;

export function startRun(planId: string, agent: 'pi' | 'scripted' = 'scripted', commandId = `start-${++commandCount}`, reviewStop = false): RunCommand {
  return { commandId, expectedVersion: 0, type: 'start-run', payload: { planId, agent, reviewStop } };
}

/** A person's approval of a run's analysis, at the version the caller read. */
export function approveRun(
  planId: string,
  jobId: string,
  expectedVersion: number,
  reviewer = 'reviewer@example.com',
  note?: string,
  commandId = `approve-${++commandCount}`,
): RunCommand {
  return { commandId, expectedVersion, type: 'approve-analysis', payload: { planId, jobId, reviewer, ...(note === undefined ? {} : { note }) } };
}

export function stopRun(planId: string, jobId: string, expectedVersion: number, commandId = `stop-${++commandCount}`): RunCommand {
  return { commandId, expectedVersion, type: 'stop-job', payload: { planId, jobId } };
}

/** A valid initial analysis with no entry capability: the smallest coherent run. */
export function emptyAnalysis() {
  return { elements: [], entries: [], hypotheses: [], coverageLimits: [], scenarios: [], integrationScenarios: [] };
}

/** The run's events as written in its `events.jsonl`, one to a ledger line. */
export async function runEventsOnDisk(root: string, planId: string, runId: string): Promise<RunEvent[]> {
  const text = await readFile(join(root, 'plans', planId, '.harness', 'jobs', runId, 'events.jsonl'), 'utf8');
  return text.split('\n').filter(Boolean).map(line => (JSON.parse(line) as { event: RunEvent }).event);
}

/** The directory of one run beneath the project. */
export function runPath(root: string, planId: string, runId: string, ...parts: string[]): string {
  return join(root, 'plans', planId, '.harness', 'jobs', runId, ...parts);
}

/** The single run of a plan, once the service has one. */
export function onlyRun(service: RunService, planId: string) {
  const runs = service.listRuns(planId);
  if (runs.length !== 1) throw new Error(`Expected one run of "${planId}", found ${runs.length}`);
  return runs[0]!;
}

/** Waits until `condition` holds, polling. */
export async function until(condition: () => boolean | Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for a condition');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/** The process ID of a process that has exited: a holder no lock can find. */
export function deadPid(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', () => resolve(child.pid!));
  });
}

/**
 * What a crash leaves: the lock file of a process that is gone. The crashed
 * service is abandoned, never closed, so it writes nothing more.
 */
export async function crashLock(root: string): Promise<void> {
  const record = { pid: await deadPid(), startedAt: new Date().toISOString(), processStart: null, token: 'crashed' };
  await writeFile(join(root, lockPath), `${JSON.stringify(record)}\n`);
}

/**
 * What an ordinary recovery fixture leaves without starting a helper
 * process: a valid lock record whose PID is outside Linux's PID range, so
 * the real liveness check deterministically classifies it as stale.
 * Real stale-process integration tests retain {@link crashLock}.
 */
export async function staleCrashLock(root: string): Promise<void> {
  const record = { pid: 2_147_483_647, startedAt: new Date().toISOString(), processStart: null, token: 'crashed' };
  await writeFile(join(root, lockPath), `${JSON.stringify(record)}\n`);
}

/** A promise that never settles: a run frozen here writes nothing more, as after a crash. */
export const freeze = (): Promise<void> => new Promise(() => undefined);
