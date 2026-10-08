import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dispatchCheck, type ProcessExecutorPort } from 'ramify-audit';
import { childEnvironment, runCommand } from '../../evidence/src/run-command.js';
import type { CommandRun, CommandRunner } from '../../evidence/src/run-command.js';
import type { CheckCommand } from '../../../src/checks/records.js';

/**
 * One command of a standalone session's in-place diagnosis, dispatched by the
 * provider over the current bytes with the harness's process runner. The
 * diagnosis runs the policy's type-check and Ramify check; it parses no test
 * runner's report and makes no commit.
 */
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
      const run = await (input.runner ?? runCommand)({
        argv: [invocation.command, ...invocation.args],
        cwd: invocation.workingDirectory,
        env: childEnvironment(command.envAdditions),
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
  if (cmd === undefined) throw new Error('No diagnostic command was configured');
  const result = await dispatchCheck({
    requestId: randomUUID(), runId: 'diagnostic', sourceCommit: 'dirty-working-tree', workingDirectory: command.cwd,
    check: { id: input.checkId ?? 'diagnostic', name: 'Diagnostic', description: 'Current working-tree diagnostic', scope: 'both', category: 'deterministic', onFailure: 'record',
      executor: { kind: 'command', commands: [{ name: 'command', cmd, args, timeoutMs: command.timeoutMs, env: command.envAdditions,
        parser: 'none' }] } },
  }, { signal, processExecutor, testLockMode: 'focused' });
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
