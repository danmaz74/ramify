import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeDependencyDiagram } from '../../subs/analysis/src/index.js';
import type { AnalysisReport, DependencyAnalyzerOutcome, ProjectRequest } from '../../subs/analysis/src/index.js';
import { limits, runBatch } from '../batch.js';
import { createProcessDependencyAnalyzer, dependencyAnalyzerCapacity } from '../dependency-analyzer-process.js';
import { repositoryRoot } from './process.js';

// BD17 runs the built analyzer entry and observes its process and compiler helper from outside.
const entry = join(repositoryRoot, 'dist/src/dependency-analyzer-entry.js');
const reference = join(repositoryRoot, 'examples/collection-review');
const disposalMs = dependencyAnalyzerCapacity.disposalMs;
const pause = (ms: number) => new Promise(done => setTimeout(done, ms));

interface Row { readonly pid: number; readonly ppid: number; readonly args: string }
async function rows(): Promise<Row[]> {
  const { stdout } = await promisify(execFile)('ps', ['-eo', 'pid=,ppid=,args=']);
  return stdout.split('\n').flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), args: match[3]! }] : [];
  });
}
const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
};

/** The analyzer child of this test process and its compiler helper, once both are running. */
async function analyzerProcesses(timeoutMs = 30_000): Promise<{ readonly analyzer: number; readonly helper: number; readonly observedMs: number }> {
  const started = performance.now();
  for (;;) {
    const table = await rows();
    const analyzer = table.find(row => row.ppid === process.pid && row.args.includes(entry));
    const helper = analyzer && table.find(row => row.ppid === analyzer.pid && row.args.includes('compiler-helper.js'));
    if (analyzer && helper) return { analyzer: analyzer.pid, helper: helper.pid, observedMs: performance.now() - started };
    if (performance.now() - started > timeoutMs) throw new Error('The analyzer child and its compiler helper did not both start');
    await pause(10);
  }
}
/** Milliseconds until every PID has exited; fails after the disposal limit. */
async function exited(pids: readonly number[], from: number): Promise<number> {
  while (pids.some(alive)) {
    if (performance.now() - from > disposalMs) throw new Error(`Processes ${pids.filter(alive).join(', ')} outlived the disposal limit`);
    await pause(10);
  }
  return performance.now() - from;
}

let report: AnalysisReport;
/** The request that produced the report, as a context supplies it. */
let project: ProjectRequest;
beforeAll(async () => {
  await access(entry);
  const result = await runBatch({ cwd: reference, capabilities: ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog',
    'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] });
  if (result.status !== 'reported' || result.report.outcome.execution !== 'completed') throw new Error('Expected a completed reference report');
  report = result.report;
  project = report.request.project;
}, 60_000);

describe('dependency analyzer process runner', () => {
  it('returns the in-process diagram from one child that exits with its helper', async () => {
    const runner = createProcessDependencyAnalyzer(process.execPath, entry);
    const pending = runner.run({ project, report });
    const { analyzer, helper } = await analyzerProcesses();
    const outcome = await pending;
    const settled = performance.now();
    if (outcome.status !== 'ready') throw new Error(`Expected a ready outcome: ${JSON.stringify(outcome)}`);
    expect(outcome.behaviorRuns).toBe(1);
    expect(outcome.diagram.inputId).toBe(report.inputId);
    expect(outcome.diagram.headline).toEqual({ behavioralDependencies: 17, nonBehavioralDependencies: 48 });
    await exited([analyzer, helper], settled);
    const direct = await analyzeDependencyDiagram({ project, report,
      limits: { source: limits.source, maxResultBytes: dependencyAnalyzerCapacity.maxResultBytes, deadlineMs: dependencyAnalyzerCapacity.deadlineMs } });
    expect(direct.status).toBe('ready');
    expect(JSON.stringify(outcome.diagram)).toBe(JSON.stringify((direct as Extract<DependencyAnalyzerOutcome, { status: 'ready' }>).diagram));
  }, 120_000);

  it('terminates the child and its helper on cancellation, the deadline and an oversized response (BD17)', async () => {
    // Cancellation while the helper runs.
    const controller = new AbortController();
    const cancelled = createProcessDependencyAnalyzer(process.execPath, entry).run({ project, report }, { signal: controller.signal });
    const first = await analyzerProcesses();
    const abortedAt = performance.now();
    controller.abort();
    expect(await cancelled).toEqual({ status: 'cancelled' });
    expect(performance.now() - abortedAt).toBeLessThan(disposalMs);
    await exited([first.analyzer, first.helper], abortedAt);

    // A deadline that expires after the helper has started.
    const started = performance.now();
    const deadlineMs = Math.ceil(first.observedMs) + 300;
    const late = createProcessDependencyAnalyzer(process.execPath, entry, { deadlineMs }).run({ project, report });
    const second = await analyzerProcesses();
    const outcome = await late;
    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
    expect(outcome).not.toHaveProperty('diagram');
    await exited([second.analyzer, second.helper], started + deadlineMs);

    // A response above the capacity.
    const oversized = createProcessDependencyAnalyzer(process.execPath, entry, { responseBytes: 1024 }).run({ project, report });
    const third = await analyzerProcesses();
    const refused = await oversized;
    const refusedAt = performance.now();
    expect(refused).toMatchObject({ status: 'unavailable', reason: 'resource-limit', message: expect.stringContaining('1024 bytes') });
    await exited([third.analyzer, third.helper], refusedAt);
  }, 120_000);

  it('refuses an incomplete report in the child without starting a helper (BD17)', async () => {
    const runner = createProcessDependencyAnalyzer(process.execPath, entry);
    for (const execution of ['invalid', 'incomplete'] as const) {
      const outcome = await runner.run({ project, report: { ...report, outcome: { ...report.outcome, execution } } });
      expect(outcome).toMatchObject({ status: 'unavailable', reason: 'invalid-report' });
    }
    expect((await rows()).filter(row => row.args.includes(entry))).toEqual([]);
    expect(await runner.run({ project, report }, { signal: AbortSignal.abort() })).toEqual({ status: 'cancelled' });
  }, 60_000);
});
