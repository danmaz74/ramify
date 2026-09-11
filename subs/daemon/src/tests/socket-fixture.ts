import { once } from 'node:events';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createConnection, createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function eventually(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error('Socket fixture condition timed out');
    await new Promise(done => setTimeout(done, 5));
  }
}

/** A real Unix socket pair for private transport tests, with no service double. */
export async function socketFixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'r8-')));
  const server = createServer();
  const sockets = new Map<Socket, Promise<void>>();
  function track(socket: Socket): Promise<void> {
    // socket.closed is set by destroy before the close event is emitted.
    // Observe the event from creation, including if it precedes disposal.
    const closed = new Promise<void>(accept => socket.once('close', () => accept()));
    sockets.set(socket, closed);
    socket.on('error', () => {});
    return closed;
  }
  async function dispose(): Promise<void> {
    await Promise.all([...sockets].map(async ([socket, closed]) => {
      socket.destroy();
      await closed;
    }));
    if (server.listening) await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
    await rm(directory, { recursive: true, force: true });
  }
  try {
    const listening = once(server, 'listening');
    server.listen(join(directory, 'pair.sock'));
    await listening;
    const accepted = once(server, 'connection');
    const client = createConnection(join(directory, 'pair.sock'));
    track(client);
    const [host] = await accepted as [Socket];
    const hostClosed = track(host);
    if (client.connecting) await once(client, 'connect');
    return { client, host, hostClosed, dispose };
  } catch (error) { await dispose(); throw error; }
}
