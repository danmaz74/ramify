import { execFile as execFileCb } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Running one of the target project's own commands.
 *
 * `execAndCollect` is copied from cucumber-viz 0.7.0,
 * src/core/shared/services/test-process/test-process.ts lines 124-207, and
 * `childEnvironment` began as `cleanEnvironment` from
 * src/domain-sub-apps/implementation-studio/core/runtime/check-execution/check-runner.ts
 * lines 92-100. Same author; licensed here under GPL-3.0 with ramify-agent.
 * The wrapper script beside this file is adapted for a durable start barrier. Plan 3 iteration 2 adjusts
 * the executor: a timeout is told from a failure with Node's `killed`, the
 * complete output is written to a file and answered as a bounded description,
 * a spawn failure's string `code` becomes a structured runner error, and the
 * wrapper script is resolved from this module's own directory. The lifted
 * builder passed on every variable of this process; `childEnvironment` builds
 * from an allowlist instead, and the source it came from does not.
 *
 * `runCommand` never throws. Every way a command can end is one of four
 * outcomes, and none of them is read from what the command printed.
 */

/**
 * The wrapper that owns process-group teardown, resolved from this module's
 * own directory. Every command runs as `bash <wrapper> <command> <args...>`,
 * so a descendant that outlives its parent is killed with the group.
 */
export const processGroupCleanupScript = fileURLToPath(new URL('./run-command-with-cleanup.sh', import.meta.url));

/** Kernel identity of a live process-group leader, when Linux exposes one. */
export async function processGroupIdentity(pid: number): Promise<string | null> {
  try {
    const [stat, boot] = await Promise.all([
      readFile(`/proc/${pid}/stat`, 'utf8'),
      readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    ]);
    const close = stat.lastIndexOf(')');
    if (close < 0) return null;
    // /proc stat fields after the closing parenthesis begin at field 3;
    // field 22 is the kernel start tick and is not affected by the command.
    const start = stat.slice(close + 2).trim().split(/\s+/u)[19];
    if (start === undefined || !/^\d+$/u.test(start)) return null;
    return `${boot.trim()}:${start}`;
  } catch { return null; }
}

/** The bound on the tail a caller receives, in bytes. The complete output is the file. */
export const outputTailBytes = 8 * 1024;

/**
 * The bound on what one command may print before it is killed, in bytes. A
 * complete Ramify check prints its whole JSON report, which passes 25 MB on a
 * project of about 450 source files.
 */
export const outputCapBytes = 128 * 1024 * 1024;

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
  /** Time spent waiting for the shared suite lock, when this command waited. */
  readonly lockWaitMs?: number;
  /** Actual child environment names, when a wrapper added variables at spawn time. */
  readonly receivedEnvironment?: readonly string[];
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
  /** Persist the detached process group before the wrapper may start the command. */
  readonly registerProcessGroup?: ((pid: number, identity: string | null) => Promise<void>) | undefined;
}

/*
 * The allowlist: the one definition of what a child process inherits from
 * this one.
 *
 * The harness runs under whatever a person's session holds — an agent
 * session token, a provider API key, a credential helper's socket — and none
 * of that is a Node toolchain's business. So a child receives the variables
 * named here and nothing else. A variable a command genuinely needs is added
 * here, in this one place, or passed as an addition by the caller that knows
 * about it.
 *
 * This applies to the engineer's `shell` tool as well, and deliberately: that
 * tool runs a command the agent wrote, so a broader environment for it would
 * hand an arbitrary command every secret of the session. Whether a project
 * whose own tooling needs more than this gets a wider environment for
 * `shell` alone is Dan's decision and is not taken here; until it is taken,
 * `shell` uses this allowlist like every other child.
 */

/** Variables a child inherits by name. */
const allowedNames = new Set([
  // The toolchain itself: where to find executables, where a home-directory
  // configuration such as `.npmrc` lives, and who the process is.
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  // Terminal, locale and time, which change what a command prints.
  'TERM',
  'TZ',
  'LANG',
  // Where a command may write a temporary file.
  'TMPDIR',
  'TEMP',
  'TMP',
  // Present in an automated environment, and read by tools that suppress
  // interactive prompts and progress output.
  'CI',
  // Git reads its configuration from the files these name. A test points
  // them at `/dev/null` so that no person's identity or configuration is in
  // reach of the git the harness runs, which only works if a child inherits
  // them. They name paths, never credentials.
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_NOSYSTEM',
  'RAMIFY_AUDIT_TEST_LOCK_HELD',
]);

/** Variable name prefixes a child inherits whole. */
const allowedPrefixes = ['LC_', 'NODE_', 'npm_config_'];

/**
 * Withheld although the prefixes above admit it: `NODE_OPTIONS`'s flags
 * (`--import tsx` from a test harness, for instance) would otherwise reach a
 * child that has no such package installed.
 */
const withheldNames = new Set(['NODE_OPTIONS']);

/** Whether a child inherits the variable of this name. */
function inherited(name: string): boolean {
  if (withheldNames.has(name)) return false;
  return allowedNames.has(name) || allowedPrefixes.some(prefix => name.startsWith(prefix));
}

/**
 * Build the environment for a child process: the allowlisted variables of
 * this process, plus the caller's own additions, which are the harness's own
 * settings and never something it inherited.
 *
 * This is the only builder of a child environment in the harness. What it
 * returns is complete, so no caller merges `process.env` again.
 */
export function childEnvironment(additions: Readonly<Record<string, string>> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined || !inherited(name)) continue;
    env[name] = value;
  }
  return { ...env, ...additions };
}

/**
 * The names of the variables in one environment, sorted. This is what a
 * record holds of an environment: a value of it is never recorded, because a
 * record is read, projected and committed, and a secret in one is a secret
 * everywhere it goes.
 */
export function environmentNames(env: Readonly<Record<string, string | undefined>>): string[] {
  return Object.keys(env).sort();
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
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = execFileCb('bash', [processGroupCleanupScript, command, ...args], {
        cwd: request.cwd,
        env: request.env,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        timeout: request.timeoutMs,
        maxBuffer,
        encoding: 'utf8',
      }, (error, stdout, stderr) => {
        const clean = stderr.replace(/^RAMIFY_GROUP:\d+\r?\n/u, '');
        if (error === null) resolve({ stdout, stderr: clean });
        else reject(Object.assign(error, { stdout, stderr: clean }));
      });
      // The wrapper reports its child's group ID before the child's stdin
      // barrier opens. A crash before registration sends EOF, so the requested
      // command cannot start without the durable process registration.
      let control = '';
      let answered = false;
      child.stderr?.on('data', (part: string | Buffer) => {
        if (answered) return;
        control += part.toString();
        const newline = control.indexOf('\n');
        if (newline < 0) return;
        answered = true;
        const matched = /^RAMIFY_GROUP:(\d+)\r?$/u.exec(control.slice(0, newline));
        if (matched === null) { child.stdin?.destroy(); reject(new Error('Command wrapper did not report its group')); return; }
        const pid = Number(matched[1]);
        void (pid === 0 ? Promise.resolve() : processGroupIdentity(pid).then(identity =>
          request.registerProcessGroup?.(pid, identity) ?? Promise.resolve())).then(() => {
          if (request.signal?.aborted) child.stdin?.destroy();
          else child.stdin?.end('start\n');
        }, error => { child.stdin?.destroy(); reject(error); });
      });
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

/** External command boundary; lifecycle tests supply scripted outcomes. */
export type CommandRunner = typeof runCommand;
