import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { affectedPlan1Ids, assertPlan1Composition, focusedPlan1Ids, reviewedPlan1Baselines, readPlan1Composition } from './completion-composition.js';
import type { FocusedPlan1Evidence, Plan1Composition } from './completion-composition.js';
import type { Plan1GateArtifact } from './completion-regression.js';
import { reusePolicy, reviewedSemanticFixes } from './evidence-reuse.js';
import type { SourceTransition } from './evidence-reuse.js';
import { repositoryRoot } from './plan.js';

it('composes only the reviewed repaired cases while preserving all original evidence', async () => {
  // Isolated schema controls, never installed as real acceptance evidence.
  const archived = JSON.parse(gunzipSync(await readFile(join(repositoryRoot, 'scripts/reference-harness/evidence/plan1-complete.json.gz'))).toString('utf8')) as Plan1GateArtifact;
  const before = { ...archived.evidence.identity, sourceSha256: 'before', buildSha256: 'same-build' };
  const current = { ...before, sourceSha256: 'current' };
  const owners = ['ramify', 'ramify/analysis', 'ramify/analysis/descriptions', 'ramify/analysis/model', 'ramify/analysis/project',
    'ramify/analysis/typescript', 'ramify/cli', 'ramify/daemon', 'ramify/daemon/contexts', 'ramify/presentation', 'ramify/presentation/layout'];
  const passed = archived.instances.map(item => ({ ...item,
    baselineAssertions: item.baselineAssertions.map(a => ({ ...a, name: a.name.replace('exact nine implemented owners', 'exact eleven implemented owners')
      .replace('all seven actual package entry imports executed', 'all eight actual package entry imports executed') })),
    assertions: item.assertions.map(a => ({ ...a, name: a.name.replace('exact nine implemented owners', 'exact eleven implemented owners')
      .replace('all seven actual package entry imports executed', 'all eight actual package entry imports executed') })),
    observations: item.observations?.map(o => o.kind === 'toolkit-scope' ? { ...o, data: { ...o.data as object, owners } }
      : o.kind === 'relocation-installed-entries' ? { ...o, data: [...o.data as unknown[], { entry: 'ramify.ts/client', callable: 'connectDaemon' }] } : o),
  }));
  const baseline: Plan1GateArtifact = { ...archived, passed: false, planComplete: false,
    evidence: { ...archived.evidence, identity: before }, summary: { required: 308, passed: 300, failed: 8, notExecuted: 0 },
    instances: passed.map(item => (affectedPlan1Ids as readonly string[]).includes(item.id) ? { ...item, status: 'failed', reason: 'assertion-failed', error: 'original failure' } : item) };
  const focused: FocusedPlan1Evidence = { kind: 'plan1-focused-evidence', identity: current, platform: process.platform,
    startedAt: '2026-09-11T00:00:00Z', completedAt: '2026-09-11T00:00:01Z', durationMs: 1000,
    cleanup: { stop: { code: 0, stderr: '' }, status: { code: 0, stdout: '{\"running\":false}', stderr: '' } },
    selectedIds: focusedPlan1Ids, report: { ...archived, planComplete: false, instances: passed.filter(item => focusedPlan1Ids.includes(item.id)),
      summary: { required: 9, passed: 9, failed: 0, notExecuted: 0 } } };
  const proof: SourceTransition = { policy: reusePolicy, baselineRevision: 'a'.repeat(40), baselineSourceSha256: 'before', currentSourceSha256: 'current',
    changes: reviewedSemanticFixes };
  const ref = { file: 'fixture-only.json', sha256: reviewedPlan1Baselines.find(item => item.platform === process.platform)!.sha256 };
  const receipt: Plan1Composition = { schemaVersion: 1, kind: 'plan1-composed-evidence', policy: reusePolicy, identity: current,
    platform: process.platform, baseline: ref, rerun: ref, reviewedTransition: ref, summary: { required: 308, passed: 308, failed: 0, notExecuted: 0 },
    sources: passed.map(item => ({ id: item.id, from: focusedPlan1Ids.includes(item.id) ? 'focused-rerun' : 'baseline' })), limitation: 'schema fixture only' };
  const original = JSON.stringify(baseline);
  expect(() => assertPlan1Composition({ ...receipt, baseline: { ...ref, sha256: '0'.repeat(64) } }, baseline, focused, proof, proof, current, archived.evidence.instances)).toThrow('platform provenance');
  const check = (b = baseline, f = focused, r = receipt, p = proof) => assertPlan1Composition(r, b, f, p, proof, current, archived.evidence.instances);
  check(); expect(JSON.stringify(baseline)).toBe(original);
  const directory = await mkdtemp('/tmp/plan1-composition-tamper-');
  try {
    await writeFile(join(directory, 'plan1-composed-tampered.json'), JSON.stringify(receipt));
    await writeFile(join(directory, ref.file), '{}');
    await expect(readPlan1Composition(directory, 'plan1-composed-tampered.json', current, archived.evidence.instances)).rejects.toThrow('hash differs');
  } finally { await rm(directory, { recursive: true, force: true }); }
  expect(() => check(baseline, { ...focused, report: { ...focused.report, instances: focused.report.instances.slice(1) } })).toThrow();
  expect(() => check(baseline, { ...focused, report: { ...focused.report, instances: [focused.report.instances[1], ...focused.report.instances.slice(1)] } })).toThrow();
  expect(() => check(baseline, { ...focused, identity: { ...current, sourceSha256: 'stale' } })).toThrow('Focused evidence');
  expect(() => check(baseline, { ...focused, platform: 'other' })).toThrow('platform');
  expect(() => check({ ...baseline, instances: baseline.instances.map((item, i) => i ? item : { ...item, status: 'failed' }) })).toThrow('eight-case');
  expect(() => check(baseline, { ...focused, cleanup: { ...focused.cleanup, stop: { code: 1, stderr: '' } } })).toThrow('stop failed');
  expect(() => check(baseline, { ...focused, cleanup: { ...focused.cleanup, status: { code: 0, stdout: '{"running":true}', stderr: '' } } })).toThrow('survived');
  expect(() => check(baseline, { ...focused, startedAt: 'missing' })).toThrow('timing evidence');
  const intermediate = { ...focused, identity: { ...current, sourceSha256: 'intermediate' } };
  const migration: SourceTransition = { ...proof, baselineSourceSha256: 'intermediate', changes: [
    { path: 'scripts/reference-harness/completion-composition.ts', beforeSha256: 'a'.repeat(64), afterSha256: 'b'.repeat(64) },
    { path: 'scripts/reference-harness/completion-composition.test.ts', beforeSha256: 'c'.repeat(64), afterSha256: 'd'.repeat(64) },
  ] };
  const migratedReceipt = { ...receipt, focusedTransition: ref };
  expect(() => assertPlan1Composition(migratedReceipt, baseline, intermediate, proof, proof, current, archived.evidence.instances,
    { reviewed: migration, actual: migration })).not.toThrow();
  const broad = { ...migration, changes: [...migration.changes, { ...migration.changes[0], path: 'scripts/reference-harness/session-cases.ts' }] };
  expect(() => assertPlan1Composition(migratedReceipt, baseline, intermediate, proof, proof, current, archived.evidence.instances,
    { reviewed: broad, actual: broad })).toThrow('exceeds cleanup');
  expect(() => assertPlan1Composition(migratedReceipt, baseline, intermediate, proof, proof, current, archived.evidence.instances,
    { reviewed: migration, actual: { ...migration, baselineSourceSha256: 'wrong' } })).toThrow('reviewed digests');
  const invalidPass = { ...baseline, instances: baseline.instances.map((item, i) => i ? item : { ...item, assertions: [{ name: 'tampered', status: 'failed' as const }] }) };
  expect(() => check(invalidPass)).toThrow();
  expect(() => check(baseline, focused, { ...receipt, sources: receipt.sources.slice(1) })).toThrow();
  expect(() => check(baseline, focused, receipt, { ...proof, changes: [{ ...proof.changes[0], afterSha256: 'c'.repeat(64) }] })).toThrow('exact reviewed');
});
