import test from 'node:test';
import assert from 'node:assert/strict';
import { arch, platform } from 'node:os';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from './common.mjs';
import { verifyCompatibleInputs, recipeChanges, readResidentArtifact } from './resident-composition.mjs';
import { verifyResidentEvidence } from './verify-resident-evidence.mjs';
import { residentBudgets, residentWorkloads } from './resident-plan.mjs';
const hash = text => sha256(Buffer.from(text));
const identity = entries => ({ files: entries.length, sha256: hash(JSON.stringify(entries)) });
function inputsFixture() {
  const oldTest = 'c99516810d993fb3822efb13ff143db3823c5d5461828df982c0091b5d7507de', newTest = '4d90d134c72d70e3dada340986f729b3eb2b5c7a5c747bff08437f271de7bf5f', production = hash('production');
  const entries = { root: [['src/main.ts', production]], owners: [['subs/analysis/subs/model/src/decisions.ts', production], ['subs/analysis/subs/model/src/tests/decision-lookups.test.ts', newTest]] };
  const current = { build: { files: 1, sha256: production }, source: {
    root: identity([['main.ts', production]]), owners: identity([['analysis/subs/model/src/decisions.ts', production], ['analysis/subs/model/src/tests/decision-lookups.test.ts', newTest]]) },
    manifests: [{ path: 'scope.md', sha256: hash('scope') }], fixtureGenerator: hash('fixture'), reference: hash('reference'),
    recipes: [{ path: 'scripts/measurements/resident-worker.mjs', sha256: hash('worker') },
      { path: 'scripts/measurements/verify-resident-evidence.mjs', sha256: hash('new verifier') }] };
  const before = structuredClone(current);
  before.source.owners = identity([['analysis/subs/model/src/decisions.ts', production], ['analysis/subs/model/src/tests/decision-lookups.test.ts', oldTest]]);
  before.recipes[1].sha256 = hash('old verifier');
  const proof = { authorization: 'user-approved-blast-radius-reuse-2026-09-11', policyReference: 'test-policy',
    reasons: { 'subs/analysis/subs/model/src/tests/decision-lookups.test.ts': 'Only a test changes; production build is byte-identical.',
      'scripts/measurements/verify-resident-evidence.mjs': 'Archive consumer only; not loaded by measured worker.' },
    sourceTestChanges: [{ path: 'subs/analysis/subs/model/src/tests/decision-lookups.test.ts', before: oldTest, after: newTest }],
    orchestrationChanges: recipeChanges(before.recipes, current.recipes) };
  return { before, current, proof, entries };
}
test('exact test-only and verifier hash changes preserve the same executable inputs', () => {
  const f = inputsFixture();
  assert.doesNotThrow(() => verifyCompatibleInputs(f.before, f.current, f.proof, f.entries));
});
test('production, build, fixture, scope and executable recipe drift cannot be excused', () => {
  for (const field of ['build', 'fixtureGenerator', 'reference', 'manifests']) {
    const f = inputsFixture(); f.current[field] = 'changed';
    assert.throws(() => verifyCompatibleInputs(f.before, f.current, f.proof, f.entries));
  }
  const f = inputsFixture(); f.current.recipes[0].sha256 = hash('changed worker');
  f.proof.orchestrationChanges = recipeChanges(f.before.recipes, f.current.recipes);
  assert.throws(() => verifyCompatibleInputs(f.before, f.current, f.proof, f.entries), /executable measurement recipe/);
  const g = inputsFixture(); g.entries.owners[0][1] = hash('changed production');
  g.current.source.owners = identity(g.entries.owners.map(([path, digest]) => [path.slice(5), digest]));
  assert.throws(() => verifyCompatibleInputs(g.before, g.current, g.proof, g.entries), /exceed the exact/);
});
test('test migration must account for the exact historical and current file bytes', () => {
  const f = inputsFixture(); f.proof.sourceTestChanges[0].before = hash('invented old test');
  assert.throws(() => verifyCompatibleInputs(f.before, f.current, f.proof, f.entries), /exact reviewed test/);
  const g = inputsFixture(); g.proof.sourceTestChanges[0].after = hash('invented new test');
  assert.throws(() => verifyCompatibleInputs(g.before, g.current, g.proof, g.entries), /exact reviewed test/);
});
function reportFixture() {
  const sample = { processes: [{ pid: 1, rssBytes: 100 }], combinedRssBytes: 100 };
  const measurements = Object.fromEntries(['client', 'cliReference', 'cliS100', 'help'].map(key => [key, { pid: 1, rssBytes: 100, samples: [sample] }]));
  for (const key of ['daemonEmpty', 'daemonReference']) measurements[key] = { rssBytes: 100,
    settled: { pid: 1, instrumentation: { pid: 1 }, memory: { rss: 100, heapUsed: 50, external: 5 } } };
  const at = '2026-09-11T00:00:00.000Z';
  return { schemaVersion: 'ramify.resident-measurements/1', evidenceKind: 'measurement', inputs: {}, dependencies: {},
    environment: { node: process.version, platform: platform(), arch: arch() }, budgets: residentBudgets,
    sampling: { intervalMs: 50 }, measuredAt: at, completedAt: at, status: 'incomplete', interrupted: true,
    failures: ['Error: Resident measurements interrupted\n    at controller'],
    workloads: residentWorkloads.map(row => ({ id: row.id, status: 'measured', passed: true, interrupted: false, failures: [],
      startedAt: at, completedAt: at, measurements, controllerObservation: { code: 0, failure: null, signal: null,
        postExitObservedProcesses: 0, processes: [1], samples: [sample] } })) };
}
test('completed clean rows of an interrupted report may count without relabeling the report', () => {
  const report = reportFixture(); const before = JSON.stringify(report);
  assert.equal(verifyResidentEvidence(report, 'I2-29:entry-footprints', {}, {}, true).passed, true);
  assert.equal(JSON.stringify(report), before);
  assert.throws(() => verifyResidentEvidence(report, 'I2-29:entry-footprints', {}, {}));
});
test('failed, interrupted, leaking, incomplete and raw-invalid rows cannot count', () => {
  const mutations = [row => { row.passed = false; }, row => { row.interrupted = true; },
    row => { row.status = 'not-executed'; }, row => { row.controllerObservation.postExitObservedProcesses = 1; },
    row => { row.controllerObservation.signal = 'SIGKILL'; }, row => { row.controllerObservation.code = 1; },
    row => { row.completedAt = 'invalid'; }, row => { row.failures = ['failure']; }];
  for (const mutate of mutations) {
    const report = reportFixture(); mutate(report.workloads[0]);
    assert.throws(() => verifyResidentEvidence(report, 'I2-29:entry-footprints', {}, {}, true));
  }
  const report = reportFixture(); delete report.workloads[0].measurements.client;
  assert.equal(verifyResidentEvidence(report, 'I2-29:entry-footprints', {}, {}, true).passed, false);
});
test('input drift, dependency and platform changes are not benign interruptions', () => {
  for (const mutate of [r => { r.failures = ['Source, build, scope, fixture or recipe changed']; },
    r => { r.dependencies = { typescript: 'changed' }; }, r => { r.environment.platform = 'other'; }]) {
    const report = reportFixture(); mutate(report);
    assert.throws(() => verifyResidentEvidence(report, 'I2-29:entry-footprints', {}, {}, true));
  }
});
test('artifact provenance detects raw byte tampering', () => {
  const directory = mkdtempSync(join(tmpdir(), 'resident-composition-test-'));
  try {
    const path = join(directory, 'raw.json'); writeFileSync(path, JSON.stringify(reportFixture()));
    const evidence = readResidentArtifact(path);
    writeFileSync(path, JSON.stringify({ ...evidence.report, passed: true }));
    assert.throws(() => readResidentArtifact(path, evidence), /artifact bytes changed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
