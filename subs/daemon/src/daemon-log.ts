import { closeSync, constants, fstatSync, ftruncateSync, openSync, writeSync } from 'node:fs';
import type { EndpointSelection, LogEntry } from './interfaces/daemon.js';
import { verifyEndpoint } from './records.js';

const maximumBytes = 8 * 1024 * 1024;

/** A single host owns this descriptor. Rollover truncates the same inode, so
 * launcher's inherited append descriptors do not keep an unlinked log alive.
 * External writes to stdout/stderr are not bounded by this writer. */
export async function openDaemonLog(endpoint: EndpointSelection) {
  await verifyEndpoint(endpoint);
  const fd = openSync(endpoint.log, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT
    | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  let closed = false;
  function checkFile(): number {
    const info = fstatSync(fd);
    if (!info.isFile() || info.uid !== process.getuid!() || (info.mode & 0o077) !== 0 || info.nlink !== 1) {
      throw new Error(`Unsafe daemon log: ${endpoint.log}`);
    }
    return info.size;
  }
  try { if (checkFile() > maximumBytes) ftruncateSync(fd, 0); }
  catch (error) { closeSync(fd); throw error; }
  return {
    // Oversized single entries are omitted whole; every retained line is JSON.
    // Synchronous writes avoid retaining an unbounded asynchronous log queue.
    log(entry: LogEntry): void {
      if (closed) throw new Error('Daemon log is closed');
      if (Object.values(entry).some(value => typeof value === 'string' && value.length > maximumBytes)) return;
      const line = Buffer.from(JSON.stringify(entry) + '\n', 'utf8');
      if (line.byteLength > maximumBytes) return;
      if (checkFile() + line.byteLength > maximumBytes) ftruncateSync(fd, 0);
      let offset = 0;
      while (offset < line.byteLength) {
        const written = writeSync(fd, line, offset, line.byteLength - offset);
        if (!written) throw new Error('Daemon log write made no progress');
        offset += written;
      }
    },
    close(): void { if (!closed) { closed = true; closeSync(fd); } },
  };
}
