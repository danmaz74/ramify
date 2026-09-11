import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TraceEvent } from './process.js';

const preload = fileURLToPath(new URL('./process-probe.mjs', import.meta.url));
const captureLimit = 40 * 1024 ** 2;
const cleanupMs = 5000;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) throw new Error(`Invalid child pid: ${pid}`);
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

/** An observation deadline, not a configurable relaxation of a product budget. */
export async function waitForProcessCondition(label: string, timeoutMs: number,
  condition: () => boolean | Promise<boolean>): Promise<void> {
  const until = performance.now() + timeoutMs;
  do {
    if (await condition()) return;
    await delay(20);
  } while (performance.now() < until);
  throw new Error(`${label}: exceeded ${timeoutMs} ms`);
}

export interface ProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
}

export interface LiveProcess {
  readonly pid: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly exit: ProcessExit | null;
  signal(signal: 'SIGSTOP' | 'SIGCONT' | 'SIGINT' | 'SIGKILL'): void;
  send(text: string): Promise<void>;
  waitForOutput(text: string, timeoutMs: number): Promise<void>;
  waitForExit(timeoutMs: number): Promise<ProcessExit>;
}

export interface ProcessScope {
  /** Short, private, mode-0700 directory; all launched descendants inherit it. */
  readonly endpointDirectory: string;
  /** Start Node entries, or the installed executable via executable/args. */
  start(options: { readonly cwd: string; readonly executable?: string;
    readonly args: readonly string[]; readonly timeoutMs: number }): LiveProcess;
  events(): Promise<readonly TraceEvent[]>;
}

/** Owns several concurrently running traced clients/daemons and their descendants.
 * Successful callbacks must finish their processes. On every path, teardown kills
 * leftovers and checks liveness before removing the endpoint and trace directory.
 * Killing a leftover does not turn a successful callback with a leak into a pass.
 */
export async function withProcessScope<T>(run: (scope: ProcessScope) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'rl-'));
  const trace = join(directory, 'trace.jsonl');
  const processes: LiveProcess[] = [];
  const failures: Error[] = [];
  const timers: NodeJS.Timeout[] = [];
  const observedPids = new Set<number>();
  const parents = new Map<number, number>();
  let accepting = true;
  const events = async (): Promise<readonly TraceEvent[]> => {
    if ((await stat(trace)).size > captureLimit) throw new Error('Process trace exceeded 40 MiB');
    const text = await readFile(trace, 'utf8');
    // A live writer may be between writes. Complete malformed lines still fail.
    const records: TraceEvent[] = [];
    let malformed = false;
    for (const line of text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(Boolean)) {
      try {
        const event = JSON.parse(line) as TraceEvent;
        records.push(event);
        if (event.event === 'spawn' && event.child !== undefined) {
          observedPids.add(event.child); parents.set(event.child, event.pid);
        }
        if (event.event === 'start') observedPids.add(event.pid);
      } catch { malformed = true; }
    }
    // Preserve later valid descendant identities even when the evidence is bad.
    if (malformed) throw new Error('Malformed process trace; evidence is incomplete');
    return records;
  };
  const kill = (pid: number): void => {
    try { if (processAlive(pid)) process.kill(pid, 'SIGKILL'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  const killGroup = (pid: number): void => {
    try { process.kill(-pid, 'SIGKILL'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  let result: T | undefined;
  let failed = false;
  let originalError: unknown;
  try {
    await writeFile(trace, '', { flag: 'wx' });
    result = await run({ endpointDirectory: directory, events, start(options) {
      if (!accepting) throw new Error('Process scope is closed');
      const started = performance.now();
      const child = spawn(options.executable ?? process.execPath, [...options.args], {
        cwd: options.cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_OPTIONS: `--import=${preload}`,
          RAMIFY_ENDPOINT_DIR: directory, RAMIFY_CLI_TRACE: trace,
          RAMIFY_PROCESS_SOCKETS: 'allow', RAMIFY_CLI_PROBE: '', RAMIFY_CLI_READ_TARGET: '',
          NO_COLOR: '1', FORCE_COLOR: '0' },
      });
      let stdout = '', stderr = '', bytes = 0, exit: ProcessExit | null = null;
      let fault: Error | undefined;
      const fail = (error: Error): void => {
        if (!fault) { fault = error; failures.push(error); }
        if (child.pid) kill(child.pid);
      };
      const timer = setTimeout(() => fail(new Error(`Process ${child.pid} exceeded ${options.timeoutMs} ms`)), options.timeoutMs);
      timers.push(timer);
      child.once('error', error => { clearTimeout(timer); fail(error); });
      child.stdin.on('error', error => {
        if ((error as NodeJS.ErrnoException).code !== 'EPIPE') fail(error);
      });
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      const collect = (target: 'stdout' | 'stderr') => (text: string): void => {
        bytes += Buffer.byteLength(text);
        if (bytes > captureLimit) { fail(new Error(`Process ${child.pid} output exceeded 40 MiB`)); return; }
        if (target === 'stdout') stdout += text; else stderr += text;
      };
      child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        exit = { code, signal, durationMs: performance.now() - started };
      });
      const live: LiveProcess = {
        get pid() { if (!child.pid) throw fault ?? new Error('Child did not start'); return child.pid; },
        get stdout() { return stdout; }, get stderr() { return stderr; }, get exit() { return exit; },
        signal(signal) {
          if (exit || !child.kill(signal)) throw new Error(`Cannot deliver ${signal}: process has exited`);
        },
        send(text) {
          return new Promise<void>((resolve, reject) => {
            if (exit || fault) { reject(fault ?? new Error('Cannot write to exited process')); return; }
            child.stdin.write(text, error => error ? reject(error) : resolve());
          });
        },
        async waitForOutput(text, timeoutMs) {
          await waitForProcessCondition(`Process output ${JSON.stringify(text)}`, timeoutMs, () => {
            if (fault) throw fault;
            if (stdout.includes(text)) return true;
            if (exit) throw new Error(`Process exited before ${JSON.stringify(text)}: ${stderr}`);
            return false;
          });
        },
        async waitForExit(timeoutMs) {
          await waitForProcessCondition('Process exit', timeoutMs, () => exit !== null);
          if (fault) throw fault;
          return exit!;
        },
      };
      // A failed spawn has no pid, but its error/close handlers still bound its lifetime.
      if (child.pid) { processes.push(live); observedPids.add(child.pid); }
      return live;
    } });
  } catch (error) { failed = true; originalError = error; }
  finally {
    accepting = false;
    const cleanupErrors: unknown[] = [];
    try {
      const rootPids = processes.map(child => child.pid);
      let captured: readonly TraceEvent[] = [];
      try { captured = await events(); } catch (error) { cleanupErrors.push(error); }
      const living = () => [...observedPids].filter(processAlive);
      const leaked = living();
      if (!failed && leaked.length) failures.push(new Error(`Process scope leaked pids: ${leaked.join(', ')}`));
      if (captured.some(event => event.event === 'other-launch')) {
        failures.push(new Error('Untracked alternate process launch; cleanup evidence is incomplete'));
      }
      // Reap descendants while their parents can still collect their exit status.
      // Resuming suspended clients here is teardown only, after observations end.
      for (const pid of leaked) {
        try { process.kill(pid, 'SIGCONT'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
      }
      // Re-read the trace: recovery can spawn a replacement as teardown resumes a client.
      await waitForProcessCondition('Process scope cleanup', cleanupMs, async () => {
        try { await events(); }
        catch (error) { if (cleanupErrors.length === 0) cleanupErrors.push(error); }
        const remaining = living();
        // Stop leaves first and observe their reaping before stopping parents.
        // A fixed sleep followed by killing every parent can strand zombies.
        for (const pid of remaining.filter(parent => !remaining.some(child => parents.get(child) === parent))) {
          if (rootPids.includes(pid)) killGroup(pid);
          kill(pid);
        }
        return remaining.length === 0 && processes.every(child => child.exit !== null);
      });
    } catch (error) {
      cleanupErrors.push(error);
      // Even bad evidence must not leave a known root running.
      for (const child of processes) {
        try { killGroup(child.pid); kill(child.pid); }
        catch (cause) { cleanupErrors.push(cause); }
      }
      for (const pid of observedPids) { try { kill(pid); } catch (cause) { cleanupErrors.push(cause); } }
      try {
        await waitForProcessCondition('Process scope emergency cleanup', cleanupMs,
          () => [...observedPids].every(pid => !processAlive(pid)) && processes.every(child => child.exit !== null));
      } catch (cause) { cleanupErrors.push(cause); }
    } finally {
      timers.forEach(clearTimeout);
      try { await rm(directory, { recursive: true, force: true }); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (failed && failures.length === 0 && cleanupErrors.length === 0) throw originalError;
    const errors = [...(failed ? [originalError] : []), ...failures, ...cleanupErrors];
    if (errors.length) throw new AggregateError(errors, 'Traced process scope failed', { cause: originalError });
  }
  return result!;
}
