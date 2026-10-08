import { promisify } from 'node:util';
import { guardedChildProcess as rootGuarded, spawnAttempts as rootAttempts, type SpawnAttempt } from '../../../../../src/tests/helpers/process-guard.js';
export { ProcessSpawnGuardError } from '../../../../../src/tests/helpers/process-guard.js';
export type { SpawnAttempt } from '../../../../../src/tests/helpers/process-guard.js';
const attempts: SpawnAttempt[] = [];
/** Local refused observations; automatic enforcement is independently persistent. */
export function spawnAttempts(): readonly SpawnAttempt[] {
  return Object.freeze(attempts.map(attempt => Object.freeze({ ...attempt, argv: Object.freeze([...attempt.argv]) })));
}
export function resetSpawnAttempts(): void { attempts.length = 0; }
export function guardedChildProcess(actual: typeof import('node:child_process')): typeof import('node:child_process') {
  const root = rootGuarded(actual);
  const guarded = { ...root } as unknown as Record<string, unknown>;
  for (const api of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) {
    const recordRefusal = (previous: number, args: unknown[]) => {
      if (rootAttempts().length > previous) attempts.push(Object.freeze({ api, argv: Object.freeze([String(args[0]), ...(Array.isArray(args[1]) ? args[1].map(String) : [])]) }));
    };
    const wrapper = (...args: unknown[]) => {
      const previous = rootAttempts().length;
      try { return (root[api] as (...input: unknown[]) => unknown)(...args); }
      catch (error) { recordRefusal(previous, args); throw error; }
    };
    if (api === 'exec' || api === 'execFile') Object.defineProperty(wrapper, promisify.custom, {
      value: async (...args: unknown[]) => {
        const previous = rootAttempts().length;
        try { return await (promisify(root[api]) as (...input: unknown[]) => Promise<unknown>)(...args); }
        catch (error) { recordRefusal(previous, args); throw error; }
      },
    });
    guarded[api] = wrapper;
  }
  guarded.default = guarded;
  return guarded as unknown as typeof import('node:child_process');
}
