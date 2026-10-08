import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { commitCapabilityTransition } from '../capability/ledger.js';
import { recoverCommits } from '../jobs/commit.js';
import { committedRecords } from '../work/committed.js';
import { capabilityDependencyCycle, replayCapabilityState } from '../capability/state.js';
import { capabilityLayout } from '../capability/records.js';
import { RunLog } from '../run/log.js';
import { fixturePlan, fixtureRequest, fixtureTask } from './helpers/capability.js';
import { runDependencyScheduling, runDependencyDecision, runDependencyGate } from './helpers/dependency-flow.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);

const directories: string[] = [];
afterEach(async () => {
  try { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); }
  finally { expect(spawnAttempts(), 'ordinary dependency setup/flow/teardown process attempts').toEqual([]); }
});

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


test('CA21 CA29 CA32: B asks for C and only a fresh child coordinator runs while parent B assignment waits', runDependencyScheduling, 45_000);
for (const boundary of ['request-placement', 'unresolved'] as const) {
  for (const restartBoundary of boundary === 'request-placement'
    ? ['none', 'placement-intent', 'fork-accepted', 'fork-partial', 'qualification-accepted'] as const : ['none', 'fork-accepted'] as const) {
    test(`CA21 CA32: nested ${boundary} returns a global decision before child delegation${restartBoundary === 'none' ? '' : ` after ${restartBoundary} restart`}`,
      () => runDependencyDecision(boundary, restartBoundary), 60_000);
  }
}
// These rows run real harness/ledger logic with labelled synthetic external answers.
// Actual Git/local-command evidence lives in capability-dependencies.boundary.test.ts.
for (const restartAfterHandback of [false, true]) {
  test(`CA19 CA21 CA32: a scripted C child gate and review hand back to B${restartAfterHandback ? ' after service restart' : ''}`,
    () => runDependencyGate(restartAfterHandback), 180_000);
}
