import { createRequire, syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { expect } from 'vitest';

/** A refused external process launch. Arguments are detached immutable values. */
export interface SpawnAttempt { readonly api: string; readonly argv: readonly string[] }
export class ProcessSpawnGuardError extends Error {
  constructor(readonly attempt: SpawnAttempt) {
    super(`Ordinary test process guard refused ${attempt.api}: ${attempt.argv.join(' ')}`);
    this.name = 'ProcessSpawnGuardError';
  }
}
const apis = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const;
export type ChildProcess = typeof import('node:child_process');
type Launch = (...args: unknown[]) => unknown;
/** Independent recorder for guard controls; it cannot change automatic enforcement. */
export interface ProcessGuardRecorder {
  readonly childProcess: ChildProcess;
  attempts(): readonly SpawnAttempt[];
}
function attemptOf(api: string, args: readonly unknown[]): SpawnAttempt {
  return Object.freeze({ api, argv: Object.freeze([String(args[0]), ...(Array.isArray(args[1]) ? args[1].map(String) : [])]) });
}
function snapshot(attempts: readonly SpawnAttempt[]): readonly SpawnAttempt[] {
  return Object.freeze(attempts.map(attempt => Object.freeze({ ...attempt, argv: Object.freeze([...attempt.argv]) })));
}
function refuse(attempts: SpawnAttempt[], api: string, args: readonly unknown[]): never {
  const attempt = attemptOf(api, args);
  attempts.push(attempt);
  throw new ProcessSpawnGuardError(attempt);
}
export function createProcessGuard(actual: ChildProcess): ProcessGuardRecorder {
  const attempts: SpawnAttempt[] = [];
  const childProcess = { ...actual } as unknown as Record<string | symbol, unknown>;
  for (const api of apis) childProcess[api] = (...args: unknown[]) => refuse(attempts, api, args);
  childProcess.default = childProcess;
  return { childProcess: childProcess as unknown as ChildProcess, attempts: () => snapshot(attempts) };
}
interface Enforcement {
  begin(): void;
  attempts(): readonly SpawnAttempt[];
  verify(): void;
  invoke(api: typeof apis[number], args: unknown[], asynchronous?: boolean): unknown;
}
// The native builtin survives Vitest's module resets and worker reuse. Its wrapper
// owns this frozen state; begin derives permission from runner context only.
// Descendant-facing helpers expose neither transition nor reset operations.
const stateKey = Symbol.for('ramify-agent.ordinary-test-process-enforcement');
const builtin = createRequire(import.meta.url)('node:child_process') as ChildProcess & { [stateKey]?: Enforcement };
function state(): Enforcement | undefined { return builtin[stateKey]; }
export function installProcessGuard(): void {
  if (!state()) {
    const originals = Object.fromEntries(apis.map(api => [api, builtin[api]])) as Record<typeof apis[number], Launch>;
    let activeFile = '';
    let native = false;
    let finalized = false;
    let startedAt = '';
    let registrySha256 = '';
    const initialCwd = process.cwd();
    const guardSha256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
    let attempts: SpawnAttempt[] = [];
    let allowed: SpawnAttempt[] = [];
    const enforcement: Enforcement = {
      begin() {
        const file = expect.getState().testPath!;
        if (file === activeFile) return;
        const registryBytes = readFileSync(resolve(initialCwd, 'src/tests/test-boundaries.json'));
        const manifest = JSON.parse(registryBytes.toString('utf8')) as { boundaries: Array<{ file: string }> };
        const boundary = manifest.boundaries.some(entry => entry.file === relative(initialCwd, file).split('\\').join('/'));
        if (attempts.length && !finalized) enforcement.verify();
        activeFile = file; native = boundary; attempts = []; allowed = []; finalized = false;
        startedAt = new Date().toISOString(); registrySha256 = createHash('sha256').update(registryBytes).digest('hex');
      },
      attempts: () => snapshot(attempts),
      verify() {
        finalized = true;
        const directory = resolve(initialCwd, 'node_modules/.cache/ramify-agent-test-processes', createHash('sha256').update(initialCwd).digest('hex'));
        mkdirSync(directory, { recursive: true });
        writeFileSync(resolve(directory, `${randomUUID()}.json`), JSON.stringify({ file: activeFile, projectRoot: initialCwd, native, pid: process.pid, startedAt, finishedAt: new Date().toISOString(), guardSha256, registrySha256, allowed: snapshot(allowed), refused: snapshot(attempts) }) + '\n');
        if (attempts.length) throw new Error(`Ordinary test attempted external processes in ${activeFile}:\n${attempts.map(a => `${a.api} ${a.argv.join(' ')}`).join('\n')}`);
      },
      invoke(api, args, asynchronous = false) {
        if (!native) return refuse(attempts, api, args);
        allowed.push(attemptOf(api, args));
        return asynchronous ? (promisify(originals[api]) as Launch)(...args) : originals[api](...args);
      },
    };
    Object.freeze(enforcement);
    Object.defineProperty(builtin, stateKey, { value: enforcement });
    for (const api of apis) {
      const wrapper = (...args: unknown[]) => enforcement.invoke(api, args);
      if (api === 'exec' || api === 'execFile') Object.defineProperty(wrapper, promisify.custom, {
        value: async (...args: unknown[]) => enforcement.invoke(api, args, true),
      });
      Object.assign(builtin, { [api]: wrapper });
    }
    syncBuiltinESMExports();
  }
  state()!.begin();
}
export function verifyProcessGuard(): void { state()?.verify(); }
export function spawnAttempts(): readonly SpawnAttempt[] { return state()?.attempts() ?? Object.freeze([]); }
/** Compatibility mock forwards to the installed dynamic native wrapper. */
export function guardedChildProcess(actual: ChildProcess): ChildProcess {
  const guarded = { ...actual } as unknown as Record<string, unknown>;
  for (const api of apis) guarded[api] = (...args: unknown[]) => {
    const enforcement = state();
    if (enforcement) return enforcement.invoke(api, args);
    throw new ProcessSpawnGuardError(attemptOf(api, args));
  };
  guarded.default = guarded;
  return guarded as unknown as ChildProcess;
}
