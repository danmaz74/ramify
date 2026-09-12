import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { plan5Instances } from './plan5-instances.js';
import { plan2Instances, plan2Supersessions } from './plan2-instances.js';
import { readReviewedPlan2, repositoryRoot, validateInstanceRecords } from './plan.js';
import { verifyInstances } from './runner.js';
import { archiveObservation, recordObservation } from './observations.js';
import type { Assertions, HarnessRuntime, InstanceHandler, VerificationReport } from './runner.js';

const handlers = new Map<string, InstanceHandler>();
const execute = promisify(execFile);
async function emittedFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await emittedFiles(path));
    else if (/\.(?:js|d\.ts)$/.test(path)) result.push(path);
  }
  return result;
}
handlers.set('I5-10:increment-removed', { kind: 'memory', run: async ({ assertions: a }) => {
  const removed = ['analyzeIncrement', 'IncrementInputs', 'IncrementRun', 'InputChange', 'RetainedStageId', 'RetainedStage', 'RetainedAnalysis', 'createAnalysisDriverFromSessions'];
  const required = ['analyzeProject', 'createAnalysisSession', 'validateProject', 'acquireInventory', 'resolveProject', 'openRetainedSession'];
  const run = await execute(process.execPath, ['--input-type=module', '--eval', `const values = await import('./dist/subs/analysis/src/index.js'); console.log(JSON.stringify(Object.fromEntries(Object.entries(values).map(([key,value]) => [key, typeof value]))));`], { cwd: repositoryRoot });
  const exports = JSON.parse(run.stdout) as Record<string, string>;
  a.equal('existing batch and retained entry operations are callable', required.map(name => [name, exports[name]]), required.map(name => [name, 'function']));
  a.equal('removed engine operations are absent from built entry', removed.filter(name => name in exports), []);
  const pattern = new RegExp(`\\b(?:${removed.join('|')})\\b`), matches: string[] = [];
  for (const file of await emittedFiles(join(repositoryRoot, 'dist'))) if (pattern.test(await readFile(file, 'utf8'))) matches.push(file.slice(repositoryRoot.length));
  a.equal('no removed operation or type remains in emitted code or declarations', matches, []);
  recordObservation('removed-increment-build', { required, removed, exported: exports, matches });
} });

export async function assertPlan2SupersessionAdmission(a: Assertions): Promise<void> {
  const plan = readReviewedPlan2();
  a.equal('exactly ten canonical records are superseded', plan2Instances.filter(instance => instance.superseded).length, 10);
  a.equal('all 166 remaining Plan 2 records stay required', plan2Instances.filter(instance => !instance.superseded).length, 166);
  a.equal('amendment and executable mappings agree', validateInstanceRecords(plan2Instances, plan), []);
  a.equal('each distinct named I5 counterpart has a reviewed slot', plan.counterparts?.map(seed => seed[0]).sort(), [...new Set(Object.values(plan2Supersessions))].sort());
  const noProviders: HarnessRuntime = { capabilities: new Set(), handlers: new Map() };
  const negative = await verifyInstances({ plan, records: plan2Instances.filter(instance => instance.id !== 'I2-10:resolve-given'), runtime: noProviders, workRoot: join(repositoryRoot, '.reference-work') });
  a.ok('removing an unsuperseded record still fails the gate', !negative.passed && negative.inventoryIssues.includes('Missing reviewed instance: I2-10:resolve-given'));
  const invented = plan2Instances.map(instance => instance.id === 'I2-10:resolve-given' ? { ...instance, superseded: { by: 'I5-07:configuration-broad', amendment: 'invented' } } : instance);
  a.ok('inventing an eleventh retirement is rejected', validateInstanceRecords(invented, plan).some(issue => issue.includes('I2-10:resolve-given')));
  a.equal('full amended gate requires 166 retained cases plus eight counterparts', negative.summary.required, 174);
  const counterpartId = 'I5-07:readme-metadata-only';
  const missingRecord = await verifyInstances({ plan, records: plan2Instances, runtime: noProviders, workRoot: join(repositoryRoot, '.reference-work'),
    counterpartRecords: plan5Instances.filter(instance => instance.id !== counterpartId) });
  a.ok('missing executable counterpart record cannot be synthesized from review', !missingRecord.passed
    && missingRecord.inventoryIssues.includes(`Missing reviewed counterpart: ${counterpartId}`)
    && missingRecord.instances.find(instance => instance.id === counterpartId)?.reason === 'missing-record');
  for (const fault of ['missing', 'failed'] as const) {
    const counterpart = plan.counterparts![0][0];
    const checked = await verifyInstances({ plan, records: plan2Instances, workRoot: join(repositoryRoot, '.reference-work'),
      runtime: { capabilities: new Set(['session']), handlers: fault === 'missing' ? new Map() : new Map([[counterpart,
        { kind: 'memory', run: ({ assertions }) => assertions.equal('deliberately wrong counterpart expectation', 'wrong', 'expected') }]]) } });
    a.equal(`${fault} counterpart cannot be credited by supersession`, checked.instances.find(instance => instance.id === counterpart)?.reason,
      fault === 'missing' ? 'missing-handler' : 'assertion-failed');
    a.equal(`${fault} counterpart keeps the full gate failing`, checked.passed, false);
  }
}

handlers.set('I5-10:plan2-gate-amended', { kind: 'memory', run: async ({ assertions: a }) => {
  await assertPlan2SupersessionAdmission(a);
  // This subprocess executes the real gate, including its measurement and Plan 1
  // obligations. A stale or incomplete receipt is never accepted as a full pass.
  const endpoint = await mkdtemp(join(tmpdir(), 'ramify-plan2-amended-'));
  try {
    let output: string;
    try {
      output = (await execute(process.execPath, ['--import', 'tsx', 'scripts/reference-harness/verify.ts', '--plan', '2', '--format', 'json'],
        { cwd: repositoryRoot, env: { ...process.env, RAMIFY_ENDPOINT_DIR: endpoint }, timeout: 3_600_000, maxBuffer: 128 * 1024 ** 2 })).stdout;
    } catch (error) {
      const stdout = (error as { stdout?: string }).stdout;
      if (stdout) { try { recordObservation('amended-plan2-failed-gate', await archiveObservation('amended-plan2-failed-gate', JSON.parse(stdout))); } catch { /* preserve command error below */ } }
      throw error;
    }
    const report = JSON.parse(output) as VerificationReport;
    recordObservation('amended-plan2-gate', { summary: report.summary, passed: report.passed, archive: await archiveObservation('amended-plan2-gate', report) });
    a.equal('real Plan 2 full gate passes on this build', [report.plan, report.passed, report.summary.required, report.summary.passed], [2, true, 174, 174]);
    a.equal('supersession is explicit without invented executions', report.instances.filter(instance => instance.status === 'superseded').length, 10);
  } finally {
    await execute(process.execPath, ['dist/src/cli-entry.js', 'daemon', 'stop'], { cwd: repositoryRoot, env: { ...process.env, RAMIFY_ENDPOINT_DIR: endpoint }, timeout: 30_000 });
    await rm(endpoint, { recursive: true, force: true });
  }
} });

handlers.set('I5-10:plan2-contexts-regression', { kind: 'memory', run: async ({ assertions: a }) => {
  const endpoint = await mkdtemp(join(tmpdir(), 'ramify-plan2-session-regression-'));
  // Execute the existing independent context/service/transport/process/CLI/
  // lifecycle providers in a child. No measurement or gate recursion is involved.
  const source = `
    const { plan2Instances } = await import('./scripts/reference-harness/plan2-instances.ts');
    const { plan2Runtime } = await import('./scripts/reference-harness/plan2-runtime.ts');
    const { readReviewedPlan2 } = await import('./scripts/reference-harness/plan.ts');
    const { verifyInstances } = await import('./scripts/reference-harness/runner.ts');
    const capabilities = new Set(['contexts','daemon-service','ipc','client','daemon-process','cli','lifecycle','equivalence']);
    const selected = plan2Instances.filter(instance => !instance.superseded && instance.requiredCapabilities.every(capability => capabilities.has(capability)));
    const ids = new Set(selected.map(instance => instance.id));
    const report = await verifyInstances({ plan: readReviewedPlan2(), records: plan2Instances,
      runtime: { capabilities, handlers: new Map([...plan2Runtime.handlers].filter(([id]) => ids.has(id))) }, workRoot: '.reference-work' });
    const results = report.instances.filter(instance => ids.has(instance.id));
    console.log(JSON.stringify({ required: selected.length, results, passed: results.length === selected.length && results.every(instance => instance.status === 'passed') }));
  `;
  try {
    const run = await execute(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source],
      { cwd: repositoryRoot, env: { ...process.env, RAMIFY_ENDPOINT_DIR: endpoint }, timeout: 3_600_000, maxBuffer: 128 * 1024 ** 2 });
    const result = JSON.parse(run.stdout) as { required: number; results: VerificationReport['instances']; passed: boolean };
    recordObservation('plan2-session-regression', { required: result.required, passed: result.passed, archive: await archiveObservation('plan2-session-regression', result) });
    a.ok('all context, IPC, process, CLI and lifecycle groups are represented', ['I2-05:', 'I2-14:', 'I2-17:', 'I2-20:', 'I2-26:'].every(prefix => result.results.some(instance => instance.id.startsWith(prefix))));
    a.equal('every retained regression instance passes on the session driver', result.results.filter(instance => instance.status !== 'passed').map(instance => ({ id: instance.id, error: instance.error, reason: instance.reason })), []);
    a.equal('selected regression count is nonzero and fully executed', [result.passed, result.results.length > 0, result.results.length], [true, true, result.required]);
  } finally {
    await execute(process.execPath, ['dist/src/cli-entry.js', 'daemon', 'stop'], { cwd: repositoryRoot, env: { ...process.env, RAMIFY_ENDPOINT_DIR: endpoint }, timeout: 30_000 });
    await rm(endpoint, { recursive: true, force: true });
  }
} });
export const plan5SupersessionHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
