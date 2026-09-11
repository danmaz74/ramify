import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { executionIdentity } from './artifact.js';
import { plan1Instances } from './cases.js';
import { assertPlan1Regression } from './completion-regression.js';
import type { Plan1GateArtifact } from './completion-regression.js';
import { assertReviewedTransition, captureSourceTransition, reusePolicy, sha256 } from './evidence-reuse.js';
import type { EvidenceIdentity, SourceTransition } from './evidence-reuse.js';
import { repositoryRoot } from './plan.js';
import type { VerificationReport } from './runner.js';

/** Digests bind the reviewed original CI artifacts to their actual runner platform.
 * These two failed runs are immutable provenance, not replaceable current claims. */
export const reviewedPlan1Baselines = [
  { platform: 'linux', sha256: 'b8dc382af8a7d0be40c7dd71b72ee457e5677ab965a952dbedce87800d0f7bb3',
    workflowRun: 'https://github.com/danmaz74/ramify/actions/runs/34611509976' },
  { platform: 'darwin', sha256: 'ccb03521e6394b82fcd7b58d9e67bae817cd9e5f6a5bfe5c2859224396dcbffa',
    workflowRun: 'https://github.com/danmaz74/ramify/actions/runs/34610976201' },
] as const;
export const affectedPlan1Ids = ['I1-26:human-json', 'I1-27:self-check', 'I1-27:self-negative',
  'I1-28:compiled-cli-clean/json', 'I1-28:compiled-cli-denied/json', 'I1-28:compiled-cli-invalid/json',
  'I1-28:compiled-cli-warnings/json', 'I1-28:compiled-cli-stray-description/json'] as const;
export const focusedPlan1Ids: readonly string[] = [...affectedPlan1Ids, 'I1-27:report-retention'];
export interface FocusedPlan1Evidence {
  readonly kind: 'plan1-focused-evidence'; readonly identity: EvidenceIdentity; readonly platform: string;
  readonly selectedIds: readonly string[]; readonly report: VerificationReport;
}
interface ArtifactReference { readonly file: string; readonly sha256: string }
export interface Plan1Composition {
  readonly schemaVersion: 1; readonly kind: 'plan1-composed-evidence'; readonly policy: typeof reusePolicy;
  readonly identity: EvidenceIdentity; readonly platform: string;
  readonly baseline: ArtifactReference; readonly rerun: ArtifactReference; readonly reviewedTransition: ArtifactReference;
  readonly summary: { readonly required: 308; readonly passed: 308; readonly failed: 0; readonly notExecuted: 0 };
  readonly sources: readonly { readonly id: string; readonly from: 'baseline' | 'focused-rerun' }[];
  readonly limitation: string;
}
const summary = { required: 308, passed: 308, failed: 0, notExecuted: 0 } as const;

/** Construct only an in-memory validation view. The original failed full report
 * remains byte-for-byte intact; persisted acceptance is explicitly composed. */
export function assertPlan1Composition(composition: Plan1Composition, baseline: Plan1GateArtifact,
  focused: FocusedPlan1Evidence, reviewed: SourceTransition, actual: SourceTransition,
  current: EvidenceIdentity, archivedRecords: typeof plan1Instances): void {
  assert.deepEqual([composition.schemaVersion, composition.kind, composition.policy], [1, 'plan1-composed-evidence', reusePolicy]);
  for (const key of ['sourceSha256', 'buildSha256', 'packageVersion', 'nodeVersion', 'typescriptVersion'] as const) {
    assert.equal(composition.identity[key], current[key], `Composition identity differs: ${key}`);
    assert.equal(focused.identity[key], current[key], `Focused evidence identity differs: ${key}`);
  }
  assert.equal(composition.platform, focused.platform, 'Focused execution platform differs');
  assert.ok(reviewedPlan1Baselines.some(item => item.platform === composition.platform && item.sha256 === composition.baseline.sha256),
    'Baseline digest lacks reviewed platform provenance');
  assertReviewedTransition(reviewed, actual, baseline.evidence.identity, current);
  assert.deepEqual([baseline.schemaVersion, baseline.plan, baseline.mode, baseline.iteration], [1, 1, 'plan-verification', null]);
  assert.deepEqual(baseline.summary, { required: 308, passed: 300, failed: 8, notExecuted: 0 });
  assert.equal(baseline.passed, false); assert.equal(baseline.planComplete, false);
  assert.deepEqual(baseline.inventoryIssues, []);
  assert.deepEqual(baseline.evidence.instances, plan1Instances);
  assert.deepEqual(baseline.instances.map(item => item.id), plan1Instances.map(item => item.id));
  assert.deepEqual(baseline.instances.filter(item => item.status !== 'passed').map(item => item.id).sort(), [...affectedPlan1Ids].sort(),
    'Baseline failures exceed the reviewed eight-case remediation');
  assert.equal(focused.kind, 'plan1-focused-evidence');
  assert.deepEqual([...focused.selectedIds].sort(), [...focusedPlan1Ids].sort());
  assert.deepEqual(focused.report.instances.map(item => item.id).sort(), [...focusedPlan1Ids].sort());
  assert.deepEqual(focused.report.summary, { required: focusedPlan1Ids.length, passed: focusedPlan1Ids.length, failed: 0, notExecuted: 0 });
  assert.equal(focused.report.passed, true); assert.equal(focused.report.planComplete, false);
  assert.deepEqual(focused.report.inventoryIssues, []);
  const reruns = new Map(focused.report.instances.map(item => [item.id, item]));
  const instances = baseline.instances.map(item => reruns.get(item.id) ?? item);
  assert.deepEqual(composition.summary, summary);
  assert.deepEqual(composition.sources, instances.map(item => ({ id: item.id, from: reruns.has(item.id) ? 'focused-rerun' : 'baseline' })));
  assertPlan1Regression({ ...baseline, passed: true, planComplete: true, summary, instances,
    evidence: { ...baseline.evidence, identity: current } }, current, archivedRecords);
}

async function referenced<T>(directory: string, reference: ArtifactReference): Promise<T> {
  assert.equal(reference.file, basename(reference.file), 'Composition references must be local sibling artifacts');
  assert.match(reference.sha256, /^[a-f0-9]{64}$/);
  const bytes = await readFile(join(directory, reference.file));
  assert.ok(bytes.length <= 32 * 1024 ** 2, 'Composition dependency exceeds archive bound');
  assert.equal(sha256(bytes), reference.sha256, `Composed evidence hash differs: ${reference.file}`);
  return JSON.parse(bytes.toString('utf8')) as T;
}
export async function readPlan1Composition(directory: string, file: string, current: EvidenceIdentity, archivedRecords: typeof plan1Instances) {
  const raw = await readFile(join(directory, file));
  assert.ok(raw.length <= 32 * 1024 ** 2);
  const composition = JSON.parse(raw.toString('utf8')) as Plan1Composition;
  assert.equal(composition.platform, process.platform, 'A local-platform Plan 1 receipt is required');
  const baseline = await referenced<Plan1GateArtifact>(directory, composition.baseline);
  const focused = await referenced<FocusedPlan1Evidence>(directory, composition.rerun);
  const reviewed = await referenced<SourceTransition>(directory, composition.reviewedTransition);
  const actual = await captureSourceTransition(reviewed.baselineRevision);
  assertPlan1Composition(composition, baseline, focused, reviewed, actual, current, archivedRecords);
  return { file, sha256: sha256(raw), identity: current, summary: composition.summary, unchangedRecords: 305,
    revisedExpectationRecords: ['I1-27:self-check', 'I1-27:self-negative', 'I1-28:relocated-package'],
    acceptance: 'composed' as const, policy: composition.policy, baseline: composition.baseline, rerun: composition.rerun,
    reviewedTransition: composition.reviewedTransition, reusedExecutions: 299, rerunExecutions: focusedPlan1Ids.length };
}

/** CLI accepts baseline/rerun/review files already copied into one evidence
 * directory. A reviewer must approve the exact transition before publication. */
export async function publishPlan1Composition(directory: string, baselineFile: string, rerunFile: string, reviewFile: string, outputFile: string) {
  const reference = async (file: string): Promise<ArtifactReference> => ({ file, sha256: sha256(await readFile(join(directory, file))) });
  const current = await executionIdentity();
  const rerun = JSON.parse(await readFile(join(directory, rerunFile), 'utf8')) as FocusedPlan1Evidence;
  const composition: Plan1Composition = { schemaVersion: 1, kind: 'plan1-composed-evidence', policy: reusePolicy, identity: current,
    platform: rerun.platform, baseline: await reference(baselineFile), rerun: await reference(rerunFile), reviewedTransition: await reference(reviewFile),
    summary, sources: plan1Instances.map(item => ({ id: item.id, from: focusedPlan1Ids.includes(item.id) ? 'focused-rerun' : 'baseline' })),
    limitation: '299 unchanged executions reused from the preserved 300/308 full run; eight repaired cases and one retained-report control executed again. This is composed acceptance, not a new full run.' };
  const archive = JSON.parse(gunzipSync(await readFile(join(repositoryRoot, 'scripts/reference-harness/evidence/plan1-complete.json.gz'))).toString('utf8')) as Plan1GateArtifact;
  const baseline = await referenced<Plan1GateArtifact>(directory, composition.baseline);
  const reviewed = await referenced<SourceTransition>(directory, composition.reviewedTransition);
  assertPlan1Composition(composition, baseline, rerun, reviewed, await captureSourceTransition(reviewed.baselineRevision), current, archive.evidence.instances);
  await writeFile(join(directory, outputFile), JSON.stringify(composition) + '\n', { flag: 'wx' });
  return readPlan1Composition(directory, outputFile, current, archive.evidence.instances);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, baseline, rerun, review, output] = process.argv.slice(2);
  assert.ok(directory && baseline && rerun && review && output, 'Usage: completion-composition.ts DIRECTORY BASELINE RERUN REVIEW OUTPUT');
  console.log(JSON.stringify(await publishPlan1Composition(directory, baseline, rerun, review, output)));
}
