import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EndpointSelection } from './interfaces/daemon.js';
import { processAlive, readControlFile, verifyDirectory } from './records.js';

/** A recoverable bakery gate serializes short lock-file mutations. Every
 * participant's pid is in its name before publication, so an interrupted
 * participant is reclaimable even if it died while choosing its ticket. */
export async function coordinateStart<T>(endpoint: EndpointSelection, deadline: number, signal: AbortSignal | undefined,
  action: () => Promise<T>): Promise<T> {
  const directory = `${endpoint.lock}.coord`;
  await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  await verifyDirectory(directory);
  const name = `${process.pid}-${randomUUID()}`;
  const path = join(directory, name);
  async function publish(ticket: number): Promise<void> {
    const temporary = `${path}.tmp`;
    await writeFile(temporary, JSON.stringify({ ticket }), { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  }
  async function participants(): Promise<{ name: string; ticket: number }[]> {
    const result = [];
    for (const candidate of await readdir(directory)) {
      if (candidate.endsWith('.tmp')) {
        const pid = Number(candidate.split('-')[0]);
        if (Number.isSafeInteger(pid) && pid > 0 && !processAlive(pid)) await unlink(join(directory, candidate)).catch(error => { if (error.code !== 'ENOENT') throw error; });
        continue;
      }
      if (!/^[1-9][0-9]*-[0-9a-f-]{36}$/.test(candidate)) throw new Error('Malformed daemon start coordination entry');
      const pid = Number(candidate.split('-')[0]);
      if (!processAlive(pid)) { await unlink(join(directory, candidate)).catch(error => { if (error.code !== 'ENOENT') throw error; }); continue; }
      const content = await readControlFile(join(directory, candidate));
      if (content === null) continue;
      const value = JSON.parse(content);
      if (!Number.isSafeInteger(value.ticket) || value.ticket < 0) throw new Error('Malformed daemon start ticket');
      result.push({ name: candidate, ticket: value.ticket });
    }
    return result;
  }
  await publish(0);
  try {
    const ticket = Math.max(0, ...(await participants()).map(value => value.ticket)) + 1;
    await publish(ticket);
    for (;;) {
      signal?.throwIfAborted();
      if (performance.now() >= deadline) throw new Error('Daemon startup timed out');
      const blocked = (await participants()).some(value => value.name !== name
        && (value.ticket === 0 || value.ticket < ticket || value.ticket === ticket && value.name < name));
      if (!blocked) return await action();
      await new Promise(resolve => setTimeout(resolve, Math.min(10, Math.max(1, deadline - performance.now()))));
    }
  } finally {
    for (const own of [path, `${path}.tmp`]) await unlink(own).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
