import { localArchitectToolName } from '../work/submission.js';
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
import { validateFork, type ForkSubmission } from '../architecture/submission.js';
import { deviationLayout, type EnvironmentProblem } from '../deviations/records.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { copyFixture } from './helpers/fixture.js';
import { declaringScenarios } from './helpers/declarations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { decision, forkDecision, forkEnvironment, registryChange, unresolved } from './helpers/placement.js';
import { installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun, until } from './helpers/runs.js';
import { byRole, submit, treeInputs } from './helpers/iterations.js';
import { assertUnchangedGit, openUnchangedRuns as openRuns } from './helpers/unchanged-run.js';

/*
 * A local architect answers `unresolved` because its gate keeps failing on
 * something its engineers cannot change, and the global architect answers
 * `environment`: the conflict lies in how the gate or the harness runs.
 * Nothing is placed, no deviation is recorded and the plan is untouched.
 * The run holds the work item for the operator, and its status says why.
 * The operator's resumption returns the work item to its local architect
 * with the diagnosis; their answer `end` ends the run.
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
const conflict = 'The work-item gate fails before any test runs: `npm test` cannot resolve `dist/src`, which no engineer of this module can produce.';
const { diagnosis, suggestion } = forkEnvironment() as Extract<ForkSubmission, { kind: 'environment' }>;

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

function respondCommand(runId: string, expectedVersion: number, checkFinding: string, request: string, option: string, note?: string): Extract<CheckFindingUserCommand, { type: 'respond-to-check-finding' }> {
  return {
    commandId: `respond-${Math.random().toString(36).slice(2)}`, expectedVersion, type: 'respond-to-check-finding',
    payload: { planId: plan, jobId: runId, responder: 'dan', checkFinding, expectedRevision: 2, request, option, ...(note === undefined ? {} : { note }) },
  };
}

/**
 * The operator's answer, at the run's version as it stands. The driver may
 * still append a line after the report reaches the disk, so an answer
 * refused only for a moved version is sent again at the new one.
 */
async function respond(service: RunService, runId: string, checkFinding: string, request: string, option: string, note?: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await service.execute(respondCommand(runId, service.getRun(plan, runId)!.version, checkFinding, request, option, note));
      return;
    } catch (error) {
      if (!(error instanceof CommandRejection) || !/is at version/u.test(error.message) || attempt >= 20) throw error;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

describe('an unresolved request answered with an environment problem', () => {
  test('the run holds with the diagnosis in its status; a resume returns the work item to its local architect, and the run completes', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(unresolved(conflict, ['.ramify-agent/runs/…/gates/ga-0003.json: `npm test` exited 1 with ERR_MODULE_NOT_FOUND dist/src'])), submit(requestCompletion()), submit(requestCompletion())],
      'global-fork': [submit(forkEnvironment())],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: completed });
    cleanups.push(() => opened.service.close());
    const origin = await serve(opened.service, project);
    const receipt = await opened.service.execute(startRun(plan));
    const runId = receipt.jobId;

    // The report is recorded, and the run holds wi-001 for the operator.
    await until(async () => (await runEventsOnDisk(project, plan, runId)).some(event => event.type === 'environment-reported'));
    const reported = (await runEventsOnDisk(project, plan, runId)).find(event => event.type === 'environment-reported')!;
    expect(reported.data).toMatchObject({ request: 'ur-001', problem: 'ep-001', workItem: 'wi-001', checkFinding: 'cf-0001' });
    const held = runResponseSchema.parse(await get(origin, protocolPaths.run(plan, runId))).run;
    expect(held).toMatchObject({
      state: 'running',
      decisionRequests: { open: 1, waiting: true, workItems: [{ workItem: 'wi-001', requests: [{ checkFinding: 'cf-0001', request: 'cfd-0001' }] }] },
      environmentProblems: [{ problem: 'ep-001', request: 'ur-001', workItem: 'wi-001', checkFinding: 'cf-0001', diagnosis, suggestion, answer: 'waiting' }],
      planDeviations: { recorded: 0, toReview: 0 },
    });
    const before = agent.sessions.length;
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(agent.sessions).toHaveLength(before);

    // Nothing was placed, no deviation was recorded, and the plan is as captured.
    const recorded = await runEventsOnDisk(project, plan, runId);
    expect(types(recorded)).not.toContain('plan-deviation-recorded');
    expect(types(recorded)).not.toContain('decision-accepted');
    expect(await readFile(`${project}/plans/${plan}/plan.md`, 'utf8')).toBe(await readFile(runPath(project, plan, runId, 'input', 'plan.md'), 'utf8'));
    const record = JSON.parse(await readFile(runPath(project, plan, runId, deviationLayout.environment('ep-001')), 'utf8')) as EnvironmentProblem;
    expect(record).toMatchObject({ schema: 'ramify-agent.environment-problem/1', request: 'ur-001', workItem: 'wi-001', diagnosis, suggestion, checkFinding: 'cf-0001' });

    // Its CheckFinding is the run's, asks the operator to resume or end, and its judgment carries the diagnosis and the suggestion.
    const list = checkFindingListResponseSchema.parse(await get(origin, protocolPaths.runCheckFindings(plan, runId, { select: 'all' })));
    expect(list.items[0]).toMatchObject({
      id: 'cf-0001', workItem: null, reason: 'awaiting-user-decision', risk: 'high', credibility: 'agent-generated',
      producers: ['plan:environment'], modules: [core], userCommands: ['respond'], planDeviation: null,
    });
    expect(list.items[0]!.pendingUserDecision?.options.map(option => option.id)).toEqual(['resume', 'end']);
    const page = await get(origin, protocolPaths.runEvents(plan, runId, 0)) as { events: Array<{ transition: string; summary: string }> };
    expect(page.events.find(event => event.transition === 'environment-reported')!.summary).toContain('environment problem ep-001');

    // The operator corrects the environment and resumes the run.
    await respond(opened.service, runId, 'cf-0001', 'cfd-0001', 'resume', 'Added a build step; dist/src is built before the gate.');
    await opened.service.settled(plan, runId);
    expect(onlyRun(opened.service, plan).state).toBe('completed');

    // The local architect that asked was continued with the briefing, and retried from its outline.
    const architects = agent.sessions.filter(session => session.spec.submission.name === localArchitectToolName);
    expect(architects).toHaveLength(3);
    expect(architects[1]!.start.mode).toBe('continue');
    const briefed = architects[1]!.spec.prompt;
    expect(briefed).toContain('## The environment problem was reported, and the run resumed');
    expect(briefed).toContain(`> ${diagnosis}`);
    expect(briefed).toContain('Added a build step; dist/src is built before the gate.');
    expect(architects[2]!.spec.prompt).not.toContain('## The environment problem was reported');
    const events = await runEventsOnDisk(project, plan, runId);
    const continued = events.filter(event => event.type === 'invocation-started' && event.data.role === 'local-architect' && event.data.continues !== undefined);
    expect(continued.map(event => event.type === 'invocation-started' ? event.data.continues?.reason : null)).toContain('environment-resumed');
    expect(events.at(-1)).toMatchObject({ type: 'job-completed' });
    expect(events.at(-1)!.data).not.toHaveProperty('planDeviations');

    // The status keeps the problem, answered.
    const after = runResponseSchema.parse(await get(origin, protocolPaths.run(plan, runId))).run;
    expect(after).toMatchObject({ state: 'completed', decisionRequests: { open: 0, waiting: false }, environmentProblems: [{ problem: 'ep-001', answer: 'resumed' }] });
    const settled = checkFindingListResponseSchema.parse(await get(origin, protocolPaths.runCheckFindings(plan, runId, { select: 'all' }))).items[0]!;
    expect(settled).toMatchObject({ standing: 'closed', reason: 'waived', settlement: { kind: 'waived', by: { kind: 'user', name: 'dan' } } });
  }, 120_000);

  test('the same work item asking again after a resume holds the run again, and its fork reads the earlier report', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(unresolved(conflict)), submit(unresolved(`${conflict} It failed again after the resume.`)), submit(requestCompletion()), submit(requestCompletion())],
      'global-fork': [submit(forkEnvironment())],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: completed });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan));
    const runId = receipt.jobId;
    const reports = async () => (await runEventsOnDisk(project, plan, runId)).filter(event => event.type === 'environment-reported').length;

    await until(async () => await reports() === 1);
    await respond(opened.service, runId, 'cf-0001', 'cfd-0001', 'resume');
    await until(async () => await reports() === 2);
    const again = opened.service.getRun(plan, runId)!;
    expect(again.state).toBe('running');
    const forks = agent.sessions.filter(session => session.spec.role === 'global-fork');
    expect(forks).toHaveLength(2);
    expect(forks[1]!.spec.prompt).toContain('## Environment problems already reported');
    expect(forks[1]!.spec.prompt).toContain('`ep-001`, for ur-001 of wi-001');
    expect(forks[1]!.spec.prompt).toContain('The operator resumed the run');

    await respond(opened.service, runId, 'cf-0002', 'cfd-0003', 'resume');
    await opened.service.settled(plan, runId);
    expect(onlyRun(opened.service, plan).state).toBe('completed');
  }, 120_000);

  test('the operator\'s answer end ends the run with the diagnosis and their note', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(unresolved(conflict))],
      'global-fork': [submit(forkEnvironment())],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit(plan)] });
    cleanups.push(() => opened.service.close());
    const origin = await serve(opened.service, project);
    const receipt = await opened.service.execute(startRun(plan));
    const runId = receipt.jobId;
    await until(async () => (await runEventsOnDisk(project, plan, runId)).some(event => event.type === 'environment-reported'));
    await respond(opened.service, runId, 'cf-0001', 'cfd-0001', 'end', 'The gate needs a new toolchain; not this week.');
    await opened.service.settled(plan, runId);
    expect(onlyRun(opened.service, plan).state).toBe('failed');
    expect((await runEventsOnDisk(project, plan, runId)).at(-1)).toMatchObject({
      type: 'job-failed',
      data: {
        reason: 'unresolvable-requirement',
        message: expect.stringContaining('The gate needs a new toolchain; not this week.'),
        evidence: [deviationLayout.environment('ep-001'), deviationLayout.request('ur-001')],
      },
    });
    expect((await runEventsOnDisk(project, plan, runId)).at(-1)!.data).toMatchObject({ message: expect.stringContaining(diagnosis) });
    const snapshot = runResponseSchema.parse(await get(origin, protocolPaths.run(plan, runId))).run;
    expect(snapshot.environmentProblems).toMatchObject([{ problem: 'ep-001', answer: 'ended' }]);
  }, 120_000);
});

describe('the environment answer\'s validation', () => {
  const evidence = { index: null, registry: new Map(), hypotheses: new Map(), decisions: new Map(), workItems: new Set<string>() };
  const question = { kind: 'unresolved' as const, plan: 'one\ntwo', workItems: new Set(['wi-001']), scenarios: new Map<string, string>() };

  test('an environment answer without a diagnosis, or past its bounds, is refused, and a placement request is never answered with one', () => {
    expect(validateFork(forkEnvironment(), evidence, question)).toMatchObject({ ok: true });
    const { diagnosis: _omitted, ...missing } = forkEnvironment() as Extract<ForkSubmission, { kind: 'environment' }>;
    const refused = validateFork(missing, evidence, question);
    expect(refused.ok ? [] : refused.errors.map(error => error.path)).toEqual(['diagnosis']);
    const long = validateFork(forkEnvironment('d'.repeat(2001), 's'.repeat(1001)), evidence, question);
    expect(long.ok ? [] : long.errors.map(error => error.path).sort()).toEqual(['diagnosis', 'suggestion']);
    expect(validateFork(forkEnvironment(), evidence)).toMatchObject({ ok: false, errors: [{ path: 'kind' }] });
  });

  test('a placement answer to an unresolved request gives a few short constraints; a placement request is not held to that', () => {
    const answer = (constraints: string[]) => forkDecision({
      decision: decision({ owner: core, constraints }),
      registry: [registryChange({ capability: 'send-email', owner: core })],
    });
    expect(validateFork(answer(['Expose `compare` from the core to the panel.']), evidence, question)).toMatchObject({ ok: true });
    const long = validateFork(answer(['x'.repeat(401)]), evidence, question);
    expect(long.ok ? [] : long.errors.map(error => error.path)).toEqual(['decision.constraints.0']);
    const many = validateFork(answer(Array.from({ length: 11 }, (_, index) => `Constraint ${index}.`)), evidence, question);
    expect(many.ok ? [] : many.errors.map(error => error.path)).toEqual(['decision.constraints']);
    expect(validateFork(answer(['x'.repeat(401)]), evidence)).toMatchObject({ ok: true });
  });
});
