import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { cliProcess, tracedProcess } from './process.js';

it('traces socket listen/connect, argv, spawn, exits and loaded modules for an arbitrary entry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ramify-trace-'));
  try {
    const entry = join(root, 'socket.mjs');
    const socket = join(root, 'test.sock');
    await writeFile(entry, `import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const server = net.createServer(peer => peer.end('observed'));
server.listen({ path: process.env.RAMIFY_ENDPOINT_DIR + '/test.sock' });
await once(server, 'listening');
const client = net.createConnection(process.env.RAMIFY_ENDPOINT_DIR + '/test.sock');
let received = '';
client.on('data', bytes => received += bytes);
await once(client, 'close');
await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
await once(child, 'close');
process.stdout.write(received + ':' + process.argv[2]);
`);
    const result = await tracedProcess(entry, ['argument'], { cwd: root, env: { RAMIFY_ENDPOINT_DIR: root } });
    expect([result.code, result.signal, result.stderr, result.stdout]).toEqual([0, null, '', 'observed:argument']);
    const parent = result.events.filter(event => event.pid === result.pid);
    expect(parent.filter(event => event.event === 'listen').map(event => event.path)).toEqual([socket]);
    expect(parent.filter(event => event.event === 'connect').map(event => event.path)).toEqual([socket]);
    expect(parent.find(event => event.event === 'start')?.argv).toEqual([process.execPath, entry, 'argument']);
    expect(parent.some(event => event.event === 'load' && event.url?.endsWith('/socket.mjs'))).toBe(true);
    const spawn = parent.find(event => event.event === 'spawn');
    expect(spawn?.command).toBe(process.execPath);
    expect(result.events.some(event => event.pid === spawn?.child && event.event === 'exit' && event.code === 0)).toBe(true);
    expect(parent.find(event => event.event === 'exit')?.code).toBe(0);
    expect(result.survivingChildren).toEqual([]);
    await expect(readFile(socket)).rejects.toMatchObject({ code: 'ENOENT' });
    // The Plan 1 entry helper retains its listener guard.
    const forbidden = await cliProcess(root, [], { entry, env: { RAMIFY_ENDPOINT_DIR: root } });
    expect(forbidden.code).toBe(1);
    expect(forbidden.stderr).toContain('CLI attempted to listen');
    expect(forbidden.events.some(event => event.event === 'listen' && event.path === socket)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
