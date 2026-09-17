import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { RamifyService } from '../../../../src/interfaces/service.js';
import type { BindingState, ProjectBinding } from '../project-binding.js';
import type { ExplorerRouter } from '../router.js';
import { startExplorerWebProcess, type ExplorerWebProcess } from '../web-process.js';

const context = `ctx/1:${'0123456789abcdef'.repeat(4)}`;
const token = { context, generation: 'gen/1:00000000-0000-4000-8000-000000000000' } as const;
const roots: string[] = [];
const processes: ExplorerWebProcess[] = [];

afterEach(async () => {
  await Promise.all(processes.splice(0).map(item => item.close().catch(() => {})));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

/** A binding whose state the test sets; the router reads it per request. */
function stubBinding(initial: BindingState, service: RamifyService | null = null) {
  let state = initial;
  const binding: ProjectBinding = { root: '/project/root', state: () => state,
    service: () => state.kind === 'ready' ? service : null, close: async () => {} };
  return { binding, set(next: BindingState) { state = next; } };
}

async function directory(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await chmod(root, 0o700); roots.push(root);
  const assets = join(root, 'assets');
  await mkdir(assets);
  await writeFile(join(assets, 'index.html'), '<!doctype html><title>Explorer fixture</title>');
  await writeFile(join(assets, 'app.js'), 'void 0;');
  return { root, assets };
}

async function start(options: Parameters<typeof startExplorerWebProcess>[0]) {
  const started = await startExplorerWebProcess(options);
  processes.push(started);
  return started;
}

function call(port: number, path: string, headers: Record<string, string>, method = 'GET') {
  return new Promise<{ status: number; location: string | undefined; body: string }>((resolve, reject) => {
    const outgoing = request({ hostname: '127.0.0.1', port, path, method, headers }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.once('end', () => resolve({ status: response.statusCode ?? 0, location: response.headers.location, body }));
    });
    outgoing.once('error', reject); outgoing.end();
  });
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (!address || typeof address === 'string') throw new Error('No port');
  return address.port;
}

describe('RS09: resident explorer web process', () => {
  it('serves the app at / and /analysis/latest, redirects /explore/*, and enforces Host and Origin', async () => {
    const { root, assets } = await directory('ramify-explorer-web-');
    const web = await start({ binding: stubBinding({ kind: 'ready', token }).binding, assetsDirectory: assets,
      endpointDirectory: root, buildKey: '0123456789abcdef', version: '0.0.0' });
    const { port } = web;
    const local = `localhost:${port}`, loopback = `127.0.0.1:${port}`;
    for (const host of [local, loopback]) {
      for (const path of ['/', '/analysis/latest']) {
        const page = await call(port, path, { Host: host });
        expect([host, path, page.status]).toEqual([host, path, 200]);
        expect(page.body).toContain('Explorer fixture');
      }
      expect((await call(port, '/health/ready', { Host: host })).status).toBe(200);
      expect((await call(port, '/app.js', { Host: host })).status).toBe(200);
    }
    expect(await call(port, '/explore/ctx%2F1%3Aa/gen%2F1%3Ab', { Host: local }))
      .toMatchObject({ status: 302, location: '/analysis/latest' });
    const ready = await fetch(`${web.origin}/health/ready`);
    expect(await ready.json()).toEqual({ schemaVersion: 'ramify.explorer-record/1',
      instanceId: (await web.advertised).instanceId, version: '0.0.0', buildKey: '0123456789abcdef',
      protocol: 'ramify.explorer-http/1' });
    expect(ready.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");

    for (const host of ['localhost', '127.0.0.1', `localhost:${port + 1}`, `example.test:${port}`, `[::1]:${port}`]) {
      expect([host, (await call(port, '/', { Host: host })).status]).toEqual([host, 403]);
    }
    for (const origin of [`http://${local}`, `http://${loopback}`]) {
      expect([origin, (await call(port, '/trpc/serverStatus', { Host: local, Origin: origin })).status]).toEqual([origin, 200]);
      expect([origin, (await call(port, '/analysis/latest', { Host: loopback, Origin: origin })).status]).toEqual([origin, 200]);
    }
    for (const origin of ['https://example.test', `https://${local}`, `http://localhost:${port + 1}`, 'null']) {
      expect([origin, (await call(port, '/trpc/serverStatus', { Host: local, Origin: origin })).status]).toEqual([origin, 403]);
      expect([origin, (await call(port, '/', { Host: local, Origin: origin })).status]).toEqual([origin, 403]);
    }
    expect((await call(port, '/trpc/serverStatus', { Host: local, Origin: `http://${local}` }, 'OPTIONS')).status).toBe(403);
  });

  it('writes the per-project record only once the binding is ready, and marks it stopped on close', async () => {
    const { root, assets } = await directory('ramify-explorer-record-');
    const stub = stubBinding({ kind: 'connecting' });
    const web = await start({ binding: stub.binding, assetsDirectory: assets, endpointDirectory: root,
      buildKey: '0123456789abcdef', version: '0.0.0' });
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(web.record()).toBeNull();
    expect((await readdir(root)).filter(name => name.endsWith('.json'))).toEqual([]);
    expect((await call(web.port, '/', { Host: `localhost:${web.port}` })).status).toBe(200);
    stub.set({ kind: 'ready', token });
    const record = await web.advertised;
    const recordPath = join(root, 'explorer-0123456789abcdef-0123456789abcdef.json');
    expect(record).toEqual({ schemaVersion: 'ramify.explorer-record/1', instanceId: record.instanceId, pid: process.pid,
      version: '0.0.0', buildKey: '0123456789abcdef', protocol: 'ramify.explorer-http/1', root: '/project/root', context,
      host: '127.0.0.1', port: web.port, origin: `http://127.0.0.1:${web.port}`, startedAt: record.startedAt,
      state: 'running', stopped: null });
    expect((await stat(recordPath)).mode & 0o077).toBe(0);
    expect(JSON.parse(await readFile(recordPath, 'utf8'))).toEqual(record);
    stub.set({ kind: 'retrying', message: 'gone', nextAttemptAt: 0 });
    await web.close('explicit');
    expect(JSON.parse(await readFile(recordPath, 'utf8'))).toMatchObject({ context, state: 'stopped', stopped: { reason: 'explicit' } });
  });

  it('listens on a fixed port and refuses a busy one', async () => {
    const { root, assets } = await directory('ramify-explorer-port-');
    const port = await freePort();
    const options = { binding: stubBinding({ kind: 'connecting' }).binding, assetsDirectory: assets, endpointDirectory: root,
      buildKey: '0123456789abcdef', version: '0.0.0', port };
    const web = await start(options);
    expect([web.port, web.origin]).toEqual([port, `http://127.0.0.1:${port}`]);
    await expect(startExplorerWebProcess(options)).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('answers the browser client\'s POST query batches from the binding', async () => {
    const { root, assets } = await directory('ramify-explorer-web-post-');
    const published = { marker: 'published-revision' } as never;
    const service = { contextStatus: async () => ({ ok: true, value: { published } }),
      daemonStatus: async () => ({ ok: true, value: { pid: 4242 } }) } as unknown as RamifyService;
    const stub = stubBinding({ kind: 'ready', token }, service);
    const web = await start({ binding: stub.binding, assetsDirectory: assets, endpointDirectory: root,
      buildKey: '0123456789abcdef', version: '0.0.0' });
    const client = createTRPCClient<ExplorerRouter>({ links: [httpBatchLink({ url: `${web.origin}/trpc`, methodOverride: 'POST' })] });
    expect(await client.serverStatus.query()).toEqual({ root: '/project/root', binding: 'ready', message: null,
      published, daemonPid: 4242 });
    stub.set({ kind: 'retrying', message: 'Daemon connection unavailable', nextAttemptAt: 1 });
    expect(await client.serverStatus.query()).toEqual({ root: '/project/root', binding: 'retrying',
      message: 'Daemon connection unavailable', published: null, daemonPid: null });
    expect(await client.projectView.query({})).toEqual({ status: 'unavailable', reason: 'Daemon connection unavailable' });
  });
});
