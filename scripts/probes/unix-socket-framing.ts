import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chmod, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { createConnection, createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as turn } from 'node:timers/promises';
import { archive, sha256 } from './resident-probe.js';

const scratch = await mkdtemp(join(tmpdir(), 'rf-sock-'));
const sockets = new Set<Socket>();
const server = createServer(socket => { sockets.add(socket); socket.on('error', () => {}); socket.pipe(socket); });
try {
  await chmod(scratch, 0o700);
  const path = join(scratch, 's');
  server.listen(path); await once(server, 'listening');
  const client = createConnection(path); sockets.add(client); await once(client, 'connect');
  const received: Buffer[] = [];
  let buffer = Buffer.alloc(0);
  let expected: number | null = null;
  let chunks = 0;
  let partialHeaders = 0;
  let partialBodies = 0;
  let resolveFrames!: () => void;
  const frames = new Promise<void>(resolve => { resolveFrames = resolve; });
  client.on('data', chunk => {
    assert.ok(Buffer.isBuffer(chunk));
    chunks++;
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length) {
      if (expected === null) {
        if (buffer.length < 4) { partialHeaders++; break; }
        expected = buffer.readUInt32BE(0); buffer = buffer.subarray(4);
        assert.ok(expected > 0 && expected <= 32 * 1024 ** 2);
      }
      if (buffer.length < expected) { partialBodies++; break; }
      received.push(buffer.subarray(0, expected)); buffer = buffer.subarray(expected); expected = null;
      if (received.length === 2) resolveFrames();
    }
  });
  const sent = [];
  for (const bytes of [1024 ** 2, 32 * 1024 ** 2]) {
    const body = Buffer.alloc(bytes, 120); body[0] = 34; body[bytes - 1] = 34;
    const header = Buffer.alloc(4); header.writeUInt32BE(bytes);
    for (const byte of header) { client.write(Buffer.from([byte])); await new Promise(resolve => setTimeout(resolve, 5)); }
    for (let offset = 0; offset < body.length; offset += 16 * 1024) {
      if (!client.write(body.subarray(offset, offset + 16 * 1024))) await once(client, 'drain');
      await turn();
    }
    sent.push({ bytes, sha256: sha256(body) });
  }
  await Promise.race([frames, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Frame roundtrip timed out')), 10000); timer.unref();
  })]);
  assert.deepEqual(received.map(body => ({ bytes: body.length, sha256: sha256(body) })), sent);
  for (const body of received) assert.equal(JSON.parse(body.toString()).length, body.length - 2);
  assert.ok(partialHeaders > 0 && partialBodies > 0);

  const directoryAllowed = (uid: number, mode: number, currentUid: number) => uid === currentUid && (mode & 0o077) === 0;
  const uid = process.getuid!();
  const good = await stat(scratch);
  assert.ok(directoryAllowed(good.uid, good.mode, uid));
  await chmod(scratch, 0o755);
  const bad = await stat(scratch); assert.ok(!directoryAllowed(bad.uid, bad.mode, uid));
  assert.ok(!directoryAllowed(good.uid, good.mode, uid + 1));
  await chmod(scratch, 0o700);

  // Observe the raw platform separately from the portable 100-byte policy.
  const raw = [];
  for (const bytes of [101, 180]) {
    const directory = join(scratch, String(bytes)); await mkdir(directory);
    const longPath = `${directory}/${'s'.repeat(bytes - Buffer.byteLength(directory) - 1)}`;
    assert.equal(Buffer.byteLength(longPath), bytes);
    assert.throws(() => { if (Buffer.byteLength(longPath) > 100) throw new Error('endpoint path exceeds 100 bytes'); });
    const listener = createServer();
    const outcome = await new Promise<string>(resolve => {
      listener.once('error', error => resolve((error as NodeJS.ErrnoException).code ?? error.message));
      listener.listen(longPath, () => resolve('listened'));
    });
    const actual = await readdir(directory);
    raw.push({ requestedBytes: bytes, outcome, createdPathBytes: actual.map(name => Buffer.byteLength(join(directory, name))) });
    if (listener.listening) await new Promise<void>(resolve => listener.close(() => resolve()));
  }
  await archive('unix-socket-framing', { sent, chunks, partialHeaders, partialBodies, rawPathObservations: raw,
    portablePathGuard: 'Both 101-byte and 180-byte paths rejected before listen; raw platform behavior is recorded, not assumed.',
    permissions: { accepted0700: true, rejected0755: true, foreignUidPredicateRejected: true,
      foreignOwnershipEvidence: 'Real stat metadata compared to a different effective uid; no chown capability required.' } });
} finally {
  for (const socket of sockets) socket.destroy();
  if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(scratch, { recursive: true, force: true });
}
