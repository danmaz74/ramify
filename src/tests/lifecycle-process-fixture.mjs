// Process-control fixture only. It implements no Ramify daemon or service.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { createInterface } from 'node:readline';

const mode = process.argv[2];
if (mode === 'leaf') {
  setInterval(() => {}, 1000);
  process.stdout.write('leaf-ready\n');
} else if (mode === 'family' || mode === 'nested') {
  const child = spawn(process.execPath, [process.argv[1], mode === 'nested' ? 'family' : 'leaf'], {
    detached: true, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const closed = once(child, 'close');
  child.stdout.on('data', bytes => process.stdout.write(bytes));
  process.on('SIGINT', async () => {
    child.kill('SIGKILL');
    await closed;
    process.exitCode = 130;
  });
  // Remain alive to reap the detached child during failure cleanup.
  const input = createInterface({ input: process.stdin });
  child.on('close', () => input.close());
} else if (mode === 'io') {
  const server = net.createServer(peer => peer.end('fixture-only'));
  server.listen(process.env.RAMIFY_ENDPOINT_DIR + '/p.sock');
  await once(server, 'listening');
  const input = createInterface({ input: process.stdin });
  input.on('line', line => process.stdout.write(`received:${line}\n`));
  process.on('SIGINT', () => {
    input.close();
    server.close(() => { process.exitCode = 130; });
  });
  process.stdout.write('ready\n');
} else if (mode === 'peer') {
  const peer = net.createConnection(process.env.RAMIFY_ENDPOINT_DIR + '/p.sock');
  peer.on('data', bytes => process.stdout.write(bytes));
  await once(peer, 'close');
} else throw new Error(`Unknown process fixture mode: ${mode}`);
