#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { persistMeasurement } from './archive.mjs';
import { readJsonSync, writeJsonSync } from './json-stream.mjs';
import { packageRoot } from './common.mjs';
import { treeIdentity } from './identities.mjs';
import { measureProcess, processRows } from './process-observer.mjs';
import { fastInputs, fastDependencies } from './fast-inputs.mjs';
import { fastBudgets, fastWorkloads, fastFixtures } from './fast-plan.mjs';
import { assertFastWorkload, deriveFastMeasurements, fastDeferrals } from './fast-assertions.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('Usage: npm run measure:fast -- [--output FILE] [--workload all|I5-13-suffix]\n'
    + 'Twenty edits per class on four fixtures, 200-cycle plateaus, contexts and footprints.\n'
    + 'Every timing and memory target is an ideal optimization budget: a miss is recorded with its target, enforcement \'ideal\' and targetMet false, and never fails a workload.\n'
    + 'Correctness predicates, runtime limits and missing evidence fail. Partial runs retain missing rows and exit 1.\n');
  process.exit(0);
}
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  assert.ok(['--output', '--workload'].includes(args[index]) && args[index + 1] && !options.has(args[index]), 'Expected --output FILE and/or --workload SUFFIX');
  options.set(args[index], args[index + 1]);
}
const selected = options.get('--workload') ?? 'all';
assert.ok(selected === 'all' || fastWorkloads.some(row => row.id === `I5-13:${selected}`), 'Unknown fast workload');
assert.ok(['linux', 'darwin'].includes(platform()), 'Linux/macOS and POSIX ps required');
const parent = join(packageRoot, '.reference-work'); mkdirSync(parent, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'ramify-fm-'));
const output = resolve(options.get('--output') ?? join(parent, 'reports', `fast-${new Date().toISOString().replaceAll(':', '-')}.json`));
const controller = new AbortController(), interrupt = () => controller.abort();
process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
const report = {
  schemaVersion: 'ramify.fast-measurements/1', measuredAt: new Date().toISOString(), evidenceKind: 'measurement',
  command: ['node', 'scripts/measurements/fast.mjs', ...args], passed: false, status: 'incomplete',
  environment: { node: process.version, versions: process.versions, platform: platform(), release: release(), arch: arch(),
    logicalCpus: cpus().length, cpuModel: cpus()[0]?.model, totalMemoryBytes: totalmem(),
    concurrentActivity: process.env.RAMIFY_MEASUREMENT_ACTIVITY ?? 'Unspecified; inspect process census before performance acceptance.',
    processCensus: processRows() },
  dependencies: {}, inputs: { build: null }, fixtures: [], budgets: fastBudgets,
  performancePolicy: 'Every timing and memory target is an ideal optimization budget, recorded and never enforced; correctness, runtime limits and completeness enforced.',
  sampling: { intervalMs: 50,
    source: 'External POSIX process tree sampler plus daemonStatus over the real socket every 50 ms.',
    settling: 'Two GC passes in daemon outside timed operation; worker heaps are latest actual reply checkpoints, not forced-GC samples.',
    limits: 'Peaks shorter than polling intervals can be missed. Each process RSS counted once; shared mappings may be counted by multiple processes. Includes the existing worker supervisor and compiler child. Timing includes measurement overhead.' },
  workloads: fastWorkloads.map(row => ({ ...row, status: 'not-executed', passed: false, measurements: null,
    reason: 'This invocation has not measured this workload.' })), failures: [], interrupted: false,
};
const replacements = [[scratch, '<measurement-work>'], [packageRoot, '<package>'], [realpathSync(join(packageRoot, 'node_modules')), '<dependencies>']].sort(([a], [b]) => b.length - a.length);
function portableString(value) {
  return replacements.reduce((text, [from, to]) => text.replaceAll(from, to), value);
}
function persist() {
  mkdirSync(dirname(output), { recursive: true });
  writeJsonSync(output, report, { indent: 0, transformString: portableString });
}
try {
  report.inputs = fastInputs(); report.dependencies = fastDependencies();
  const templates = join(scratch, 'templates'); mkdirSync(templates);
  const reference = join(packageRoot, 'examples/collection-review');
  cpSync(reference, join(templates, 'reference'), { recursive: true, dereference: false,
    filter: path => !relative(reference, path).split('/').some(part => ['node_modules', 'dist', '.reference-work', '.git', '.vite'].includes(part)) });
  report.fixtures.push({ fixture: 'reference', identityKind: 'authored-tree', ...treeIdentity(join(templates, 'reference')) });
  for (const name of fastFixtures.slice(1)) {
    if (controller.signal.aborted) throw new Error('Interrupted preparing fixtures');
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/measurements/materialize.ts', join(templates, name), name],
      { cwd: packageRoot, env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 });
    assert.equal(child.status, 0, child.error?.message ?? child.stderr); report.fixtures.push(JSON.parse(child.stdout));
  }
  const prefix = join(scratch, 'install');
  const install = spawnSync('npm', ['install', '--prefix', prefix, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', packageRoot],
    { cwd: packageRoot, env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 });
  assert.equal(install.status, 0, install.error?.message ?? install.stderr);
  const executable = join(prefix, 'node_modules/.bin/ramify');
  assert.equal(realpathSync(executable), join(packageRoot, 'dist/src/cli-entry.js'));
  persist();
  const derivedSelected = ['checked-set-bounded', 'cold-open'].includes(selected);
  for (let index = 0; index < report.workloads.length; index++) {
    const id = report.workloads[index].id, suffix = id.replace('I5-13:', '');
    if (['checked-set-bounded', 'cold-open'].includes(suffix)) continue;
    if (selected !== 'all' && selected !== suffix && !(derivedSelected && suffix.startsWith('hook-latency-'))) continue;
    if (controller.signal.aborted) throw new Error('Fast measurements interrupted');
    // Workload roots/endpoints are disjoint, and each child drains and stops its own daemons.
    const work = join(scratch, suffix); mkdirSync(work);
    const workerOutput = join(scratch, `${suffix}.json`);
    process.stderr.write(`Measuring ${id}\n`);
    const child = await measureProcess(process.execPath, ['scripts/measurements/fast-worker.mjs', id, work, templates, executable, workerOutput],
      { signal: controller.signal, timeoutMs: 2 * 60 * 60 * 1000, onStderr: bytes => process.stderr.write(bytes) });
    let measured;
    try { measured = readJsonSync(workerOutput); }
    catch (error) { measured = { id, status: 'failed', passed: false, measurements: {}, failures: [String(error), child.stderr] }; }
    measured.controllerObservation = { durationMs: child.durationMs, processes: child.processes, samples: child.samples,
      failure: child.failure, code: child.code, signal: child.signal, postExitObservedProcesses: child.postExitObservedProcesses,
      note: 'Controller-inclusive cross-check. Workload process samples exclude the external controller.' };
    if (child.failure || child.postExitObservedProcesses || child.signal || ![0, 1].includes(child.code)) {
      measured.status = 'failed'; measured.passed = false; measured.failures ??= [];
      measured.failures.push(child.failure ?? `Worker failed or leaked (${child.code}/${child.signal})`);
    }
    report.workloads[index] = measured; persist();
  }
  for (const id of ['I5-13:checked-set-bounded', 'I5-13:cold-open']) {
    const sources = report.workloads.filter(row => row.id.startsWith('I5-13:hook-latency-'));
    if (sources.every(row => row.status !== 'not-executed')) {
      const measurements = deriveFastMeasurements(id, report.workloads), assertions = assertFastWorkload(id, measurements);
      const complete = sources.every(row => row.controllerObservation && !row.failures.length && !row.interrupted);
      const observations = sources.map(row => row.controllerObservation).filter(Boolean);
      report.workloads[report.workloads.findIndex(row => row.id === id)] = { id,
        sourceWorkloadIds: sources.map(row => row.id), startedAt: sources[0].startedAt,
        completedAt: new Date().toISOString(), status: complete ? 'measured' : 'failed',
        passed: complete && assertions.every(row => row.passed), measurements, assertions,
        failures: complete ? [] : ['One or more source process workloads failed to collect complete evidence.'], interrupted: false,
        controllerObservation: { durationMs: observations.reduce((sum, row) => sum + row.durationMs, 0),
          processes: observations.flatMap(row => row.processes), samples: observations.flatMap(row => row.samples),
          failure: observations.find(row => row.failure)?.failure ?? null, code: complete ? 0 : 1, signal: null,
          postExitObservedProcesses: observations.reduce((sum, row) => sum + row.postExitObservedProcesses, 0),
          note: 'Same measured process observations as the four named source workloads; no additional run claimed.' } };
    }
  }
  report.deferrals = fastDeferrals(report.workloads);
  assert.deepEqual(fastInputs(), report.inputs, 'Build, source, fixture, scope or recipe changed during measurement');
  report.passed = report.workloads.every(row => row.passed)
    && Object.values(report.deferrals).every(row => row.status !== 'not-evaluated');
  report.status = report.passed ? 'passed' : report.workloads.some(row => row.status === 'not-executed') ? 'incomplete' : 'failed';
} catch (error) { report.failures.push(error.stack ?? String(error)); }
finally {
  report.completedAt = new Date().toISOString(); report.interrupted = controller.signal.aborted;
  report.deferrals ??= fastDeferrals(report.workloads);
  if (report.failures.length || report.interrupted) { report.passed = false; report.status = 'incomplete'; }
  rmSync(scratch, { recursive: true, force: true });
  process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  const saved = persistMeasurement(report, output, join(packageRoot, 'scripts/measurements/results'),
    'Plan 5 actual process measurements; timing and memory targets are ideal budgets, never enforced. Missing and failed evidence retained.',
    { transformString: portableString });
  process.stdout.write(JSON.stringify({ output: saved.rawWritten ? output : null, archive: saved.archive?.file ?? null,
    status: saved.report.status, passed: saved.report.passed, failures: saved.report.failures,
    workloads: saved.report.workloads.map(row => ({ id: row.id, status: row.status, passed: row.passed,
      failures: row.failures, failedAssertions: row.assertions?.filter(assertion => !assertion.passed).map(assertion => assertion.name),
      idealMisses: row.assertions?.filter(assertion => assertion.enforcement === 'ideal' && !assertion.targetMet).map(assertion => assertion.name) })) }, null, 2) + '\n');
  process.exitCode = saved.report.passed ? 0 : 1;
}
