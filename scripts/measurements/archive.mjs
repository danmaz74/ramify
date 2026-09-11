import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { sha256 } from './common.mjs';

/** Preserve final resident observations when either output destination fails.
 * The caller releases measured resources before entering this function. */
export function persistMeasurement(report, output, directory, note) {
  const result = { report: structuredClone(report), rawWritten: false, archive: null };
  const errors = [];
  const failed = (destination, error) => {
    errors.push(error);
    result.report.passed = false;
    result.report.status = 'incomplete';
    result.report.failures ??= [];
    // Filesystem codes explain the failure without embedding host paths in
    // the portable report. Original errors remain available if both fail.
    result.report.failures.push(`${destination} persistence failed: ${error.code ?? error.name}`);
  };
  const writeRaw = () => {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(result.report, null, 2) + '\n');
    result.rawWritten = true;
  };
  try { writeRaw(); }
  catch (error) { failed('Raw output', error); }
  try { result.archive = archiveMeasurement(result.report, directory, note); }
  catch (error) {
    failed('Archive', error);
    if (result.rawWritten) {
      // Keep the archive failure beside the observations in the working copy.
      result.rawWritten = false;
      try { writeRaw(); }
      catch (retryError) { failed('Raw output retry', retryError); }
    }
  }
  if (!result.rawWritten && !result.archive) {
    throw new AggregateError(errors, 'Measurement could not be persisted to either destination');
  }
  return result;
}

/** Append lossless evidence using the batch archive's record format.
 * An exclusive lock prevents two measurement commands from losing records. */
export function archiveMeasurement(report, directory, note) {
  assert.ok(['ramify.batch-measurements/1', 'ramify.resident-measurements/1'].includes(report.schemaVersion));
  const resident = report.schemaVersion === 'ramify.resident-measurements/1';
  mkdirSync(directory, { recursive: true });
  const lock = join(directory, '.archive.lock');
  writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' });
  const id = randomUUID();
  const temporary = join(directory, `.index-${id}.json`);
  try {
    const indexPath = join(directory, 'index.json');
    let index;
    try { index = JSON.parse(readFileSync(indexPath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      index = { schemaVersion: 'ramify.batch-measurement-archive/1',
        compression: 'gzip, level9, timestamp0; raw payload retained without edits', records: [] };
    }
    assert.equal(index.schemaVersion, 'ramify.batch-measurement-archive/1');
    assert.ok(Array.isArray(index.records));
    const raw = Buffer.from(JSON.stringify(report, null, 2) + '\n');
    const gzip = gzipSync(raw, { level: 9 });
    assert.deepEqual(gunzipSync(gzip), raw);
    assert.equal(gzip.readUInt32LE(4), 0, 'Archive timestamp must be zero');
    const file = `${resident ? 'resident' : 'batch'}-${report.measuredAt.replaceAll(':', '-')}-${id}.json.gz`;
    writeFileSync(join(directory, file), gzip, { flag: 'wx' });
    const record = { file, note, rawSha256: sha256(raw), gzipSha256: sha256(gzip),
      rawBytes: raw.length, gzipBytes: gzip.length, measuredAt: report.measuredAt,
      completedAt: report.completedAt, phase: resident ? 'resident' : report.phase, passed: report.passed,
      payloadSchema: report.schemaVersion, build: report.inputs.build,
      workloads: report.workloads.map(({ id, name, status, passed, fixture }) =>
        ({ name: id ?? name, ...(status ? { status } : {}), passed, ...(fixture ? { fixture } : {}) })) };
    index.records.push(record);
    writeFileSync(temporary, JSON.stringify(index, null, 2) + '\n', { flag: 'wx' });
    renameSync(temporary, indexPath);
    return record;
  } finally {
    rmSync(temporary, { force: true });
    rmSync(lock);
  }
}
