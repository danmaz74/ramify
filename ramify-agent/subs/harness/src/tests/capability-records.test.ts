import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RunLog } from '../run/log.js';
import { commitCapabilityTransition } from '../capability/ledger.js';
import { capabilityLayout, capabilityRequestSchema, capabilitySchemas, type CapabilityPlan } from '../capability/records.js';
import { committedRecords, recordHash } from '../work/committed.js';
import { capabilityFixtureIds, copyCapabilityFixture, fixturePlan, fixtureRequest, fixtureTask } from './helpers/capability.js';
import { obligationsOf } from '../work/obligations.js';
import { submissionHash } from './helpers/obligations.js';
import { mockGit } from './helpers/mock-git.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { openRuns, runPath } from './helpers/runs.js';
import { RunQueries } from '../projections/queries.js';

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

describe('PB3-D01 PB3-D05: registrations beside the capability records', () => {
  it('PB3-D01 registers a case and a test through the real ledger without changing the original request, examples or plan cases', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'capability-registration-'));
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
    const by = { by: 'inv-0002', submission: submissionHash('f') };
    const responsible = { kind: 'capability-task' as const, id: task.id };
    await log.append({ type: 'obligation-registered', data: { id: `${task.id}.case.${capabilityFixtureIds.example}`, kind: 'scenario', responsible, ...by, case: capabilityFixtureIds.example } });
    await log.append({ type: 'obligation-registered', data: { id: 'test-001', kind: 'test', responsible, ...by, description: 'B keeps the old text for D' } });
    await log.append({ type: 'obligation-reported', data: { id: task.id, judgment: 'done', basedOnRevision: 0, revision: 1, ...by } });
    // A registration of the wrong shape is no log line.
    await expect(log.append({ type: 'obligation-registered', data: { id: 'test-002', kind: 'test', responsible, ...by } as never })).rejects.toThrow();

    const reopened = await RunLog.open(path, 'job-001');
    const committed = committedRecords(reopened.ledger.replay());
    expect(committed.capabilityRequests.get(request.id)).toEqual(request);
    expect(committed.capabilityPlans.get(task.id)).toEqual([plan]);
    expect(committed.capabilityPlans.get(task.id)?.[0]?.originalExamples).toEqual([capabilityFixtureIds.example]);
    const { obligations } = obligationsOf({ scenarios: [], workItems: [], events: reopened.events });
    expect([...obligations.values()].map(one => [one.id, one.kind, one.status, one.revision, one.case, one.description])).toEqual([
      [task.id, 'outcome', 'done', 1, null, null],
      [`${task.id}.case.${capabilityFixtureIds.example}`, 'scenario', 'pending', 0, capabilityFixtureIds.example, null],
      ['test-001', 'test', 'pending', 0, null, 'B keeps the old text for D'],
    ]);
  });

  it('PB3-D05 refuses an old-policy run holding scenario declarations and coverage records, naming both versions, and never reads them as reports', async () => {
    const fixture = await copyCapabilityFixture();
    directories.push(fixture.root);
    const id = '20261007T170000Z-000001';
    const directory = runPath(fixture.root, 'need', id, '');
    await mkdir(join(directory, 'capabilities', 'cap-001', 'plan'), { recursive: true });
    const plan = { ...fixturePlan(), revision: 2, basedOn: 1, useCases: [{ ...fixturePlan().useCases[0]!, coverage: { state: 'exercised', tests: ['subs/a/src/tests/caller.test.ts'] } }] };
    const files: Record<string, string> = {
      'job.json': JSON.stringify({ schema: 'ramify-agent.job/4', kind: 'implementation', jobId: id, planId: 'need', policy: { version: 'run-policy/6' } }),
      'events.jsonl': [
        { type: 'scenario-declared', data: { scenario: 'sc-001', by: 'inv-0003', state: 'declared' } },
        { type: 'scenario-implemented', data: { scenario: 'sc-001', gate: 'ga-0004' } },
      ].map(line => JSON.stringify(line)).join('\n') + '\n',
      'capabilities/cap-001/plan/2.json': JSON.stringify(plan),
    };
    for (const [file, text] of Object.entries(files)) await writeFile(join(directory, file), text);
    const ramify = new FakeRamifyCli();
    const opened = await openRuns(fixture.root, { production: true, git: mockGit(), ramify, script: () => [] });
    try {
      expect(opened.recovery.skipped).toEqual([`need/${id}`]);
      const refusal = /Run policy run-policy\/6 is refused by run-policy\/7; a fresh run is required/u;
      expect(() => opened.service.getRun('need', id)).toThrow(refusal);
      expect(() => opened.service.committed('need', id)).toThrow(refusal);
      const queries = new RunQueries(opened.service);
      await expect(queries.scenarios('need', id)).rejects.toThrow(refusal);
      expect((await queries.list('need')).unserved).toEqual([expect.objectContaining({ jobId: id, code: 'unsupported-version', message: expect.stringMatching(refusal) })]);
      for (const [file, text] of Object.entries(files)) expect(await readFile(join(directory, file), 'utf8')).toBe(text);
      expect(ramify.calls).toEqual([]);
    } finally {
      await opened.service.close();
    }
  }, 60_000);
});
