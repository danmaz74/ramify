import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
export const compiledEntry = join(repositoryRoot, 'dist/src/cli-entry.js');
const preload = fileURLToPath(new URL('./process-probe.mjs', import.meta.url));
export interface TraceEvent {
  readonly pid: number;
  readonly event: string;
  readonly url?: string;
  readonly path?: string;
  readonly argv?: readonly string[];
  readonly args?: readonly string[];
  readonly command?: string;
  readonly child?: number;
  readonly code?: number;
  readonly handles?: number;
  readonly opened?: number;
  readonly closed?: number;
  readonly commonjs?: readonly string[];
  readonly signalListeners?: number;
  readonly stage?: string;
  readonly pending?: number;
}

/** Each process gets a private trace, a deadline and deterministic cleanup. */
export async function cliProcess(cwd: string, argv: readonly string[], options: {
  readonly mode?: 'fail-catalog' | 'interrupt-acquisition' | 'interrupt-catalog' | 'interrupt-publication';
  readonly readTarget?: string;
  readonly brokenStdout?: boolean;
  readonly backpressuredStdout?: 'interrupt' | 'resume';
  readonly entry?: string;
  readonly nodeArgs?: readonly string[];
  readonly executable?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly allowSockets?: boolean;
  readonly timeoutMs?: number;
} = {}) {
  const work = join(repositoryRoot, '.reference-work');
  await mkdir(work, { recursive: true });
  const owned = await mkdtemp(join(work, 'cli-process-'));
  const traceFile = join(owned, 'trace.jsonl');
  const started = performance.now();
  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; pid: number | undefined;
      exitedWhilePaused: boolean; interruptionMs: number | null }>((accept, reject) => {
      const child = spawn(options.executable ?? process.execPath, options.executable ? [...argv]
        : [...options.nodeArgs ?? [], options.entry ?? compiledEntry, ...argv], {
        cwd, env: { ...process.env, ...options.env, NODE_OPTIONS: `${options.env?.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? ''} --import=${preload}`,
          RAMIFY_PROCESS_SOCKETS: options.allowSockets ? 'allow' : 'forbid',
          RAMIFY_CLI_TRACE: traceFile, RAMIFY_CLI_PROBE: options.backpressuredStdout ? 'observe-output' : options.mode ?? '',
          RAMIFY_CLI_READ_TARGET: options.readTarget ?? '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = '', timedOut = false, tooLarge = false, exited = false;
      let exitedWhilePaused = false, interruptedAt: number | null = null, interruptionMs: number | null = null;
      let resumeTimer: NodeJS.Timeout | undefined, probeTimer: NodeJS.Timeout | undefined;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); child.stdout.resume(); }, options.timeoutMs ?? 30_000);
      child.on('error', error => {
        exited = true; clearTimeout(timer); clearTimeout(resumeTimer); clearTimeout(probeTimer); reject(error);
      });
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      if (options.brokenStdout) child.stdout.destroy();
      else child.stdout.on('data', bytes => {
        stdout += String(bytes);
        if (stdout.length > 40 * 1024 ** 2) { tooLarge = true; child.kill('SIGKILL'); }
      });
      if (options.backpressuredStdout) {
        child.stdout.pause();
        const observe = async (): Promise<void> => {
          let trace = '';
          try { trace = await readFile(traceFile, 'utf8'); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { child.kill('SIGKILL'); return; } }
          if (exited) return;
          if (trace.split('\n').some(line => line.includes(`"pid":${child.pid},"event":"stdout-backpressure"`))) {
            if (options.backpressuredStdout === 'interrupt') {
              interruptedAt = performance.now();
              child.kill('SIGINT');
              // A broken implementation gets drained after the deadline so its
              // contradictory complete report is also available to assertions.
              resumeTimer = setTimeout(() => child.stdout.resume(), 2000);
            } else child.stdout.resume();
          } else probeTimer = setTimeout(() => { void observe(); }, 10);
        };
        void observe();
      }
      child.stderr.on('data', bytes => { stderr += String(bytes); });
      child.once('exit', () => {
        exited = true;
        exitedWhilePaused = child.stdout.isPaused();
        if (interruptedAt !== null) interruptionMs = performance.now() - interruptedAt;
        clearTimeout(resumeTimer); clearTimeout(probeTimer);
        child.stdout.resume();
      });
      child.once('close', (code, signal) => {
        clearTimeout(timer); clearTimeout(resumeTimer); clearTimeout(probeTimer);
        if (timedOut || tooLarge) reject(new Error(`CLI ${timedOut ? 'deadline' : 'output limit'} exceeded`));
        else accept({ code, signal, stdout, stderr, pid: child.pid, exitedWhilePaused, interruptionMs });
      });
    });
    const events = (await readFile(traceFile, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as TraceEvent);
    // Native clients may unref their ChildProcess after synchronous close.
    // Verify the actual PID is gone, even if no JS close callback was delivered.
    const childPids = events.filter(event => event.event === 'spawn').map(event => event.child).filter((pid): pid is number => pid !== undefined);
    const live = (): number[] => childPids.filter(pid => {
      try { process.kill(pid, 0); return true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
    });
    const deadline = performance.now() + 5000;
    let survivingChildren = live();
    while (survivingChildren.length && performance.now() < deadline) {
      await new Promise(done => setTimeout(done, 20)); survivingChildren = live();
    }
    return { ...result, events, survivingChildren, durationMs: performance.now() - started };
  } finally {
    // A failed/expired test must also reap the exact descendants it observed.
    // Compiler helpers own detached POSIX groups; native children share them.
    let captured = '';
    try { captured = await readFile(traceFile, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    for (const line of captured.split('\n').filter(Boolean)) {
      let event: TraceEvent;
      try { event = JSON.parse(line) as TraceEvent; } catch { continue; }
      if (event.event !== 'spawn' || event.child === undefined) continue;
      try {
        process.kill(event.child, 0);
        if (event.args?.some(arg => /\/(?:configuration|compiler)-helper\.[jt]s$/.test(arg))) process.kill(-event.child, 'SIGKILL');
        else process.kill(event.child, 'SIGKILL');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    }
    await rm(owned, { recursive: true, force: true });
  }
}

/** Trace any entry using the same bounded capture and descendant cleanup as CLI tests.
 * The caller owns its endpoint directory and removes it after the process exits. */
export function tracedProcess(entry: string, argv: readonly string[], options: {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv & { readonly RAMIFY_ENDPOINT_DIR: string };
  readonly timeoutMs?: number;
}) {
  return cliProcess(options.cwd, argv, { entry, env: options.env, allowSockets: true, timeoutMs: options.timeoutMs });
}
