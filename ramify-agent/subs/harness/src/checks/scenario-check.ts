import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { outputTailBytes, runCommand } from '../../subs/evidence/src/run-command.js';
import type { CommandOutcome, CommandRun, CommandRunner } from '../../subs/evidence/src/run-command.js';
import { buildScenarioProfile, type ScenarioMode, type ScenarioSelection } from '../../subs/scenarios/src/profiles.js';
import { summarizeScenarioRun, type TrackedScenario } from '../../subs/scenarios/src/messages.js';
import type { ScenarioModule } from '../../subs/scenarios/src/records.js';
import { checkCommandEnvironment } from './records.js';
import type { CheckCommand, ScenarioCheckResult, ScenarioCheckRun, ScenarioCheckSummary } from './records.js';

/*
 * The scenario check: one Cucumber run per module, in sequence, with the
 * mode's `setup` before the first and `teardown` after the last, each run
 * reading a profile the harness wrote into the attempt's directory, outside
 * the worktree. The check passes by what the message streams say, reduced
 * by the `scenarios` module, and not by the exit codes alone: `undefined`,
 * `pending` and `ambiguous` fail it.
 *
 * Both runners call `runScenarioCheck`: the in-place runner in the project
 * itself, the audit's executor in its worktree with its path mapping. What
 * the check runs is planned by `checks/checkpoint.ts`.
 */

/** One module's run in a scenario check, with what it selects. */
export interface ScenarioCheckModuleRun {
  readonly module: ScenarioModule;
  readonly selection: ScenarioSelection;
}

/** What a `scenarios` check runs, planned from the checkpoint and the captured configuration. */
export interface ScenarioCheckPlan {
  readonly mode: ScenarioMode;
  /** The checkpoint's selection; an identity selection names every scenario it runs. */
  readonly selection: ScenarioSelection;
  /** Every run is strict: `undefined` and `pending` steps fail it. */
  readonly strict: true;
  /** `--dry-run`: the runs load every step file and execute nothing. */
  readonly dryRun: boolean;
  /** The configured support files, imported first, in order. */
  readonly support: string[];
  /** One run each, in this order. */
  readonly runs: ScenarioCheckModuleRun[];
  readonly setup: CheckCommand | null;
  readonly teardown: CheckCommand | null;
  /** The bound of each run. */
  readonly runTimeoutMs: number;
  /** Every tracked scenario, by identity and file, so the reducer tells them from the project's own. */
  readonly tracked: TrackedScenario[];
}

/** The bound of one run by mode, and of the mode's setup and teardown. */
export const scenarioTimeouts = {
  quick: 600_000,
  full: 1_800_000,
  setup: 600_000,
  teardown: 600_000,
} as const;

/** The bound of a whole check: its runs' sum, plus setup and teardown. */
export function scenarioCheckTimeoutMs(plan: Pick<ScenarioCheckPlan, 'runs' | 'runTimeoutMs' | 'setup' | 'teardown'>): number {
  return plan.runs.length * plan.runTimeoutMs + (plan.setup?.timeoutMs ?? 0) + (plan.teardown?.timeoutMs ?? 0);
}

/** One scenario check to execute. */
export interface ScenarioCheckExecution {
  /** The check's command, whose argv is the mode's command and which carries the plan. */
  readonly command: CheckCommand;
  readonly plan: ScenarioCheckPlan;
  /** Where the runs start: the project root, or the audit's copy of it. */
  readonly projectRoot: string;
  /** The attempt's directory, outside any worktree: the profiles and streams go under its `scenarios/`. */
  readonly attemptDirectory: string;
  /** Where the complete output of every command of the check goes. */
  readonly outputFile: string;
  /** Maps an argument of a configured command into `projectRoot`; the audit's path mapping. */
  readonly rebase?: ((argument: string) => string) | undefined;
  /** Maps text the commands printed back to the project's own paths. */
  readonly restore?: ((text: string) => string) | undefined;
  readonly signal: AbortSignal;
  /** The command boundary; tests supply a scripted runner. */
  readonly runner?: CommandRunner | undefined;
}

/** How a scenario check ended: its commands as one run, and what their streams said. */
export interface ScenarioCheckOutcome {
  readonly run: CommandRun;
  readonly summary: ScenarioCheckSummary;
}

/** Runs one scenario check and answers its combined run and its summary. It never throws on a command's failure. */
export async function runScenarioCheck(execution: ScenarioCheckExecution): Promise<ScenarioCheckOutcome> {
  const { plan, projectRoot, attemptDirectory } = execution;
  const runner = execution.runner ?? runCommand;
  const rebase = execution.rebase ?? ((argument: string) => argument);
  const restore = execution.restore ?? ((text: string) => text);
  const env = checkCommandEnvironment(execution.command);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const log: string[] = [];
  const outcomes: CommandOutcome[] = [];
  let lockWaitMs = 0;
  const receivedEnvironment = new Set<string>();
  const failures: string[] = [];

  await mkdir(posix.join(attemptDirectory, 'scenarios'), { recursive: true });

  const invoke = async (argv: readonly string[], timeoutMs: number, signal: AbortSignal): Promise<CommandRun> => {
    const run = await runner({ argv: argv.map(rebase), cwd: projectRoot, env, timeoutMs, signal });
    log.push(`$ ${argv.join(' ')}\n${restore(`${run.stdout}${run.stderr}`)}`);
    outcomes.push(run.outcome);
    lockWaitMs += run.lockWaitMs ?? 0;
    for (const name of run.receivedEnvironment ?? []) receivedEnvironment.add(name);
    return run;
  };

  let setup: ScenarioCheckSummary['setup'] = null;
  let stopped = false;
  if (plan.setup !== null) {
    const run = await invoke(plan.setup.argv, plan.setup.timeoutMs, execution.signal);
    setup = { exit: exitOf(run.outcome) };
    if (!(run.outcome.kind === 'completed' && run.outcome.exitCode === 0)) {
      failures.push(`setup \`${plan.setup.argv.join(' ')}\` ${describeOutcome(run.outcome)}, so no run started`);
      stopped = true;
    }
  }

  const runs: ScenarioCheckRun[] = [];
  const scenarios: ScenarioCheckResult[] = [];
  const untracked = { passed: 0, skipped: 0, failed: 0 };
  let excluded = 0;
  const config = { support: plan.support, modes: { quick: { command: execution.command.argv }, full: { command: execution.command.argv } } };
  for (const { module, selection } of plan.runs) {
    const profile = buildScenarioProfile(module, plan.mode, selection, config, attemptDirectory, { dryRun: plan.dryRun, projectRoot });
    const entry = { module: module.module, profile: relativeTo(attemptDirectory, profile.profilePath), messages: relativeTo(attemptDirectory, profile.messagesPath) };
    if (stopped) {
      runs.push({ ...entry, exit: null });
      continue;
    }
    await writeFile(profile.profilePath, profile.profileText);
    await rm(profile.messagesPath, { force: true });
    const run = await invoke(profile.argv, plan.runTimeoutMs, execution.signal);
    runs.push({ ...entry, exit: exitOf(run.outcome) });
    if (run.outcome.kind !== 'completed') {
      failures.push(`the run of ${module.module} ${describeOutcome(run.outcome)}`);
      // A run that did not complete leaves nothing the next one could rely
      // on; a cancelled attempt is over. Teardown still runs.
      stopped = true;
      continue;
    }
    if (run.outcome.exitCode !== 0) failures.push(`the run of ${module.module} exited with ${run.outcome.exitCode}`);

    const stream = await readFile(profile.messagesPath, 'utf8').catch(() => null);
    if (stream === null) {
      failures.push(`the run of ${module.module} wrote no message stream`);
      continue;
    }
    const summary = summarizeScenarioRun(stream, plan.tracked);
    if (summary.finished === null) failures.push(`the message stream of ${module.module} ends before its run finished`);
    if (summary.malformedLines.length > 0) failures.push(`the message stream of ${module.module} has ${summary.malformedLines.length} line(s) that are not JSON`);
    excluded += summary.excluded.length;
    untracked.passed += summary.untracked.passed;
    untracked.skipped += summary.untracked.skipped;
    untracked.failed += summary.untracked.failed;
    for (const result of summary.scenarios) {
      scenarios.push({ ...result, run: module.module, ...(result.failure === undefined ? {} : { failure: { ...result.failure, message: restore(result.failure.message) } }) });
    }
    const failedBefore = failures.length;
    failures.push(...scenarioFailures(summary.scenarios, plan.dryRun));
    if (selection.kind === 'identity') {
      const ran = new Set(summary.scenarios.map(result => result.id));
      for (const id of selection.scenarios) if (!ran.has(id)) failures.push(`${id} was selected and the run of ${module.module} did not execute it`);
    }
    if (summary.untracked.failed > 0) failures.push(`${summary.untracked.failed} of the project's own scenarios in ${module.module} did not pass`);
    if (!plan.dryRun && summary.untracked.skipped > 0) failures.push(`${summary.untracked.skipped} of the project's own scenarios in ${module.module} were skipped`);
    if (summary.finished?.success === false && failures.length === failedBefore && run.outcome.exitCode === 0) {
      failures.push(`the runner reported the run of ${module.module} unsuccessful`);
    }
  }

  let teardown: ScenarioCheckSummary['teardown'] = null;
  if (plan.teardown !== null) {
    // Teardown runs after the last run whatever happened, a failure and a
    // cancellation included, so what setup started does not outlive the
    // attempt. It has its own bound, not the attempt's signal.
    const run = await invoke(plan.teardown.argv, plan.teardown.timeoutMs, AbortSignal.timeout(plan.teardown.timeoutMs + 5_000));
    teardown = { exit: exitOf(run.outcome) };
    if (!(run.outcome.kind === 'completed' && run.outcome.exitCode === 0)) {
      failures.push(`teardown \`${plan.teardown.argv.join(' ')}\` ${describeOutcome(run.outcome)}`);
    }
  }

  const summary: ScenarioCheckSummary = {
    mode: plan.mode,
    selection: plan.selection,
    dryRun: plan.dryRun,
    excluded,
    setup,
    teardown,
    runs,
    scenarios,
    untracked,
    failures,
  };
  log.push(summaryText(summary));
  const complete = log.join('\n');
  const bytes = Buffer.from(complete, 'utf8');
  await writeFile(execution.outputFile, bytes);
  return {
    run: {
      outcome: combinedOutcome(outcomes),
      startedAt,
      elapsedMs: Math.max(0, Date.now() - started - lockWaitMs),
      ...(lockWaitMs > 0 ? { lockWaitMs } : {}),
      ...(receivedEnvironment.size === 0 ? {} : { receivedEnvironment: [...receivedEnvironment].sort() }),
      output: {
        path: execution.outputFile,
        bytes: bytes.byteLength,
        truncated: false,
        tail: bytes.subarray(Math.max(0, bytes.byteLength - outputTailBytes)).toString('utf8'),
      },
      stdout: complete,
      stderr: '',
    },
    summary,
  };
}

/** Whether a summary passes: every run exited zero, and every selected and every own scenario passed. */
export function scenarioCheckPassed(summary: ScenarioCheckSummary): boolean {
  return summary.failures.length === 0;
}

/**
 * The tracked scenarios that did not pass, one line each: strictly, only
 * `passed` passes; in a dry run, `skipped` is what a scenario whose every
 * step has one definition reports, and passes too.
 */
function scenarioFailures(results: readonly { id: string; status: string; failure?: { step: string; message: string } | undefined; undefined: readonly string[] }[], dryRun: boolean): string[] {
  const allowed = dryRun ? ['passed', 'skipped'] : ['passed'];
  return results.filter(result => !allowed.includes(result.status)).map(result => {
    const detail = result.status === 'undefined' && result.undefined.length > 0
      ? `no step definition matches ${result.undefined.map(text => `"${text}"`).join(', ')}`
      : result.failure === undefined ? result.status : `${result.failure.step}: ${firstLine(result.failure.message)}`;
    return `${result.id} ${result.status}: ${detail}`;
  });
}

/** The outcome the check reports as one command: a cancellation first, then a timeout, a runner error, then the first non-zero exit. */
function combinedOutcome(outcomes: readonly CommandOutcome[]): CommandOutcome {
  const cancelled = outcomes.find(outcome => outcome.kind === 'cancelled');
  if (cancelled !== undefined) return cancelled;
  const timedOut = outcomes.find(outcome => outcome.kind === 'timed-out');
  if (timedOut !== undefined) return timedOut;
  const error = outcomes.find(outcome => outcome.kind === 'runner-error');
  if (error !== undefined) return error;
  const failed = outcomes.find(outcome => outcome.kind === 'completed' && outcome.exitCode !== 0);
  return failed ?? { kind: 'completed', exitCode: 0 };
}

function exitOf(outcome: CommandOutcome): number | null {
  return outcome.kind === 'completed' ? outcome.exitCode : null;
}

function describeOutcome(outcome: CommandOutcome): string {
  switch (outcome.kind) {
    case 'completed': return `exited with ${outcome.exitCode}`;
    case 'timed-out': return `timed out after ${outcome.timeoutMs} ms`;
    case 'cancelled': return 'was cancelled';
    case 'runner-error': return `could not run (${outcome.error.kind}: ${outcome.error.message})`;
  }
}

function relativeTo(directory: string, path: string): string {
  return posix.relative(directory, path);
}

function firstLine(text: string): string {
  return text.split('\n').find(line => line.trim() !== '')?.trim() ?? '';
}

/** The last lines of the check's output: its verdict, and why it failed. */
function summaryText(summary: ScenarioCheckSummary): string {
  const selection = summary.selection.kind === 'identity' ? `identity ${summary.selection.scenarios.join(', ')}` : summary.selection.kind;
  const counts = `${summary.scenarios.filter(result => result.status === 'passed').length} of ${summary.scenarios.length} tracked scenario(s) passed; the project's own: ${summary.untracked.passed} passed, ${summary.untracked.skipped} skipped, ${summary.untracked.failed} failed`;
  const head = `Scenario check, ${summary.mode} mode${summary.dryRun ? ', dry run' : ''}, ${selection}, ${summary.runs.length} run(s): ${summary.failures.length === 0 ? 'passed' : 'failed'}. ${counts}.`;
  return [head, ...summary.failures.map(failure => `- ${failure}`)].join('\n') + '\n';
}
