// Lean dependency analyzer measurement (Plan 6D BD18).
//
// For each run, a full batch with `dependency-behavior` runs in the built batch
// entry, and the lean analyzer then runs in the built analyzer entry over that
// report with its behavior facts removed, as a published report carries them.
// Both are separate Node processes observed from outside: wall time and peak
// resident memory of the process, its configuration and compiler helpers and
// their native compilers (the largest of each role). The analyzer's own phase timings, its result size and equality
// with the batch report's projected diagram are recorded beside them.
//
//     npm run build
//     npx tsx scripts/probes/dependency-analyzer/measure.ts [--root <dir>] [--runs <n>]
//       [--out <dir>] [--name <basename>] [--allow-dirty]

import { execFile, spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, platform, release, totalmem } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import type { AnalysisReport, Capability, DependencyAnalyzerOutcome, DependencyDiagramFacts } from 'ramify.ts/analysis';
import { repositoryState } from '../modularity/git-history.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const batchEntry = join(packageRoot, 'dist/src/batch-entry.js');
const analyzerEntry = join(packageRoot, 'dist/src/dependency-analyzer-entry.js');
/** The CLI check capabilities; the full batch adds `dependency-behavior`. */
const checkCapabilities: readonly Capability[] = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
  'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'];
const sampleIntervalMs = 25;

class Refusal extends Error {}

interface ProcessPeak { readonly pid: number;
  readonly role: 'process' | 'configuration-helper' | 'compiler-helper' | 'native-compiler'; readonly peakRssBytes: number }
interface Observation {
  readonly wallMs: number;
  readonly exitCode: number | null;
  readonly stdout: Buffer;
  readonly stderr: string;
  readonly peakCombinedRssBytes: number;
  readonly processes: readonly ProcessPeak[];
  readonly samples: number;
}

async function table(): Promise<{ pid: number; ppid: number; rss: number; args: string }[]> {
  const { stdout } = await promisify(execFile)('ps', ['-eo', 'pid=,ppid=,rss=,args='], { maxBuffer: 16 * 1024 ** 2 });
  return stdout.split('\n').flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), rss: Number(match[3]) * 1024, args: match[4]! }] : [];
  });
}

/** Run one Node entry and sample the resident memory of it and every descendant until it exits. */
async function observe(args: readonly string[], input?: string): Promise<Observation> {
  const started = performance.now();
  const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '' } });
  const out: Buffer[] = [], err: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
  child.stdin.on('error', () => {});
  child.stdin.end(input ?? '');
  const peaks = new Map<number, ProcessPeak>();
  let peakCombined = 0, samples = 0, closed = false;
  const exit = new Promise<number | null>(done => child.once('close', code => { closed = true; done(code); }));
  const sampling = (async () => {
    while (!closed) {
      const rows = await table();
      const members = new Set([child.pid!]);
      for (let grew = true; grew;) {
        grew = false;
        for (const row of rows) if (members.has(row.ppid) && !members.has(row.pid)) { members.add(row.pid); grew = true; }
      }
      let combined = 0;
      for (const row of rows.filter(item => members.has(item.pid))) {
        combined += row.rss;
        // Roles follow the process tree: a helper's command line can be unreadable while it starts or exits.
        const role = peaks.get(row.pid)?.role ?? (row.pid === child.pid ? 'process' : row.ppid !== child.pid ? 'native-compiler'
          : row.args.includes('configuration-helper.') ? 'configuration-helper' : 'compiler-helper');
        peaks.set(row.pid, { pid: row.pid, role, peakRssBytes: Math.max(row.rss, peaks.get(row.pid)?.peakRssBytes ?? 0) });
      }
      peakCombined = Math.max(peakCombined, combined);
      samples++;
      await new Promise(done => setTimeout(done, sampleIntervalMs));
    }
  })();
  const exitCode = await exit;
  const wallMs = performance.now() - started;
  await sampling;
  return { wallMs, exitCode, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString('utf8').slice(-4096),
    peakCombinedRssBytes: peakCombined, processes: [...peaks.values()], samples };
}

const rolePeak = (observation: Observation, role: ProcessPeak['role']): number =>
  Math.max(0, ...observation.processes.filter(item => item.role === role).map(item => item.peakRssBytes));
const summary = (observation: Observation) => ({
  wallMs: Math.round(observation.wallMs), peakCombinedRssBytes: observation.peakCombinedRssBytes,
  peakRssBytes: { process: rolePeak(observation, 'process'), configurationHelper: rolePeak(observation, 'configuration-helper'),
    compilerHelper: rolePeak(observation, 'compiler-helper'), nativeCompiler: rolePeak(observation, 'native-compiler') },
  processes: observation.processes.length, samples: observation.samples,
});
const median = (values: readonly number[]): number => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : Math.round((ordered[middle - 1]! + ordered[middle]!) / 2);
};

/** The report as a published revision carries it: no behavior facts and no behavior request. */
function published(report: AnalysisReport): AnalysisReport {
  const { dependencyBehavior: _facts, ...snapshot } = report.snapshot!;
  return { ...report, snapshot, request: { ...report.request, capabilities: report.request.capabilities.filter(item => item !== 'dependency-behavior') },
    capabilities: report.capabilities.filter(item => item.capability !== 'dependency-behavior') };
}

type Projection = typeof import('ramify.ts/analysis')['projectDependencyDiagram'];
interface RunRecord {
  readonly run: number;
  readonly batch: ReturnType<typeof summary> & { readonly reportBytes: number };
  readonly analyzer: ReturnType<typeof summary> & { readonly requestBytes: number; readonly responseBytes: number;
    readonly diagramBytes: number; readonly behaviorRuns: number; readonly timings: Record<string, number> };
  readonly equalsBatchDiagram: boolean;
}

/** One full batch with `dependency-behavior`, then the analyzer over its published report. */
async function measureRun(root: string, run: number, project: Projection): Promise<{ readonly record: RunRecord;
  readonly diagram: DependencyDiagramFacts; readonly inputId: string }> {
  const batch = await observe([batchEntry, JSON.stringify({ cwd: root, root, capabilities: [...checkCapabilities, 'dependency-behavior'] })]);
  if (batch.exitCode === 2) throw new Refusal(`Batch run ${run} failed: ${batch.stderr}`);
  const report = (JSON.parse(batch.stdout.toString('utf8')) as { report: AnalysisReport }).report;
  if (report.outcome.execution !== 'completed' || !report.inputId) throw new Refusal(`Batch run ${run} did not complete: ${JSON.stringify(report.outcome)}`);
  const expected = project({ revision: report.inputId, report, limits: { maxResultBytes: 16 * 1024 ** 2 } });
  if (expected.status !== 'projected') throw new Refusal(`The batch diagram was refused: ${JSON.stringify(expected)}`);

  const request = JSON.stringify({ project: report.request.project, report: published(report) });
  const analyzer = await observe([analyzerEntry], request);
  if (analyzer.exitCode !== 0) throw new Refusal(`Analyzer run ${run} exited ${analyzer.exitCode}: ${analyzer.stderr}`);
  const outcome = JSON.parse(analyzer.stdout.toString('utf8')) as DependencyAnalyzerOutcome;
  if (outcome.status !== 'ready') throw new Refusal(`Analyzer run ${run} was ${JSON.stringify(outcome)}`);
  const diagramJson = JSON.stringify(outcome.diagram);
  const record: RunRecord = {
    run,
    batch: { ...summary(batch), reportBytes: batch.stdout.length },
    analyzer: { ...summary(analyzer), requestBytes: Buffer.byteLength(request), responseBytes: analyzer.stdout.length,
      diagramBytes: Buffer.byteLength(diagramJson), behaviorRuns: outcome.behaviorRuns,
      timings: Object.fromEntries(Object.entries(outcome.timings).map(([key, value]) => [key, Math.round(value)])) },
    equalsBatchDiagram: diagramJson === JSON.stringify(expected.diagram),
  };
  if (!record.equalsBatchDiagram) throw new Refusal(`Analyzer run ${run} differs from the batch diagram`);
  return { record, diagram: outcome.diagram, inputId: report.inputId };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ strict: true, options: {
    root: { type: 'string', default: packageRoot },
    runs: { type: 'string', default: '5' },
    out: { type: 'string', default: resolve(packageRoot, 'scripts/probes/results/dependency-analyzer') },
    name: { type: 'string' },
    'allow-dirty': { type: 'boolean', default: false },
  } });
  const root = resolve(values.root);
  const runs = Number(values.runs);
  if (!Number.isSafeInteger(runs) || runs < 1) throw new Refusal('--runs needs a positive integer');
  const name = values.name ?? (root === packageRoot ? 'toolkit' : basename(root));
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Refusal(`--name must be a plain file basename: ${name}`);
  for (const entry of [batchEntry, analyzerEntry]) await access(entry).catch(() => { throw new Refusal(`Missing ${entry}; run npm run build`); });
  const out = resolve(values.out);
  // Results this probe writes do not make the measured source revision dirty.
  const outputPrefix = `${relative(packageRoot, out)}/`;
  const state = () => {
    const current = repositoryState(packageRoot);
    const changes = current.changes.filter(line => !line.slice(3).startsWith(outputPrefix));
    return { commit: current.commit, clean: changes.length === 0, changes };
  };
  const before = state();
  if (!before.clean && !values['allow-dirty']) {
    throw new Refusal(`The worktree is not clean (${before.changes.length} changes); commit first or pass --allow-dirty`);
  }
  const { projectDependencyDiagram } = await import('ramify.ts/analysis');

  const records: RunRecord[] = [];
  let lastDiagram: DependencyDiagramFacts | undefined;
  let inputId: string | null = null;
  for (let run = 1; run <= runs; run++) {
    const measured = await measureRun(root, run, projectDependencyDiagram);
    if (inputId !== null && measured.inputId !== inputId) throw new Refusal(`The input changed between runs: ${inputId} → ${measured.inputId}`);
    inputId = measured.inputId;
    records.push(measured.record);
    lastDiagram = measured.diagram;
    console.error(`run ${run}: batch ${measured.record.batch.wallMs} ms, analyzer ${measured.record.analyzer.wallMs} ms`);
  }

  const after = state();
  if (after.commit !== before.commit || after.clean !== before.clean) throw new Refusal('The repository changed during the measurement');
  // An iteration 2 baseline over the same input identity is an independent equality target.
  const baselines = [];
  for (const file of ['plan6d-toolkit.json', 'plan6d-reference.json']) {
    const document = JSON.parse(await readFile(resolve(packageRoot, 'scripts/probes/results/modularity', file), 'utf8')) as
      { declared: { modularity: { views: { dependencyDiagram: { value?: DependencyDiagramFacts; observed?: DependencyDiagramFacts } }[] } } };
    const metric = document.declared.modularity.views[0]!.dependencyDiagram;
    const diagram = metric.value ?? metric.observed;
    if (diagram?.inputId === inputId) baselines.push({ artifact: `scripts/probes/results/modularity/${file}`, equal: JSON.stringify(diagram) === JSON.stringify(lastDiagram) });
  }
  const pick = (select: (record: RunRecord) => number) => median(records.map(select));
  const document = {
    schemaVersion: 'ramify.dependency-analyzer-measurement/1',
    repository: { commit: before.commit, clean: before.clean },
    project: relative(packageRoot, root) || '.',
    inputId,
    environment: { node: process.version, platform: platform(), release: release(), cpu: cpus()[0]?.model ?? null,
      parallelism: availableParallelism(), totalMemoryBytes: totalmem(), sampleIntervalMs },
    headline: lastDiagram!.headline, coverage: lastDiagram!.coverage, boundaries: lastDiagram!.boundaries.length, modules: lastDiagram!.modules.length,
    baselineEquality: baselines,
    median: {
      batch: { wallMs: pick(record => record.batch.wallMs), peakCombinedRssBytes: pick(record => record.batch.peakCombinedRssBytes),
        peakProcessRssBytes: pick(record => record.batch.peakRssBytes.process), peakHelperRssBytes: pick(record => record.batch.peakRssBytes.compilerHelper),
        peakNativeRssBytes: pick(record => record.batch.peakRssBytes.nativeCompiler) },
      analyzer: { wallMs: pick(record => record.analyzer.wallMs), peakCombinedRssBytes: pick(record => record.analyzer.peakCombinedRssBytes),
        peakProcessRssBytes: pick(record => record.analyzer.peakRssBytes.process), peakHelperRssBytes: pick(record => record.analyzer.peakRssBytes.compilerHelper),
        peakNativeRssBytes: pick(record => record.analyzer.peakRssBytes.nativeCompiler),
        acquireMs: pick(record => record.analyzer.timings.acquireMs!), classifyMs: pick(record => record.analyzer.timings.classifyMs!),
        projectMs: pick(record => record.analyzer.timings.projectMs!), totalMs: pick(record => record.analyzer.timings.totalMs!) },
    },
    runs: records,
  };
  await mkdir(out, { recursive: true });
  await writeFile(join(out, `${name}.json`), `${JSON.stringify(document, null, 1)}\n`);
  console.log(JSON.stringify({ written: relative(process.cwd(), join(out, `${name}.json`)), inputId, median: document.median,
    headline: document.headline, baselineEquality: baselines }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Refusal ? `Refused: ${error.message}` : error);
  process.exitCode = error instanceof Refusal ? 2 : 1;
});
