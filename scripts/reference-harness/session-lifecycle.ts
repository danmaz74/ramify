import childProcesses from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { analyzeProject, createAnalysisSession } from '../../subs/analysis/src/index.js';
import type { AnalysisReport, AnalysisRun, AnalysisSession } from '../../subs/analysis/src/index.js';
import { Assertions } from './runner.js';
import { inspectPlainReport, sessionInputs } from './session-expectations.js';

const [root, id] = process.argv.slice(2);
if (!root || !id) throw new Error('Lifecycle worker requires explicit fixture root and instance ID');
const assertions = new Assertions();
const target = join(root, 'subs/provider/src/interfaces/api.ts');
const originalText = await fs.readFile(target, 'utf8');
const originalOpen = fs.open, originalSpawn = childProcesses.spawn;
const handles = new Set<Awaited<ReturnType<typeof fs.open>>>();
const children = new Set<ReturnType<typeof childProcesses.spawn>>();
let opened = 0, closed = 0, helpers = 0, helperClosed = 0, targetOpens = 0, barriers = 0, mutations = 0;
let onBarrier: (() => void) | undefined;
let barrierKind: 'acquisition' | 'catalog' | undefined;
let fault = false;
let changes: 'once' | 'repeated' | undefined;
let releaseRead: (() => void) | undefined;

// Instrument only the OS boundary in this dedicated worker. Calls still use
// actual files, actual compiler processes and the unchanged public session.
fs.open = (async (...args: Parameters<typeof originalOpen>) => {
  const file = typeof args[0] === 'string' ? resolve(args[0]) : '';
  if (file === target) {
    targetOpens++;
    if (fault) {
      barriers++;
      throw Object.assign(new Error('Injected provider captured-input read failure'), { code: 'EIO' });
    }
    // First open captures bytes, second reopens them at capture validation.
    // Repeating alternates those two opens on each complete acquisition attempt.
    if (changes && targetOpens % 2 === 0 && (changes === 'repeated' || mutations === 0)) {
      mutations++;
      await fs.writeFile(target, `${originalText}\nexport const changed${mutations} = ${mutations};\n`);
    }
  }
  const handle = await Reflect.apply(originalOpen, fs, args) as Awaited<ReturnType<typeof fs.open>>;
  opened++; handles.add(handle);
  const originalClose = handle.close.bind(handle);
  handle.close = async () => {
    try { await originalClose(); }
    finally { if (handles.delete(handle)) closed++; }
  };
  if (file === target && barrierKind === 'acquisition') {
    const originalRead = handle.read.bind(handle);
    handle.read = (async (...readArgs: unknown[]) => {
      if (barrierKind === 'acquisition') {
        barrierKind = undefined; barriers++;
        const held = new Promise<void>(done => { releaseRead = done; });
        setImmediate(() => onBarrier?.());
        await held;
      }
      return Reflect.apply(originalRead, handle, readArgs);
    }) as typeof handle.read;
  }
  return handle;
}) as typeof fs.open;
childProcesses.spawn = ((...args: Parameters<typeof originalSpawn>) => {
  const child = Reflect.apply(originalSpawn, childProcesses, args) as ReturnType<typeof originalSpawn>;
  const command = JSON.stringify(args);
  if (command.includes('compiler-helper.')) {
    helpers++; children.add(child);
    child.once('close', () => { if (children.delete(child)) helperClosed++; });
    if (child.stdin) {
      const originalWrite = child.stdin.write.bind(child.stdin);
      child.stdin.write = ((...writeArgs: unknown[]) => {
        const result = Reflect.apply(originalWrite, child.stdin, writeArgs);
        if (barrierKind === 'catalog' && String(writeArgs[0]).includes('"command":"catalog"')) {
          barrierKind = undefined; barriers++;
          // The real catalog command has been submitted; pause its return
          // channel at this deterministic work boundary before cancellation.
          child.stdout?.pause();
          setImmediate(() => onBarrier?.());
        }
        return result;
      }) as typeof child.stdin.write;
    }
  }
  return child;
}) as typeof childProcesses.spawn;
syncBuiltinESMExports();

function reported(run: AnalysisRun): AnalysisReport {
  if (run.status !== 'reported') throw new Error('Expected public session report');
  return run.report;
}
function released(label: string): void {
  assertions.equal(`${label}: captured file handles closed`, [handles.size, opened], [0, closed]);
  assertions.equal(`${label}: compiler processes closed`, [children.size, helpers], [0, helperClosed]);
}
async function expectDisposed(session: AnalysisSession, label: string): Promise<void> {
  const report = reported(await session.analyze());
  assertions.ok(`${label}: disposed session refuses new work`, report.outcome.execution === 'incomplete'
    && report.outcome.check === 'not-run' && report.diagnostics.some(issue => issue.code === 'session-disposed'));
}
async function run(): Promise<void> {
  if (id.includes(':cancel/') || id.endsWith(':dispose/in-flight')) {
    const controller = new AbortController();
    const session = createAnalysisSession(sessionInputs(root));
    barrierKind = id.endsWith('/catalog') ? 'catalog' : 'acquisition';
    let disposal: Promise<void> | undefined;
    let cancelledAt = 0;
    onBarrier = () => {
      cancelledAt = performance.now();
      if (id.endsWith(':dispose/in-flight')) disposal = session.dispose(); else controller.abort();
      // Dispose/abort is requested while the read is held; release it so the
      // real operation can observe cancellation and close its owned handle.
      setImmediate(() => releaseRead?.());
    };
    try {
      const result = await session.analyze({ signal: controller.signal });
      assertions.equal('barrier reached during actual acquisition or catalog work', barriers, 1);
      assertions.equal('no successful result follows cancellation or disposal', result, { status: 'cancelled' });
      await disposal;
      assertions.ok('cooperative cancellation satisfies five second cleanup bound', cancelledAt > 0 && performance.now() - cancelledAt < 5000);
      released('cancelled analysis');
      if (id.endsWith('/catalog')) assertions.equal('catalog cancellation released its real helper', [helpers, helperClosed], [1, 1]);
      await session.dispose(); await session.dispose();
      await expectDisposed(session, 'cancelled session');
    } finally { releaseRead?.(); await session.dispose(); }
    return;
  }
  if (id.endsWith(':read-failure')) {
    fault = true;
    const session = createAnalysisSession(sessionInputs(root));
    try {
      const report = reported(await session.analyze());
      assertions.equal('fault occurred at discovered source capture', barriers, 1);
      assertions.equal('operational read failure is incomplete', report.outcome.execution, 'incomplete');
      assertions.equal('read failure cannot report a completed check', [report.outcome.check, report.summary.complete], ['not-run', false]);
      assertions.ok('read failure preserves useful located cause', report.diagnostics.some(issue => issue.code === 'read-failure'
        && issue.message.includes('Injected provider captured-input read failure') && issue.location?.file === 'subs/provider/src/interfaces/api.ts'));
      assertions.ok('earlier registry evidence remains visible', report.stages.some(stage => stage.stage === 'registry' && stage.status === 'completed'));
      assertions.ok('dependent source stages explicitly blocked', report.stages.filter(stage => ['catalog', 'link', 'access', 'decide'].includes(stage.stage))
        .every(stage => stage.status === 'blocked' && stage.blockedBy.length > 0));
      await session.dispose(); await session.dispose(); released('read failure');
      await expectDisposed(session, 'failed session');
    } finally { fault = false; await session.dispose(); }
    const control = reported(await analyzeProject(sessionInputs(root)));
    assertions.equal('a fresh real session succeeds after removing read fault', control.outcome.check, 'passed');
    released('read failure positive control');
    return;
  }
  if (id.endsWith(':dispose/completed')) {
    const session = createAnalysisSession(sessionInputs(root));
    try {
      const report = reported(await session.analyze());
      const serialized = JSON.stringify(report);
      assertions.equal('real session completes before disposal', report.outcome.check, 'passed');
      released('completed analysis');
      const repeated = reported(await session.analyze());
      assertions.ok('completed session rejects repeated analysis', repeated.diagnostics.some(issue => issue.code === 'session-used'));
      await session.dispose(); await session.dispose();
      await expectDisposed(session, 'completed session');
      assertions.equal('retained report survives disposal without mutation', JSON.stringify(report), serialized);
      assertions.ok('retained report contains only frozen plain data', inspectPlainReport(report).objects > 0);
      released('repeated disposal');
    } finally { await session.dispose(); }
    return;
  }
  if (id.includes(':changed-input/')) {
    changes = id.endsWith('/once') ? 'once' : 'repeated';
    const report = reported(await analyzeProject(sessionInputs(root)));
    released('changed acquisition');
    if (changes === 'once') {
      assertions.equal('one mutation occurred at capture validation', mutations, 1);
      assertions.equal('stable retry completed real checking', report.outcome, { execution: 'completed', check: 'passed', coverage: 'complete' });
      const digest = createHash('sha256').update(await fs.readFile(target)).digest('hex');
      assertions.equal('inventory and captured bytes share the final coherent file identity',
        [report.snapshot!.inventory.files.find(file => file.path === 'subs/provider/src/interfaces/api.ts')?.sha256,
          report.snapshot!.inputs.find(input => input.path === 'subs/provider/src/interfaces/api.ts')?.sha256], [digest, digest]);
      assertions.ok('catalog represents stabilized source bytes', report.snapshot!.catalog!.originals.some(original => original.id.binding === 'changed1'));
      changes = undefined;
      const control = reported(await analyzeProject(sessionInputs(root)));
      assertions.equal('fresh unchanged run confirms the input identity', control.inputId, report.inputId);
      assertions.ok('fresh batch run IDs remain distinct', control.runId !== report.runId);
    } else {
      assertions.equal('finite acquisition retry budget is exact', mutations, sessionInputs(root).limits.acquisition.attempts);
      assertions.equal('repeated change cannot publish mixed-state success', [report.outcome.execution, report.outcome.check, report.inputId, report.summary.complete],
        ['incomplete', 'not-run', null, false]);
      assertions.ok('retry exhaustion reports changed input', report.diagnostics.some(issue => issue.code === 'changed-input'));
      assertions.ok('retry exhaustion blocks source decisions', report.stages.some(stage => stage.stage === 'decide' && stage.status === 'blocked'));
    }
    released('changed-input final control');
    return;
  }
  if (id.endsWith(':report-retention')) {
    if (!global.gc) throw new Error('Retention worker requires --expose-gc');
    const reports: AnalysisReport[] = [], weakSessions: WeakRef<AnalysisSession>[] = [];
    const samples: { heap: number; rss: number; reportBytes: number }[] = [];
    let reportBytes = 0, objectCount = 0;
    async function cycle(retain: boolean): Promise<void> {
      const session = createAnalysisSession(sessionInputs(root));
      weakSessions.push(new WeakRef(session));
      try {
        const report = reported(await session.analyze());
        if (report.outcome.check !== 'passed') throw new Error(JSON.stringify(report.diagnostics));
        const plain = inspectPlainReport(report);
        objectCount += plain.objects;
        if (retain) { reports.push(report); reportBytes += plain.bytes; }
      } finally { await session.dispose(); }
    }
    for (let index = 0; index < 30; index++) {
      await cycle(index >= 5);
      await yieldTurn(); global.gc(); await yieldTurn(); global.gc();
      released(`cycle ${index + 1}`);
      if (index >= 5) {
        const memory = process.memoryUsage();
        samples.push({ heap: memory.heapUsed, rss: memory.rss, reportBytes });
      }
    }
    assertions.equal('five warmups plus twenty-five retained-report cycles ran', [helpers, reports.length, samples.length], [30, 25, 25]);
    assertions.ok('every nested report object has frozen plain descriptors', objectCount > 1000);
    assertions.equal('retained reports do not keep disposed session objects alive', weakSessions.filter(reference => reference.deref() !== undefined).length, 0);
    assertions.equal('serialized report retention explicitly accounted', reportBytes, reports.reduce((sum, report) => sum + Buffer.byteLength(JSON.stringify(report)), 0));
    const first = samples[5], last = samples.at(-1)!;
    assertions.ok(`last twenty samples remain below sixteen MiB heap growth beyond reports (observed ${(last.heap - last.reportBytes) - (first.heap - first.reportBytes)} bytes)`,
      (last.heap - last.reportBytes) - (first.heap - first.reportBytes) <= 16 * 1024 ** 2);
    assertions.ok(`last twenty samples remain below sixty-four MiB RSS growth (observed ${last.rss - first.rss} bytes)`, last.rss - first.rss <= 64 * 1024 ** 2);
    assertions.ok(`post-disposal retained-report samples in bytes: ${JSON.stringify(samples)}`, samples.every(sample => sample.heap > 0 && sample.rss > 0 && sample.reportBytes > 0));
    assertions.ok('each fresh run has a distinct batch identity', new Set(reports.map(report => report.runId)).size === 25);
    assertions.equal('identical captured inputs keep their content identity', new Set(reports.map(report => report.inputId)).size, 1);
    return;
  }
  throw new Error(`Unknown lifecycle instance ${id}`);
}
let error: string | undefined;
try { await run(); }
catch (cause) { error = cause instanceof Error ? cause.stack ?? cause.message : String(cause); }
finally {
  releaseRead?.();
  fs.open = originalOpen; childProcesses.spawn = originalSpawn; syncBuiltinESMExports();
}
process.stdout.write(JSON.stringify({ assertions: assertions.finish(), ...(error ? { error } : {}) }) + '\n');
