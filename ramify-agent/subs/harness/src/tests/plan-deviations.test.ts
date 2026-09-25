import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { createApp } from '../http/app.js';
import { checkFindingListResponseSchema, type CheckFindingUserCommand } from '../interfaces/protocol/check-findings.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { runResponseSchema } from '../interfaces/protocol/runs.js';
import { CommandRejection } from '../jobs/commands.js';
import type { RunEvent } from '../run/log.js';
import type { RunService } from '../run/service.js';
import { deviationLayout, type PlanDeviation } from '../deviations/records.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { copyFixture } from './helpers/fixture.js';
import { declaringScenarios } from './helpers/declarations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { forkDecision, forkDeviation, forkNothingPossible, registryChange, unresolved } from './helpers/placement.js';
import { installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun, testPolicy, until } from './helpers/runs.js';
import { assign, byRole, completionProposed, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { eventsOf, limit, notes, notesDirectory, plan as reviewPlan, reviewRun, reviewTarget, store, tool } from './helpers/reviews.js';
import { snapshotToolNames } from '../reviews/snapshot.js';
import { reviewLayout, type ReviewRequest } from '../reviews/records.js';
import { assertUnchangedGit, openUnchangedRuns as openRuns } from './helpers/unchanged-run.js';

/*
 * A local architect that finds its request cannot be met as stated answers
 * `unresolved`. The run no longer ends there: the harness forks the global
 * architect with the conflict, and the fork fixes the placement, records a
 * plan deviation the work item goes on under, or finds nothing possible,
 * which ends the run. A deviation is a CheckFinding the person accepts or
 * rejects; it holds neither the work item nor the final gate, and the run
 * completes with it to review. Past the run's limit the run waits for the
 * person's decision instead.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

const plan = 'revision-diff';
const core = 'collection-review/workspace/catalog/core';
const panel = 'collection-review/workspace/catalog/ui';
const completed = [scenariosCommit(plan), 'wi-001', 'wi-002', `final verification of plan "${plan}"`] as const;

async function target(): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  return fixture.root;
}

function analysed() {
  return analysis([
    entry('compare-revisions', core, 'Compares two revisions of one record, field by field.'),
    entry('compare-panel', panel, 'Shows the comparison of two revisions on the record card.'),
  ]);
}

function types(events: readonly RunEvent[]): string[] {
  return events.map(event => event.type);
}

async function serve(service: RunService, root: string): Promise<string> {
  const app = createApp({ projectRoot: root, runs: service });
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function get(origin: string, path: string): Promise<unknown> {
  return (await fetch(`${origin}${path}`)).json();
}

function command<T extends CheckFindingUserCommand['type']>(type: T, runId: string, expectedVersion: number, payload: Record<string, unknown>): Extract<CheckFindingUserCommand, { type: T }> {
  return {
    commandId: `${type}-${Math.random().toString(36).slice(2)}`, expectedVersion, type,
    payload: { planId: plan, jobId: runId, responder: 'dan', ...payload },
  } as Extract<CheckFindingUserCommand, { type: T }>;
}

async function rejection(promise: Promise<unknown>): Promise<CommandRejection> {
  const caught = await promise.then(() => undefined, (error: unknown) => error);
  expect(caught).toBeInstanceOf(CommandRejection);
  return caught as CommandRejection;
}

describe('an unresolved request answered with a plan deviation', () => {
  test('the deviation is recorded, the work item goes on under it, and the run completes with it to review', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(unresolved()), submit(requestCompletion()), submit(requestCompletion())],
      'global-fork': [submit(forkDeviation({ workItems: ['wi-002'] }))],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: completed });
    cleanups.push(() => opened.service.close());
    const origin = await serve(opened.service, project);

    const receipt = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, plan).state).toBe('completed');

    // The unresolved request forked the global architect, whose deviation was
    // recorded; the work item then went on and completed, as did the next.
    const events = await runEventsOnDisk(project, plan, runId);
    expect(types(events).filter(type => ['unresolved-requested', 'view-refreshed', 'plan-deviation-recorded', 'work-item-completed', 'job-completed'].includes(type))).toEqual([
      'unresolved-requested', 'view-refreshed', 'plan-deviation-recorded', 'work-item-completed', 'work-item-completed', 'job-completed',
    ]);
    expect(events.find(event => event.type === 'plan-deviation-recorded')!.data).toMatchObject({
      request: 'ur-001', deviation: 'pd-001', workItem: 'wi-001', checkFinding: 'cf-0001', held: false,
    });
    expect(types(events)).not.toContain('job-failed');
    // The run completed with the deviation to review, never plainly.
    expect(events.at(-1)).toMatchObject({ type: 'job-completed', data: { planDeviations: 1 } });

    // The plan file is unchanged; the deviation beside it quotes the requirement as written.
    const deviation = JSON.parse(await readFile(runPath(project, plan, runId, deviationLayout.deviation('pd-001')), 'utf8')) as PlanDeviation;
    expect(deviation).toMatchObject({
      schema: 'ramify-agent.plan-deviation/1', request: 'ur-001', workItem: 'wi-001', workItems: ['wi-001', 'wi-002'], modules: [core, panel],
      plan: { path: `plans/${plan}/plan.md` }, checkFinding: 'cf-0001', held: false,
    });
    expect(deviation.requirements).toEqual([{ lines: [11, 12], text: '- Serve it through both protocol surfaces: a tRPC query `catalog.compare` and\n  an MCP tool `catalog.compare`, both taking a record ID and two revision IDs.' }]);
    const captured = await readFile(runPath(project, plan, runId, 'input', 'plan.md'), 'utf8');
    expect(await readFile(`${project}/plans/${plan}/plan.md`, 'utf8')).toBe(captured);

    // The fork was a fork of the architect context, for the unresolved request.
    const forks = agent.sessions.filter(session => session.spec.role === 'global-fork');
    expect(forks).toHaveLength(1);
    expect(forks[0]!.spec.prompt).toContain('# Unresolved request ur-001');
    expect(forks[0]!.spec.prompt).toContain('  11  - Serve it through both protocol surfaces');

    // The local architect that asked was continued with the deviation and the requirement it changes; the next work item received it too.
    const architects = agent.sessions.filter(session => session.spec.role === 'local-architect');
    expect(architects).toHaveLength(3);
    expect(architects[1]!.start.mode).toBe('continue');
    const continued = architects[1]!.spec.prompt;
    expect(continued).toContain('## Your unresolved request was answered with a plan deviation');
    expect(continued).toContain('Plan deviation pd-001');
    expect(continued).toContain('an MCP tool `catalog.compare`');
    expect(continued).toContain('What the run does instead: Serve the comparison through the tRPC query');
    expect(architects[2]!.spec.prompt).toContain('## Plan deviations in force');
    expect(architects[2]!.spec.prompt).not.toContain('## Your unresolved request was answered');

    // The deviation is a CheckFinding: the run's, high risk, agent-generated,
    // at the plan lines it departs from, awaiting the person, and first.
    const list = checkFindingListResponseSchema.parse(await get(origin, protocolPaths.runCheckFindings(plan, runId, { select: 'all' })));
    const [first] = list.items;
    expect(first).toMatchObject({
      id: 'cf-0001', workItem: null, standing: 'open', reason: 'awaiting-user-decision', awaiting: 'user-decision',
      risk: 'high', credibility: 'agent-generated', modules: [core, panel], producers: ['plan:deviation'],
      userCommands: ['respond', 'waive'],
      planDeviation: { id: 'pd-001', request: 'ur-001', held: false, followUp: null, requirements: [{ startLine: 11, endLine: 12 }] },
    });
    expect(first!.pendingUserDecision?.options.map(option => option.id)).toEqual(['accept', 'reject']);
    const detail = await get(origin, protocolPaths.runCheckFinding(plan, runId, 'cf-0001')) as { reports: { items: Array<{ observation: unknown }> } };
    expect(detail.reports.items[0]!.observation).toMatchObject({
      kind: 'plan-deviation', locations: [{ path: `plans/${plan}/plan.md`, startLine: 11, endLine: 12 }],
    });

    // The run's outcome says it completed with one plan deviation to review, and it waits for nothing.
    const snapshot = runResponseSchema.parse(await get(origin, protocolPaths.run(plan, runId))).run;
    expect(snapshot).toMatchObject({ state: 'completed', planDeviations: { recorded: 1, toReview: 1 }, decisionRequests: { open: 1, waiting: false, workItems: [] } });
    const page = await get(origin, protocolPaths.runEvents(plan, runId, 0)) as { events: Array<{ transition: string; summary: string }> };
    expect(page.events.find(event => event.transition === 'job-completed')!.summary).toContain('with 1 plan deviation to review');

    // Every other view of the run reads it: its sessions, with the fork of the unresolved request, and its execution map.
    const status = async (path: string) => (await fetch(`${origin}${path}`)).status;
    expect(await status(protocolPaths.runSessions(plan, runId))).toBe(200);
    expect(await status(protocolPaths.runExecutionMap(plan, runId, snapshot.version))).toBe(200);
    expect(await status(protocolPaths.runDecisions(plan, runId))).toBe(200);
    expect(await status(protocolPaths.runWorkItems(plan, runId))).toBe(200);

    // After the run, the person reviews it: rejecting states the follow-up requirement, and accepting waives it.
    const version = () => opened.service.getRun(plan, runId)!.version;
    expect((await rejection(opened.service.execute(command('respond-to-check-finding', runId, version(), {
      checkFinding: 'cf-0001', expectedRevision: 2, request: 'cfd-0001', option: 'reject',
    })))).code).toBe('invalid-request');
    await opened.service.execute(command('waive-check-finding', runId, version(), { checkFinding: 'cf-0001', expectedRevision: 2, reason: 'The tRPC query is enough for now' }));
    const after = runResponseSchema.parse(await get(origin, protocolPaths.run(plan, runId))).run;
    expect(after).toMatchObject({ state: 'completed', planDeviations: { recorded: 1, toReview: 0 } });
    const waived = checkFindingListResponseSchema.parse(await get(origin, protocolPaths.runCheckFindings(plan, runId, { select: 'all' }))).items[0]!;
    expect(waived).toMatchObject({ standing: 'closed', reason: 'waived', pendingUserDecision: null, userCommands: ['revoke'], settlement: { kind: 'waived', by: { kind: 'user', name: 'dan' } } });
    expect((await runEventsOnDisk(project, plan, runId)).at(-1)).toMatchObject({ type: 'check-findings-recorded', data: { cause: { kind: 'user-command' } } });
  }, 120_000);

  test('the person\'s rejection after the run records the requirement for a follow-up run', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(unresolved()), submit(requestCompletion()), submit(requestCompletion())],
      'global-fork': [submit(forkDeviation())],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: completed });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, plan).state).toBe('completed');

    await opened.service.execute(command('respond-to-check-finding', runId, opened.service.getRun(plan, runId)!.version, {
      checkFinding: 'cf-0001', expectedRevision: 2, request: 'cfd-0001', option: 'reject', note: 'Serve the MCP tool too, from a new MCP module.',
    }));
    const origin = await serve(opened.service, project);
    const rejected = checkFindingListResponseSchema.parse(await get(origin, protocolPaths.runCheckFindings(plan, runId, { select: 'all' }))).items[0]!;
    expect(rejected).toMatchObject({
      standing: 'open', reason: 'user-decision-answered', pendingUserDecision: null,
      planDeviation: { followUp: 'Serve the MCP tool too, from a new MCP module.' },
    });
    // Any other CheckFinding of an ended run still accepts no command; a deviation's accepts them.
    expect(runResponseSchema.parse(await get(origin, protocolPaths.run(plan, runId))).run.planDeviations).toEqual({ recorded: 1, toReview: 0 });
  }, 120_000);
});

describe('a deviation that rewords a pending scenario', () => {
  test('the harness renders the feature file from it, commits it, and the finding shows the old and the new text', async () => {
    const project = await target();
    const reworded = [
      'Scenario: A person compares revisions over tRPC',
      '  Given the project as the plan finds it',
      '  When the person uses compare-panel',
      '  Then the comparison the tRPC query returns is shown',
    ];
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(unresolved()), submit(requestCompletion()), submit(requestCompletion())],
      'global-fork': [submit(forkDeviation({ workItems: ['wi-002'], scenarios: [{ scenario: 'sc-002', source: reworded }] }))],
    })));
    const opened = await openRuns(project, {
      agent, inputs: treeInputs(),
      unchangedCheckpoints: [scenariosCommit(plan), { subject: 'Reword sc-002', commit: 'reworded-1', changes: [] }, 'wi-001', 'wi-002', `final verification of plan "${plan}"`],
    });
    cleanups.push(() => opened.service.close());
    const origin = await serve(opened.service, project);
    const receipt = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, plan).state).toBe('completed');

    const events = await runEventsOnDisk(project, plan, runId);
    expect(types(events).filter(type => ['plan-deviation-recorded', 'scenarios-rewording', 'scenarios-reworded'].includes(type))).toEqual([
      'plan-deviation-recorded', 'scenarios-rewording', 'scenarios-reworded',
    ]);
    expect(events.find(event => event.type === 'scenarios-reworded')!.data).toEqual({ deviation: 'pd-001', commit: 'reworded-1' });

    // The record is revised, and the tracked feature file carries the new text; the plan does not.
    const record = JSON.parse(await readFile(runPath(project, plan, runId, 'scenarios', 'sc-002.json'), 'utf8')) as { name: string; source: string[]; file: string };
    expect(record).toMatchObject({ name: 'A person compares revisions over tRPC', source: reworded });
    const file = await readFile(`${project}/${record.file}`, 'utf8');
    expect(file).toContain('Scenario: A person compares revisions over tRPC');
    expect(file).not.toContain('Scenario: A person uses compare-panel');

    // The next work item's architect was briefed with the reworded scenario.
    const architects = agent.sessions.filter(session => session.spec.role === 'local-architect');
    expect(architects[2]!.spec.prompt).toContain('Scenario: A person compares revisions over tRPC');

    // The CheckFinding shows the old text and the new.
    const deviation = checkFindingListResponseSchema.parse(await get(origin, protocolPaths.runCheckFindings(plan, runId, { select: 'all' }))).items[0]!.planDeviation;
    expect(deviation?.scenarios).toEqual([{
      scenario: 'sc-002', file: record.file, after: reworded,
      before: ['Scenario: A person uses compare-panel', '  Given the project as the plan finds it', '  When the person uses compare-panel', '  Then the outcome compare-panel promises is shown'],
    }]);
  }, 120_000);
});

describe('a scope review under a plan deviation', () => {
  test('binds the deviation beside the plan excerpts and asks its reviewer to judge the plan as amended', async () => {
    const root = await reviewTarget(cleanups);
    const index = `${notesDirectory}/src/index.ts`;
    const clean = (paths: readonly string[]) => [
      ...paths.map(path => tool(snapshotToolNames.diff, { path })),
      { kind: 'submit' as const, input: { inspected: [...paths], missing: [], concerns: [] } },
    ];
    const run = await reviewRun(root, cleanups, {
      policy: { kinds: ['scope'] },
      engineer: [],
      reviewers: { 'rq-0001': clean([store]), 'rq-0002': clean([limit]), 'rq-0003': clean([store, index]) },
      roles: {
        'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
        'local-architect': [
          submit(unresolved('The note cannot be served by an MCP tool: the project has none.', ['plan.md lines 10–11'])),
          submit(assign(notes, { goal: 'Add the note store.' }, outline())),
          submit(assign(notes, { goal: 'State the note limit.' })),
          submit(assign(notes, { goal: 'Export the store.' })),
          submit(requestCompletion()),
        ],
        'global-fork': [submit(forkDeviation({ requirements: [{ lines: [10, 11] }], instead: 'Return the note through tRPC `reviews.run` only.' }))],
        engineer: [
          submit(completionProposed('Added the note store.'), write(store, 'export const store = new Map(); // v1\n')),
          submit(completionProposed('Stated the note limit.'), write(limit, 'export const limit = (text: string) => text.length <= 50;\n')),
          submit(completionProposed('Exported the store.'), write(store, 'export const store = new Map(); // v3\n'), write(index, 'export * from \'./store.js\';\n')),
        ],
      },
    });
    expect(onlyRun(run.service, reviewPlan).state).toBe('completed');
    expect(eventsOf(run.events, 'plan-deviation-recorded')).toHaveLength(1);

    // Every scope request binds the deviation, by the hash of its text, after the plan excerpt its assignment cites.
    const requests = eventsOf(run.events, 'review-request-recorded').map(event => event.data.request);
    expect(requests).toEqual(['rq-0001', 'rq-0002', 'rq-0003']);
    for (const id of requests) {
      const record = JSON.parse(await readFile(runPath(root, reviewPlan, run.runId, reviewLayout.request(id)), 'utf8')) as ReviewRequest;
      expect(record.requirements.map(requirement => requirement.ref)).toEqual(['plan#request', 'deviation:pd-001']);
    }
    const reviewer = run.agent!.sessions.find(session => session.spec.role === 'reviewer' && session.spec.prompt.includes('rq-0001'))!;
    expect(reviewer.spec.prompt).toContain('## Plan deviations in force');
    expect(reviewer.spec.prompt).toContain('What the run does instead: Return the note through tRPC `reviews.run` only.');
  }, 120_000);
});

describe('an unresolved request answered otherwise', () => {
  test('a placement fix is delivered as a placement answer, and no deviation is recorded', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(unresolved('The comparison needs a field-by-field diff this module cannot own.')), submit(requestCompletion()), submit(requestCompletion())],
      'global-fork': [submit(forkDecision({
        decision: {
          question: 'Who owns comparing two revisions field by field?', outcome: 'create', capability: 'field-diff', changesExistingSymbols: false,
          owner: core, rationale: 'The core holds the revision chain.', constraints: [], uncertainties: [], evidence: { citations: [{ module: core }], gaps: [] },
        },
        registry: [registryChange({ capability: 'field-diff', owner: core })],
        brief: 'field-diff belongs to the catalog core.',
      }))],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: completed });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, plan).state).toBe('completed');

    const events = await runEventsOnDisk(project, plan, runId);
    expect(types(events).filter(type => ['unresolved-requested', 'view-refreshed', 'decision-accepted', 'brief-appended', 'decision-delivered', 'plan-deviation-recorded'].includes(type))).toEqual([
      'unresolved-requested', 'view-refreshed', 'decision-accepted', 'brief-appended', 'decision-delivered',
    ]);
    expect(events.find(event => event.type === 'decision-accepted')!.data).toMatchObject({ request: 'ur-001', decision: 'gd-ur-001', workItem: 'wi-001' });
    // A plain completion: no plan deviation was recorded.
    expect(events.at(-1)).toMatchObject({ type: 'job-completed' });
    expect(events.at(-1)!.data).not.toHaveProperty('planDeviations');
    const architects = agent.sessions.filter(session => session.spec.role === 'local-architect');
    expect(architects[1]!.start.mode).toBe('continue');
    expect(architects[1]!.spec.prompt).toContain('`gd-ur-001` (global, request ur-001)');
    const origin = await serve(opened.service, project);
    const decisions = await get(origin, protocolPaths.runDecisions(plan, runId)) as { decisions: Array<{ kind: string; id?: string }> };
    expect(decisions.decisions.some(decision => decision.kind === 'placement' && decision.id === 'gd-ur-001')).toBe(true);
    expect((await fetch(`${origin}${protocolPaths.runExecutionMap(plan, runId, opened.service.getRun(plan, runId)!.version)}`)).status).toBe(200);
  }, 120_000);

  test('nothing possible ends the run as unresolvable, with the conflict', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(unresolved())],
      'global-fork': [submit(forkNothingPossible())],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit(plan)] });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, plan).state).toBe('failed');
    const events = await runEventsOnDisk(project, plan, runId);
    expect(types(events)).not.toContain('plan-deviation-recorded');
    expect(events.at(-1)).toMatchObject({
      type: 'job-failed',
      data: { reason: 'unresolvable-requirement', message: expect.stringContaining('no deviation leaves anything of the plan worth doing'), evidence: expect.arrayContaining([deviationLayout.request('ur-001')]) },
    });
  }, 120_000);

  test('a placement request is never answered with a deviation', async () => {
    const { validateFork } = await import('../architecture/submission.js');
    const evidence = { index: null, registry: new Map(), hypotheses: new Map(), decisions: new Map(), workItems: new Set<string>() };
    expect(validateFork(forkDeviation(), evidence)).toMatchObject({ ok: false, errors: [{ path: 'kind' }] });
    const question = { kind: 'unresolved' as const, plan: 'one\ntwo', workItems: new Set(['wi-001']), scenarios: new Map([['sc-001', 'implemented']]) };
    const invalid = validateFork(forkDeviation({ requirements: [{ lines: [2, 3] }], workItems: ['wi-009'], scenarios: [{ scenario: 'sc-001', source: ['Given a thing'] }] }), evidence, question);
    expect(invalid.ok ? [] : invalid.errors.map(error => error.path)).toEqual([
      'deviation.requirements.0.lines', 'deviation.workItems.0', 'deviation.scenarios.0.scenario', 'deviation.scenarios.0.source.0',
    ]);
  });
});

describe('the deviation limit', () => {
  test('a deviation past the limit makes the run wait for the person, and their acceptance lets it go on', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [
        ...Array.from({ length: 6 }, (_, index) => submit(unresolved(`Conflict ${index + 1}: the plan asks for an MCP tool.`))),
        submit(requestCompletion()), submit(requestCompletion()),
      ],
      'global-fork': [submit(forkDeviation())],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: completed });
    cleanups.push(() => opened.service.close());
    const origin = await serve(opened.service, project);
    const receipt = await opened.service.execute(startRun(plan));
    const runId = receipt.jobId;

    // Five deviations hold nothing; the sixth is recorded held, and the run waits.
    await until(async () => (await runEventsOnDisk(project, plan, runId)).filter(event => event.type === 'plan-deviation-recorded').length === 6);
    const recorded = (await runEventsOnDisk(project, plan, runId)).filter(event => event.type === 'plan-deviation-recorded');
    expect(recorded.map(event => event.type === 'plan-deviation-recorded' && event.data.held)).toEqual([false, false, false, false, false, true]);
    const waiting = runResponseSchema.parse(await get(origin, protocolPaths.run(plan, runId))).run;
    expect(waiting).toMatchObject({
      state: 'running', planDeviations: { recorded: 6, toReview: 6 },
      decisionRequests: { open: 6, waiting: true, workItems: [{ workItem: 'wi-001', requests: [{ checkFinding: 'cf-0006', request: 'cfd-0006' }] }] },
    });
    const before = agent.sessions.length;
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(agent.sessions).toHaveLength(before);

    // The person accepts it: the work item goes on and the run completes with the rest to review.
    await opened.service.execute(command('respond-to-check-finding', runId, opened.service.getRun(plan, runId)!.version, {
      checkFinding: 'cf-0006', expectedRevision: 2, request: 'cfd-0006', option: 'accept',
    }));
    await opened.service.settled(plan, runId);
    expect(onlyRun(opened.service, plan).state).toBe('completed');
    const events = await runEventsOnDisk(project, plan, runId);
    expect(events.at(-1)).toMatchObject({ type: 'job-completed', data: { planDeviations: 5 } });
  }, 120_000);

  test('the person\'s rejection of a held deviation ends the run with their answer', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(unresolved()), submit(unresolved('A second conflict.')), submit(requestCompletion())],
      'global-fork': [submit(forkDeviation())],
    })));
    const opened = await openRuns(project, {
      agent, inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit(plan)],
      policy: root => ({ ...testPolicy(root), limits: { ...testPolicy(root).limits, maxPlanDeviations: 1 } }),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan));
    const runId = receipt.jobId;
    await until(async () => (await runEventsOnDisk(project, plan, runId)).some(event => event.type === 'plan-deviation-recorded' && event.data.held));
    await opened.service.execute(command('respond-to-check-finding', runId, opened.service.getRun(plan, runId)!.version, {
      checkFinding: 'cf-0002', expectedRevision: 2, request: 'cfd-0002', option: 'reject', note: 'Stop and fix the plan instead.',
    }));
    await opened.service.settled(plan, runId);
    expect(onlyRun(opened.service, plan).state).toBe('failed');
    expect((await runEventsOnDisk(project, plan, runId)).at(-1)).toMatchObject({
      type: 'job-failed', data: { reason: 'unresolvable-requirement', message: expect.stringContaining('Stop and fix the plan instead.') },
    });
  }, 120_000);
});
