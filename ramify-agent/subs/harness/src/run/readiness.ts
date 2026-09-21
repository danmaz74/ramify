import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { runGate } from '../checks/gate.js';
import { allProjectChecks, checkpointPolicies } from '../checks/checkpoint.js';
import { checkCommandEnvironment } from '../checks/records.js';
import type { GateAttempt } from '../checks/records.js';
import { isCleanRepository, GitError } from '../../subs/evidence/src/git.js';
import { runCommand } from '../../subs/evidence/src/run-command.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { discoverNestedPackages } from './policy.js';
import {
  readinessAttemptSchema, infrastructureRecoverySchema,
  type InfrastructureRecovery, type ReadinessAttempt, type ReadinessStep, type RecoveryId, type RunPolicy,
} from './records.js';

/*
 * Execution readiness. Before any work is assigned, the harness verifies the
 * project it will work in: that it is there, that it is a clean git
 * repository, that the compiler configuration, the test runner and the
 * independent nested packages are present and installed, that tests are
 * discovered, that Ramify answers, and that the project's own baseline
 * passes.
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
  /** The count of committed readiness attempts, this one included. */
  readonly attempt: number;
  readonly projectRoot: string;
  /** Where the attempt's output files go, beside the gate's record. */
  readonly gateDirectory: string;
  readonly gateId: string;
  readonly policy: RunPolicy;
  readonly ramify: RamifyCli;
  /** The commit readiness ran on. */
  readonly head: string;
  readonly signal?: AbortSignal | undefined;
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
export async function runReadiness(request: ReadinessRequest): Promise<ReadinessResult> {
  const { projectRoot, policy } = request;
  const steps: StepResult[] = [];

  steps.push(await projectRootStep(projectRoot));
  steps.push(await gitCleanStep(projectRoot, request.signal));
  steps.push(await compilerConfigStep(projectRoot));
  steps.push(await testRunnerStep(projectRoot));

  const nested = await discoverNestedPackages(projectRoot);
  steps.push(nestedPackagesStep(nested, policy));
  steps.push(await testDiscoveryStep(projectRoot));
  steps.push(await ramifyDaemonStep(request));

  const baselineSteps: ReadinessStep[] = ['baseline-tests', 'baseline-type-check', 'baseline-ramify-check'];
  const blocked = steps.find(step => step.outcome !== 'passed');
  if (blocked !== undefined) {
    for (const step of baselineSteps) {
      steps.push({ step, outcome: 'not-verified', detail: `not reached: ${blocked.step} did not pass` });
    }
    return { attempt: attemptRecord(request, steps, nested, null), gate: null };
  }

  const gate = await runGate('readiness', {
    id: request.gateId,
    projectRoot,
    directory: request.gateDirectory,
    head: request.head,
    checks: allProjectChecks(policy.commands, checkpointPolicies.readiness),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  });

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

  return { attempt: attemptRecord(request, steps, nested, gate), gate };
}

function describeCommand(label: string, record: GateAttempt['commands'][number]): string {
  const outcome = record.outcome === 'passed'
    ? `passed in ${record.elapsedMs} ms`
    : record.outcome === 'failed'
      ? `exited with ${record.exitCode}`
      : `not verified (${record.notVerified ?? 'unknown'})`;
  const tail = record.output.tail.trim();
  return `${label}: \`${record.command.argv.join(' ')}\` ${outcome}${tail === '' ? '' : `; ${tail.slice(-400)}`}`;
}

function attemptRecord(
  request: ReadinessRequest,
  steps: readonly StepResult[],
  nested: ReadonlyArray<{ directory: string; manifest: string; installed: boolean; testScript: string | null }>,
  gate: GateAttempt | null,
): ReadinessAttempt {
  const baseline = new Set<string>(['baseline-tests', 'baseline-type-check', 'baseline-ramify-check']);
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

async function gitCleanStep(projectRoot: string, signal: AbortSignal | undefined): Promise<StepResult> {
  try {
    const clean = await isCleanRepository(projectRoot, signal);
    return clean
      ? { step: 'git-clean', outcome: 'passed', detail: 'the working tree is clean' }
      : { step: 'git-clean', outcome: 'failed', detail: 'the working tree has uncommitted changes; a run starts from a clean repository so that every accepted boundary is its own commit' };
  } catch (error) {
    const detail = error instanceof GitError ? error.message : error instanceof Error ? error.message : String(error);
    return { step: 'git-clean', outcome: 'failed', detail: `the execution directory is not a git repository the harness can read: ${detail}` };
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

function nestedPackagesStep(
  nested: ReadonlyArray<{ directory: string; installed: boolean; testScript: string | null }>,
  policy: RunPolicy,
): StepResult {
  const missing = nested.filter(entry => !entry.installed);
  const captured = new Set(policy.commands.nestedPackages.map(entry => entry.directory));
  const added = nested.filter(entry => !captured.has(entry.directory)).map(entry => entry.directory);
  const summary = nested.length === 0 ? 'no independent nested package' : `${nested.length} independent nested package${nested.length === 1 ? '' : 's'}: ${nested.map(entry => `${entry.directory} (${entry.testScript === null ? 'no test script' : `test: ${entry.testScript}`})`).join(', ')}`;
  if (missing.length > 0) {
    return {
      step: 'nested-packages',
      outcome: 'failed',
      detail: `${summary}; node_modules is missing in ${missing.map(entry => entry.directory).join(', ')}`,
    };
  }
  const note = added.length === 0 ? '' : `; ${added.join(', ')} appeared after the policy was captured and its tests are not in the gate`;
  return { step: 'nested-packages', outcome: 'passed', detail: `${summary}${note}` };
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
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
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
export function recoveryFor(attempt: ReadinessAttempt, gate: GateAttempt | null): RecoveryPlan | null {
  const failing = failingStep(attempt);
  if (failing === undefined) return null;
  if (failing.step === 'nested-packages') {
    const missing = attempt.nested.filter(entry => !entry.installed).map(entry => entry.directory);
    return missing.length === 0 ? null : { cause: 'infrastructure', action: 'reinstall-nested', directories: missing };
  }
  if (failing.step === 'ramify-daemon') return { cause: 'daemon-unavailable', action: 'restart-daemon', directories: [] };
  if (!failing.step.startsWith('baseline-') || gate === null) return null;

  const reasons = new Set(gate.commands.flatMap(command => (command.notVerified === undefined ? [] : [command.notVerified])));
  if (reasons.has('command-missing')) return null;
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
        const run = await runCommand({
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
