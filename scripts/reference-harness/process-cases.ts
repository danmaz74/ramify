import { advisoryUpperBound, requireMeasuredBytes } from './performance-observations.js';
import { chmod, cp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectDaemon } from '../../subs/daemon/src/connect-daemon.js';
import { readDaemonRecord, selectEndpoint } from '../../subs/daemon/src/discovery.js';
import { writeDaemonRecord } from '../../subs/daemon/src/records.js';
import { deadPid } from '../../subs/daemon/src/tests/discovery-fixture.js';
import type { DaemonRecord, EndpointSelection, ServiceConnection } from '../../subs/daemon/src/interfaces/daemon.js';
import { processAlive, waitForProcessCondition, withProcessScope } from '../../src/tests/lifecycle-process.js';
import type { ProcessScope, LiveProcess } from '../../src/tests/lifecycle-process.js';
import { repositoryRoot } from './plan.js';
import { referenceRoot } from './fixtures/plan2/reference.js';
import { archiveObservation, recordObservation, traceEvidence } from './observations.js';
import type { Assertions, InstanceHandler } from './runner.js';

const version = '0.0.0', engine = 'ramify.ts@0.0.0+typescript@7.0.2';
const daemonEntry = join(repositoryRoot, 'dist/src/daemon-entry.js');
const clientEntry = pathToFileURL(join(repositoryRoot, 'dist/subs/daemon/src/client-entry.js')).href;
const options = (directory: string) => ({ endpointDirectory: directory, client: { name: 'reference-process', version }, engine,
  daemonEntry, start: 'never' as const });
function entryArgs(endpoint: EndpointSelection, budgets: Record<string, number> = {}): string[] {
  return [daemonEntry, '--endpoint-dir', endpoint.directory, '--build-key', endpoint.buildKey,
    '--version', version, '--engine', engine, '--budgets', JSON.stringify(budgets)];
}
async function connect(directory: string): Promise<ServiceConnection> {
  const result = await connectDaemon(options(directory));
  if (result.status !== 'connected') throw new Error(`Expected resident connection: ${JSON.stringify(result)}`);
  return result.connection;
}
async function running(endpoint: EndpointSelection): Promise<DaemonRecord> {
  let record: DaemonRecord | null = null;
  await waitForProcessCondition('Daemon running record', 10_000, async () => { record = await readDaemonRecord(endpoint); return record?.state === 'running'; });
  return record!;
}
async function stop(endpoint: EndpointSelection): Promise<void> {
  const record = await readDaemonRecord(endpoint);
  if (!record || !processAlive(record.pid)) return;
  const client = await connect(endpoint.directory);
  try { await client.stopDaemon({ instanceId: record.instanceId }); } finally { await client.close(); }
  await waitForProcessCondition('Daemon exits after stop', 7000, () => !processAlive(record.pid));
}
export async function withResident<T>(run: (scope: ProcessScope, endpoint: EndpointSelection, start: (budgets?: Record<string, number>) => Promise<LiveProcess>) => Promise<T>): Promise<T> {
  return withProcessScope(async scope => {
    const endpoint = await selectEndpoint({ packageRoot: repositoryRoot, version, endpointDirectory: scope.endpointDirectory });
    const start = async (budgets: Record<string, number> = {}) => {
      const process = scope.start({ cwd: repositoryRoot, args: entryArgs(endpoint, budgets), timeoutMs: 120_000 });
      await running(endpoint); return process;
    };
    try { return await run(scope, endpoint, start); }
    finally { await stop(endpoint); }
  });
}
export async function reference(directory: string): Promise<string> {
  const project = join(directory, 'reference');
  await cp(referenceRoot, project, { recursive: true, filter: source => !relative(referenceRoot, source).split(/[\\/]/).some(part => ['node_modules', 'dist', '.git', '.reference-work'].includes(part)) });
  await symlink(join(referenceRoot, 'node_modules'), join(project, 'node_modules'));
  return project;
}
function inline(scope: ProcessScope, source: string, timeoutMs = 30_000): LiveProcess {
  return scope.start({ cwd: repositoryRoot, args: ['--input-type=module', '-e', source], timeoutMs });
}
const handlers: [string, InstanceHandler][] = [];
function add(id: string, run: (assertions: Assertions) => Promise<void>): void {
  handlers.push([id, { kind: 'memory', run: ({ assertions }) => run(assertions) }]);
}

add('I2-15:abrupt-host-loss', assertions => withResident(async (scope, endpoint, start) => {
  const daemon = await start({ leaseMs: 1000, pingMs: 250 });
  const project = await reference(scope.endpointDirectory);
  const child = inline(scope, `import {connectDaemon} from ${JSON.stringify(clientEntry)};
    const outcome = await connectDaemon(${JSON.stringify(options(endpoint.directory))});
    if(outcome.status!=='connected')throw new Error(JSON.stringify(outcome));
    const connection=outcome.connection;
    const opened=await connection.openContext({project:{cwd:${JSON.stringify(project)},root:${JSON.stringify(project)},scope:'whole-project',configuration:'discover'},setup:{registry:'default',capabilities:[]}});
    if(!opened.ok||opened.value.status!=='opened')throw new Error(JSON.stringify(opened));
    const subscribed=await connection.subscribe({token:opened.value.token},()=>{});
    if(!subscribed.ok)throw new Error(JSON.stringify(subscribed));
    console.log('subscribed');
    setInterval(()=>{},1000);`);
  await child.waitForOutput('subscribed', 30_000);
  const other = await connect(endpoint.directory);
  try {
    const before = await other.daemonStatus(); assertions.ok('real child owns one subscription', before.ok && before.value.subscriptions === 1);
    const killedAt = performance.now(); child.signal('SIGKILL'); await child.waitForExit(3000);
    await waitForProcessCondition('Abrupt client lease released', 1000, async () => { const status = await other.daemonStatus(); return status.ok && status.value.subscriptions === 0; });
    assertions.ok('lease is released within leaseMs after SIGKILL', performance.now() - killedAt <= 1000);
    assertions.ok('another client and the daemon remain alive', processAlive(daemon.pid) && (await other.daemonStatus()).ok);
    recordObservation('ipc-abrupt-client', { killed: child.pid, daemon: daemon.pid, releaseMs: performance.now() - killedAt });
  } finally { await other.close(); }
}));

add('I2-15:client-entry-lightweight', assertions => withProcessScope(async scope => {
  const child = inline(scope, `await import(${JSON.stringify(clientEntry)}); console.log(JSON.stringify({rss:process.memoryUsage().rss}));`);
  const exit = await child.waitForExit(5000);
  assertions.equal('client-only process exits successfully', [exit.code, child.stderr], [0, '']);
  const events = (await scope.events()).filter(event => event.pid === child.pid);
  const loads = events.flatMap(event => [event.url ?? '', ...event.commonjs ?? []]).filter(Boolean);
  assertions.ok('the real client entry was loaded', loads.some(value => value.endsWith('/subs/daemon/src/client-entry.js')));
  const forbidden = /\/dist\/(?:subs\/analysis\/|subs\/daemon\/subs\/contexts\/|subs\/daemon\/src\/(?:service|host|start-daemon|filesystem-watcher|system-clock)\.js)|\/(?:typescript|@typescript|react|react-dom|d3-[^/]+)\//;
  assertions.equal('client closure excludes analysis, contexts, host, compiler and UI', loads.filter(value => forbidden.test(value)), []);
  assertions.equal('importing the client does not start or connect any process', events.filter(event => ['connect', 'spawn', 'listen', 'bind'].includes(event.event)), []);
  const memory = JSON.parse(child.stdout) as { rss: number };
  requireMeasuredBytes([memory.rss]);
  assertions.ok('empty client process RSS has an actual finite observation', Number.isFinite(memory.rss));
  recordObservation('client-entry-footprint', { pid: child.pid, rss: memory.rss,
    performance: advisoryUpperBound(memory.rss, 64 * 1024 ** 2), trace: traceEvidence(events),
    raw: await archiveObservation('client-entry-footprint', { pid: child.pid, rss: memory.rss, events }) });
}));

add('I2-17:simultaneous-start', assertions => withResident(async (scope, endpoint) => {
  const children = Array.from({ length: 8 }, () => inline(scope, `import {connectDaemon} from ${JSON.stringify(clientEntry)};
    const result=await connectDaemon(${JSON.stringify({ ...options(endpoint.directory), start: 'if-needed' })});
    if(result.status!=='connected')throw new Error(JSON.stringify(result));
    console.log(JSON.stringify({instance:result.connection.daemon.instance,started:result.started}));
    await result.connection.close();`));
  for (const [index, child] of children.entries()) assertions.equal(`contender ${index} connects successfully`, [(await child.waitForExit(20_000)).code, child.stderr], [0, '']);
  const outcomes = children.map(child => JSON.parse(child.stdout) as { instance: { instanceId: string; pid: number }; started: boolean });
  assertions.equal('all eight clients select one daemon instance', new Set(outcomes.map(value => value.instance.instanceId)).size, 1);
  assertions.equal('exactly one client starts that daemon', outcomes.filter(value => value.started).length, 1);
  assertions.equal('exactly one daemon record exists', (await readdir(endpoint.directory)).filter(path => /^daemon-[0-9a-f]+\.json$/.test(path)).length, 1);
  const events = await scope.events();
  assertions.equal('trace contains exactly one daemon-entry launch', events.filter(event => event.event === 'spawn' && event.args?.[0] === daemonEntry).length, 1);
  const evidence = { clients: children.map(child => child.pid), instance: outcomes[0].instance, events };
  recordObservation('simultaneous-start', { clients: evidence.clients, instance: evidence.instance, trace: traceEvidence(events),
    raw: await archiveObservation('simultaneous-start', evidence) });
}));

add('I2-17:stale-record', assertions => withResident(async (scope, endpoint) => {
  const pid = await deadPid();
  await writeDaemonRecord(endpoint, { schemaVersion: 'ramify.daemon-record/1', instanceId: 'stale', pid, buildKey: endpoint.buildKey,
    version, engine, protocol: 'ramify.ipc/1', socket: endpoint.socket, startedAt: Date.now(), state: 'running', stopped: null });
  await writeFile(endpoint.socket, 'dangling endpoint');
  const client = inline(scope, `import {connectDaemon} from ${JSON.stringify(clientEntry)};
    const result=await connectDaemon(${JSON.stringify({ ...options(endpoint.directory), start: 'if-needed' })});
    if(result.status!=='connected')throw new Error(JSON.stringify(result));console.log(JSON.stringify(result.connection.daemon.instance));await result.connection.close();`);
  assertions.equal('client reclaims the stale record and starts successfully', [(await client.waitForExit(20_000)).code, client.stderr], [0, '']);
  const record = await running(endpoint);
  assertions.ok('replacement uses a new live process', record.pid !== pid && processAlive(record.pid));
  assertions.ok('stale identity is never retained', record.instanceId !== 'stale');
}));

add('I2-17:stale-lock', async assertions => {
  await withResident(async (scope, endpoint) => {
    const pid = await deadPid();
    await writeFile(endpoint.lock, JSON.stringify({ pid, at: Date.now() - 31_000 }), { mode: 0o600 });
    const child = inline(scope, `import {connectDaemon} from ${JSON.stringify(clientEntry)};
      const result=await connectDaemon(${JSON.stringify({ ...options(endpoint.directory), start: 'if-needed' })});
      if(result.status!=='connected')throw new Error(JSON.stringify(result));console.log('connected');await result.connection.close();`);
    assertions.equal('dead lock holder is reclaimed and startup succeeds', [(await child.waitForExit(20_000)).code, child.stdout.trim()], [0, 'connected']);
    assertions.ok('a live daemon replaces the dead startup owner', processAlive((await running(endpoint)).pid));
  });
  await withResident(async (scope, endpoint) => {
    const lock = JSON.stringify({ pid: process.pid, at: Date.now() - 31_000 });
    await writeFile(endpoint.lock, lock, { mode: 0o600 });
    const child = inline(scope, `import {connectDaemon} from ${JSON.stringify(clientEntry)};
      const result=await connectDaemon(${JSON.stringify({ ...options(endpoint.directory), start: 'if-needed', timeouts: { startupMs: 100, startAttempts: 1 } })});console.log(JSON.stringify(result));`);
    await child.waitForExit(5000);
    assertions.equal('an old live lock returns bounded unavailable', JSON.parse(child.stdout).status, 'unavailable');
    assertions.equal('a live holder lock is unchanged', await readFile(endpoint.lock, 'utf8'), lock);
    assertions.equal('live-holder timeout starts no child daemon', (await scope.events()).filter(event => event.event === 'spawn'), []);
  });
});

add('I2-17:already-running-exit', assertions => withResident(async (scope, endpoint, start) => {
  await start();
  const before = await readFile(endpoint.record, 'utf8');
  const duplicate = scope.start({ cwd: repositoryRoot, args: entryArgs(endpoint), timeoutMs: 10_000 });
  assertions.equal('duplicate daemon exits with the documented code', (await duplicate.waitForExit(5000)).code, 3);
  assertions.equal('duplicate process leaves the live record byte-identical', await readFile(endpoint.record, 'utf8'), before);
}));

add('I2-17:directory-ownership', assertions => withProcessScope(async scope => {
  await chmod(scope.endpointDirectory, 0o755);
  try {
    const child = inline(scope, `import {connectDaemon} from ${JSON.stringify(clientEntry)};
      console.log(JSON.stringify(await connectDaemon(${JSON.stringify({ ...options(scope.endpointDirectory), start: 'if-needed' })})));`);
    await child.waitForExit(5000);
    const result = JSON.parse(child.stdout) as { status: string; message: string };
    assertions.equal('unsafe directory returns unavailable', result.status, 'unavailable');
    assertions.ok('the permission diagnostic names the required owner and mode', result.message.includes('0700') && result.message.includes('owner'));
    assertions.equal('unsafe endpoint starts no daemon', (await scope.events()).filter(event => event.event === 'spawn'), []);
  } finally { await chmod(scope.endpointDirectory, 0o700); }
}));

export const daemonProcessHandlers: ReadonlyMap<string, InstanceHandler> = new Map(handlers);
