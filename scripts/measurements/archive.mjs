import assert from 'node:assert/strict';
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { jsonChunks, parseJsonChunks, readJsonSync, writeJsonSync } from './json-stream.mjs';

const memberBytes = 4 * 1024 ** 2;
const readBytes = 64 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset);
    assert.ok(written > 0, 'Archive write made no progress'); offset += written;
  }
}
function* fileChunks(path) {
  const fd = openSync(path, 'r');
  try {
    for (;;) {
      const bytes = Buffer.allocUnsafe(readBytes), count = readSync(fd, bytes, 0, bytes.length, null);
      if (!count) break;
      yield bytes.subarray(0, count);
    }
  } finally { closeSync(fd); }
}
function fileIdentity(path) {
  const hash = createHash('sha256'); let bytes = 0;
  for (const chunk of fileChunks(path)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest('hex'), bytes };
}
function metadata(value, transformString) {
  if (!transformString) return value;
  if (typeof value === 'string') return transformString(value);
  if (Array.isArray(value)) return value.map(item => metadata(item, transformString));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, metadata(item, transformString)]));
  return value;
}

/** Preserve observations without cloning the potentially enormous sample graph.
 * Only final metadata and failures are changed; nested observations stay shared. */
export function persistMeasurement(report, output, directory, note, options = {}) {
  const result = { report: { ...report, ...(report.failures ? { failures: [...report.failures] } : {}) }, rawWritten: false, archive: null };
  const errors = [];
  const failed = (destination, error) => {
    errors.push(error);
    result.report.passed = false;
    result.report.status = 'incomplete';
    result.report.failures ??= [];
    result.report.failures.push(`${destination} persistence failed: ${error.code ?? error.name}`);
  };
  const writeRaw = () => {
    mkdirSync(dirname(output), { recursive: true });
    writeJsonSync(output, result.report, options);
    result.rawWritten = true;
  };
  try { writeRaw(); }
  catch (error) { failed('Raw output', error); }
  try { result.archive = archiveMeasurement(result.report, directory, note, options); }
  catch (error) {
    failed('Archive', error);
    if (result.rawWritten) {
      result.rawWritten = false;
      try { writeRaw(); }
      catch (retryError) { failed('Raw output retry', retryError); }
    }
  }
  if (!result.rawWritten && !result.archive) throw new AggregateError(errors, 'Measurement could not be persisted to either destination');
  return result;
}

/** Append standard concatenated gzip members, each with at most 4 MiB of raw
 * JSON. Member boundaries do not change a single byte of the pretty payload. */
export function archiveMeasurement(report, directory, note, options = {}) {
  assert.ok(['ramify.batch-measurements/1', 'ramify.resident-measurements/1', 'ramify.fast-measurements/1',
    'ramify.plan2a-measurements/1'].includes(report.schemaVersion));
  const resident = report.schemaVersion === 'ramify.resident-measurements/1';
  const fast = report.schemaVersion === 'ramify.fast-measurements/1';
  const plan2a = report.schemaVersion === 'ramify.plan2a-measurements/1';
  mkdirSync(directory, { recursive: true });
  const lock = join(directory, '.archive.lock');
  writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' });
  const id = randomUUID(), temporary = join(directory, `.index-${id}.json`);
  let archivePath, archiveCreated = false, committed = false;
  try {
    const indexPath = join(directory, 'index.json');
    let index;
    try { index = readJsonSync(indexPath); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      index = { schemaVersion: 'ramify.batch-measurement-archive/1',
        compression: 'gzip, level9, timestamp0; raw payload retained without edits', records: [] };
    }
    assert.equal(index.schemaVersion, 'ramify.batch-measurement-archive/1');
    assert.ok(Array.isArray(index.records));
    const file = `${fast ? 'fast' : resident ? 'resident' : plan2a ? 'plan2a' : 'batch'}-${report.measuredAt.replaceAll(':', '-')}-${id}.json.gz`;
    archivePath = join(directory, file);
    const fd = openSync(archivePath, 'wx');
    archiveCreated = true;
    const rawHash = createHash('sha256'), gzipHash = createHash('sha256'), gzipMembers = [];
    let rawBytes = 0, gzipBytes = 0, used = 0;
    const buffer = Buffer.allocUnsafe(memberBytes);
    const flush = () => {
      if (!used) return;
      const raw = buffer.subarray(0, used), compressed = gzipSync(raw, { level: 9 });
      assert.deepEqual(gunzipSync(compressed), raw, 'Archive member must preserve the raw bytes');
      assert.equal(compressed.readUInt32LE(4), 0, 'Archive timestamp must be zero');
      writeAll(fd, compressed);
      gzipMembers.push({ offset: gzipBytes, length: compressed.length, rawBytes: used,
        rawSha256: digest(raw), gzipSha256: digest(compressed) });
      gzipHash.update(compressed); rawHash.update(raw); gzipBytes += compressed.length; rawBytes += used; used = 0;
    };
    try {
      for (const chunk of jsonChunks(report, options)) {
        let offset = 0;
        while (offset < chunk.length) {
          const count = Math.min(memberBytes - used, chunk.length - offset);
          chunk.copy(buffer, used, offset, offset + count); used += count; offset += count;
          if (used === memberBytes) flush();
        }
      }
      flush();
    } finally { closeSync(fd); }
    const record = { file, rawSha256: rawHash.digest('hex'), gzipSha256: gzipHash.digest('hex'),
      rawBytes, gzipBytes, gzipMembers, ...metadata({ note, measuredAt: report.measuredAt,
      completedAt: report.completedAt, phase: fast ? 'fast' : resident ? 'resident' : report.phase, passed: report.passed,
      payloadSchema: report.schemaVersion, build: report.inputs.build,
      workloads: report.workloads.map(({ id, name, status, passed, fixture }) =>
        ({ name: id ?? name, ...(status ? { status } : {}), passed, ...(fixture ? { fixture } : {}) })) }, options.transformString) };
    index.records.push(record);
    const indexFd = openSync(temporary, 'wx');
    try { for (const chunk of jsonChunks(index)) writeAll(indexFd, chunk); }
    finally { closeSync(indexFd); }
    renameSync(temporary, indexPath); committed = true;
    return record;
  } finally {
    if (archiveCreated && !committed) rmSync(archivePath, { force: true });
    rmSync(temporary, { force: true }); rmSync(lock);
  }
}

function indexRecord(path) {
  let index;
  try { index = readJsonSync(join(dirname(path), 'index.json')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  assert.equal(index.schemaVersion, 'ramify.batch-measurement-archive/1');
  assert.ok(Array.isArray(index.records));
  return index.records.find(record => record.file === basename(path));
}
function* indexedChunks(path, record) {
  assert.ok(Array.isArray(record.gzipMembers) && record.gzipMembers.length > 0, 'Archive gzip members are missing');
  const fd = openSync(path, 'r');
  let offset = 0;
  try {
    const size = fstatSync(fd).size;
    for (const [index, member] of record.gzipMembers.entries()) {
      assert.ok(Number.isSafeInteger(member.offset) && member.offset === offset, `Archive gzip member ${index} offsets are not contiguous`);
      assert.ok(Number.isSafeInteger(member.length) && member.length > 0 && member.length <= memberBytes + 64 * 1024,
        `Archive gzip member ${index} compressed length exceeds its bounded capacity`);
      assert.ok(Number.isSafeInteger(member.rawBytes) && member.rawBytes > 0 && member.rawBytes <= memberBytes,
        `Archive gzip member ${index} raw length exceeds its bounded capacity`);
      assert.ok(offset + member.length <= size, `Archive gzip member ${index} exceeds file EOF`);
      const compressed = Buffer.allocUnsafe(member.length); let read = 0;
      while (read < compressed.length) {
        const count = readSync(fd, compressed, read, compressed.length - read, offset + read);
        assert.ok(count > 0, `Archive gzip member ${index} is truncated`); read += count;
      }
      assert.equal(digest(compressed), member.gzipSha256, `Archive gzip member ${index} compressed hash mismatch`);
      const raw = gunzipSync(compressed, { maxOutputLength: memberBytes });
      assert.equal(raw.length, member.rawBytes, `Archive gzip member ${index} raw byte count mismatch`);
      assert.equal(digest(raw), member.rawSha256, `Archive gzip member ${index} raw hash mismatch`);
      for (let start = 0; start < raw.length; start += readBytes) yield raw.subarray(start, start + readBytes);
      offset += member.length;
    }
    assert.equal(offset, size, 'Archive gzip member coverage does not reach file EOF');
  } finally { closeSync(fd); }
}
function* legacyChunks(path) {
  // Legacy single-member evidence has no offsets. Preserve compatibility while
  // feeding bounded buffers to the parser, never constructing one huge string.
  const raw = gunzipSync(readFileSync(path));
  for (let offset = 0; offset < raw.length; offset += readBytes) yield raw.subarray(offset, offset + readBytes);
}

/** Read current indexed members, historical gzip, or raw JSON without a whole
 * decoded JSON string. Existing compressed and raw identities remain binding. */
export function readArchiveJsonSync(path, suppliedRecord) {
  const compressed = path.endsWith('.gz');
  const record = suppliedRecord ?? (compressed ? indexRecord(path) : undefined);
  const identity = compressed ? fileIdentity(path) : null;
  if (record && compressed) {
    assert.equal(identity.sha256, record.gzipSha256, 'Archive gzip hash mismatch');
    assert.equal(identity.bytes, record.gzipBytes, 'Archive compressed byte count mismatch');
  }
  const parsed = parseJsonChunks(compressed ? record?.gzipMembers ? indexedChunks(path, record) : legacyChunks(path) : fileChunks(path));
  if (record) {
    assert.equal(parsed.rawSha256, record.rawSha256, 'Archive raw hash mismatch');
    assert.equal(parsed.rawBytes, record.rawBytes, 'Archive raw byte count mismatch');
  }
  return { report: parsed.value, rawSha256: parsed.rawSha256, rawBytes: parsed.rawBytes };
}
