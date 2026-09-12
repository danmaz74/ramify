import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plan5Directory, plan5InventoryDocument } from './instances.js';
import { readReviewedPlan5, repositoryRoot, requiredIterations, validateInstancePointers, validateInstanceRecords } from './plan.js';
import { plan5Instances } from './plan5-instances.js';
import { plan5Runtime } from './plan5-runtime.js';
import { plan5GateHandlers } from './plan5-gate-cases.js';
import { verifyInstances } from './runner.js';
import { formatVerification, parseVerifyArguments } from './verify.js';

const plan = readReviewedPlan5();
describe('Plan 5 inventory and gates', () => {
  it('transcribes all 103 reviewed leaves with exact pointers, fixtures and evidence', () => {
    expect(plan5Instances).toHaveLength(103);
    expect(validateInstanceRecords(plan5Instances, plan)).toEqual([]);
    expect(validateInstancePointers(plan5Instances)).toEqual([]);
    expect(Array.from({ length: 13 }, (_, n) => plan5Instances.filter(item => item.iteration === n + 1).length))
      .toEqual([0, 10, 7, 8, 7, 10, 11, 8, 13, 9, 5, 9, 6]);
    expect(new Set(plan5Instances.map(item => item.matrixId)).size).toBe(14);
    expect(plan5Instances.every(item => item.evidenceKind && !('status' in item))).toBe(true);
    expect([...plan5Runtime.capabilities].sort()).toEqual(['catalog', 'compiler', 'contexts', 'engine', 'harness-gate', 'hook-cli', 'hosting', 'observer', 'session', 'supersession']);
    expect(plan5Runtime.handlers.size).toBe(83);
    expect(plan5Instances.filter(item => item.iteration === 10).every(item => plan5Runtime.handlers.has(item.id))).toBe(true);
    const first = plan5Instances[0];
    expect(validateInstanceRecords(plan5Instances.slice(1), plan)).toEqual([`Missing reviewed instance: ${first.id}`]);
    expect(validateInstanceRecords([{ ...first, evidenceKind: 'unit' }, ...plan5Instances.slice(1)], plan))
      .toEqual([`Instance differs from reviewed metadata: ${first.id}`]);
  });

  it('accepts iterations 1 through 13 and follows transitive prerequisites', () => {
    for (let iteration = 1; iteration <= 13; iteration++) expect(parseVerifyArguments(['--plan', '5', '--iteration', String(iteration)]))
      .toEqual({ planNumber: 5, iteration, preserveOnFailure: false, format: 'human' });
    expect(() => parseVerifyArguments(['--iteration', '14', '--plan', '5'])).toThrow('Plan 5 iteration');
    expect(requiredIterations(plan, 2)).toEqual([1, 2]);
    expect(requiredIterations(plan, 4)).toEqual([1, 2, 4]);
    expect(requiredIterations(plan, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('executes H discipline controls and leaves unavailable engine and later records unexecuted', async () => {
    const runtime = { capabilities: new Set(['harness-gate'] as const), handlers: plan5GateHandlers };
    const options = { plan, records: plan5Instances, runtime, workRoot: join(repositoryRoot, '.reference-work') };
    const intermediate = await verifyInstances({ ...options, iteration: 2 });
    expect(intermediate.inventoryIssues).toEqual([]);
    expect(intermediate.summary).toEqual({ required: 10, passed: 4, failed: 0, notExecuted: 99 });
    expect(formatVerification(intermediate)).toContain('Plan 5 iteration verification: 2');
    const full = await verifyInstances(options);
    expect(full.summary).toEqual({ required: 103, passed: 4, failed: 0, notExecuted: 99 });
    expect([full.passed, full.planComplete]).toEqual([false, false]);
    expect(full.instances.filter(item => item.status === 'not-executed').every(item => item.assertions.length === 0)).toBe(true);
  });

  it.each([
    ['main-plan.md', '| 2 | Engine changes', '| 2 | Changed engine'],
    ['main-plan.md', '| 4 | Project observer and incremental acquisition | project | 2 |', '| 4 | Project observer and incremental acquisition | project | 3 |'],
    ['subcases.md', '| 3 | 7 |', '| 3 | 6 |'],
    ['subcases.md', '| I5-01:namespace-lazy-equal |', '| I5-01:invented |'],
    ['subcases.md', '| A/R, A/T | api | Run', '| A/R, A/T | imaginary | Run'],
    ['subcases.md', '| A/R, A/T | api | Run', '| A/R, A/Z | api | Run'],
    ['subcases.md', '| 4 | 2 | I5-05 |', '| 4 | 3 | I5-05 |'],
  ])('rejects reviewed-document drift in %s', async (file, from, to) => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-plan5-'));
    try {
      for (const path of [plan5InventoryDocument, `${plan5Directory}/main-plan.md`]) {
        const original = await readFile(join(repositoryRoot, path), 'utf8');
        if (path.endsWith('/' + file)) expect(original.split(from)).toHaveLength(2);
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), path.endsWith('/' + file) ? original.replace(from, to) : original);
      }
      expect(() => readReviewedPlan5(root)).toThrow('Invalid reviewed Plan 5 inventory');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
