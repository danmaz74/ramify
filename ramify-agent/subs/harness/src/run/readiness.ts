import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import type { CheckExecutionPort, GateCommandStarted } from '../checks/execution.js';
import { runGate } from '../checks/gate.js';
import { allProjectChecks, checkpointPolicies, installOperation, linkedModulesRefusals, planScenarioCheck, setupChecks } from '../checks/checkpoint.js';
import { checkCommandEnvironment } from '../checks/records.js';
import type { GateAttempt, GateCommandRecord } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { gitService, GitError, runBranchName, type GitService } from '../../subs/evidence/src/git.js';
import { runCommand, type CommandRunner } from '../../subs/evidence/src/run-command.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { RunFailureReason } from '../interfaces/protocol/runs.js';
import { discoverNestedPackages } from './policy.js';
import { declaredModuleDirectories, matchSupport, moduleTestAreas, scenarioModules, unresolvedCommands } from './project-config.js';
import { removeScratchDirectories, trackedScratchPaths } from '../work/scratch.js';
import {
  readinessAttemptSchema, infrastructureRecoverySchema,
  type CapturedProjectConfig, type InfrastructureRecovery, type ReadinessAttempt, type ReadinessStep, type RecoveryId, type RunPolicy,
} from './records.js';

/*
 * Execution readiness. Before any work is assigned, the harness verifies the
 * project it will work in: that it is there, that it is a clean git
 * repository, that the compiler configuration, the test runner, the
 * project's configuration, its scenario harness and the independent nested
 * packages are present and installed, that tests are
 * discovered, that Ramify answers, and that the project's own baseline
 * passes: its tests, type check and Ramify check, its own scenarios in quick
 * mode, and its full mode loaded or run.
 *
 * Missing dependencies or a nonexistent command are readiness failures, not
 * code-repair assignments. A failure that a bounded preparation can repair
 * consumes one recovery; one that it cannot consumes none and ends the run
 * at once with its evidence.
 */

/** One step's result, before the attempt records it. */
interface StepResult {
  readonly step: ReadinessStep;
  readonly outcome: 'passed' | 'failed' | 'not-verified';
  readonly detail: string;
}

export interface ReadinessRequest {
  /** The run whose branch the last step creates. */
  readonly runId: string;
  /** The count of committed readiness attempts, this one included. */
  readonly attempt: number;
  readonly projectRoot: string;
  /** Where the attempt's output files go, beside the gate's record. */
  readonly gateDirectory: string;
  readonly gateId: string;
  readonly policy: RunPolicy;
  /** The project's configuration as `start-run` captured it. */
  readonly projectConfig: CapturedProjectConfig;
  /** The architect view that names the modules, or null where the run has none. */
  readonly index?: ArchitectIndex | null | undefined;
  readonly ramify: RamifyCli;
  readonly git?: GitService | undefined;
  /** The commit readiness ran on. */
  readonly head: string;
  readonly signal?: AbortSignal | undefined;
  /** Called as each command of the baseline gate starts. */
  readonly started?: GateCommandStarted | undefined;
  readonly waiting?: import('../checks/gate.js').GateRequest['waiting'];
}

/** What one readiness attempt established, with the gate that ran the baseline. */
export interface ReadinessResult {
  readonly attempt: ReadinessAttempt;
  /** The baseline gate, or null when an earlier step stopped the attempt before it. */
  readonly gate: GateAttempt | null;
}

/** Vitest's default discovery patterns, which the MVP's one supported runner uses. */
const testFilePattern = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** How deep the walk looks for a test file before it stops. */
const testDiscoveryDepth = 8;

/** Runs one readiness attempt and answers what it established. */
export async function runReadiness(execution: CheckExecutionPort, request: ReadinessRequest): Promise<ReadinessResult> {
  const { projectRoot, policy } = request;
  const steps: StepResult[] = [];

  steps.push(await projectRootStep(projectRoot));
  steps.push(await scratchCleanupStep(projectRoot, request.git ?? gitService, steps[0]!.outcome));
  steps.push(await gitCleanStep(projectRoot, request.signal, request.git ?? gitService));
  steps.push(await compilerConfigStep(projectRoot));
  steps.push(await testRunnerStep(projectRoot));
  steps.push(await projectConfigStep(projectRoot, request.projectConfig, request.index ?? null));
  steps.push(await acceptanceRunnerStep(projectRoot, request.projectConfig));

  const nested = await discoverNestedPackages(projectRoot);
  steps.push(nestedPackagesStep(nested, policy));
  steps.push(await testDiscoveryStep(projectRoot));
  steps.push(await ramifyDaemonStep(request));

  const blocked = steps.find(step => step.outcome !== 'passed');
  if (blocked !== undefined) {
    for (const step of [...gateSteps, 'run-branch'] as const) {
      steps.push({ step, outcome: 'not-verified', detail: `not reached: ${blocked.step} did not pass` });
    }
    return { attempt: attemptRecord(request, steps, nested, null), gate: null };
  }

  // The scenario harness's baseline: the project's own scenarios in quick
  // mode, and full mode loaded with `--dry-run` or, where the project asks,
  // run. The plan's feature files are not written yet, and a pending one
  // left by an earlier run is kept out, so this is the project's own
  // regression acceptance. A step reached here has a valid configuration.
  const acceptance = await acceptanceChecks(request);
  // The project's setup commands run first, at the project root, as every
  // gate runs them: a baseline that needs a build output is judged with it.
  const declared = 'config' in request.projectConfig ? request.projectConfig.config.setup ?? [] : [];
  const setup = setupChecks(declared, projectRoot);
  // A setup command that installs where an audited worktree links the
  // project's own node_modules would pass here, in place, and be refused by
  // every audited gate after it: readiness refuses it first.
  const refused = linkedInstalls(setup, projectRoot, linkedDirectories(policy, nested));
  if (refused !== null) {
    steps.push({ step: 'baseline-setup', outcome: 'failed', detail: refused });
    for (const step of [...gateSteps.filter(step => step !== 'baseline-setup'), 'run-branch'] as const) {
      steps.push({ step, outcome: 'not-verified', detail: 'not reached: baseline-setup did not pass' });
    }
    return { attempt: attemptRecord(request, steps, nested, null), gate: null };
  }
  const checks = [...setup, ...allProjectChecks(policy.commands, checkpointPolicies.readiness)];
  const acceptanceIndex = { quick: -1, full: -1 };
  if (acceptance.quick !== null) acceptanceIndex.quick = checks.push(acceptance.quick) - 1;
  if (acceptance.full !== null) acceptanceIndex.full = checks.push(acceptance.full) - 1;

  const gate = await runGate(execution, 'readiness', {
    id: request.gateId,
    projectRoot,
    directory: request.gateDirectory,
    head: request.head,
    checks,
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    ...(request.started === undefined ? {} : { started: request.started }),
    ...(request.waiting === undefined ? {} : { waiting: request.waiting }),
  });

  steps.push(setupStep(gate.commands.slice(0, setup.length)));

  // The baseline's three steps read the gate's own command records. The
  // nested packages' tests run inside the same attempt, beside the project's.
  const byKind = (kind: 'tests' | 'type-check' | 'ramify-check', skip: number) =>
    gate.commands.filter(command => command.kind === kind)[skip];
  const nestedTestCount = policy.commands.nestedPackages.filter(entry => entry.tests !== null).length;
  const baseline: Array<{ step: ReadinessStep; record: GateAttempt['commands'][number] | undefined; label: string }> = [
    { step: 'baseline-tests', record: byKind('tests', 0), label: 'the project\'s tests' },
    { step: 'baseline-type-check', record: byKind('type-check', 0), label: 'the type check' },
    { step: 'baseline-ramify-check', record: byKind('ramify-check', 0), label: 'the complete Ramify check' },
  ];
  for (const { step, record, label } of baseline) {
    if (record === undefined) {
      steps.push({ step, outcome: 'not-verified', detail: `the gate ran no command for ${label}` });
      continue;
    }
    steps.push({
      step,
      outcome: record.outcome,
      detail: describeCommand(label, record),
    });
  }
  if (nestedTestCount > 0) {
    const failing = gate.commands.filter(command => command.kind === 'tests').slice(1).filter(command => command.outcome !== 'passed');
    if (failing.length > 0) {
      const index = steps.findIndex(step => step.step === 'baseline-tests');
      const existing = steps[index]!;
      steps[index] = {
        step: 'baseline-tests',
        outcome: failing[0]!.outcome,
        detail: `${existing.detail}; ${failing.length} of ${nestedTestCount} nested package test runs did not pass: ${failing.map(command => describeCommand(command.command.cwd, command)).join('; ')}`,
      };
    }
  }

  steps.push(acceptanceStep('baseline-acceptance', gate.commands[acceptanceIndex.quick], acceptance.modules));
  steps.push(acceptanceStep('acceptance-full', gate.commands[acceptanceIndex.full], acceptance.modules));

  // The run branch is created last, once the repository is clean and the
  // baseline passed, so a readiness that fails leaves the project on its own
  // branch. A branch git refuses fails readiness here, with git's message,
  // before any work: the first commit would otherwise fail far from the cause.
  const failed = steps.find(step => step.outcome !== 'passed');
  steps.push(failed === undefined
    ? await runBranchStep(projectRoot, request.runId, request.signal, request.git ?? gitService)
    : { step: 'run-branch', outcome: 'not-verified', detail: `not reached: ${failed.step} did not pass` });

  return { attempt: attemptRecord(request, steps, nested, gate), gate };
}

/**
 * The steps the baseline gate verifies, in the order the attempt records
 * them. The two acceptance steps follow `acceptance-runner` in the step
 * vocabulary, and are recorded here, where they are verified: a step not
 * reached must never stand before the step that stopped the attempt.
 */
const gateSteps: readonly ReadinessStep[] = ['baseline-setup', 'baseline-tests', 'baseline-type-check', 'baseline-ramify-check', 'baseline-acceptance', 'acceptance-full'];

/** How much of a failed setup command's output its step quotes: a build's errors are the reason readiness failed. */
const setupTailCharacters = 2_000;

/**
 * The project's setup commands, which ran before every other command of the
 * baseline gate: passed with nothing to run where the project declares
 * none, and otherwise as the first of them that did not pass, with the end
 * of what it printed.
 */
function setupStep(records: readonly GateCommandRecord[]): StepResult {
  const step = 'baseline-setup';
  if (records.length === 0) return { step, outcome: 'passed', detail: 'the project declares no setup command' };
  const failed = records.find(record => record.outcome !== 'passed');
  if (failed !== undefined) {
    return { step, outcome: failed.outcome, detail: describeCommand(setupLabel(failed), failed, setupTailCharacters) };
  }
  return {
    step,
    outcome: 'passed',
    detail: `${records.length} setup command${records.length === 1 ? '' : 's'} passed: ${records.map(record => `${setupLabel(record)}, \`${record.command.argv.join(' ')}\` in ${record.elapsedMs} ms`).join('; ')}`,
  };
}

/**
 * The project directories whose `node_modules` an audited gate links into
 * its worktree: the project root, and each nested package whose tests a
 * gate runs or that the project has installed.
 */
function linkedDirectories(
  policy: RunPolicy,
  nested: ReadonlyArray<{ readonly directory: string; readonly installed: boolean }>,
): string[] {
  const linked = new Set<string>(['']);
  for (const entry of policy.commands.nestedPackages) if (entry.tests !== null) linked.add(entry.directory);
  for (const entry of nested) if (entry.installed) linked.add(entry.directory);
  return [...linked];
}

/** How many directory levels below its working directory ramify-audit looks for a linked `node_modules`. */
const linkedModulesDepth = 4;

/**
 * Why a declared setup command would be refused in every audited gate, or
 * null where none would: ramify-audit does not run a command that installs
 * dependencies where its working directory, or one up to four levels below
 * it, has a `node_modules` linked to the project's own, since the package
 * manager would follow the link and change or empty that installation.
 */
function linkedInstalls(setup: readonly PlannedCheck[], projectRoot: string, linked: readonly string[]): string | null {
  for (const check of setup) {
    const operation = installOperation(check.command.argv);
    if (operation === null) continue;
    const cwd = relative(projectRoot, check.command.cwd).split(sep).join('/');
    const below = linked.filter(directory => {
      if (directory === cwd) return true;
      if (cwd !== '' && !directory.startsWith(`${cwd}/`)) return false;
      const rest = cwd === '' ? directory : directory.slice(cwd.length + 1);
      return rest.split('/').length <= linkedModulesDepth;
    });
    if (below.length === 0) continue;
    const label = check.name === undefined ? 'the setup command' : `the setup command "${check.name}"`;
    const links = below.map(directory => `\`${directory === '' ? '' : `${directory}/`}node_modules\``).join(', ');
    return `${label}: \`${check.command.argv.join(' ')}\` runs \`${operation}\` in ${cwd === '' ? 'the project root' : `\`${cwd}\``}, `
      + `where every audited gate links the project's own ${links}; ramify-audit refuses to run it there, since the package manager `
      + 'would follow the link and change or empty the project\'s installation. The project\'s `setup` in ramify-agent.json must not '
      + 'install dependencies: the audited worktree already has the project\'s installed ones.';
  }
  return null;
}

function setupLabel(record: GateCommandRecord): string {
  return record.name === undefined ? 'the setup command' : `the setup command "${record.name}"`;
}

/** Readiness's two scenario checks, or null for each when no module has feature files. */
async function acceptanceChecks(request: ReadinessRequest): Promise<{ quick: PlannedCheck | null; full: PlannedCheck | null; modules: number }> {
  const captured = request.projectConfig;
  if ('invalid' in captured) return { quick: null, full: null, modules: 0 };
  const modules = await scenarioModules(request.projectRoot, request.index ?? null);
  const inputs = { harness: captured.config.acceptance, modules, scenarios: [] };
  const quick = planScenarioCheck('readiness', inputs, { projectRoot: request.projectRoot });
  const full = planScenarioCheck('readiness', inputs, {
    projectRoot: request.projectRoot,
    mode: 'full',
    dryRun: captured.config.acceptance.modes.full.readiness === 'dry-run',
  });
  return { quick: 'check' in quick ? quick.check : null, full: 'check' in full ? full.check : null, modules: modules.length };
}

/** One acceptance step from its scenario command, or passed with nothing to run when no module has feature files. */
function acceptanceStep(step: 'baseline-acceptance' | 'acceptance-full', record: GateCommandRecord | undefined, modules: number): StepResult {
  if (modules === 0) {
    return { step, outcome: 'passed', detail: 'no module has feature files, so there is no scenario to run' };
  }
  if (record === undefined) return { step, outcome: 'not-verified', detail: 'the gate ran no scenario check for this step' };
  const summary = record.scenarios;
  const label = step === 'baseline-acceptance' ? 'the project\'s own scenarios in quick mode' : summary?.dryRun ? 'full mode, loaded with --dry-run' : 'the project\'s own scenarios in full mode';
  if (summary === undefined || record.outcome === 'not-verified') return { step, outcome: record.outcome, detail: describeCommand(label, record) };
  const counts = `${summary.runs.length} run${summary.runs.length === 1 ? '' : 's'}; the project's own scenarios: ${summary.untracked.passed} passed, ${summary.untracked.skipped} skipped, ${summary.untracked.failed} failed`;
  return {
    step,
    outcome: record.outcome,
    detail: record.outcome === 'passed'
      ? `${label}: passed in ${record.elapsedMs} ms over ${counts}`
      : `${label}: ${summary.failures.slice(0, 5).join('; ')}${summary.failures.length > 5 ? `; and ${summary.failures.length - 5} more` : ''} (${counts})`,
  };
}

function describeCommand(label: string, record: GateAttempt['commands'][number], tailCharacters = 400): string {
  if (record.notVerified === 'setup-failed') {
    return `${label}: \`${record.command.argv.join(' ')}\` did not run, because a setup command before it did not pass`;
  }
  const outcome = record.outcome === 'passed'
    ? `passed in ${record.elapsedMs} ms`
    : record.outcome === 'failed'
      ? `exited with ${record.exitCode}`
      : `not verified (${record.notVerified ?? 'unknown'})`;
  const tail = record.output.tail.trim();
  const stopped = [
    ...(record.stopped === undefined ? [] : [record.stopped]),
    ...(record.outputIncomplete === true ? ['its output may be incomplete'] : []),
  ];
  return `${label}: \`${record.command.argv.join(' ')}\` ${outcome}${stopped.length === 0 ? '' : `; ${stopped.join('; ')}`}${tail === '' ? '' : `; ${tail.slice(-tailCharacters)}`}`;
}

function attemptRecord(
  request: ReadinessRequest,
  steps: readonly StepResult[],
  nested: ReadonlyArray<{ directory: string; manifest: string; installed: boolean; testScript: string | null }>,
  gate: GateAttempt | null,
): ReadinessAttempt {
  const baseline = new Set<string>(gateSteps);
  return readinessAttemptSchema.parse({
    schema: 'ramify-agent.readiness-attempt/1',
    attempt: request.attempt,
    head: request.head,
    steps: steps.map(step => ({
      step: step.step,
      outcome: step.outcome,
      detail: step.detail,
      ...(gate !== null && baseline.has(step.step) ? { gate: gate.id } : {}),
    })),
    nested: nested.map(entry => ({ ...entry })),
    verdict: steps.every(step => step.outcome === 'passed') ? 'passed' : 'failed',
    recovery: null,
  });
}

/** The same attempt, naming the recovery it led to. It is committed once, with that name. */
export function withRecovery(attempt: ReadinessAttempt, recovery: RecoveryId | null): ReadinessAttempt {
  return readinessAttemptSchema.parse({ ...attempt, recovery });
}

/** The first step that did not pass, which names the failure. */
export function failingStep(attempt: ReadinessAttempt): ReadinessAttempt['steps'][number] | undefined {
  return attempt.steps.find(step => step.outcome !== 'passed');
}

/**
 * The reason a run fails with when readiness ends at this step. The
 * project's configuration and its scenario harness name their own; every
 * other step is `readiness-failed`.
 */
export function readinessFailureReason(step: string | undefined): RunFailureReason {
  if (step === 'project-config') return 'project-config-invalid';
  if (step === 'acceptance-runner') return 'acceptance-harness-missing';
  return 'readiness-failed';
}

// The steps.

async function projectRootStep(projectRoot: string): Promise<StepResult> {
  if (!(await isDirectory(projectRoot))) {
    return { step: 'project-root', outcome: 'failed', detail: `${projectRoot} is not a directory` };
  }
  if (!(await isFile(join(projectRoot, 'package.json')))) {
    return { step: 'project-root', outcome: 'failed', detail: `${projectRoot} has no package.json, so it names no project` };
  }
  return { step: 'project-root', outcome: 'passed', detail: `${projectRoot}, with its package.json` };
}

async function gitCleanStep(projectRoot: string, signal: AbortSignal | undefined, git: GitService): Promise<StepResult> {
  try {
    const clean = await git.isCleanRepository(projectRoot, signal);
    return clean
      ? { step: 'git-clean', outcome: 'passed', detail: 'the working tree is clean' }
      : { step: 'git-clean', outcome: 'failed', detail: 'the working tree has uncommitted changes; a run starts from a clean repository so that every accepted boundary is its own commit' };
  } catch (error) {
    const detail = error instanceof GitError ? error.message : error instanceof Error ? error.message : String(error);
    return { step: 'git-clean', outcome: 'failed', detail: `the execution directory is not a git repository the harness can read: ${detail}` };
  }
}

async function scratchCleanupStep(projectRoot: string, git: GitService, rootOutcome: StepResult['outcome']): Promise<StepResult> {
  if (rootOutcome !== 'passed') return { step: 'scratch-cleanup', outcome: 'not-verified', detail: 'the project root is unavailable' };
  try {
    const modules = await declaredModuleDirectories(projectRoot);
    const tracked = await trackedScratchPaths(projectRoot, modules, git);
    if (tracked.length > 0) return {
      step: 'scratch-cleanup', outcome: 'failed',
      detail: `tracked scratch paths must be removed from the index before readiness: ${tracked.join(', ')}; nothing was deleted`,
    };
    const removed = await removeScratchDirectories(projectRoot, modules, git);
    if (removed.preservedTracked.length > 0) return {
      step: 'scratch-cleanup', outcome: 'failed',
      detail: `tracked scratch paths appeared during cleanup: ${removed.preservedTracked.join(', ')}`,
    };
    return { step: 'scratch-cleanup', outcome: 'passed', detail: `stale scratch removed from ${modules.length} module${modules.length === 1 ? '' : 's'}` };
  } catch (error) {
    const detail = error instanceof GitError ? `${error.message}: ${error.detail.output}`
      : error instanceof Error ? error.message : String(error);
    return { step: 'scratch-cleanup', outcome: 'failed', detail: `scratch cleanup could not complete: ${detail}` };
  }
}

async function compilerConfigStep(projectRoot: string): Promise<StepResult> {
  const path = join(projectRoot, 'tsconfig.json');
  return (await isFile(path))
    ? { step: 'compiler-config', outcome: 'passed', detail: 'tsconfig.json' }
    : { step: 'compiler-config', outcome: 'failed', detail: 'no tsconfig.json at the project root' };
}

async function testRunnerStep(projectRoot: string): Promise<StepResult> {
  const scripts = await packageScripts(join(projectRoot, 'package.json'));
  if (scripts === null) return { step: 'test-runner', outcome: 'failed', detail: 'package.json cannot be read' };
  const script = scripts['test'];
  if (typeof script !== 'string' || script === '') {
    return { step: 'test-runner', outcome: 'failed', detail: 'package.json declares no `test` script; the MVP reaches its one runner through the project\'s own scripts' };
  }
  const runner = join(projectRoot, 'node_modules', '.bin', 'vitest');
  if (!(await isFile(runner))) {
    return { step: 'test-runner', outcome: 'failed', detail: `\`test\` is \`${script}\`, and node_modules/.bin/vitest is not installed` };
  }
  return { step: 'test-runner', outcome: 'passed', detail: `\`test\` is \`${script}\`, with node_modules/.bin/vitest installed` };
}

/**
 * `ramify-agent.json` validated at `start-run`, and every `support` entry
 * matching at least one file, each inside a module's test area. A failure is
 * not a code-repair assignment: the project's configuration is the person's.
 */
async function projectConfigStep(projectRoot: string, captured: CapturedProjectConfig, index: ArchitectIndex | null): Promise<StepResult> {
  if ('invalid' in captured) return { step: 'project-config', outcome: 'failed', detail: captured.invalid };
  const support = captured.config.acceptance.support;
  const areas = await moduleTestAreas(projectRoot, index);
  const matches = await matchSupport(projectRoot, support, areas);
  const problems = matches.flatMap(match => [
    ...(match.inside.length === 0 && match.outside.length === 0 ? [`\`${match.entry}\` matches no file`] : []),
    ...(match.outside.length > 0 ? [`\`${match.entry}\` matches ${match.outside.slice(0, 3).join(', ')}${match.outside.length > 3 ? ', …' : ''} outside every module's test area`] : []),
  ]);
  if (problems.length > 0) {
    return {
      step: 'project-config',
      outcome: 'failed',
      detail: `${captured.path}: support code is testing source of the module whose test area holds it, its src/tests/ or a testing module's src/: ${problems.join('; ')}`,
    };
  }
  const files = matches.flatMap(match => match.inside);
  return {
    step: 'project-config',
    outcome: 'passed',
    detail: `${captured.path} validates against ramify-agent.project/1; ${support.length === 0 ? 'it names no support code' : `its support code is ${files.join(', ')}`}; full mode's readiness is ${captured.config.acceptance.modes.full.readiness}`,
  };
}

/**
 * The scenario harness the configuration names: `cucumber-js` installed, and
 * each mode's commands resolving. A missing runner is as unrecoverable here
 * as a missing `vitest` is for `test-runner`.
 */
async function acceptanceRunnerStep(projectRoot: string, captured: CapturedProjectConfig): Promise<StepResult> {
  if ('invalid' in captured) {
    return { step: 'acceptance-runner', outcome: 'not-verified', detail: 'not reached: the project\'s configuration names no acceptance modes' };
  }
  const runner = join(projectRoot, 'node_modules', '.bin', 'cucumber-js');
  const problems: string[] = [];
  if (!(await isFile(runner))) problems.push('node_modules/.bin/cucumber-js is not installed');
  for (const command of await unresolvedCommands(projectRoot, captured.config)) {
    problems.push(`${command.mode} mode's ${command.role} \`${command.argv.join(' ')}\` does not resolve: ${command.reason}`);
  }
  if (problems.length > 0) return { step: 'acceptance-runner', outcome: 'failed', detail: problems.join('; ') };
  const { quick, full } = captured.config.acceptance.modes;
  return {
    step: 'acceptance-runner',
    outcome: 'passed',
    detail: `node_modules/.bin/cucumber-js is installed; quick mode runs \`${quick.command.join(' ')}\`, full mode \`${full.command.join(' ')}\``,
  };
}

/**
 * The nested packages whose tests the gate runs: those the policy captured
 * with a `test` script. Only these must be installed; the gate runs nothing
 * in any other, so a missing `node_modules` there is noted and never fails.
 */
export function gatedNestedPackages(policy: RunPolicy): Set<string> {
  return new Set(policy.commands.nestedPackages.filter(entry => entry.tests !== null).map(entry => entry.directory));
}

/** The nested packages step: every package whose tests the gate runs is installed. */
export function nestedPackagesStep(
  nested: ReadonlyArray<{ directory: string; installed: boolean; testScript: string | null }>,
  policy: RunPolicy,
): StepResult {
  const gated = gatedNestedPackages(policy);
  const missing = nested.filter(entry => !entry.installed && gated.has(entry.directory));
  const ungated = nested.filter(entry => !entry.installed && !gated.has(entry.directory)).map(entry => entry.directory);
  const captured = new Set(policy.commands.nestedPackages.map(entry => entry.directory));
  const added = nested.filter(entry => !captured.has(entry.directory)).map(entry => entry.directory);
  const summary = nested.length === 0 ? 'no independent nested package' : `${nested.length} independent nested package${nested.length === 1 ? '' : 's'}: ${nested.map(entry => `${entry.directory} (${entry.testScript === null ? 'no test script' : `test: ${entry.testScript}`})`).join(', ')}`;
  const uninstalled = ungated.length === 0 ? '' : `; node_modules is missing in ${ungated.join(', ')}, whose tests the gate does not run, so ${ungated.length === 1 ? 'it need' : 'they need'} not be installed`;
  if (missing.length > 0) {
    return {
      step: 'nested-packages',
      outcome: 'failed',
      detail: `${summary}; node_modules is missing in ${missing.map(entry => entry.directory).join(', ')}, whose tests the gate runs${uninstalled}`,
    };
  }
  const note = added.length === 0 ? '' : `; ${added.join(', ')} appeared after the policy was captured and its tests are not in the gate`;
  return { step: 'nested-packages', outcome: 'passed', detail: `${summary}${uninstalled}${note}` };
}

/** The run branch created and checked out, or found where an earlier attempt of the run created it. */
export async function runBranchStep(projectRoot: string, runId: string, signal: AbortSignal | undefined, git: GitService): Promise<StepResult> {
  try {
    const { branch, created } = await git.createRunBranch(projectRoot, runId, signal);
    return { step: 'run-branch', outcome: 'passed', detail: `${branch} was ${created ? 'created and' : 'found and'} checked out` };
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    const said = error.detail.output.trim();
    return {
      step: 'run-branch',
      outcome: 'failed',
      detail: `the run branch ${runBranchName(runId)} could not be created: ${error.message}${said === '' ? '' : `: ${said}`}`,
    };
  }
}

async function testDiscoveryStep(projectRoot: string): Promise<StepResult> {
  const files = await discoverTestFiles(projectRoot);
  if (files.length === 0) {
    return { step: 'test-discovery', outcome: 'failed', detail: 'no test file was discovered under the project root' };
  }
  return { step: 'test-discovery', outcome: 'passed', detail: `${files.length} test file${files.length === 1 ? '' : 's'} discovered, such as ${files.slice(0, 3).join(', ')}` };
}

async function ramifyDaemonStep(request: ReadinessRequest): Promise<StepResult> {
  const run = await request.ramify.run(['--version'], request.projectRoot, request.signal);
  if (run.code !== 0) {
    const detail = `${run.stderr}\n${run.stdout}`.trim();
    return { step: 'ramify-daemon', outcome: 'failed', detail: `the Ramify command line did not answer: \`ramify --version\` exited with ${run.code}${detail === '' ? '' : `: ${detail.slice(-400)}`}` };
  }
  return { step: 'ramify-daemon', outcome: 'passed', detail: `the Ramify command line answers: ${run.stdout.trim()}` };
}

/**
 * Every test file beneath the project root, by the one supported runner's
 * default patterns, skipping `node_modules` and the harness's own state
 * directories. This establishes that the project discovers tests; resolving
 * a write scope into a file list belongs to the iteration that assigns one.
 */
export async function discoverTestFiles(projectRoot: string): Promise<string[]> {
  const found: string[] = [];
  await walk(projectRoot, 0);
  found.sort();
  return found;

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > testDiscoveryDepth) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.') ||
          (entry.name === 'tmp' && basename(directory) === 'src')) continue;
        if (await isStateDirectory(path)) continue;
        await walk(path, depth + 1);
      } else if (entry.isFile() && testFilePattern.test(entry.name)) {
        found.push(relative(projectRoot, path).split(sep).join('/'));
      }
    }
  }
}

// Recovery.

/** What a bounded preparation would do about a failure, or null when nothing would. */
export interface RecoveryPlan {
  readonly cause: InfrastructureRecovery['cause'];
  readonly action: InfrastructureRecovery['action'];
  /** The nested packages to install, for `reinstall-nested`. */
  readonly directories: readonly string[];
}

/**
 * Whether this failure is one a bounded preparation can repair. A failing
 * baseline test and a command that is not there are not: rerunning them
 * answers the same, and neither is a code-repair assignment either. Only a
 * recoverable failure consumes a recovery attempt.
 */
export function recoveryFor(attempt: ReadinessAttempt, gate: GateAttempt | null, policy: RunPolicy): RecoveryPlan | null {
  const failing = failingStep(attempt);
  if (failing === undefined) return null;
  if (failing.step === 'nested-packages') {
    // Only a package whose tests the gate runs fails the step, so only those
    // are installed again; any other is left as the project has it.
    const gated = gatedNestedPackages(policy);
    const missing = attempt.nested.filter(entry => !entry.installed && gated.has(entry.directory)).map(entry => entry.directory);
    return missing.length === 0 ? null : { cause: 'infrastructure', action: 'reinstall-nested', directories: missing };
  }
  if (failing.step === 'ramify-daemon') return { cause: 'daemon-unavailable', action: 'restart-daemon', directories: [] };
  if (!(gateSteps as readonly string[]).includes(failing.step) || gate === null) return null;

  const reasons = new Set(gate.commands.flatMap(command => (command.notVerified === undefined ? [] : [command.notVerified])));
  if (reasons.has('command-missing')) return null;
  // An install ramify-audit refused is refused again on every rerun: it is
  // the project's configuration to change, and no preparation repairs it.
  if (gate.commands.some(command => command.runnerError !== null && linkedModulesRefusals.has(command.runnerError.kind))) return null;
  if (reasons.has('timeout')) return { cause: 'timeout', action: 'rerun-command', directories: [] };
  if (reasons.has('runner-error') || reasons.has('interrupted')) return { cause: 'infrastructure', action: 'rerun-command', directories: [] };
  // A baseline the project itself fails is evidence about the project, and no
  // preparation repairs it.
  return null;
}

export interface RecoveryRequest {
  readonly id: RecoveryId;
  readonly attempt: number;
  readonly plan: RecoveryPlan;
  readonly projectRoot: string;
  readonly policy: RunPolicy;
  readonly ramify: RamifyCli;
  readonly git?: GitService | undefined;
  /** External command execution for recovery work; production uses the process-backed runner. */
  readonly commandExecution?: CommandRunner | undefined;
  /** The count of committed recoveries for this subject, this one included. */
  readonly count: number;
  /** Where the recovery's command output goes. */
  readonly directory: string;
  readonly signal?: AbortSignal | undefined;
}

/** Performs one bounded recovery and records what it did and what came of it. */
export async function performRecovery(request: RecoveryRequest): Promise<InfrastructureRecovery> {
  const evidence: string[] = [];
  let outcome: InfrastructureRecovery['outcome'] = 'failed';

  switch (request.plan.action) {
    case 'reinstall-nested': {
      const results: boolean[] = [];
      for (const directory of request.plan.directories) {
        const command = request.policy.commands.nestedPackages.find(entry => entry.directory === directory)?.install;
        if (command === undefined) {
          evidence.push(`${directory}: the policy captured no install command for it`);
          results.push(false);
          continue;
        }
        const outputFile = join(request.directory, `${request.id}-${directory.split('/').join('-')}.log`);
        const run = await (request.commandExecution ?? runCommand)({
          argv: command.argv, cwd: command.cwd, env: checkCommandEnvironment(command), timeoutMs: command.timeoutMs, outputFile,
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        });
        evidence.push(outputFile);
        results.push(run.outcome.kind === 'completed' && run.outcome.exitCode === 0 && await isDirectory(join(command.cwd, 'node_modules')));
      }
      outcome = results.length > 0 && results.every(Boolean) ? 'recovered' : 'failed';
      break;
    }
    case 'restart-daemon': {
      await request.ramify.stopDaemon().catch(() => undefined);
      const run = await request.ramify.run(['--version'], request.projectRoot, request.signal);
      evidence.push(`ramify --version exited with ${run.code}`);
      outcome = run.code === 0 ? 'recovered' : 'failed';
      break;
    }
    case 'rerun-command':
      evidence.push('the next readiness attempt runs the same commands again');
      outcome = 'recovered';
      break;
    case 'reconstruct-session':
    case 'none':
      outcome = 'failed';
      break;
  }

  return infrastructureRecoverySchema.parse({
    schema: 'ramify-agent.infrastructure-recovery/1',
    id: request.id,
    subject: { readiness: request.attempt },
    cause: request.plan.cause,
    action: request.plan.action,
    attempt: request.count,
    outcome,
    evidence,
  });
}

async function packageScripts(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as { scripts?: Record<string, unknown> };
    return parsed.scripts ?? {};
  } catch {
    return null;
  }
}

async function isStateDirectory(directory: string): Promise<boolean> {
  try {
    return /"files"\s*:\s*\[\s*\]/.test(await readFile(join(directory, 'tsconfig.json'), 'utf8'));
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
