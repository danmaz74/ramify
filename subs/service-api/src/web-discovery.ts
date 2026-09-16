import { lstat, readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import type { ContextToken } from '../../daemon/src/context-types.js';
import type { EndpointSelection } from '../../daemon/src/interfaces/daemon.js';
import type { ExplorerProcessRecord } from './interfaces/explorer-service.js';

export interface ExplorerEndpointSelection {
  readonly directory: string;
  readonly buildKey: string;
  readonly record: string;
  readonly lock: string;
  readonly log: string;
}

const keys = ['schemaVersion', 'instanceId', 'pid', 'version', 'buildKey', 'protocol', 'host', 'port',
  'origin', 'startedAt', 'state', 'stopped'] as const;

function exactObject(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

function validRecord(value: unknown): value is ExplorerProcessRecord {
  if (!exactObject(value, keys) || value.schemaVersion !== 'ramify.explorer-record/1'
    || typeof value.instanceId !== 'string' || !value.instanceId
    || !Number.isSafeInteger(value.pid) || (value.pid as number) <= 0
    || typeof value.version !== 'string' || !value.version
    || typeof value.buildKey !== 'string' || !/^[0-9a-f]{16}$/.test(value.buildKey)
    || value.protocol !== 'ramify.explorer-http/1' || value.host !== '127.0.0.1'
    || !Number.isSafeInteger(value.port) || (value.port as number) <= 0 || (value.port as number) > 65_535
    || value.origin !== `http://127.0.0.1:${value.port}`
    || !Number.isSafeInteger(value.startedAt) || (value.startedAt as number) < 0
    || (value.state !== 'running' && value.state !== 'stopped')) return false;
  if (value.state === 'running') return value.stopped === null;
  return exactObject(value.stopped, ['at', 'reason']) && Number.isSafeInteger(value.stopped.at)
    && (value.stopped.at as number) >= 0 && ['idle', 'explicit', 'failed'].includes(String(value.stopped.reason));
}

export function selectExplorerEndpoint(endpoint: Pick<EndpointSelection, 'directory' | 'buildKey'>): ExplorerEndpointSelection {
  const prefix = join(endpoint.directory, `explorer-${endpoint.buildKey}`);
  return Object.freeze({ directory: endpoint.directory, buildKey: endpoint.buildKey,
    record: `${prefix}.json`, lock: `${prefix}.lock`, log: `${prefix}.log` });
}

/** Unsafe, malformed or oversized records are stale evidence, never reusable. */
export async function readExplorerProcessRecord(endpoint: ExplorerEndpointSelection): Promise<ExplorerProcessRecord | null> {
  try {
    const info = await lstat(endpoint.record);
    if (!process.getuid || !info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid()
      || (info.mode & 0o077) !== 0 || info.size <= 0 || info.size > 16 * 1024) return null;
    const value: unknown = JSON.parse(await readFile(endpoint.record, 'utf8'));
    return validRecord(value) ? value : null;
  } catch { return null; }
}

export function explorerProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** Readiness repeats every compatibility field and is accepted only from the recorded Host. */
export function probeExplorerReadiness(record: ExplorerProcessRecord, timeoutMs = 250,
  signal?: AbortSignal): Promise<boolean> {
  if (record.state !== 'running' || timeoutMs <= 0 || !Number.isFinite(timeoutMs)) return Promise.resolve(false);
  return new Promise(resolve => {
    let settled = false, bytes = 0, body = '';
    const finish = (ready: boolean): void => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); call.destroy(); resolve(ready);
    };
    const call = request({ hostname: '127.0.0.1', port: record.port, path: '/health/ready', method: 'GET',
      headers: { Host: `127.0.0.1:${record.port}` } }, response => {
      response.setEncoding('utf8');
      response.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes > 16 * 1024) finish(false); else body += chunk; });
      response.once('end', () => {
        if (response.statusCode !== 200) return finish(false);
        try {
          const value: unknown = JSON.parse(body);
          finish(exactObject(value, ['schemaVersion', 'instanceId', 'version', 'buildKey', 'protocol'])
            && value.schemaVersion === record.schemaVersion && value.instanceId === record.instanceId
            && value.version === record.version && value.buildKey === record.buildKey && value.protocol === record.protocol);
        } catch { finish(false); }
      });
    });
    call.once('error', () => finish(false));
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else call.end();
  });
}

export async function reusableExplorerProcess(endpoint: ExplorerEndpointSelection, version: string,
  signal?: AbortSignal): Promise<ExplorerProcessRecord | null> {
  const record = await readExplorerProcessRecord(endpoint);
  if (!record || record.state !== 'running' || record.version !== version || record.buildKey !== endpoint.buildKey
    || record.protocol !== 'ramify.explorer-http/1' || !explorerProcessAlive(record.pid)) return null;
  return await probeExplorerReadiness(record, 250, signal) ? record : null;
}

/** The browser URL contains only daemon-issued opaque identities. */
export function explorerProjectUrl(record: ExplorerProcessRecord, token: ContextToken): string {
  if (record.state !== 'running') throw new Error('Explorer process is not running');
  return `${record.origin}/explore/${encodeURIComponent(token.context)}/${encodeURIComponent(token.generation)}`;
}
