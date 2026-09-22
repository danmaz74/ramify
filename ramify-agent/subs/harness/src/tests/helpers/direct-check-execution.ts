import { writeFile } from 'node:fs/promises';

import type { GateEvidence } from '../../checks/records.js';
import { checkOutputPath, inPlaceCheckExecution, type CheckExecutionContext, type CheckExecutionPort } from '../../checks/execution.js';
import type { PlannedCheck } from '../../checks/verify.js';
import { outputTailBytes, type CommandOutcome, type CommandRun } from '../../../subs/evidence/src/run-command.js';

/** One deterministic command result returned by the direct test executor. */
export interface DirectCheckStep {
  readonly outcome?: CommandOutcome | undefined;
  readonly stdout?: string | undefined;
  readonly stderr?: string | undefined;
  readonly elapsedMs?: number | undefined;
  readonly truncated?: boolean | undefined;
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

/**
 * A reusable direct executor whose callback explicitly answers every command.
 *
 * Unlike a sequential script, this mode has no fixture entries to exhaust;
 * each finite `run` request bounds the callback invocations for that gate.
 */
export function createMappedCheckExecution(options: MappedCheckExecutionOptions): CheckExecutionPort {
  return directCheckExecution(options.script, options.evidence).port;
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
): { readonly port: CheckExecutionPort; readonly consumed: () => number } {
  let invocationIndex = 0;
  const port: CheckExecutionPort = {
    async run(checks, request) {
      const commands = [];
      let interrupted = false;
      let cancelled = false;
      for (const [checkIndex, check] of checks.entries()) {
        const outputFile = checkOutputPath(request.directory, checkIndex, check);
        if (interrupted || request.signal.aborted) {
          const run = await commandRun(outputFile, { outcome: { kind: 'cancelled' } }, invocationIndex);
          const record = request.classify(check, run, outputFile);
          commands.push(record);
          interrupted = true;
          cancelled = true;
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
        const record = request.classify(check, run, outputFile);
        commands.push(record);
        if (record.notVerified === 'interrupted') {
          interrupted = true;
          cancelled = true;
        }
      }
      return {
        commands,
        audited: cancelled ? null : request.context.sourceCommit,
        evidence: cancelled ? null : (evidence ?? testEvidence)(request.context),
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
