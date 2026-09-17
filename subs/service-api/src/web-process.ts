import { randomUUID } from 'node:crypto';
import { open, rename, unlink, lstat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import express from 'express';
import * as trpcExpress from '@trpc/server/adapters/express';
import type { ExplorerProcessRecord } from './interfaces/explorer-service.js';
import type { ProjectBinding } from './project-binding.js';
import { createExplorerRouter } from './router.js';
import { explorerProjectKey } from './web-discovery.js';

export interface ExplorerWebProcessOptions {
  readonly binding: ProjectBinding;
  readonly assetsDirectory: string;
  readonly endpointDirectory: string;
  readonly buildKey: string;
  readonly version: string;
  /** TCP port on 127.0.0.1; 0 (the default) selects a free port. A busy fixed port fails startup. */
  readonly port?: number;
  readonly now?: () => number;
}

export interface ExplorerWebProcess {
  readonly server: Server;
  readonly port: number;
  readonly origin: string;
  /** The discovery record once the binding first became ready, otherwise null. */
  record(): ExplorerProcessRecord | null;
  /** Resolves with the running record once written; rejects if the process closes first. */
  readonly advertised: Promise<ExplorerProcessRecord>;
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

const advertiseIntervalMs = 50;

/** Start the resident HTTP application for one project binding. The discovery record
 * is keyed by the context ID, so it is written once the binding is first ready. */
export async function startExplorerWebProcess(options: ExplorerWebProcessOptions): Promise<ExplorerWebProcess> {
  if (!/^[0-9a-f]{16}$/.test(options.buildKey)) throw new Error('Invalid explorer build key');
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) throw new Error('Invalid explorer port');
  await verifyDirectory(options.endpointDirectory);
  const assets = await lstat(options.assetsDirectory);
  if (!assets.isDirectory()) throw new Error('Explorer assets directory is not a directory');

  const app = express();
  const server = createServer(app);
  const instanceId = randomUUID();
  const index = join(options.assetsDirectory, 'index.html');
  let hosts = new Set<string>();
  let origins = new Set<string>();
  let closed = false;

  app.disable('x-powered-by');
  app.use((request, response, next) => {
    if (request.headers.host === undefined || !hosts.has(request.headers.host)) {
      response.status(403).type('text/plain').send('Invalid Host');
      return;
    }
    if (request.headers.origin !== undefined && !origins.has(request.headers.origin)) {
      response.status(403).type('text/plain').send('Invalid Origin');
      return;
    }
    response.setHeader('Content-Security-Policy',
      `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; connect-src 'self'`);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.path.startsWith('/trpc') && request.method === 'OPTIONS') {
      response.status(403).type('text/plain').send('Cross-origin preflight is not accepted');
      return;
    }
    next();
  });

  const router = createExplorerRouter({ binding: options.binding });
  app.get('/health/ready', (_request, response) => response.json({
    schemaVersion: 'ramify.explorer-record/1', instanceId, version: options.version,
    buildKey: options.buildKey, protocol: 'ramify.explorer-http/1',
  }));
  // The browser batches queries as POST so future bounded request arrays never
  // depend on URL limits. tRPC rejects POST queries unless the HTTP adapter opts
  // into the same method override used by the client.
  app.use('/trpc', trpcExpress.createExpressMiddleware({ router, allowMethodOverride: true }));
  // Browser pages: the home page and the newest published analysis share one application.
  for (const page of ['/', '/analysis/latest']) app.get(page, (_request, response) => response.sendFile(index));
  // Earlier launchers opened token URLs; they now land on the stable page.
  app.use('/explore', (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.sendStatus(405);
      return;
    }
    response.redirect(302, '/analysis/latest');
  });
  app.use(express.static(options.assetsDirectory, { dotfiles: 'deny', fallthrough: true, index: false }));

  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => { server.off('listening', ready); reject(error); };
    const ready = () => { server.off('error', fail); resolve(); };
    server.once('error', fail);
    server.once('listening', ready);
    server.listen(port, '127.0.0.1');
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Explorer did not bind a TCP port');
  hosts = new Set([`127.0.0.1:${address.port}`, `localhost:${address.port}`]);
  origins = new Set([...hosts].map(host => `http://${host}`));
  const boundPort = address.port;
  const origin = `http://127.0.0.1:${boundPort}`;
  const now = options.now ?? Date.now;
  const startedAt = now();
  let running: ExplorerProcessRecord | null = null;
  let recordPath: string | null = null;
  let writing: Promise<void> | null = null;
  let settle!: { resolve: (record: ExplorerProcessRecord) => void; reject: (error: Error) => void };
  const advertised = new Promise<ExplorerProcessRecord>((resolve, reject) => { settle = { resolve, reject }; });
  advertised.catch(() => {});

  function advertise(): void {
    const state = options.binding.state();
    if (closed || running || writing || state.kind !== 'ready') return;
    const record: ExplorerProcessRecord = {
      schemaVersion: 'ramify.explorer-record/1', instanceId, pid: process.pid, version: options.version,
      buildKey: options.buildKey, protocol: 'ramify.explorer-http/1', root: options.binding.root,
      context: state.token.context, host: '127.0.0.1', port: boundPort, origin, startedAt, state: 'running', stopped: null,
    };
    const path = join(options.endpointDirectory, `explorer-${options.buildKey}-${explorerProjectKey(record.context)}.json`);
    writing = writeRecord(path, record).then(() => {
      running = record; recordPath = path;
      clearInterval(timer);
      settle.resolve(record);
    }, (error: unknown) => {
      process.stderr.write(`Explorer record write failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }).finally(() => { writing = null; });
  }
  const timer = setInterval(advertise, advertiseIntervalMs);
  timer.unref();
  advertise();

  return {
    server,
    port: address.port,
    origin,
    record: () => running,
    advertised,
    async close(reason = 'explicit') {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      await writing;
      settle.reject(new Error('Explorer process closed before its record was written'));
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
      if (running && recordPath) await writeRecord(recordPath, { ...running, state: 'stopped', stopped: { at: now(), reason } });
    },
  };
}
