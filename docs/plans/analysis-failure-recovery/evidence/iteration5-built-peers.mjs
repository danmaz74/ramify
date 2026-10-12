import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const oldDist = process.env.RAMIFY_OLD_DIST;
if (!oldDist) throw new Error('Set RAMIFY_OLD_DIST to the preserved /2 build');
const root = process.cwd();
const load = async (dist, name) => import(pathToFileURL(join(dist, 'subs/daemon/src', name)).href);
const old = { start: (await load(oldDist, 'start-daemon.js')).startDaemon,
  connect: (await load(oldDist, 'connection.js')).openSocketConnection };
const current = { start: (await load(join(root, 'dist'), 'start-daemon.js')).startDaemon,
  connect: (await load(join(root, 'dist'), 'connection.js')).openSocketConnection };
const buildKey = '0123456789abcdef';
const instance = { instanceId: 'built-pair', pid: process.pid, version: '0.4.3', engine: 'built-pair', buildKey };
const budgets = { maxConnections: 2, maxRequestBytes: 8192, maxResponseBytes: 8192,
  maxOutboundBytes: 65536, maxOutboundFrames: 16, maxRequestsInFlight: 2,
  leaseMs: 10000, pingMs: 5000, idleExitMs: 60000, shutdownGraceMs: 100 };
const clock = { now: () => Date.now(), schedule: (ms, callback) => {
  const timer = setTimeout(callback, ms); return () => clearTimeout(timer);
} };
const options = { client: { name: 'built-opposite-client', version: instance.version }, engine: instance.engine,
  start: 'never', daemonEntry: null };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [label, serverBuild, clientBuild, offered, sent] of [
  ['old-client-new-daemon', current, old, 'ramify.ipc/3', 'ramify.ipc/2'],
  ['new-client-old-daemon', old, current, 'ramify.ipc/2', 'ramify.ipc/3'],
]) {
  const directory = await mkdtemp('/tmp/r5-peer-');
  const endpoint = { directory, buildKey, buildIdentity: '0'.repeat(64),
    ...Object.fromEntries([['socket', 'sock'], ['record', 'json'], ['lock', 'lock'], ['log', 'log']]
      .map(([key, suffix]) => [key, join(directory, `daemon-${buildKey}.${suffix}`)])) };
  let leases = 0;
  const service = { instance, onStop: () => () => {}, dispose: async () => {},
    lease: () => { leases++; throw new Error('A mismatched peer obtained a service lease'); } };
  let host;
  try {
    const started = await serverBuild.start({ service, endpoint, budgets, clock, log: () => {} });
    if (started.status !== 'started') throw new Error(`${label}: startup: ${JSON.stringify(started)}`);
    host = started.host;
    const record = JSON.parse(await readFile(endpoint.record, 'utf8'));
    if (record.protocol !== offered) throw new Error(`${label}: wrong record ${record.protocol}`);
    let reason;
    try { const connection = await clientBuild.connect(endpoint, options, 1000, () => {});
      await connection.close(); throw new Error(`${label}: unexpectedly connected`);
    } catch (error) {
      if (!error.reason || error.reason.kind !== 'incompatible') throw error;
      reason = error.reason;
    }
    if (leases !== 0) throw new Error(`${label}: operation lease created`);
    console.log(JSON.stringify({ label, sent, offered, record: record.protocol, reason, leases,
      serverHostSha256: digest(await readFile(join(serverBuild === old ? oldDist : join(root, 'dist'), 'subs/daemon/src/host.js'))),
      clientConnectionSha256: digest(await readFile(join(clientBuild === old ? oldDist : join(root, 'dist'), 'subs/daemon/src/connection.js'))) }));
  } finally {
    if (host) await host.stop('explicit', label);
    await rm(directory, { recursive: true, force: true });
  }
}
