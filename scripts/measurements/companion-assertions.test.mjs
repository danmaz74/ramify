import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageMatches, enforcesCompanions, expectedSignatureNotes, revisionTimingsValid } from './fast-assertions.mjs';

const nine = { classify: 1, inventory: 1, compiler: 1, descriptions: 1, accesses: 1, link: 1, decide: 1, publish: 1, total: 9 };
const ten = { ...nine, companions: 0.5 };
const note = original => ({ id: `companion-limit/1:${original}`, code: 'signature-inferred',
  location: { file: 'src/a.ts', start: 0, end: 1, line: 1, column: 1 },
  message: `\`${original}\` is exposed and its declared signature leaves a type to inference; the companions of an inferred type are not verified`,
  related: [] });

test('revision timings: nine stages before Plan 8, and exactly one companions field after it', () => {
  assert.equal(revisionTimingsValid(nine), true);
  assert.equal(revisionTimingsValid(ten), true);
  assert.equal(enforcesCompanions(nine), false);
  assert.equal(enforcesCompanions(ten), true);
  const { decide, ...missing } = ten;
  assert.equal(revisionTimingsValid(missing), false, 'a missing stage fails');
  assert.equal(revisionTimingsValid({ ...ten, extra: 1 }), false, 'an unknown field fails');
  assert.equal(revisionTimingsValid({ ...ten, companions: -1 }), false, 'a negative timing fails');
  assert.equal(revisionTimingsValid({ ...nine, total: Number.NaN }), false, 'a non-finite timing fails');
});

test('coverage: the reference declares every exposed signature and pins no inferred note', () => {
  assert.deepEqual(expectedSignatureNotes('reference', ten), []);
  assert.equal(coverageMatches('reference', ten, [], []), true);
  assert.equal(coverageMatches('reference', ten, [note('assembleRouter')], []), false, 'an unexpected note fails');
  assert.equal(coverageMatches('reference', nine, [], []), true, 'a pre-plan build reports none');
  assert.equal(coverageMatches('reference', nine, [note('assembleRouter')], []), false);
  assert.equal(coverageMatches('X100', ten, [], []), true, 'the exposing fixture annotates every exposed signature');
  assert.equal(coverageMatches('X100', ten, [note('run0')], []), false);
});

test('coverage: other entries still equal their independent expectation beside signature notes', () => {
  const unresolved = { id: 'access-limit/1:x', code: 'unresolved-target', location: { file: 'src/assembly.ts', start: 7, end: 38, line: 1, column: 8 },
    message: 'Cannot establish the accessed source or resource target', related: [] };
  assert.equal(coverageMatches('S100', ten, [unresolved, note('value')], [unresolved]), true);
  assert.equal(coverageMatches('S100', ten, [note('value')], [unresolved]), false, 'a missing expected entry fails');
  assert.equal(coverageMatches('S100', nine, [unresolved], [unresolved]), true);
});

test('coverage: the S fixtures pin the one inferred note of their exposed literal constant', () => {
  for (const name of ['S100', 'S500', 'S1000']) {
    assert.deepEqual(expectedSignatureNotes(name, ten), ['signature-inferred:value']);
    assert.equal(coverageMatches(name, ten, [note('value')], []), true);
    assert.equal(coverageMatches(name, ten, [], []), false, 'a missing note fails');
    assert.equal(coverageMatches(name, ten, [note('value'), note('value')], []), false, 'a duplicate note fails');
    assert.equal(coverageMatches(name, ten, [note('value'), note('unexpected')], []), false, 'an unexpected note fails');
    assert.equal(coverageMatches(name, nine, [], []), true, 'a pre-plan build reports none');
  }
});

test('coverage: removing the setup exposure of `value` leaves every fixture without a note', () => {
  const removed = { setupExposureRemoved: true };
  for (const name of ['reference', 'S100', 'S500', 'S1000', 'X100']) {
    assert.deepEqual(expectedSignatureNotes(name, ten, removed), []);
    assert.equal(coverageMatches(name, ten, [], [], removed), true);
    assert.equal(coverageMatches(name, ten, [note('value')], [], removed), false, 'an unexposed value has no note');
  }
});
