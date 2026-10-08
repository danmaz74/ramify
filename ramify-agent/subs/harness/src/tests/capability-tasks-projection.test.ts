import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test } from 'vitest';
import { capabilityTasksResponseSchema } from '../interfaces/protocol/capability-tasks.js';
import { capabilityLayout } from '../capability/records.js';
import { commitCapabilityTransition } from '../capability/ledger.js';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { createApp } from '../http/app.js';
import { RunQueries } from '../projections/queries.js';
import { capabilityTasksOf } from '../projections/capability-tasks.js';
import { projectEvent } from '../projections/events.js';
import { reachOf } from '../projections/sessions.js';
import { runView } from '../projections/inputs.js';
import type { RunService } from '../run/service.js';
import { RunLog } from '../run/log.js';
import type { RunSession } from '../run/sessions.js';
import { constructedRun, constructedRecord, registered, runId, hash } from './helpers/constructed.js';
import { fixturePlan, fixtureRequest, fixtureTask } from './helpers/capability.js';
import { recordHash } from '../work/committed.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const action of cleanup.splice(0)) await action(); });

function lines() {
  const request = fixtureRequest();
  const task = fixtureTask(request);
  const plan = fixturePlan(request, task);
  return [
    { type: 'capability-requested' as const, data: { request: request.id, parent: 'wi-001', assignment: request.assignment,
      invocation: request.invocation }, records: [{ path: 'requests/need-001.json', body: request }] },
    { type: 'capability-delegated' as const, data: { task: task.id, request: request.id, parent: 'wi-001',
      invocation: 'inv-0002', planRevision: 1 }, records: [
      { path: 'tasks/cap-001.json', body: task }, { path: 'plans/cap-001/1.json', body: plan },
      { path: 'registry/similar.json', body: registered('format-b-fact') },
    ] },
    { type: 'capability-exchange-opened' as const, data: { task: task.id, exchange: 'ex-001', invocation: 'inv-0002' }, records: [
      { path: 'exchanges/ex-001/1.json', body: { schema: 'ramify-agent.capability-exchange/1', id: 'ex-001', task: task.id,
        request: request.id, planRevision: 1, question: 'Which source must A show?', references: ['subs/a/src/caller.ts'], answer: null } },
    ] },
    { type: 'capability-exchange-answered' as const, data: { task: task.id, exchange: 'ex-001', invocation: 'inv-0003' }, records: [
      { path: 'exchanges/ex-001/2.json', body: { schema: 'ramify-agent.capability-exchange/1', id: 'ex-001', task: task.id,
        request: request.id, planRevision: 1, question: 'Which source must A show?', references: ['subs/a/src/caller.ts'],
        answer: { invocation: 'inv-0003', text: 'Show B source metadata', objections: [] } } },
    ] },
    { type: 'capability-verification-started' as const, data: { task: task.id, invocation: 'inv-0002' } },
    { type: 'capability-verification-failed' as const, data: { task: task.id, finding: 'A real test still fails' } },
  ];
}

test('CA23: capability event references identify requests, tasks and assignments', () => {
  const run = constructedRun([
    ...lines(),
    { type: 'capability-assigned', data: { task: 'cap-001', assignment: 'cap-001.i01', sequence: 1, invocation: 'inv-0002' } },
  ]);
  const refs = run.entries.flatMap(entry => projectEvent(entry.transaction.event).refs);
  expect(refs).toEqual(expect.arrayContaining([
    { kind: 'capability-request', id: 'need-001' },
    { kind: 'capability-task', id: 'cap-001' },
    { kind: 'capability-assignment', id: 'cap-001.i01' },
  ]));
});

test('CA23 CA34: request, design, consultation and failed verification remain distinct from registry capability', () => {
  const run = constructedRun(lines());
  const answer = capabilityTasksResponseSchema.parse(capabilityTasksOf(runView(run)));
  expect(answer).toMatchObject({ version: 6, stack: ['wi-001', 'cap-001'],
    requests: [{ id: 'need-001', outcome: 'delegated', task: 'cap-001' }],
    tasks: [{ id: 'cap-001', status: 'coordinating', active: true, provider: 'b',
      source: { delta: [{ path: 'subs/a/src/caller.ts' }] },
      plan: { revision: 1, useCases: [{ id: 'need-001.ex01', expectedBehavior: 'A formats the fact', derivedFrom: ['need-001.ex01'] }] },
      obligations: [{ id: 'cap-001', kind: 'outcome', status: 'pending', report: null }],
      consultations: [{ answer: 'Show B source metadata' }],
      verification: { status: 'failed', findings: ['A real test still fails'] }, handback: null,
      deferredWorkItems: ['wi-002'] }] });
  expect(answer.tasks[0]?.id).not.toBe('format-b-fact');
  expect(answer.tasks[0]?.deferredWorkItems).toEqual(['wi-002']);
  // The examples are the request's context; no case carries a coverage state.
  expect(answer.tasks[0]?.original.examples.map(example => example.id)).toEqual(['need-001.ex01']);
  expect(answer.tasks[0]?.plan.useCases.every(useCase => !('coverage' in useCase))).toBe(true);
});

test('CA23: projection reconstructs the same task after the durable ledger is reopened', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capability-projection-ledger-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'events.jsonl');
  const log = await RunLog.open(path, 'job-001');
  const request = fixtureRequest();
  const task = fixtureTask(request);
  const plan = fixturePlan(request, task);
  await commitCapabilityTransition(log, { type: 'capability-requested', data: {
    request: request.id, parent: request.parent.id, assignment: request.assignment, invocation: request.invocation,
  } }, [{ path: capabilityLayout.request(request.id), id: request.id, revision: 1, body: request }]);
  await commitCapabilityTransition(log, { type: 'capability-delegated', data: {
    task: task.id, request: request.id, parent: task.parent.id, invocation: 'inv-0002', planRevision: 1,
  } }, [{ path: capabilityLayout.task(task.id), id: task.id, revision: 1, body: task },
    { path: capabilityLayout.plan(task.id, 1), id: task.id, revision: 1, body: plan }]);
  const before = capabilityTasksOf(runView({ record: constructedRecord(), directory: root, entries: log.ledger.replay() }));
  const reopened = await RunLog.open(path, 'job-001');
  const after = capabilityTasksResponseSchema.parse(capabilityTasksOf(runView({ record: constructedRecord(), directory: root,
    entries: reopened.ledger.replay() })));
  expect(after).toEqual(before);
  expect(after.tasks).toMatchObject([{ id: 'cap-001', status: 'coordinating', active: true }]);
});

test('CA23: nested dependency and settled partial blocker stay visible in the task projection', () => {
  const request = fixtureRequest();
  const task = fixtureTask(request);
  const plan = fixturePlan(request, task);
  const assignment = { schema: 'ramify-agent.capability-assignment/1', id: 'cap-001.i01', task: task.id,
    sequence: 1, owner: 'b', plan: { id: task.id, revision: 1, hash: recordHash(plan) },
    purpose: 'Implement B source', approach: 'Extend B', requirementRefs: [], intendedEvidence: ['A real test'],
    scope: { revision: 0, base: { module: 'b', included: [] }, extra: [], read: [], bootstrap: [],
      rationale: 'B owns source', resolved: { excluded: [], included: [], ownership: { provider: 'ramify.affected-cli/4', ramifyVersion: 'scripted-lifecycle-only', inputId: 'scripted-scope', configuration: 'tsconfig.json', root: '/p', modules: [{ id: 'app', parent: null, directory: '.' }], exclusions: [] }, roots: [], files: [], view: { status: 'placeholder' } } },
    gate: { tests: { policy: 'owned-by-scope', exactOwners: ['b'], subtrees: [], extraSuites: [] } },
    startingTree: 'a'.repeat(64) };
  const childRequest = { ...request, id: 'need-002', parent: { kind: 'capability-task' as const, id: task.id },
    assignment: assignment.id, invocation: 'inv-0003', original: { ...request.original,
      examples: request.original.examples.map(example => ({ ...example, id: 'need-002.ex01' })) } };
  const child = { ...fixtureTask(childRequest), id: 'cap-002', request: childRequest.id,
    parent: childRequest.parent, originatingAssignment: assignment.id };
  const childPlan = fixturePlan(childRequest, child);
  const run = constructedRun([...lines().slice(0, 2),
    { type: 'capability-assigned', data: { task: task.id, assignment: assignment.id, sequence: 1,
      invocation: 'inv-0002' }, records: [{ path: 'assignments/cap-001.i01.json', body: assignment }] },
    { type: 'capability-requested', data: { request: childRequest.id, parent: task.id,
      assignment: assignment.id, invocation: 'inv-0003' }, records: [{ path: 'requests/need-002.json', body: childRequest }] },
    { type: 'capability-delegated', data: { task: child.id, request: childRequest.id, parent: task.id,
      invocation: 'inv-0004', planRevision: 1 }, records: [{ path: 'tasks/cap-002.json', body: child },
        { path: 'plans/cap-002/1.json', body: childPlan }] },
  ]);
  const answer = capabilityTasksResponseSchema.parse(capabilityTasksOf(runView(run)));
  expect(answer.stack).toEqual(['wi-001', 'cap-001', 'cap-002']);
  expect(answer.tasks).toMatchObject([{ id: 'cap-001', status: 'awaiting-dependency', active: false,
    activeChild: 'cap-002', assignments: [{ id: 'cap-001.i01', status: 'active' }] },
  { id: 'cap-002', status: 'coordinating', active: true, parent: { kind: 'capability-task', id: 'cap-001' } }]);
  const partial = capabilityTasksResponseSchema.parse(capabilityTasksOf(runView(constructedRun([
    ...lines().slice(0, 2),
    { type: 'capability-assigned', data: { task: task.id, assignment: assignment.id, sequence: 1,
      invocation: 'inv-0002' }, records: [{ path: 'assignments/cap-001.i01.json', body: assignment }] },
    { type: 'capability-assignment-settled', data: { task: task.id, assignment: assignment.id,
      outcome: 'partial', unfinished: ['Root-owned stale assertion'] } },
  ]))));
  expect(partial.tasks[0]?.assignments).toMatchObject([{
    id: assignment.id, status: 'partial', failures: ['Root-owned stale assertion'],
  }]);
});

test('CA23 CA34 PB3-D08: committed handback closes only the task, shows the architect\'s report as its judgment and retains the separate B entry', () => {
  const request = fixtureRequest();
  const task = fixtureTask(request);
  const plan = fixturePlan(request, task);
  const handback = { schema: 'ramify-agent.capability-handback/1', task: task.id, request: request.id,
    plan: { id: task.id, revision: 1, hash }, sourceRevision: 'source-1', returnedTree: hash,
    deltaFromSuspension: ['subs/b/src/fact.ts'], summary: 'B fact reader is available to A',
    interfaces: [{ path: 'subs/b/src/fact.ts', symbols: ['readFact'], use: 'A formats B fact' }],
    compatibility: [], checks: [{ id: 'ga-001', revision: 1, hash }], reviews: [], limitations: [] };
  const run = constructedRun([...lines().slice(0, 2),
    { type: 'obligation-reported', data: { id: task.id, judgment: 'done', basedOnRevision: 0, revision: 1,
      where: 'subs/b/src/fact.ts readFact', by: 'inv-0002', submission: hash } },
    { type: 'capability-verification-started', data: { task: task.id, invocation: 'inv-0002' } },
    { type: 'capability-handed-back', data: { task: task.id, handback: task.id, invocation: 'inv-0002' },
      records: [{ path: 'capabilities/cap-001/handback.json', body: handback }] },
  ]);
  const answer = capabilityTasksResponseSchema.parse(capabilityTasksOf(runView(run)));
  expect(answer.stack).toEqual(['wi-001']);
  expect(answer.tasks).toMatchObject([{ id: 'cap-001', status: 'handed-back', active: false,
    deferredWorkItems: ['wi-002'], verification: { status: 'passed' },
    obligations: [{ id: 'cap-001', kind: 'outcome', status: 'done',
      report: { judgment: 'done', revision: 1, where: 'subs/b/src/fact.ts readFact', invocation: 'inv-0002' } }],
    handback: { summary: 'B fact reader is available to A', checks: [{ id: 'ga-001', revision: 1 }] } }]);
  expect(answer.tasks[0]?.handback).not.toHaveProperty('coverage');
  expect(answer.requests).toMatchObject([{ task: 'cap-001', outcome: 'delegated' }]);
});

test('CA24: a historical registry/contract run answers an empty task view without changing its old records', () => {
  const contract = { schema: 'ramify-agent.contract/2', id: 'ct-001', revision: 1,
    capability: { id: 'format-b-fact', revision: 1, hash }, decision: null,
    authority: { kind: 'provider', owner: 'collection-review/workspace/reviews', rationale: 'Provider owns the interface' },
    provider: 'collection-review/workspace/reviews', behavior: 'Format a B fact', mode: 'fake-backed',
    artifacts: { interface: [{ path: 'subs/reviews/src/interfaces/fact.ts', exports: ['Fact'], hash }],
      conformance: [{ path: 'subs/reviews/src/tests/fact.test.ts', hash }],
      fake: [{ path: 'subs/reviews/src/fakes/fact.fake.ts', exports: ['createFactFake'], hash,
        standsFor: [{ fake: 'createFactFake', path: 'subs/reviews/src/fact.ts', export: 'createFact',
          exposure: { to: [], reexposed: [] } }] }], exposure: [] },
    establishedBy: { iteration: 'wi-001.i01', gate: 'ga-001' } };
  const run = constructedRun([{ type: 'job-started', data: {} },
    { type: 'analysis-accepted', data: {}, records: [{ path: 'registry/format-b-fact.json', body: registered('format-b-fact') }] },
    { type: 'contract-registered', data: {}, records: [{ path: 'contracts/ct-001.json', body: contract }] }]);
  expect(runView(run).records.contracts.get('ct-001')).toMatchObject({ mode: 'fake-backed',
    artifacts: { fake: [{ path: 'subs/reviews/src/fakes/fact.fake.ts' }] } });
  const answer = capabilityTasksResponseSchema.parse(capabilityTasksOf(runView(run)));
  expect(answer).toEqual({ schema: 'capability-tasks/1', version: 3,
    terminal: { state: 'running', reason: null, message: null }, requests: [], tasks: [], stack: [] });
});

test('CA23: a failed run keeps its unfinished request and explains the absence of handback', () => {
  const run = constructedRun([lines()[0]!, { type: 'job-failed', data: { reason: 'inputs-changed',
    message: 'Suspended source changed before delegation', evidence: ['subs/a/src/caller.ts'] } }]);
  const answer = capabilityTasksResponseSchema.parse(capabilityTasksOf(runView(run)));
  expect(answer).toMatchObject({ terminal: { state: 'failed', reason: 'inputs-changed' },
    requests: [{ outcome: 'pending', task: null }], tasks: [], stack: ['wi-001'] });
});

test('CA23 CA34: capability architect sessions reach task identity, not a similarly named registry capability', () => {
  const view = runView(constructedRun(lines()));
  const session = { role: 'capability-architect', work: { capabilityTask: 'cap-001', request: 'need-001' } } as RunSession;
  expect(reachOf(view, session)).toEqual({ kind: 'capability-task', task: 'cap-001', request: 'need-001',
    assignment: null, module: null });
});

test('CA23 CA24: HTTP serves only the requested committed version and reports unsupported task records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capability-tasks-http-'));
  let run = constructedRun(lines(), constructedRecord(), root);
  const fake = { projectRoot: root, agentName: 'scripted', committed: () => run, committedRuns: () => [run],
    runVersions: () => [{ planId: 'review-notes', runId, version: run.entries.length }] } as unknown as RunService;
  const queries = new RunQueries(fake);
  expect((await queries.capabilityTasks('review-notes', runId, 6)).version).toBe(6);
  const app = createApp({ projectRoot: root, runs: fake });
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  cleanup.push(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = async (path: string) => { const response = await fetch(origin + path); return { status: response.status, body: await response.json() as unknown }; };
  expect(capabilityTasksResponseSchema.parse((await get(protocolPaths.runCapabilityTasks('review-notes', runId, 6))).body).version).toBe(6);
  expect(errorResponseSchema.parse((await get(protocolPaths.runCapabilityTasks('review-notes', runId, 5))).body).error)
    .toMatchObject({ code: 'stale-version', currentVersion: 6 });
  expect((await get(`/api/v1/plans/review-notes/runs/${runId}/capability-tasks`)).status).toBe(400);
  run = constructedRun([{ type: 'capability-requested', data: { request: 'need-001', parent: 'wi-001',
    assignment: 'wi-001.i01', invocation: 'inv-0001' }, records: [{ path: 'requests/need-001.json', body: {
    ...fixtureRequest(), schema: 'ramify-agent.capability-request/2',
  } }] }], constructedRecord(), root);
  expect(errorResponseSchema.parse((await get(protocolPaths.runCapabilityTasks('review-notes', runId, 1))).body).error.code)
    .toBe('unsupported-version');
});
