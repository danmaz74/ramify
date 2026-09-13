import assert from 'node:assert/strict';

/** Correlate a context publication with an actual retained worker reply. */
export function measuredPath(kind, inputId, settled, afterSequence, beforeRevision) {
  assert.ok(Number.isSafeInteger(afterSequence) && afterSequence >= 0, 'Actual pre-cycle worker boundary required');
  const publications = settled?.contexts?.map(context => context.published)
    .filter(publication => publication?.fingerprints?.inputId === inputId) ?? [];
  assert.equal(publications.length, 1, 'One published context must identify the measured captured result');
  const publication = publications[0];
  assert.ok(['cold', 'unchanged-surface', 'source', 'description', 'metadata', 'membership', 'broad'].includes(publication.checked?.path),
    'Actual revision checked path required');
  const completed = (settled?.instrumentation?.workerMessages ?? []).filter(trace =>
    Number.isSafeInteger(trace.sequence) && trace.sequence > afterSequence && trace.kind === 'reply'
    && trace.execution === 'completed' && trace.inputId === inputId);
  if (kind === 'unchanged') {
    assert.equal(typeof beforeRevision, 'string', 'Actual pre-cycle context revision required');
    assert.equal(publication.revision, beforeRevision, 'Unchanged command must preserve the context revision');
    assert.ok(completed.some(trace => trace.operation === 'report'), 'Real completed report reply is required');
  } else {
    assert.ok(completed.some(trace => trace.revision
      && trace.revision.checked.path === publication.checked.path
      && trace.revision.checked.fileCount === publication.checked.files.length
      && trace.revision.checked.accesses === publication.checked.accesses
      && trace.revision.checked.modelRebuilt === publication.checked.modelRebuilt
      && JSON.stringify(trace.revision.timings) === JSON.stringify(publication.timings)),
    'Real completed worker revision matching the measured publication is required');
  }
  return publication.checked.path;
}
