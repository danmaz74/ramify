import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executionIdentity } from './artifact.js';
import { plan2Instances } from './plan2-instances.js';
import { assertPlan2Regression, documentChecks, documentRevisionIssues, readPlan2Regression, sessionModulePattern, supersededAnalyses } from './plan5-completion-cases.js';
import type { Plan2GateArtifact } from './plan5-completion-cases.js';
import { repositoryRoot } from './plan.js';

type Identity = Awaited<ReturnType<typeof executionIdentity>>;
const identity: Identity = { revision: 'r', dirty: false, sourceSha256: 's', buildSha256: 'b', packageVersion: '0.0.0', nodeVersion: 'v22', typescriptVersion: '7.0.2' };
const passedAssertion = [{ name: 'executed', status: 'passed' as const }];

function plan2Report(overrides: Partial<Plan2GateArtifact> = {}): Plan2GateArtifact {
  const instances = plan2Instances.map(item => item.superseded
    ? { id: item.id, iteration: item.iteration, required: false, status: 'superseded' as const, reason: 'superseded' as const, supersededBy: item.superseded.by, assertions: [], baselineAssertions: [] }
    : { id: item.id, iteration: item.iteration, required: true, status: 'passed' as const, assertions: passedAssertion, baselineAssertions: [] });
  return { schemaVersion: 1, plan: 2, mode: 'plan-verification', iteration: null, requiredIterations: [], availableCapabilities: [],
    passed: true, planComplete: true, inventoryIssues: [], summary: { required: 174, passed: 174, failed: 0, notExecuted: 0 },
    instances, evidence: { identity }, ...overrides } as unknown as Plan2GateArtifact;
}

describe('Plan 5 completion witnesses', () => {
  it('accepts a complete same-input Plan 2 gate and rejects another build, a failed instance or an invented supersession', () => {
    expect(() => assertPlan2Regression(plan2Report(), identity)).not.toThrow();
    expect(() => assertPlan2Regression(plan2Report(), { ...identity, buildSha256: 'other' })).toThrow('different source, build');
    const failed = plan2Report();
    const instances = failed.instances.map(item => item.id === 'I2-29:synthetic-500' ? { ...item, status: 'failed' as const, reason: 'assertion-failed' as const } : item);
    expect(() => assertPlan2Regression({ ...failed, instances, passed: false }, identity)).toThrow('Every required Plan 2 instance passed');
    const invented = plan2Report().instances.map(item => item.id === 'I2-10:resolve-given' ? { ...item, required: false, status: 'superseded' as const, supersededBy: 'I5-07:configuration-broad' } : item);
    expect(() => assertPlan2Regression({ ...plan2Report(), instances: invented }, identity)).toThrow('Exactly the ten');
    expect(() => assertPlan2Regression(plan2Report({ iteration: 13, mode: 'iteration-verification' }), identity)).toThrow('unfiltered');
  });

  it('reads the newest same-input Plan 2 report, so a newer failure blocks an older pass', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-plan5-completion-'));
    try {
      await expect(readPlan2Regression(directory, identity)).rejects.toThrow('No unfiltered Plan 2 gate');
      await writeFile(join(directory, 'plan2-full-older.json'), JSON.stringify(plan2Report()));
      await utimes(join(directory, 'plan2-full-older.json'), new Date(1_000), new Date(1_000));
      await writeFile(join(directory, 'plan2-full-other-build.json'), JSON.stringify(plan2Report({ evidence: { identity: { ...identity, buildSha256: 'x' } } } as Partial<Plan2GateArtifact>)));
      expect((await readPlan2Regression(directory, identity)).file).toBe('plan2-full-older.json');
      const failing = plan2Report();
      await writeFile(join(directory, 'plan2-full-newer.json'), JSON.stringify({ ...failing, passed: false,
        instances: failing.instances.map(item => item.id === 'I2-30:plan1-regression' ? { ...item, status: 'failed' } : item) }));
      await expect(readPlan2Regression(directory, identity)).rejects.toThrow('Every required Plan 2 instance passed');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('classifies session, worker and compiler modules without matching the lightweight client and CLI', () => {
    for (const path of ['dist/subs/analysis/src/retained-session.js', 'dist/subs/analysis/src/session-worker.js', 'dist/subs/analysis/src/session-supervisor-entry.js',
      'dist/subs/analysis/subs/typescript/src/retained-source-analysis.js', 'dist/subs/analysis/subs/typescript/src/compiler-helper.js', 'node_modules/typescript/lib/typescript.js']) {
      expect(sessionModulePattern.test(path), path).toBe(true);
    }
    for (const path of ['dist/subs/cli/src/index.js', 'dist/subs/cli/src/run-cli.js', 'dist/subs/daemon/src/connect-daemon.js', 'dist/subs/daemon/src/codec.js']) {
      expect(sessionModulePattern.test(path), path).toBe(false);
    }
  });

  it('requires each revised architecture statement and a superseded mark on every present analysis', async () => {
    const actual = await documentRevisionIssues(repositoryRoot);
    expect(actual.issues).toEqual([]);
    const root = await mkdtemp(join(tmpdir(), 'ramify-plan5-documents-'));
    try {
      const documents = [...new Set(documentChecks.map(check => check.document))];
      for (const document of documents) {
        await mkdir(dirname(join(root, document)), { recursive: true });
        await writeFile(join(root, document), await readFile(join(repositoryRoot, document), 'utf8'));
      }
      expect((await documentRevisionIssues(root)).issues).toEqual([]);
      expect((await documentRevisionIssues(root)).absentAnalyses).toEqual([...supersededAnalyses]);
      const daemon = join(root, 'docs/architecture/daemon.md');
      await writeFile(daemon, (await readFile(daemon, 'utf8')).replace('**Covering rule.**', 'Covering.'));
      expect((await documentRevisionIssues(root)).issues).toEqual(['docs/architecture/daemon.md: missing the covering rule']);
      await mkdir(join(root, 'docs/analysis'), { recursive: true });
      await writeFile(join(root, supersededAnalyses[0]), '# Hook analysis\n\n**Status:** proposal.\n');
      expect((await documentRevisionIssues(root)).issues).toContain(`${supersededAnalyses[0]}: not marked superseded`);
      await writeFile(join(root, supersededAnalyses[0]), '# Hook analysis\n\n**Status:** superseded by the implemented architecture where they differ.\n');
      expect((await documentRevisionIssues(root)).issues).not.toContain(`${supersededAnalyses[0]}: not marked superseded`);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
