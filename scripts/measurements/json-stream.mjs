import { createHash } from 'node:crypto';
import { closeSync, openSync, readSync, writeSync } from 'node:fs';
import { types } from 'node:util';
import { JSONParser } from '@streamparser/json';

const chunkBytes = 64 * 1024;
const stringUnits = 8192;

function indentation(value) {
  if (types.isNumberObject(value)) value = Number(value);
  if (types.isStringObject(value)) value = String(value);
  if (typeof value === 'number') return ' '.repeat(Math.min(10, Math.max(0, Math.trunc(value) || 0)));
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function prepare(value, key) {
  if (value !== null && ['object', 'function', 'bigint'].includes(typeof value)) {
    const toJSON = value.toJSON;
    if (typeof toJSON === 'function') value = toJSON.call(value, key);
  }
  if (types.isNumberObject(value)) return Number(value);
  if (types.isStringObject(value)) return String(value);
  if (types.isBooleanObject(value)) return Boolean.prototype.valueOf.call(value);
  if (types.isBigIntObject(value)) return BigInt.prototype.valueOf.call(value);
  return value;
}

const omitted = value => value === undefined || typeof value === 'function' || typeof value === 'symbol';

function* quoted(value) {
  yield '"';
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + stringUnits, value.length);
    // Keep a surrogate pair together so native escaping sees both code units.
    if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff
      && value.charCodeAt(end) >= 0xdc00 && value.charCodeAt(end) <= 0xdfff) end--;
    yield JSON.stringify(value.slice(start, end)).slice(1, -1);
    start = end;
  }
  yield '"';
}

function* fragments(root, gap, transformString) {
  const ancestors = new Set();
  function* visit(value, depth) {
    if (value === null) { yield 'null'; return; }
    if (typeof value === 'string') {
      const transformed = transformString ? transformString(value) : value;
      if (typeof transformed !== 'string') throw new TypeError('transformString must return a string');
      yield* quoted(transformed); return;
    }
    if (typeof value === 'number') { yield Number.isFinite(value) ? String(value) : 'null'; return; }
    if (typeof value === 'boolean') { yield String(value); return; }
    if (typeof value === 'bigint') throw new TypeError('Do not know how to serialize a BigInt');
    if (ancestors.has(value)) throw new TypeError('Converting circular structure to JSON');
    ancestors.add(value);
    try {
      const array = Array.isArray(value), keys = array ? null : Object.keys(value);
      const length = array ? value.length : keys.length;
      const nextIndent = gap.repeat(depth + 1);
      yield array ? '[' : '{';
      let emitted = false;
      for (let index = 0; index < length; index++) {
        const key = array ? String(index) : keys[index];
        let child = prepare(value[key], key);
        if (omitted(child)) {
          if (!array) continue;
          child = null;
        }
        if (emitted) yield ',';
        if (gap) yield `\n${nextIndent}`;
        if (!array) { yield* quoted(key); yield gap ? ': ' : ':'; }
        yield* visit(child, depth + 1);
        emitted = true;
      }
      if (emitted && gap) yield `\n${gap.repeat(depth)}`;
      yield array ? ']' : '}';
    } finally { ancestors.delete(value); }
  }
  root = prepare(root, '');
  if (omitted(root)) throw new TypeError('JSON root is not serializable');
  yield* visit(root, 0);
  yield '\n';
}

/** Native JSON formatting without a report-sized string or cloned object graph. */
export function* jsonChunks(value, { indent = 2, transformString } = {}) {
  if (transformString !== undefined && typeof transformString !== 'function') throw new TypeError('transformString must be a function');
  let buffer = Buffer.allocUnsafe(chunkBytes), used = 0;
  for (const fragment of fragments(value, indentation(indent), transformString)) {
    const bytes = Buffer.from(fragment);
    for (let offset = 0; offset < bytes.length;) {
      const length = Math.min(bytes.length - offset, chunkBytes - used);
      bytes.copy(buffer, used, offset, offset + length);
      used += length; offset += length;
      if (used === chunkBytes) { yield buffer; buffer = Buffer.allocUnsafe(chunkBytes); used = 0; }
    }
  }
  if (used) yield buffer.subarray(0, used);
}

export function writeJsonSync(path, value, options) {
  const fd = openSync(path, 'w'), hash = createHash('sha256');
  let rawBytes = 0;
  try {
    for (const chunk of jsonChunks(value, options)) {
      for (let offset = 0; offset < chunk.length;) {
        const written = writeSync(fd, chunk, offset, chunk.length - offset);
        if (written === 0) throw new Error('JSON file write made no progress');
        offset += written;
      }
      hash.update(chunk); rawBytes += chunk.length;
    }
    return { rawSha256: hash.digest('hex'), rawBytes };
  } finally { closeSync(fd); }
}

/** Consume bounded byte chunks and require exactly one complete JSON root. */
export function parseJsonChunks(chunks) {
  const parser = new JSONParser({ stringBufferSize: chunkBytes, numberBufferSize: chunkBytes });
  const hash = createHash('sha256');
  let value, roots = 0, rawBytes = 0;
  parser.onValue = event => {
    if (event.stack.length === 0) { value = event.value; roots++; }
  };
  for (const chunk of chunks) {
    if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) throw new TypeError('JSON chunks must be byte buffers');
    // The parser accepts an optional BOM, whereas JSON.parse does not.
    if (rawBytes === 0 && chunk.length && chunk[0] >= 0x80) throw new SyntaxError('JSON must start with a value or whitespace');
    hash.update(chunk); rawBytes += chunk.length;
    parser.write(chunk);
  }
  if (!parser.isEnded) parser.end();
  if (roots !== 1 || !parser.isEnded) throw new SyntaxError('Expected exactly one complete JSON root');
  return { value, rawSha256: hash.digest('hex'), rawBytes };
}

export function readJsonSync(path) {
  const fd = openSync(path, 'r');
  function* chunks() {
    const buffer = Buffer.allocUnsafe(chunkBytes);
    for (;;) {
      const length = readSync(fd, buffer, 0, buffer.length, null);
      if (!length) return;
      yield buffer.subarray(0, length);
    }
  }
  try { return parseJsonChunks(chunks()).value; }
  finally { closeSync(fd); }
}
