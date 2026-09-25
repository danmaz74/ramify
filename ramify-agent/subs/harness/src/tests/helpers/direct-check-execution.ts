import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { GateEvidence, ScenarioCheckSummary } from '../../checks/records.js';
import { checkOutputPath, commandStart, inPlaceCheckExecution, notRun, type CheckExecutionContext, type CheckExecutionPort } from '../../checks/execution.js';
import type { PlannedCheck } from '../../checks/verify.js';
import { outputTailBytes, type CommandOutcome, type CommandRun } from '../../../subs/evidence/src/run-command.js';
import { scenarioRunName } from '../../../subs/scenarios/src/profiles.js';
import { identityTagOf, pendingTag } from '../../../subs/scenarios/src/rendering.js';

/** One deterministic command result returned by the direct test executor. */
export interface DirectCheckStep {
  readonly outcome?: CommandOutcome | undefined;
  readonly stdout?: string | undefined;
  readonly stderr?: string | undefined;
  readonly elapsedMs?: number | undefined;
  readonly truncated?: boolean | undefined;
  /** For a `scenarios` check: what its streams said. Omitted, the check passed with every selected scenario. */
  readonly scenarios?: ScenarioCheckSummary | undefined;
}

/** Facts available when a scripted result is selected. */
export interface DirectCheckInvocation {
  readonly check: PlannedCheck;
  readonly checkIndex: number;
  /** Number of scripted commands already selected by this executor. */
  readonly invocationIndex: number;
  readonly context: CheckExecutionContext;
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

/**
 * A direct execution port for state-machine and lifecycle tests.
 *
 * It writes the same output files as a real executor and delegates every
 * semantic decision to the production gate's `classify` callback. It does
 * not spawn commands, create worktrees, publish Git refs, or establish MCP
 * audit acceptance. Its evidence values are synthetic test records only.
 */
export function createDirectCheckExecution(options: DirectCheckExecutionOptions): ScriptedCheckExecution {
  // A sequential script names the commands a scenario states; a scenario
  // check it does not name passes without consuming an entry.
  const execution = directCheckExecution(invocation => scriptedStep(options.script, invocation), options.evidence, false);
  return {
    run: execution.port.run,
    assertComplete() {
      if (execution.consumed() !== options.script.length) {
        throw new Error(`Direct check script declared ${options.script.length} results but consumed ${execution.consumed()}`);
      }
    },
  };
}

/**
 * A reusable direct executor whose callback explicitly answers every command.
 *
 * Unlike a sequential script, this mode has no fixture entries to exhaust;
 * each finite `run` request bounds the callback invocations for that gate.
 */
export function createMappedCheckExecution(options: MappedCheckExecutionOptions): CheckExecutionPort {
  return directCheckExecution(options.script, options.evidence, true).port;
}

/**
 * The same executor, announcing each command before it answers them, as the
 * in-place and the audit executors announce each command as it starts. A
 * run given it records a `gate-command-started` line for every command.
 */
export function announcingCheckExecution(port: CheckExecutionPort): CheckExecutionPort {
  return {
    async run(checks, request) {
      for (const index of checks.keys()) await request.started?.(commandStart(checks, index));
      return port.run(checks, request);
    },
  };
}

/**
 * The deliberately generic passing executor for scenarios that do not test
 * command outcomes. Each gate's finite check list bounds its answers.
 */
export function createPassingCheckExecution(): CheckExecutionPort {
  return createMappedCheckExecution({ script: () => ({}) });
}

/**
 * Runs real local commands without audit worktrees or Git publication.
 *
 * Use this only where command output or process behavior is itself under
 * test. The attached identity and evidence remain synthetic test records.
 */
export function createLocalCommandCheckExecution(): CheckExecutionPort {
  return {
    async run(checks, request) {
      const result = await inPlaceCheckExecution.run(checks, request);
      const cancelled = result.commands.some(command => command.notVerified === 'interrupted');
      return {
        commands: result.commands,
        audited: cancelled ? null : request.context.sourceCommit,
        evidence: cancelled ? null : testEvidence(request.context),
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
  scriptsScenarios: boolean,
): { readonly port: CheckExecutionPort; readonly consumed: () => number } {
  let invocationIndex = 0;
  const port: CheckExecutionPort = {
    async run(checks, request) {
      const commands = [];
      let interrupted = false;
      let cancelled = false;
      // As the real executors do, a setup command that did not pass keeps
      // every later command from running, and none of them is scripted.
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
          const record = request.classify(check, run, outputFile);
          commands.push(record);
          interrupted = true;
          cancelled = true;
          continue;
        }

        if (check.kind === 'scenarios' && !scriptsScenarios) {
          const run = await commandRun(outputFile, {}, invocationIndex);
          commands.push(request.classify(check, run, outputFile, passingScenarioSummary(check)));
          continue;
        }

        const invocation: DirectCheckInvocation = {
          check,
          checkIndex,
          invocationIndex,
          context: request.context,
          signal: request.signal,
        };
        const scripted = await select(invocation);
        invocationIndex += 1;
        const step = request.signal.aborted ? { outcome: { kind: 'cancelled' } as const } : scripted;
        const run = await commandRun(outputFile, step, invocation.invocationIndex);
        const record = check.kind === 'scenarios'
          ? request.classify(check, run, outputFile, ('scenarios' in step ? step.scenarios : undefined) ?? passingScenarioSummary(check))
          : request.classify(check, run, outputFile);
        commands.push(record);
        if (record.notVerified === 'interrupted') {
          interrupted = true;
          cancelled = true;
        } else if (check.kind === 'setup' && record.outcome !== 'passed') {
          setupFailed = true;
        }
      }
      // A preparation that failed publishes nothing, as ramify-audit's does not.
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

function testEvidence(context: CheckExecutionContext): GateEvidence {
  const identity = `${context.sourceCommit}-${context.attemptId}`;
  return {
    runRef: `refs/test-only/audited-runs/${identity}`,
    reportCommit: `test-only-report-${identity}`,
    treeRef: `refs/test-only/audited-trees/${context.sourceCommit}`,
  };
}

/**
 * What a scenario check that passed says, for a direct executor that runs
 * nothing: every run exited 0, and every tracked scenario the selection
 * reaches passed. An identity selection reaches the scenarios it names; a
 * module's run without it reaches the tracked scenarios in that module's
 * feature files as they stand on disk, all of them for `all` and those
 * without the pending tag for `all-untagged`, as the runner itself would.
 */
export function passingScenarioSummary(check: PlannedCheck): ScenarioCheckSummary {
  const plan = check.scenarios;
  if (plan === undefined) throw new Error(`A ${check.kind} check carries no scenario plan`);
  const files = new Map(plan.tracked.map(scenario => [scenario.id, scenario.file]));
  const passed = (id: string, run: string) => ({
    id, run, status: 'passed' as const, file: files.get(id) ?? '', line: 1, binding: [], undefined: [],
  });
  let excluded = 0;
  const scenarios = plan.runs.flatMap(run => {
    if (run.selection.kind === 'identity') return run.selection.scenarios.map(id => passed(id, run.module.module));
    const area = `${run.module.dir === '' ? '' : `${run.module.dir}/`}${run.module.testing ? 'src/features' : 'src/tests/features'}/`;
    return plan.tracked.filter(scenario => scenario.file.startsWith(area)).flatMap(scenario => {
      const pending = tagLineOf(check.command.cwd, scenario.file, scenario.id)?.includes(pendingTag);
      if (pending === undefined) return [];
      if (pending && run.selection.kind === 'all-untagged') {
        excluded += 1;
        return [];
      }
      return [passed(scenario.id, run.module.module)];
    });
  });
  return {
    mode: plan.mode,
    selection: plan.selection,
    dryRun: plan.dryRun,
    excluded,
    setup: plan.setup === null ? null : { exit: 0 },
    teardown: plan.teardown === null ? null : { exit: 0 },
    runs: plan.runs.map(run => ({
      module: run.module.module,
      exit: 0,
      profile: `scenarios/${scenarioRunName(run.module)}.profile.mjs`,
      messages: `scenarios/${scenarioRunName(run.module)}.ndjson`,
    })),
    scenarios,
    untracked: { passed: 0, skipped: 0, failed: 0 },
    failures: [],
  };
}

/** The tag line of one tracked scenario in its feature file on disk, or undefined where the file does not hold it. */
function tagLineOf(projectRoot: string, file: string, id: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(join(projectRoot, file), 'utf8');
  } catch {
    return undefined;
  }
  return text.split('\n').find(line => line.trim().split(/\s+/u).includes(identityTagOf(id)));
}
