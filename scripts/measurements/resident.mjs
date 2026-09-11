#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { archiveMeasurement } from './archive.mjs';
import { packageRoot, sha256 } from './common.mjs';
import { filesUnder, treeIdentity } from './identities.mjs';
import { measureProcess } from './process-observer.mjs';
import { pendingResidentWorkloads, residentBudgets } from './resident-plan.mjs';
import { residentPrerequisites } from './resident-prerequisites.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('Usage: npm run measure:resident -- [--output FILE]\n'
    + 'Archives real entry probes and missing resident prerequisites. The resident workload driver is incomplete; exit 1 until all I2-29 evidence exists.\n');
  process.exit(0);
}
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--output' && args[1]), 'Expected only --output FILE');
assert.ok(['linux', 'darwin'].includes(platform()), 'Linux or macOS with POSIX ps required');
const parent = join(packageRoot, '.reference-work');
mkdirSync(parent, { recursive: true });
const scratch = mkdtempSync(join(parent, 'resident-measure-'));
const output = resolve(args[1] ?? join(parent, 'reports', `resident-${new Date().toISOString().replaceAll(':', '-')}.json`));
const controller = new AbortController();
const onInterrupt = () => controller.abort();
process.once('SIGINT', onInterrupt); process.once('SIGTERM', onInterrupt);
const scope = 'docs/plans/iteration-2-resident-verification/scope.md';
const report = {
  schemaVersion: 'ramify.resident-measurements/1', measuredAt: new Date().toISOString(),
  command: ['node', 'scripts/measurements/resident.mjs', ...args], passed: false,
  status: 'incomplete', evidenceKind: 'measurement',
  implementation: 'Prerequisite audit and compiled CLI help probe only; resident workload driver pending real providers.',
  environment: { node: process.version, versions: process.versions, platform: platform(), release: release(),
    arch: arch(), logicalCpus: cpus().length, cpuModel: cpus()[0]?.model, totalMemoryBytes: totalmem(),
    concurrentActivity: 'Not isolated from other Studio iterations; these samples do not establish latency acceptance.' },
  dependencies: {}, inputs: { build: null }, prerequisites: [], fixtures: [], entryProbes: [],
  budgets: residentBudgets,
  sampling: { intervalMs: 50, source: 'Shared batch POSIX ps process observer; external to measured children',
    limits: 'Sampled peaks can miss sub-interval peaks; summed RSS counts shared mappings repeatedly. No daemon heap/counter observations are available.' },
  workloads: pendingResidentWorkloads('Resident providers and the real resident workload driver are required.'),
  compilerStateTrigger: { status: 'not-evaluated', reason: 'No source-edit measurement with stage reuse exists.' },
  failures: [],
};

function portable(value) {
  if (typeof value === 'string') return value.replaceAll(scratch, '<measurement-work>').replaceAll(packageRoot, '<package>');
  if (Array.isArray(value)) return value.map(portable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portable(item)]));
  return value;
}
function persist() {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(portable(report), null, 2) + '\n');
}

try {
  report.inputs = { build: treeIdentity(join(packageRoot, 'dist')),
    manifests: ['package.json', 'package-lock.json', scope].map(path => ({ path, sha256: sha256(readFileSync(join(packageRoot, path))) })),
    recipes: filesUnder(join(packageRoot, 'scripts/measurements')).filter(path => /\.(mjs|ts)$/.test(path))
      .map(path => ({ path: relative(packageRoot, path), sha256: sha256(readFileSync(path)) })),
    fixtureGenerator: { path: 'scripts/probes/fixtures/synthetic-owners.ts',
      sha256: sha256(readFileSync(join(packageRoot, 'scripts/probes/fixtures/synthetic-owners.ts'))) } };
  report.dependencies = Object.fromEntries(['typescript', 'tsx'].map(name =>
    [name, JSON.parse(readFileSync(join(packageRoot, 'node_modules', name, 'package.json'), 'utf8')).version]));
  report.prerequisites = residentPrerequisites(packageRoot);
  const missing = report.prerequisites.filter(item => !item.present);
  if (missing.length) report.failures.push(`Missing resident prerequisites: ${missing.map(item => item.requirement).join(', ')}`);
  // Enumerate actual fixture bytes with the existing generator, outside timing.
  // This prepares evidence identities only; no synthetic analysis is claimed.
  const reference = join(packageRoot, 'examples/collection-review');
  report.fixtures.push({ fixture: 'reference', identityKind: 'authored-tree', ...treeIdentity(reference) });
  for (const fixture of ['S100', 'S500', 'S1000']) {
    if (controller.signal.aborted) throw new Error('Interrupted before fixture preparation');
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/measurements/materialize.ts', join(scratch, fixture), fixture],
      { cwd: packageRoot, env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    assert.equal(child.status, 0, child.error?.message ?? child.stderr);
    report.fixtures.push({ ...JSON.parse(child.stdout), measured: false });
  }
  persist();
  const help = { entry: 'CLI help', status: 'running', budgetBytes: null, samples: [],
    note: 'Scope has no numeric help target. This is only one component of I2-29:entry-footprints.' };
  report.entryProbes.push(help);
  for (let index = 0; index < 3; index++) {
    const endpoint = mkdtempSync(join(scratch, 'endpoint-'));
    try {
      const sample = await measureProcess(process.execPath, ['dist/src/cli-entry.js', '--help'],
        { env: { RAMIFY_ENDPOINT_DIR: endpoint }, signal: controller.signal, timeoutMs: 10000 });
      help.samples.push(sample); persist();
      assert.equal(sample.code, 0, sample.stderr);
      assert.equal(sample.failure, null);
      assert.equal(sample.stderr, '');
      assert.match(sample.stdout, /ramify/);
      assert.ok(sample.samples.some(item => item.combinedRssBytes > 0), 'No RSS observation');
      assert.equal(sample.postExitObservedProcesses, 0);
      assert.deepEqual(readdirSync(endpoint), [], 'Help created endpoint state');
    } finally { rmSync(endpoint, { recursive: true, force: true }); }
  }
  help.status = 'measured';
  help.sampledPeakRssBytes = Math.max(...help.samples.map(sample => sample.peakCombinedRssBytes));
  assert.deepEqual(treeIdentity(reference), { files: report.fixtures[0].files, sha256: report.fixtures[0].sha256 }, 'Reference changed');
  assert.deepEqual(treeIdentity(join(packageRoot, 'dist')), report.inputs.build, 'Build changed');
  report.failures.push('The real resident workload driver and all nine complete I2-29 observations remain unimplemented.');
} catch (error) {
  report.failures.push(error.stack ?? String(error));
  for (const entry of report.entryProbes) if (entry.status === 'running') entry.status = 'failed';
} finally {
  report.completedAt = new Date().toISOString();
  report.interrupted = controller.signal.aborted;
  // Cleanup precedes persistence so a failing archive write cannot leak fixtures.
  rmSync(scratch, { recursive: true, force: true });
  process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onInterrupt);
  persist();
  const archived = archiveMeasurement(portable(report), join(packageRoot, 'scripts/measurements/results'),
    'Incomplete iteration 13 prerequisite checkpoint; CLI help observations only, no resident acceptance.');
  process.stdout.write(JSON.stringify({ output, archive: `scripts/measurements/results/${archived.file}`,
    status: report.status, passed: report.passed, failures: portable(report.failures) }, null, 2) + '\n');
}
process.exitCode = 1;
