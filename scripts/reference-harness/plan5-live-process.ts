import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import type { CheckDocument } from '../../subs/cli/src/interfaces/cli.js';
import type { ContextRevision } from '../../subs/daemon/src/context-types.js';
import type { CheckParams, DaemonStatus } from '../../src/interfaces/service.js';
import type { TraceEvent } from '../../src/tests/process.js';
import { assertResidentTrace, readTrace, withSequenceProcess } from './equivalence-process.js';
import type { SequenceProcess } from './equivalence-process.js';
import { firstDifference, parseAnalysisDocument } from './equivalence-comparison.js';
import { withLiveWatch } from './equivalence-watch.js';
import { archiveObservation, recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import type { Assertions } from './runner.js';

export interface LiveEvent extends TraceEvent {
  readonly at: number; readonly id?: number | string; readonly operation?: string;
  readonly kind?: string; readonly status?: string; readonly sequence?: number;
  readonly held?: boolean; readonly name?: string; readonly threadId?: number;
  readonly params?: CheckParams; readonly requestId?: string;
  readonly freshness?: { readonly reusedRevision: boolean; readonly verified: boolean; readonly captureStarted: number | null };
}
export const liveTrace = async (p: SequenceProcess): Promise<LiveEvent[]> => await readTrace(p.traceFile) as LiveEvent[];
export const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export async function status(p: SequenceProcess): Promise<DaemonStatus> {
  const document = await p.status();
  assert.equal(document.running, true, 'The owned daemon must remain alive');
  const value = document.status as DaemonStatus;
  assert.equal(value.contexts.length, 1, 'One context makes audit and counter attribution exact');
  return value;
}

export async function withLiveProcess<T>(root: string, directory: string, a: Assertions,
  run: (p: SequenceProcess) => Promise<T>, auditInterval = 5000): Promise<T> {
  return withSequenceProcess(async p => {
    p.environment.NODE_OPTIONS += ` --import=${join(repositoryRoot, 'scripts/reference-harness/fixtures/plan5/live-probe.mjs')}`;
    const entry = join(directory, 'live-daemon.mjs');
    await writeFile(entry, `process.argv.push('--budgets', ${JSON.stringify(JSON.stringify({ sweepIntervalMs: auditInterval }))});\nawait import(${JSON.stringify(pathToFileURL(join(repositoryRoot, 'dist/src/daemon-entry.js')).href)});\n`);
    p.environment.RAMIFY_DAEMON_ENTRY = entry;
    const result = await run(p);
    const final = await status(p);
    a.equal('final context has no audit mismatch or cancelled analysis', [final.counters.auditMismatches, final.counters.cancelledAnalyses], [0, 0]);
    const stop = await p.run(root, ['daemon', 'stop', '--format', 'json']);
    a.equal('installed executable gracefully stops its daemon', [stop.code, stop.error, stop.signal], [0, null, null]);
    const events = await liveTrace(p);
    const workers = events.filter(e => e.event === 'live-worker');
    a.ok('real session supervisor and worker were created', workers.length > 0 && events.some(e => e.event === 'live-thread'));
    a.equal('every session worker exited before daemon stop acknowledged', workers.map(e => e.child).sort(),
      events.filter(e => e.event === 'live-thread-exit').map(e => e.child).sort());
    return result;
  });
}

/** Start edits just after a real idle sweep finishes. Otherwise a periodic
 * sweep can legitimately discover the write before the 100 ms native watcher
 * window, which establishes equality but earns no watcher-publication credit. */
export async function watchWindow(p: SequenceProcess, label: string, sequence: number, a: Assertions): Promise<void> {
  const deadline = performance.now() + 60_000;
  while (performance.now() < deadline) {
    const value = await status(p);
    const sweeps = (await liveTrace(p)).filter(event => event.event === 'live-work-result' && event.operation === 'sweep');
    const latest = sweeps.at(-1);
    const age = latest ? performance.timeOrigin + performance.now() - latest.at : Infinity;
    if (latest && age >= 0 && age < 500 && !value.contexts[0].pending.analysisRunning
      && value.contexts[0].pending.changedPaths === 0 && value.contexts[0].synchronization === 'synchronized') {
      a.equal(`${label}: edit starts after an unchanged real sweep`, [latest.kind, latest.status, latest.sequence,
        value.contexts[0].published?.sequence], ['reply', 'unchanged', sequence, sequence]);
      recordObservation('live-watch-window', { label, ageMs: age, sweep: latest, intervalMs: value.budgets.sweepIntervalMs });
      return;
    }
    await new Promise(done => setTimeout(done, 50));
  }
  a.ok(`${label}: real sweep supplies a watcher observation window`, false);
}

export async function changed(p: SequenceProcess, root: string, a: Assertions, label: string,
  paths: readonly string[], expected: 0 | 1 | 2, since?: string): Promise<CheckDocument> {
  const expectedIdentities = await Promise.all(paths.map(async path => {
    try { return { path, sha256: hash(await readFile(join(root, path))), covered: expected !== 2 }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return { path, sha256: null, covered: expected !== 2 }; }
  }));
  const args = ['check', '--changed', ...paths, '--deadline', '60000', ...(since ? ['--since', since] : []), '--format', 'json'];
  const offset = (await liveTrace(p)).length;
  const outcome = await p.run(root, args);
  recordObservation('live-hook', { label, raw: await archiveObservation('live-hook', outcome) });
  a.equal(`${label}: installed hook exits with one result`, [outcome.code, outcome.error, outcome.signal, outcome.stderr], [expected, null, null, '']);
  const document = JSON.parse(outcome.stdout) as CheckDocument;
  a.equal(`${label}: compact document`, [document.schemaVersion, document.exitCode, outcome.stdout.trim().split('\n').length], ['ramify.check/1', expected, 1]);
  a.equal(`${label}: exact CLI hashes and coverage`, document.changed, expectedIdentities);
  if (expected !== 2) a.equal(`${label}: completed covering check`, [document.outcome, document.reason, document.execution], ['checked', null, 'completed']);
  const events = (await liveTrace(p)).slice(offset);
  const starts = events.filter(e => e.event === 'start' && e.argv?.[1] === p.executable
    && JSON.stringify(e.argv.slice(2)) === JSON.stringify(args));
  a.equal(`${label}: one independently traced installed hook`, starts.length, 1);
  const start = starts[0];
  assertResidentTrace(events, start.pid, p.endpoint);
  a.ok(`${label}: hook used real IPC without a batch engine`, true);
  return document;
}

export interface LiveRevision { readonly revision: ContextRevision; readonly report: AnalysisReport }
export async function watching<T>(p: SequenceProcess, root: string, a: Assertions,
  run: (initial: LiveRevision, next: () => Promise<LiveRevision>) => Promise<T>): Promise<T> {
  return withLiveWatch(p, root, async read => {
    const first = await read(60_000);
    a.equal('installed watch starts with real active watcher', [first.value.event, (first.value.current as { watcher: string }).watcher], ['status', 'active']);
    const next = async (): Promise<LiveRevision> => {
      const deadline = performance.now() + 60_000;
      let line = await read(deadline - performance.now());
      while (line.value.event === 'status') line = await read(deadline - performance.now());
      assert.equal(line.value.event, 'revision');
      const revision = line.value.revision as unknown as ContextRevision;
      const report = parseAnalysisDocument(JSON.stringify(line.value.report));
      a.equal(`watch ${revision.sequence}: header and report describe identical inputs and outcomes`,
        [revision.fingerprints.inputId, revision.summary, revision.outcome], [report.inputId, report.summary, report.outcome]);
      return { revision, report };
    };
    return run(await next(), next);
  });
}

/** Snapshot the watch projection before any audit can repair it, then compare
 * every field (including captured inputs and invocation) with fresh batch. */
export async function compareAndAudit(p: SequenceProcess, root: string, label: string,
  current: LiveRevision, a: Assertions): Promise<void> {
  const batch = await p.check(root, true);
  recordObservation('live-comparison', { label, sequence: current.revision.sequence,
    raw: await archiveObservation('live-comparison', { label, revision: current.revision, resident: current.report, batch }) });
  a.equal(`${label}: whole report equals fresh batch except runId`,
    firstDifference({ ...current.report, runId: 'comparison' }, { ...batch, runId: 'comparison' }), null);
  const deadline = performance.now() + 60_000;
  let audited: LiveEvent | undefined, final: DaemonStatus | undefined;
  while (performance.now() < deadline) {
    const events = await liveTrace(p);
    audited = events.find(e => e.event === 'live-work-result' && e.operation === 'verify' && e.sequence === current.revision.sequence);
    if (audited) {
      final = await status(p);
      if (!final.contexts[0].pending.analysisRunning) break;
    }
    await new Promise(done => setTimeout(done, 50));
  }
  a.ok(`${label}: session audit actually returned for this sequence`, audited);
  a.equal(`${label}: session audit returned equal`, [audited?.kind, audited?.status], ['reply', 'equal']);
  a.ok(`${label}: audit is visible through installed daemon status`, final && final.counters.audits > 0);
  a.equal(`${label}: audit preserves revision and synchronized state`, final && [final.contexts[0].published?.sequence,
    final.contexts[0].synchronization, final.counters.auditMismatches, final.counters.cancelledAnalyses], [current.revision.sequence, 'synchronized', 0, 0]);
  recordObservation('live-audit', { label, audit: audited, status: final });
}
