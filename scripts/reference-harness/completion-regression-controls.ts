import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { assertPlan1Regression, readPlan1Regression } from './completion-regression.js';
import type { Plan1GateArtifact } from './completion-regression.js';
import { repositoryRoot } from './plan.js';

/** Schema/control fixtures only. They live outside the real report directory
 * and never supply an I2 instance with purported process evidence. */
export async function completionRegressionControls(): Promise<string[]> {
  const archived = JSON.parse(gunzipSync(await readFile(join(repositoryRoot,
    'scripts/reference-harness/evidence/plan1-complete.json.gz'))).toString('utf8')) as Plan1GateArtifact;
  const identity = { ...archived.evidence.identity, sourceSha256: 'fixture-source', buildSha256: 'fixture-build' };
  const qualified: Plan1GateArtifact = { ...archived, evidence: { ...archived.evidence, identity },
    instances: archived.instances.map(item => ({ ...item,
      baselineAssertions: item.baselineAssertions.map(a => ({ ...a, name: a.name.replace('exact nine implemented owners', 'exact eleven implemented owners')
        .replace('all seven actual package entry imports executed', 'all eight actual package entry imports executed') })),
      assertions: item.assertions.map(a => ({ ...a, name: a.name.replace('exact nine implemented owners', 'exact eleven implemented owners')
        .replace('all seven actual package entry imports executed', 'all eight actual package entry imports executed') })),
      observations: item.observations?.map(o => {
        if (o.kind === 'toolkit-scope') return { ...o, data: { ...(o.data as object), owners: ['ramify', 'ramify/analysis',
          'ramify/analysis/descriptions', 'ramify/analysis/model', 'ramify/analysis/project', 'ramify/analysis/typescript',
          'ramify/cli', 'ramify/daemon', 'ramify/daemon/contexts', 'ramify/presentation', 'ramify/presentation/layout'] } };
        if (o.kind === 'relocation-installed-entries') return { ...o, data: [...o.data as unknown[],
          { entry: 'ramify.ts/client', callable: 'connectDaemon', resolved: 'node_modules/ramify.ts/dist/subs/daemon/src/client-entry.js' }] };
        return o;
      }),
    })) };
  const recorded: string[] = [];
  const accepts = (report: Plan1GateArtifact) => assertPlan1Regression(report, identity, archived.evidence.instances);
  accepts(qualified); recorded.push('complete schema positive');
  const reject = (label: string, report: Plan1GateArtifact) => { assert.throws(() => accepts(report), label); recorded.push(label); };
  reject('actual old-build archive', archived);
  for (const field of ['sourceSha256', 'buildSha256', 'nodeVersion', 'typescriptVersion', 'packageVersion'] as const) {
    reject(`changed ${field}`, { ...qualified, evidence: { ...qualified.evidence, identity: { ...identity, [field]: 'different' } } });
  }
  reject('filtered run', { ...qualified, iteration: 15, mode: 'iteration-verification' });
  reject('failed summary', { ...qualified, passed: false });
  reject('missing execution', { ...qualified, instances: qualified.instances.slice(1) });
  reject('duplicate execution', { ...qualified, instances: [qualified.instances[1], ...qualified.instances.slice(1)] });
  const first = qualified.instances[0];
  reject('empty assertions', { ...qualified, instances: [{ ...first, assertions: [] }, ...qualified.instances.slice(1)] });
  reject('failed assertion', { ...qualified, instances: [{ ...first,
    assertions: [{ ...first.assertions[0], status: 'failed' }, ...first.assertions.slice(1)] }, ...qualified.instances.slice(1)] });
  reject('missing metadata', { ...qualified, evidence: { ...qualified.evidence, instances: qualified.evidence.instances.slice(1) } });
  reject('old tree expectations despite matching inputs', { ...archived, evidence: { ...archived.evidence, identity } });
  const missing = (kind: string): Plan1GateArtifact => ({ ...qualified, instances: qualified.instances.map(item =>
    ({ ...item, observations: item.observations?.filter(o => o.kind !== kind) })) });
  reject('missing actual owner observations', missing('toolkit-scope'));
  reject('missing actual installed entries', missing('relocation-installed-entries'));
  const alteredArchive = archived.evidence.instances.map((item, index) => index ? item : { ...item, capabilityScope: 'changed' });
  assert.throws(() => assertPlan1Regression(qualified, identity, alteredArchive)); recorded.push('305 frozen definitions');
  const directory = await mkdtemp(join(tmpdir(), 'ri14-regression-control-'));
  const save = async (name: string, value: unknown, seconds: number) => {
    const path = join(directory, name); await writeFile(path, JSON.stringify(value)); await utimes(path, seconds, seconds);
  };
  try {
    await assert.rejects(readPlan1Regression(directory, identity, archived.evidence.instances), /No full Plan 1 gate/);
    recorded.push('no report fails');
    await save('plan1-full-valid.json', qualified, 100);
    await save('plan1-full-stale.json', archived, 200);
    assert.equal((await readPlan1Regression(directory, identity, archived.evidence.instances)).file, 'plan1-full-valid.json');
    recorded.push('stale inputs do not substitute');
    await save('plan1-full-failed.json', { ...qualified, passed: false }, 300);
    await assert.rejects(readPlan1Regression(directory, identity, archived.evidence.instances), /passing unfiltered/);
    recorded.push('newer matching failure is retained');
    await rm(join(directory, 'plan1-full-failed.json'));
    await writeFile(join(directory, 'plan1-full-malformed.json'), '{');
    await assert.rejects(readPlan1Regression(directory, identity, archived.evidence.instances), SyntaxError);
    recorded.push('malformed report is not hidden');
  } finally { await rm(directory, { recursive: true, force: true }); }
  accepts(qualified); recorded.push('restored schema positive');
  return recorded;
}
