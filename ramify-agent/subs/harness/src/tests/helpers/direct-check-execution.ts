import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Checkpoint, GateEvidence } from '../../checks/records.js';
import { checkOutputPath, commandStart, inPlaceCheckExecution, notRun, type CheckExecutionContext, type CheckExecutionPort } from '../../checks/execution.js';
import type { PlannedCheck } from '../../checks/verify.js';
import { childEnvironment, outputTailBytes, runCommand, type CommandOutcome, type CommandRun } from '../../../subs/evidence/src/run-command.js';
import { captureProjectConfig } from '../../run/project-config.js';
import type {
  CommittedAuditConfiguration, ConfiguredAuditInput, ConfiguredAuditMode, ConfiguredAuditPort, ConfiguredAuditResult,
} from '../../../subs/audit/src/check-execution.js';
import { sameAuditPolicy } from '../../../subs/audit/src/check-execution.js';

/*
 * Deterministic stand-ins for the two ways a gate's checks run.
 *
 * A committing gate asks the project's committed audit, so a run test gives
 * the run service a scripted `ConfiguredAuditPort`: each request answers the
 * fake configured checks `tests`, `type-check` and `ramify-check` (and the
 * project's declared setup commands first, and in a mapped script a
 * `scenarios` check last) from the test's script, and composes a provider-
 * shaped result. A standalone diagnosis runs in place, so a gate-policy test
 * gives `runGate` a scripted `CheckExecutionPort`. Neither spawns a provider,
 * creates a worktree or publishes a Git ref; their evidence values are
 * synthetic test records only.
 */

/** One scenario a scripted `scenarios` check reports, as Cucumber's parsed run gives it. */
export interface ScriptedScenario {
  readonly id: string;
  readonly status?: 'passed' | 'failed' | 'undefined' | 'pending' | 'ambiguous' | 'skipped' | undefined;
  readonly file?: string | undefined;
  readonly line?: number | undefined;
  readonly failure?: { readonly step: string; readonly message: string } | undefined;
  readonly undefinedSteps?: readonly string[] | undefined;
  /** Each step's text and the definition that bound it. */
  readonly binding?: ReadonlyArray<{ readonly step: string; readonly uri: string; readonly line: number }> | undefined;
}

/** One deterministic command result returned by a scripted executor or audit. */
export interface DirectCheckStep {
  readonly outcome?: CommandOutcome | undefined;
  readonly stdout?: string | undefined;
  readonly stderr?: string | undefined;
  readonly elapsedMs?: number | undefined;
  readonly truncated?: boolean | undefined;
  /** For a scripted audit's `scenarios` check: the tracked scenarios its run reported. */
  readonly scenarios?: readonly ScriptedScenario[] | undefined;
}

/** A scripted check as a script sees it: its kind, and a setup command's declared name. */
export interface ScriptedCheck {
  readonly kind: 'setup' | 'tests' | 'type-check' | 'ramify-check' | 'scenarios';
  readonly name?: string | undefined;
}

/** The request a scripted answer belongs to. */
export interface ScriptedCheckContext {
  readonly runId?: string | undefined;
  readonly attemptId: string;
  readonly checkpoint: Checkpoint;
  readonly projectRoot: string;
  readonly sourceCommit: string;
  /** The mode a configured audit was asked for; absent for an in-place diagnosis. */
  readonly mode?: ConfiguredAuditMode | undefined;
}

/** Facts available when a scripted result is selected. */
export interface DirectCheckInvocation {
  readonly check: ScriptedCheck;
  readonly checkIndex: number;
  /** Number of scripted commands already selected by this executor. */
  readonly invocationIndex: number;
  readonly context: ScriptedCheckContext;
  readonly signal: AbortSignal;
}

export type DirectCheckScript =
  (invocation: DirectCheckInvocation) => DirectCheckStep | Promise<DirectCheckStep>;

export interface DirectCheckExecutionOptions {
  /** One result per command, consumed across every gate call in the scenario. */
  readonly script: readonly DirectCheckStep[];
  /** Evidence to attach. Omit to use deterministic, visibly test-only evidence. */
  readonly evidence?: ((context: CheckExecutionContext) => GateEvidence) | undefined;
}

export interface MappedCheckExecutionOptions {
  /** An explicit answer for each command the scenario asks the executor to run. */
  readonly script: DirectCheckScript;
  /** Evidence to attach. Omit to use deterministic, visibly test-only evidence. */
  readonly evidence?: ((context: CheckExecutionContext) => GateEvidence) | undefined;
}

export interface ScriptedCheckExecution extends CheckExecutionPort {
  /** Verifies that the scenario consumed every declared command result. */
  assertComplete(): void;
}

// In-place diagnosis executors, for `runGate` and `runCheckpoint`.

/**
 * A direct in-place execution port for gate-policy tests.
 *
 * It writes the same output files as the real executor and delegates every
 * semantic decision to the gate's `classify` callback.
 */
export function createDirectCheckExecution(options: DirectCheckExecutionOptions): ScriptedCheckExecution {
  const execution = directCheckExecution(invocation => scriptedStep(options.script, invocation), options.evidence);
  return {
    run: execution.port.run,
    assertComplete() {
      if (execution.consumed() !== options.script.length) {
        throw new Error(`Direct check script declared ${options.script.length} results but consumed ${execution.consumed()}`);
      }
    },
  };
}

/** A reusable in-place executor whose callback explicitly answers every command. */
export function createMappedCheckExecution(options: MappedCheckExecutionOptions): CheckExecutionPort {
  return directCheckExecution(options.script, options.evidence).port;
}

/** The deliberately generic passing in-place executor. */
export function createPassingCheckExecution(): CheckExecutionPort {
  return createMappedCheckExecution({ script: () => ({}) });
}

/** Runs real local commands in place, for tests of command output or process behavior. */
export function createLocalCommandCheckExecution(): CheckExecutionPort {
  return {
    async run(checks, request) {
      const result = await inPlaceCheckExecution.run(checks, request);
      const cancelled = result.commands.some(command => command.notVerified === 'interrupted');
      return {
        commands: result.commands,
        audited: cancelled ? null : request.context.sourceCommit,
        evidence: cancelled ? null : testEvidence(request.context),
        ...(result.provider === undefined ? {} : { provider: result.provider }),
      };
    },
  };
}

function scriptedStep(script: readonly DirectCheckStep[], invocation: DirectCheckInvocation): DirectCheckStep {
  const step = script[invocation.invocationIndex];
  if (step === undefined) {
    throw new Error(`No direct check result scripted for invocation ${invocation.invocationIndex} (${invocation.context.checkpoint} ${invocation.check.kind})`);
  }
  return step;
}

function directCheckExecution(
  select: DirectCheckScript,
  evidence: ((context: CheckExecutionContext) => GateEvidence) | undefined,
): { readonly port: CheckExecutionPort; readonly consumed: () => number } {
  let invocationIndex = 0;
  const port: CheckExecutionPort = {
    async run(checks, request) {
      const commands = [];
      let interrupted = false;
      let cancelled = false;
      let setupFailed = false;
      for (const [checkIndex, check] of checks.entries()) {
        const outputFile = checkOutputPath(request.directory, checkIndex, check);
        if (setupFailed && !interrupted && !request.signal.aborted) {
          await writeFile(outputFile, '');
          commands.push(notRun(check, outputFile, new Date(Date.UTC(2000, 0, 1)).toISOString(), 'setup-failed'));
          continue;
        }
        if (interrupted || request.signal.aborted) {
          const run = await commandRun(outputFile, { outcome: { kind: 'cancelled' } }, invocationIndex);
          commands.push(request.classify(check, run, outputFile));
          interrupted = true;
          cancelled = true;
          continue;
        }
        const invocation: DirectCheckInvocation = {
          check: scriptedCheckOf(check),
          checkIndex,
          invocationIndex,
          context: request.context,
          signal: request.signal,
        };
        const scripted = await select(invocation);
        invocationIndex += 1;
        const step = request.signal.aborted ? { outcome: { kind: 'cancelled' } as const } : scripted;
        const run = await commandRun(outputFile, step, invocation.invocationIndex);
        const record = request.classify(check, run, outputFile);
        commands.push(record);
        if (record.notVerified === 'interrupted') {
          interrupted = true;
          cancelled = true;
        } else if (check.kind === 'setup' && record.outcome !== 'passed') {
          setupFailed = true;
        }
      }
      const published = !cancelled && !setupFailed;
      return {
        commands,
        audited: published ? request.context.sourceCommit : null,
        evidence: published ? (evidence ?? testEvidence)(request.context) : null,
      };
    },
  };
  return { port, consumed: () => invocationIndex };
}

function scriptedCheckOf(check: PlannedCheck): ScriptedCheck {
  if (check.kind === 'configured') throw new Error('An in-place diagnosis runs no configured check');
  return { kind: check.kind, ...(check.name === undefined ? {} : { name: check.name }) };
}

async function commandRun(outputFile: string, step: DirectCheckStep, invocationIndex: number): Promise<CommandRun> {
  const stdout = step.stdout ?? '';
  const stderr = step.stderr ?? '';
  const complete = `${stdout}${stderr}`;
  const bytes = Buffer.byteLength(complete, 'utf8');
  await writeFile(outputFile, complete);
  return {
    outcome: step.outcome ?? { kind: 'completed', exitCode: 0 },
    startedAt: new Date(Date.UTC(2000, 0, 1, 0, 0, invocationIndex)).toISOString(),
    elapsedMs: step.elapsedMs ?? 0,
    output: {
      path: outputFile,
      bytes,
      truncated: step.truncated ?? false,
      tail: Buffer.from(complete, 'utf8').subarray(Math.max(0, bytes - outputTailBytes)).toString('utf8'),
    },
    stdout,
    stderr,
  };
}

function testEvidence(context: { readonly sourceCommit: string; readonly attemptId: string }): GateEvidence {
  const identity = `${context.sourceCommit}-${context.attemptId}`;
  return {
    runRef: `refs/test-only/audited-runs/${identity}`,
    reportCommit: `test-only-report-${identity}`,
    treeRef: `refs/test-only/audited-trees/${context.sourceCommit}`,
  };
}

// Scripted configured audits, for the run service.

/** The fake configured checks every scripted request answers, in order. */
export const scriptedAuditChecks = ['tests', 'type-check', 'ramify-check'] as const;

export interface ScriptedAuditOptions {
  /** The answer for each fake check of each request. Omitted, every check passes. */
  readonly script?: DirectCheckScript | undefined;
  /** A sequential script consumed across requests; readiness consumes none. */
  readonly steps?: readonly DirectCheckStep[] | undefined;
  /** Whether the request also answers a `scenarios` check, last. A mapped script does by default. */
  readonly scenarios?: boolean | undefined;
  /** Announce each check as it starts, as the provider's progress does. */
  readonly announce?: boolean | undefined;
  /** Answer each configured check by running real commands in place; see {@link localCommandAudit}. */
  readonly local?: LocalAuditCommands | undefined;
}

/** A scripted configured audit and what it was asked. */
export interface ScriptedAudit extends ConfiguredAuditPort {
  readonly requests: ConfiguredAuditInput[];
  /** Verifies that a sequential script was consumed completely. */
  assertComplete(): void;
}

/**
 * The committed definition a scripted audit reads: the three fake checks,
 * and the setup the project's `ramify-agent.json` declares, as readiness
 * requires them to be equal.
 */
export async function scriptedAuditConfiguration(projectRoot: string, sourceCommit: string): Promise<CommittedAuditConfiguration> {
  const agent = await captureProjectConfig(projectRoot);
  const setup = 'config' in agent ? agent.config.setup ?? [] : [];
  return {
    sourceCommit, path: 'ramify-audit.json', blob: 'scripted-lifecycle-configuration', projectRoot: '.',
    checks: scriptedAuditChecks.map(id => ({ id })), ignorePaths: [], undetectedConfigFilesForcingFullAudit: [],
    workspace: { preparationId: 'nodejs', packageDirectoriesDeclared: false,
      linkNodeModules: true, packageDirectories: [''],
      setupCommands: setup.map(command => ({ ...(command.name === undefined ? {} : { name: command.name }),
        argv: [...command.command], cwd: command.cwd ?? '.', env: command.env ?? {}, timeoutMs: command.timeoutMs ?? 600_000 })) },
  };
}

/**
 * A scripted configured audit. Each request of a committing gate answers
 * the project's setup commands, then each fake check, from the script; the
 * composed verdict fails when one exits non-zero. A timeout or a spawn error
 * fails the request as the provider's own error would, a cancellation
 * cancels it, and a setup command that exits non-zero fails preparation.
 * Readiness, whose request has no gate operation record, passes without
 * consuming the script, as it did before gates asked the audit.
 */
export function scriptedAudit(options: ScriptedAuditOptions = {}): ScriptedAudit {
  const requests: ConfiguredAuditInput[] = [];
  let consumed = 0;
  const steps = options.steps;
  const passing: DirectCheckScript = () => ({});
  const sequential: DirectCheckScript = invocation => scriptedStep(steps ?? [], invocation);
  const select: DirectCheckScript = options.script ?? (steps === undefined ? passing : sequential);
  const scenarios = options.scenarios ?? (options.script !== undefined && options.steps === undefined);
  return {
    requests,
    async read(projectRoot, sourceCommit) {
      return scriptedAuditConfiguration(projectRoot, sourceCommit);
    },
    async run(input) {
      requests.push(input);
      const current = await scriptedAuditConfiguration(input.projectRoot, input.sourceCommit);
      if (!sameAuditPolicy(current, input.configuration)) throw new Error('Scripted configuration mismatch');
      const checkpoint = await checkpointOf(input);
      const context: ScriptedCheckContext = {
        runId: input.runId, attemptId: input.attemptId, checkpoint, projectRoot: input.projectRoot,
        sourceCommit: input.sourceCommit, mode: input.mode,
      };
      const signal = input.signal ?? new AbortController().signal;
      if (checkpoint === 'readiness' && options.local === undefined) return composed(input, current, []);
      const checks: ScriptedCheck[] = [
        ...current.workspace.setupCommands.map(command => ({ kind: 'setup' as const, ...(command.name === undefined ? {} : { name: command.name }) })),
        ...scriptedAuditChecks.map(kind => ({ kind })),
        ...(scenarios ? [{ kind: 'scenarios' as const }] : []),
      ];
      const answered: Array<{ check: ScriptedCheck; step: DirectCheckStep }> = [];
      for (const [checkIndex, check] of checks.entries()) {
        if (signal.aborted) return cancelled(input, current);
        if (options.announce === true && check.kind !== 'setup') {
          await input.started?.({ kind: 'configured', name: check.kind, position: checkIndex + 1, total: checks.length });
        }
        const step = options.local !== undefined
          ? await localStep(options.local, check, input, signal)
          : await select({ check, checkIndex, invocationIndex: consumed, context, signal });
        consumed += 1;
        answered.push({ check, step });
        const outcome = step.outcome ?? { kind: 'completed', exitCode: 0 };
        if (outcome.kind === 'cancelled' || signal.aborted) return cancelled(input, current);
        if (outcome.kind === 'timed-out') return failed(input, current, 'timeout', `${check.kind} timed out`, true);
        if (check.kind === 'setup' && (outcome.kind !== 'completed' || outcome.exitCode !== 0)) {
          return failed(input, current, 'setup-command-failed', `Setup command ${check.name ?? ''} exited with code ${outcome.kind === 'completed' ? outcome.exitCode : 'none'}. Output tail:\n${step.stdout ?? ''}${step.stderr ?? ''}`, false);
        }
      }
      return composed(input, current, answered.filter(entry => entry.check.kind !== 'setup'));
    },
    assertComplete() {
      if (options.steps !== undefined && consumed !== options.steps.length) {
        throw new Error(`Scripted audit declared ${options.steps.length} results but consumed ${consumed}`);
      }
    },
  };
}

/** The passing scripted audit: every request of every gate passes. */
export function passingAudit(): ScriptedAudit {
  return scriptedAudit();
}

/** A scripted audit whose callback answers each fake check of each request. */
export function mappedAudit(script: DirectCheckScript, options: Omit<ScriptedAuditOptions, 'script' | 'steps'> = {}): ScriptedAudit {
  return scriptedAudit({ ...options, script });
}

/** A scripted audit consuming one step per fake check, across requests. */
export function sequentialAudit(steps: readonly DirectCheckStep[]): ScriptedAudit {
  return scriptedAudit({ steps });
}

/** The same audit, announcing each configured check as it starts. */
export function announcingAudit(options: Omit<ScriptedAuditOptions, 'announce'> = {}): ScriptedAudit {
  return scriptedAudit({ ...options, announce: true });
}

/** The real commands a local audit runs in place for each fake check, by kind. */
export interface LocalAuditCommands {
  readonly tests?: readonly string[] | undefined;
  readonly 'type-check'?: readonly string[] | undefined;
  readonly 'ramify-check'?: readonly string[] | undefined;
}

/**
 * A configured audit that runs real commands in the project's working tree
 * for its fake checks: the project's own Vitest for `tests` by default.
 * Use it only where what the project's tests really do is under test; its
 * evidence is synthetic.
 */
export function localCommandAudit(commands: LocalAuditCommands = {}): ScriptedAudit {
  return scriptedAudit({ local: commands });
}

async function localStep(commands: LocalAuditCommands, check: ScriptedCheck, input: ConfiguredAuditInput, signal: AbortSignal): Promise<DirectCheckStep> {
  const argv = check.kind === 'tests' ? commands.tests ?? [join(input.projectRoot, 'node_modules', '.bin', 'vitest'), 'run']
    : check.kind === 'type-check' || check.kind === 'ramify-check' ? commands[check.kind] : undefined;
  if (argv === undefined || argv.length === 0) return {};
  const run = await runCommand({ argv: [...argv], cwd: input.projectRoot, env: childEnvironment({}), timeoutMs: 300_000, signal });
  return { outcome: run.outcome, stdout: run.stdout, stderr: run.stderr, elapsedMs: run.elapsedMs };
}

/** The checkpoint whose gate made the request: its gate operation record, or readiness, which records none. */
async function checkpointOf(input: ConfiguredAuditInput): Promise<Checkpoint> {
  const plans = join(input.projectRoot, 'plans');
  let entries: string[];
  try {
    entries = await readdir(plans);
  } catch {
    return 'readiness';
  }
  for (const plan of entries) {
    const operation = join(plans, plan, '.harness', 'jobs', input.runId, 'gates', input.attemptId, 'operation.json');
    try {
      const body = JSON.parse(await readFile(operation, 'utf8')) as { body?: { checkpoint?: Checkpoint }; checkpoint?: Checkpoint };
      const checkpoint = body.checkpoint ?? body.body?.checkpoint;
      if (checkpoint !== undefined) return checkpoint;
    } catch {
      // Not this plan's run.
    }
  }
  return 'readiness';
}

function base(input: ConfiguredAuditInput, configuration: CommittedAuditConfiguration) {
  return {
    requestId: `${input.runId}:${input.attemptId}`, mode: input.mode, nested: input.nested === true, projects: null, discovery: null,
    requestedSourceCommit: input.sourceCommit, reused: false, reuse: null, definition: { path: configuration.path, blob: configuration.blob },
  } as const;
}

function cancelled(input: ConfiguredAuditInput, configuration: CommittedAuditConfiguration): ConfiguredAuditResult {
  return {
    ...base(input, configuration), status: 'cancelled', auditedSourceCommit: null, requestedMode: null, executedMode: null,
    fallbackReason: null, verdict: null, reportCommit: null, runRef: null, treeRef: null,
    detail: 'The scripted audit was cancelled', provider: { status: 'cancelled', reason: 'scripted' }, checks: {},
  };
}

function failed(input: ConfiguredAuditInput, configuration: CommittedAuditConfiguration, code: string, message: string, retryable: boolean): ConfiguredAuditResult {
  return {
    ...base(input, configuration), status: 'failed', auditedSourceCommit: null, requestedMode: null, executedMode: null,
    fallbackReason: null, verdict: null, reportCommit: null, runRef: null, treeRef: null,
    detail: `${code}: ${message}`, provider: { status: 'failed', error: { code, message, retryable } }, checks: {},
  };
}

/** A completed scripted request: each answered check as the provider publishes one, and the composed verdict. */
function composed(
  input: ConfiguredAuditInput,
  configuration: CommittedAuditConfiguration,
  answered: ReadonlyArray<{ check: ScriptedCheck; step: DirectCheckStep }>,
): ConfiguredAuditResult {
  const checks: Record<string, unknown> = {};
  let failing = false;
  let indeterminate = false;
  for (const { check, step } of answered) {
    const outcome = step.outcome ?? { kind: 'completed', exitCode: 0 };
    const passed = outcome.kind === 'completed' && outcome.exitCode === 0
      && (step.scenarios ?? []).every(scenario => (scenario.status ?? 'passed') === 'passed' || scenario.status === 'skipped');
    const runnerError = outcome.kind === 'runner-error' ? { ...outcome.error } : null;
    if (runnerError !== null) indeterminate = true;
    else if (!passed) failing = true;
    const output = `${step.stdout ?? ''}${step.stderr ?? ''}`;
    checks[check.kind] = {
      status: passed ? 'passed' : runnerError !== null ? 'error' : 'failed',
      passed,
      summary: passed ? `${check.kind} passed` : `${check.kind} ${runnerError !== null ? 'could not run' : 'failed'}`,
      output,
      ...(runnerError === null ? {} : { runnerError }),
      ...(step.scenarios === undefined ? {} : { cucumberMessages: { status: 'read', run: { scenarios: step.scenarios.map(cucumberScenario) } } }),
    };
  }
  const verdict = indeterminate ? 'indeterminate' as const : failing ? 'fail' as const : 'pass' as const;
  const evidence = testEvidence({ sourceCommit: input.sourceCommit, attemptId: input.attemptId });
  const mode = input.mode === 'full' ? 'full' as const : 'ramify-partial' as const;
  return {
    ...base(input, configuration), status: 'completed', auditedSourceCommit: input.sourceCommit,
    requestedMode: mode, executedMode: mode, fallbackReason: null, verdict,
    reportCommit: evidence.reportCommit, runRef: evidence.runRef, treeRef: evidence.treeRef,
    detail: verdict === 'pass' ? 'Scripted audit passed; no provider ran' : `Scripted audit composed ${verdict}`,
    // A nested request of a scripted project, which has no nested definition:
    // the root is its only project and discovery skipped nothing.
    ...(input.nested === true ? {
      projects: [{
        projectRoot: configuration.projectRoot, verdict, execution: 'ran' as const, status: 'completed' as const,
        failures: verdict === 'pass' ? [] : [`Scripted audit composed ${verdict}`], requestId: `${input.runId}:${input.attemptId}`,
        auditedSourceCommit: input.sourceCommit, requestedMode: mode, executedMode: mode, fallbackReason: null, reuse: null,
        reportCommit: evidence.reportCommit, runRef: evidence.runRef, treeRef: evidence.treeRef, retrievalCommands: [],
        durationSeconds: null, counts: null, detail: 'scripted',
      }],
      discovery: { status: 'complete' as const, skipped: [], unavailable: [] },
    } : {}),
    provider: {
      status: 'completed', scripted: true,
      summary: { overall: verdict, checks, coverage: { universe: { checkIds: Object.keys(checks) } } },
      composition: { verdict, scoped: mode === 'ramify-partial', reason: 'scripted' },
    },
    checks,
  };
}

/** One scripted scenario as the provider's parsed Cucumber run lists it, tagged with its identity. */
function cucumberScenario(scenario: ScriptedScenario) {
  const status = scenario.status ?? 'passed';
  const outcome = status === 'passed' ? 'passed' : status === 'skipped' || status === 'pending' ? 'skipped' : 'failed';
  const steps = [
    ...(scenario.binding ?? []).map(binding => ({ text: binding.step, status: 'PASSED', definitionLocations: [{ uri: binding.uri, line: binding.line }] })),
    ...(scenario.failure === undefined ? [] : [{ text: scenario.failure.step, status: 'FAILED', definitionLocations: [], errorMessage: scenario.failure.message }]),
    ...(scenario.undefinedSteps ?? []).map(text => ({ text, status: 'UNDEFINED', definitionLocations: [] })),
    ...(status === 'pending' ? [{ text: 'a pending step', status: 'PENDING', definitionLocations: [] }] : []),
    ...(status === 'ambiguous' ? [{ text: 'an ambiguous step', status: 'AMBIGUOUS', definitionLocations: [] }] : []),
  ];
  return {
    uri: scenario.file ?? `features/${scenario.id}.feature`,
    line: scenario.line ?? 1,
    name: scenario.id,
    tags: [`@ramify-${scenario.id}`],
    outcome,
    steps,
    messages: [],
  };
}

/** Announces every planned in-place check before answering, as the real executor announces each. */
export function announcingCheckExecution(port: CheckExecutionPort): CheckExecutionPort {
  return {
    async run(checks, request) {
      for (const index of checks.keys()) await request.started?.(commandStart(checks, index));
      return port.run(checks, request);
    },
  };
}
