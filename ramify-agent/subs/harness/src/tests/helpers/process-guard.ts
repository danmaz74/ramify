/*
 * The negative control for a scenario that claims to need no external tool.
 *
 * A test file installs this over `node:child_process`. Every call that would
 * start a process is recorded and then refused, so a boundary the fakes miss
 * fails loudly and names itself instead of quietly paying for a subprocess.
 * The guard counts attempts rather than successes: the count a converted
 * scenario asserts is the number of processes it would have started.
 */

/** One refused attempt to start a process. */
export interface SpawnAttempt {
  /** The `node:child_process` export that was called. */
  readonly api: string;
  /** The command and its arguments, as far as the call named them. */
  readonly argv: readonly string[];
}

const attempts: SpawnAttempt[] = [];

/** Every attempt refused since the last reset, in order. */
export function spawnAttempts(): readonly SpawnAttempt[] {
  return attempts;
}

export function resetSpawnAttempts(): void {
  attempts.length = 0;
}

/** What a guarded `node:child_process` throws. */
export class ProcessSpawnGuardError extends Error {
  constructor(readonly attempt: SpawnAttempt) {
    super(`This test starts no process: \`${attempt.api}\` was called with \`${attempt.argv.join(' ')}\``);
    this.name = 'ProcessSpawnGuardError';
  }
}

/** The `node:child_process` exports that start a process. */
const spawning = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const;

/**
 * The module a `vi.mock('node:child_process')` factory returns: the real
 * module with every process-starting export replaced by a refusal.
 */
export function guardedChildProcess(actual: typeof import('node:child_process')): typeof import('node:child_process') {
  const guarded: Record<string, unknown> = { ...actual };
  for (const api of spawning) {
    guarded[api] = (...args: unknown[]) => {
      const attempt: SpawnAttempt = { api, argv: argvOf(args) };
      attempts.push(attempt);
      throw new ProcessSpawnGuardError(attempt);
    };
  }
  guarded['default'] = guarded;
  return guarded as typeof import('node:child_process');
}

/** The command of a call, from whichever of the two argument shapes it used. */
function argvOf(args: readonly unknown[]): string[] {
  const command = typeof args[0] === 'string' ? args[0] : String(args[0]);
  const rest = Array.isArray(args[1]) ? args[1].map(String) : [];
  return [command, ...rest];
}
