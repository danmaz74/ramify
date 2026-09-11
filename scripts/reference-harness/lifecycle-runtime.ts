import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { selectEndpoint, readDaemonRecord } from '../../subs/daemon/src/discovery.js';
import { processAlive, withProcessScope, waitForProcessCondition } from '../../src/tests/lifecycle-process.js';
import type { LiveProcess, ProcessScope } from '../../src/tests/lifecycle-process.js';
import type { ContextToken } from '../../subs/daemon/subs/contexts/src/interfaces/contexts.js';
import type { DaemonRecord, EndpointSelection } from '../../subs/daemon/src/interfaces/daemon.js';
import { command } from './processes.js';
import { repositoryRoot } from './plan.js';
import { recordObservation } from './observations.js';

export interface LifecycleClient {
  readonly process: LiveProcess;
  call(operation: string, params?: Readonly<Record<string, unknown>>): Promise<any>;
  open(root: string): Promise<ContextToken>;
  check(token: ContextToken, published?: boolean): Promise<any>;
  status(): Promise<any>;
  close(): Promise<void>;
}
export interface LifecycleRuntime {
  readonly scope: ProcessScope;
  readonly endpoint: EndpointSelection;
  readonly executable: string;
  readonly initialDaemon: LiveProcess;
  client(): Promise<LifecycleClient>;
  cli(root: string, args: readonly string[], timeoutMs?: number): LiveProcess;
  record(): Promise<DaemonRecord | null>;
  stop(): Promise<void>;
}
export async function withLifecycleRuntime<T>(budgets: Readonly<Record<string, number>>, run: (runtime: LifecycleRuntime) => Promise<T>): Promise<T> {
  const installation = await mkdtemp(join(tmpdir(), 'ramify-lifecycle-bin-'));
  try {
    const installed = await command(repositoryRoot, 'npm', ['install', '--prefix', installation, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', repositoryRoot], 30_000, { ...process.env, NODE_OPTIONS: '' });
    assert.equal(installed.code, 0, installed.stderr);
    const executable = join(installation, 'node_modules/.bin/ramify');
    return await withProcessScope(async scope => {
      const endpoint = await selectEndpoint({ packageRoot: repositoryRoot, version: '0.0.0', endpointDirectory: scope.endpointDirectory });
      const children: LifecycleClient[] = [];
      const foreground = scope.start({ cwd: repositoryRoot, args: [join(repositoryRoot, 'dist/src/daemon-entry.js'), '--endpoint-dir', endpoint.directory,
        '--build-key', endpoint.buildKey, '--version', '0.0.0', '--engine', 'ramify.ts@0.0.0+typescript@7.0.2', '--budgets', JSON.stringify(budgets)], timeoutMs: 180_000 });
      await waitForProcessCondition('real daemon startup record', 10_000, async () => {
        if (foreground.exit) throw new Error(`Daemon exited during startup: ${foreground.stderr}`);
        return (await readDaemonRecord(endpoint))?.state === 'running';
      });
      const runtime: LifecycleRuntime = {
        scope, endpoint, executable, initialDaemon: foreground,
        cli: (root, args, timeoutMs = 60_000) => scope.start({ cwd: root, executable, args, timeoutMs }),
        record: () => readDaemonRecord(endpoint),
        async client() {
          const child = scope.start({ cwd: repositoryRoot, args: [join(repositoryRoot, 'scripts/reference-harness/fixtures/plan2/lifecycle-client.mjs'), repositoryRoot], timeoutMs: 180_000 });
          await child.waitForOutput('"event":"ready"', 15_000);
          let closed = false;
          const client: LifecycleClient = {
            process: child,
            async call(op, params = {}) {
              const id = randomUUID(); await child.send(JSON.stringify({ id, op, ...params }) + '\n');
              await child.waitForOutput(`"id":"${id}"`, 30_000);
              const line = child.stdout.split('\n').filter(Boolean).map(value => JSON.parse(value)).find(value => value.id === id);
              if (line.error) throw new Error(line.error);
              return line.result;
            },
            async open(root) {
              const result = await client.call('open', { root });
              assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.value.status, 'opened', JSON.stringify(result)); return result.value.token;
            },
            async check(token, published = false) {
              const result = await client.call('check', { token, published }); assert.equal(result.ok, true, JSON.stringify(result)); return result.value;
            },
            async status() { const result = await client.call('status'); assert.equal(result.ok, true, JSON.stringify(result)); return result.value; },
            async close() { if (!closed && !child.exit) { closed = true; await client.call('close'); assert.equal((await child.waitForExit(7000)).code, 0); } },
          };
          children.push(client); return client;
        },
        async stop() {
          const current = await readDaemonRecord(endpoint);
          if (current?.state === 'running' && processAlive(current.pid)) {
            const stop = runtime.cli(repositoryRoot, ['daemon', 'stop', '--format', 'json']);
            const result = await stop.waitForExit(7000);
            assert.equal(result.code, 0, stop.stderr);
          }
          const recorded = await readDaemonRecord(endpoint);
          if (recorded) await waitForProcessCondition('daemon exits after stop', 7000, () => !processAlive(recorded.pid));
        },
      };
      let failure: unknown; let result: T | undefined;
      try { result = await run(runtime); } catch (error) { failure = error; }
      const cleanup: unknown[] = [];
      try { await runtime.stop(); } catch (error) { cleanup.push(error); }
      for (const child of children) { try { await child.close(); } catch (error) { cleanup.push(error); } }
      try { if (!foreground.exit) await foreground.waitForExit(7000); } catch (error) { cleanup.push(error); }
      recordObservation('lifecycle-process-trace', { platform: process.platform, budgets, events: await scope.events() });
      if (failure || cleanup.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanup], [...(failure ? [String(failure)] : []), ...cleanup.map(String)].join('\n'));
      return result as T;
    });
  } finally { await rm(installation, { recursive: true, force: true }); }
}
