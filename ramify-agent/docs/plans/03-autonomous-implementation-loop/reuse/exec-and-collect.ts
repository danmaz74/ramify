/*
 * Copied from cucumber-viz 0.7.0, src/core/shared/services/test-process/test-process.ts,
 * lines 124-207 (`execAndCollect` and its types), with the imports it needs.
 * Same author; licensed here under GPL-3.0 with ramify-agent.
 * Reference copy outside the compiler's scope: Plan 3 places and adjusts it.
 * Adjustments the plan requires: tell a timeout from a failure (`killed`, `signal`
 * on Node's error), and write the complete output to a file instead of returning it.
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export interface ExecAndCollectOptions {
  /** Executable to run (or the inner command when `processGroupCleanupScript` is set). */
  command: string;
  /** Arguments for `command`. */
  args: string[];
  /** Working directory for the child process. */
  cwd: string;
  /** Environment for the child process. Pass the fully-resolved env; not merged with `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Abort signal — aborting kills the child and resolves with `cancelled: true`. */
  signal?: AbortSignal;
  /** Hard timeout in milliseconds. Omit for no timeout. */
  timeoutMs?: number;
  /** Maximum bytes buffered from stdout/stderr before the child is killed. Omit for the Node default. */
  maxBuffer?: number;
  /**
   * Optional path to a wrapper script that owns process-group teardown. When
   * provided, the command is invoked as `bash <script> <command> <...args>` so
   * the wrapper can tear down the child's whole process group on abort/timeout.
   * The script path is caller-supplied to keep this helper domain-agnostic.
   */
  processGroupCleanupScript?: string;
}

/** Structured error returned by {@link execAndCollect} when a command fails (non-abort). */
export interface ExecAndCollectError {
  stdout?: string;
  stderr?: string;
  message?: string;
  /** Numeric process exit code, or a string errno (e.g. `ENOENT`) on spawn failure. */
  code?: number | string;
}

/** Result of {@link execAndCollect}: buffered output plus failure/cancellation signals. */
export interface ExecAndCollectResult {
  stdout: string;
  stderr: string;
  /** `null` on success; the structured error otherwise. Always `null` when `cancelled` is `true`. */
  error: ExecAndCollectError | null;
  /** `true` when the run was aborted via `signal`. */
  cancelled: boolean;
}

/**
 * Run a command to completion and collect its buffered output.
 *
 * Generic exec-and-collect variant: command + args, env, abort signal, timeout,
 * maxBuffer, and optional process-group teardown via a caller-supplied wrapper
 * script. Aborting via `signal` resolves with `cancelled: true` (no throw); any
 * other failure resolves with a structured `error` (no throw).
 */
export async function execAndCollect(
  options: ExecAndCollectOptions,
): Promise<ExecAndCollectResult> {
  const { command, args, cwd, env, signal, timeoutMs, maxBuffer, processGroupCleanupScript } = options;

  const spawnCommand = processGroupCleanupScript ? 'bash' : command;
  const spawnArgs = processGroupCleanupScript
    ? [processGroupCleanupScript, command, ...args]
    : args;

  try {
    const { stdout, stderr } = await execFile(spawnCommand, spawnArgs, {
      cwd,
      env,
      signal,
      ...(timeoutMs != null ? { timeout: timeoutMs } : {}),
      ...(maxBuffer != null ? { maxBuffer } : {}),
    });
    return { stdout, stderr, error: null, cancelled: false };
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') {
      return { stdout: '', stderr: '', error: null, cancelled: true };
    }

    const error = err as ExecAndCollectError;
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      error,
      cancelled: false,
    };
  }
}
