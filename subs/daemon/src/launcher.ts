import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { isAbsolute } from 'node:path';
import type { DaemonRecord, EndpointSelection } from './interfaces/daemon.js';
import { processAlive, readControlFile, readRecord, verifyEndpoint } from './records.js';

interface StartLock { readonly pid: number; readonly at: number }
interface LaunchOptions {
  readonly endpoint: EndpointSelection;
  readonly daemonEntry: string;
  readonly version: string;
  readonly engine: string;
  readonly startupMs: number;
  readonly signal?: AbortSignal;
}

function checkDeadline(deadline: number, signal?: AbortSignal): void {
  signal?.throwIfAborted();
  if (performance.now() >= deadline) throw new Error('Daemon startup timed out');
}

async function pause(deadline: number, signal?: AbortSignal): Promise<void> {
  checkDeadline(deadline, signal);
  await new Promise<void>((accept, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); accept(); };
    const timer = setTimeout(finish, Math.min(50, Math.max(1, deadline - performance.now())));
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

function lockData(content: string): StartLock {
  const value = JSON.parse(content);
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 2
    || !Number.isSafeInteger(value.pid) || value.pid <= 0 || !Number.isSafeInteger(value.at) || value.at < 0) {
    throw new Error('Malformed daemon start lock');
  }
  return value;
}

async function removeIfPresent(path: string): Promise<void> {
  await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
}

/** Re-read under a second exclusive guard so simultaneous reclaimers cannot
 * unlink a newly acquired lock. An abandoned guard fails closed; it is never
 * reclaimed using an uncoordinated check-and-unlink of its own. */
async function reclaimLock(endpoint: EndpointSelection): Promise<void> {
  const guard = `${endpoint.lock}.reclaim`;
  let handle;
  try { handle = await open(guard, 'wx', 0o600); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return; throw error; }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
    const current = await readControlFile(endpoint.lock);
    if (current && !processAlive(lockData(current).pid)) await removeIfPresent(endpoint.lock);
  } finally { await handle.close(); await removeIfPresent(guard); }
}

async function acceptsSocket(endpoint: EndpointSelection, deadline: number, signal?: AbortSignal): Promise<boolean> {
  checkDeadline(deadline, signal);
  return new Promise<boolean>((accept, reject) => {
    const socket = createConnection(endpoint.socket);
    let settled = false;
    const finish = (result: boolean, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      // Keep the error listener until close, including after destroy on abort.
      socket.destroy();
      if (error !== undefined) reject(error); else accept(result);
    };
    const abort = () => finish(false, signal?.reason ?? new Error('Daemon startup aborted'));
    const timer = setTimeout(() => finish(false), Math.min(50, Math.max(1, deadline - performance.now())));
    socket.once('connect', () => finish(true));
    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') finish(false);
      else finish(false, error);
    });
    socket.once('close', () => { if (!settled) finish(false); });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

async function runningRecord(options: LaunchOptions, deadline: number): Promise<DaemonRecord | null> {
  const record = await readRecord(options.endpoint);
  if (!record || record.state !== 'running' || !processAlive(record.pid)) return null;
  if (record.version !== options.version || record.engine !== options.engine) {
    throw new Error('Daemon record is incompatible with the requested build');
  }
  return await acceptsSocket(options.endpoint, deadline, options.signal) ? record : null;
}

/** One coordinated launch attempt. The future connector owns attempt counts,
 * handshake and recovery authorization; socket readiness is not compatibility. */
export async function launchDaemon(options: LaunchOptions): Promise<{ readonly record: DaemonRecord; readonly started: boolean }> {
  if (!isAbsolute(options.daemonEntry) || !Number.isSafeInteger(options.startupMs) || options.startupMs <= 0
    || !options.version || !options.engine) throw new Error('Invalid daemon launch options');
  const deadline = performance.now() + options.startupMs;
  checkDeadline(deadline, options.signal);
  await verifyEndpoint(options.endpoint);
  const endpoint = options.endpoint;
  let lock;
  while (!lock) {
    checkDeadline(deadline, options.signal);
    const running = await runningRecord(options, deadline);
    if (running) return { record: running, started: false };
    try { lock = await open(endpoint.lock, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const content = await readControlFile(endpoint.lock);
      // An exclusive creator may still be writing its small lock document.
      if (content) { if (!processAlive(lockData(content).pid)) await reclaimLock(endpoint); }
      await pause(deadline, options.signal);
    }
  }
  let keepLock = false;
  let child: ReturnType<typeof spawn> | undefined;
  let ready = false;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
    const running = await runningRecord(options, deadline);
    if (running) return { record: running, started: false };
    const previous = await readRecord(endpoint);
    if (previous && processAlive(previous.pid)) {
      // Neither a refused socket nor a stopped record permits unlinking a live pid.
      while (processAlive(previous.pid)) {
        await pause(deadline, options.signal);
        const current = await runningRecord(options, deadline);
        if (current) return { record: current, started: false };
      }
    }
    checkDeadline(deadline, options.signal);
    if (previous) {
      // A dead-pid check plus the held start lock is required for both unlinks.
      if (processAlive(previous.pid)) throw new Error('Daemon pid became live during startup');
      await removeIfPresent(endpoint.socket);
      await removeIfPresent(endpoint.record);
    }
    const log = await open(endpoint.log, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
    try {
      const info = await log.stat();
      if (!info.isFile() || info.uid !== process.getuid!() || (info.mode & 0o077) !== 0) throw new Error('Unsafe daemon log file');
      await log.truncate(0);
      checkDeadline(deadline, options.signal);
      child = spawn(process.execPath, [options.daemonEntry, '--endpoint-dir', endpoint.directory,
        '--build-key', endpoint.buildKey, '--version', options.version, '--engine', options.engine],
      { detached: true, stdio: ['ignore', log.fd, log.fd] });
      await new Promise<void>((accept, reject) => {
        child!.once('spawn', accept);
        child!.once('error', reject);
      });
      child.unref();
      keepLock = true;
      // If a caller cancels before readiness, preserve a lock naming the child.
      // Future callers can wait for its record or reclaim only after it is dead.
      const content = JSON.stringify({ pid: child.pid!, at: Date.now() });
      await lock.truncate(0);
      await lock.write(content, 0, 'utf8');
    } finally { await log.close(); }
    while (true) {
      checkDeadline(deadline, options.signal);
      const record = await runningRecord(options, deadline);
      if (record) { ready = true; return { record, started: record.pid === child.pid }; }
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Daemon entry exited before readiness (${child.exitCode ?? child.signalCode})`);
      await pause(deadline, options.signal);
    }
  } finally {
    await lock.close();
    // A cancelled connector never kills a shared process or permits a duplicate.
    if (!keepLock || ready || child?.exitCode !== null || child?.signalCode !== null) await removeIfPresent(endpoint.lock);
  }
}
