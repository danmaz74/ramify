import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { connectDaemon } from '../../subs/daemon/src/connect-daemon.js';
import { readDaemonRecord, selectEndpoint } from '../../subs/daemon/src/discovery.js';
import type { ExplorerRouter } from '../../subs/service-api/src/router.js';
import type { TraceEvent } from './process.js';
import { repositoryRoot } from './process.js';
import { processAlive, waitForProcessCondition, withProcessScope } from './lifecycle-process.js';

const version = '0.0.0';
const engine = `ramify.ts@${version}+typescript@7.0.2`;
const example = 'examples/collection-review';
/** Compiler and analysis runtime: any analysis module, the TypeScript packages or a compiler helper. */
const analysisRuntime = /\/subs\/analysis\/|\/node_modules\/typescript\/|\/node_modules\/@typescript\/|compiler-helper|dependency-analyzer/;

/** A copy of the reference project's tracked inputs, so the daemon writes nothing into this checkout. */
async function copyReference(): Promise<string> {
  const target = await realpath(await mkdtemp('/tmp/rd28-'));
  const { stdout } = await promisify(execFile)('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', example],
    { cwd: repositoryRoot, maxBuffer: 64 * 1024 ** 2 });
  for (const file of stdout.split('\0').filter(Boolean)) {
    const relative = file.slice(example.length + 1);
    await mkdir(dirname(join(target, relative)), { recursive: true });
    await copyFile(join(repositoryRoot, file), join(target, relative));
  }
  await symlink(await realpath(join(repositoryRoot, example, 'node_modules')), join(target, 'node_modules'));
  return target;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (!address || typeof address === 'string') throw new Error('No port');
  return address.port;
}

const loads = (events: readonly TraceEvent[], pid: number) =>
  events.filter(event => event.event === 'load' && event.pid === pid).map(event => event.url ?? '');

describe('dependency view through the built explorer server', () => {
  it('BD28: a real daemon and explorer server reach ready at one input ID over HTTP; the server loads no analysis runtime', async () => {
    const project = await copyReference();
    try {
      await withProcessScope(async scope => {
        const port = await freePort();
        const server = scope.start({ cwd: repositoryRoot, timeoutMs: 280_000,
          args: [join(repositoryRoot, 'dist/src/explorer-entry.js'), '--root', project, '--port', String(port)] });
        const endpoint = await selectEndpoint({ packageRoot: repositoryRoot, version, endpointDirectory: scope.endpointDirectory });
        let daemonPid: number | null = null;
        try {
          await server.waitForOutput(`Explorer serving ${project}`, 30_000);
          const client = createTRPCClient<ExplorerRouter>({ links: [httpBatchLink({ url: `http://127.0.0.1:${port}/trpc`, methodOverride: 'POST' })] });

          // The server starts the isolated daemon and publishes the project view.
          let view: Awaited<ReturnType<typeof client.projectView.query>> | undefined;
          await waitForProcessCondition('Published project view', 120_000, async () =>
            (view = await client.projectView.query({})).status === 'ready');
          if (view?.status !== 'ready') throw new Error(JSON.stringify(view));
          const revision = view.revision;
          const status = await client.serverStatus.query();
          daemonPid = status.daemonPid;
          expect(status).toMatchObject({ binding: 'ready', published: { revision: revision.revision } });
          expect(daemonPid).not.toBe(server.pid);

          // Poll no faster than once per second, as the browser does.
          const phases: string[] = [];
          const started = performance.now();
          let dependency: Awaited<ReturnType<typeof client.dependencyView.query>> | undefined;
          for (;;) {
            dependency = await client.dependencyView.query({ revision: revision.revision });
            phases.push(dependency.status === 'pending' ? `pending/${dependency.phase}` : dependency.status);
            if (dependency.status !== 'pending') break;
            if (performance.now() - started > 150_000) throw new Error(`Dependency view still pending: ${phases.join(', ')}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          const elapsedMs = performance.now() - started;
          if (dependency.status !== 'ready') throw new Error(JSON.stringify(dependency));
          expect(phases[0]).toBe('pending/analyzing');
          expect(phases.at(-1)).toBe('ready');
          expect(dependency.revision).toEqual(revision);
          expect(dependency.view.inputId).toBe(revision.fingerprints.inputId);
          expect(dependency.view.state).toBe('complete');
          expect(dependency.view.project.behavioral).toBeGreaterThan(0);
          expect(dependency.view.modules.map(module => module.id)).toEqual(view.view.modules.map(module => module.id)
            .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))));
          const encodedBytes = Buffer.byteLength(JSON.stringify(dependency.view));
          // Same-revision refreshes answer from the server's settled DTO.
          for (let index = 0; index < 10; index++) {
            expect(await client.dependencyView.query({ revision: revision.revision })).toMatchObject({ status: 'ready' });
          }

          const connected = await connectDaemon({ start: 'never', daemonEntry: null, packageRoot: repositoryRoot,
            endpointDirectory: endpoint.directory, client: { name: 'bd28', version }, engine });
          if (connected.status !== 'connected') throw new Error(JSON.stringify(connected));
          const daemon = await connected.connection.daemonStatus();
          if (!daemon.ok) throw new Error(JSON.stringify(daemon));
          expect(daemon.value.counters).toMatchObject({ dependencyDiagrams: 1, behaviorRuns: 1 });

          server.signal('SIGINT');
          expect((await server.waitForExit(20_000)).code).toBe(0);
          await connected.connection.stopDaemon({ instanceId: connected.connection.daemon.instance.instanceId });
          await connected.connection.close();
          await waitForProcessCondition('Daemon exit', 20_000, () => daemonPid === null || !processAlive(daemonPid));

          // Loaded modules of the explorer server process, not its import declarations.
          const events = await scope.events();
          const serverLoads = loads(events, server.pid);
          expect(serverLoads.filter(url => /\/dist\/src\/explorer-entry\.js$/.test(url))).toHaveLength(1);
          expect(serverLoads.some(url => /\/subs\/service-api\/src\/dependency-model\.js$/.test(url))).toBe(true);
          expect(serverLoads.some(url => /\/subs\/service-api\/src\/dependency-view\.js$/.test(url))).toBe(true);
          expect(serverLoads.filter(url => analysisRuntime.test(url))).toEqual([]);
          const serverSpawns = events.filter(event => event.pid === server.pid && event.event === 'spawn');
          expect(serverSpawns.filter(event => event.args?.some(arg => analysisRuntime.test(arg)))).toEqual([]);
          // Positive controls: the pattern matches the daemon's own analysis modules, and the analyzer ran in a process the daemon started.
          expect(loads(events, daemonPid!).some(url => analysisRuntime.test(url))).toBe(true);
          expect(events.some(event => event.pid === daemonPid && event.event === 'spawn'
            && event.args?.some(arg => /dependency-analyzer-entry\.js$/.test(arg)))).toBe(true);

          const artifacts = process.env.RAMIFY_BD28_ARTIFACTS;
          if (artifacts) {
            await mkdir(artifacts, { recursive: true });
            await writeFile(join(artifacts, 'collection-review-dependency-view.json'), `${JSON.stringify(dependency, null, 2)}\n`);
            await writeFile(join(artifacts, 'collection-review-project-view.json'), `${JSON.stringify(view, null, 2)}\n`);
            await writeFile(join(artifacts, 'bd28-collection-review.json'), `${JSON.stringify({
              schemaVersion: 'ramify.bd28/1', project: 'collection-review (copy of tracked inputs)', revision: revision.revision,
              inputId: revision.fingerprints.inputId, elapsedMs: Math.round(elapsedMs), phases,
              dependencyView: { encodedBytes, state: dependency.view.state, project: dependency.view.project,
                modules: dependency.view.modules.length, importedModuleEdges: dependency.view.importedModuleEdges.length,
                originalOwnerEdges: dependency.view.originalOwnerEdges.length, coverage: dependency.view.coverage },
              projectViewBytes: Buffer.byteLength(JSON.stringify(view.view)),
              counters: daemon.value.counters,
              server: { pid: server.pid, loadedModules: serverLoads.length,
                analysisRuntimeLoads: serverLoads.filter(url => analysisRuntime.test(url)).length,
                serviceApiLoads: serverLoads.filter(url => /\/subs\/service-api\//.test(url)).map(url => url.replace(/^.*\/dist\//, 'dist/')) },
            }, null, 2)}\n`);
          }
        } finally {
          if (!server.exit) { server.signal('SIGINT'); await server.waitForExit(20_000).catch(() => {}); }
          const record = await readDaemonRecord(endpoint).catch(() => null);
          if (record?.state === 'running') {
            const again = await connectDaemon({ start: 'never', daemonEntry: null, packageRoot: repositoryRoot,
              endpointDirectory: endpoint.directory, client: { name: 'bd28-cleanup', version }, engine });
            if (again.status === 'connected') {
              await again.connection.stopDaemon({ instanceId: again.connection.daemon.instance.instanceId }).catch(() => {});
              await again.connection.close().catch(() => {});
            }
            await waitForProcessCondition('Daemon cleanup', 20_000, () => !processAlive(record.pid)).catch(() => {});
          }
        }
      });
    } finally { await rm(project, { recursive: true, force: true }); }
  }, 300_000);
});
