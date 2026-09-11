import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { link, open, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { isAbsolute } from 'node:path';
import type { DaemonRecord, EndpointSelection } from './interfaces/daemon.js';
import { processAlive, readControlFile, readRecord, verifyEndpoint } from './records.js';
import { coordinateStart } from './start-coordination.js';

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

/** Read ownership without changing any file; ambiguity is an explicit error. */
export async function readStartOwner(endpoint: EndpointSelection): Promise<number | null> {
  const content = await readControlFile(endpoint.lock);
  if (content === null) return null;
  if (!content) throw new Error('Empty legacy daemon start lock; ownership cannot be established');
  return lockData(content).pid;
}

async function removeIfPresent(path: string): Promise<void> {
  await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
}

/** Publish complete ownership atomically; no exclusive empty-file interval is
 * observable, including when the creator dies before publishing its lock. */
async function createLock(endpoint: EndpointSelection): Promise<Awaited<ReturnType<typeof open>>> {
  const temporary = `${endpoint.lock}.${process.pid}-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx', mode: 0o600 });
    await link(temporary, endpoint.lock);
    return await open(endpoint.lock, 'r+');
  } finally { await removeIfPresent(temporary); }
}

async function acquireLock(endpoint: EndpointSelection, deadline: number, signal?: AbortSignal) {
  return coordinateStart(endpoint, deadline, signal, async () => {
    // This guard was written by older launchers. Dead holders can be cleaned;
    // malformed ownership remains explicitly unavailable, never guessed dead.
    const guard = `${endpoint.lock}.reclaim`;
    const guarded = await readControlFile(guard);
    if (guarded !== null) {
      if (!guarded) throw new Error('Empty legacy daemon reclaim guard; ownership cannot be established');
      if (processAlive(lockData(guarded).pid)) return null;
      await removeIfPresent(guard);
    }
    const content = await readControlFile(endpoint.lock);
    if (content !== null) {
      if (!content) throw new Error('Empty legacy daemon start lock; ownership cannot be established');
      if (processAlive(lockData(content).pid)) return null;
      await removeIfPresent(endpoint.lock);
    }
    return createLock(endpoint);
  });
}

async function terminateUnreadyChild(child: ReturnType<typeof spawn>, endpoint: EndpointSelection): Promise<void> {
  const record = await readRecord(endpoint);
  if (record?.state === 'running' && record.pid === child.pid) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 1000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    if (child.exitCode !== null || child.signalCode !== null) { clearTimeout(timer); resolve(); }
  });
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
    lock = await acquireLock(endpoint, deadline, options.signal);
    if (!lock) await pause(deadline, options.signal);
  }
  let keepLock = false;
  let child: ReturnType<typeof spawn> | undefined;
  let ready = false;
  try {
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
      await coordinateStart(endpoint, Math.max(deadline, performance.now() + 2000), undefined, async () => {
        const replacement = `${endpoint.lock}.${randomUUID()}.tmp`;
        await writeFile(replacement, content, { flag: 'wx', mode: 0o600 });
        const { rename } = await import('node:fs/promises');
        await rename(replacement, endpoint.lock);
      });
    } finally { await log.close(); }
    while (true) {
      checkDeadline(deadline, options.signal);
      const record = await runningRecord(options, deadline);
      if (record) { ready = true; return { record, started: record.pid === child.pid }; }
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Daemon entry exited before readiness (${child.exitCode ?? child.signalCode})`);
      await pause(deadline, options.signal);
    }
  } catch (error) {
    if (child && !options.signal?.aborted) {
      await terminateUnreadyChild(child, endpoint);
      keepLock = child.exitCode === null && child.signalCode === null;
    }
    throw error;
  } finally {
    await lock.close();
    // A cancelled connector never kills a shared process or permits a duplicate.
    if (!keepLock || ready || child?.exitCode !== null || child?.signalCode !== null) {
      await coordinateStart(endpoint, performance.now() + 2000, undefined, async () => {
        const content = await readControlFile(endpoint.lock);
        if (content && [process.pid, child?.pid].includes(lockData(content).pid)) await removeIfPresent(endpoint.lock);
      });
    }
  }
}
