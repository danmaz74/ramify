import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Socket } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectDaemon } from '../connect-daemon.js';
import { selectEndpoint } from '../discovery.js';
import { writeDaemonRecord } from '../records.js';
import { createFrameDecoder, encodeJsonFrame, encodeMessage } from '../codec.js';
import { openSocketConnection } from '../connection.js';
import { ipcFixture, packageEngine, packageVersion } from './ipc-fixture.js';
import { eventually } from './socket-fixture.js';

const dispose: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of dispose.splice(0).reverse()) await cleanup(); });
const options = { client: { name: 'connect-test', version: packageVersion }, engine: packageEngine, start: 'never' as const, daemonEntry: null };

describe('public lightweight connector lifecycle', () => {
  it('FR18/FR19: a socket preserves both reportless evidence carriers and closes on malformed recovery', async () => {
    const directory = await mkdtemp('/tmp/rc-evidence-'); dispose.push(() => rm(directory, { recursive: true, force: true }));
    const endpoint = await selectEndpoint({ packageRoot: process.cwd(), version: packageVersion, endpointDirectory: directory });
    const instance = { instanceId: 'evidence-peer', pid: process.pid, buildKey: endpoint.buildKey,
      version: packageVersion, engine: packageEngine };
    const sockets = new Set<Socket>(); let requests = 0;
    const recovery = { schemaVersion: 'ramify.recovery/1', lastCompleted: null,
      changes: { paths: ['src/index.ts'], coverage: 'unavailable', reason: 'no-completed-baseline' } };
    const diagnostic = { id: 'producer:missing', category: 'missing-export', code: 'missing-export',
      message: 'Export is missing', location: { file: 'src/index.ts', start: 4, end: 8, line: 1, column: 5 },
      related: [{ file: 'subs/owner/src/api.ts', start: 1, end: 2, line: 1, column: 2 }],
      importer: { owner: 'example', kind: 'ordinary', root: 'src', profile: [] },
      original: { kind: 'code', owner: 'example', file: 'src/index.ts', binding: 'value' }, accessId: 'access:1' };
    const stages = [{ stage: 'link', status: 'invalid', blockedBy: [], diagnosticIds: ['producer:missing'] }];
    const server = createServer(socket => {
      sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket));
      const decoder = createFrameDecoder(8192, value => {
        const message = value as { type: string; id?: string };
        if (message.type === 'hello') socket.write(encodeJsonFrame({ type: 'welcome', welcome: {
          protocol: 'ramify.ipc/3', instance, capabilities: ['check'],
          limits: { maxRequestBytes: 8192, maxResponseBytes: 8192, leaseMs: 1000, pingMs: 20 },
        } }, 8192));
        if (message.type === 'request') {
          requests++;
          const evidence = requests < 3 ? recovery : { ...recovery, changes: { ...recovery.changes, paths: ['b.ts', 'a.ts'] } };
          const details = { diagnostics: [diagnostic], stages, recovery: evidence };
          const result = requests === 1 ? { ok: true, value: { status: 'unavailable', requestId: 'reportless',
            reason: 'analysis-failed', message: 'analysis failed before a report', ...details } } :
            { ok: false, error: { code: 'internal-error', message: 'analysis failed before a report', details: {}, ...details } };
          socket.write(encodeJsonFrame({ type: 'response', id: message.id, result }, 8192));
        }
      });
      socket.on('data', bytes => decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes));
    });
    dispose.push(async () => { for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); });
    await new Promise<void>(resolve => server.listen(endpoint.socket, resolve));
    const client = await openSocketConnection(endpoint, options, 1000, () => {});
    dispose.push(() => client.close());
    const params = { token: { context: `ctx/1:${'0'.repeat(64)}`, generation: 'gen/1:11111111-1111-4111-8111-111111111111' },
      requestId: 'reportless', freshness: { mode: 'published' as const, wait: false } };
    const value = await client.check(params);
    expect(value).toEqual({ ok: true, value: { status: 'unavailable', requestId: 'reportless',
      reason: 'analysis-failed', message: 'analysis failed before a report', diagnostics: [diagnostic], stages, recovery } });
    const error = await client.check({ ...params, requestId: 'service-error' });
    expect(error).toEqual({ ok: false, error: { code: 'internal-error',
      message: 'analysis failed before a report', details: {}, diagnostics: [diagnostic], stages, recovery } });
    if (!value.ok || value.value.status !== 'unavailable' || error.ok) throw new Error('Expected distinct evidence carriers');
    expect({ diagnostics: value.value.diagnostics, stages: value.value.stages, recovery: value.value.recovery })
      .toEqual({ diagnostics: error.error.diagnostics, stages: error.error.stages, recovery: error.error.recovery });
    expect(await client.check({ ...params, requestId: 'malformed' })).toMatchObject({ ok: false });
    await eventually(() => client.reason !== null);
    expect(client.reason).toMatchObject({ kind: 'failure' });
    expect(requests).toBe(3);
  });
  it('classifies an old /2 welcome as incompatible before sending an operation', async () => {
    const directory = await mkdtemp('/tmp/rc-old-'); dispose.push(() => rm(directory, { recursive: true, force: true }));
    const endpoint = await selectEndpoint({ packageRoot: process.cwd(), version: packageVersion, endpointDirectory: directory });
    const instance = { instanceId: 'old-peer', pid: process.pid, buildKey: endpoint.buildKey,
      version: packageVersion, engine: packageEngine };
    const sockets = new Set<Socket>();
    const received: unknown[] = [];
    const server = createServer(socket => {
      sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket));
      const decoder = createFrameDecoder(4096, value => {
        received.push(value);
        if ((value as { type?: string }).type === 'hello') socket.write(encodeJsonFrame({ type: 'welcome', welcome: {
          protocol: 'ramify.ipc/2', instance, capabilities: ['contexts', 'check'],
          limits: { maxRequestBytes: 4096, maxResponseBytes: 4096, leaseMs: 1000, pingMs: 20 },
        } }, 4096));
      });
      socket.on('data', bytes => decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes));
    });
    dispose.push(async () => { for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); });
    await new Promise<void>(resolve => server.listen(endpoint.socket, resolve));
    await expect(openSocketConnection(endpoint, options, 1000, () => {})).rejects.toMatchObject({
      reason: { kind: 'incompatible', daemon: 'ramify.ipc/2', client: 'ramify.ipc/3' },
    });
    expect(received).toMatchObject([{ type: 'hello', handshake: { protocol: 'ramify.ipc/3' } }]);
  });
  it('returns not-running without starting when no record exists', async () => {
    const directory = await mkdtemp('/tmp/rc-'); dispose.push(() => rm(directory, { recursive: true, force: true }));
    expect(await connectDaemon({ ...options, endpointDirectory: directory })).toEqual({ status: 'not-running' });
  });

  it('reports a /2 discovery record as incompatible before attempting startup', async () => {
    const directory = await mkdtemp('/tmp/rc-old-record-'); dispose.push(() => rm(directory, { recursive: true, force: true }));
    const endpoint = await selectEndpoint({ packageRoot: process.cwd(), version: packageVersion, endpointDirectory: directory });
    await writeFile(endpoint.record, JSON.stringify({ schemaVersion: 'ramify.daemon-record/1', instanceId: 'old-peer',
      pid: process.pid, buildKey: endpoint.buildKey, version: packageVersion, engine: packageEngine,
      protocol: 'ramify.ipc/2', socket: endpoint.socket, startedAt: Date.now(), state: 'running', stopped: null }), { mode: 0o600 });
    expect(await connectDaemon({ ...options, start: 'if-needed', daemonEntry: '/must-not-launch.js', endpointDirectory: directory }))
      .toMatchObject({ status: 'unavailable', attempts: 0,
        reason: { kind: 'incompatible', daemon: 'ramify.ipc/2', client: 'ramify.ipc/3' } });
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
          protocol: 'ramify.ipc/3', instance, capabilities: ['daemon-control'], limits: { maxRequestBytes: 4096, maxResponseBytes: 4096, leaseMs: 1000, pingMs: 20 },
        } }));
      });
      socket.on('data', bytes => decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes));
    });
    dispose.push(async () => { for (const socket of sockets) socket.destroy(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); });
    await new Promise<void>(resolve => server.listen(endpoint.socket, resolve));
    await writeDaemonRecord(endpoint, { schemaVersion: 'ramify.daemon-record/1', ...instance, protocol: 'ramify.ipc/3', socket: endpoint.socket,
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
    const endpoint = await selectEndpoint({ packageRoot: process.cwd(), version: packageVersion, endpointDirectory: directory });
    await writeFile(endpoint.lock, '', { mode: 0o600 });
    expect(await connectDaemon({ ...options, endpointDirectory: directory })).toMatchObject({
      status: 'unavailable', attempts: 0, reason: { kind: 'failure', message: 'Empty legacy daemon start lock; ownership cannot be established' },
    });
    expect(await readFile(endpoint.lock, 'utf8')).toBe('');
  });

});
