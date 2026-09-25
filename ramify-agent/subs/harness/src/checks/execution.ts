import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../subs/evidence/src/run-command.js';
import type { CommandRun } from '../../subs/evidence/src/run-command.js';
import { checkCommandEnvironment } from './records.js';
import type { CheckCommandKind, Checkpoint, GateCommandRecord, GateEvidence, GateRuleRecord, ScenarioCheckSummary, TestSelectionPolicy } from './records.js';
import { runScenarioCheck } from './scenario-check.js';
import type { PlannedCheck } from './verify.js';

/*
 * Execution of a gate's already verified commands. The gate owns whether a
 * plan is verified and what the resulting records mean; an implementation of
 * this port runs the plans in order and answers one command record for each.
 */

export interface CheckExecutionRequest {
  /** Where complete command output is written, beside the attempt record. */
  readonly directory: string;
  /**
   * The gate's policy for turning one harness command run into its record.
   * A `scenarios` check passes its summary too, since its outcome is read
   * from the message streams and not from the exit codes alone.
   */
  readonly classify: (check: PlannedCheck, run: CommandRun, outputFile: string, scenarios?: ScenarioCheckSummary) => GateCommandRecord;
  /** The revision and gate-specific facts an isolated executor must bind. */
  readonly context: CheckExecutionContext;
  /** Every gate execution is bounded, including time spent waiting for an audit lease. */
  readonly signal: AbortSignal;
  /**
   * Called as each command starts, before it runs, so that a reader can see
   * which step a running gate is on. A command that never starts, because
   * an earlier one was interrupted, is not announced.
   */
  readonly started?: GateCommandStarted | undefined;
}

/** One command of a gate as it starts: its kind and its place among the gate's commands, counted from one. */
export interface GateCommandStart {
  readonly kind: CheckCommandKind;
  readonly position: number;
  readonly total: number;
}

/** What an executor calls as each command starts. It settles before the command runs. */
export type GateCommandStarted = (command: GateCommandStart) => Promise<void>;

/** The announcement of one planned check, at its index among `checks`. */
export function commandStart(checks: readonly PlannedCheck[], index: number): GateCommandStart {
  return { kind: checks[index]!.kind, position: index + 1, total: checks.length };
}

/**
 * Facts that vary for every gate. They travel with the execution request,
 * rather than being frozen into the service-level port, because an audit is
 * bound to one commit, attempt, checkpoint and resolved selection.
 */
export interface CheckExecutionContext {
  /** The durable run that owns the attempt. In-place standalone gates have none. */
  readonly runId?: string | undefined;
  readonly attemptId: string;
  readonly checkpoint: Checkpoint;
  readonly projectRoot: string;
  /** The already-made commit an isolated implementation must execute over. */
  readonly sourceCommit: string;
  readonly selection: {
    readonly policy: TestSelectionPolicy['policy'];
    readonly exactOwners: readonly string[];
    readonly subtrees: readonly string[];
  };
  /** Project-relative package directories whose installed dependencies are linked. */
  readonly dependencyDirectories: readonly string[];
  /** Harness-owned findings included beside command checks in external evidence. */
  readonly harness: {
    readonly guardedChanges: readonly CheckHarnessGuardedChange[];
    readonly rules: readonly GateRuleRecord[];
  };
  /** The aggregate bound for the gate, including lease acquisition and preparation. */
  readonly timeoutMs: number;
}

/** The guarded-file comparison an executor may include in external evidence. */
export interface CheckHarnessGuardedChange {
  readonly path: string;
  readonly before: string;
  readonly after: string | null;
  readonly authorizedBy: { readonly id: string; readonly revision: number; readonly hash: string } | null;
}

/** The replaceable execution side of a gate. */
export interface CheckExecutionPort {
  run(checks: readonly PlannedCheck[], request: CheckExecutionRequest): Promise<CheckExecutionResult>;
}

/** What execution adds to the gate policy's final attempt. */
export interface CheckExecutionResult {
  readonly commands: readonly GateCommandRecord[];
  /** Null for the in-place runner; an isolated audit names its exact source commit. */
  readonly audited: string | null;
  /** Null unless an external audit published evidence. */
  readonly evidence: GateEvidence | null;
  /** The external audit's exact overall result, when it published a report. */
  readonly auditOverall?: 'pass' | 'fail' | null;
}

/** Today's runner: execute the verified commands in the project's working directory. */
export const inPlaceCheckExecution: CheckExecutionPort = {
  async run(checks, request) {
    const commands: GateCommandRecord[] = [];
    const startedAt = new Date().toISOString();
    let interrupted = false;
    for (const [index, check] of checks.entries()) {
      const outputFile = outputPath(request.directory, index, check);
      if (interrupted) {
        await writeFile(outputFile, '');
        commands.push(notRun(check, outputFile, startedAt));
        continue;
      }

      await request.started?.(commandStart(checks, index));
      if (check.scenarios !== undefined) {
        const outcome = await runScenarioCheck({
          command: check.command,
          plan: check.scenarios,
          projectRoot: check.command.cwd,
          attemptDirectory: request.directory,
          outputFile,
          signal: request.signal,
        });
        const record = request.classify(check, outcome.run, outputFile, outcome.summary);
        commands.push(record);
        if (record.notVerified === 'interrupted') interrupted = true;
        continue;
      }

      const run = await runCommand({
        argv: check.command.argv,
        cwd: check.command.cwd,
        env: checkCommandEnvironment(check.command),
        timeoutMs: check.command.timeoutMs,
        outputFile,
        signal: request.signal,
      });
      const record = request.classify(check, run, outputFile);
      commands.push(record);
      if (record.notVerified === 'interrupted') interrupted = true;
    }
    return { commands, audited: null, evidence: null };
  },
};

/** The stable log name of one planned check. */
export function checkOutputPath(directory: string, index: number, check: PlannedCheck): string {
  return outputPath(directory, index, check);
}

function outputPath(directory: string, index: number, check: PlannedCheck): string {
  return join(directory, `${String(index + 1).padStart(2, '0')}-${check.kind}.log`);
}

function notRun(check: PlannedCheck, outputFile: string, startedAt: string): GateCommandRecord {
  return {
    kind: check.kind,
    command: check.command,
    ...(check.selection === undefined ? {} : { selection: check.selection }),
    startedAt,
    elapsedMs: 0,
    exitCode: null,
    outcome: 'not-verified',
    notVerified: 'interrupted',
    runnerError: null,
    output: { path: outputFile, bytes: 0, truncated: false, tail: '' },
  };
}
