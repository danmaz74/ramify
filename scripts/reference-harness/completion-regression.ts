import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { executionIdentity } from './artifact.js';
import { plan1Instances } from './cases.js';
import { recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import type { VerificationReport } from './runner.js';

type Identity = Awaited<ReturnType<typeof executionIdentity>>;
export type Plan1GateArtifact = VerificationReport & {
  readonly evidence: { readonly identity: Identity; readonly instances: typeof plan1Instances };
};
const identityFields = ['sourceSha256', 'buildSha256', 'packageVersion', 'nodeVersion', 'typescriptVersion'] as const;
const sameInputs = (a: Identity, b: Identity) => identityFields.every(field => a[field] === b[field]);
const revised = new Set(['I1-27:self-check', 'I1-27:self-negative', 'I1-28:relocated-package']);
const owners = ['ramify', 'ramify/analysis', 'ramify/analysis/descriptions', 'ramify/analysis/model',
  'ramify/analysis/project', 'ramify/analysis/typescript', 'ramify/cli', 'ramify/daemon', 'ramify/daemon/contexts',
  'ramify/presentation', 'ramify/presentation/layout'];
const entries = {
  'ramify.ts': 'createAnalysisSession', 'ramify.ts/analysis': 'analyzeProject',
  'ramify.ts/analysis/inventory': 'acquireInventory', 'ramify.ts/model': 'createDefaultTagRegistry',
  'ramify.ts/layout': 'placeNodes', 'ramify.ts/presentation': 'ModelDiagram',
  'ramify.ts/cli': 'runCli', 'ramify.ts/client': 'connectDaemon',
};

/** Accept a complete process gate, not its summary counters alone. The frozen
 * archive supplies the 305 unaffected record definitions, never current success. */
export function assertPlan1Regression(report: Plan1GateArtifact, identity: Identity, archivedRecords: typeof plan1Instances): void {
  assert.ok(sameInputs(report.evidence.identity, identity), 'Plan 1 evidence is for different source, build or runtime inputs');
  assert.deepEqual([report.schemaVersion, report.plan, report.mode, report.iteration, report.passed, report.planComplete],
    [1, 1, 'plan-verification', null, true, true], 'A passing unfiltered Plan 1 gate is required');
  assert.deepEqual(report.requiredIterations, Array.from({ length: 15 }, (_, i) => i + 1));
  assert.deepEqual(report.inventoryIssues, []);
  assert.deepEqual(report.summary, { required: 308, passed: 308, failed: 0, notExecuted: 0 });
  assert.deepEqual(report.evidence.instances, plan1Instances, 'Every execution record must match the current reviewed inventory');
  const unaffected = (records: typeof plan1Instances) => records.filter(item => !revised.has(item.id));
  assert.equal(unaffected(archivedRecords).length, 305);
  assert.equal(JSON.stringify(unaffected(report.evidence.instances)), JSON.stringify(unaffected(archivedRecords)),
    'The 305 unaffected Plan 1 record definitions must remain byte-identical');
  assert.deepEqual(report.instances.map(item => item.id), plan1Instances.map(item => item.id), 'All 308 unique execution slots are required');
  for (const item of report.instances) {
    assert.ok(item.required === true && item.status === 'passed' && item.reason === undefined && item.error === undefined,
      `${item.id}: execution did not pass`);
    assert.ok(item.assertions.length > 0, `${item.id}: no executed assertions`);
    assert.ok([...item.baselineAssertions, ...item.assertions].every(a => a.status === 'passed' && a.name.trim() && !a.error),
      `${item.id}: unpassed or invalid assertion evidence`);
  }
  for (const id of ['I1-27:self-check', 'I1-27:self-negative']) {
    const item = report.instances.find(item => item.id === id)!;
    assert.ok([...item.baselineAssertions, ...item.assertions].some(a => a.name === 'exact eleven implemented owners'), `${id}: old owner expectation`);
    const inventories = item.observations?.filter(o => o.kind === 'toolkit-scope') ?? [];
    assert.ok(inventories.length > 0, `${id}: missing toolkit observations`);
    for (const observation of inventories) assert.deepEqual((observation.data as { owners: unknown }).owners, owners);
  }
  const relocation = report.instances.find(item => item.id === 'I1-28:relocated-package')!;
  assert.ok([...relocation.baselineAssertions, ...relocation.assertions].some(a => a.name === 'all eight actual package entry imports executed'),
    'Relocation must execute the eight-entry expectation');
  const imports = relocation.observations?.filter(o => o.kind === 'relocation-installed-entries') ?? [];
  assert.equal(imports.length, 1, 'Exactly one installed entry observation is required');
  assert.deepEqual((imports[0].data as Array<{ entry: string; callable: string }>).map(item => [item.entry, item.callable]), Object.entries(entries));
}

/** Inspect the most recent report for these inputs. A failed matching report
 * must not be hidden by selecting an older passing one. Never run nested tests. */
export async function readPlan1Regression(directory: string, identity: Identity, archivedRecords: typeof plan1Instances) {
  let names: string[];
  try { names = (await readdir(directory)).filter(name => /^plan1-full-[\w-]+\.json$/.test(name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') names = []; else throw error; }
  const files = await Promise.all(names.map(async name => ({ name, ...(await stat(join(directory, name))) })));
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  for (const file of files) {
    assert.ok(file.size <= 32 * 1024 ** 2, `Plan 1 evidence exceeds the archive bound: ${file.name}`);
    const raw = await readFile(join(directory, file.name));
    assert.ok(raw.byteLength <= 32 * 1024 ** 2, `Plan 1 evidence grew beyond its bound: ${file.name}`);
    const report = JSON.parse(raw.toString('utf8')) as Plan1GateArtifact;
    assert.ok(report.evidence?.identity, `Plan 1 evidence lacks input identity: ${file.name}`);
    if (!sameInputs(report.evidence.identity, identity)) continue;
    assertPlan1Regression(report, identity, archivedRecords);
    return { file: file.name, sha256: createHash('sha256').update(raw).digest('hex'), identity: report.evidence.identity,
      summary: report.summary, unchangedRecords: 305, revisedExpectationRecords: [...revised] };
  }
  throw new Error('No full Plan 1 gate for the current source/build/runtime. Run npm run reference:verify -- --plan 1 through the authorized regression runner first.');
}

export async function verifyPlan1Regression() {
  const identity = await executionIdentity();
  const archive = JSON.parse(gunzipSync(await readFile(join(repositoryRoot, 'scripts/reference-harness/evidence/plan1-complete.json.gz'))).toString('utf8')) as Plan1GateArtifact;
  const receipt = await readPlan1Regression(join(repositoryRoot, '.reference-work/reports'), identity, archive.evidence.instances);
  const after = await executionIdentity();
  assert.ok(sameInputs(identity, after), 'Source/build changed while validating Plan 1 evidence');
  recordObservation('plan1-regression-receipt', receipt);
  return receipt;
}
