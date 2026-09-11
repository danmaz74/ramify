import { expect, it } from 'vitest';
import { assertReviewedTransition, reusePolicy, reviewedSemanticFixes } from './evidence-reuse.js';
import type { EvidenceIdentity, SourceTransition } from './evidence-reuse.js';

it('requires the exact reviewed digests and unchanged production build/runtime', () => {
  const before: EvidenceIdentity = { revision: 'old', dirty: false, sourceSha256: 'before', buildSha256: 'build', packageVersion: '1', nodeVersion: 'v22', typescriptVersion: '7' };
  const after = { ...before, sourceSha256: 'after' };
  const proof: SourceTransition = { policy: reusePolicy, baselineRevision: 'a'.repeat(40), baselineSourceSha256: 'before', currentSourceSha256: 'after',
    changes: reviewedSemanticFixes };
  expect(() => assertReviewedTransition(proof, structuredClone(proof), before, after)).not.toThrow();
  expect(() => assertReviewedTransition(proof, { ...proof, changes: [{ ...proof.changes[0], afterSha256: 'c'.repeat(64) }] }, before, after)).toThrow('exact reviewed');
  const outside = { ...proof, changes: [...proof.changes, { ...proof.changes[0], path: 'src/batch.ts' }] };
  expect(() => assertReviewedTransition(outside, outside, before, after)).toThrow('outside reviewed');
  expect(() => assertReviewedTransition(proof, proof, before, { ...after, buildSha256: 'different' })).toThrow('Production build');
  expect(() => assertReviewedTransition(proof, proof, { ...before, sourceSha256: 'wrong-base' }, after)).toThrow('Baseline Git bytes');
  expect(() => assertReviewedTransition(proof, proof, before, { ...after, sourceSha256: 'future-edit' })).toThrow('current gate identity');
});
