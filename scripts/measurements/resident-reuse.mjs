import assert from 'node:assert/strict';

/** Correlate an edit with its publication, not a later no-change revalidation. */
export function measuredReuse(kind, inputId, settled, afterSequence) {
  assert.ok(Number.isSafeInteger(afterSequence) && afterSequence >= 0, 'Actual pre-cycle increment boundary required');
  const publications = settled?.contexts?.map(context => context.published)
    .filter(publication => publication?.fingerprints?.inputId === inputId) ?? [];
  assert.equal(publications.length, 1, 'One published context must identify the measured captured result');
  const publication = publications[0];
  const traces = settled?.instrumentation?.increments ?? [];
  const completed = traces.filter(trace => Number.isSafeInteger(trace.sequence) && trace.sequence > afterSequence
    && trace.execution === 'completed' && trace.inputId === inputId);
  const same = (left, right) => Array.isArray(left) && Array.isArray(right)
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  // An unchanged command revalidates an existing publication. For an edit the
  // publication preserves the invalidation result even when a watcher/CLI race
  // subsequently performs another analysis of the same captured bytes.
  const trace = kind === 'unchanged' ? completed.at(-1)
    : completed.find(value => same(value.reused, publication.reused));
  assert.ok(trace && Array.isArray(trace.reused), 'Real completed increment matching the measured publication is required');
  return trace.reused;
}
