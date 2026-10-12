import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, connect } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const currentRoot = resolve('.');
const oldRoot = process.argv[2];
if (!oldRoot) throw new Error('Usage: node scripts/measurements/ownership-peers.mjs <isolated-old-package-root>');
const old = resolve(oldRoot);
const scratch = await mkdtemp(join(tmpdir(), 'ramify-peers-'));
const endpointDir = join(scratch, 'e');
const project = join(scratch, 'project');
await mkdir(endpointDir, { mode: 0o700 });
await mkdir(join(project, 'src'), { recursive: true });
await writeFile(join(project, 'module.ramify'), 'ramify 1\nroot module peer\n');
await writeFile(join(project, 'src/index.ts'), 'export const value = 1;\n');
await writeFile(join(project, 'tsconfig.json'), '{"compilerOptions":{"types":[]},"include":["src"]}');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const packageInfo = async root => ({ root, version: JSON.parse(await readFile(join(root, 'package.json'))).version,
  runtimeIdentitySha256: sha256(await readFile(join(root, 'dist/runtime-identity.json'))),
  launcherSha256: sha256(await readFile(join(root, 'dist/src/ramify'))) });
const oldInfo = await packageInfo(old), newInfo = await packageInfo(currentRoot);
const discovery = async root => (await import(pathToFileURL(join(root, 'dist/subs/daemon/src/discovery.js')).href))
  .selectEndpoint({ packageRoot: root, version: JSON.parse(await readFile(join(root, 'package.json'))).version,
    endpointDirectory: endpointDir });
async function invoke(root, argv) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(join(root, 'dist/src/ramify'), argv,
      { cwd: project, env: { ...process.env, NODE_OPTIONS: '', RAMIFY_ENDPOINT_DIR: endpointDir }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 30_000);
    child.stdout.on('data', value => { stdout += String(value); });
    child.stderr.on('data', value => { stderr += String(value); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); timedOut ? reject(new Error('Installed peer command timed out'))
      : resolveResult({ code, stdout, stderr }); });
  });
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch (error) {
  if (error.code === 'ESRCH') return false; throw error; } }
async function untilDead(pid) {
  for (let attempt = 0; attempt < 100; attempt++) { if (!alive(pid)) return; await new Promise(done => setTimeout(done, 20)); }
  throw new Error(`Owned daemon ${pid} survived stop`);
}
const observations = [];
const relayedHandshakes = [];
try {
  for (const [name, server, client, expectedProtocol] of [
    ['new-client-old-daemon', old, currentRoot, 'ramify.ipc/2'],
    ['old-client-new-daemon', currentRoot, old, 'ramify.ipc/3'],
  ]) {
    const serverEndpoint = await discovery(server), clientEndpoint = await discovery(client);
    let pid;
    try {
      const started = await invoke(server, ['check', '--format', 'json']);
      assert.equal(started.code, 0, `${name}: server startup: ${started.stderr} ${started.stdout}`);
      const record = JSON.parse(await readFile(serverEndpoint.record));
      pid = record.pid;
      assert.equal(record.protocol, expectedProtocol);
      assert.ok(alive(pid));
      // Discovery is intentionally keyed by build identity. Put the other peer's
      // actual process record at the client's selected key to exercise its
      // installed startup refusal without mutating either package or daemon.
      await writeFile(clientEndpoint.record, JSON.stringify({ ...record,
        buildKey: clientEndpoint.buildKey, socket: clientEndpoint.socket }) + '\n', { mode: 0o600 });
      const refused = await invoke(client, ['check', '--format', 'json']);
      assert.equal(refused.code, 2, `${name}: ${refused.stderr} ${refused.stdout}`);
      const document = refused.stdout ? JSON.parse(refused.stdout) : null;
      assert.equal(document?.schemaVersion, client === currentRoot ? 'ramify.cli/2' : 'ramify.cli/1');
      assert.ok(alive(pid), `${name}: opposite client stopped server`);
      observations.push({ name, serverProtocol: record.protocol, clientSchema: document.schemaVersion,
        clientExit: refused.code, diagnostics: document.diagnostics.map(item => ({ code: item.code, message: item.message })),
        actualServerPid: pid, clientStartedDaemon: false, injectedDiscoveryRecord: true });
    } finally {
      await rm(clientEndpoint.record, { force: true });
      if (pid) {
        try { await invoke(server, ['daemon', 'stop']); }
        finally { await untilDead(pid); }
      }
    }
  }
  for (const [name, server, client, serverProtocol, clientProtocol] of [
    ['new-client-old-daemon', old, currentRoot, 'ramify.ipc/2', 'ramify.ipc/3'],
    ['old-client-new-daemon', currentRoot, old, 'ramify.ipc/3', 'ramify.ipc/2'],
  ]) {
    const serverEndpoint = await discovery(server), clientEndpoint = await discovery(client);
    let pid, relay;
    const sockets = new Set(), clientFrames = [];
    try {
      const started = await invoke(server, ['check', '--format', 'json']);
      assert.equal(started.code, 0, `${name}: server startup: ${started.stderr} ${started.stdout}`);
      const record = JSON.parse(await readFile(serverEndpoint.record));
      pid = record.pid;
      assert.equal(record.protocol, serverProtocol);
      relay = createServer(upstream => {
        const downstream = connect(serverEndpoint.socket);
        sockets.add(upstream); sockets.add(downstream);
        let pending = Buffer.alloc(0);
        upstream.on('data', bytes => {
          pending = Buffer.concat([pending, bytes]);
          while (pending.length >= 4) {
            const length = pending.readUInt32BE(0);
            if (pending.length < length + 4) break;
            clientFrames.push(JSON.parse(pending.subarray(4, length + 4).toString('utf8')).type);
            pending = pending.subarray(length + 4);
          }
        });
        upstream.on('error', () => {}); downstream.on('error', () => {});
        upstream.once('close', () => { sockets.delete(upstream); downstream.destroy(); });
        downstream.once('close', () => { sockets.delete(downstream); upstream.destroy(); });
        upstream.pipe(downstream).pipe(upstream);
      });
      await new Promise((resolveRelay, reject) => { relay.once('error', reject); relay.listen(clientEndpoint.socket, resolveRelay); });
      // Controlled relay only: each installed client sees a locally accepted
      // discovery record, while its actual framed hello reaches the opposite
      // real daemon. Native discovery remains covered by observations above.
      await writeFile(clientEndpoint.record, JSON.stringify({ ...record, protocol: clientProtocol,
        buildKey: clientEndpoint.buildKey, socket: clientEndpoint.socket }) + '\n', { mode: 0o600 });
      const refused = await invoke(client, ['check', '--format', 'json']);
      assert.equal(refused.code, 2, `${name}: ${refused.stderr} ${refused.stdout}`);
      const document = JSON.parse(refused.stdout);
      assert.ok(document.diagnostics.some(item => item.code === 'incompatible'), `${name}: ${refused.stdout}`);
      assert.deepEqual(clientFrames, ['hello'], `${name}: a request escaped the incompatible handshake`);
      assert.ok(alive(pid));
      relayedHandshakes.push({ name, serverProtocol, clientProtocol, clientExit: refused.code,
        clientSchema: document.schemaVersion, diagnostics: document.diagnostics.map(item => ({ code: item.code, message: item.message })),
        actualServerPid: pid, clientFrames, operationAccepted: false, controlledRelay: true, injectedDiscoveryRecord: true });
    } finally {
      await rm(clientEndpoint.record, { force: true });
      for (const socket of sockets) socket.destroy();
      if (relay) await new Promise(resolveRelay => relay.close(() => resolveRelay()));
      if (pid) {
        try { await invoke(server, ['daemon', 'stop']); }
        finally { await untilDead(pid); }
      }
    }
  }
  const receipt = { old: oldInfo, current: newInfo, observations,
    relayedHandshakes,
    limit: 'Normal discovery isolates builds by build key. The first witness injects a foreign record at the client key and observes startup refusal; the old /2 client reports a generic malformed-record refusal for a /3 record. The second uses controlled private record metadata and a socket relay so both installed clients reach the opposite real daemon handshake and receive explicit incompatible replies before any request frame. The iteration 5 built socket witness independently proves both wire directions.' };
  const output = join(currentRoot, 'docs/plans/analysis-failure-recovery/evidence/iteration7-installed-peers.json');
  await writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
