import { randomUUID } from 'node:crypto';
import { open, rename, unlink, lstat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import express from 'express';
import * as trpcExpress from '@trpc/server/adapters/express';
import type { RamifyService } from '../../../src/interfaces/service.js';
import type { ExplorerProcessRecord } from './interfaces/explorer-service.js';
import { createExplorerRouter } from './router.js';

export interface ExplorerWebProcessOptions {
  readonly service: RamifyService;
  readonly assetsDirectory: string;
  readonly endpointDirectory: string;
  readonly buildKey: string;
  readonly version: string;
  readonly now?: () => number;
}

export interface ExplorerWebProcess {
  readonly record: ExplorerProcessRecord;
  readonly server: Server;
  close(reason?: 'idle' | 'explicit' | 'failed'): Promise<void>;
}

async function verifyDirectory(path: string): Promise<void> {
  if (!process.getuid) throw new Error('Explorer endpoints require a Unix user id');
  const info = await lstat(path);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
    throw new Error(`Unsafe explorer endpoint directory: ${path}; require current owner and mode 0700`);
  }
}

async function writeRecord(path: string, record: ExplorerProcessRecord): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try { await handle.writeFile(`${JSON.stringify(record)}\n`); } finally { await handle.close(); }
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
  }
}

/** Start the production HTTP application. Discovery/reuse is performed by the iteration-6 launcher. */
export async function startExplorerWebProcess(options: ExplorerWebProcessOptions): Promise<ExplorerWebProcess> {
  if (!/^[0-9a-f]{16}$/.test(options.buildKey)) throw new Error('Invalid explorer build key');
  await verifyDirectory(options.endpointDirectory);
  const assets = await lstat(options.assetsDirectory);
  if (!assets.isDirectory()) throw new Error('Explorer assets directory is not a directory');

  const app = express();
  const server = createServer(app);
  const instanceId = randomUUID();
  let expectedHost = '';
  let origin = '';
  let closed = false;

  app.disable('x-powered-by');
  app.use((request, response, next) => {
    if (request.headers.host !== expectedHost) {
      response.status(403).type('text/plain').send('Invalid Host');
      return;
    }
    response.setHeader('Content-Security-Policy',
      `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; connect-src 'self'`);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.path.startsWith('/trpc')) {
      if (request.method === 'OPTIONS') {
        response.status(403).type('text/plain').send('Cross-origin preflight is not accepted');
        return;
      }
      if (request.headers.origin !== undefined && request.headers.origin !== origin) {
        response.status(403).type('text/plain').send('Invalid Origin');
        return;
      }
    }
    next();
  });

  const router = createExplorerRouter({ service: options.service });
  app.get('/health/ready', (_request, response) => response.json({
    schemaVersion: 'ramify.explorer-record/1', instanceId, version: options.version,
    buildKey: options.buildKey, protocol: 'ramify.explorer-http/1',
  }));
  // The browser batches queries as POST so complete tokens and future bounded
  // request arrays never depend on URL limits. tRPC rejects POST queries unless
  // the HTTP adapter opts into the same method override used by the client.
  app.use('/trpc', trpcExpress.createExpressMiddleware({ router, allowMethodOverride: true }));
  app.use(express.static(options.assetsDirectory, { dotfiles: 'deny', fallthrough: true, index: false }));
  app.use('/explore', (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.sendStatus(405);
      return;
    }
    response.sendFile(join(options.assetsDirectory, 'index.html'));
  });

  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => { server.off('listening', ready); reject(error); };
    const ready = () => { server.off('error', fail); resolve(); };
    server.once('error', fail);
    server.once('listening', ready);
    server.listen(0, '127.0.0.1');
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Explorer did not bind a TCP port');
  expectedHost = `127.0.0.1:${address.port}`;
  origin = `http://${expectedHost}`;
  const now = options.now ?? Date.now;
  const recordPath = join(options.endpointDirectory, `explorer-${options.buildKey}.json`);
  const startedAt = now();
  const running: ExplorerProcessRecord = {
    schemaVersion: 'ramify.explorer-record/1', instanceId, pid: process.pid, version: options.version,
    buildKey: options.buildKey, protocol: 'ramify.explorer-http/1', host: '127.0.0.1', port: address.port,
    origin, startedAt, state: 'running', stopped: null,
  };
  try { await writeRecord(recordPath, running); }
  catch (error) { await new Promise<void>(resolve => server.close(() => resolve())); throw error; }

  return {
    record: running,
    server,
    async close(reason = 'explicit') {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await writeRecord(recordPath, { ...running, state: 'stopped', stopped: { at: now(), reason } });
    },
  };
}
