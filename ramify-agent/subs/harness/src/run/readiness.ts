import { mkdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { GateCommandStarted } from '../checks/execution.js';
import { configuredFullRecovery, sameAuditPolicy, type CommittedAuditConfiguration, type ConfiguredAuditPort, type ConfiguredFullAuditResult } from '../../subs/audit/src/check-execution.js';
import { checkpointPolicies, installOperation, setupChecks } from '../checks/checkpoint.js';
import { configuredAuditRecord } from '../checks/gate.js';
import { checkCommand, checkCommandEnvironment } from '../checks/records.js';
import type { GateAttempt } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { gitService, GitError, runBranchName, type GitService } from '../../subs/evidence/src/git.js';
import { runCommand, type CommandRunner } from '../../subs/evidence/src/run-command.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { PausableDeadline } from './pausable-deadline.js';
import type { RunFailureReason } from '../interfaces/protocol/runs.js';
import { declaredModuleDirectories } from './project-config.js';
import { removeScratchDirectories, trackedScratchPaths } from '../work/scratch.js';
import {
  readinessAttemptSchema, infrastructureRecoverySchema,
  type CapturedProjectConfig, type InfrastructureRecovery, type ReadinessAttempt, type ReadinessStep, type RecoveryId, type RunPolicy,
} from './records.js';

/*
 * Execution readiness. Before any work is assigned, the harness verifies the
 * project it will work in: that it is there, that it is a clean git
 * repository, that the compiler and project configuration are available,
 * and that Ramify answers. It then prepares the
 * committed audit workspace declarations in the run working tree and asks
 * the installed provider for one configured full nested audit of HEAD: the
 * same request as the final gate, answered by an applicable earlier record
 * where the provider finds one. A nested project's failure, or discovery it
 * cannot decide, fails the baseline before the run branch exists.
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
  readonly auditConfiguration: import('./records.js').RunRecord['auditConfiguration'];
  /** The architect view that names the modules, or null where the run has none. */
  readonly index?: ArchitectIndex | null | undefined;
  readonly ramify: RamifyCli;
  readonly git?: GitService | undefined;
  /** The commit readiness ran on. */
  readonly head: string;
  readonly signal?: AbortSignal | undefined;
  /** Owned process boundary for local preparation; production uses the process-backed runner. */
  readonly commandExecution?: CommandRunner | undefined;
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

/** Runs one readiness attempt and answers what it established. */
export async function runReadiness(execution: ConfiguredAuditPort, request: ReadinessRequest): Promise<ReadinessResult> {
  const { projectRoot, policy } = request;
  const steps: StepResult[] = [];
  if (request.signal?.aborted) return cancelledReadiness(request, steps);

  steps.push(await projectRootStep(projectRoot));
  steps.push(await scratchCleanupStep(projectRoot, request.git ?? gitService, steps[0]!.outcome));
  steps.push(await gitCleanStep(projectRoot, request.signal, request.git ?? gitService));
  steps.push(await compilerConfigStep(projectRoot));
  steps.push(projectConfigStep(request.projectConfig));
  steps.push(await ramifyDaemonStep(request));
  if (request.signal?.aborted) return cancelledReadiness(request, steps);

  const captured = request.auditConfiguration;
  let current: Awaited<ReturnType<ConfiguredAuditPort['read']>> | null = null;
  let config: CommittedAuditConfiguration | null = null;
  if (captured === undefined || 'invalid' in captured) {
    steps.push({ step: 'audit-config', outcome: 'failed', detail: captured?.invalid ?? 'No committed audit configuration was captured' });
  } else {
    try {
      current = await execution.read(projectRoot, request.head, request.signal);
      const compatible = sameAuditPolicy(current, captured.config);
      if (compatible) config = current;
      steps.push(compatible
        ? { step: 'audit-config', outcome: 'passed', detail: `${current.path} blob ${current.blob} at ${request.head}; captured at ${captured.config.sourceCommit}` }
        : { step: 'audit-config', outcome: 'failed', detail: `Captured audit policy conflicts with ${current.path} at ${request.head}; reconcile the configuration and start a new run` });
    } catch (error) {
      steps.push(request.signal?.aborted
        ? { step: 'audit-config', outcome: 'not-verified', detail: 'committed audit configuration read was cancelled' }
        : { step: 'audit-config', outcome: 'failed', detail: `Committed audit configuration is unavailable: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  if (request.signal?.aborted) return cancelledReadiness(request, steps);
  const nested = config?.workspace.packageDirectories.map(directory => ({
    directory, manifest: directory === '' ? 'package.json' : `${directory}/package.json`, installed: false, testScript: null,
  })) ?? [];
  let unsafePackage: string | null = null;
  for (const entry of nested) {
    try {
      const directory = await containedDirectory(projectRoot, entry.directory);
      entry.installed = await isDirectory(join(directory, 'node_modules'));
    } catch (error) { unsafePackage ??= error instanceof Error ? error.message : String(error); }
  }
  steps.push(unsafePackage === null ? declaredPackagesStep(nested, config)
    : { step: 'declared-packages', outcome: 'failed', detail: `Unsafe declared package directory: ${unsafePackage}` });
  if (request.signal?.aborted) return cancelledReadiness(request, steps, nested);

  const blocked = steps.find(step => step.outcome !== 'passed');
  if (blocked !== undefined) {
    for (const step of ['declared-preparation', 'configured-full-audit', 'run-branch'] as const) {
      steps.push({ step, outcome: 'not-verified', detail: `not reached: ${blocked.step} did not pass` });
    }
    return { attempt: attemptRecord(request, steps, nested, null), gate: null };
  }
  const prepared = await declaredPreparationStep(request, config!);
  steps.push(prepared);
  if (request.signal?.aborted) return cancelledReadiness(request, steps, nested);
  if (prepared.outcome !== 'passed') {
    steps.push({ step: 'configured-full-audit', outcome: 'not-verified', detail: 'not reached: declared preparation did not pass' });
    steps.push({ step: 'run-branch', outcome: 'not-verified', detail: 'not reached: declared preparation did not pass' });
    return { attempt: attemptRecord(request, steps, nested, null), gate: null };
  }
  const bound = new PausableDeadline(policy.limits.runAbsoluteMs);
  let releaseWait: (() => void) | undefined;
  let audit: ConfiguredFullAuditResult;
  try {
    audit = await execution.run({ projectRoot, sourceCommit: request.head, configuration: config!,
      mode: checkpointPolicies.readiness.audit, nested: checkpointPolicies.readiness.nested,
      runId: request.runId, attemptId: request.gateId,
      signal: request.signal === undefined ? bound.signal : AbortSignal.any([request.signal, bound.signal]),
      started: request.started,
      waiting: async (command, line) => { releaseWait ??= bound.pause(); await request.waiting?.(command, line); },
      lockAcquired: () => { releaseWait?.(); releaseWait = undefined; },
    });
  } catch (error) {
    audit = { status: 'failed', requestId: `${request.runId}:${request.gateId}`, mode: 'full', nested: checkpointPolicies.readiness.nested, projects: null, discovery: null,
      requestedSourceCommit: request.head, auditedSourceCommit: null, reused: false, reuse: null,
      requestedMode: null, executedMode: null, fallbackReason: null,
      verdict: null, reportCommit: null, runRef: null, treeRef: null, definition: { path: config!.path, blob: config!.blob },
      detail: error instanceof Error ? error.message : String(error), provider: { error: String(error) }, checks: {} };
  } finally { releaseWait?.(); bound.dispose(); }
  const gate = configuredGate(request, audit);
  steps.push({ step: 'configured-full-audit', outcome: gate.verdict,
    detail: `${audit.detail}; requested ${audit.requestedSourceCommit}, audited ${audit.auditedSourceCommit ?? 'none'}` });
  if (request.signal?.aborted) return cancelledReadiness(request, steps, nested, gate, audit);

  // The run branch is created last, once the repository is clean and the
  // baseline passed, so a readiness that fails leaves the project on its own
  // branch. A branch git refuses fails readiness here, with git's message,
  // before any work: the first commit would otherwise fail far from the cause.
  const failed = steps.find(step => step.outcome !== 'passed');
  steps.push(failed === undefined
    ? await runBranchStep(projectRoot, request.runId, request.signal, request.git ?? gitService)
    : { step: 'run-branch', outcome: 'not-verified', detail: `not reached: ${failed.step} did not pass` });

  return { attempt: attemptRecord(request, steps, nested, gate, audit), gate };
}

/** Retain the interrupted step and name every later readiness step as unverified. */
function cancelledReadiness(request: ReadinessRequest, steps: StepResult[], nested: ReadinessAttempt['nested'] = [],
  gate: GateAttempt | null = null, audit?: ConfiguredFullAuditResult): ReadinessResult {
  const order: ReadinessStep[] = ['project-root', 'scratch-cleanup', 'git-clean', 'compiler-config', 'project-config',
    'ramify-daemon', 'audit-config', 'declared-packages', 'declared-preparation', 'configured-full-audit', 'run-branch'];
  for (const step of order) {
    if (!steps.some(entry => entry.step === step)) steps.push({ step, outcome: 'not-verified', detail: 'not reached: readiness was cancelled' });
  }
  return { attempt: attemptRecord(request, steps, nested, gate, audit), gate };
}

function declaredPackagesStep(
  packages: ReadinessAttempt['nested'],
  configuration: CommittedAuditConfiguration | null,
): StepResult {
  if (configuration === null) return { step: 'declared-packages', outcome: 'not-verified', detail: 'committed audit configuration unavailable' };
  const required = configuration.workspace.packageDirectoriesDeclared && configuration.workspace.linkNodeModules;
  const missing = required ? packages.filter(entry => !entry.installed).map(entry => entry.directory) : [];
  return missing.length > 0
    ? { step: 'declared-packages', outcome: 'failed', detail: `Declared package installation missing: ${missing.map(directory => directory || '.').join(', ')}` }
    : { step: 'declared-packages', outcome: 'passed', detail: `${packages.length} declared package directories; ${required ? 'all installed' : 'optional root dependency link'}` };
}

/** Run the committed preparation in the engineer's working tree, even when the audit reuses evidence. */
async function declaredPreparationStep(
  request: ReadinessRequest,
  configuration: CommittedAuditConfiguration,
): Promise<StepResult> {
  if (request.signal?.aborted) return { step: 'declared-preparation', outcome: 'not-verified', detail: 'declared preparation was cancelled' };
  const commands = configuration.workspace.setupCommands;
  for (const command of commands) {
    try { await containedDirectory(request.projectRoot, command.cwd); }
    catch (error) { return { step: 'declared-preparation', outcome: 'failed',
      detail: `Unsafe declared setup cwd ${command.cwd}: ${error instanceof Error ? error.message : String(error)}` }; }
  }
  const agentSetup = 'config' in request.projectConfig ? request.projectConfig.config.setup ?? [] : [];
  const auditSetup = commands.map(command => ({ name: command.name, command: [...command.argv], cwd: command.cwd, timeoutMs: command.timeoutMs, env: command.env }));
  const normalized = (value: { command: readonly string[]; cwd?: string | undefined; timeoutMs?: number | undefined; env?: Readonly<Record<string, string>> | undefined }) => JSON.stringify({ command: value.command, cwd: value.cwd ?? '.', timeoutMs: value.timeoutMs ?? 600_000, env: value.env ?? {} });
  if (agentSetup.length > 0 && JSON.stringify(agentSetup.map(normalized)) !== JSON.stringify(auditSetup.map(normalized))) {
    return { step: 'declared-preparation', outcome: 'failed', detail: 'ramify-agent.json setup conflicts with committed ramify-audit.json workspace setupCommands; reconcile them and start a new run' };
  }
  const setup = setupChecks(auditSetup, request.projectRoot);
  const linked: string[] = [];
  if (configuration.workspace.linkNodeModules) {
    for (const directory of configuration.workspace.packageDirectories) {
      if (await isDirectory(join(request.projectRoot, directory, 'node_modules'))) linked.push(directory);
    }
  }
  const refused = linkedInstalls(setup, request.projectRoot, linked);
  if (refused !== null) return { step: 'declared-preparation', outcome: 'failed', detail: refused };
  await mkdir(request.gateDirectory, { recursive: true });
  for (const [index, check] of setup.entries()) {
    if (request.signal?.aborted) return { step: 'declared-preparation', outcome: 'not-verified', detail: 'declared preparation was cancelled' };
    const outputFile = join(request.gateDirectory, `${String(index + 1).padStart(2, '0')}-preparation.log`);
    await request.started?.({ kind: 'setup', ...(check.name === undefined ? {} : { name: check.name }), position: index + 1, total: setup.length });
    const run = await (request.commandExecution ?? runCommand)({ argv: check.command.argv, cwd: check.command.cwd,
      env: checkCommandEnvironment(check.command), timeoutMs: check.command.timeoutMs, outputFile,
      ...(request.signal === undefined ? {} : { signal: request.signal }) });
    if (run.outcome.kind !== 'completed' || run.outcome.exitCode !== 0) {
      const ending = run.outcome.kind === 'completed' ? `exited ${run.outcome.exitCode}` : run.outcome.kind;
      return { step: 'declared-preparation', outcome: run.outcome.kind === 'completed' ? 'failed' : 'not-verified',
        detail: `${check.name ?? check.command.argv.join(' ')} ${ending}; ${run.output.tail}` };
    }
  }
  return { step: 'declared-preparation', outcome: 'passed', detail: `${setup.length} committed setup command${setup.length === 1 ? '' : 's'} passed in the run working tree` };
}

/**
 * The baseline's gate. The verdict is the invocation's: a failure anywhere
 * fails it, and an indeterminate answer (undecided discovery, a project not
 * run) or an unanswered request leaves it not verified.
 */
function configuredGate(request: ReadinessRequest, audit: ConfiguredFullAuditResult): GateAttempt {
  const verdict = audit.status !== 'completed' || audit.verdict === null || audit.verdict === 'indeterminate' ? 'not-verified'
    : audit.verdict === 'pass' ? 'passed' : 'failed';
  return {
    schema: 'ramify-agent.gate-attempt/3', id: request.gateId, checkpoint: 'readiness',
    subject: {}, proposedBy: null, repairRound: 0, infrastructureAttempt: 0,
    head: request.head, commit: null, audited: audit.status === 'completed' ? audit.requestedSourceCommit : null,
    evidence: audit.status === 'completed' && audit.reportCommit !== null && audit.runRef !== null && audit.treeRef !== null
      ? { reportCommit: audit.reportCommit, runRef: audit.runRef, treeRef: audit.treeRef } : null,
    provider: { result: audit.provider, checks: audit.checks },
    audit: configuredAuditRecord(audit),
    guardedChanges: [], commands: [], verdict,
    cause: verdict === 'passed' ? null : verdict === 'failed' ? 'check-failed' : 'infrastructure',
    next: verdict === 'passed' ? 'accept' : 'exhausted',
  };
}

/** The working-tree execution boundary validates both spelling and symlink containment. */
async function containedDirectory(projectRoot: string, directory: string): Promise<string> {
  const normalized = directory.replaceAll('\\', '/');
  if (isAbsolute(directory) || /^[A-Za-z]:/u.test(directory) || normalized.split('/').includes('..')) {
    throw new Error(`${directory} escapes the project root`);
  }
  const root = await realpath(projectRoot);
  const candidate = await realpath(resolve(root, directory));
  const suffix = relative(root, candidate);
  if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`)) throw new Error(`${directory} resolves outside ${root}`);
  if (!(await isDirectory(candidate))) throw new Error(`${directory} is not a directory`);
  return candidate;
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

function attemptRecord(
  request: ReadinessRequest,
  steps: readonly StepResult[],
  nested: ReadonlyArray<{ directory: string; manifest: string; installed: boolean; testScript: string | null }>,
  gate: GateAttempt | null,
  audit?: ConfiguredFullAuditResult,
): ReadinessAttempt {
  return readinessAttemptSchema.parse({
    schema: 'ramify-agent.readiness-attempt/1',
    attempt: request.attempt,
    head: request.head,
    steps: steps.map(step => ({
      step: step.step,
      outcome: step.outcome,
      detail: step.detail,
      ...(gate !== null && step.step === 'configured-full-audit' ? { gate: gate.id } : {}),
    })),
    nested: nested.map(entry => ({ ...entry })),
    ...(audit === undefined ? {} : { audit: {
      requestedSourceCommit: audit.requestedSourceCommit, auditedSourceCommit: audit.auditedSourceCommit,
      reused: audit.reused, reportCommit: audit.reportCommit, runRef: audit.runRef,
    } }),
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
 * project's configuration names its own; every other step is
 * `readiness-failed`.
 */
export function readinessFailureReason(step: string | undefined): RunFailureReason {
  if (step === 'project-config') return 'project-config-invalid';
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
    if (signal?.aborted) return { step: 'git-clean', outcome: 'not-verified', detail: 'Git clean check was cancelled' };
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

/**
 * `ramify-agent.json` validated at `start-run`. A failure is not a
 * code-repair assignment: the project's configuration is the person's. The
 * project's tests and scenarios are checks of its committed audit
 * definition, which `audit-config` reads.
 */
function projectConfigStep(captured: CapturedProjectConfig): StepResult {
  if ('invalid' in captured) return { step: 'project-config', outcome: 'failed', detail: captured.invalid };
  return { step: 'project-config', outcome: 'passed', detail: `${captured.path} validates against ramify-agent.project/1` };
}

/** The run branch created and checked out, or found where an earlier attempt of the run created it. */
export async function runBranchStep(projectRoot: string, runId: string, signal: AbortSignal | undefined, git: GitService): Promise<StepResult> {
  if (signal?.aborted) return { step: 'run-branch', outcome: 'not-verified', detail: 'readiness was cancelled before branch creation' };
  try {
    const { branch, created } = await git.createRunBranch(projectRoot, runId, signal);
    return { step: 'run-branch', outcome: 'passed', detail: `${branch} was ${created ? 'created and' : 'found and'} checked out` };
  } catch (error) {
    if (signal?.aborted) return { step: 'run-branch', outcome: 'not-verified', detail: 'readiness was cancelled before branch creation' };
    if (!(error instanceof GitError)) throw error;
    const said = error.detail.output.trim();
    return {
      step: 'run-branch',
      outcome: 'failed',
      detail: `the run branch ${runBranchName(runId)} could not be created: ${error.message}${said === '' ? '' : `: ${said}`}`,
    };
  }
}

async function ramifyDaemonStep(request: ReadinessRequest): Promise<StepResult> {
  let run: Awaited<ReturnType<RamifyCli['run']>>;
  try { run = await request.ramify.run(['--version'], request.projectRoot, request.signal); }
  catch (error) {
    if (request.signal?.aborted) return { step: 'ramify-daemon', outcome: 'not-verified', detail: 'Ramify preflight was cancelled' };
    throw error;
  }
  if (run.code !== 0) {
    const detail = `${run.stderr}\n${run.stdout}`.trim();
    return { step: 'ramify-daemon', outcome: 'failed', detail: `the Ramify command line did not answer: \`ramify --version\` exited with ${run.code}${detail === '' ? '' : `: ${detail.slice(-400)}`}` };
  }
  return { step: 'ramify-daemon', outcome: 'passed', detail: `the Ramify command line answers: ${run.stdout.trim()}` };
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
export function recoveryFor(attempt: ReadinessAttempt, gate: GateAttempt | null, _policy: RunPolicy): RecoveryPlan | null {
  const failing = failingStep(attempt);
  if (failing === undefined) return null;
  if (failing.step === 'declared-packages') {
    if (failing.detail.startsWith('Unsafe declared')) return null;
    const missing = attempt.nested.filter(entry => !entry.installed).map(entry => entry.directory);
    return missing.length === 0 ? null : { cause: 'infrastructure', action: 'reinstall-nested', directories: missing };
  }
  if (failing.step === 'ramify-daemon') return { cause: 'daemon-unavailable', action: 'restart-daemon', directories: [] };
  if (failing.step === 'declared-preparation' && failing.outcome === 'not-verified') {
    if (failing.detail.includes('timed-out')) return { cause: 'timeout', action: 'rerun-command', directories: [] };
    if (failing.detail.includes('runner-error')) return { cause: 'infrastructure', action: 'rerun-command', directories: [] };
  }
  if (failing.step === 'configured-full-audit' && gate !== null) {
    const kind = configuredFullRecovery(gate.provider?.result);
    if (kind !== null) return { cause: kind, action: 'rerun-command', directories: [] };
  }
  return null;
}

export interface RecoveryRequest {
  readonly id: RecoveryId;
  readonly attempt: number;
  readonly plan: RecoveryPlan;
  readonly projectRoot: string;
  readonly policy: RunPolicy;
  readonly auditConfiguration?: import('./records.js').RunRecord['auditConfiguration'];
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

  if (request.signal?.aborted) {
    evidence.push('readiness recovery was cancelled before it started');
    return infrastructureRecoverySchema.parse({ schema: 'ramify-agent.infrastructure-recovery/1', id: request.id,
      subject: { readiness: request.attempt }, cause: request.plan.cause, action: request.plan.action,
      attempt: request.count, outcome, evidence });
  }

  switch (request.plan.action) {
    case 'reinstall-nested': {
      const results: boolean[] = [];
      for (const directory of request.plan.directories) {
        if (request.signal?.aborted) { evidence.push('readiness recovery was cancelled'); results.push(false); break; }
        try { await containedDirectory(request.projectRoot, directory); }
        catch (error) { evidence.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`); results.push(false); continue; }
        const command = request.auditConfiguration !== undefined && 'config' in request.auditConfiguration
            && request.auditConfiguration.config.workspace.packageDirectories.includes(directory)
            ? checkCommand({ argv: ['npm', 'ci'], cwd: join(request.projectRoot, directory), timeoutMs: 900_000 }) : undefined;
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
