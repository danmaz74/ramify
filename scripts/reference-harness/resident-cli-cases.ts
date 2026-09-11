import { randomUUID } from 'node:crypto';
import { readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { connectDaemon } from '../../subs/daemon/src/connect-daemon.js';
import type { ServiceConnection } from '../../subs/daemon/src/interfaces/daemon.js';
import { compiledEntry } from '../../src/tests/process.js';
import { withProcessScope, waitForProcessCondition } from '../../src/tests/lifecycle-process.js';
import { readTrace, object, withSequenceProcess } from './equivalence-process.js';
import type { SequenceProcess } from './equivalence-process.js';
import { withLiveWatch } from './equivalence-watch.js';
import { referenceEditFixture, prepareReferenceEdits, workspaceDescription } from './fixtures/plan2/reference.js';
import { applyTextMutation, residentTextMutations as edits } from './resident-mutations.js';
import { runIsolatedProject } from './mutation.js';
import { repositoryRoot } from './plan.js';
import { plan2Instances } from './plan2-instances.js';
import { analysisEvidence, archiveObservation, recordObservation } from './observations.js';
import type { AnalysisReport } from '../../subs/analysis/src/interfaces/analysis.js';
import type { Assertions, InstanceHandler } from './runner.js';

const version = '0.0.0', engine = 'ramify.ts@0.0.0+typescript@7.0.2';
const semantic = (report: { runId: string }) => { const { runId: _, ...rest } = report; return rest; };
const noEngine = (url: string) => /\/dist\/(?:src\/batch\.js|subs\/analysis\/)|\/node_modules\/(?:typescript|@typescript)\//.test(url);
async function client(endpointDirectory: string): Promise<ServiceConnection> {
  const result = await connectDaemon({ endpointDirectory, client: { name: 'cli-reference', version }, engine,
    daemonEntry: join(repositoryRoot, 'dist/src/daemon-entry.js'), start: 'never' });
  if (result.status !== 'connected') throw new Error(JSON.stringify(result)); return result.connection;
}
async function command(p: SequenceProcess, root: string, args: string[], a: Assertions, label: string, code: number) {
  const result = await p.run(root, args);
  const raw = await archiveObservation(label, result);
  const document = result.stdout.startsWith('{') ? JSON.parse(result.stdout) as AnalysisReport : null;
  recordObservation(label, { command: result.command, code: result.code, signal: result.signal,
    error: result.error, stderr: result.stderr, durationMs: result.durationMs, raw,
    ...(document?.schemaVersion === 'ramify.analysis/1' ? { report: analysisEvidence(document) }
      : { stdout: result.stdout }) });
  a.equal(`${label}: finite expected process exit`, [result.code, result.signal, result.error], [code, null, null]);
  a.equal(`${label}: empty stderr`, result.stderr, '');
  return result;
}
async function releasedSubscriptions(p: SequenceProcess, a: Assertions) {
  const connection = await client(p.endpoint);
  try {
    await waitForProcessCondition('watch subscription released', 1000, async () => { const s = await connection.daemonStatus(); return s.ok && s.value.subscriptions === 0; });
    const s = await connection.daemonStatus();
    a.equal('daemon has zero watch subscriptions after CLI exit', s.ok && s.value.subscriptions, 0);
  } finally { await connection.close(); }
}
const handlers = new Map<string, InstanceHandler>();
for (const instance of plan2Instances.filter(item => /^I2-(19|20|21|22):/.test(item.id) && !['help-version-unchanged', 'batch-no-daemon'].includes(item.subcase))) {
  handlers.set(instance.id, { kind: 'memory', run: async ({ assertions: a }) => {
    const isolated = await runIsolatedProject({ workRoot: join(tmpdir(), 'ramify-cli-acceptance'), instanceId: instance.id, fixture: referenceEditFixture }, async ({ root }) => {
      await prepareReferenceEdits(root);
      const canonicalRoot = await realpath(root);
      if (instance.subcase === 'interrupt') {
        await withProcessScope(async scope => {
          const check = scope.start({ cwd: root, args: [compiledEntry, 'check', '--format', 'json'], timeoutMs: 30_000 });
          let connection: ServiceConnection | undefined;
          try {
            await waitForProcessCondition('real daemon check begins', 20_000, async () => {
              if (!connection) { try { connection = await client(scope.endpointDirectory); } catch { return false; } }
              const status = await connection.daemonStatus();
              return status.ok && status.value.contexts.some(context => context.pending.analysisRunning && context.pending.requests > 0);
            });
            check.signal('SIGINT');
            a.equal('SIGINT exits without claiming a report', [(await check.waitForExit(7000)).code, check.stdout], [130, '']);
            const status = await connection!.daemonStatus();
            a.ok('daemon remains available after request cancellation', status.ok);
            await waitForProcessCondition('cancelled request leaves no in-flight work', 5000, async () => {
              const current = await connection!.daemonStatus(); return current.ok && current.value.contexts.every(context => context.pending.requests === 0);
            });
            const events = await scope.events();
            a.ok('real wire cancel frame was sent', events.some(event => event.pid === check.pid && event.event === 'wire-cancel'));
            a.equal('interrupted CLI never loads batch or engine', events.filter(event => event.pid === check.pid && noEngine(event.url ?? '')), []);
          } finally {
            if (connection) { await connection.stopDaemon({ instanceId: connection.daemon.instance.instanceId }); await connection.close(); }
            if (!check.exit) { check.signal('SIGINT'); await check.waitForExit(7000); }
            await waitForProcessCondition('all launched daemon processes exit', 7000, async () => {
              const events = await scope.events();
              return events.filter(event => event.event === 'spawn' && event.child).every(event => { try { process.kill(event.child!, 0); return false; } catch { return true; } });
            });
          }
        });
        return;
      }
      await withSequenceProcess(async p => {
        const subcase = instance.subcase;
        if (['status-none', 'status-no-start', 'stop-none'].includes(subcase)) {
          const result = await command(p, root, ['daemon', subcase === 'stop-none' ? 'stop' : 'status', '--format', 'json'], a, subcase, 0);
          a.equal('empty endpoint has no invented record', JSON.parse(result.stdout), { schemaVersion: 'ramify.daemon-status/1', running: false, record: null });
          if (subcase === 'stop-none') a.equal('human absent stop is idempotent', (await p.run(root, ['daemon', 'stop'])).stdout, 'no daemon running\n');
          const events = await readTrace(p.traceFile);
          a.equal('status and stop never launch or listen', events.filter(event => ['spawn', 'listen', 'bind'].includes(event.event)), []);
          a.equal('status and stop never load engine', events.filter(event => noEngine(event.url ?? '')), []);
          return;
        }
        if (subcase === 'exit-unavailable') await rm(join(root, 'tsconfig.json'));
        const baseline = await p.check(root, true);
        a.equal('independent baseline expectation', [baseline.summary.owners, baseline.outcome.execution], subcase === 'exit-unavailable' ? [0, 'unavailable'] : [15, 'completed']);
        if (subcase === 'exit-denied') await applyTextMutation(root, edits['remove-hop']);
        if (subcase === 'exit-invalid') await applyTextMutation(root, edits['invalid-description']);
        if (subcase === 'synchronized-after-save') {
          await p.check(root, false);
          await applyTextMutation(root, edits['remove-hop']);
        }
        if (instance.matrixId === 'I2-20') {
          const expected = subcase === 'exit-unavailable' ? 2 : ['exit-denied', 'exit-invalid', 'synchronized-after-save'].includes(subcase) ? 1 : 0;
          const cwd = subcase === 'root-from-subdirectory' ? join(root, 'subs/workspace/subs/catalog/src') : root;
          if (subcase === 'human') {
            const result = await command(p, cwd, ['check'], a, 'resident human check', expected);
            a.ok('resident mode includes real identity, revision and freshness', /Mode: resident \(daemon \d+; context ctx\/1:.*; revision \d+; synchronized/.test(result.stdout));
            a.ok('Plan 1 human details retained', result.stdout.includes(`Root: ${canonicalRoot} (found from ${canonicalRoot})`) && result.stdout.includes('Execution: completed; check: passed; coverage: complete'));
          } else {
            const result = await command(p, cwd, ['check', '--format', 'json'], a, 'resident JSON check', expected);
            const report = JSON.parse(result.stdout);
            a.equal('exactly one bare versioned analysis document', [report.schemaVersion, result.stdout.trim().split('\n').length], ['ramify.analysis/1', 1]);
            const batch = await command(p, cwd, ['check', '--batch', '--format', 'json'], a, 'independent batch check', expected);
            a.equal('resident semantic report matches independent batch', semantic(report), semantic(JSON.parse(batch.stdout)));
            if (subcase === 'exit-denied' || subcase === 'synchronized-after-save') a.equal('provider edit yields exact located denial', report.diagnostics.map((issue: { code: string; location: { file: string } }) => [issue.code, issue.location.file]), [['not-visible', 'src/assembly.ts']]);
            if (subcase === 'root-from-subdirectory') a.equal('root discovery retains caller selection', [report.scope.root, report.scope.selection], [canonicalRoot, 'found']);
            if (subcase === 'exit-invalid') a.equal('description fault is invalid', report.outcome.execution, 'invalid');
            if (subcase === 'exit-unavailable') {
              const human = await command(p, root, ['check'], a, 'unavailable human check', 2);
              a.ok('unresolved resident result identifies no context', /Mode: resident \(daemon \d+; no context\)/.test(human.stdout));
              a.ok('no-config diagnostic survives adapter', human.stdout.includes('configuration-not-found'));
              a.equal('failed resolution creates no context', object((await p.status()).status).contexts, []);
            }
          }
        } else if (instance.matrixId === 'I2-19') {
          await p.check(root, false);
          const events = await readTrace(p.traceFile);
          const starts = events.filter(event => event.event === 'start');
          const daemonPid = Number(object((await p.status()).status).pid);
          if (subcase === 'daemon-entry-boundary') {
            const loaded = events.filter(event => event.pid === daemonPid && event.event === 'load').map(event => event.url ?? '');
            a.ok('trace contains actual daemon assembly', loaded.some(url => url.endsWith('/dist/src/resident-assembly.js')));
            a.equal('daemon closure excludes CLI presentation UI and compiler packages', loaded.filter(url => /\/dist\/subs\/(?:cli|presentation|layout|mcp|web)\/|\/node_modules\/(?:react|react-dom|d3-[^/]+|@modelcontextprotocol|typescript|@typescript)\//.test(url)), []);
            a.ok('compiler work occurs in separate helpers', events.some(event => event.pid === daemonPid && event.event === 'spawn' && event.args?.some(arg => arg.includes('compiler-helper'))));
          } else {
            const cli = starts.filter(event => event.argv?.includes('check') && !event.argv?.includes('--batch')).at(-1)!;
            a.ok('resident CLI start was observed', cli);
            a.equal('CLI closure and socket role remain lightweight', events.filter(event => event.pid === cli.pid && (noEngine(event.url ?? '') || ['listen', 'bind'].includes(event.event))), []);
          }
        } else if (instance.matrixId === 'I2-22') {
          await p.check(root, false);
          const current = await p.status(), status = object(current.status);
          if (subcase === 'status-running') {
            a.equal('status is real, running and has one context', [current.running, (status.contexts as unknown[]).length], [true, 1]);
            a.ok('status includes identity budgets and counters', status.instanceId && status.pid && status.budgets && status.counters);
          } else if (subcase === 'stop-running') {
            const stopped = await command(p, root, ['daemon', 'stop', '--format', 'json'], a, 'explicit stop', 0);
            a.equal('explicit stop record returned', JSON.parse(stopped.stdout).record.stopped.reason, 'explicit');
            let alive = true; try { process.kill(Number(status.pid), 0); } catch { alive = false; }
            a.equal('stop waits until actual daemon is gone', alive, false);
          } else {
            const connection = await client(p.endpoint);
            try {
              const wrong = await connection.stopDaemon({ instanceId: randomUUID() });
              a.equal('foreign instance cannot stop current daemon', wrong.ok ? null : wrong.error.code, 'wrong-instance');
              a.ok('daemon is usable after rejected stop', (await connection.daemonStatus()).ok);
            } finally { await connection.close(); }
          }
        } else {
          let lastReport: { runId: string } | undefined;
          await withLiveWatch(p, root, async next => {
            const status = await next(30_000); a.equal('watch begins with versioned status line', status.value.event, 'status');
            const revisionLine = async () => { let line = await next(30_000); while (line.value.event === 'status') line = await next(30_000); return line; };
            const first = await revisionLine(); a.equal('watch publishes baseline report', first.value.event, 'revision');
            const validate = (line: typeof first, label: string) => {
              const report = object(line.value.report), revision = object(line.value.revision);
              a.equal(`${label}: report belongs to its exact revision`, [object(revision.fingerprints).inputId, revision.summary, revision.outcome], [report.inputId, report.summary, report.outcome]);
              lastReport = report as { runId: string };
            };
            validate(first, 'initial');
            if (subcase === 'stream-updates') {
              await applyTextMutation(root, edits['remove-hop']);
              const denied = await revisionLine(); validate(denied, 'denied');
              a.equal('watch renders denial', object(object(denied.value.report).summary).denied, 1);
              await applyTextMutation(root, edits['remove-hop'], true);
              const restored = await revisionLine(); validate(restored, 'restored');
              a.equal('watch renders repaired report', object(object(restored.value.report).summary).denied, 0);
            } else if (subcase === 'bounded-burst') {
              const path = join(root, workspaceDescription), original = await readFile(path, 'utf8');
              for (let index = 0; index < 100; index++) await writeFile(path, original + `\n// burst ${index}\n`);
              const final = await p.check(root, true);
              let lines = 0;
              const line = await revisionLine(); validate(line, `burst-${++lines}`);
              // Coalescing may skip intermediate revisions, but the final input must arrive.
              while (!isDeepStrictEqual(semantic(lastReport!), semantic(final))) { const line = await revisionLine(); validate(line, `burst-${++lines}`); if (lines > 101) throw new Error('Unbounded watch burst'); }
              a.ok('100 writes produce bounded revision stream', lines <= 101);
            }
          });
          await releasedSubscriptions(p, a);
          const final = await p.check(root, false);
          a.equal('last watched report equals fresh synchronized result', semantic(lastReport!), semantic(final));
        }
      });
    });
    if (!isolated.ok) throw isolated.error;
  } });
}
export const residentCliHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
