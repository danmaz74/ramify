import assert from 'node:assert/strict';
import test from 'node:test';
import { measuredPath } from './resident-reuse.mjs';

function observation(traces, path = 'source') {
  const checked = { path, files: ['src/entry.ts'], accesses: 1, modelRebuilt: false }, timings = { total: 10 };
  return { contexts: [{ published: { revision: 'rev/2', fingerprints: { inputId: 'edited' }, checked, timings } }],
    instrumentation: { workerMessages: traces.map(([sequence, tracePath, inputId = 'edited']) =>
      ({ sequence, operation: tracePath ? 'update' : 'report', kind: 'reply', inputId, execution: 'completed',
        revision: tracePath ? { checked: { path: tracePath, fileCount: checked.files.length,
          accesses: checked.accesses, modelRebuilt: checked.modelRebuilt }, timings } : null })) } };
}
test('edit keeps its publication path when same-input report projection follows it', () => {
  assert.equal(measuredPath('source', 'edited', observation([[10, 'source'], [11, 'source'], [12, null]]), 10), 'source');
});
test('unchanged command proves report projection and preserves the prior revision', () => {
  assert.equal(measuredPath('unchanged', 'edited', observation([[11, null]], 'cold'), 10, 'rev/2'), 'cold');
  assert.throws(() => measuredPath('unchanged', 'edited', observation([[11, null]]), 10, 'rev/1'), /preserve the context revision/);
});
test('publication path alone cannot replace a matching completed worker reply', () => {
  assert.throws(() => measuredPath('source', 'edited', observation([[10, 'source'], [11, null]]), 10), /Real completed worker revision/);
  assert.throws(() => measuredPath('source', 'edited', observation([[11, 'metadata']]), 10), /Real completed worker revision/);
});
test('earlier same-input cycles and unrelated captures cannot supply current proof', () => {
  assert.throws(() => measuredPath('source', 'edited', observation([[9, 'source'], [11, 'source', 'other']]), 10), /Real completed worker revision/);
  assert.throws(() => measuredPath('unchanged', 'edited', observation([[9, null]]), 10, 'rev/2'), /Real completed report reply/);
});
