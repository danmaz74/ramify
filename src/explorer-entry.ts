#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDaemon } from '../subs/daemon/src/connect-daemon.js';
import { selectEndpoint } from '../subs/daemon/src/discovery.js';
import type { ServiceConnection } from '../subs/daemon/src/interfaces/daemon.js';
import { startExplorerWebProcess, type ExplorerWebProcess } from '../subs/service-api/src/web-process.js';

let connection: ServiceConnection | undefined;
let web: ExplorerWebProcess | undefined;
let stopping = false;
let finish!: () => void;
const stopped = new Promise<void>(resolve => { finish = resolve; });

async function stop(reason: 'failed' | 'explicit'): Promise<void> {
  if (stopping) return;
  stopping = true;
  try { await web?.close(reason); }
  finally { await connection?.close(); finish(); }
}

try {
  const args = process.argv.slice(2), fields = new Map<string, string>();
  const allowed = new Set(['--endpoint-dir', '--build-key', '--version']);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!allowed.has(key) || fields.has(key) || !value) throw new Error('Invalid explorer entry arguments');
    fields.set(key, value);
  }
  for (const key of allowed) if (!fields.has(key)) throw new Error(`Missing explorer entry argument ${key}`);
  const directory = fields.get('--endpoint-dir')!, buildKey = fields.get('--build-key')!, version = fields.get('--version')!;
  if (!isAbsolute(directory) || normalize(directory) !== directory || !/^[0-9a-f]{16}$/.test(buildKey)) {
    throw new Error('Invalid explorer endpoint directory or build key');
  }
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { version: string };
  if (version !== manifest.version) throw new Error('Explorer version does not match the installed package');
  const endpoint = await selectEndpoint({ packageRoot, version, endpointDirectory: directory });
  if (endpoint.buildKey !== buildKey) throw new Error('Explorer arguments do not match the installed build identity');
  const connected = await connectDaemon({ start: 'never', client: { name: 'ramify-explorer', version },
    engine: `ramify.ts@${version}+typescript@7.0.2`, daemonEntry: null, packageRoot, endpointDirectory: directory });
  if (connected.status !== 'connected') {
    throw new Error(connected.status === 'unavailable' ? connected.message
      : connected.status === 'stopped' ? 'Daemon was stopped explicitly' : 'No compatible daemon is running');
  }
  connection = connected.connection;
  web = await startExplorerWebProcess({ service: connection, assetsDirectory: join(packageRoot, 'dist/explorer'),
    endpointDirectory: directory, buildKey, version });
  const signal = () => { void stop('failed'); };
  process.once('SIGTERM', signal);
  process.once('SIGINT', signal);
  await stopped;
  process.off('SIGTERM', signal);
  process.off('SIGINT', signal);
} catch (error) {
  process.stderr.write(`Explorer failure: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
  await stop('failed').catch(() => {});
}
