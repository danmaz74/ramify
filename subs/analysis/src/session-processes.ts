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

/** Compiler RSS is separate from the worker's process-wide RSS. */
export async function processRss(pid: number): Promise<number | null> {
  if (process.platform === 'linux') {
    try {
      const match = (await readFile(`/proc/${pid}/status`, 'utf8')).match(/^VmRSS:\s+(\d+)/m);
      return match ? Number(match[1]) * 1024 : null;
    } catch { return null; }
  }
  if (process.platform === 'darwin') return new Promise(resolve => {
    execFile('/bin/ps', ['-o', 'rss=', '-p', String(pid)], { timeout: 1_000 }, (error, stdout) => {
      const bytes = Number(stdout.trim()) * 1024;
      resolve(!error && Number.isFinite(bytes) && bytes > 0 ? bytes : null);
    });
  });
  return null;
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
