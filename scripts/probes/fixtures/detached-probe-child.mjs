import { spawn } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { open, readFile, unlink } from 'node:fs/promises';
import { writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const [mode, directory] = process.argv.slice(2);
const socket = join(directory, 's');
const record = join(directory, 'record.json');
if (mode === 'launch') {
  const lock = await open(join(directory, 'start.lock'), 'wx', 0o600);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'resident', directory], { detached: true, stdio: 'ignore' });
    child.unref();
    console.log(JSON.stringify({ parentPid: process.pid, childPid: child.pid }));
  } finally { await lock.close(); await unlink(join(directory, 'start.lock')); }
} else if (mode === 'duplicate') {
  const peer = createConnection(socket);
  peer.once('connect', () => { peer.destroy(); process.exitCode = 3; });
  peer.once('error', () => { process.exitCode = 1; });
} else {
  const save = (state, exitCode) => {
    writeFileSync(`${record}.tmp`, JSON.stringify({ pid: process.pid, state, exitCode }));
    renameSync(`${record}.tmp`, record);
  };
  const clients = new Set();
  const server = createServer(client => {
    clients.add(client); client.on('error', () => {});
    client.on('close', () => clients.delete(client));
    client.on('data', data => {
      if (data.toString() !== 'stop') return;
      for (const connection of clients) connection.destroy();
      server.close(() => { clearTimeout(deadline); process.exitCode = 23; });
    });
  });
  // Exit hook records the actual Node exit code, rather than a pre-stop intention.
  process.on('exit', code => save('exited', code));
  server.listen(socket, () => save('running', null));
  const deadline = setTimeout(() => { process.exit(24); }, 15000);
}
