import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plan2Directory, plan2InventoryDocument } from './instances.js';
import { readReviewedPlan2, repositoryRoot, requiredIterations, validateInstancePointers, validateInstanceRecords } from './plan.js';
import { plan2Instances } from './plan2-instances.js';
import { plan2Runtime } from './plan2-runtime.js';
import { runIsolatedProject } from './mutation.js';
import { verifyInstances } from './runner.js';
import { formatVerification, parseVerifyArguments } from './verify.js';

const plan = readReviewedPlan2();
describe('Plan 2 inventory and gates', () => {
  it('transcribes every reviewed field, pointer and evidence kind without execution status', () => {
    expect(plan2Instances).toHaveLength(176);
    expect(validateInstanceRecords(plan2Instances, plan)).toEqual([]);
    expect(validateInstancePointers(plan2Instances)).toEqual([]);
    expect(Array.from({ length: 14 }, (_, n) => plan2Instances.filter(item => item.iteration === n + 1).length))
      .toEqual([0, 4, 18, 27, 15, 20, 0, 22, 28, 5, 9, 13, 9, 6]);
    expect(plan2Instances.every(item => item.evidenceKind && !('status' in item))).toBe(true);
    expect(plan2Instances.filter(item => item.fixture.code === 'H' || item.fixture.code === 'M')
      .every(item => item.fixture.root === null && item.fixture.configuration === null)).toBe(true);
    expect(plan2Instances.find(item => item.id === 'I2-29:synthetic-1000')?.fixture.selection).toBe('P/S1000');
    const first = plan2Instances[0];
    expect(validateInstanceRecords([{ ...first, evidenceKind: 'unit' }, ...plan2Instances.slice(1)], plan))
      .toEqual([`Instance differs from reviewed metadata: ${first.id}`]);
    expect(validateInstanceRecords([...plan2Instances, first], plan)).toEqual([`Duplicate instance: ${first.id}`]);
    expect(validateInstanceRecords(plan2Instances.slice(1), plan)).toEqual([`Missing reviewed instance: ${first.id}`]);
  });

  it('accepts Plan 2 fixture identities and disposes the owned copy', async () => {
    const result = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'),
      instanceId: 'I2-10:resolve-given', fixture: { kind: 'create', create: async root => {
        await writeFile(join(root, 'marker'), 'owned');
      } } }, async project => {
      expect(await readFile(join(project.root, 'marker'), 'utf8')).toBe('owned');
      expect(project.root).toContain('I2-10-resolve-given/project');
      return project.root;
    });
    expect(result.ok).toBe(true);
    if (result.ok) await expect(readFile(join(result.value, 'marker'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('accepts Plan 2 arguments and validates the plan-specific iteration range', () => {
    expect(parseVerifyArguments(['--plan', '2', '--iteration', '14']))
      .toEqual({ planNumber: 2, iteration: 14, preserveOnFailure: false, format: 'human' });
    expect(() => parseVerifyArguments(['--iteration', '15', '--plan', '2'])).toThrow('Plan 2 iteration');
    expect(requiredIterations(plan, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(requiredIterations(plan, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(requiredIterations(plan, 14)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it('executes all four discipline handlers, keeps Plan 1 capabilities separate and fails the full gate', async () => {
    expect([...plan2Runtime.capabilities]).toEqual(['harness-gate']);
    const options = { plan, records: plan2Instances, runtime: plan2Runtime, workRoot: join(repositoryRoot, '.reference-work') };
    const intermediate = await verifyInstances({ ...options, iteration: 2 });
    expect(intermediate.summary).toEqual({ required: 4, passed: 4, failed: 0, notExecuted: 172 });
    expect([intermediate.plan, intermediate.passed, intermediate.planComplete]).toEqual([2, true, false]);
    expect(formatVerification(intermediate)).toContain('Plan 2 iteration verification: 2');
    const full = await verifyInstances(options);
    expect(full.summary).toEqual({ required: 176, passed: 4, failed: 0, notExecuted: 172 });
    expect([full.passed, full.planComplete]).toEqual([false, false]);
    expect(full.instances.find(item => item.id === 'I2-20:human')?.missingCapabilities).toEqual(['cli']);
    expect(full.instances.filter(item => item.required && item.status === 'passed').every(item => item.assertions.length > 0)).toBe(true);
  });

  it.each([['2', 0, 4], [undefined, 1, 176]] as const)('command emits its real gate exit and portable Plan 2 evidence for iteration %s', (iteration, code, required) => {
    const args = ['--import', 'tsx', join(repositoryRoot, 'scripts/reference-harness/verify.ts'), '--plan', '2', '--format', 'json'];
    if (iteration) args.push('--iteration', iteration);
    const run = spawnSync(process.execPath, args, { cwd: repositoryRoot, encoding: 'utf8', timeout: 60_000, maxBuffer: 32 * 1024 ** 2 });
    expect([run.error, run.status, run.stderr]).toEqual([undefined, code, '']);
    const report = JSON.parse(run.stdout);
    expect(report.plan).toBe(2);
    expect(report.summary.required).toBe(required);
    expect(report.summary.passed).toBe(4);
    expect(report.evidence.instances).toHaveLength(176);
    expect(report.evidence.instances.every((item: { id: string }) => item.id.startsWith('I2-'))).toBe(true);
    expect(report.artifact).toMatch(/^\.reference-work\/reports\/plan2-/);
  }, 65_000);

  it.each([
    ['main-plan.md', '| 2 | New owner skeletons', '| 2 | Changed owner skeletons'],
    ['main-plan.md', '| 8 | Daemon host, records, process entry and real IPC | daemon (`host.ts`, `startDaemon`); root `daemon-entry.ts` | 7 |', '| 8 | Daemon host, records, process entry and real IPC | daemon (`host.ts`, `startDaemon`); root `daemon-entry.ts` | 6 |'],
    ['subcases.md', '| 3 | 18 |', '| 3 | 17 |'],
    ['subcases.md', '| I2-01:cold-context |', '| I2-01:invented |'],
    ['subcases.md', '| Q/R | quick | Open the unchanged reference;', '| Q/R | imaginary | Open the unchanged reference;'],
  ])('rejects drift in %s', async (file, from, to) => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-plan2-'));
    try {
      for (const path of [plan2InventoryDocument, `${plan2Directory}/main-plan.md`]) {
        const original = await readFile(join(repositoryRoot, path), 'utf8');
        if (path.endsWith('/' + file)) expect(original.split(from)).toHaveLength(2);
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), path.endsWith('/' + file) ? original.replace(from, to) : original);
      }
      expect(() => readReviewedPlan2(root)).toThrow('Invalid reviewed Plan 2 inventory');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
