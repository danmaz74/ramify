import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { archiveMeasurement, persistMeasurement, readArchiveJsonSync } from './archive.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fixture = extra => ({ schemaVersion: 'ramify.fast-measurements/1', measuredAt: '2026-09-12T00:00:00.000Z',
  completedAt: '2026-09-12T00:01:00.000Z', passed: false, status: 'incomplete', failures: [],
  inputs: { build: { sha256: 'test-only' } }, workloads: [{ id: 'storage-control-only', status: 'not-executed', passed: false }], ...extra });
function temporary(run) {
  const directory = mkdtempSync(join(tmpdir(), 'archive-stream-control-'));
  try { return run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('bounded concatenated gzip members preserve every pretty JSON byte and indexed identity', () => temporary(directory => {
  const value = fixture({ blocks: Array.from({ length: 8 }, (_, index) => ({ index, text: 'π🙂payload\n'.repeat(60_000) })) });
  const record = archiveMeasurement(value, directory, 'Storage control only');
  assert.ok(record.gzipMembers.length > 1);
  let offset = 0, rawBytes = 0;
  for (const member of record.gzipMembers) {
    assert.equal(member.offset, offset); offset += member.length; rawBytes += member.rawBytes;
    assert.ok(member.rawBytes <= 4 * 1024 ** 2);
  }
  assert.equal(offset, record.gzipBytes); assert.equal(rawBytes, record.rawBytes);
  const gzip = readFileSync(join(directory, record.file)), raw = gunzipSync(gzip);
  assert.equal(raw.toString('utf8'), JSON.stringify(value, null, 2) + '\n');
  assert.equal(digest(raw), record.rawSha256); assert.equal(digest(gzip), record.gzipSha256);
  assert.deepEqual(readArchiveJsonSync(join(directory, record.file), record).report, value);
  assert.deepEqual(readArchiveJsonSync(join(directory, record.file)).report, value, 'Optional record uses the owning index');
}));

test('member tampering, gaps, overlaps and trailing bytes cannot bypass whole-file or member integrity', () => temporary(directory => {
  const value = fixture({ blocks: Array(6).fill('payload'.repeat(120_000)) });
  const record = archiveMeasurement(value, directory, 'Tamper control only');
  const path = join(directory, record.file), original = readFileSync(path);
  const changed = mutate => { const copy = structuredClone(record); mutate(copy); return copy; };
  for (const [mutate, expected] of [
    [copy => { copy.gzipMembers[1].offset++; }, /not contiguous/],
    [copy => { copy.gzipMembers[1].offset--; }, /not contiguous/],
    [copy => { copy.gzipMembers[0].length++; }, /compressed hash mismatch/],
    [copy => { copy.gzipMembers[0].rawBytes--; }, /raw byte count mismatch/],
    [copy => { copy.gzipMembers[0].rawSha256 = 'wrong'; }, /raw hash mismatch/],
    [copy => { copy.gzipMembers[0].gzipSha256 = 'wrong'; }, /compressed hash mismatch/],
    [copy => { copy.gzipMembers.pop(); }, /coverage.*EOF/],
    [copy => { copy.gzipMembers = []; }, /members are missing/],
  ]) assert.throws(() => readArchiveJsonSync(path, changed(mutate)), expected);
  const appended = Buffer.concat([original, Buffer.from('tail')]); writeFileSync(path, appended);
  assert.throws(() => readArchiveJsonSync(path, record), /gzip hash mismatch/);
  assert.throws(() => readArchiveJsonSync(path, { ...record, gzipBytes: appended.length, gzipSha256: digest(appended) }), /coverage.*EOF/);
  const corrupt = Buffer.from(original); corrupt[20] ^= 1; writeFileSync(path, corrupt);
  assert.throws(() => readArchiveJsonSync(path, { ...record, gzipSha256: digest(corrupt) }), /compressed hash mismatch/);
  const truncated = original.subarray(0, original.length - 1); writeFileSync(path, truncated);
  assert.throws(() => readArchiveJsonSync(path, { ...record, gzipBytes: truncated.length, gzipSha256: digest(truncated) }), /exceeds file EOF/);
}));

test('raw JSON and historical single-member gzip retain hashes and reject malformed or multiple roots', () => temporary(directory => {
  const value = fixture(), raw = Buffer.from(JSON.stringify(value, null, 2) + '\n'), gzip = gzipSync(raw);
  const path = join(directory, 'legacy.json.gz'); writeFileSync(path, gzip);
  const record = { rawSha256: digest(raw), gzipSha256: digest(gzip), rawBytes: raw.length, gzipBytes: gzip.length };
  assert.deepEqual(readArchiveJsonSync(path, record), { report: value, rawSha256: record.rawSha256, rawBytes: raw.length });
  const rawPath = join(directory, 'raw.json'); writeFileSync(rawPath, raw);
  assert.deepEqual(readArchiveJsonSync(rawPath), { report: value, rawSha256: record.rawSha256, rawBytes: raw.length });
  for (const malformed of ['{"missing":', '{} {}', '{invalid}']) {
    writeFileSync(rawPath, malformed); assert.throws(() => readArchiveJsonSync(rawPath));
    writeFileSync(path, gzipSync(Buffer.from(malformed))); assert.throws(() => readArchiveJsonSync(path));
  }
}));

test('persistence shares immutable observations and streams transformed raw and archive bytes equally', () => temporary(directory => {
  const workloads = Object.freeze([Object.freeze({ id: 'control-only', passed: false, measurements: Object.freeze({ path: '/host/project/file.ts' }) })]);
  const failures = Object.freeze([]), value = Object.freeze(fixture({ workloads, failures }));
  const output = join(directory, 'raw.json'), archive = join(directory, 'archive');
  const saved = persistMeasurement(value, output, archive, 'Transform control', { transformString: text => text.replaceAll('/host/project', '<project>') });
  assert.equal(saved.report.workloads, workloads, 'Persistence must not clone the observation graph');
  assert.notEqual(saved.report.failures, failures); assert.deepEqual(value.failures, []);
  assert.deepEqual(readFileSync(output), gunzipSync(readFileSync(join(archive, saved.archive.file))));
  assert.equal(readArchiveJsonSync(output).report.workloads[0].measurements.path, '<project>/file.ts');
  assert.equal(value.workloads[0].measurements.path, '/host/project/file.ts');
}));

test('missing output, held lock, corrupt index and both-destination failures preserve prior evidence', () => temporary(directory => {
  const archive = join(directory, 'archive'), output = join(directory, 'raw.json'), unusable = join(directory, 'directory');
  mkdirSync(unusable);
  const value = fixture();
  const saved = persistMeasurement(value, unusable, archive, 'Raw failure');
  assert.equal(saved.rawWritten, false); assert.ok(saved.archive);
  assert.match(readArchiveJsonSync(join(archive, saved.archive.file)).report.failures.at(-1), /Raw output persistence failed: EISDIR/);
  assert.deepEqual(value.failures, []);
  const before = readFileSync(join(archive, 'index.json'));
  writeFileSync(join(archive, '.archive.lock'), 'held');
  const failed = persistMeasurement(value, output, archive, 'Archive failure');
  assert.equal(failed.archive, null); assert.equal(failed.rawWritten, true);
  assert.match(readArchiveJsonSync(output).report.failures.at(-1), /Archive persistence failed: EEXIST/);
  assert.deepEqual(readFileSync(join(archive, 'index.json')), before);
  assert.throws(() => persistMeasurement(value, unusable, archive, 'Both failures'), error => error instanceof AggregateError && error.errors.length === 2);
  rmSync(join(archive, '.archive.lock'));
  writeFileSync(join(archive, 'index.json'), '{invalid');
  assert.throws(() => archiveMeasurement(value, archive, 'Corrupt index'));
  assert.equal(readFileSync(join(archive, 'index.json'), 'utf8'), '{invalid');
}));
