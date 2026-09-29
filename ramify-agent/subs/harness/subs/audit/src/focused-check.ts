import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dispatchCheck, type ProcessExecutorPort } from 'ramify-audit';
import { childEnvironment, runCommand } from '../../evidence/src/run-command.js';
import type { CommandRun, CommandRunner } from '../../evidence/src/run-command.js';
import type { CheckCommand } from '../../../src/checks/records.js';

/** Provider-owned parsed diagnostic over current bytes, with a harness process runner. */
export async function dispatchHarnessCommand(input: {
  readonly command: CheckCommand;
  readonly signal: AbortSignal;
  readonly runner?: CommandRunner;
  readonly outputFile?: string;
  readonly checkId?: string;
}): Promise<{ readonly run: CommandRun; readonly provider: unknown; readonly passed: boolean; readonly runnerError: { readonly kind: string; readonly message: string } | null }> {
  const { command, signal } = input;
  const captured: { current: CommandRun | null } = { current: null };
  const processExecutor: ProcessExecutorPort = {
    async execute(invocation, requestSignal) {
      const reporter = Object.fromEntries(Object.entries(invocation.environment ?? {}).filter(([name]) =>
        name === 'RAMIFY_AUDIT_VITEST_SUMMARY' || name === 'RAMIFY_AUDIT_VITEST_ROOT'
        || name === 'CUCUMBER_SUMMARY_FILE' || name.startsWith('RAMIFY_AUDIT_CUCUMBER_')));
      const run = await (input.runner ?? runCommand)({
        argv: [invocation.command, ...invocation.args],
        cwd: invocation.workingDirectory,
        env: childEnvironment({ ...command.envAdditions, ...reporter }),
        timeoutMs: invocation.timeoutMs ?? command.timeoutMs,
        ...(input.outputFile === undefined ? {} : { outputFile: input.outputFile }),
        signal: requestSignal,
      });
      captured.current = run;
      return {
        exitCode: run.outcome.kind === 'completed' ? run.outcome.exitCode : null,
        signal: run.outcome.kind === 'cancelled' ? 'SIGTERM' : null,
        stdout: run.stdout, stderr: run.stderr, durationMs: run.elapsedMs,
        ...(run.outcome.kind === 'timed-out' ? { timedOut: true } : {}),
        ...(run.outcome.kind === 'runner-error' ? { error: { message: run.outcome.error.message } } : {}),
        ...(run.output.truncated ? { outputTruncated: true } : {}),
      };
    },
  };
  const [cmd, ...args] = command.argv;
  if (cmd === undefined) throw new Error('No test command was configured');
  const result = await dispatchCheck({
    requestId: randomUUID(), runId: 'diagnostic', sourceCommit: 'dirty-working-tree', workingDirectory: command.cwd,
    check: { id: input.checkId ?? 'diagnostic', name: 'Diagnostic', description: 'Current working-tree diagnostic', scope: 'both', category: 'deterministic', onFailure: 'record',
      executor: { kind: 'command', commands: [{ name: 'command', cmd, args, timeoutMs: command.timeoutMs, env: command.envAdditions,
        parser: await isVitest(command) ? 'vitest' : 'none' }] } },
  }, { signal, processExecutor, testLockMode: 'focused', vitestRoot: command.cwd });
  const error = result.runnerError ?? result.commands?.command?.runnerError;
  const runnerError = error === undefined ? null : { kind: error.kind ?? 'provider-error', message: error.message ?? result.summary ?? 'Provider did not execute the command' };
  let run: CommandRun;
  if (captured.current === null) {
    const output = result.output ?? result.summary;
    if (input.outputFile !== undefined) await writeFile(input.outputFile, output);
    const bytes = Buffer.from(output);
    run = { outcome: signal.aborted ? { kind: 'cancelled' }
      : { kind: 'runner-error', error: runnerError ?? { kind: 'no-execution', message: result.summary ?? 'Provider did not execute the command' } },
      startedAt: new Date().toISOString(), elapsedMs: Math.round((result.durationSeconds ?? 0) * 1000), stdout: output, stderr: '',
      output: { path: input.outputFile ?? null, bytes: bytes.length, truncated: false, tail: bytes.subarray(Math.max(0, bytes.length - 8192)).toString('utf8') } };
  } else run = captured.current;
  return { run, provider: result, passed: result.passed, runnerError };
}

/** Dirty, focused execution without a suite lock or published evidence. */
export async function runFocusedCheck(command: CheckCommand, signal: AbortSignal): Promise<{
  readonly outcome: 'passed' | 'failed' | 'not-verified';
  readonly notVerified: string | null;
  readonly exitCode: number | null;
  readonly elapsedMs: number;
  readonly diagnostics: string;
}> {
  const executed = await dispatchHarnessCommand({ command, signal });
  const result = executed.provider as import('ramify-audit').CheckExecutionResult;
  const run = executed.run;
  const notVerified = executed.runnerError?.kind ?? (run.outcome.kind !== 'completed' ? run.outcome.kind : null);
  const outcome = result.passed ? 'passed' : notVerified === null ? 'failed' : 'not-verified';
  const detail = result.commands?.command ?? result;
  const diagnostics = [
    result.summary,
    ...(detail.counts === undefined ? ['Counts: unknown'] : [`Counts: ${JSON.stringify(detail.counts)}`]),
    ...[...(detail.failedTests ?? []), ...(detail.failedScenarios ?? [])].map(failure => JSON.stringify(failure)),
    ...(detail.runnerError === undefined ? [] : [`Runner error: ${JSON.stringify(detail.runnerError)}`]),
    ...(detail.output === '' ? [] : [detail.output]),
  ].join('\n');
  return { outcome, notVerified, exitCode: run.outcome.kind === 'completed' ? run.outcome.exitCode : null,
    elapsedMs: run.elapsedMs, diagnostics };
}

async function isVitest(command: CheckCommand): Promise<boolean> {
  const executable = command.argv[0] ?? '';
  if ((executable === 'vitest' || executable.endsWith('/vitest')) && command.argv[1] === 'run') return true;
  if (executable !== 'npm' || command.argv[1] !== 'test') return false;
  try {
    const manifest = JSON.parse(await readFile(join(command.cwd, 'package.json'), 'utf8')) as { scripts?: { test?: string } };
    return /(?:^|\s|\/)vitest(?:\s|$)/u.test(manifest.scripts?.test ?? '');
  } catch { return false; }
}
