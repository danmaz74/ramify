import assert from 'node:assert/strict';
import test from 'node:test';
import { measuredRevisionArrays } from './fast-clone.mjs';

test('fixture-only probe records twenty real roundtrips per array and releases its thread', async () => {
  const arrays = { inputId: 'test-fixture-only', sequence: 1,
    inputs: [{ path: 'src/example.ts', role: 'source', sha256: 'fixture' }], diagnostics: [] };
  const before = structuredClone(arrays);
  const result = await measuredRevisionArrays(arrays);
  assert.equal(result.passed, true, JSON.stringify(result.failures));
  assert.deepEqual(arrays, before);
  assert.equal(result.cleanup.exited, true); assert.equal(result.cleanup.terminationRequested, true);
  assert.ok(result.cleanup.threadId > 0);
  for (const name of ['inputs', 'diagnostics']) {
    const measured = result.arrays[name];
    assert.equal(measured.count, arrays[name].length);
    assert.equal(measured.jsonBytes, Buffer.byteLength(JSON.stringify(arrays[name])));
    assert.equal(measured.samples.length, 20);
    assert.ok(measured.samples.every((sample, index) => sample.cycle === index + 1
      && Number.isFinite(sample.roundTripMs) && sample.roundTripMs >= 0
      && sample.echoCount === measured.count && sample.echoSha256 === measured.sha256));
    assert.equal(measured.maxMs, Math.max(...measured.samples.map(sample => sample.roundTripMs)));
  }
});
test('missing production-shaped arrays and unknown revision identity are rejected', async () => {
  await assert.rejects(measuredRevisionArrays({ inputId: 'fixture', sequence: 1, inputs: [] }), /Actual diagnostics array/);
  await assert.rejects(measuredRevisionArrays({ inputId: 'fixture', sequence: 0, inputs: [], diagnostics: [] }), /revision sequence/);
});
test('a production count limit failure retains sizes without inventing measured timings', async () => {
  const result = await measuredRevisionArrays({ inputId: 'oversized-test-fixture-only', sequence: 1,
    inputs: [], diagnostics: Array(100_001).fill(null) });
  assert.equal(result.passed, false); assert.equal(result.status, 'failed');
  assert.equal(result.arrays.diagnostics.count, 100_001);
  assert.ok(result.arrays.diagnostics.jsonBytes > 0);
  assert.equal(result.arrays.diagnostics.maxMs, null); assert.equal(result.arrays.diagnostics.samples.length, 0);
  assert.equal(result.cleanup.threadId, null); assert.equal(result.cleanup.exited, false);
  assert.equal(result.cleanup.terminationRequested, false);
  assert.match(result.failures.join('\n'), /production maxDiagnostics/);
});
