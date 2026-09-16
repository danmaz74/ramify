import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { RamifyService } from '../../../../src/interfaces/service.js';
import type { ExplorerRouter } from '../router.js';
import { startExplorerWebProcess, type ExplorerWebProcess } from '../web-process.js';

const roots: string[] = [];
let processUnderTest: ExplorerWebProcess | null = null;
function statusWithHost(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const call = request({ hostname: '127.0.0.1', port, path: '/health/ready', headers: { Host: host } }, response => {
      response.resume(); resolve(response.statusCode ?? 0);
    });
    call.once('error', reject); call.end();
  });
}
afterEach(async () => {
  if (processUnderTest) await processUnderTest.close().catch(() => {});
  processUnderTest = null;
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('explorer local web process', () => {
  it('binds loopback, serves readiness/assets and enforces Host and API Origin', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-explorer-web-'));
    roots.push(root);
    const assets = join(root, 'assets');
    await mkdir(assets);
    await writeFile(join(assets, 'index.html'), '<!doctype html><title>Explorer fixture</title>');
    processUnderTest = await startExplorerWebProcess({ service: {} as RamifyService, assetsDirectory: assets,
      endpointDirectory: root, buildKey: '0123456789abcdef', version: '0.0.0' });
    const { origin } = processUnderTest.record;
    expect(processUnderTest.record).toMatchObject({ host: '127.0.0.1', state: 'running', protocol: 'ramify.explorer-http/1' });
    const ready = await fetch(`${origin}/health/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ schemaVersion: 'ramify.explorer-record/1',
      instanceId: processUnderTest.record.instanceId, version: '0.0.0', buildKey: '0123456789abcdef',
      protocol: 'ramify.explorer-http/1' });
    expect(ready.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await (await fetch(`${origin}/explore/context/generation`)).text()).toContain('Explorer fixture');
    expect(await statusWithHost(processUnderTest.record.port, 'localhost')).toBe(403);
    expect((await fetch(`${origin}/trpc/contextStatus`, { method: 'OPTIONS', headers: { Origin: 'https://example.test' } })).status).toBe(403);
    expect((await fetch(`${origin}/trpc/contextStatus`, { headers: { Origin: 'https://example.test' } })).status).toBe(403);
    const recordPath = join(root, 'explorer-0123456789abcdef.json');
    expect((await stat(recordPath)).mode & 0o077).toBe(0);
    expect(JSON.parse(await readFile(recordPath, 'utf8'))).toMatchObject({ state: 'running', origin });
    await processUnderTest.close();
    processUnderTest = null;
    expect(JSON.parse(await readFile(recordPath, 'utf8'))).toMatchObject({ state: 'stopped', stopped: { reason: 'explicit' } });
  });

  it('accepts the browser client\'s POST query batches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-explorer-web-post-'));
    roots.push(root);
    const assets = join(root, 'assets');
    await mkdir(assets); await writeFile(join(assets, 'index.html'), '<!doctype html>');
    const current = { marker: 'real-service-result' } as never;
    const service = { contextStatus: async () => ({ ok: true, value: current }) } as unknown as RamifyService;
    processUnderTest = await startExplorerWebProcess({ service, assetsDirectory: assets,
      endpointDirectory: root, buildKey: '0123456789abcdef', version: '0.0.0' });
    const client = createTRPCClient<ExplorerRouter>({ links: [httpBatchLink({
      url: `${processUnderTest.record.origin}/trpc`, methodOverride: 'POST',
    })] });
    const token = { context: `ctx/1:${'0'.repeat(64)}`, generation: 'gen/1:00000000-0000-0000-0000-000000000000' } as const;
    expect(await client.contextStatus.query({ token })).toEqual({ status: 'ready', current });
  });
});
