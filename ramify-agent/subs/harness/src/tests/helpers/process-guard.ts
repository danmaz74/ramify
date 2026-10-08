import { guardedChildProcess as rootGuarded, type SpawnAttempt } from '../../../../../src/tests/helpers/process-guard.js';
export { ProcessSpawnGuardError } from '../../../../../src/tests/helpers/process-guard.js';
export type { SpawnAttempt } from '../../../../../src/tests/helpers/process-guard.js';
const attempts: SpawnAttempt[] = [];
/** Local compatibility observations; automatic enforcement is independently persistent. */
export function spawnAttempts(): readonly SpawnAttempt[] {
  return Object.freeze(attempts.map(attempt => Object.freeze({ ...attempt, argv: Object.freeze([...attempt.argv]) })));
}
export function resetSpawnAttempts(): void { attempts.length = 0; }
export function guardedChildProcess(actual: typeof import('node:child_process')): typeof import('node:child_process') {
  const root = rootGuarded(actual);
  const guarded = { ...root } as unknown as Record<string, unknown>;
  for (const api of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) {
    guarded[api] = (...args: unknown[]) => {
      attempts.push(Object.freeze({ api, argv: Object.freeze([String(args[0]), ...(Array.isArray(args[1]) ? args[1].map(String) : [])]) }));
      return (root[api] as (...input: unknown[]) => unknown)(...args);
    };
  }
  guarded.default = guarded;
  return guarded as unknown as typeof import('node:child_process');
}
