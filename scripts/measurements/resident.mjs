#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { persistMeasurement } from './archive.mjs';
import { packageRoot, sha256 } from './common.mjs';
import { filesUnder, treeIdentity } from './identities.mjs';
import { measureProcess, processRows } from './process-observer.mjs';
import { pendingResidentWorkloads, residentBudgets, residentWorkloads } from './resident-plan.mjs';
import { residentPrerequisites } from './resident-prerequisites.mjs';
import { residentInputs, residentDependencies } from './resident-inputs.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('Usage: npm run measure:resident -- [--output FILE] [--workload all|I2-29-suffix]\n'
    + 'Runs real installed CLI/daemon workloads, archives raw 50ms observations, and fails missing evidence or binding budgets. Run on an idle host after building.\n');
  process.exit(0);
}
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  assert.ok(['--output', '--workload'].includes(args[index]) && args[index + 1] && !options.has(args[index]), 'Expected --output FILE and/or --workload SUFFIX');
  options.set(args[index], args[index + 1]);
}
const selected = options.get('--workload') ?? 'all';
assert.ok(selected === 'all' || residentWorkloads.some(row => row.id === `I2-29:${selected}`), 'Unknown resident workload');
assert.ok(['linux', 'darwin'].includes(platform()), 'Linux or macOS with POSIX ps required');
const parent = join(packageRoot, '.reference-work'); mkdirSync(parent, { recursive: true });
// POSIX socket names have a strict byte limit, independent of checkout depth.
const scratch = mkdtempSync(join(tmpdir(), 'ramify-rm-'));
const output = resolve(options.get('--output') ?? join(parent, 'reports', `resident-${new Date().toISOString().replaceAll(':', '-')}.json`));
const controller = new AbortController();
const onInterrupt = () => controller.abort();
process.once('SIGINT', onInterrupt); process.once('SIGTERM', onInterrupt);
const scope = 'docs/plans/iteration-2-resident-verification/scope.md';
const report = {
  schemaVersion: 'ramify.resident-measurements/1', measuredAt: new Date().toISOString(),
  command: ['node', 'scripts/measurements/resident.mjs', ...args], passed: false, status: 'incomplete', evidenceKind: 'measurement',
  implementation: 'Installed compiled CLI and real resident service; separate bounded diagnostic daemon entry; actual POSIX process sampling.',
  environment: { node: process.version, versions: process.versions, platform: platform(), release: release(), arch: arch(),
    logicalCpus: cpus().length, cpuModel: cpus()[0]?.model, totalMemoryBytes: totalmem(),
    concurrentActivity: process.env.RAMIFY_MEASUREMENT_ACTIVITY ?? 'No operator annotation; review recorded process census before latency acceptance.',
    processCensus: processRows() },
  dependencies: {}, inputs: { build: null }, prerequisites: [], fixtures: [],
  budgets: residentBudgets,
  sampling: { intervalMs: 50, source: 'External POSIX ps observer follows actual daemon/helper/native and CLI processes',
    settling: 'Two diagnostic GC passes across event-loop turns in the instrumented daemon; no budget or product operation overrides.',
    limits: 'Sampled peaks can miss sub-interval peaks; summed RSS counts shared mappings repeatedly. Worker memory is excluded from workload acceptance peaks.' },
  workloads: pendingResidentWorkloads('Workload has not completed in this invocation.'),
  compilerStateTrigger: { status: 'not-evaluated', reason: 'Source-edit workloads have not both completed.' }, failures: [],
};
const replacements = [[scratch, '<measurement-work>'], [packageRoot, '<package>'], [realpathSync(join(packageRoot, 'node_modules')), '<dependencies>']].sort(([a], [b]) => b.length - a.length);
function portable(value) {
  if (typeof value === 'string') return replacements.reduce((text, [from, to]) => text.replaceAll(from, to), value);
  if (Array.isArray(value)) return value.map(portable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portable(item)]));
  return value;
}
function persist() { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(portable(report), null, 2) + '\n'); }
try {
  report.inputs = residentInputs();
  report.dependencies = residentDependencies();
  report.prerequisites = residentPrerequisites(packageRoot);
  const missing = report.prerequisites.filter(item => !item.present);
  assert.equal(missing.length, 0, `Missing resident prerequisites: ${missing.map(item => item.requirement).join(', ')}`);
  const templates = join(scratch, 'templates'); mkdirSync(templates);
  const reference = join(packageRoot, 'examples/collection-review');
  cpSync(reference, join(templates, 'reference'), { recursive: true, dereference: false,
    filter: path => !relative(reference, path).split('/').some(part => ['node_modules', 'dist', '.reference-work', '.git', '.vite'].includes(part)) });
  report.fixtures.push({ fixture: 'reference', identityKind: 'authored-tree', ...treeIdentity(join(templates, 'reference')) });
  for (const name of ['S100', 'S500', 'S1000']) {
    if (controller.signal.aborted) throw new Error('Interrupted during fixture preparation');
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/measurements/materialize.ts', join(templates, name), name],
      { cwd: packageRoot, env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 });
    assert.equal(child.status, 0, child.error?.message ?? child.stderr); report.fixtures.push(JSON.parse(child.stdout));
  }
  const prefix = join(scratch, 'install');
  const install = spawnSync('npm', ['install', '--prefix', prefix, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', packageRoot],
    { cwd: packageRoot, env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 });
  assert.equal(install.status, 0, install.error?.message ?? install.stderr);
  const executable = join(prefix, 'node_modules/.bin/ramify');
  assert.equal(realpathSync(executable), join(packageRoot, 'dist/src/cli-entry.js'), 'Installed entry must identify this measured build');
  persist();
  for (let index = 0; index < report.workloads.length; index++) {
    const id = report.workloads[index].id, suffix = id.replace('I2-29:', '');
    if (selected !== 'all' && selected !== suffix) continue;
    if (controller.signal.aborted) throw new Error('Resident measurements interrupted');
    const workerOutput = join(scratch, `${suffix}.json`);
    process.stderr.write(`Measuring ${id}\n`);
    const child = await measureProcess(process.execPath, ['scripts/measurements/resident-worker.mjs', suffix, scratch, templates, executable, workerOutput],
      { signal: controller.signal, timeoutMs: 2 * 60 * 60 * 1000, onStderr: bytes => process.stderr.write(bytes) });
    let measured;
    try { measured = JSON.parse(readFileSync(workerOutput, 'utf8')); }
    catch (error) { measured = { ...report.workloads[index], status: 'failed', passed: false, failures: [String(error), child.stderr] }; }
    measured.controllerObservation = { durationMs: child.durationMs, processes: child.processes, samples: child.samples,
      failure: child.failure, code: child.code, signal: child.signal, postExitObservedProcesses: child.postExitObservedProcesses,
      note: 'Controller-inclusive cross-check; acceptance uses the separately classified workload samples.' };
    if (child.failure || child.postExitObservedProcesses || child.signal || ![0, 1].includes(child.code)) {
      measured.passed = false; measured.status = 'failed'; measured.failures ??= [];
      measured.failures.push(child.failure ?? `Worker failed or leaked processes (${child.code}/${child.signal})`);
    }
    report.workloads[index] = measured; persist();
  }
  assert.deepEqual(residentInputs(), report.inputs, 'Source, build, scope, fixture or recipe changed during resident measurement');
  const timed = report.workloads.filter(row => ['I2-29:cold-warm-broad-reference', 'I2-29:cold-warm-broad-hundred'].includes(row.id));
  if (timed.every(row => row.measurements?.medians?.source !== undefined)) {
    const observed = timed.map(row => ({ id: row.id, medianSourceMs: row.measurements.medians.source,
      targetMs: row.id.endsWith('reference') ? residentBudgets.reference.sourceMs : residentBudgets.S100.sourceMs }));
    report.compilerStateTrigger = { status: observed.some(value => value.medianSourceMs > value.targetMs) ? 'triggered' : 'not-triggered', observed,
      reason: 'Measured source-edit latency with retained stage products; missing targets require review or an owner fix, never automatic budget relaxation.' };
  }
  report.passed = report.workloads.every(row => row.passed);
  report.status = report.passed ? 'passed' : report.workloads.some(row => row.status === 'not-executed') ? 'incomplete' : 'failed';
} catch (error) { report.failures.push(error.stack ?? String(error)); }
finally {
  report.completedAt = new Date().toISOString(); report.interrupted = controller.signal.aborted;
  if (report.failures.length || report.interrupted) { report.passed = false; report.status = 'incomplete'; }
  rmSync(scratch, { recursive: true, force: true });
  process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onInterrupt);
  const saved = persistMeasurement(portable(report), output, join(packageRoot, 'scripts/measurements/results'),
    'Real resident workload observations; fixed iteration-1 budgets, missing and failing evidence retained.');
  process.stdout.write(JSON.stringify({ output: saved.rawWritten ? output : null,
    archive: saved.archive ? `scripts/measurements/results/${saved.archive.file}` : null, status: saved.report.status,
    passed: saved.report.passed, failures: saved.report.failures,
    workloads: saved.report.workloads.map(row => ({ id: row.id, status: row.status, passed: row.passed,
      failedAssertions: row.assertions?.filter(assertion => !assertion.passed).map(assertion => assertion.name) })) }, null, 2) + '\n');
  process.exitCode = saved.report.passed ? 0 : 1;
}
