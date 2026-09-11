import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { packageRoot, sha256 } from './common.mjs';
import { filesUnder } from './identities.mjs';
import { residentInputs, residentDependencies } from './resident-inputs.mjs';
import { residentWorkloads } from './resident-plan.mjs';
import { verifyResidentEvidence } from './verify-resident-evidence.mjs';

// These files only select/verify archived evidence. None is loaded by the
// measurement controller or worker. Executable measurement recipes stay exact.
const orchestration = new Set(['scripts/measurements/verify-resident-evidence.mjs',
  'scripts/measurements/resident-composition.mjs', 'scripts/measurements/resident-composition.test.mjs']);
const approvedTestChange = Object.freeze({
  path: 'subs/analysis/subs/model/src/tests/decision-lookups.test.ts',
  before: 'c99516810d993fb3822efb13ff143db3823c5d5461828df982c0091b5d7507de',
  after: '4d90d134c72d70e3dada340986f729b3eb2b5c7a5c747bff08437f271de7bf5f',
});
export function recipeChanges(before, after) {
  return [...new Set([...before, ...after].map(row => row.path))].sort().flatMap(path => {
    const old = before.find(row => row.path === path)?.sha256 ?? null;
    const current = after.find(row => row.path === path)?.sha256 ?? null;
    return old === current ? [] : [{ path, before: old, after: current }];
  });
}
export function sourceEntries() {
  return Object.fromEntries([['root', 'src'], ['owners', 'subs']].map(([key, directory]) =>
    [key, filesUnder(join(packageRoot, directory)).map(path => [relative(packageRoot, path), sha256(readFileSync(path))]) ]));
}
function tree(entries, prefix) {
  return { files: entries.length, sha256: sha256(JSON.stringify(entries.map(([path, hash]) => [path.slice(prefix.length + 1), hash]))) };
}
export function verifyCompatibleInputs(before, current, proof, entries = sourceEntries()) {
  assert.equal(proof.authorization, 'user-approved-blast-radius-reuse-2026-09-11');
  assert.ok(typeof proof.policyReference === 'string' && proof.policyReference.length > 0);
  for (const key of ['build', 'manifests', 'fixtureGenerator', 'reference']) {
    assert.deepEqual(before[key], current[key], `Measurement ${key} changed`);
  }
  const changes = recipeChanges(before.recipes, current.recipes);
  assert.deepEqual(proof.orchestrationChanges, changes, 'Exact orchestration hash changes must be recorded');
  assert.ok(changes.every(change => orchestration.has(change.path)), 'An executable measurement recipe changed');
  const sourceChanges = proof.sourceTestChanges;
  assert.ok(Array.isArray(sourceChanges));
  assert.equal(new Set(sourceChanges.map(change => change.path)).size, sourceChanges.length);
  for (const change of [...changes, ...sourceChanges]) {
    assert.ok(typeof proof.reasons?.[change.path] === 'string' && proof.reasons[change.path].trim().length >= 10,
      'Each exact input change needs a reviewed blast-radius explanation');
  }
  for (const change of sourceChanges) {
    assert.deepEqual(change, approvedTestChange, 'Only the exact reviewed test correction is approved for reuse');
  }
  for (const [key, prefix] of [['root', 'src'], ['owners', 'subs']]) {
    const selected = sourceChanges.filter(change => change.path.startsWith(prefix + '/'));
    if (!selected.length) { assert.deepEqual(before.source[key], current.source[key], 'Production source changed'); continue; }
    assert.deepEqual(tree(entries[key], prefix), current.source[key], 'Current source tree changed');
    for (const change of selected) assert.equal(entries[key].find(([path]) => path === change.path)?.[1], change.after, 'Test change does not match current bytes');
    const restored = entries[key].map(([path, hash]) => [path, selected.find(change => change.path === path)?.before ?? hash]);
    assert.deepEqual(tree(restored, prefix), before.source[key], 'Source changes exceed the exact reviewed test changes');
  }
}
export function readResidentArtifact(path, expected) {
  const bytes = readFileSync(path), raw = path.endsWith('.gz') ? gunzipSync(bytes) : bytes;
  const identity = { fileSha256: sha256(bytes), rawSha256: sha256(raw) };
  if (expected) {
    assert.equal(identity.fileSha256, expected.fileSha256, 'Measurement artifact bytes changed');
    assert.equal(identity.rawSha256, expected.rawSha256, 'Measurement raw bytes changed');
  }
  return { report: JSON.parse(raw), ...identity };
}
export function verifyCompositionArtifact(artifact, manifestPath, id, current = residentInputs(), dependencies = residentDependencies()) {
  assert.ok(artifact.workloadIds.includes(id));
  const path = resolve(dirname(manifestPath), artifact.path);
  const evidence = readResidentArtifact(path, artifact);
  verifyCompatibleInputs(evidence.report.inputs, current, artifact.compatibility);
  const result = verifyResidentEvidence(evidence.report, id, evidence.report.inputs, dependencies, true);
  assert.equal(result.passed, true, 'Raw workload predicates failed');
  return { ...result, provenance: { artifact: path, fileSha256: evidence.fileSha256, rawSha256: evidence.rawSha256,
    originalStatus: evidence.report.status, originalInterrupted: evidence.report.interrupted,
    compatibility: artifact.compatibility } };
}
export function verifyResidentComposition(manifest, manifestPath, id) {
  assert.equal(manifest.schemaVersion, 'ramify.resident-composition/1');
  assert.equal(manifest.policy, 'explicit-blast-radius-reuse-2026-09-11');
  const current = residentInputs(), dependencies = residentDependencies();
  assert.deepEqual(manifest.inputs, current, 'Composition must identify current inputs');
  assert.deepEqual(manifest.dependencies, dependencies);
  assert.deepEqual(manifest.artifacts.flatMap(artifact => artifact.workloadIds).sort(), residentWorkloads.map(row => row.id).sort(),
    'Composition must select every reviewed workload exactly once');
  if (id === undefined) {
    const results = residentWorkloads.map(row => verifyCompositionArtifact(
      manifest.artifacts.find(artifact => artifact.workloadIds.includes(row.id)), manifestPath, row.id, current, dependencies));
    return { passed: results.every(row => row.passed), workloads: results };
  }
  const artifact = manifest.artifacts.find(value => value.workloadIds.includes(id));
  assert.ok(artifact, 'Missing composed workload');
  return { ...verifyCompositionArtifact(artifact, manifestPath, id, current, dependencies),
    composition: { path: manifestPath, policy: manifest.policy, createdAt: manifest.createdAt } };
}
