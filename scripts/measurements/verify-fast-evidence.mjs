#!/usr/bin/env node
import assert from 'node:assert/strict';
import { arch, platform } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { packageRoot } from './common.mjs';
import { readArchiveJsonSync } from './archive.mjs';
import { readJsonSync } from './json-stream.mjs';
import { fastInputs, fastDependencies } from './fast-inputs.mjs';
import { fastBudgets, fastFixtures, fastWorkloads } from './fast-plan.mjs';
import { assertFastWorkload, deriveFastMeasurements, fastDeferrals } from './fast-assertions.mjs';

function verifyDerivedEvidence(report, row) {
  if (!['I5-13:cold-open', 'I5-13:checked-set-bounded'].includes(row.id)) return;
  const ids = fastFixtures.map(name => `I5-13:hook-latency-${name.toLowerCase()}`);
  assert.deepEqual(row.sourceWorkloadIds, ids, 'Derived evidence must name every original process workload');
  const sources = ids.map(id => report.workloads.find(value => value.id === id));
  for (const source of sources) {
    assert.equal(source.status, 'measured', 'Derived evidence requires completed source observations');
    assert.deepEqual(source.failures, [], 'A source runtime failure cannot establish derived evidence');
    assert.equal(source.interrupted, false);
    const observation = source.controllerObservation;
    assert.equal(observation.failure, null);
    assert.equal(observation.signal, null);
    assert.equal(observation.postExitObservedProcesses, 0);
    assert.ok(observation.processes.length > 0 && observation.samples.length > 0);
    assert.ok(Date.parse(source.startedAt) >= Date.parse(report.measuredAt)
      && Date.parse(source.completedAt) >= Date.parse(source.startedAt)
      && Date.parse(row.completedAt) >= Date.parse(source.completedAt), 'Invalid source measurement window');
    const assertions = assertFastWorkload(source.id, source.measurements);
    assert.ok(assertions.length > 0);
    assert.deepEqual(source.assertions, assertions, 'Derived source assertions must match its raw measurements');
    assert.equal(source.passed, assertions.every(value => value.passed));
    // A timing miss can fail the original latency row while the independently
    // asserted cold publication or checked set remains complete evidence.
    assert.equal(observation.code, source.passed ? 0 : 1);
  }
  assert.deepEqual(row.measurements, deriveFastMeasurements(row.id, report.workloads),
    'Derived observations differ from the original process measurements');
  assert.deepEqual(row.controllerObservation.processes, sources.flatMap(source => source.controllerObservation.processes),
    'Derived process observations differ from their original workloads');
  assert.deepEqual(row.controllerObservation.samples, sources.flatMap(source => source.controllerObservation.samples),
    'Derived process samples differ from their original workloads');
}

/** Verify one completed workload without treating a partial recipe as complete. */
export function verifyFastEvidence(report, id, expectedInputs = fastInputs(), dependencies = fastDependencies()) {
  assert.ok(fastWorkloads.some(row => row.id === id), 'Expected a reviewed I5-13 instance id');
  assert.equal(report.schemaVersion, 'ramify.fast-measurements/1');
  assert.equal(report.evidenceKind, 'measurement');
  assert.deepEqual(report.inputs, expectedInputs, 'Fast evidence must identify the current source, build, scope, fixtures and recipes');
  assert.deepEqual(report.dependencies, dependencies, 'Fast evidence dependencies changed');
  assert.equal(report.environment.node, process.version, 'Fast evidence Node runtime changed');
  assert.equal(report.environment.platform, platform(), 'Fast evidence platform changed');
  assert.equal(report.environment.arch, arch(), 'Fast evidence architecture changed');
  assert.deepEqual(report.budgets, fastBudgets, 'Fast measurement targets or runtime limits changed');
  assert.equal(report.sampling.intervalMs, 50);
  assert.equal(report.interrupted, false, 'Interrupted measurements cannot establish current evidence');
  assert.deepEqual(report.failures, [], 'Parent failures cannot be reused as completed measurement evidence');
  assert.ok(['passed', 'failed', 'incomplete'].includes(report.status), 'Unknown measurement completion status');
  assert.equal(typeof report.passed, 'boolean');
  assert.ok(Date.parse(report.completedAt) >= Date.parse(report.measuredAt), 'Invalid recipe completion window');
  assert.deepEqual(report.workloads.map(row => row.id).sort(), fastWorkloads.map(row => row.id).sort(),
    'Every reviewed workload must retain its own execution slot');
  assert.ok(report.workloads.every(row => ['measured', 'failed', 'not-executed'].includes(row.status)), 'Unknown workload execution status');
  const deferrals = fastDeferrals(report.workloads);
  assert.deepEqual(report.deferrals, deferrals, 'Saved deferral outcomes differ from the current raw measurements');

  const row = report.workloads.find(value => value.id === id);
  assert.equal(row.status, 'measured', `${id} has not completed the real workload`);
  assert.equal(row.passed, true, 'A failed workload cannot be reused');
  assert.deepEqual(row.failures, []);
  assert.equal(row.interrupted, false);
  assert.equal(row.controllerObservation.failure, null, 'Measurement worker failed');
  assert.equal(row.controllerObservation.signal, null, 'Measurement worker was interrupted');
  assert.equal(row.controllerObservation.code, 0, 'Measurement worker did not succeed');
  assert.equal(row.controllerObservation.postExitObservedProcesses, 0, 'Measurement leaked an observed process');
  assert.ok(row.controllerObservation.processes.length > 0, 'No externally observed measurement process');
  assert.ok(row.controllerObservation.samples.length > 0, 'No external process samples');
  assert.ok(Date.parse(row.startedAt) >= Date.parse(report.measuredAt)
    && Date.parse(row.completedAt) >= Date.parse(row.startedAt)
    && Date.parse(report.completedAt) >= Date.parse(row.completedAt), 'Invalid workload completion window');
  verifyDerivedEvidence(report, row);

  // Saved passed flags and aggregates never grant credit: recompute the
  // reviewed predicates from raw measurements with the current recipe.
  const assertions = assertFastWorkload(id, row.measurements);
  assert.ok(assertions.length > 0, 'No independent measurement predicates');
  const passed = assertions.every(value => value.passed);
  assert.deepEqual(row.assertions, assertions, 'Saved assertions differ from current raw measurement predicates');
  const reportComplete = Object.values(deferrals).every(value => ['triggered', 'not-triggered'].includes(value.status))
    && report.workloads.every(value => {
    if (value.status !== 'measured' || !value.passed || value.failures?.length !== 0 || value.interrupted !== false
      || value.controllerObservation?.failure !== null || value.controllerObservation?.signal !== null
      || value.controllerObservation?.code !== 0 || value.controllerObservation?.postExitObservedProcesses !== 0
      || !(value.controllerObservation?.processes?.length > 0) || !(value.controllerObservation?.samples?.length > 0)
      || !(Date.parse(value.startedAt) >= Date.parse(report.measuredAt)
        && Date.parse(value.completedAt) >= Date.parse(value.startedAt)
        && Date.parse(report.completedAt) >= Date.parse(value.completedAt))) return false;
    const checks = assertFastWorkload(value.id, value.measurements);
    if (checks.length === 0 || checks.some(check => !check.passed) || !isDeepStrictEqual(checks, value.assertions)) return false;
    verifyDerivedEvidence(report, value);
    return true;
  });
  assert.equal(report.passed, reportComplete, 'Recipe pass must require all nine completed workloads');
  assert.equal(report.status === 'passed', reportComplete, 'Recipe status must preserve incomplete or failed workloads');
  return { id, passed, reportComplete, assertions, deferrals,
    idealMisses: assertions.filter(value => value.enforcement === 'ideal' && !value.targetMet),
    measuredAt: report.measuredAt, completedAt: row.completedAt, inputs: report.inputs,
    samples: { processes: row.controllerObservation.processes.length,
      controller: row.controllerObservation.samples.length } };
}

/** Indexed payloads must match both the compressed and lossless raw identities. */
export function readFastEvidence(path, record) {
  if (record) {
    assert.equal(record.payloadSchema, 'ramify.fast-measurements/1');
    assert.equal(record.phase, 'fast');
  }
  return { ...readArchiveJsonSync(path, record), artifact: path };
}

function readIndex(directory) {
  const index = readJsonSync(join(directory, 'index.json'));
  assert.equal(index.schemaVersion, 'ramify.batch-measurement-archive/1');
  assert.ok(Array.isArray(index.records));
  return index;
}

/** Select the newest current archive, preserving any incomplete result. */
export function findFastEvidence(directory, inputs) {
  const candidates = readIndex(directory).records.filter(record => record.phase === 'fast').reverse();
  for (const record of candidates) {
    assert.ok(/^[^/\\]+\.json\.gz$/.test(record.file), 'Archive file must remain in its owned directory');
    const candidate = readFastEvidence(join(directory, record.file), record);
    if (isDeepStrictEqual(candidate.report.inputs, inputs)) return candidate;
  }
  throw new Error('No current fast measurements. On an idle host run npm run measure:fast, then set RAMIFY_FAST_MEASUREMENT_REPORT to its raw report or use its archive.');
}

async function run() {
  const [id, argument] = process.argv.slice(2);
  const provided = argument ?? process.env.RAMIFY_FAST_MEASUREMENT_REPORT;
  const inputs = fastInputs(), dependencies = fastDependencies();
  let evidence;
  if (provided) {
    const path = resolve(provided);
    let record;
    if (path.endsWith('.gz')) {
      // Naming an indexed archive explicitly must not bypass its hashes.
      try { record = readIndex(dirname(path)).records.find(value => value.file === basename(path)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    evidence = readFastEvidence(path, record);
  } else evidence = findFastEvidence(join(packageRoot, 'scripts/measurements/results'), inputs);
  const result = verifyFastEvidence(evidence.report, id, inputs, dependencies);
  process.stdout.write(JSON.stringify({ ...result, artifact: evidence.artifact, rawSha256: evidence.rawSha256, rawBytes: evidence.rawBytes }) + '\n');
  process.exitCode = result.passed ? 0 : 1;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '.')).href) {
  try { await run(); }
  catch (error) { process.stdout.write(JSON.stringify({ passed: false, error: error.stack ?? String(error) }) + '\n'); process.exitCode = 1; }
}
