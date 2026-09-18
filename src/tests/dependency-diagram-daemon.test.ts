import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { capabilities } from '../../subs/cli/src/command-support.js';
import { connectDaemon } from '../../subs/daemon/src/connect-daemon.js';
import { readDaemonRecord, selectEndpoint } from '../../subs/daemon/src/discovery.js';
import type { ContextDependencyDiagramOutcome, ContextToken } from '../../subs/daemon/src/context-types.js';
import type { DaemonStatus, ServiceResult } from '../interfaces/service.js';
import type { TraceEvent } from './process.js';
import { repositoryRoot } from './process.js';
import { dependencyAnalyzerCapacity } from '../dependency-analyzer-process.js';
import { processAlive, waitForProcessCondition, withProcessScope } from './lifecycle-process.js';

const version = '0.0.0';
const engine = `ramify.ts@${version}+typescript@7.0.2`;
/** A leaf toolkit source file the test rewrites in the project copy. */
const edited = 'subs/daemon/src/system-clock.ts';
const analyzerModule = /\/subs\/analysis\/src\/dependency-analyzer\.js$/;
const classifierModule = /\/subs\/analysis\/subs\/typescript\/src\/behavior-classifier\.js$/;
const analyzerEntry = /\/dist\/src\/dependency-analyzer-entry\.js$/;

/** A copy of the toolkit's analyzed inputs, so the test edits no file of this checkout. */
async function copyToolkit(): Promise<string> {
  const target = await realpath(await mkdtemp('/tmp/rd24-'));
  const { stdout } = await promisify(execFile)('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'src', 'subs',
    'module.ramify', 'README.md', 'tsconfig.json', 'package.json', 'package-lock.json'], { cwd: repositoryRoot, maxBuffer: 64 * 1024 ** 2 });
  for (const file of stdout.split('\0').filter(Boolean)) {
    await mkdir(dirname(join(target, file)), { recursive: true });
    await copyFile(join(repositoryRoot, file), join(target, file));
  }
  await symlink(await realpath(join(repositoryRoot, 'node_modules')), join(target, 'node_modules'));
  return target;
}

function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

/** The process tree below `root`, from the trace's spawn records. */
function descendants(events: readonly TraceEvent[], root: number): Set<number> {
  const found = new Set<number>([root]);
  for (let grew = true; grew;) {
    grew = false;
    for (const event of events) {
      if (event.event === 'spawn' && event.child !== undefined && found.has(event.pid) && !found.has(event.child)) { found.add(event.child); grew = true; }
    }
  }
  return found;
}
const loads = (events: readonly TraceEvent[], pids: ReadonlySet<number>, pattern: RegExp) =>
  events.filter(event => event.event === 'load' && pids.has(event.pid) && pattern.test(event.url ?? ''));

describe('dependency diagram in the built daemon', () => {
  it('BD24: reaches ready on Ramify through the process runner while a watch update and check --changed complete; the retained session never classifies', async () => {
    const project = await copyToolkit();
    try {
      await withProcessScope(async scope => {
        const endpoint = await selectEndpoint({ packageRoot: repositoryRoot, version, endpointDirectory: scope.endpointDirectory });
        const daemon = scope.start({ cwd: repositoryRoot, timeoutMs: 280_000, args: [join(repositoryRoot, 'dist/src/daemon-entry.js'),
          '--endpoint-dir', endpoint.directory, '--build-key', endpoint.buildKey, '--version', version, '--engine', engine] });
        await waitForProcessCondition('Daemon startup', 10_000, async () => (await readDaemonRecord(endpoint))?.state === 'running');
        const connected = await connectDaemon({ start: 'never', daemonEntry: null, packageRoot: repositoryRoot, endpointDirectory: endpoint.directory,
          client: { name: 'bd24', version }, engine });
        if (connected.status !== 'connected') throw new Error(JSON.stringify(connected));
        const connection = connected.connection;
        const status = async (): Promise<DaemonStatus> => unwrap(await connection.daemonStatus());
        const cli = async (argv: readonly string[]) => {
          const child = scope.start({ cwd: project, timeoutMs: 120_000, args: [join(repositoryRoot, 'dist/src/cli-entry.js'), ...argv] });
          const exit = await child.waitForExit(120_000);
          return { code: exit.code, stdout: child.stdout, stderr: child.stderr };
        };
        try {
          expect(connection.daemon.capabilities).toContain('dependencyDiagram');
          const opened = unwrap(await connection.openContext({ project: { cwd: project, root: project, scope: 'whole-project', configuration: 'discover' },
            setup: { registry: 'default', capabilities } }));
          if (opened.status !== 'opened') throw new Error(JSON.stringify(opened));
          const token: ContextToken = opened.token;
          const checked = unwrap(await connection.check({ token, requestId: 'bd24-open', freshness: { mode: 'synchronized', expect: [] } }));
          if (checked.status !== 'reported' || !checked.published) throw new Error(JSON.stringify(checked).slice(0, 2000));
          const revision = checked.revision;
          expect(revision.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
          expect(capabilities).not.toContain('dependency-behavior');

          // The job starts in the daemon; its analyzer child appears in the trace.
          let settled: ContextDependencyDiagramOutcome | undefined;
          const started = performance.now();
          const request = connection.dependencyDiagram({ token, requestId: 'bd24-diagram', revision: revision.revision })
            .then(result => { settled = unwrap(result); return settled; });
          await waitForProcessCondition('Analyzer start', 10_000, async () => (await scope.events())
            .some(event => event.pid === daemon.pid && event.event === 'spawn' && event.args?.some(arg => analyzerEntry.test(arg))));

          // During the job: a watcher update of an identical rewrite, then a changed-file hook, both complete.
          const before = await status();
          const content = await readFile(join(project, edited));
          await writeFile(join(project, edited), content);
          await waitForProcessCondition('Watch update', 20_000, async () => {
            const current = await status();
            const context = current.contexts.find(item => item.token.context === token.context);
            return current.counters.analyses > before.counters.analyses && !!context && !context.pending.analysisRunning && context.pending.changedPaths === 0;
          });
          const hook = await cli(['check', '--root', project, '--changed', edited, '--deadline', '30000']);
          expect([hook.code, hook.stderr]).toEqual([0, '']);
          const during = await status();
          const jobStillRunning = settled === undefined;
          expect(jobStillRunning, 'the watch update and the hook must complete while the diagram job runs').toBe(true);
          expect(during.contexts.find(item => item.token.context === token.context)?.published?.revision).toBe(revision.revision);

          const ready = await request;
          const elapsedMs = performance.now() - started;
          if (ready.status !== 'ready') throw new Error(JSON.stringify(ready));
          expect(ready.revision.revision).toBe(revision.revision);
          expect(ready.diagram.inputId).toBe(revision.fingerprints.inputId);
          expect(ready.diagram.coverage.state).toBe('complete');
          expect(ready.diagram.headline.behavioralDependencies).toBeGreaterThan(0);
          const diagramBytes = Buffer.byteLength(JSON.stringify(ready.diagram));
          const afterReady = await status();
          expect(afterReady.counters).toMatchObject({ dependencyDiagrams: 1, behaviorRuns: 1, dependencyDiagramInputChanges: 0 });
          const context = afterReady.contexts.find(item => item.token.context === token.context)!;
          // The test references of the same run are retained beside the diagram, within their own bound; the
          // public answer carries the diagram alone. The contexts and service tests fix their exact bytes.
          const referenceBytes = context.retainedBytes - (context.session?.factBytes ?? 0) - diagramBytes;
          expect(referenceBytes).toBeGreaterThan(0);
          expect(referenceBytes).toBeLessThanOrEqual(dependencyAnalyzerCapacity.maxResultBytes);
          expect(Object.keys(ready).sort()).toEqual(['diagram', 'requestId', 'revision', 'status']);
          // Ten same-revision requests are answered from the retained result.
          for (let index = 0; index < 10; index++) {
            expect(unwrap(await connection.dependencyDiagram({ token, requestId: `bd24-again-${index}`, revision: revision.revision })))
              .toMatchObject({ status: 'ready', revision: { revision: revision.revision } });
          }
          expect((await status()).counters).toMatchObject({ dependencyDiagrams: 1, behaviorRuns: 1 });

          // A real edit publishes through a changed-file check; it records no classifier run and releases the result.
          await writeFile(join(project, edited), `${content.toString('utf8')}// BD24 edit\n`);
          const changed = await cli(['check', '--root', project, '--changed', edited, '--deadline', '30000']);
          expect([changed.code, changed.stderr]).toEqual([0, '']);
          const afterEdit = await status();
          const editedContext = afterEdit.contexts.find(item => item.token.context === token.context)!;
          expect(editedContext.published!.sequence).toBeGreaterThan(revision.sequence);
          expect(editedContext.retainedBytes).toBe(editedContext.session?.factBytes ?? 0);
          expect(afterEdit.counters).toMatchObject({ dependencyDiagrams: 1, behaviorRuns: 1 });

          unwrap(await connection.stopDaemon({ instanceId: connection.daemon.instance.instanceId }));
          await connection.close();
          expect((await daemon.waitForExit(20_000)).code).toBe(0);

          const events = await scope.events();
          const daemonTree = descendants(events, daemon.pid);
          const analyzers = events.filter(event => event.pid === daemon.pid && event.event === 'spawn' && event.args?.some(arg => analyzerEntry.test(arg)));
          expect(analyzers).toHaveLength(1);
          const analyzerTree = descendants(events, analyzers[0]!.child!);
          const residentTree = new Set([...daemonTree].filter(pid => !analyzerTree.has(pid)));
          const helperSpawns = (pids: ReadonlySet<number>) => events.filter(event => event.event === 'spawn' && pids.has(event.pid)
            && event.args?.some(arg => /compiler-helper\.js$/.test(arg)));
          // The daemon process loads neither the analyzer nor the classifier; neither does any retained-session process.
          expect(loads(events, new Set([daemon.pid]), analyzerModule)).toEqual([]);
          expect(loads(events, new Set([daemon.pid]), /\/subs\/analysis\/src\/index\.js$/)).toEqual([]);
          expect(loads(events, residentTree, analyzerModule)).toEqual([]);
          expect(loads(events, residentTree, classifierModule)).toEqual([]);
          expect(helperSpawns(residentTree)).toEqual([]);
          // No traced process outside the analyzer, including both CLI hooks, loads the classifier.
          const traced = new Set(events.map(event => event.pid).filter(pid => !analyzerTree.has(pid)));
          expect(loads(events, traced, classifierModule)).toEqual([]);
          // Positive controls: the retained session's own modules are traced, and so are the analyzer's.
          expect(loads(events, residentTree, /\/subs\/analysis\/subs\/typescript\/src\/retained-source-analysis\.js$/).length).toBeGreaterThan(0);
          expect(loads(events, analyzerTree, analyzerModule).length).toBeGreaterThan(0);
          expect(helperSpawns(analyzerTree)).toHaveLength(1);
          expect(loads(events, analyzerTree, classifierModule).length).toBeGreaterThan(0);
          // The analyzer, its helper and the helper's native compiler have all exited.
          expect([...analyzerTree].filter(processAlive)).toEqual([]);

          const artifact = process.env.RAMIFY_BD24_ARTIFACT;
          if (artifact) {
            await writeFile(artifact, `${JSON.stringify({
              schemaVersion: 'ramify.bd24/1', project: 'ramify (copy of tracked toolkit inputs)', revision: revision.revision,
              inputId: revision.fingerprints.inputId, elapsedMs: Math.round(elapsedMs), diagramBytes,
              headline: ready.diagram.headline, boundaries: ready.diagram.boundaries.length, modules: ready.diagram.modules.length,
              coverage: ready.diagram.coverage, jobStillRunningAfterWatchAndHook: jobStillRunning,
              counters: { afterReady: afterReady.counters, afterEdit: afterEdit.counters },
              retainedBytes: { withDiagram: context.retainedBytes, sessionFactBytes: context.session?.factBytes ?? 0,
                afterEdit: editedContext.retainedBytes },
              processes: { daemon: daemon.pid, analyzer: analyzers[0]!.child, analyzerTree: [...analyzerTree], residentTree: [...residentTree] },
              loads: {
                daemonAnalyzer: loads(events, new Set([daemon.pid]), analyzerModule).length,
                residentAnalyzer: loads(events, residentTree, analyzerModule).length,
                residentClassifier: loads(events, residentTree, classifierModule).length,
                residentHelperSpawns: helperSpawns(residentTree).length,
                otherTracedClassifier: loads(events, traced, classifierModule).length, otherTracedProcesses: traced.size,
                analyzerClassifier: loads(events, analyzerTree, classifierModule).length,
                analyzerHelperSpawns: helperSpawns(analyzerTree).length,
              },
              hooks: { duringJob: hook.code, afterEdit: changed.code },
            }, null, 2)}\n`);
          }
        } finally {
          if (connection.state !== 'closed') {
            await connection.stopDaemon({ instanceId: connection.daemon.instance.instanceId }).catch(() => {});
            await connection.close().catch(() => {});
          }
          if (!daemon.exit) await daemon.waitForExit(20_000).catch(() => {});
        }
      });
    } finally { await rm(project, { recursive: true, force: true }); }
  }, 300_000);
});
