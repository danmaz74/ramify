import { spawn, type ChildProcess } from 'node:child_process';
import { constants } from 'node:fs';
import { open, readFile, unlink } from 'node:fs/promises';
import type { ExplorerProcessRecord } from './interfaces/explorer-service.js';
import { explorerProcessAlive, readExplorerProcessRecord, reusableExplorerProcess,
  type ExplorerEndpointSelection } from './web-discovery.js';

interface LockRecord { readonly pid: number; readonly at: number }
export interface ExplorerLaunchOptions {
  readonly endpoint: ExplorerEndpointSelection;
  readonly version: string;
  readonly explorerEntry: string;
  readonly runtime?: string;
  readonly startupMs?: number;
  readonly signal?: AbortSignal;
}
export interface ExplorerProcessLaunch {
  readonly record: ExplorerProcessRecord;
  readonly started: boolean;
  /** Terminates only the child created by this call. A reused process is untouched. */
  terminateOwned(): Promise<void>;
}

const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(done, ms);
  const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason ?? new Error('Explorer launch aborted')); };
  function done(): void { signal?.removeEventListener('abort', abort); resolve(); }
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
});

function lockRecord(content: string): LockRecord {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
    || !Object.hasOwn(value, 'pid') || !Object.hasOwn(value, 'at')
    || !Number.isSafeInteger((value as LockRecord).pid) || (value as LockRecord).pid <= 0
    || !Number.isSafeInteger((value as LockRecord).at) || (value as LockRecord).at < 0) throw new Error('Malformed explorer start lock');
  return value as LockRecord;
}

async function remove(path: string): Promise<void> {
  await unlink(path).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
}

async function acquireLock(endpoint: ExplorerEndpointSelection, deadline: number, signal?: AbortSignal) {
  while (performance.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const handle = await open(endpoint.lock, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
      return handle;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = lockRecord(await readFile(endpoint.lock, 'utf8'));
      if (!explorerProcessAlive(owner.pid)) { await remove(endpoint.lock); continue; }
      await pause(Math.min(50, Math.max(1, deadline - performance.now())), signal);
    }
  }
  throw new Error('Explorer startup timed out waiting for its launch lock');
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>(resolve => {
    const force = setTimeout(() => child.kill('SIGKILL'), 1000);
    const done = () => { clearTimeout(force); resolve(); };
    child.once('exit', done);
    if (child.exitCode !== null || child.signalCode !== null) done();
  });
}

/** Coordinate one detached process per build and prove HTTP compatibility before returning. */
export async function ensureExplorerWebProcess(options: ExplorerLaunchOptions): Promise<ExplorerProcessLaunch> {
  const startupMs = options.startupMs ?? 5000;
  if (!Number.isSafeInteger(startupMs) || startupMs <= 0 || !options.version || !/^[0-9a-f]{16}$/.test(options.endpoint.buildKey)) {
    throw new Error('Invalid explorer launch options');
  }
  const deadline = performance.now() + startupMs;
  const ready = await reusableExplorerProcess(options.endpoint, options.version, options.signal);
  if (ready) return { record: ready, started: false, terminateOwned: async () => {} };
  const lock = await acquireLock(options.endpoint, deadline, options.signal);
  let child: ChildProcess | undefined;
  try {
    const afterLock = await reusableExplorerProcess(options.endpoint, options.version, options.signal);
    if (afterLock) return { record: afterLock, started: false, terminateOwned: async () => {} };
    const previous = await readExplorerProcessRecord(options.endpoint);
    if (previous && explorerProcessAlive(previous.pid)) {
      if (previous.version !== options.version || previous.buildKey !== options.endpoint.buildKey
        || previous.protocol !== 'ramify.explorer-http/1') {
        throw new Error('Existing explorer process is incompatible with the requested build');
      }
      while (performance.now() < deadline && explorerProcessAlive(previous.pid)) {
        const reused = await reusableExplorerProcess(options.endpoint, options.version, options.signal);
        if (reused) return { record: reused, started: false, terminateOwned: async () => {} };
        await pause(Math.min(50, Math.max(1, deadline - performance.now())), options.signal);
      }
      if (explorerProcessAlive(previous.pid)) throw new Error('Existing explorer process did not become ready');
    }
    const log = await open(options.endpoint.log,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
    try {
      const info = await log.stat();
      if (!process.getuid || !info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
        throw new Error('Unsafe explorer log file');
      }
      child = spawn(options.runtime ?? process.execPath, [options.explorerEntry,
        '--endpoint-dir', options.endpoint.directory, '--build-key', options.endpoint.buildKey, '--version', options.version],
      { detached: true, stdio: ['ignore', log.fd, log.fd] });
      await new Promise<void>((resolve, reject) => {
        child!.once('spawn', resolve);
        child!.once('error', (error: NodeJS.ErrnoException) => reject(new Error(
          `Cannot start explorer runtime ${options.runtime ?? process.execPath} (${error.code ?? error.message})`)));
      });
      child.unref();
    } finally { await log.close(); }
    while (performance.now() < deadline) {
      options.signal?.throwIfAborted();
      const record = await reusableExplorerProcess(options.endpoint, options.version, options.signal);
      if (record && record.pid === child.pid) {
        const owned = child;
        return { record, started: true, terminateOwned: () => stopChild(owned) };
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Explorer entry exited before readiness (${child.exitCode ?? child.signalCode})`);
      }
      await pause(Math.min(50, Math.max(1, deadline - performance.now())), options.signal);
    }
    throw new Error('Explorer startup timed out before readiness');
  } catch (error) {
    if (child) await stopChild(child);
    throw error;
  } finally {
    await lock.close();
    await remove(options.endpoint.lock);
  }
}
