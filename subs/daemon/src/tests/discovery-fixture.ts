import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { selectEndpoint } from '../discovery.js';
import type { DaemonRecord, EndpointSelection } from '../interfaces/daemon.js';
import { processAlive } from '../records.js';

/** A socket-readiness double, with no service, framing, contexts or engine. */
export const fakeEntry = `
import { createServer } from 'node:net';
import { appendFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 },
  (_, i) => [process.argv[2 + i * 2], process.argv[3 + i * 2]]));
const prefix = join(args['--endpoint-dir'], 'daemon-' + args['--build-key']);
writeFileSync(prefix + '.pid', String(process.pid));
appendFileSync(prefix + '.launches', String(process.pid) + '\\n');
const record = { schemaVersion: 'ramify.daemon-record/1', instanceId: 'fake-' + process.pid,
  pid: process.pid, buildKey: args['--build-key'], version: args['--version'], engine: args['--engine'],
  protocol: 'ramify.ipc/1', socket: prefix + '.sock', startedAt: Date.now(), state: 'running', stopped: null };
const server = createServer(socket => socket.end());
server.listen(record.socket, () => {
  writeFileSync(prefix + '.tmp', JSON.stringify(record), { mode: 0o600 });
  renameSync(prefix + '.tmp', prefix + '.json');
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
`;

// Socket fixtures use a short unique directory independently of a relocated
// test process's potentially long TMPDIR. The runtime socket bound is unchanged.
export async function discoveryFixture(entry = fakeEntry, temporaryDirectory = '/tmp') {
  const root = await realpath(await mkdtemp(join(temporaryDirectory, 'r7-')));
  const packageRoot = join(root, 'pkg'), endpointDirectory = join(root, 'e');
  await mkdir(join(packageRoot, 'dist/src'), { recursive: true });
  await mkdir(join(packageRoot, 'dist/subs/analysis/src'), { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'fake', version: '1', type: 'module',
    exports: { '.': './dist/subs/analysis/src/index.js' } }));
  await writeFile(join(packageRoot, 'dist/src/daemon-entry.js'), entry);
  await writeFile(join(packageRoot, 'dist/subs/analysis/src/index.js'), 'throw new Error("Discovery imported an engine");');
  const options = { packageRoot, version: '1', endpointDirectory };
  const endpoint = await selectEndpoint(options);
  return { root, packageRoot, endpoint, options,
    launch: { endpoint, daemonEntry: join(packageRoot, 'dist/src/daemon-entry.js'), version: '1', engine: 'fake-engine', startupMs: 3000 },
    async dispose() {
      try {
        const pid = Number(await readFile(endpoint.record.replace(/\.json$/, '.pid'), 'utf8'));
        if (processAlive(pid)) process.kill(pid, 'SIGKILL');
        const deadline = performance.now() + 3000;
        while (processAlive(pid)) {
          if (performance.now() >= deadline) throw new Error(`Fake entry ${pid} survived teardown`);
          await new Promise(done => setTimeout(done, 10));
        }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await rm(root, { recursive: true, force: true });
    } };
}

export function daemonRecord(endpoint: EndpointSelection, overrides: Partial<DaemonRecord> = {}): DaemonRecord {
  return { schemaVersion: 'ramify.daemon-record/1', instanceId: 'owner-test', pid: process.pid,
    buildKey: endpoint.buildKey, version: '1', engine: 'fake-engine', protocol: 'ramify.ipc/1', socket: endpoint.socket,
    startedAt: 100, state: 'running', stopped: null, ...overrides };
}

export async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise<void>((accept, reject) => { child.once('error', reject); child.once('close', () => accept()); });
  if (!child.pid || processAlive(child.pid)) throw new Error('Expected an exited and reaped fixture pid');
  return child.pid;
}
