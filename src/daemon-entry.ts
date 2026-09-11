#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectEndpoint } from '../subs/daemon/src/discovery.js';
import { createFilesystemWatcher } from '../subs/daemon/src/filesystem-watcher.js';
import { createSystemClock } from '../subs/daemon/src/system-clock.js';
import { startDaemon } from '../subs/daemon/src/start-daemon.js';
import type { DaemonService, LogEntry } from '../subs/daemon/src/interfaces/daemon.js';
import { assembleResidentService } from './resident-assembly.js';
import { contextBudgets, daemonBudgets } from './resident-budgets.js';

let service: DaemonService | undefined;
try {
  const args = process.argv.slice(2);
  const fields = new Map<string, string>();
  const allowed = new Set(['--endpoint-dir', '--build-key', '--version', '--engine', '--budgets']);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!allowed.has(key) || fields.has(key) || !value) throw new Error('Invalid daemon entry arguments');
    fields.set(key, value);
  }
  for (const key of ['--endpoint-dir', '--build-key', '--version', '--engine']) {
    if (!fields.has(key)) throw new Error(`Missing daemon entry argument ${key}`);
  }
  const directory = fields.get('--endpoint-dir')!;
  const buildKey = fields.get('--build-key')!;
  if (!isAbsolute(directory) || normalize(directory) !== directory || !/^[0-9a-f]{16}$/.test(buildKey)) {
    throw new Error('Invalid daemon endpoint directory or build key');
  }
  const contexts = { ...contextBudgets }, daemon = { ...daemonBudgets };
  if (fields.has('--budgets')) {
    const overrides: unknown = JSON.parse(fields.get('--budgets')!);
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Invalid daemon budgets');
    for (const [key, value] of Object.entries(overrides)) {
      if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`Invalid budget ${key}`);
      if (key in contexts) Object.assign(contexts, { [key]: value });
      else if (key in daemon) Object.assign(daemon, { [key]: value });
      else throw new Error(`Unknown budget ${key}`);
    }
    if (contexts.maxConcurrentAnalyses !== 1) throw new Error('Plan 2 permits one concurrent analysis');
  }
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as { version: string };
  const endpoint = await selectEndpoint({ packageRoot, version: fields.get('--version')!, endpointDirectory: directory });
  if (buildKey !== endpoint.buildKey || fields.get('--engine') !== `ramify.ts@${manifest.version}+typescript@7.0.2`) {
    throw new Error('Daemon arguments do not match the installed build identity');
  }
  let logBytes = 0;
  const log = (entry: LogEntry): void => {
    const line = JSON.stringify(entry) + '\n', bytes = Buffer.byteLength(line);
    if (logBytes + bytes > 8 * 1024 ** 2) return;
    logBytes += bytes;
    process.stderr.write(line);
  };
  const clock = createSystemClock();
  service = assembleResidentService({ watcher: createFilesystemWatcher(), clock,
    budgets: contexts, log, instance: { instanceId: randomUUID(), pid: process.pid,
      version: fields.get('--version')!, engine: fields.get('--engine')!, buildKey } });
  const started = await startDaemon({ service, endpoint, budgets: daemon, clock, log });
  if (started.status === 'already-running') process.exitCode = 3;
  else if (started.status === 'failed') {
    process.stderr.write(`Daemon startup failed: ${started.message}\n`); process.exitCode = 1;
  } else {
    const disposition = await started.host.stopped;
    process.exitCode = disposition.reason === 'failed' ? 1 : 0;
  }
} catch (error) {
  process.stderr.write(`Daemon failure: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await service?.dispose();
}
