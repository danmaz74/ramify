import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { archiveMeasurement } from './archive.mjs';
import { sha256 } from './common.mjs';
import { measureProcess, processRows } from './process-observer.mjs';
import { pendingResidentWorkloads, residentBudgets } from './resident-plan.mjs';
import { residentPrerequisites } from './resident-prerequisites.mjs';

// Direct, bounded tooling controls. These exercise real child processes and
// archive I/O, and never claim resident engine or I2 matrix evidence.
const scratch = mkdtempSync(join(tmpdir(), 'ramify-measure-controls-'));
try {
  const run = await measureProcess(process.execPath, ['--input-type=module', '--eval', `
    import { spawn } from 'node:child_process';
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 250)']);
    child.once('close', () => process.stdout.write('released'));
  `]);
  assert.equal(run.code, 0); assert.equal(run.failure, null);
  assert.equal(run.stdout, 'released'); assert.equal(run.postExitObservedProcesses, 0);
  assert.ok(run.processes.some(item => item.role === 'helper' && item.peakRssBytes > 0));
  assert.ok(run.samples.length > 1);
  for (const sample of run.samples) assert.equal(sample.combinedRssBytes,
    sample.processes.reduce((sum, item) => sum + item.rssBytes, 0));

  const timeout = await measureProcess(process.execPath, ['-e', 'setInterval(() => {}, 100)'], { timeoutMs: 180 });
  assert.match(timeout.failure, /exceeded 180 ms/);
  assert.equal(timeout.signal, 'SIGKILL'); assert.equal(timeout.postExitObservedProcesses, 0);
  const controller = new AbortController();
  const pending = measureProcess(process.execPath, ['-e', 'setInterval(() => {}, 100)'], { signal: controller.signal });
  const abortTimer = setTimeout(() => controller.abort(), 180);
  const interrupted = await pending;
  clearTimeout(abortTimer);
  assert.match(interrupted.failure, /interrupted/);
  assert.equal(interrupted.postExitObservedProcesses, 0);
  const missing = await measureProcess(join(scratch, 'missing-command'), [], { timeoutMs: 500 });
  assert.match(missing.failure, /ENOENT/); assert.notEqual(missing.code, 0);
  const observed = new Set([...run.processes, ...timeout.processes, ...interrupted.processes].map(item => item.pid));
  assert.ok(processRows().every(item => !observed.has(item.pid)), 'Control left a child process');

  const workloads = pendingResidentWorkloads('required provider missing');
  assert.equal(workloads.length, 9);
  assert.ok(workloads.every(item => item.status === 'not-executed' && item.measurements === null && !item.passed));
  assert.equal(residentBudgets.reference.sourceMs, 4500);
  assert.equal(residentBudgets.S100.sourceMs, 8000);
  const report = { schemaVersion: 'ramify.resident-measurements/1', measuredAt: new Date().toISOString(),
    completedAt: new Date().toISOString(), passed: false, inputs: { build: { files: 0, sha256: 'test-only' } }, workloads };
  const archive = join(scratch, 'archive');
  const first = archiveMeasurement(report, archive, 'Tooling test only');
  const gzip = readFileSync(join(archive, first.file));
  const raw = gunzipSync(gzip);
  assert.deepEqual(JSON.parse(raw), report);
  assert.equal(first.rawSha256, sha256(raw)); assert.equal(first.gzipSha256, sha256(gzip));
  assert.equal(gzip.readUInt32LE(4), 0);
  archiveMeasurement(report, archive, 'Second record');
  assert.deepEqual(JSON.parse(readFileSync(join(archive, 'index.json'))).records[0], first);
  const batch = archiveMeasurement({ ...report, schemaVersion: 'ramify.batch-measurements/1', phase: 'cold',
    workloads: [{ name: 'reference', passed: false, fixture: { files: 1 } }] }, archive, 'Batch format control');
  assert.equal(batch.phase, 'cold');
  assert.deepEqual(batch.workloads, [{ name: 'reference', passed: false, fixture: { files: 1 } }]);
  const before = readFileSync(join(archive, 'index.json'));
  writeFileSync(join(archive, '.archive.lock'), 'held');
  assert.throws(() => archiveMeasurement(report, archive, 'Must not overwrite a held lock'), /EEXIST/);
  assert.deepEqual(readFileSync(join(archive, 'index.json')), before);
  rmSync(join(archive, '.archive.lock'));
  writeFileSync(join(archive, 'index.json'), '{invalid');
  assert.throws(() => archiveMeasurement(report, archive, 'Must preserve corrupt index'));
  assert.equal(readFileSync(join(archive, 'index.json'), 'utf8'), '{invalid');
  assert.ok(!readdirSync(archive).includes('.archive.lock'));

  writeFileSync(join(scratch, 'package.json'), JSON.stringify({ exports: {} }));
  assert.ok(residentPrerequisites(scratch).every(item => !item.present));
  writeFileSync(join(scratch, 'package.json'), JSON.stringify({ exports: { './client': { import: './missing.js', types: './missing.d.ts' } } }));
  assert.equal(residentPrerequisites(scratch)[0].present, false, 'Declaring missing entries is insufficient');
  process.stdout.write('Measurement tooling controls passed: observer, timeout, interruption, spawn failure, archive integrity/locking, missing evidence and prerequisites.\n');
} finally { rmSync(scratch, { recursive: true, force: true }); }
