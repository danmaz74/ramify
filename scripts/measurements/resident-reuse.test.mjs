import assert from 'node:assert/strict';
import test from 'node:test';
import { measuredReuse } from './resident-reuse.mjs';

const all = ['parse', 'configuration', 'metadata', 'catalog', 'link', 'access', 'decide'];
const source = ['parse', 'configuration', 'metadata'];
function observation(traces, published = source) {
  return { contexts: [{ published: { fingerprints: { inputId: 'edited' }, reused: published } }],
    instrumentation: { increments: traces.map(([sequence, reused, inputId = 'edited']) =>
      ({ sequence, reused, inputId, execution: 'completed' })) } };
}
test('edit retains its publication reuse when same-input revalidation follows it', () => {
  const settled = observation([[10, source], [11, source], [12, all]]);
  assert.deepEqual(measuredReuse('source', 'edited', settled, 10), source);
});
test('unchanged command uses its new revalidation, not retained publication reuse', () => {
  assert.deepEqual(measuredReuse('unchanged', 'edited', observation([[10, source], [11, all]]), 10), all);
});
test('publication reuse alone cannot replace a missing matching completed trace', () => {
  assert.throws(() => measuredReuse('source', 'edited', observation([[10, source], [11, all]]), 10), /Real completed increment/);
});
test('earlier same-input cycles and other captures cannot supply current proof', () => {
  assert.throws(() => measuredReuse('source', 'edited', observation([[9, source], [11, source, 'other']]), 10), /Real completed increment/);
  assert.throws(() => measuredReuse('unchanged', 'edited', observation([[9, all]]), 10), /Real completed increment/);
});
