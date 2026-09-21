import { execFile as execFileCb } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/*
 * Running one of the target project's own commands.
 *
 * `execAndCollect` is copied from cucumber-viz 0.7.0,
 * src/core/shared/services/test-process/test-process.ts lines 124-207, and
 * `cleanEnvironment` from
 * src/domain-sub-apps/implementation-studio/core/runtime/check-execution/check-runner.ts
 * lines 92-100. Same author; licensed here under GPL-3.0 with ramify-agent.
 * The wrapper script beside this file is verbatim. Plan 3 iteration 2 adjusts
 * the executor: a timeout is told from a failure with Node's `killed`, the
 * complete output is written to a file and answered as a bounded description,
 * a spawn failure's string `code` becomes a structured runner error, and the
 * wrapper script is resolved from this module's own directory.
 *
 * `runCommand` never throws. Every way a command can end is one of four
 * outcomes, and none of them is read from what the command printed.
 */

const execFile = promisify(execFileCb);

/**
 * The wrapper that owns process-group teardown, resolved from this module's
 * own directory. Every command runs as `bash <wrapper> <command> <args...>`,
 * so a descendant that outlives its parent is killed with the group.
 */
export const processGroupCleanupScript = fileURLToPath(new URL('./run-command-with-cleanup.sh', import.meta.url));

/** The bound on the tail a caller receives, in bytes. The complete output is the file. */
export const outputTailBytes = 8 * 1024;

/** The bound on what one command may print before it is killed, in bytes. */
export const outputCapBytes = 16 * 1024 * 1024;

/**
 * How a command ended. `completed` is the only outcome with an exit code, and
 * it says nothing about success: the caller reads the code. A command killed
 * by a signal that the harness did not send is a `runner-error` naming that
 * signal, since it has no exit code to report.
 */
export type CommandOutcome =
  | { readonly kind: 'completed'; readonly exitCode: number }
  | { readonly kind: 'timed-out'; readonly timeoutMs: number }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'runner-error'; readonly error: { readonly kind: string; readonly message: string } };

/**
 * Where the command's complete output is and what the end of it says. The
 * file holds the standard output followed by the standard error, which is how
 * the executor collects them. `truncated` means the output cap was reached and
 * the file is incomplete.
 */
export interface CommandOutput {
  /** The file holding the complete output, or null when the caller asked for no file. */
  readonly path: string | null;
  readonly bytes: number;
  readonly truncated: boolean;
  /** The last {@link outputTailBytes} bytes of that output. */
  readonly tail: string;
}

/** One run of one command: how it ended, when, for how long, and what it said. */
export interface CommandRun {
  readonly outcome: CommandOutcome;
  /** ISO 8601, taken when the command was spawned. */
  readonly startedAt: string;
  readonly elapsedMs: number;
  readonly output: CommandOutput;
  /** What the command wrote to standard output, up to the output cap. */
  readonly stdout: string;
  /** What the command wrote to standard error, up to the output cap. */
  readonly stderr: string;
}

/** One command to run. `env` is complete: nothing of this process is passed on. */
export interface CommandRequest {
  /** The executable and its arguments. An empty vector is a runner error. */
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  /** Where to write the complete output. Omit for a command whose answer is its stdout. */
  readonly outputFile?: string | undefined;
  readonly signal?: AbortSignal | undefined;
  /** The output cap; the command is killed when it is reached. */
  readonly maxBytes?: number | undefined;
}

/**
 * Build a clean environment for a child process: every variable of this
 * process except `NODE_OPTIONS`, whose flags (`--import tsx` from a test
 * harness, for instance) would otherwise reach a child that has no such
 * package installed, plus the caller's own additions.
 *
 * This is the only builder of a child environment in the harness. What it
 * returns is complete, so no caller merges `process.env` again.
 */
export function cleanEnvironment(additions: Readonly<Record<string, string>> = {}): Record<string, string> {
  const { NODE_OPTIONS: _stripped, ...inherited } = process.env;
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(inherited)) if (value !== undefined) env[name] = value;
  return { ...env, ...additions };
}

/**
 * Run one command to completion, in its own process group and with the given
 * environment, and describe how it ended.
 *
 * It never throws and never classifies a failure from what the command
 * printed: a timeout is Node's `killed`, a spawn failure is Node's string
 * `code`, a cancellation is the caller's signal, and everything else is the
 * exit code the command itself chose.
 */
export async function runCommand(request: CommandRequest): Promise<CommandRun> {
  const [command, ...args] = request.argv;
  const startedAt = new Date().toISOString();
  const startedHr = Date.now();
  if (command === undefined) {
    return finish(request, startedAt, startedHr, '', '', {
      kind: 'runner-error',
      error: { kind: 'EMPTY_ARGV', message: 'A command must name an executable' },
    }, false);
  }

  const maxBuffer = request.maxBytes ?? outputCapBytes;
  try {
    const { stdout, stderr } = await execFile('bash', [processGroupCleanupScript, command, ...args], {
      cwd: request.cwd,
      env: request.env,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      timeout: request.timeoutMs,
      maxBuffer,
      encoding: 'utf8',
    });
    return finish(request, startedAt, startedHr, stdout, stderr, { kind: 'completed', exitCode: 0 }, false);
  } catch (caught: unknown) {
    const error = caught as { name?: string; code?: number | string; killed?: boolean; signal?: string | null; message?: string; stdout?: string; stderr?: string };
    const stdout = error.stdout ?? '';
    const stderr = error.stderr ?? '';
    const message = error.message ?? String(caught);
    if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
      return finish(request, startedAt, startedHr, stdout, stderr, { kind: 'cancelled' }, false);
    }
    if (error.killed === true) {
      return finish(request, startedAt, startedHr, stdout, stderr, { kind: 'timed-out', timeoutMs: request.timeoutMs }, false);
    }
    if (typeof error.code === 'string') {
      const truncated = error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
      return finish(request, startedAt, startedHr, stdout, stderr, { kind: 'runner-error', error: { kind: error.code, message } }, truncated);
    }
    if (typeof error.code === 'number') {
      return finish(request, startedAt, startedHr, stdout, stderr, { kind: 'completed', exitCode: error.code }, false);
    }
    const kind = typeof error.signal === 'string' && error.signal !== '' ? error.signal : 'UNKNOWN';
    return finish(request, startedAt, startedHr, stdout, stderr, { kind: 'runner-error', error: { kind, message } }, false);
  }
}

async function finish(
  request: CommandRequest,
  startedAt: string,
  startedHr: number,
  stdout: string,
  stderr: string,
  outcome: CommandOutcome,
  truncated: boolean,
): Promise<CommandRun> {
  const complete = `${stdout}${stderr}`;
  const buffer = Buffer.from(complete, 'utf8');
  if (request.outputFile !== undefined) {
    await mkdir(dirname(request.outputFile), { recursive: true });
    await writeFile(request.outputFile, buffer);
  }
  return {
    outcome,
    startedAt,
    elapsedMs: Date.now() - startedHr,
    output: {
      path: request.outputFile ?? null,
      bytes: buffer.byteLength,
      truncated,
      tail: buffer.subarray(Math.max(0, buffer.byteLength - outputTailBytes)).toString('utf8'),
    },
    stdout,
    stderr,
  };
}
