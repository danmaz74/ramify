import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Script } from '../../subs/agent/src/scripted.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { checkCommand } from '../checks/records.js';
import { createLocalCommandCheckExecution } from './helpers/direct-check-execution.js';
import { commitCapabilityTransition } from '../capability/ledger.js';
import { recoverCommits } from '../jobs/commit.js';
import { committedRecords, refOf } from '../work/committed.js';
import { capabilityDependencyCycle, replayCapabilityState } from '../capability/state.js';
import { capabilityLayout } from '../capability/records.js';
import { RunLog } from '../run/log.js';
import { copyCapabilityFixture, fixturePlan, fixtureRequest, fixtureTask, openCapabilityRuns } from './helpers/capability.js';
import { analysis, entry } from './helpers/analysis.js';
import { assign, edit, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { directReadinessExecution } from './helpers/external-tools.js';
import { freeze, initRepository, runEventsOnDisk, staleCrashLock, startRun, stopRun, testPolicy, until } from './helpers/runs.js';
import { decision, forkDecision, forkPartial } from './helpers/placement.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

test('CA21 CA29 CA32: a nested request keeps its parent assignment and depth-first authority in the real ledger', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'capability-nested-'));
  directories.push(directory);
  const log = await RunLog.open(join(directory, 'events.jsonl'), 'job-001');
  const request = fixtureRequest();
  const task = fixtureTask(request);
  const plan = fixturePlan(request, task);
  await commitCapabilityTransition(log, { type: 'capability-requested', data: {
    request: request.id, parent: request.parent.id, assignment: request.assignment, invocation: request.invocation,
  } }, [{ path: capabilityLayout.request(request.id), id: request.id, revision: 1, body: request }]);
  await commitCapabilityTransition(log, { type: 'capability-delegated', data: {
    task: task.id, request: request.id, parent: task.parent.id, invocation: 'inv-0002', planRevision: 1,
  } }, [
    { path: capabilityLayout.task(task.id), id: task.id, revision: 1, body: task },
    { path: capabilityLayout.plan(task.id, 1), id: task.id, revision: 1, body: plan },
  ]);
  // The assignment event is a ledger event; its immutable body is exercised
  // by the service assignment tests, which use the real write scope resolver.
  await log.append({ type: 'capability-assigned', data: { task: task.id,
    assignment: 'cap-001.i01', sequence: 1, invocation: 'inv-0002' } });
  const childRequest = { ...request, id: 'need-002', parent: { kind: 'capability-task' as const, id: task.id },
    assignment: 'cap-001.i01', invocation: 'inv-0003', original: { ...request.original,
      examples: request.original.examples.map(example => ({ ...example, id: 'need-002.ex01' })) } };
  await expect(commitCapabilityTransition(log, { type: 'capability-requested', data: {
    request: childRequest.id, parent: task.id, assignment: 'cap-001.i02', invocation: childRequest.invocation,
  } }, [{ path: capabilityLayout.request(childRequest.id), id: childRequest.id, revision: 1, body: childRequest }])).rejects.toThrow();
  expect(log.count('capability-requested')).toBe(1);
  await commitCapabilityTransition(log, { type: 'capability-requested', data: {
    request: childRequest.id, parent: task.id, assignment: childRequest.assignment, invocation: childRequest.invocation,
  } }, [{ path: capabilityLayout.request(childRequest.id), id: childRequest.id, revision: 1, body: childRequest }]);
  const childTask = { ...fixtureTask(childRequest), id: 'cap-002', request: childRequest.id,
    parent: childRequest.parent, originatingAssignment: childRequest.assignment, source: childRequest.source,
    provider: task.provider, deferredWorkItems: task.deferredWorkItems };
  const childPlan = { ...fixturePlan(childRequest, childTask), task: childTask.id };
  await commitCapabilityTransition(log, { type: 'capability-delegated', data: {
    task: childTask.id, request: childRequest.id, parent: task.id, invocation: 'inv-0004', planRevision: 1,
  } }, [
    { path: capabilityLayout.task(childTask.id), id: childTask.id, revision: 1, body: childTask },
    { path: capabilityLayout.plan(childTask.id, 1), id: childTask.id, revision: 1, body: childPlan },
  ]);
  const reopened = await RunLog.open(join(directory, 'events.jsonl'), 'job-001');
  const state = replayCapabilityState(reopened.events);
  expect(state.stack).toEqual(['wi-001', 'cap-001', 'cap-002']);
  expect(state.tasks.get('cap-001')?.status).toBe('awaiting-dependency');
  expect(state.tasks.get('cap-001')?.activeAssignment).toBe('cap-001.i01');
  expect(state.tasks.get('cap-001')?.nextAssignmentSequence).toBe(2);
  expect(state.tasks.get('cap-002')?.nextAssignmentSequence).toBe(1);
  expect(capabilityDependencyCycle(state, 'cap-002', 'cap-001')).toEqual(['cap-002', 'cap-001', 'cap-002']);
  expect(capabilityDependencyCycle(state, 'cap-002', 'cap-003')).toBeNull();
});

test('CA21: exact ancestor task reference is rejected while another need in the same provider is allowed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'capability-cycle-'));
  directories.push(directory);
  const log = await RunLog.open(join(directory, 'events.jsonl'), 'job-001');
  const request = fixtureRequest();
  const task = fixtureTask(request);
  const plan = fixturePlan(request, task);
  await commitCapabilityTransition(log, { type: 'capability-requested', data: {
    request: request.id, parent: request.parent.id, assignment: request.assignment, invocation: request.invocation,
  } }, [{ path: capabilityLayout.request(request.id), id: request.id, revision: 1, body: request }]);
  await commitCapabilityTransition(log, { type: 'capability-delegated', data: {
    task: task.id, request: request.id, parent: task.parent.id, invocation: 'inv-0002', planRevision: 1,
  } }, [
    { path: capabilityLayout.task(task.id), id: task.id, revision: 1, body: task },
    { path: capabilityLayout.plan(task.id, 1), id: task.id, revision: 1, body: plan },
  ]);
  await log.append({ type: 'capability-assigned', data: { task: task.id,
    assignment: 'cap-001.i01', sequence: 1, invocation: 'inv-0002' } });
  const nested = { ...request, id: 'need-002', parent: { kind: 'capability-task' as const, id: task.id },
    assignment: 'cap-001.i01', invocation: 'inv-0003', original: { ...request.original,
      examples: request.original.examples.map(example => ({ ...example, id: 'need-002.ex01' })) } };
  const input = { type: 'capability-requested' as const, data: { request: nested.id, parent: task.id,
    assignment: nested.assignment, invocation: nested.invocation } };
  await expect(commitCapabilityTransition(log, input, [{ path: capabilityLayout.request(nested.id),
    id: nested.id, revision: 1, body: { ...nested, original: { ...nested.original,
      revises: { task: task.id, reason: 'Would wait for the active ancestor' } } } }])).rejects.toThrow('Exact capability dependency cycle');
  expect(log.count('capability-requested')).toBe(1);
  await commitCapabilityTransition(log, input, [{ path: capabilityLayout.request(nested.id), id: nested.id, revision: 1, body: nested }]);
  expect(log.count('capability-requested')).toBe(2);
});

test('CA19 CA26: a committed plan revision rematerializes once and rejects stale replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'capability-plan-replay-'));
  directories.push(directory);
  const log = await RunLog.open(join(directory, 'events.jsonl'), 'job-001');
  const request = fixtureRequest();
  const task = fixtureTask(request);
  const initial = fixturePlan(request, task);
  await commitCapabilityTransition(log, { type: 'capability-requested', data: {
    request: request.id, parent: request.parent.id, assignment: request.assignment, invocation: request.invocation,
  } }, [{ path: capabilityLayout.request(request.id), id: request.id, revision: 1, body: request }]);
  await commitCapabilityTransition(log, { type: 'capability-delegated', data: {
    task: task.id, request: request.id, parent: task.parent.id, invocation: 'inv-0002', planRevision: 1,
  } }, [
    { path: capabilityLayout.task(task.id), id: task.id, revision: 1, body: task },
    { path: capabilityLayout.plan(task.id, 1), id: task.id, revision: 1, body: initial },
  ]);
  const revised = { ...initial, revision: 2, basedOn: 1, updatedBy: 'inv-0002',
    revisionReason: 'Current provider API was inspected', proposedInterface: 'B exports an evidenced source reader' };
  const input = { type: 'capability-plan-revised' as const,
    data: { task: task.id, revision: 2, basedOn: 1, invocation: 'inv-0002' } };
  const body = [{ path: capabilityLayout.plan(task.id, 2), id: task.id, revision: 2, body: revised }];
  await commitCapabilityTransition(log, input, body);
  await rm(join(directory, capabilityLayout.plan(task.id, 2)));
  const recovered = await recoverCommits(log.ledger);
  expect(recovered.rewritten).toContain(capabilityLayout.plan(task.id, 2));
  const reopened = await RunLog.open(join(directory, 'events.jsonl'), 'job-001');
  expect(committedRecords(reopened.ledger.replay()).capabilityPlans.get(task.id)?.at(-1)).toEqual(revised);
  await expect(commitCapabilityTransition(reopened, input, body)).rejects.toThrow();
  expect(reopened.count('capability-plan-revised')).toBe(1);
});

test('CA21 CA29 CA32: B asks for C and only a fresh child coordinator runs while parent B assignment waits', async () => {
  const fixture = await copyCapabilityFixture(true);
  const cleanups: Array<() => Promise<void>> = [fixture.remove];
  try {
    await initRepository(fixture.root);
    await installMiniRunner(fixture.root);
    const a = 'capability-coordination/a';
    const b = 'capability-coordination/b';
    const c = 'capability-coordination/c';
    let engineerTurns = 0;
    let parentTurns = 0;
    let childTurns = 0;
    let childReturned = false;
    let resumedBPrompt = '';
    let sourceCaptures = 0;
    let closing: Promise<void> | undefined;
    let closeFirst: (() => Promise<void>) | undefined;
    const starts: string[] = [];
    const script: Script = spec => {
      starts.push(`${spec.role}:${spec.submission.name}:${spec.session.mode}`);
      if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
      if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
      if (spec.submission.name === 'submit_capability_qualification') {
        const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2],
          provider: ids[1] === 'need-001' ? b : c, placementReason: 'Source owner supplies its own behavior',
          constraints: [], requirementRefs: [] });
      }
      if (spec.role === 'engineer') {
        engineerTurns += 1;
        if (engineerTurns === 1) return submit({ kind: 'capability-needed', summary: 'A needs B source', request: {
          need: 'B fact with source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
        } });
        if (engineerTurns === 2) return submit({ kind: 'capability-needed', summary: 'B needs C normalization', request: {
          need: 'Normalize source in C for B', usage: [{ path: 'subs/b/src/fact.ts', use: 'Normalize B source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'normalizes source', code: 'expect(normalizeSource("B")).toBe("B")', designation: 'pseudocode' }],
          suggestedProvider: { module: c, reason: 'C owns normalization' },
        } }, edit('fact.ts', "return 'old';", "return 'old from C';"));
        if (!childReturned) throw new Error('B resumed before child handback');
        resumedBPrompt = spec.prompt;
        return submit({ kind: 'completion-proposed', summary: 'B completed its original assignment after C returned', findings: [] });
      }
      if (spec.role === 'capability-architect') {
        if (spec.submission.name !== 'submit_capability_action') throw new Error('Unexpected child action');
        const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        const basis = { task: ids[1], planRevision: Number(ids[2]), invocation: ids[3] };
        if (basis.task === 'cap-001') {
          parentTurns += 1;
          if (parentTurns > 1) {
            if (!childReturned) throw new Error('Parent resumed while child was active');
            return [{ kind: 'wait', ms: 60_000 }];
          }
          return submit({ ...basis, kind: 'assign', owner: b, purpose: 'Provide source', approach: 'Read C source',
            requirementRefs: [], intendedEvidence: ['B returns source'] });
        }
        childTurns += 1;
        return childTurns === 1 ? submit({ ...basis, kind: 'partial', progress: 'C source inspected',
          unfinished: ['Implement C and verify B'] }) : [{ kind: 'wait', ms: 60_000 }];
      }
      return [];
    };
    const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
      afterWrite: async (write: string) => {
        if (write === 'capability-source-captured' && ++sourceCaptures === 2) closing = closeFirst?.();
      } };
    const first = await openCapabilityRuns(fixture.root, options);
    closeFirst = () => first.service.close();
    const receipt = await first.service.execute(startRun('need'));
    await until(() => closing !== undefined, 30_000);
    await closing;
    const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(before.filter(event => event.type === 'capability-requested')).toHaveLength(1);
    expect(before.filter(event => event.type === 'capability-delegated')).toHaveLength(1);
    const opened = await openCapabilityRuns(fixture.root, options);
    cleanups.push(() => opened.service.close());
    await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'capability-delegated' && event.data.task === 'cap-002') ||
      (opened.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 30_000);
    const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(events.filter(event => event.type === 'job-failed')).toHaveLength(0);
    expect(events.filter(event => event.type === 'capability-delegated')).toHaveLength(2);
    expect(events.filter(event => event.type === 'capability-requested')).toHaveLength(2);
    expect(replayCapabilityState(events).stack).toEqual(['wi-001', 'cap-001', 'cap-002']);
    expect(replayCapabilityState(events).tasks.get('cap-001')?.activeAssignment).toBe('cap-001.i01');
    expect(events.filter(event => event.type === 'capability-assignment-settled')).toHaveLength(0);
    expect(events.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
    expect(starts).toContain('capability-architect:submit_capability_action:fresh');
    expect(starts).toContain('capability-architect:submit_capability_qualification:fresh');
    await opened.service.close();
    // A synthetic accepted child record isolates dispatch restoration. Real
    // gate and semantic handback acceptance is exercised separately.
    const log = await RunLog.open(join(fixture.root, 'plans/need/.harness/jobs', receipt.jobId, 'events.jsonl'), receipt.jobId);
    const committed = committedRecords(log.ledger.replay());
    const child = committed.capabilityTasks.get('cap-002')!;
    const request = committed.capabilityRequests.get(child.request)!;
    const priorPlan = committed.capabilityPlans.get(child.id)!.at(-1)!;
    const basis = replayCapabilityState(log.events).tasks.get(child.id)!.coordinatorInvocation!;
    const revised = { ...priorPlan, revision: 2, basedOn: 1, updatedBy: basis,
      revisionReason: 'Synthetic accepted child projection for requester dispatch',
      useCases: priorPlan.useCases.map(useCase => ({ ...useCase, coverage: { state: 'exercised' as const,
        tests: ['subs/b/src/tests/fact.test.ts'], candidate: child.source.tree, configuration: 'projection-fixture' } })) };
    await commitCapabilityTransition(log, { type: 'capability-plan-revised', data: {
      task: child.id, basedOn: 1, revision: 2, invocation: basis,
    } }, [{ path: capabilityLayout.plan(child.id, 2), id: child.id, revision: 2, body: revised }]);
    await commitCapabilityTransition(log, { type: 'capability-verification-started', data: { task: child.id, invocation: basis } }, []);
    const handback = { schema: 'ramify-agent.capability-handback/1' as const, task: child.id, request: request.id,
      plan: refOf(child.id, 2, revised), sourceRevision: 'projection-source', returnedTree: child.source.tree,
      deltaFromSuspension: [], summary: 'C normalization returned to B',
      interfaces: [{ path: 'subs/c/src/source.ts', symbols: ['normalizeSource'], use: 'B normalizes the source' }],
      compatibility: [], checks: [refOf('projection-gate', 1, { kind: 'projection' })], reviews: [], limitations: [] };
    await commitCapabilityTransition(log, { type: 'capability-handed-back', data: {
      task: child.id, handback: child.id, invocation: basis,
    } }, [{ path: capabilityLayout.handback(child.id), id: child.id, revision: 1, body: handback }]);
    childReturned = true;
    const resumed = await openCapabilityRuns(fixture.root, options);
    cleanups.push(() => resumed.service.close());
    await until(() => (resumed.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'capability-assignment-settled' && event.data.assignment === 'cap-001.i01') ||
      (resumed.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 30_000);
    const returnedEvents = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(returnedEvents.filter(event => event.type === 'job-failed'), JSON.stringify(returnedEvents.slice(-12))).toHaveLength(0);
    expect(returnedEvents.filter(event => event.type === 'capability-assigned' && event.data.task === 'cap-001')).toHaveLength(1);
    expect(returnedEvents.filter(event => event.type === 'capability-assignment-settled' && event.data.assignment === 'cap-001.i01')).toHaveLength(1);
    expect(resumedBPrompt).toContain('Dependency returned');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = resumed.service.events('need', receipt.jobId)!;
      try { await resumed.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
      catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
    }
    await resumed.service.settled('need', receipt.jobId);
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}, 45_000);

for (const boundary of ['request-placement', 'unresolved'] as const) {
for (const restartBoundary of boundary === 'request-placement'
  ? ['none', 'placement-intent', 'fork-accepted', 'fork-partial', 'qualification-accepted'] as const : ['none', 'fork-accepted'] as const) {
test(`CA21 CA32: nested ${boundary} returns a global decision before child delegation${restartBoundary === 'none' ? '' : ` after ${restartBoundary} restart`}`, async () => {
  const fixture = await copyCapabilityFixture(true);
  const cleanups: Array<() => Promise<void>> = [fixture.remove];
  try {
    await initRepository(fixture.root);
    await installMiniRunner(fixture.root);
    const a = 'capability-coordination/a';
    const b = 'capability-coordination/b';
    const c = 'capability-coordination/c';
    let engineerTurns = 0;
    let parentTurns = 0;
    let nestedTurns = 0;
    let boundaryReturned = false;
    let frozen = false;
    let forkTurns = 0;
    const forkPrompts: string[] = [];
    const script: Script = spec => {
      if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
      if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
      if (spec.submission.name === 'submit_capability_qualification') {
        const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        if (ids[1] === 'need-002') {
          nestedTurns += 1;
          if (nestedTurns === 1) return submit({ kind: boundary, request: ids[1], invocation: ids[2],
            problem: 'C ownership needs a wider decision', evidence: ['C owns source normalization'] });
          boundaryReturned = spec.prompt.includes('# Boundary decision');
        }
        return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2],
          provider: ids[1] === 'need-001' ? b : c, placementReason: 'Source owner supplies its behavior',
          constraints: [], requirementRefs: [] });
      }
      if (spec.role === 'global-fork') {
        forkTurns += 1;
        forkPrompts.push(spec.prompt);
        if (restartBoundary === 'fork-partial' && forkTurns === 1) return submit(forkPartial(
          ['C contract evidence is incomplete'], ['Inspect B use before deciding']));
        return submit(forkDecision({ decision: decision({
        question: 'Where should normalization live?', outcome: 'reuse', capability: 'b-entry',
        owner: b, rationale: 'B keeps the source responsibility and delegates normalization to C.',
        evidence: { citations: [{ module: b }], gaps: [] },
        }), brief: 'B keeps the source responsibility and may delegate C normalization.' }));
      }
      if (spec.role === 'engineer') {
        engineerTurns += 1;
        if (engineerTurns === 1) return submit({ kind: 'capability-needed', summary: 'A needs B source', request: {
          need: 'B fact for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
        } });
        return submit({ kind: 'capability-needed', summary: 'B needs C normalization', request: {
          need: 'Normalize source in C for B', usage: [{ path: 'subs/b/src/fact.ts', use: 'Normalize source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'normalizes source', code: 'expect(normalizeSource("B")).toBe("B")', designation: 'pseudocode' }],
          suggestedProvider: { module: c, reason: 'C owns normalization' },
        } });
      }
      if (spec.role === 'capability-architect') {
        const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        if (ids[1] === 'cap-001' && parentTurns++ === 0) return submit({ kind: 'assign', task: ids[1],
          planRevision: Number(ids[2]), invocation: ids[3], owner: b, purpose: 'Provide B source',
          approach: 'Read C source', requirementRefs: [], intendedEvidence: ['B returns source'] });
        return [{ kind: 'wait', ms: 60_000 }];
      }
      return [];
    };
    const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
      afterWrite: async (write: string, runId: string) => {
        if (frozen) return;
        if (restartBoundary === 'placement-intent' && write === 'placement-requested') { frozen = true; await freeze(); }
        if (restartBoundary === 'fork-partial' && write === 'fork-returned-partial') { frozen = true; await freeze(); }
        if (restartBoundary === 'fork-accepted' && write === 'invocation-ended') {
          const events = await runEventsOnDisk(fixture.root, 'need', runId);
          const ended = events.at(-1);
          if (ended?.type === 'invocation-ended' && events.some(started => started.type === 'invocation-started' &&
            started.data.invocation === ended.data.invocation && started.data.role === 'global-fork')) {
            frozen = true;
            await freeze();
          }
        }
        if (restartBoundary === 'qualification-accepted' && write === 'invocation-ended' && nestedTurns === 2) {
          const events = await runEventsOnDisk(fixture.root, 'need', runId);
          const ended = events.at(-1);
          if (ended?.type === 'invocation-ended' && events.some(started => started.type === 'invocation-started' &&
            started.data.invocation === ended.data.invocation && started.data.role === 'capability-architect' &&
            started.data.work.capabilityTask === 'cap-001' && started.data.work.request === 'need-002')) {
            frozen = true;
            await freeze();
          }
        }
      } };
    const first = await openCapabilityRuns(fixture.root, options);
    const receipt = await first.service.execute(startRun('need'));
    let opened = first;
    if (restartBoundary !== 'none') {
      await until(() => frozen, 30_000);
      await staleCrashLock(fixture.root);
      opened = await openCapabilityRuns(fixture.root, options);
    }
    cleanups.push(() => opened.service.close());
    await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'capability-delegated' && event.data.task === 'cap-002') ||
      (opened.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 30_000);
    const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(events.filter(event => event.type === 'job-failed'), JSON.stringify(events.slice(-12))).toHaveLength(0);
    expect(events.filter(event => event.type === boundary.replace('request-', '') + '-requested')).toHaveLength(1);
    expect(events.filter(event => event.type === 'decision-accepted')).toHaveLength(1);
    expect(events.filter(event => event.type === 'capability-delegated')).toHaveLength(2);
    expect(nestedTurns).toBe(2);
    expect(boundaryReturned).toBe(true);
    if (restartBoundary === 'fork-partial') {
      expect(events.filter(event => event.type === 'fork-returned-partial')).toHaveLength(1);
      expect(forkPrompts[1]).toContain('C contract evidence is incomplete');
    }
    expect(replayCapabilityState(events).stack).toEqual(['wi-001', 'cap-001', 'cap-002']);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = opened.service.events('need', receipt.jobId)!;
      try { await opened.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
      catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
    }
    await opened.service.settled('need', receipt.jobId);
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}, 60_000);
}
}

for (const restartAfterHandback of [false, true]) {
test(`CA19 CA21 CA32: a real C child gate and review hand back to B${restartAfterHandback ? ' after service restart' : ''}`, async () => {
  const fixture = await copyCapabilityFixture(true);
  const cleanups: Array<() => Promise<void>> = [fixture.remove];
  try {
    await mkdir(join(fixture.root, 'subs/c/src/tests'), { recursive: true });
    await writeFile(join(fixture.root, 'subs/c/src/tests/source.test.ts'),
      "import { expect, test } from 'vitest';\nimport { normalizeSource } from '../source.js';\ntest('C normalizes source', () => expect(normalizeSource(' b ')).toBe('b'));\n");
    await initRepository(fixture.root);
    await installMiniRunner(fixture.root);
    await rm(join(fixture.root, 'node_modules/vitest'), { recursive: true, force: true });
    await rm(join(fixture.root, 'node_modules/.bin/vitest'), { force: true });
    await symlink(join(process.cwd(), 'node_modules/vitest'), join(fixture.root, 'node_modules/vitest'));
    await symlink(join(process.cwd(), 'node_modules/.bin/vitest'), join(fixture.root, 'node_modules/.bin/vitest'));
    const a = 'capability-coordination/a';
    const b = 'capability-coordination/b';
    const c = 'capability-coordination/c';
    let engineerTurns = 0;
    let childTurns = 0;
    let parentTurns = 0;
    let candidate = '';
    let config = '';
    let returnedPrompt = '';
    let frozenHandback = false;
    let service: Awaited<ReturnType<typeof openCapabilityRuns>>['service'] | undefined;
    const script: Script = spec => {
      if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
      if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
      if (spec.submission.name === 'submit_capability_qualification') {
        const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2],
          provider: ids[1] === 'need-001' ? b : c, placementReason: 'Source owner supplies its behavior',
          constraints: [], requirementRefs: [] });
      }
      if (spec.role === 'engineer') {
        engineerTurns += 1;
        if (engineerTurns === 1) return submit({ kind: 'capability-needed', summary: 'A needs B source', request: {
          need: 'B fact with source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
        } });
        if (engineerTurns === 2) return submit({ kind: 'capability-needed', summary: 'B needs C normalization', request: {
          need: 'Normalize source in C for B', usage: [{ path: 'subs/b/src/fact.ts', use: 'Normalize B source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'normalizes source', code: "expect(readFact()).toBe('B')", designation: 'pseudocode' }],
          suggestedProvider: { module: c, reason: 'C owns normalization' },
        } }, edit('fact.ts', "return 'old';", "return 'old from C';"));
        if (spec.prompt.includes('# Capability assignment cap-002.i01')) return submit({
          kind: 'completion-proposed', summary: 'C normalizes the source', findings: [],
        }, write('source.ts', 'export function normalizeSource(value: string): string { return value.trim().toUpperCase(); }\n'),
        write('tests/source.test.ts', "import { expect, test } from 'vitest';\nimport { normalizeSource } from '../source.js';\ntest('C normalizes source', () => expect(normalizeSource(' b ')).toBe('B'));\n"));
        if (spec.prompt.includes('# Capability assignment cap-002.i02')) return submit({
          kind: 'completion-proposed', summary: 'B uses the real C normalizer', findings: [],
        }, write('fact.ts', "import { normalizeSource } from '../../c/src/source.js';\nexport function readFact(): string { return normalizeSource(' b '); }\n"),
        write('tests/fact.test.ts', "import { expect, test } from 'vitest';\nimport { readFact } from '../fact.js';\ntest('B uses C normalized source', () => expect(readFact()).toBe('B'));\n"));
        if (spec.prompt.includes('# Dependency returned')) {
          returnedPrompt = spec.prompt;
          return submit({ kind: 'completion-proposed', summary: 'B completed the original source assignment', findings: [] });
        }
        throw new Error(`Unexpected engineer turn ${engineerTurns}: ${spec.prompt.slice(0, 300)}`);
      }
      if (spec.role === 'capability-architect') {
        const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        const basis = { task: ids[1], planRevision: Number(ids[2]), invocation: ids[3] };
        if (basis.task === 'cap-001') {
          parentTurns += 1;
          return parentTurns > 1 ? [{ kind: 'wait', ms: 60_000 }]
            : submit({ ...basis, kind: 'assign', owner: b, purpose: 'Provide B source', approach: 'Use C normalization',
            requirementRefs: [], intendedEvidence: ['B returns C normalized source'] });
        }
        childTurns += 1;
        if (childTurns === 1) return submit({ ...basis, kind: 'assign', owner: c, purpose: 'Normalize source',
          approach: 'Implement and test C behavior', requirementRefs: [], intendedEvidence: ['C test passes'] });
        if (childTurns === 2) return submit({ ...basis, kind: 'assign', owner: b, purpose: 'Use normalized source in B',
          approach: 'Call real C from B', requirementRefs: [], intendedEvidence: ['B test passes'] });
        if (childTurns !== 3 || candidate === '' || config === '') throw new Error('Child candidate was not captured');
        return [{ kind: 'tool', tool: 'update_capability_plan', input: { task: basis.task,
          basedOn: basis.planRevision, invocation: basis.invocation, reason: 'Real C and B tests cover the original case',
          changes: { useCases: [{ id: 'need-002.ex01', expectedBehavior: 'B uses normalized C source',
            derivedFrom: ['need-002.ex01'], coverage: { state: 'exercised',
              tests: ['subs/b/src/tests/fact.test.ts', 'subs/c/src/tests/source.test.ts'], candidate, configuration: config } }] } } },
          { kind: 'submit', input: { ...basis, planRevision: basis.planRevision + 1, kind: 'request-handback',
            summary: 'C normalization is used by B',
            coverage: [{ case: 'need-002.ex01', evidence: ['subs/b/src/tests/fact.test.ts', 'subs/c/src/tests/source.test.ts'] }],
            interfaces: [{ path: 'subs/c/src/source.ts', symbols: ['normalizeSource'], use: 'Call from B' }], limitations: [] } }];
      }
      if (spec.role === 'reviewer') {
        const paths = /Changed paths: ([^\n]+)/u.exec(spec.prompt)?.[1]?.split(', ') ?? [];
        return [...paths.map(path => ({ kind: 'tool' as const, tool: 'snapshot_diff', input: { path } })),
          { kind: 'submit', input: { inspected: paths, missing: [], concerns: [] } }];
      }
      return [];
    };
    const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
      checkExecution: createLocalCommandCheckExecution(),
      afterWrite: async (event: string, runId: string) => {
        if (restartAfterHandback && event === 'capability-handed-back' && !frozenHandback &&
          service?.events('need', runId)?.at(-1)?.type === 'capability-handed-back') {
          frozenHandback = true;
          await freeze();
        }
        if (event !== 'capability-assignment-settled') return;
        const settled = service?.events('need', runId)?.at(-1);
        if (settled?.type !== 'capability-assignment-settled' || settled.data.assignment !== 'cap-002.i02') return;
        if (settled.data.endingTree === undefined) throw new Error('Child assignment has no ending candidate');
        candidate = settled.data.endingTree;
        const job = JSON.parse(readFileSync(join(fixture.root, 'plans/need/.harness/jobs', runId, 'job.json'), 'utf8')) as { projectConfig: unknown };
        config = createHash('sha256').update(JSON.stringify(job.projectConfig)).digest('hex');
      },
      policy: (root: string) => {
        const base = testPolicy(root);
        return { ...base, commands: { ...base.commands,
          allTests: checkCommand({ argv: [join(root, 'node_modules/.bin/vitest'), 'run',
            'subs/b/src/tests/fact.test.ts', 'subs/c/src/tests/source.test.ts'], cwd: root, timeoutMs: 30_000 }),
          typeCheck: checkCommand({ argv: [join(process.cwd(), 'node_modules/.bin/tsc'), '--noEmit', '-p', 'tsconfig.json'], cwd: root, timeoutMs: 30_000 }),
        } };
      } } satisfies Parameters<typeof openCapabilityRuns>[1];
    let opened = await openCapabilityRuns(fixture.root, options);
    service = opened.service;
    const receipt = await opened.service.execute(startRun('need'));
    if (restartAfterHandback) {
      await until(() => frozenHandback, 120_000);
      const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
      expect(before.filter(event => event.type === 'capability-handed-back' && event.data.task === 'cap-002')).toHaveLength(1);
      expect(before.filter(event => event.type === 'capability-assignment-settled' && event.data.assignment === 'cap-001.i01')).toHaveLength(0);
      await staleCrashLock(fixture.root);
      opened = await openCapabilityRuns(fixture.root, options);
      service = opened.service;
    }
    cleanups.push(() => opened.service.close());
    await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'capability-assignment-settled' && event.data.assignment === 'cap-001.i01') ||
      (opened.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 120_000);
    const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(events.filter(event => event.type === 'job-failed'), JSON.stringify(events.slice(-18))).toHaveLength(0);
    expect(events.filter(event => event.type === 'capability-handed-back' && event.data.task === 'cap-002')).toHaveLength(1);
    expect(events.filter(event => event.type === 'capability-assignment-settled' && event.data.assignment === 'cap-001.i01')).toHaveLength(1);
    expect(events.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
    expect(returnedPrompt).toContain('Dependency returned');
    const passed = events.filter(event => event.type === 'gate-attempted' && event.data.verdict === 'passed');
    expect(passed.length).toBeGreaterThan(0);
    expect(events.filter(event => event.type === 'capability-review-recorded' && event.data.task === 'cap-002' &&
      event.data.outcome === 'passed')).toHaveLength(1);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = opened.service.events('need', receipt.jobId)!;
      try { await opened.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
      catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
    }
    await opened.service.settled('need', receipt.jobId);
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}, 180_000);
}
