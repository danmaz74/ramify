import { isDeepStrictEqual } from 'node:util';

/**
 * The `signature-inferred` notes each measurement fixture reports under Plan 8's
 * signature-companion rule, by original. A note belongs to an original that an
 * effective exposure makes visible in another module
 * (subs/analysis/src/companion-findings.ts). The reference example declares every
 * exposed signature (Plan 8 iteration 7) and has none. The measurement setup of
 * S100, S500 and S1000 exposes m001's literal-initialized `value` to parent, which
 * sets `inferred`. X100 annotates every exposed signature and has none.
 *
 * An edit that removes the setup's named exposure of `value` leaves every fixture
 * without a note: in S100, S500 and S1000 `value` is then exposed nowhere, and
 * X100's wildcard still exposes it with its annotated signature.
 */
const setupNotes = Object.freeze({
  reference: Object.freeze([]),
  ...Object.fromEntries(['S100', 'S500', 'S1000'].map(name => [name, Object.freeze(['signature-inferred:value'])])),
  X100: Object.freeze([]),
});

export const signatureNote = item => typeof item?.code === 'string' && item.code.startsWith('signature-');
export const noteKey = item => `${item.code}:${/^`([^`]+)`/.exec(item.message ?? '')?.[1] ?? ''}`;

/** The pinned note keys of `fixture`'s measurement state; an unknown fixture has none. */
export function fixtureSignatureNotes(fixture, { setupExposureRemoved = false } = {}) {
  return setupExposureRemoved ? [] : [...(setupNotes[fixture] ?? [])];
}

/** Signature notes equal `notes`, once each; every other coverage entry equals `expected`. */
export function coverageEquals(coverage, notes, expected = []) {
  if (!Array.isArray(coverage) || !Array.isArray(notes) || !Array.isArray(expected)) return false;
  const found = coverage.filter(signatureNote).map(noteKey).sort();
  return isDeepStrictEqual(coverage.filter(item => !signatureNote(item)), expected)
    && isDeepStrictEqual(found, [...notes].sort());
}
