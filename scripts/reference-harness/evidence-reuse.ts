import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { repositoryRoot } from './plan.js';
import { executionIdentity } from './artifact.js';

export type EvidenceIdentity = Awaited<ReturnType<typeof executionIdentity>>;
export const reusePolicy = '2026-09-11-reviewed-test-harness-remediation';
/** An exact digest review is also required: these paths are not permission to
 * reuse evidence after arbitrary future edits to the same file. */
export const reviewedReusePaths = new Set([
  'scripts/reference-harness/linking-expectations.ts',
  'subs/analysis/subs/model/src/tests/decision-lookups.test.ts',
  'scripts/reference-harness/evidence-reuse.ts',
  'scripts/reference-harness/evidence-reuse.test.ts',
  'scripts/reference-harness/completion-composition.ts',
  'scripts/reference-harness/completion-composition.test.ts',
  'scripts/reference-harness/completion-regression.ts',
  'scripts/reference-harness/plan1-focused.ts',
  'scripts/measurements/resident-composition.mjs',
  'scripts/measurements/resident-composition.test.mjs',
  'scripts/measurements/verify-resident-evidence.mjs',
]);
export interface ReviewedFileChange { readonly path: string; readonly beforeSha256: string | null; readonly afterSha256: string | null }
export const reviewedSemanticFixes: readonly ReviewedFileChange[] = [
  { path: 'scripts/reference-harness/linking-expectations.ts', beforeSha256: '91f81781adafca3a3409b0d2c69fdd6e6cc9fa6bec44e0b96686c6a8ce4758bc', afterSha256: '780baa3715153ca2c4590a477cc38e374925fb9a2c1690c1c4f2c22b0ce45627' },
  { path: 'subs/analysis/subs/model/src/tests/decision-lookups.test.ts', beforeSha256: 'c99516810d993fb3822efb13ff143db3823c5d5461828df982c0091b5d7507de', afterSha256: '4d90d134c72d70e3dada340986f729b3eb2b5c7a5c747bff08437f271de7bf5f' },
];
export interface SourceTransition {
  readonly policy: typeof reusePolicy;
  readonly baselineRevision: string;
  readonly baselineSourceSha256: string;
  readonly currentSourceSha256: string;
  readonly changes: readonly ReviewedFileChange[];
}
export const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const git = (args: string[]): string => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 32 * 1024 ** 2 });
const documents = new Set(['docs/plans/done/iteration-1-project-verifier/main-plan.md',
  'docs/plans/done/iteration-1-project-verifier/subcases.md', 'docs/plans/done/iteration-1-project-verifier/iterations/manifest.json',
  'docs/plans/iteration-2-resident-verification/main-plan.md', 'docs/plans/iteration-2-resident-verification/subcases.md']);
function sourceInput(path: string): boolean {
  if (path.includes('/node_modules/') || path.includes('/.reference-work/') || path.startsWith('scripts/measurements/results/')) return false;
  return /^(?:src|subs|scripts)\//.test(path) || path.startsWith('examples/collection-review/') || documents.has(path)
    || /^(?:module\.ramify|README\.md|package(?:-lock)?\.json|tsconfig[^/]*\.json|vitest\.config\.ts)$/.test(path);
}

/** Reconstruct both input hashes using the same file-byte framing as the gate.
 * Git supplies old bytes only for changed paths; no blanket test exclusion. */
export async function captureSourceTransition(baselineRevision: string): Promise<SourceTransition> {
  assert.match(baselineRevision, /^[0-9a-f]{7,40}$/, 'Explicit Git revision required');
  const revision = git(['rev-parse', `${baselineRevision}^{commit}`]).trim();
  const oldPaths = new Set(git(['ls-tree', '-r', '--name-only', revision]).trim().split('\n').filter(sourceInput));
  const deleted = new Set(git(['ls-files', '--deleted', '-z']).split('\0'));
  const currentPaths = new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0')
    .filter(path => path && sourceInput(path) && !deleted.has(path)));
  const changed = new Set(git(['diff', '--name-only', revision, '--']).trim().split('\n'));
  const before = createHash('sha256'), after = createHash('sha256');
  const changes: ReviewedFileChange[] = [];
  for (const path of [...new Set([...oldPaths, ...currentPaths])].sort()) {
    const current = currentPaths.has(path) ? await readFile(join(repositoryRoot, path)) : null;
    const old = !oldPaths.has(path) ? null : !changed.has(path) && current !== null ? current
      : execFileSync('git', ['show', `${revision}:${path}`], { cwd: repositoryRoot, maxBuffer: 32 * 1024 ** 2 });
    if (old !== null) before.update(path).update('\0').update(old).update('\0');
    if (current !== null) after.update(path).update('\0').update(current).update('\0');
    const beforeSha256 = old === null ? null : sha256(old), afterSha256 = current === null ? null : sha256(current);
    if (beforeSha256 !== afterSha256) changes.push({ path, beforeSha256, afterSha256 });
  }
  const value: SourceTransition = { policy: reusePolicy, baselineRevision: revision, baselineSourceSha256: before.digest('hex'),
    currentSourceSha256: after.digest('hex'), changes };
  assert.equal(value.currentSourceSha256, (await executionIdentity()).sourceSha256, 'Reuse and gate source inventories differ');
  return value;
}

export function assertReviewedTransition(reviewed: SourceTransition, actual: SourceTransition, baseline: EvidenceIdentity, current: EvidenceIdentity): void {
  assert.equal(reviewed.policy, reusePolicy, 'Unapproved evidence reuse policy');
  assert.deepEqual(actual, reviewed, 'Source edits differ from the exact reviewed before/after digests');
  assert.equal(reviewed.baselineSourceSha256, baseline.sourceSha256, 'Baseline Git bytes differ from original gate identity');
  assert.equal(reviewed.currentSourceSha256, current.sourceSha256, 'Reviewed bytes differ from current gate identity');
  assert.ok(reviewed.changes.length > 0, 'Composition requires an explicit reviewed change set');
  assert.equal(new Set(reviewed.changes.map(change => change.path)).size, reviewed.changes.length, 'Duplicate reviewed path');
  for (const expected of reviewedSemanticFixes) {
    assert.deepEqual(reviewed.changes.find(change => change.path === expected.path), expected, 'Semantic fix differs from the explicitly reviewed transformation');
  }
  for (const change of reviewed.changes) {
    assert.ok(reviewedReusePaths.has(change.path), `Change outside reviewed blast radius: ${change.path}`);
    for (const digest of [change.beforeSha256, change.afterSha256]) assert.ok(digest === null || /^[a-f0-9]{64}$/.test(digest), 'Invalid reviewed file digest');
  }
  for (const key of ['buildSha256', 'packageVersion', 'nodeVersion', 'typescriptVersion'] as const) {
    assert.equal(baseline[key], current[key], `Production build/runtime changed: ${key}`);
  }
}
