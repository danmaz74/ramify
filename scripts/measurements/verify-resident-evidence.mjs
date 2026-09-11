#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { arch, platform } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { packageRoot, sha256 } from './common.mjs';
import { residentInputs, residentDependencies } from './resident-inputs.mjs';
import { residentBudgets, residentWorkloads } from './resident-plan.mjs';
import { assertResidentWorkload } from './resident-assertions.mjs';

export function verifyResidentEvidence(report, id, expectedInputs = residentInputs(), dependencies = residentDependencies()) {
  assert.equal(report.schemaVersion, 'ramify.resident-measurements/1');
  assert.equal(report.evidenceKind, 'measurement');
  assert.deepEqual(report.inputs, expectedInputs, 'Resident evidence must identify the current source, build, scope, fixtures and recipes');
  assert.deepEqual(report.dependencies, dependencies, 'Resident evidence dependencies changed');
  assert.equal(report.environment.node, process.version, 'Resident evidence Node runtime changed');
  assert.equal(report.environment.platform, platform(), 'Resident evidence platform changed');
  assert.equal(report.environment.arch, arch(), 'Resident evidence architecture changed');
  assert.deepEqual(report.budgets, residentBudgets, 'Resident reference targets or runtime limits changed');
  assert.equal(report.sampling.intervalMs, 50);
  assert.equal(report.interrupted, false);
  assert.deepEqual(report.failures, []);
  assert.ok(report.completedAt && report.measuredAt && Date.parse(report.completedAt) >= Date.parse(report.measuredAt));
  assert.deepEqual(report.workloads.map(row => row.id).sort(), residentWorkloads.map(row => row.id).sort());
  const row = report.workloads.find(value => value.id === id);
  assert.ok(row, `No real resident workload for ${id}`);
  assert.equal(row.status, 'measured', `${id} has not completed the real workload`);
  assert.deepEqual(row.failures, []);
  assert.equal(row.interrupted, false);
  assert.equal(row.controllerObservation.failure, null, 'Measurement worker failed');
  assert.equal(row.controllerObservation.signal, null, 'Measurement worker was interrupted');
  assert.equal(row.controllerObservation.postExitObservedProcesses, 0, 'Measurement leaked an observed process');
  assert.ok([0, 1].includes(row.controllerObservation.code));
  const assertions = assertResidentWorkload(id, row.measurements);
  assert.ok(assertions.length > 0);
  // Recompute from raw samples; never grant credit from a saved passed flag.
  return { id, passed: assertions.every(value => value.passed), assertions,
    performancePolicy: 'advisory-by-user-request-2026-09-11',
    advisoryMisses: assertions.filter(value => value.enforcement === 'advisory' && !value.targetMet),
    measuredAt: report.measuredAt, completedAt: row.completedAt, inputs: report.inputs,
    samples: { processes: row.controllerObservation.processes.length,
      controller: row.controllerObservation.samples.length },
    compilerStateTrigger: report.compilerStateTrigger };
}

function readEvidence(path, record) {
  const bytes = readFileSync(path), raw = path.endsWith('.gz') ? gunzipSync(bytes) : bytes;
  if (record) {
    assert.equal(sha256(bytes), record.gzipSha256, 'Archive gzip hash mismatch');
    assert.equal(sha256(raw), record.rawSha256, 'Archive raw hash mismatch');
  }
  return { report: JSON.parse(raw), artifact: path, rawSha256: sha256(raw), rawBytes: raw.length };
}
function run() {
  const [id, provided] = process.argv.slice(2);
  assert.ok(residentWorkloads.some(row => row.id === id), 'Expected a reviewed I2-29 instance id');
  const inputs = residentInputs(), dependencies = residentDependencies();
  let evidence;
  if (provided) evidence = readEvidence(resolve(provided));
  else {
    const directory = join(packageRoot, 'scripts/measurements/results');
    const index = JSON.parse(readFileSync(join(directory, 'index.json'), 'utf8'));
    const candidates = index.records.filter(record => record.phase === 'resident').reverse();
    for (const record of candidates) {
      assert.equal(basename(record.file), record.file, 'Archive file must remain in its owned directory');
      const candidate = readEvidence(join(directory, record.file), record);
      if (JSON.stringify(candidate.report.inputs) === JSON.stringify(inputs)) { evidence = candidate; break; }
    }
    assert.ok(evidence, 'No current resident measurements. On an idle host run npm run measure:resident, then set RAMIFY_RESIDENT_MEASUREMENT_REPORT to its raw report or use its archive.');
  }
  const result = verifyResidentEvidence(evidence.report, id, inputs, dependencies);
  process.stdout.write(JSON.stringify({ ...result, artifact: evidence.artifact, rawSha256: evidence.rawSha256, rawBytes: evidence.rawBytes }) + '\n');
  process.exitCode = result.passed ? 0 : 1;
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '.')).href) {
  try { run(); }
  catch (error) { process.stdout.write(JSON.stringify({ passed: false, error: error.stack ?? String(error) }) + '\n'); process.exitCode = 1; }
}
