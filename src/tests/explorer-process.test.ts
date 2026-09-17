import { spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdtemp, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { createServer, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { connectDaemon } from '../../subs/daemon/src/connect-daemon.js';
import { readDaemonRecord, selectEndpoint } from '../../subs/daemon/src/discovery.js';
import { fixture } from './fixture.js';
import { repositoryRoot } from './process.js';

const entry = join(repositoryRoot, 'dist/src/explorer-entry.js');
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => {}); });

interface Running { readonly child: ChildProcess; stdout: string; stderr: string; readonly exited: Promise<[number | null, NodeJS.Signals | null]> }

function startEntry(args: readonly string[], endpointDirectory: string): Running {
  const child = spawn(process.execPath, [entry, ...args], { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RAMIFY_ENDPOINT_DIR: endpointDirectory } });
  const running: Running = { child, stdout: '', stderr: '',
    exited: new Promise(resolve => child.once('exit', (code, signal) => resolve([code, signal]))) };
  child.stdout!.setEncoding('utf8').on('data', text => { running.stdout += text; });
  child.stderr!.setEncoding('utf8').on('data', text => { running.stderr += text; });
  cleanups.push(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await running.exited; } });
  return running;
}

async function until<T>(read: () => Promise<T | null | undefined>, timeoutMs: number, describe: () => string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Condition not reached: ${describe()}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function listen(server: Server, port = 0): Promise<number> {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  return address.port;
}

function status(port: number, path: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const call = request({ hostname: '127.0.0.1', port, path, headers: { Host: host } }, response => {
      response.resume(); resolve(response.statusCode ?? 0);
    });
    call.once('error', reject); call.end();
  });
}

async function endpointDirectory(): Promise<string> {
  // Short, private and isolated: the socket path is bounded and no real daemon is touched.
  const directory = await mkdtemp(join(tmpdir(), 'rx6b-'));
  await chmod(directory, 0o700);
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

/** Stop the daemon the server started in the isolated endpoint, and wait for its process to exit. */
async function stopIsolatedDaemon(directory: string): Promise<void> {
  const endpoint = await selectEndpoint({ packageRoot: repositoryRoot, version: '0.0.0', endpointDirectory: directory });
  const record = await readDaemonRecord(endpoint);
  if (!record || record.state !== 'running') return;
  const connected = await connectDaemon({ start: 'never', client: { name: 'explorer-process-test', version: '0.0.0' },
    engine: 'ramify.ts@0.0.0+typescript@7.0.2', daemonEntry: null, packageRoot: repositoryRoot, endpointDirectory: directory });
  if (connected.status === 'connected') {
    await connected.connection.stopDaemon({ instanceId: connected.connection.daemon.instance.instanceId }).catch(() => {});
    await connected.connection.close().catch(() => {});
  }
  await until(async () => { try { process.kill(record.pid, 0); return false; } catch { return true; } }, 10_000,
    () => `daemon ${record.pid} exit`).catch(() => { process.kill(record.pid, 'SIGKILL'); });
}

describe('RS10: resident explorer server process', () => {
  it('starts on the fixed port without a running daemon, advertises its project and stops explicitly on SIGINT', () => fixture(async root => {
    await symlink(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'));
    const directory = await endpointDirectory();
    cleanups.push(() => stopIsolatedDaemon(directory));
    const probe = createServer();
    const port = await listen(probe);
    await new Promise<void>(resolve => probe.close(() => resolve()));

    const server = startEntry(['--root', root, '--port', String(port)], directory);
    const recordName = await until(async () => (await readdir(directory))
      .find(name => /^explorer-[0-9a-f]{16}-[0-9a-f]{16}\.json$/.test(name)), 60_000,
    () => `record in ${directory}; stdout ${server.stdout}; stderr ${server.stderr}`);
    const recordPath = join(directory, recordName);
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    expect(record).toMatchObject({ state: 'running', pid: server.child.pid, root, port, origin: `http://127.0.0.1:${port}` });
    expect(recordName).toBe(`explorer-${record.buildKey}-${record.context.slice(6, 22)}.json`);
    expect(server.stdout).toContain(`Explorer serving ${root} at http://127.0.0.1:${port}/`);
    expect(await status(port, '/health/ready', `localhost:${port}`)).toBe(200);
    expect(await status(port, '/health/ready', `127.0.0.1:${port}`)).toBe(200);
    expect(await status(port, '/health/ready', `example.test:${port}`)).toBe(403);
    // The server started the isolated daemon itself with `if-needed`.
    const daemon = await readDaemonRecord(await selectEndpoint({ packageRoot: repositoryRoot, version: '0.0.0', endpointDirectory: directory }));
    expect(daemon).toMatchObject({ state: 'running' });
    const served = await fetch(`http://127.0.0.1:${port}/trpc/serverStatus`);
    expect(await served.json()).toMatchObject({ result: { data: { root, binding: 'ready', message: null, daemonPid: daemon!.pid } } });

    server.child.kill('SIGINT');
    expect(await server.exited).toEqual([0, null]);
    expect(JSON.parse(await readFile(recordPath, 'utf8'))).toMatchObject({ state: 'stopped', stopped: { reason: 'explicit' } });
  }), 90_000);

  it('exits 1 when the fixed port is busy', () => fixture(async root => {
    const directory = await endpointDirectory();
    const busy = createServer();
    const port = await listen(busy);
    cleanups.push(() => new Promise<void>(resolve => busy.close(() => resolve())));
    const server = startEntry(['--root', root, '--port', String(port)], directory);
    expect(await server.exited).toEqual([1, null]);
    expect(server.stderr).toContain('EADDRINUSE');
    expect((await readdir(directory)).filter(name => /^explorer-.*\.json$/.test(name))).toEqual([]);
    // The listener fails before the binding connects, so no daemon was started.
    expect(await readDaemonRecord(await selectEndpoint({ packageRoot: repositoryRoot, version: '0.0.0', endpointDirectory: directory }))).toBeNull();
  }), 60_000);

  it('rejects the removed arguments', async () => {
    const directory = await endpointDirectory();
    const server = startEntry(['--endpoint-dir', directory, '--build-key', '0123456789abcdef', '--version', '0.0.0'], directory);
    expect(await server.exited).toEqual([1, null]);
    expect(server.stderr).toContain('Usage: explorer-entry.js --root <dir> [--port <n>]');
  });
});
