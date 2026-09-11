import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createConnection, type Socket } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { DaemonBudgets, EndpointSelection, WireMessage } from '../interfaces/daemon.js';
import { createFrameDecoder, encodeMessage, validateWireMessage } from '../codec.js';
import { startDaemon } from '../start-daemon.js';
import { openSocketConnection } from '../connection.js';
import { selectEndpoint } from '../discovery.js';
import { connectDaemon } from '../connect-daemon.js';
import type { AnalysisDriver } from '../context-types.js';

export async function ipcFixture(overrides: Partial<DaemonBudgets> = {}, publicClient = false, driver?: AnalysisDriver) {
  const directory = await mkdtemp(join(tmpdir(), 'ri-'));
  const project = join(directory, 'project');
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, 'module.ramify'), 'ramify 1\nmodule example\n');
  await writeFile(join(project, 'README.md'), '# Example\n\nAn isolated IPC fixture.\n');
  await writeFile(join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', types: [] }, include: ['src/**/*.ts'] }));
  await writeFile(join(project, 'src/index.ts'), 'export const value = 1;\n');
  const selected = publicClient ? await selectEndpoint({ packageRoot: process.cwd(), version: '0.0.0', endpointDirectory: directory }) : undefined;
  const instance = selected ? { instanceId: randomUUID(), pid: process.pid, version: '0.0.0', engine: 'ramify.ts@0.0.0+typescript@7.0.2', buildKey: selected.buildKey } : undefined;
  const environment = await createQuickEnvironment({}, { instance, driver });
  const buildKey = environment.service.instance.buildKey;
  const prefix = join(directory, `daemon-${buildKey}`);
  const endpoint: EndpointSelection = { directory, buildKey, socket: `${prefix}.sock`, record: `${prefix}.json`, lock: `${prefix}.lock`, log: `${prefix}.log` };
  const budgets: DaemonBudgets = { maxConnections: 64, maxRequestBytes: 1024 ** 2, maxResponseBytes: 32 * 1024 ** 2 + 64 * 1024,
    maxOutboundBytes: 64 * 1024 ** 2, maxOutboundFrames: 256, maxRequestsInFlight: 16,
    leaseMs: 45_000, pingMs: 15_000, idleExitMs: 1_800_000, shutdownGraceMs: 100, ...overrides };
  const result = await startDaemon({ service: environment.service, endpoint, budgets, clock: environment.clock, log() {} });
  if (result.status !== 'started') throw new Error(`IPC host failed: ${JSON.stringify(result)}`);
  const sockets = new Set<Socket>();
  const connections = new Set<Awaited<ReturnType<typeof openSocketConnection>>>();
  async function raw(hello = true) {
    const socket = createConnection(endpoint.socket); sockets.add(socket); socket.on('error', () => {});
    const messages: WireMessage[] = [];
    const decoder = createFrameDecoder(budgets.maxResponseBytes, value => messages.push(validateWireMessage(value)));
    socket.on('data', bytes => decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes));
    const closed = new Promise<void>(resolve => socket.once('close', () => { decoder.dispose(); sockets.delete(socket); resolve(); }));
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    if (hello) socket.write(encodeMessage({ type: 'hello', handshake: { protocol: 'ramify.ipc/1', buildKey,
      engine: environment.service.instance.engine, client: { name: 'ipc-test', version: '0.0.0' } } }));
    return { socket, messages, closed, send(message: WireMessage) { socket.write(encodeMessage(message)); } };
  }
  async function connect() {
    if (publicClient) {
      const result = await connectDaemon({ start: 'never', daemonEntry: null, endpointDirectory: directory,
        client: { name: 'ipc-test', version: '0.0.0' }, engine: environment.service.instance.engine });
      if (result.status !== 'connected') throw new Error(`IPC connect failed: ${JSON.stringify(result)}`);
      const connection = result.connection;
      // Retain the same cleanup protocol while exposing the public API to callers.
      connections.add(connection as unknown as Awaited<ReturnType<typeof openSocketConnection>>);
      return connection;
    }
    const connection = await openSocketConnection(endpoint, { start: 'never', daemonEntry: null,
      client: { name: 'ipc-test', version: '0.0.0' }, engine: environment.service.instance.engine }, 2000, () => {});
    connections.add(connection); return Object.assign(connection, { recover: async () => ({ status: 'unavailable' as const, attempts: 0, reason: { kind: 'closed' as const } }) });
  }
  const params = { project: { cwd: project, root: project, scope: 'whole-project' as const, configuration: 'discover' as const },
    setup: { registry: 'default' as const, capabilities: [] } };
  return { directory, project, endpoint, environment, host: result.host, budgets, params, raw, connect,
    async dispose() {
      for (const socket of sockets) socket.destroy();
      await Promise.all([...connections].map(connection => connection.close()));
      await result.host.stop('explicit', randomUUID()); await environment.dispose();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
