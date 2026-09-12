import { spawn } from 'node:child_process';
import { channel } from 'node:diagnostics_channel';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { openRetainedSession } from '../retained-session.js';
import type { SessionInputs, SessionOpen } from '../interfaces/session.js';
import type { WorkerMessage } from '../session-messages.js';
import type { SessionWorker } from '../session-supervisor.js';

/** V8 heap flags inherited by Vitest override Worker.resourceLimits. Relaunch
 * the entire file in a fresh test process; no assertion is skipped or mocked. */
export function workerSuite(name: string, file: string, tests: () => void): void {
  const flags = `${process.env.NODE_OPTIONS ?? ''} ${process.execArgv.join(' ')}`;
  if (!/--(?:max[-_]old[-_]space[-_]size|max[-_]heap[-_]size)(?:=|\s)/.test(flags)) {
    describe(name, tests);
    return;
  }
  describe(name, () => {
    it('executes every worker assertion in a fresh process with enforced heap limits', async () => {
      const runner = fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json')));
      const output = await nodeProcess([runner, 'run', fileURLToPath(file), '--maxWorkers', '1', '--no-file-parallelism'],
        { ...process.env, NODE_OPTIONS: '' }, 480_000);
      const plainOutput = output.replace(/\x1b\[[\d;]*m/g, '');
      expect(plainOutput).toMatch(/Tests\s+\d+ passed/);
      console.info(plainOutput.split('\n').filter(line => /^\s*(Test Files|Tests)\s/.test(line)).join('\n'));
    }, 490_000);
  });
}

/** The child has its own process group so a timeout cannot orphan a compiler. */
export async function nodeProcess(args: readonly string[], env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '' },
  timeoutMs = 120_000): Promise<string> {
  const child = spawn(process.execPath, [...args], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const record = (data: Buffer): void => { output += data.toString(); };
  child.stdout.on('data', record); child.stderr.on('data', record);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
  }, timeoutMs);
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => code === 0 && !timedOut ? resolve()
        : reject(new Error(`Worker test process failed (${code ?? signal}${timedOut ? ', timed out' : ''})\n${output}`)));
    });
    return output;
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
    }
    child.stdout.removeListener('data', record); child.stderr.removeListener('data', record);
  }
}

/** Observe the supervised worker handle without replacing its worker entry. */
export async function observedOpen(inputs: SessionInputs): Promise<{
  opened: SessionOpen; worker: SessionWorker; messages: WorkerMessage[]; requests: unknown[]; cleanup: () => void;
}> {
  const workers: SessionWorker[] = [], messages: WorkerMessage[] = [], requests: unknown[] = [];
  const restores: (() => void)[] = [];
  const record = (message: WorkerMessage): void => { messages.push(message); };
  const created = (event: unknown): void => {
    const worker = (event as { worker: SessionWorker }).worker;
    workers.push(worker); worker.on('message', record);
    const send = worker.postMessage.bind(worker);
    const spy = vi.spyOn(worker, 'postMessage').mockImplementation((value, transfer) => {
      frozenPlain(value);
      requests.push(value);
      send(value, transfer);
    });
    restores.push(() => { spy.mockRestore(); worker.off('message', record); });
  };
  const events = channel('ramify:session-worker');
  events.subscribe(created);
  try {
    const opened = await openRetainedSession(inputs);
    expect(workers).toHaveLength(1);
    return { opened, worker: workers[0]!, messages, requests, cleanup: () => restores.forEach(restore => restore()) };
  } catch (error) {
    restores.forEach(restore => restore());
    await Promise.all(workers.map(worker => worker.terminate()));
    throw error;
  } finally { events.unsubscribe(created); }
}

export function frozenPlain(value: unknown): void {
  if (!value || typeof value !== 'object') { expect(typeof value).not.toBe('function'); return; }
  expect(Object.isFrozen(value)).toBe(true);
  expect(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype).toBe(true);
  for (const child of Object.values(value)) frozenPlain(child);
}
export function plain(value: unknown): void {
  if (!value || typeof value !== 'object') { expect(typeof value).not.toBe('function'); return; }
  expect(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype).toBe(true);
  for (const child of Object.values(value)) plain(child);
}
export function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}
export async function eventually(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const limit = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 5));
  expect(predicate()).toBe(true);
}
