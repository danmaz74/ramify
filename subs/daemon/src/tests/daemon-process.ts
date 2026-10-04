import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDaemon } from '../connect-daemon.js';
import { readDaemonRecord, selectEndpoint } from '../discovery.js';
import type { EndpointSelection, ServiceConnection } from '../interfaces/daemon.js';
import type { ServiceResult } from '../../../../src/interfaces/service.js';

/** The checkout whose built daemon entry these tests start: the installed form of the toolkit. */
export const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export const version = (JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as { version: string }).version;
export const engine = `ramify.ts@${version}+typescript@7.0.2`;
/** The capabilities the CLI requests for a complete check. */
export const capabilities = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking', 'static-access',
  'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const;
const daemonEntry = join(repositoryRoot, 'dist/src/daemon-entry.js');
const probe = new URL('./watch-registration-probe.mjs', import.meta.url).href;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

/** An observation deadline for a real process, not a product budget. */
export async function until(label: string, timeoutMs: number, condition: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  do {
    if (await condition()) return;
    await delay(25);
  } while (performance.now() < deadline);
  throw new Error(`${label}: not reached within ${timeoutMs} ms`);
}

export function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

/** The live processes below `pid`, from each process's parent in `/proc`. */
export async function descendants(pid: number): Promise<number[]> {
  const parents = new Map<number, number>();
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const stat = await readFile(`/proc/${name}/stat`, 'utf8').catch(() => null);
    // The command name is parenthesized and may hold spaces; the parent follows the state.
    const fields = stat?.slice(stat.lastIndexOf(')') + 2).split(' ');
    if (fields) parents.set(Number(name), Number(fields[1]));
  }
  const found: number[] = [];
  for (let frontier = [pid]; frontier.length;) {
    const next = [...parents].filter(([, parent]) => frontier.includes(parent)).map(([child]) => child);
    found.push(...next); frontier = next;
  }
  return found;
}

export interface WatchRecord { readonly event: 'watch' | 'close'; readonly directory: string }
export interface DaemonProcess {
  readonly pid: number;
  readonly endpoint: EndpointSelection;
  readonly connection: ServiceConnection;
  /** Every fs.watch registration and close the daemon made, in order. */
  trace(): Promise<readonly WatchRecord[]>;
  /** The directories registered and not closed. */
  registered(): Promise<readonly string[]>;
}

/**
 * Start the built daemon entry with a private endpoint directory and the observation-only
 * registration probe, connect the public client, and on every path stop the daemon
 * explicitly and verify that it and every process it started have exited.
 */
export async function withDaemonProcess<T>(client: string, run: (daemon: DaemonProcess) => Promise<T>): Promise<T> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'rpb16-')));
  const tracePath = join(directory, 'watch-trace.jsonl');
  const endpoint = await selectEndpoint({ packageRoot: repositoryRoot, version, endpointDirectory: directory });
  const child = spawn(process.execPath, ['--import', probe, daemonEntry, '--endpoint-dir', directory, '--build-key', endpoint.buildKey,
    '--version', version, '--engine', engine], { cwd: repositoryRoot, env: { ...process.env, RAMIFY_WATCH_TRACE: tracePath }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', bytes => { stderr += String(bytes); });
  child.stdout.resume();
  const exited = new Promise<number | null>(resolve => child.once('exit', code => resolve(code)));
  const pid = child.pid!;
  let connection: ServiceConnection | undefined;
  let leftovers: number[] = [];
  let failure: unknown;
  try {
    await until(`daemon startup (${stderr})`, 15_000, async () => (await readDaemonRecord(endpoint))?.state === 'running');
    const connected = await connectDaemon({ start: 'never', daemonEntry: null, packageRoot: repositoryRoot, endpointDirectory: directory,
      client: { name: client, version }, engine });
    if (connected.status !== 'connected') throw new Error(`Connection failed: ${JSON.stringify(connected)}`);
    connection = connected.connection;
    const trace = async (): Promise<readonly WatchRecord[]> => (await readFile(tracePath, 'utf8').catch(() => '')).split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as WatchRecord & { pid: number }).filter(record => record.pid === pid)
      .map(({ event, directory: watched }) => ({ event, directory: watched }));
    return await run({ pid, endpoint, connection, trace, async registered() {
      const open = new Map<string, number>();
      for (const record of await trace()) open.set(record.directory, (open.get(record.directory) ?? 0) + (record.event === 'watch' ? 1 : -1));
      return [...open].filter(([, count]) => count > 0).map(([watched]) => watched).sort();
    } });
  } catch (error) { failure = error; throw error; }
  finally {
    leftovers = await descendants(pid);
    try {
      if (connection) {
        await connection.stopDaemon({ instanceId: connection.daemon.instance.instanceId });
        await connection.close().catch(() => {});
      }
    } catch { /* The exit check below decides. */ }
    const code = await Promise.race([exited, delay(15_000).then(() => 'timeout' as const)]);
    const running = [pid, ...leftovers].filter(alive);
    // Only processes this helper started are ever signalled.
    for (const stray of running) process.kill(stray, 'SIGKILL');
    await rm(directory, { recursive: true, force: true });
    if (!failure && (code === 'timeout' || running.length)) {
      // eslint-disable-next-line no-unsafe-finally
      throw new Error(`Daemon cleanup left processes ${JSON.stringify(running)} (exit ${String(code)}): ${stderr}`);
    }
  }
}
