import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plan2aDirectory, plan2aInventoryDocument } from './instances.js';
import { readReviewedPlan2a, repositoryRoot, requiredIterations, validateInstancePointers, validateInstanceRecords } from './plan.js';
import { plan2aInstances } from './plan2a-instances.js';
import { plan2aRuntime } from './plan2a-runtime.js';
import { plan2aGateHandlers } from './plan2a-gate-cases.js';
import { verifyInstances } from './runner.js';
import { formatVerification, parseVerifyArguments } from './verify.js';

const plan = readReviewedPlan2a();
describe('Plan 2A inventory and gates', () => {
  it('transcribes all 104 reviewed leaves with exact pointers, fixtures and evidence', () => {
    expect(plan2aInstances).toHaveLength(104);
    expect(validateInstanceRecords(plan2aInstances, plan)).toEqual([]);
    expect(validateInstancePointers(plan2aInstances)).toEqual([]);
    expect(Array.from({ length: 10 }, (_, n) => plan2aInstances.filter(item => item.iteration === n + 1).length))
      .toEqual([4, 12, 8, 8, 9, 17, 9, 16, 14, 7]);
    expect(new Set(plan2aInstances.map(item => item.matrixId)).size).toBe(13);
    expect(plan2aInstances.every(item => item.evidenceKind && !('status' in item))).toBe(true);
    const first = plan2aInstances[0]!;
    expect(validateInstanceRecords(plan2aInstances.slice(1), plan)).toEqual([`Missing reviewed instance: ${first.id}`]);
    expect(validateInstanceRecords([{ ...first, evidenceKind: 'unit' }, ...plan2aInstances.slice(1)], plan))
      .toEqual([`Instance differs from reviewed metadata: ${first.id}`]);
    expect(validateInstanceRecords([...plan2aInstances, first], plan)).toEqual([`Duplicate instance: ${first.id}`]);
  });

  it('accepts iterations 1 through 10 and follows transitive prerequisites', () => {
    for (let iteration = 1; iteration <= 10; iteration++) expect(parseVerifyArguments(['--plan', '2a', '--iteration', String(iteration)]))
      .toEqual({ planNumber: '2a', iteration, preserveOnFailure: false, format: 'human' });
    expect(() => parseVerifyArguments(['--iteration', '11', '--plan', '2a'])).toThrow('Plan 2A iteration');
    expect(requiredIterations(plan, 2)).toEqual([1, 2]);
    expect(requiredIterations(plan, 4)).toEqual([1, 4]);
    expect(requiredIterations(plan, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(requiredIterations(plan, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(requiredIterations(plan, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('passes iterations 1 and 2 (document evidence plus twelve real assertions) and leaves iteration 3 onward unexecuted', async () => {
    const options = { plan, records: plan2aInstances, runtime: plan2aRuntime, workRoot: join(repositoryRoot, '.reference-work') };
    const intermediate = await verifyInstances({ ...options, iteration: 2 });
    expect(intermediate.inventoryIssues).toEqual([]);
    expect(intermediate.summary.required).toBe(16);
    expect(intermediate.instances.filter(item => item.iteration === 1)).toHaveLength(4);
    expect(intermediate.instances.filter(item => item.iteration === 2)).toHaveLength(12);
    expect(intermediate.instances.filter(item => item.iteration <= 2).every(item => item.status === 'passed')).toBe(true);
    expect(intermediate.instances.filter(item => item.iteration > 2).every(item => item.status === 'not-executed' && item.reason === 'future-iteration')).toBe(true);
    expect(intermediate.passed).toBe(true);
    expect(formatVerification(intermediate)).toContain('Plan 2a iteration verification: 2');
  }, 60_000);

  it('registers the four harness-gate controls', () => {
    expect([...plan2aGateHandlers.keys()].sort()).toEqual([
      'I2A-02:harness-failing-assertion', 'I2A-02:harness-filter', 'I2A-02:harness-membership', 'I2A-02:harness-missing-record',
    ]);
  });

  it.each([
    ['main-plan.md', '| 2 | Generated-output isolation and harness ledger', '| 2 | Changed title'],
    ['main-plan.md', '| I2A-02 | Generated-output isolation and harness controls | 2 |', '| I2A-02 | Generated-output isolation and harness controls | 3 |'],
    ['subcases.md', '| I2A-02:harness-membership | 2 |', '| I2A-02:harness-membership | 5 |'],
    ['subcases.md', '| 2 | 1 | I2A-02 |', '| 2 | 3 | I2A-02 |'],
  ])('rejects reviewed-document drift in %s', async (file, from, to) => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-plan2a-'));
    try {
      for (const path of [plan2aInventoryDocument, `${plan2aDirectory}/main-plan.md`]) {
        const original = await readFile(join(repositoryRoot, path), 'utf8');
        if (path.endsWith('/' + file)) expect(original.split(from)).toHaveLength(2);
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), path.endsWith('/' + file) ? original.replace(from, to) : original);
      }
      expect(() => readReviewedPlan2a(root)).toThrow('Invalid reviewed Plan 2A inventory');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
