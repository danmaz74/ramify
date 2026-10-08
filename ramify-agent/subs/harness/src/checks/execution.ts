import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../subs/evidence/src/run-command.js';
import { dispatchHarnessCommand } from '../../subs/audit/src/focused-check.js';
import type { CommandRun } from '../../subs/evidence/src/run-command.js';
import { checkCommandEnvironment } from './records.js';
import type { CheckCommandKind, Checkpoint, GateCommandRecord, GateEvidence } from './records.js';
import type { PlannedCheck } from './verify.js';

/*
 * Execution of a standalone session's in-place diagnosis: its already
 * verified commands, run in the project's working directory. The gate owns
 * whether a plan is verified and what the resulting records mean; an
 * implementation of this port runs the plans in order and answers one
 * command record for each. A committing run gate runs none of this: it asks
 * the project's committed audit (`subs/audit`), which owns its checks.
 */

export interface CheckExecutionRequest {
  /** Where complete command output is written, beside the attempt record. */
  readonly directory: string;
  /** The gate's policy for turning one harness command run into its record. */
  readonly classify: (check: PlannedCheck, run: CommandRun, outputFile: string) => GateCommandRecord;
  /** The revision and gate-specific facts the executor binds. */
  readonly context: CheckExecutionContext;
  /** Every gate execution is bounded. */
  readonly signal: AbortSignal;
  /**
   * Called as each command starts, before it runs, so that a reader can see
   * which step a running gate is on. A command that never starts, because
   * an earlier one was interrupted, is not announced.
   */
  readonly started?: GateCommandStarted | undefined;
}

/**
 * One command of a gate as it starts: its kind and its place among the
 * gate's commands, counted from one. For a committing gate it is one check
 * of the committed audit definition, as the provider starts it.
 */
export interface GateCommandStart {
  readonly kind: CheckCommandKind;
  /** A setup command's declared name, such as `build`, or a configured check's name. */
  readonly name?: string;
  readonly position: number;
  readonly total: number;
}

/** What an executor calls as each command starts. It settles before the command runs. */
export type GateCommandStarted = (command: GateCommandStart) => Promise<void>;

/** The announcement of one planned check, at its index among `checks`. */
export function commandStart(checks: readonly PlannedCheck[], index: number): GateCommandStart {
  const check = checks[index]!;
  return { kind: check.kind, ...(check.name === undefined ? {} : { name: check.name }), position: index + 1, total: checks.length };
}

/** Facts that vary for every in-place diagnosis. */
export interface CheckExecutionContext {
  /** The durable run that owns the attempt. In-place standalone gates have none. */
  readonly runId?: string | undefined;
  readonly attemptId: string;
  readonly checkpoint: Checkpoint;
  readonly projectRoot: string;
  /** The head the working tree stood on. */
  readonly sourceCommit: string;
  /** The aggregate bound for the diagnosis. */
  readonly timeoutMs: number;
}

/** The replaceable execution side of an in-place diagnosis. */
export interface CheckExecutionPort {
  run(checks: readonly PlannedCheck[], request: CheckExecutionRequest): Promise<CheckExecutionResult>;
}

/** What execution adds to the gate policy's final attempt. */
export interface CheckExecutionResult {
  readonly commands: readonly GateCommandRecord[];
  /** Null for the in-place runner. */
  readonly audited: string | null;
  /** Null: an in-place diagnosis publishes nothing. */
  readonly evidence: GateEvidence | null;
  /** The provider's parsed diagnostic of each command, retained without a competing harness schema. */
  readonly provider?: { readonly result: unknown; readonly checks: unknown };
}

/**
 * Today's in-place runner: execute the verified commands in the project's
 * working directory. The project's setup commands come first; once one of
 * them has not passed, no later command runs, and each is recorded as not
 * run because of it.
 */
export function createInPlaceCheckExecution(): CheckExecutionPort {
  return {
    async run(checks, request) {
      const commands: GateCommandRecord[] = [];
      const providerChecks: Record<string, unknown> = {};
      const startedAt = new Date().toISOString();
      let interrupted = false;
      let setupFailed = false;
      for (const [index, check] of checks.entries()) {
        const outputFile = outputPath(request.directory, index, check);
        if (interrupted || setupFailed) {
          await writeFile(outputFile, '');
          commands.push(notRun(check, outputFile, startedAt, interrupted ? 'interrupted' : 'setup-failed'));
          continue;
        }
        await request.started?.(commandStart(checks, index));
        if (check.kind === 'setup') {
          const run = await runCommand({ argv: check.command.argv, cwd: check.command.cwd,
            env: checkCommandEnvironment(check.command), timeoutMs: check.command.timeoutMs, outputFile, signal: request.signal });
          const record = request.classify(check, run, outputFile);
          commands.push(record);
          if (record.notVerified === 'interrupted') interrupted = true;
          else if (record.outcome !== 'passed') setupFailed = true;
          continue;
        }
        const id = `check-${String(index + 1).padStart(2, '0')}-${check.kind}`;
        const executed = await dispatchHarnessCommand({ command: check.command, signal: request.signal, outputFile, checkId: id });
        const record = request.classify(check, executed.run, outputFile);
        const decided: GateCommandRecord = executed.passed || record.outcome !== 'passed' ? record
          : executed.runnerError === null ? { ...record, outcome: 'failed' }
            : { ...record, outcome: 'not-verified', notVerified: 'runner-error', runnerError: executed.runnerError };
        commands.push({ ...decided, providerCheckId: id });
        providerChecks[id] = executed.provider;
        if (decided.notVerified === 'interrupted') interrupted = true;
      }
      return { commands, audited: null, evidence: null,
        ...(Object.keys(providerChecks).length === 0 ? {} : { provider: { result: { source: 'working-tree', published: false }, checks: providerChecks } }) };
    },
  };
}

export const inPlaceCheckExecution: CheckExecutionPort = createInPlaceCheckExecution();

/** The stable log name of one planned check. */
export function checkOutputPath(directory: string, index: number, check: PlannedCheck): string {
  return outputPath(directory, index, check);
}

function outputPath(directory: string, index: number, check: PlannedCheck): string {
  return join(directory, `${String(index + 1).padStart(2, '0')}-${check.kind}.log`);
}

/**
 * The record of a command that never ran: an earlier one was interrupted,
 * or a setup command before it did not pass.
 */
export function notRun(
  check: PlannedCheck,
  outputFile: string,
  startedAt: string,
  reason: 'interrupted' | 'setup-failed',
  tail = '',
): GateCommandRecord {
  return {
    kind: check.kind,
    ...(check.name === undefined ? {} : { name: check.name }),
    command: check.command,
    startedAt,
    elapsedMs: 0,
    exitCode: null,
    outcome: 'not-verified',
    notVerified: reason,
    runnerError: null,
    output: { path: outputFile, bytes: Buffer.byteLength(tail), truncated: false, tail },
  };
}
