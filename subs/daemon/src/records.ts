import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';
import type { DaemonRecord, EndpointSelection } from './interfaces/daemon.js';

/** Fail closed on ambiguous liveness; only ESRCH authorizes stale cleanup. */
export function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid daemon pid');
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw new Error(`Cannot establish liveness of pid ${pid}`, { cause: error });
  }
}

export async function verifyDirectory(directory: string): Promise<void> {
  if (!process.getuid) throw new Error('Daemon endpoints require a Unix user id');
  const info = await lstat(directory);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
    throw new Error(`Unsafe daemon endpoint directory: ${directory}; require current owner and mode 0700`);
  }
}

export async function verifyEndpoint(endpoint: EndpointSelection): Promise<void> {
  if (!isAbsolute(endpoint.directory) || normalize(endpoint.directory) !== endpoint.directory
    || !/^[0-9a-f]{16}$/.test(endpoint.buildKey)) throw new Error('Invalid daemon endpoint selection');
  for (const [key, suffix] of [['socket', 'sock'], ['record', 'json'], ['lock', 'lock'], ['log', 'log']] as const) {
    if (endpoint[key] !== join(endpoint.directory, `daemon-${endpoint.buildKey}.${suffix}`)) {
      throw new Error(`Invalid daemon endpoint ${key}`);
    }
  }
  if (Buffer.byteLength(endpoint.socket) > 100) {
    throw new Error('Daemon socket path exceeds 100 bytes; choose a shorter RAMIFY_ENDPOINT_DIR');
  }
  await verifyDirectory(endpoint.directory);
}

/** Small control records only. Never follow a link or allocate an unbounded file. */
export async function readControlFile(path: string): Promise<string | null> {
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.uid !== process.getuid!() || (info.mode & 0o077) !== 0 || info.size > 65_536) {
      throw new Error(`Unsafe or oversized daemon control file: ${path}`);
    }
    const bytes = Buffer.alloc(65_537);
    let count = 0;
    while (count < bytes.length) {
      const read = await handle.read(bytes, count, bytes.length - count, null);
      if (!read.bytesRead) break;
      count += read.bytesRead;
    }
    if (count > 65_536) throw new Error(`Oversized daemon control file: ${path}`);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
  } finally { await handle.close(); }
}

function object(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function timestamp(value: unknown): boolean { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

export function validateRecord(value: unknown, endpoint: EndpointSelection): DaemonRecord {
  if (!object(value, ['schemaVersion', 'instanceId', 'pid', 'buildKey', 'version', 'engine', 'protocol',
    'socket', 'startedAt', 'state', 'stopped']) || value.schemaVersion !== 'ramify.daemon-record/1'
    || !text(value.instanceId) || !Number.isSafeInteger(value.pid) || (value.pid as number) <= 0
    || value.buildKey !== endpoint.buildKey || !text(value.version) || !text(value.engine)
    || value.protocol !== 'ramify.ipc/1' || value.socket !== endpoint.socket || !timestamp(value.startedAt)
    || !['starting', 'running', 'stopped'].includes(value.state as string)) {
    throw new Error(`Malformed or foreign daemon record: ${endpoint.record}`);
  }
  if (value.state === 'stopped') {
    const stop = value.stopped;
    if (!object(stop, ['at', 'reason', 'requestId']) || !timestamp(stop.at)
      || (stop.at as number) < (value.startedAt as number)
      || !['idle', 'explicit', 'retired', 'failed'].includes(stop.reason as string)
      || !(stop.requestId === null || text(stop.requestId))) throw new Error('Malformed daemon stop disposition');
  } else if (value.stopped !== null) throw new Error('Active daemon record contains a stop disposition');
  // Detach and freeze nested data from the caller of the private writer as well.
  const result = { ...value, stopped: value.stopped === null ? null : Object.freeze({ ...value.stopped as object }) };
  return Object.freeze(result) as unknown as DaemonRecord;
}

export async function readRecord(endpoint: EndpointSelection): Promise<DaemonRecord | null> {
  await verifyEndpoint(endpoint);
  const content = await readControlFile(endpoint.record);
  if (content === null) return null;
  try { return validateRecord(JSON.parse(content), endpoint); }
  catch (error) { throw new Error(`Cannot read daemon record ${endpoint.record}`, { cause: error }); }
}

/** Atomic visibility to readers; no claim of durability after a power failure. */
export async function writeDaemonRecord(endpoint: EndpointSelection, record: DaemonRecord): Promise<void> {
  await verifyEndpoint(endpoint);
  const content = JSON.stringify(validateRecord(record, endpoint)) + '\n';
  if (Buffer.byteLength(content) > 65_536) throw new Error('Oversized daemon record');
  const temporary = `${endpoint.record}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try { await handle.writeFile(content); } finally { await handle.close(); }
    await rename(temporary, endpoint.record);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
