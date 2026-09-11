import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Socket } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectDaemon } from '../connect-daemon.js';
import { selectEndpoint } from '../discovery.js';
import { writeDaemonRecord } from '../records.js';
import { createFrameDecoder, encodeMessage } from '../codec.js';
import { ipcFixture } from './ipc-fixture.js';
import { eventually } from './socket-fixture.js';

const dispose: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of dispose.splice(0).reverse()) await cleanup(); });
const options = { client: { name: 'connect-test', version: '0.0.0' }, engine: 'ramify.ts@0.0.0+typescript@7.0.2', start: 'never' as const, daemonEntry: null };

describe('public lightweight connector lifecycle', () => {
  it('returns not-running without starting when no record exists', async () => {
    const directory = await mkdtemp('/tmp/rc-'); dispose.push(() => rm(directory, { recursive: true, force: true }));
    expect(await connectDaemon({ ...options, endpointDirectory: directory })).toEqual({ status: 'not-running' });
  });

  it('treats incompatibility as terminal without invoking a configured entry', async () => {
    const fixture = await ipcFixture({}, true); dispose.push(() => fixture.dispose());
    const result = await connectDaemon({ ...options, engine: 'incompatible', start: 'if-needed', daemonEntry: '/must-not-launch.js', endpointDirectory: fixture.directory });
    expect(result).toMatchObject({ status: 'unavailable', reason: { kind: 'incompatible' }, attempts: 1 });
    expect(JSON.parse(await readFile(fixture.endpoint.record, 'utf8')).state).toBe('running');
    const compatible = await fixture.connect(); expect(await compatible.daemonStatus()).toMatchObject({ ok: true });
  });

  it('honors explicit stop during automatic recovery and leaves the stopped record intact', async () => {
    const fixture = await ipcFixture({}, true); dispose.push(() => fixture.dispose());
    const client = await fixture.connect();
    await fixture.host.stop('explicit', 'stop-test');
    await eventually(() => client.reason !== null);
    expect(await client.recover('automatic')).toMatchObject({ status: 'stopped', record: { state: 'stopped', stopped: { reason: 'explicit', requestId: 'stop-test' } } });
    expect(JSON.parse(await readFile(fixture.endpoint.record, 'utf8')).state).toBe('stopped');
  });

  it('bounds reconnect attempts after an unexpected transport loss', async () => {
    const directory = await mkdtemp('/tmp/rc-'); dispose.push(() => rm(directory, { recursive: true, force: true }));
    const endpoint = await selectEndpoint({ packageRoot: process.cwd(), version: options.client.version, endpointDirectory: directory });
    const instance = { instanceId: 'scripted-peer', pid: process.pid, buildKey: endpoint.buildKey, version: options.client.version, engine: options.engine };
    const sockets = new Set<Socket>();
    const server = createServer(socket => {
      sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket));
      const decoder = createFrameDecoder(4096, value => {
        if ((value as { type: string }).type === 'hello') socket.write(encodeMessage({ type: 'welcome', welcome: {
          protocol: 'ramify.ipc/1', instance, capabilities: ['daemon-control'], limits: { maxRequestBytes: 4096, maxResponseBytes: 4096, leaseMs: 1000, pingMs: 20 },
        } }));
      });
      socket.on('data', bytes => decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes));
    });
    dispose.push(async () => { for (const socket of sockets) socket.destroy(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); });
    await new Promise<void>(resolve => server.listen(endpoint.socket, resolve));
    await writeDaemonRecord(endpoint, { schemaVersion: 'ramify.daemon-record/1', ...instance, protocol: 'ramify.ipc/1', socket: endpoint.socket,
      startedAt: Date.now(), state: 'running', stopped: null });
    const result = await connectDaemon({ ...options, endpointDirectory: directory, timeouts: { reconnectAttempts: 2, reconnectBackoffMs: [5, 10], totalRecoveryMs: 100, restartAttempts: 0 } });
    if (result.status !== 'connected') throw new Error('Scripted peer did not connect');
    dispose.push(() => result.connection.close());
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await eventually(() => result.connection.reason !== null);
    const started = performance.now();
    expect(await result.connection.daemonStatus()).toMatchObject({ ok: false, error: { code: 'internal-error' } });
    expect(await result.connection.recover('automatic')).toMatchObject({ status: 'unavailable', attempts: 2, reason: { kind: 'failure' } });
    expect(performance.now() - started).toBeLessThan(500);
    const recovery = result.connection.recover('automatic');
    await result.connection.close();
    expect(await recovery).toMatchObject({ status: 'unavailable', reason: { kind: 'closed' } });
    expect(result.connection.state).toBe('closed');
  });
  it('reports a legacy empty lock as unavailable without guessing ownership', async () => {
    const directory = await mkdtemp('/tmp/rc-'); dispose.push(() => rm(directory, { recursive: true, force: true }));
    const endpoint = await selectEndpoint({ packageRoot: process.cwd(), version: '0.0.0', endpointDirectory: directory });
    await writeFile(endpoint.lock, '', { mode: 0o600 });
    expect(await connectDaemon({ ...options, endpointDirectory: directory })).toMatchObject({
      status: 'unavailable', attempts: 0, reason: { kind: 'failure', message: 'Empty legacy daemon start lock; ownership cannot be established' },
    });
    expect(await readFile(endpoint.lock, 'utf8')).toBe('');
  });

});
