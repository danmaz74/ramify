import type { ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';
import { channel } from 'node:diagnostics_channel';
import { readFile } from 'node:fs/promises';

/** Node's per-isolate child channel keeps supervision within this worker.
 * No compiler-private objects or evidence exports are needed by analysis. */
export function trackSessionChildren(notify: (pid: number, active: boolean) => void) {
  const children = new Map<number, ChildProcess>();
  const created = (message: unknown): void => {
    const child = (message as { process: ChildProcess }).process;
    const remember = (): void => {
      if (child.pid && child.exitCode === null && child.signalCode === null && !children.has(child.pid)) {
        children.set(child.pid, child); notify(child.pid, true);
      }
    };
    // The creation channel precedes pid assignment. A microtask observes it
    // before the adapter's async factory hands the compiler to extraction.
    queueMicrotask(remember);
    child.once('spawn', remember);
    child.once('exit', () => {
      if (child.pid && children.delete(child.pid)) notify(child.pid, false);
    });
  };
  const events = channel('child_process');
  events.subscribe(created);
  return {
    pids: () => [...children.keys()],
    async release(timeoutMs: number): Promise<void> {
      // Keep this isolate alive until libuv has reaped its children. Terminating
      // the thread earlier would lose their process handles in the host.
      for (const child of children.values()) child.kill('SIGKILL');
      const until = Date.now() + timeoutMs;
      while (children.size) {
        if (Date.now() >= until) throw new Error('Session child did not close before worker disposal');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    },
    dispose: () => { events.unsubscribe(created); children.clear(); },
  };
}

export function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

/** Compiler RSS is separate from the worker's process-wide RSS. Linux reads
 * `/proc`; macOS spawns `/bin/ps` for each read. */
export async function processRss(pid: number, platform: NodeJS.Platform = process.platform): Promise<number | null> {
  if (platform === 'linux') {
    try {
      const match = (await readFile(`/proc/${pid}/status`, 'utf8')).match(/^VmRSS:\s+(\d+)/m);
      return match ? Number(match[1]) * 1024 : null;
    } catch { return null; }
  }
  if (platform === 'darwin') return new Promise(resolve => {
    execFile('/bin/ps', ['-o', 'rss=', '-p', String(pid)], { timeout: 1_000 }, (error, stdout) => {
      const bytes = Number(stdout.trim()) * 1024;
      resolve(!error && Number.isFinite(bytes) && bytes > 0 ? bytes : null);
    });
  });
  return null;
}

/** The longest a reported compiler RSS sample is reused where a read spawns a process. */
export const rssSampleIntervalMs = 5_000;

export interface RssSampling {
  readonly platform?: NodeJS.Platform;
  readonly read?: (pid: number) => Promise<number | null>;
  readonly now?: () => number;
  readonly intervalMs?: number;
}
export interface RssSampler {
  /** The compiler RSS to report with a worker status message. */
  sample(pid: number): Promise<number | null>;
  dispose(): void;
}

/**
 * Samples compiler RSS for the session status. On Linux every worker status
 * message reads `/proc`, which starts no process. Elsewhere a read may spawn a
 * process, so a compiler is read when its pid is first reported and the sample
 * is then reused. A status message that finds the sample at least `intervalMs`
 * old starts one background read and still reports the reused sample; the
 * read's result reaches `refreshed`. No read runs without a status message.
 */
export function createRssSampler(refreshed: (pid: number, rss: number | null) => void, options: RssSampling = {}): RssSampler {
  const platform = options.platform ?? process.platform;
  const read = options.read ?? ((pid: number) => processRss(pid, platform));
  if (platform === 'linux') return { sample: read, dispose: () => undefined };
  const now = options.now ?? (() => performance.now());
  const intervalMs = options.intervalMs ?? rssSampleIntervalMs;
  let latest: { readonly pid: number; readonly rss: number | null; readonly at: number } | null = null;
  let reading = false, disposed = false;
  return {
    async sample(pid) {
      if (latest?.pid !== pid) {
        const at = now(), rss = await read(pid);
        if (!disposed) latest = { pid, rss, at };
        return rss;
      }
      const current = latest;
      if (!reading && now() - current.at >= intervalMs) {
        reading = true;
        const at = now();
        void read(pid).then(rss => {
          reading = false;
          if (disposed || latest !== current) return;
          latest = { pid, rss, at };
          refreshed(pid, rss);
        }, () => { reading = false; });
      }
      return current.rss;
    },
    dispose: () => { disposed = true; latest = null; },
  };
}

/** Verify the host's observations after the supervisor has reaped its children.
 * Do not signal cached identities after supervision has already ended. */
export async function releaseSessionChildren(pids: readonly number[], timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (pids.some(processAlive)) {
    if (Date.now() >= until) throw new Error('Session child process survived disposal');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
