import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
    expect(outcome.diagram.headline).toEqual({ behavioralDependencies: 17, nonBehavioralDependencies: 58 });
    await exited([analyzer, helper], settled);
    const direct = await analyzeDependencyDiagram({ project, report,
      limits: { source: limits.source, maxResultBytes: dependencyAnalyzerCapacity.maxResultBytes, deadlineMs: dependencyAnalyzerCapacity.deadlineMs } });
    expect(direct.status).toBe('ready');
    expect(JSON.stringify(outcome.diagram)).toBe(JSON.stringify((direct as Extract<DependencyAnalyzerOutcome, { status: 'ready' }>).diagram));
    // The test references of the same run arrive beside the diagram, byte for byte as the analyzer projected them.
    expect(outcome.testReferences).not.toBeNull();
    expect(outcome.testReferences!.inputId).toBe(report.inputId);
    expect(JSON.stringify(outcome.testReferences))
      .toBe(JSON.stringify((direct as Extract<DependencyAnalyzerOutcome, { status: 'ready' }>).testReferences));
  }, 120_000);

  it('accepts a ready outcome only with null references or references of the diagram\'s input (AV38)', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-analyzer-outcome-'));
    try {
      const diagram = { inputId: 'input/1:a', modules: ['fixture'], headline: { behavioralDependencies: 0, nonBehavioralDependencies: 0 },
        boundaries: [], coverage: { state: 'complete', unknownDependencies: 0, limitIds: [] } };
      const references = { inputId: 'input/1:a', files: [{ file: 'src/tests/a.test.ts',
        exercises: [{ kind: 'code', owner: 'fixture', file: 'a.ts', binding: 'a' }], unclassified: 1 }] };
      const ready = (testReferences: unknown): Record<string, unknown> => ({ status: 'ready', diagram, ...testReferences === undefined ? {} : { testReferences },
        behaviorRuns: 1, timings: { acquireMs: 1, classifyMs: 1, projectMs: 1, totalMs: 3 } });
      /** A child entry that prints `outcome` as its one JSON line. */
      const child = async (name: string, outcome: unknown) => {
        const entry = join(directory, `${name}.mjs`);
        await writeFile(entry, `process.stdin.resume();\nprocess.stdin.on('end', () => process.stdout.write(${JSON.stringify(`${JSON.stringify(outcome)}\n`)}));\n`);
        return createProcessDependencyAnalyzer(process.execPath, entry).run({ project, report });
      };
      expect(await child('null', ready(null))).toEqual(ready(null));
      expect(await child('references', ready(references))).toEqual(ready(references));
      const invalid = { status: 'unavailable', reason: 'analysis-failed', message: 'The dependency analyzer returned an invalid outcome' };
      const file = references.files[0]!;
      for (const [name, testReferences] of [
        ['absent', undefined], ['other-input', { ...references, inputId: 'input/1:b' }], ['no-files', { inputId: 'input/1:a' }],
        ['exercise', { ...references, files: [{ ...file, exercises: [{ kind: 'code', owner: 'fixture', file: 'a.ts' }] }] }],
        ['kind', { ...references, files: [{ ...file, exercises: [{ ...file.exercises[0], kind: 'type' }] }] }],
        ['negative', { ...references, files: [{ ...file, unclassified: -1 }] }],
        ['fraction', { ...references, files: [{ ...file, unclassified: 0.5 }] }],
        ['file', { ...references, files: [{ ...file, file: 1 }] }],
      ] as const) expect(await child(name, ready(testReferences)), name).toEqual(invalid);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 60_000);

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
    // Only this process's children: a built daemon in a parallel test file may run the same entry.
    expect((await rows()).filter(row => row.ppid === process.pid && row.args.includes(entry))).toEqual([]);
    expect(await runner.run({ project, report }, { signal: AbortSignal.abort() })).toEqual({ status: 'cancelled' });
  }, 60_000);
});
