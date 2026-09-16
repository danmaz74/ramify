#!/usr/bin/env node
import assert from 'node:assert/strict';
import { arch, platform } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { packageRoot } from './common.mjs';
import { readArchiveJsonSync } from './archive.mjs';
import { readJsonSync } from './json-stream.mjs';
import { plan2aDependencies, plan2aInputs } from './plan2a-inputs.mjs';

/**
 * Verify one completed Plan 2A (`ramify materialize`) scale workload against
 * its archived raw report, recomputing predicates from the raw measurement
 * rather than trusting a saved `passed` flag. Mirrors `verify-fast-evidence.mjs`'s
 * shape, simplified for the plan2a report (no derived/deferred workloads).
 */
export function verifyPlan2aWorkload(report, name, expectedInputs = plan2aInputs(), expectedDependencies = plan2aDependencies()) {
  assert.equal(report.schemaVersion, 'ramify.plan2a-measurements/1');
  assert.equal(report.phase, 'plan2a');
  assert.equal(report.evidenceKind, 'measurement');
  assert.deepEqual(report.inputs, expectedInputs, 'Plan 2A evidence must identify the current source, build and recipe files');
  assert.deepEqual(report.dependencies, expectedDependencies, 'Plan 2A evidence dependencies changed');
  assert.equal(report.environment.platform, platform(), 'Plan 2A evidence platform changed');
  assert.equal(report.environment.arch, arch(), 'Plan 2A evidence architecture changed');
  assert.equal(report.interrupted, false, 'An interrupted measurement run cannot establish current evidence');
  assert.deepEqual(report.failures, [], 'Parent-level failures cannot be reused as completed measurement evidence');
  const row = report.workloads.find(item => item.name === name);
  assert.ok(row, `Unknown plan2a workload: ${name}`);
  return row;
}

/** `synthetic-500` alone may legitimately be `not-executed` under the
 * recorded measurement policy; every other requested workload must be a
 * real, passing, non-empty measurement. */
export function verifyPlan2aScaleWorkload(report, name) {
  const row = verifyPlan2aWorkload(report, name);
  assert.equal(row.status, 'measured', `${name} has not completed a real workload`);
  assert.equal(row.passed, true, 'A failed workload cannot be reused as passing evidence');
  assert.ok(row.measurements, 'No raw measurement attached to the workload');
  assert.equal(row.measurements.daemonStopped, true, 'The owned daemon must have stopped cleanly');
  assert.ok(row.measurements.cold, 'No cold materialize measurement recorded');
  assert.equal(row.measurements.cold.code, 0, `Cold materialize did not succeed for ${name}`);
  assert.ok(row.measurements.metrics, 'No filesystem metrics recorded for a successful cold run');
  return row;
}

function readIndex(directory) {
  const index = readJsonSync(join(directory, 'index.json'));
  assert.equal(index.schemaVersion, 'ramify.batch-measurement-archive/1');
  assert.ok(Array.isArray(index.records));
  return index;
}

export function readPlan2aEvidence(path, record) {
  if (record) {
    assert.equal(record.payloadSchema, 'ramify.plan2a-measurements/1');
    assert.equal(record.phase, 'plan2a');
  }
  return { ...readArchiveJsonSync(path, record), artifact: path };
}

/** Select the newest archive whose recorded inputs still match the current
 * source/build identity, preserving any incomplete result rather than
 * silently skipping it. */
export function findPlan2aEvidence(directory, inputs) {
  const candidates = readIndex(directory).records.filter(record => record.phase === 'plan2a').reverse();
  for (const record of candidates) {
    assert.ok(/^[^/\\]+\.json\.gz$/.test(record.file), 'Archive file must remain in its owned directory');
    const candidate = readPlan2aEvidence(join(directory, record.file), record);
    if (inputs === undefined || isDeepStrictEqual(candidate.report.inputs, inputs)) return candidate;
  }
  throw new Error('No current plan2a measurements. Run node scripts/measurements/plan2a.mjs, then set RAMIFY_PLAN2A_MEASUREMENT_REPORT to its raw report or use its archive.');
}

/** Accepts either the reviewed `I2A-12:<suffix>` leaf id or the report's own
 * short workload `name` (they differ for the two renamed leaves). */
const idToName = { 'I2A-12:reference-scale': 'reference', 'I2A-12:toolkit-scale': 'toolkit',
  'I2A-12:synthetic-100': 'synthetic-100', 'I2A-12:synthetic-500': 'synthetic-500',
  'I2A-12:synthetic-1000': 'synthetic-1000', 'I2A-12:repeat-plateau': 'repeat-plateau' };

async function run() {
  const [id, argument] = process.argv.slice(2);
  const name = idToName[id] ?? id;
  const provided = argument ?? process.env.RAMIFY_PLAN2A_MEASUREMENT_REPORT;
  const inputs = plan2aInputs(), dependencies = plan2aDependencies();
  let evidence;
  if (provided) {
    const path = resolve(provided);
    let record;
    if (path.endsWith('.gz')) {
      try { record = readIndex(dirname(path)).records.find(value => value.file === basename(path)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    evidence = readPlan2aEvidence(path, record);
  } else evidence = findPlan2aEvidence(join(packageRoot, 'scripts/measurements/results'), inputs);
  const row = verifyPlan2aWorkload(evidence.report, name, inputs, dependencies);
  process.stdout.write(JSON.stringify({ name, artifact: evidence.artifact, row,
    measurementPolicy: evidence.report.measurementPolicy, environment: evidence.report.environment, error: null }) + '\n');
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '.')).href) {
  try { await run(); }
  catch (error) { process.stdout.write(JSON.stringify({ passed: false, error: error.stack ?? String(error) }) + '\n'); process.exitCode = 1; }
}
