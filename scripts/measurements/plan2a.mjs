#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { persistMeasurement } from './archive.mjs';
import { installedCommand, packageRoot } from './common.mjs';
import { writeJsonSync } from './json-stream.mjs';
import { plan2aDependencies, plan2aInputs } from './plan2a-inputs.mjs';
import { isolatedProject, materializeMetrics, parseMaterializeSummary, pollDaemonStatus, runCommand } from './plan2a-fixtures.mjs';
import { materializeSynthetic } from './materialize.ts';

/**
 * Plan 2A (`ramify materialize`) scale and resource evidence (I2A-12), on
 * the installed CLI and the real production daemon. Follows `resident.mjs`/
 * `fast.mjs`'s own conventions: one owned scratch directory, one owned
 * `RAMIFY_ENDPOINT_DIR` per workload, an archived raw report with a lossless
 * gzip record, and explicit daemon shutdown in `finally`. Run one workload at
 * a time on an otherwise idle host.
 *
 * Policy (coordinator, carried from Plan 5's 2026-09-11 measurement decision):
 * R, T and S100 are complete; S1000 is a sanity/smoke run whose actual
 * observed outcome (success or an explicit predecessor resource refusal) is
 * recorded, never forced; S500 is not required and is excluded from the
 * default `all` workload set (`--workload synthetic-500` opts in explicitly).
 */

const knownWorkloads = ['reference', 'toolkit', 'synthetic-100', 'synthetic-500', 'synthetic-1000', 'repeat-plateau'];
const defaultWorkloads = ['reference', 'toolkit', 'synthetic-100', 'synthetic-1000', 'repeat-plateau'];

const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write('Usage: node scripts/measurements/plan2a.mjs [--output FILE] [--workload all|' + knownWorkloads.join('|') + ']\n'
    + 'Runs real installed `ramify materialize` workloads against the reference, toolkit and synthetic fixtures, archives raw metrics, and never fails a timing miss (ideal budget); missing evidence, incomplete workloads and leaked processes still fail. `synthetic-500` is excluded from the default `all` set by measurement policy.\n');
  process.exit(0);
}
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  assert.ok(['--output', '--workload'].includes(args[index]) && args[index + 1] && !options.has(args[index]), 'Expected --output FILE and/or --workload NAME');
  options.set(args[index], args[index + 1]);
}
const selected = options.get('--workload') ?? 'all';
assert.ok(selected === 'all' || knownWorkloads.includes(selected), `Unknown plan2a workload: ${selected}`);
assert.ok(['linux', 'darwin'].includes(platform()), 'Linux or macOS required');

const parent = join(packageRoot, '.reference-work'); await mkdir(parent, { recursive: true });
const scratch = await realpath(await mkdtemp(join(parent, 'plan2a-measure-')));
const output = resolve(options.get('--output') ?? join(parent, 'reports', `plan2a-${new Date().toISOString().replaceAll(':', '-')}.json`));
const controller = new AbortController();
const onInterrupt = () => controller.abort();
process.once('SIGINT', onInterrupt); process.once('SIGTERM', onInterrupt);

const report = {
  schemaVersion: 'ramify.plan2a-measurements/1', phase: 'plan2a', measuredAt: new Date().toISOString(),
  command: ['node', 'scripts/measurements/plan2a.mjs', ...args], passed: false, status: 'incomplete', evidenceKind: 'measurement',
  implementation: 'Installed `ramify materialize` and `ramify daemon status` against the real production daemon; a real synthetic-fixture generator; direct filesystem inspection of generated `.ramify` output.',
  client: null,
  environment: { node: process.version, versions: process.versions, platform: platform(), release: release(), arch: arch(),
    logicalCpus: cpus().length, cpuModel: cpus()[0]?.model, totalMemoryBytes: totalmem(),
    concurrentActivity: process.env.RAMIFY_MEASUREMENT_ACTIVITY ?? 'No operator annotation; review recorded process census before latency acceptance.' },
  inputs: null, dependencies: {},
  sampling: { intervalMs: 100, source: '`ramify daemon status --format json` polled while materialize runs; peak is the maximum sampled value, not an instrumented trace',
    limits: 'Sampled peaks can miss sub-interval spikes. Combined RSS/heap sums the daemon host process with its open context\'s worker thread and native compiler child, none of which appear in the host\'s own process.memoryUsage() alone.' },
  measurementPolicy: { reference: 'complete', toolkit: 'complete', 'synthetic-100': 'complete',
    'synthetic-500': 'Not required by the carried-forward Plan 5 2026-09-11 measurement policy decision (advisory performance targets; S500 explicitly waived). Excluded from the default workload set; run explicitly with --workload synthetic-500 if ever needed. No S500 metric in this report is inferred or estimated.',
    'synthetic-1000': 'sanity/smoke only: the actual observed outcome (success or an explicit predecessor resource refusal) is recorded, never forced or retried to force success',
    'repeat-plateau': 'complete' },
  workloads: knownWorkloads.map(name => ({ id: `I2A-12:${name === 'reference' ? 'reference-scale' : name === 'toolkit' ? 'toolkit-scale' : name}`,
    name, status: 'not-executed', passed: false })),
  failures: [],
};

function workloadIndex(name) { return report.workloads.findIndex(row => row.name === name); }
async function persist() { await mkdir(dirname(output), { recursive: true }); writeJsonSync(output, report, { indent: 0 }); }

async function measureMaterialize(executable, root, { warmups = 1 } = {}) {
  const owned = await realpath(await mkdtemp(join('/tmp', 'rm2a-')));
  const endpoint = join(owned, 'endpoint');
  await mkdir(endpoint, { mode: 0o700 });
  const env = { RAMIFY_ENDPOINT_DIR: endpoint };
  try {
    const poll = pollDaemonStatus(executable, env, root);
    const started = performance.now();
    const cold = await runCommand(executable, ['materialize', '--all'], { cwd: root, env, timeoutMs: 480000 });
    const coldMs = performance.now() - started;
    let warm = null, warmMs = null;
    if (cold.code === 0 && warmups > 0) {
      const warmStarted = performance.now();
      warm = await runCommand(executable, ['materialize', '--all'], { cwd: root, env, timeoutMs: 480000 });
      warmMs = performance.now() - warmStarted;
    }
    const memory = poll.stop();
    const metrics = cold.code === 0 ? await materializeMetrics(root) : null;
    const stop = await runCommand(executable, ['daemon', 'stop', '--format', 'json'], { cwd: root, env, timeoutMs: 10000 });
    return {
      cold: { code: cold.code, failure: cold.failure, durationMs: coldMs, stdout: cold.stdout, stderr: cold.stderr.slice(0, 4000),
        summary: cold.code === 0 ? parseMaterializeSummary(cold.stdout) : null },
      warm: warm ? { code: warm.code, failure: warm.failure, durationMs: warmMs, stdout: warm.stdout,
        summary: warm.code === 0 ? parseMaterializeSummary(warm.stdout) : null } : null,
      memory, metrics, daemonStopped: stop.code === 0,
    };
  } finally { await rm(owned, { recursive: true, force: true }); }
}

async function runScaleWorkload(executable, name, root, dispose) {
  const index = workloadIndex(name);
  const startedAt = new Date().toISOString();
  process.stderr.write(`Measuring ${report.workloads[index].id}\n`);
  try {
    const measurement = await measureMaterialize(executable, root);
    const passed = [0, 2].includes(measurement.cold.code) && measurement.daemonStopped;
    report.workloads[index] = { ...report.workloads[index], status: 'measured', passed,
      startedAt, completedAt: new Date().toISOString(), measurements: measurement,
      failures: passed ? [] : [`Unexpected exit code ${measurement.cold.code} or daemon did not stop cleanly`] };
  } catch (error) {
    report.workloads[index] = { ...report.workloads[index], status: 'failed', passed: false,
      startedAt, completedAt: new Date().toISOString(), failures: [error.stack ?? String(error)] };
  } finally { await dispose(); await persist(); }
}

async function runRepeatPlateau(executable) {
  const index = workloadIndex('repeat-plateau');
  const startedAt = new Date().toISOString();
  process.stderr.write(`Measuring ${report.workloads[index].id}\n`);
  const cycles = 8;
  const byFixture = {};
  try {
    for (const [label, prepare] of [
      ['reference', async () => isolatedProject('R', scratch)],
      ['S100', async () => { const root = join(scratch, 'repeat-s100'); await materializeSynthetic(root, 'S100'); return { root, dispose: () => rm(root, { recursive: true, force: true }) }; }],
    ]) {
      const project = await prepare();
      const owned = await realpath(await mkdtemp(join('/tmp', 'rm2a-')));
      const endpoint = join(owned, 'endpoint'); await mkdir(endpoint, { mode: 0o700 });
      const env = { RAMIFY_ENDPOINT_DIR: endpoint };
      const cyclesRecorded = [];
      try {
        const poll = pollDaemonStatus(executable, env, project.root);
        for (let cycle = 0; cycle < cycles; cycle++) {
          const result = await runCommand(executable, ['materialize', '--all'], { cwd: project.root, env, timeoutMs: 120000 });
          const before = await readdir(project.root, { recursive: true }).catch(() => []);
          const staleSiblings = before.filter(p => /\.ramify\.(tmp|old)-/.test(p.toString())).length;
          cyclesRecorded.push({ cycle, code: result.code, summary: result.code === 0 ? parseMaterializeSummary(result.stdout) : null, staleSiblings });
        }
        const memory = poll.stop();
        await runCommand(executable, ['daemon', 'stop', '--format', 'json'], { cwd: project.root, env, timeoutMs: 10000 });
        byFixture[label] = { cycles: cyclesRecorded, memory };
      } finally { await rm(owned, { recursive: true, force: true }); await project.dispose(); }
    }
    const settled = Object.values(byFixture).every(fixture =>
      fixture.cycles.slice(1).every(cycle => cycle.code === 0 && cycle.summary?.bytesWritten === 0 && cycle.staleSiblings === 0));
    report.workloads[index] = { ...report.workloads[index], status: 'measured', passed: settled,
      startedAt, completedAt: new Date().toISOString(), measurements: byFixture, cycles,
      failures: settled ? [] : ['A repeat cycle after the first wrote bytes or left a stale stage/rollback sibling'] };
  } catch (error) {
    report.workloads[index] = { ...report.workloads[index], status: 'failed', passed: false,
      startedAt, completedAt: new Date().toISOString(), failures: [error.stack ?? String(error)] };
  } finally { await persist(); }
}

try {
  report.inputs = plan2aInputs();
  report.dependencies = plan2aDependencies();
  const install = await runCommand('npm', ['install', '--prefix', join(scratch, 'client-install'), '--offline', '--ignore-scripts', '--no-audit', '--no-fund', packageRoot], { timeoutMs: 60000 });
  assert.equal(install.code, 0, install.stderr);
  const { client, executable } = installedCommand(join(scratch, 'client-install'));
  report.client = client;
  await persist();

  const requested = selected === 'all' ? defaultWorkloads : [selected];
  for (const name of requested) {
    if (controller.signal.aborted) throw new Error('Plan 2A measurements interrupted');
    if (name === 'reference') { const project = await isolatedProject('R', scratch); await runScaleWorkload(executable, 'reference', project.root, project.dispose); }
    else if (name === 'toolkit') { const project = await isolatedProject('T', scratch); await runScaleWorkload(executable, 'toolkit', project.root, project.dispose); }
    else if (name === 'synthetic-100' || name === 'synthetic-500' || name === 'synthetic-1000') {
      const size = name.slice('synthetic-'.length);
      const fixture = `S${size}`;
      const root = join(scratch, name);
      await materializeSynthetic(root, fixture);
      await runScaleWorkload(executable, name, root, () => rm(root, { recursive: true, force: true }));
    } else if (name === 'repeat-plateau') await runRepeatPlateau(executable);
  }
  report.passed = report.workloads.every(row => row.name === 'synthetic-500' && row.status === 'not-executed' ? true : row.status === 'measured' && row.passed);
  report.status = report.passed ? 'passed' : report.workloads.some(row => row.status === 'not-executed' && row.name !== 'synthetic-500') ? 'incomplete' : 'failed';
} catch (error) { report.failures.push(error.stack ?? String(error)); }
finally {
  report.completedAt = new Date().toISOString(); report.interrupted = controller.signal.aborted;
  if (report.failures.length || report.interrupted) { report.passed = false; report.status = 'incomplete'; }
  await rm(scratch, { recursive: true, force: true });
  process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onInterrupt);
  const saved = persistMeasurement(report, output, join(packageRoot, 'scripts/measurements/results'),
    'Real ramify materialize scale/resource observations (Plan 2A I2A-12); performance is an ideal budget, correctness and cleanup remain binding.');
  process.stdout.write(JSON.stringify({ output: saved.rawWritten ? output : null,
    archive: saved.archive ? `scripts/measurements/results/${saved.archive.file}` : null, status: saved.report.status,
    passed: saved.report.passed, failures: saved.report.failures,
    workloads: saved.report.workloads.map(row => ({ id: row.id, status: row.status, passed: row.passed })) }, null, 2) + '\n');
  process.exitCode = saved.report.passed ? 0 : 1;
}
