#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capabilities } from '../subs/cli/src/command-support.js';
import { connectDaemon } from '../subs/daemon/src/connect-daemon.js';
import { selectEndpoint } from '../subs/daemon/src/discovery.js';
import { createSystemClock } from '../subs/daemon/src/system-clock.js';
import { createProjectBinding, type ProjectBinding } from '../subs/service-api/src/project-binding.js';
import { startExplorerWebProcess, type ExplorerWebProcess } from '../subs/service-api/src/web-process.js';

let binding: ProjectBinding | undefined;
let web: ExplorerWebProcess | undefined;
let stopping = false;
let finish!: () => void;
const stopped = new Promise<void>(done => { finish = done; });

async function stop(reason: 'failed' | 'explicit'): Promise<void> {
  if (stopping) return;
  stopping = true;
  try { await web?.close(reason); }
  finally { try { await binding?.close(); } finally { finish(); } }
}

function parseArguments(args: readonly string[]): { readonly root: string; readonly port: number } {
  const fields = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]!, value = args[index + 1];
    if ((key !== '--root' && key !== '--port') || fields.has(key) || !value) {
      throw new Error('Usage: explorer-entry.js --root <dir> [--port <n>]');
    }
    fields.set(key, value);
  }
  const root = fields.get('--root');
  if (root === undefined) throw new Error('Missing explorer entry argument --root');
  const text = fields.get('--port') ?? '0';
  const port = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(port) || port > 65_535) throw new Error(`Invalid explorer port ${text}`);
  return { root: resolve(process.cwd(), root), port };
}

const signal = () => { void stop('explicit'); };
try {
  const { root, port } = parseArguments(process.argv.slice(2));
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { version: string };
  const version = manifest.version;
  // The same selection as the CLI: RAMIFY_ENDPOINT_DIR, else XDG_RUNTIME_DIR, else the temporary directory.
  const endpoint = await selectEndpoint({ packageRoot, version });
  const daemonEntry = process.env.RAMIFY_DAEMON_ENTRY ?? fileURLToPath(new URL('./daemon-entry.js', import.meta.url));
  process.once('SIGTERM', signal);
  process.once('SIGINT', signal);
  // Listen before connecting, so a busy port fails without starting a daemon. Until the
  // binding exists, requests see it connecting.
  const deferred: ProjectBinding = { root, state: () => binding?.state() ?? { kind: 'connecting' },
    service: () => binding?.service() ?? null, close: async () => { await binding?.close(); } };
  web = await startExplorerWebProcess({ binding: deferred, assetsDirectory: join(packageRoot, 'dist/explorer'),
    endpointDirectory: endpoint.directory, buildKey: endpoint.buildKey, version, port });
  // A signal during startup already finished stopping; release the listener it could not see.
  if (stopping) await web.close('explicit');
  else binding = createProjectBinding({ root, setup: { registry: 'default', capabilities }, clock: createSystemClock(),
    connect: ({ start, onState }) => connectDaemon({ start, onState, client: { name: 'ramify-explorer', version },
      engine: `ramify.ts@${version}+typescript@7.0.2`, daemonEntry, packageRoot, endpointDirectory: endpoint.directory }),
    log: entry => {
      const line = `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`;
      if (entry.level === 'warn') process.stderr.write(line); else process.stdout.write(line);
    } });
  if (!stopping) process.stdout.write(`Explorer serving ${root} at ${web.origin}/\n`);
  await stopped;
} catch (error) {
  process.stderr.write(`Explorer failure: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
  await stop('failed').catch(() => {});
} finally {
  process.off('SIGTERM', signal);
  process.off('SIGINT', signal);
}
