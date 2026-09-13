import assert from 'node:assert/strict';
import { constants } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { jsonChunks, parseJsonChunks, readJsonSync, writeJsonSync } from './json-stream.mjs';

const collect = (value, options) => Buffer.concat([...jsonChunks(value, options)]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function sample() {
  const callable = () => {};
  callable.toJSON = key => `callable:${key}`;
  return { boolean: true, empty: {}, array: [null, undefined, () => {}, Symbol('omitted'), , false],
    numbers: [0, -0, 1.2, 1e30, NaN, Infinity, -Infinity],
    omitted: undefined, function: () => {}, symbol: Symbol('omitted'),
    escaped: 'line\n\t"\\\r\u0000', unicode: 'α😀漢字\ud800\udfff\u2028\u2029',
    nested: { '10': 'ten', '2': 'two', z: [[], {}, ''] },
    date: new Date('2026-09-12T00:00:00.000Z'), callable,
    boxed: [new Number(3), new String('boxed'), new Boolean(false), Object(Symbol('boxed'))],
    custom: { toJSON(key) { return { receivedKey: key, values: [1, 2] }; } },
  };
}

test('bounded serialization matches native bytes, spacing, omissions and toJSON', () => {
  for (const indent of [undefined, null, 0, 2, 4, 100, 1.9, -4, NaN, Infinity, -Infinity, '\t', '012345678901234', new Number(3), new String(' ')]) {
    const value = sample(), effective = indent === undefined ? 2 : indent;
    const bytes = collect(value, { indent });
    assert.deepEqual(bytes, Buffer.from(`${JSON.stringify(value, null, effective)}\n`));
  }
  for (const value of [null, true, false, 3, 'root', [], {}, { toJSON: () => 'replacement' }]) {
    const bytes = collect(value);
    const result = parseJsonChunks([bytes]);
    assert.deepEqual(result, { value: JSON.parse(bytes.toString()), rawBytes: bytes.length, rawSha256: digest(bytes) });
  }
});

test('Unicode and escapes survive both serializer slices and one-byte parser chunks', () => {
  const value = { ['k'.repeat(8191) + '😀']: [
    'a'.repeat(8191) + '😀' + '\n"\\\ud800' + 'z'.repeat(8190) + '\udfff',
    '😀漢字α'.repeat(15000), '\u0000'.repeat(24000),
  ] };
  const chunks = [...jsonChunks(value)];
  assert.ok(chunks.length > 1 && chunks.every(chunk => Buffer.isBuffer(chunk) && chunk.length <= 64 * 1024));
  const bytes = Buffer.concat(chunks);
  assert.deepEqual(bytes, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
  function* singleBytes() { for (let offset = 0; offset < bytes.length; offset++) yield bytes.subarray(offset, offset + 1); }
  assert.deepEqual(parseJsonChunks(singleBytes()).value, value);
  assert.deepEqual(parseJsonChunks(chunks).value, value);
});

test('string transformation affects values once without changing keys or the source graph', () => {
  const shared = { path: '/temporary/run/file.ts' };
  const value = { '/temporary/run/key': shared, nested: [shared, '/temporary/run/other'],
    custom: { toJSON() { return '/temporary/run/from-toJSON'; } } };
  const seen = [];
  const bytes = collect(value, { transformString: text => {
    seen.push(text); return text.replaceAll('/temporary/run/', '<fixture>/');
  } });
  assert.deepEqual(parseJsonChunks([bytes]).value, { '/temporary/run/key': { path: '<fixture>/file.ts' },
    nested: [{ path: '<fixture>/file.ts' }, '<fixture>/other'], custom: '<fixture>/from-toJSON' });
  assert.equal(shared.path, '/temporary/run/file.ts');
  assert.equal(value['/temporary/run/key'], value.nested[0]);
  assert.deepEqual(seen, ['/temporary/run/file.ts', '/temporary/run/file.ts', '/temporary/run/other', '/temporary/run/from-toJSON']);
  assert.throws(() => collect(value, { transformString: () => null }), /return a string/);
});

test('cycles and unsupported root values fail while repeated references are serializable', () => {
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => collect(cyclic), /circular/);
  for (const value of [1n, { bigint: 1n }, Object(1n)]) assert.throws(() => collect(value), /BigInt/);
  for (const value of [undefined, () => {}, Symbol('root')]) assert.throws(() => collect(value), /root is not serializable/);
  const shared = { x: 1 };
  assert.deepEqual(collect([shared, shared]), Buffer.from(`${JSON.stringify([shared, shared], null, 2)}\n`));
});

test('parser requires exactly one valid complete root and rejects trailing data', () => {
  for (const text of ['', ' ', '{', '[1', '"unfinished', 'tru', '[1,]', '{"a":}',
    '{"a":1} {"b":2}', 'null true', '1 2', '01', '{}garbage', '\ufeff{}']) {
    assert.throws(() => parseJsonChunks([Buffer.from(text)]), undefined, JSON.stringify(text));
  }
  assert.throws(() => parseJsonChunks([Buffer.from('{}'), Buffer.from('\nnull')]), /./);
  assert.throws(() => parseJsonChunks(['{}']), /byte buffers/);
  assert.deepEqual(parseJsonChunks([Buffer.from('{}'), Buffer.from('\n \t')]).value, {});
  const prototypeKey = '{"__proto__":{"value":1},"constructor":"own"}';
  assert.deepEqual(parseJsonChunks([Buffer.from(prototypeKey)]).value, JSON.parse(prototypeKey));
  for (const text of ['0', '-1.25e3', 'null', 'true', 'false', '"done"', ' {"x":1}\n\t ']) {
    assert.deepEqual(parseJsonChunks([Buffer.from(text)]).value, JSON.parse(text));
  }
});

test('file APIs preserve full byte counts and SHA-256 including the final newline', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ramify-json-stream-control-'));
  try {
    const path = join(directory, 'report.json'), value = sample();
    const result = writeJsonSync(path, value);
    const bytes = readFileSync(path);
    assert.deepEqual(result, { rawBytes: bytes.length, rawSha256: digest(bytes) });
    assert.equal(bytes.at(-1), 10);
    assert.deepEqual(readJsonSync(path), JSON.parse(JSON.stringify(value)));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('a report larger than Node MAX_STRING_LENGTH writes and parses without truncation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ramify-json-stream-large-control-'));
  try {
    const payload = 'x'.repeat(1024 * 1024);
    const count = Math.floor(constants.MAX_STRING_LENGTH / payload.length) + 1;
    const value = { samples: Array(count).fill(payload), final: 'complete' };
    assert.throws(() => JSON.stringify(value, null, 2), { name: 'RangeError' });
    const path = join(directory, 'large.json'), written = writeJsonSync(path, value);
    assert.ok(written.rawBytes > constants.MAX_STRING_LENGTH);
    assert.equal(statSync(path).size, written.rawBytes);
    const parsed = readJsonSync(path);
    assert.equal(parsed.samples.length, count);
    assert.equal(parsed.final, 'complete');
    for (const text of parsed.samples) assert.equal(text, payload);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
