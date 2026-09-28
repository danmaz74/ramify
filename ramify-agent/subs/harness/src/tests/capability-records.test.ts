import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RunLog } from '../run/log.js';
import { commitCapabilityTransition } from '../capability/ledger.js';
import { capabilityLayout, capabilityRequestSchema, capabilitySchemas, type CapabilityPlan } from '../capability/records.js';
import { committedRecords, recordHash } from '../work/committed.js';
import { capabilityFixtureIds, fixturePlan, fixtureRequest, fixtureTask } from './helpers/capability.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('capability records', () => {
  it('CA01 accepts a known-insufficient API and validates prospective usage structurally', () => {
    const original = fixtureRequest();
    const revised = { ...original, original: { ...original.original,
      knownInterface: { kind: 'insufficient', path: 'subs/b/src/result.ts', symbol: 'readResult', missing: 'The new fact' },
      usage: [{ path: 'subs/a/src/new-caller.ts', use: 'Call the new result reader', prospective: true, module: 'a' }],
    } };
    expect(capabilityRequestSchema.safeParse(revised).success).toBe(true);
    expect(capabilityRequestSchema.safeParse({ ...revised, original: { ...revised.original,
      usage: [{ path: 'subs/a/src/new-caller.ts', use: 'Call the new result reader', prospective: true }],
    } }).success).toBe(false);
  });

  it('CA01 keeps actual usage, provisional pseudocode and none-known intact through the real ledger', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'capability-records-'));
    directories.push(directory);
    const path = join(directory, 'events.jsonl');
    const log = await RunLog.open(path, 'job-001');
    const request = fixtureRequest();
    await commitCapabilityTransition(log, { type: 'capability-requested', data: {
      request: request.id, parent: request.parent.id, assignment: request.assignment, invocation: request.invocation,
    } }, [{ path: capabilityLayout.request(request.id), id: request.id, revision: 1, body: request }]);
    const task = fixtureTask();
    const plan = fixturePlan();
    await commitCapabilityTransition(log, { type: 'capability-delegated', data: {
      task: task.id, request: request.id, parent: request.parent.id, invocation: 'inv-0002', planRevision: 1,
    } }, [
      { path: capabilityLayout.task(task.id), id: task.id, revision: 1, body: task },
      { path: capabilityLayout.plan(task.id, 1), id: task.id, revision: 1, body: plan },
    ]);
    const reopened = await RunLog.open(path, 'job-001');
    const record = await reopened.ledger.readRecord(capabilityLayout.request(request.id), capabilitySchemas.request);
    expect(record).toEqual({ kind: 'valid', value: request });
    expect(committedRecords(reopened.ledger.replay()).capabilityRequests.get(request.id)?.original).toEqual(request.original);
    expect(committedRecords(reopened.ledger.replay()).capabilityTasks.get(task.id)?.deferredWorkItems).toEqual(['wi-002']);
  });

  it('CA11 preserves original examples and old plan revisions across a corrected oracle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'capability-revision-'));
    directories.push(directory);
    const log = await RunLog.open(join(directory, 'events.jsonl'), 'job-001');
    const request = fixtureRequest();
    const task = fixtureTask();
    const plan = fixturePlan();
    await commitCapabilityTransition(log, { type: 'capability-requested', data: { request: request.id, parent: 'wi-001', assignment: request.assignment, invocation: request.invocation } },
      [{ path: capabilityLayout.request(request.id), id: request.id, revision: 1, body: request }]);
    await commitCapabilityTransition(log, { type: 'capability-delegated', data: { task: task.id, request: request.id, parent: 'wi-001', invocation: 'inv-0002', planRevision: 1 } }, [
      { path: capabilityLayout.task(task.id), id: task.id, revision: 1, body: task },
      { path: capabilityLayout.plan(task.id, 1), id: task.id, revision: 1, body: plan },
    ]);
    const revision: CapabilityPlan = { ...plan, revision: 2, basedOn: 1, revisionReason: 'Independent D test disproved the expected value',
      useCases: [{ ...plan.useCases[0]!, expectedBehavior: 'A formats the corrected value', coverage: {
        state: 'corrected', reason: 'Original oracle used the wrong unit', evidence: ['check-1'], decidedBy: 'inv-0002',
        tests: ['a-format'], candidate: 'tree-2', configuration: 'test-config-1',
      } }],
    };
    await commitCapabilityTransition(log, { type: 'capability-plan-revised', data: { task: task.id, revision: 2, basedOn: 1, invocation: 'inv-0002' } },
      [{ path: capabilityLayout.plan(task.id, 2), id: task.id, revision: 2, body: revision }]);
    const saved = committedRecords(log.ledger.replay()).capabilityPlans.get(task.id);
    expect(saved).toHaveLength(2);
    expect(saved?.[0]).toEqual(plan);
    expect(saved?.[1]?.originalExamples).toEqual([capabilityFixtureIds.example]);
    await expect(commitCapabilityTransition(log, { type: 'capability-plan-revised', data: { task: task.id, revision: 3, basedOn: 2, invocation: 'inv-0002' } },
      [{ path: capabilityLayout.plan(task.id, 3), id: task.id, revision: 3, body: { ...revision, revision: 3, basedOn: 2, originalExamples: [] } }])).rejects.toThrow();
    expect(log.count('capability-plan-revised')).toBe(1);
  });

  it('refuses unresolved handback and materializes a resolved handback without changing the request', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'capability-handback-'));
    directories.push(directory);
    const path = join(directory, 'events.jsonl');
    const log = await RunLog.open(path, 'job-001');
    const request = fixtureRequest();
    const task = fixtureTask(request);
    const plan = fixturePlan(request, task);
    await commitCapabilityTransition(log, { type: 'capability-requested', data: { request: request.id, parent: 'wi-001', assignment: request.assignment, invocation: request.invocation } },
      [{ path: capabilityLayout.request(request.id), id: request.id, revision: 1, body: request }]);
    await commitCapabilityTransition(log, { type: 'capability-delegated', data: { task: task.id, request: request.id, parent: 'wi-001', invocation: 'inv-0002', planRevision: 1 } }, [
      { path: capabilityLayout.task(task.id), id: task.id, revision: 1, body: task },
      { path: capabilityLayout.plan(task.id, 1), id: task.id, revision: 1, body: plan },
    ]);
    await commitCapabilityTransition(log, { type: 'capability-verification-started', data: { task: task.id, invocation: 'inv-0002' } }, []);
    const handbackFor = (current: CapabilityPlan) => ({
      schema: 'ramify-agent.capability-handback/1' as const, task: task.id, request: request.id,
      plan: { id: task.id, revision: current.revision, hash: recordHash(current) },
      sourceRevision: 'source-1', returnedTree: 'b'.repeat(64), deltaFromSuspension: ['subs/a/src/caller.ts'],
      summary: 'A uses B', interfaces: [{ path: 'subs/b/src/result.ts', symbols: ['readResult'], use: 'A formats the fact' }],
      compatibility: [], checks: [{ id: 'gate-1', revision: 1, hash: 'c'.repeat(64) }], reviews: [], limitations: [],
    });
    await expect(commitCapabilityTransition(log, { type: 'capability-handed-back', data: { task: task.id, handback: task.id, invocation: 'inv-0002' } },
      [{ path: capabilityLayout.handback(task.id), id: task.id, revision: 1, body: handbackFor(plan) }])).rejects.toThrow('resolved structural evidence');
    expect(log.count('capability-handed-back')).toBe(0);
    await commitCapabilityTransition(log, { type: 'capability-verification-failed', data: { task: task.id, finding: 'Unresolved example' } }, []);
    const covered: CapabilityPlan = { ...plan, revision: 2, basedOn: 1, revisionReason: 'Real A test passed',
      useCases: [{ ...plan.useCases[0]!, coverage: { state: 'exercised', tests: ['a-format'], candidate: 'source-1', configuration: 'vitest-1' } }],
    };
    await commitCapabilityTransition(log, { type: 'capability-plan-revised', data: { task: task.id, revision: 2, basedOn: 1, invocation: 'inv-0002' } },
      [{ path: capabilityLayout.plan(task.id, 2), id: task.id, revision: 2, body: covered }]);
    await commitCapabilityTransition(log, { type: 'capability-verification-started', data: { task: task.id, invocation: 'inv-0002' } }, []);
    await commitCapabilityTransition(log, { type: 'capability-handed-back', data: { task: task.id, handback: task.id, invocation: 'inv-0002' } },
      [{ path: capabilityLayout.handback(task.id), id: task.id, revision: 1, body: handbackFor(covered) }]);
    const reopened = await RunLog.open(path, 'job-001');
    expect(await reopened.ledger.readRecord(capabilityLayout.handback(task.id), capabilitySchemas.handback)).toEqual({
      kind: 'valid', value: handbackFor(covered),
    });
    expect(committedRecords(reopened.ledger.replay()).capabilityRequests.get(request.id)).toEqual(request);
  });
});
