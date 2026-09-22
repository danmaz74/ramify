import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { copyFixture } from './helpers/fixture.js';
import {
  crashLock, emptyAnalysis, freeze, git, initRepository, installTestRunner, onlyRun, openRuns,
  runEventsOnDisk, runPath, startRun, until } from './helpers/runs.js';
import { workLayout } from '../work/records.js';
import { type IterationAssignment, iterationLayout } from '../work/iterations.js';
import {
  addModule, assign, byRole, byWork, completionProposed, installMiniRunner, outline, shell,
  submit as submitStep, treeInputs,
} from './helpers/iterations.js';
import { analysisLayout } from '../analysis/records.js';
import { contractsLayout } from '../contracts/records.js';
import { localDecision, registryChange } from './helpers/placement.js';
import {
  consumerStub, consumerTest, contractNeeded, contractWrites, established, paths, type Seam,
} from './helpers/contracts.js';
import { architectureLayout } from '../architecture/records.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { decision as decisionBody, forkDecision, requestPlacement } from './helpers/placement.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import type { OpenRunsOptions } from './helpers/runs.js';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { runLayout, type InvocationOutcome } from '../run/records.js';
import type { RunWrite } from '../run/service.js';
import type { RunEvent } from '../run/log.js';

/*
 * The recovery table of this iteration's run log. For every durable
 * boundary, a restart replays the log, re-materializes each record file, and
 * performs again any external effect whose intent has no completion. It
 * calls no agent, and it makes no duplicate: no second invocation, no second
 * analysis and no second commit.
 *
 * A crash is what it is on disk: the service is abandoned rather than
 * closed, so it writes nothing more, and the lock is replaced by one held by
 * a process that is gone.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  await initRepository(fixture.root);
  return fixture.root;
}

/**
 * Runs until the given write, then freezes: the driver never returns, so
 * nothing more is written, exactly as a crash leaves it.
 */
async function crashAfter(
  root: string,
  write: RunWrite,
  changeTree = false,
  script?: OpenRunsOptions['script'],
  inputs?: OpenRunsOptions['inputs'],
  agent?: OpenRunsOptions['agent'],
  freezeAt?: (current: RunWrite) => boolean,
  ready?: (types: readonly string[]) => boolean,
) {
  let runId = '';
  const { service } = await openRuns(root, {
    ...(agent === undefined ? { script: script ?? [{ kind: 'submit', input: emptyAnalysis() }] } : { agent }),
    ...(inputs === undefined ? {} : { inputs }),
    afterWrite: async (current, runId) => {
      void runId;
      if (changeTree && current === 'readiness-attempted') {
        await writeFile(join(root, 'src', 'late.ts'), 'export const late = true;\n');
      }
      if (freezeAt === undefined ? current === write : freezeAt(current)) await freeze();
    },
  });
  const receipt = await service.execute(startRun('review-notes'));
  runId = receipt.jobId;
  const path = runPath(root, 'review-notes', runId, runLayout.events);
  await until(async () => (ready === undefined ? reached(root, runId, path, write) : ready(await eventTypes(path))), 90_000);
  await crashLock(root);
  return { runId };
}

/** How many commits the run branch holds. */
async function commitCount(root: string, runId: string): Promise<number> {
  const log = await git(root, 'log', '--format=%H', `ramify-agent/run-${runId}`).catch(() => '');
  return log.trim().split('\n').filter(Boolean).length;
}

/** Whether the frozen run has written everything the boundary is named for. */
async function reached(root: string, runId: string, events: string, write: RunWrite): Promise<boolean> {
  const types = await eventTypes(events);
  switch (write) {
    case 'job-created': return types.length >= 1;
    case 'invocation-started': return types.includes('invocation-started');
    case 'invocation-ended': return types.includes('invocation-ended');
    case 'analysis-accepted': return types.includes('analysis-accepted');
    case 'readiness-attempted': return types.includes('readiness-passed') || types.includes('readiness-failed');
    case 'work-item-started': return types.includes('work-item-started');
    case 'hypotheses-delivered': return types.includes('hypotheses-delivered');
    case 'outline-revised': return types.includes('outline-revised');
    case 'iteration-assigned': return types.includes('iteration-assigned');
    case 'writer-acquired': return types.includes('writer-acquired');
    case 'writer-released': return types.includes('writer-released');
    case 'iteration-closed': return types.includes('iteration-closed');
    case 'work-item-completed': return types.includes('work-item-completed');
    // The operation intent is in the log and the commit is not made yet.
    case 'gate-attempted': return types.includes('gate-committing') && (await commitCount(root, runId)) === 1;
    // The commit is made and the exact revision has not completed audit yet.
    case 'gate-committing': return types.includes('gate-committing') && !types.includes('gate-attempted') && (await commitCount(root, runId)) === 2;
    // The complete attempt is the effect's completion line.
    case 'gate-committed': return types.includes('gate-attempted') && (await commitCount(root, runId)) === 2;
    case 'placement-requested': return types.includes('placement-requested');
    case 'view-refreshed': return types.includes('view-refreshed');
    case 'fork-returned-partial': return types.includes('fork-returned-partial');
    // The decision is committed and its brief is not appended yet.
    case 'decision-accepted': return types.includes('decision-accepted');
    // The brief reached the parent and its completion is not in the log yet.
    case 'brief-appending': return types.includes('decision-accepted');
    case 'brief-appended': return types.includes('brief-appended') || types.includes('global-context-rebuilt');
    case 'decision-delivered': return types.includes('decision-delivered');
    case 'contract-requested': return types.includes('contract-requested');
    case 'contract-registered': return types.includes('contract-registered');
    case 'work-item-yielded': return types.includes('work-item-yielded');
    case 'work-item-resumed': return types.includes('work-item-resumed');
    case 'provider-conformed': return types.includes('provider-conformed');
    case 'requirement-verified': return types.includes('requirement-verified');
    case 'evidence-reopened': return types.includes('evidence-reopened');
    case 'revision-needed': return types.includes('revision-needed');
    case 'dependency-cycle-detected': return types.includes('dependency-cycle-detected');
    case 'job-completed': return types.includes('job-completed');
  }
}

async function eventTypes(path: string): Promise<string[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return [];
  }
  // The poller reads a log that is being appended to: a trailing partial
  // line is what a reader sees mid-write, and the ledger discards one too.
  const types: string[] = [];
  for (const line of text.split('\n').filter(Boolean)) {
    try {
      types.push((JSON.parse(line) as { event: RunEvent }).event.type);
    } catch {
      break;
    }
  }
  return types;
}

/** One entry capability, one hypothesis, and a local architect that asks for completion. */
function oneWorkItem(): OpenRunsOptions['script'] {
  const submitted = analysis(
    [entry('reviewer-note', 'collection-review/workspace/reviews')],
    [{ id: 'note-storage', capability: 'note-storage', change: 'reuse' as const, changesExistingSymbols: false, suggestedOwner: 'collection-review/workspace/reviews',
      anticipatedConsumers: [], involvedModules: [], dependsOn: [], confidence: 'medium' as const,
      rationale: 'A note may already have somewhere to live.', assumptions: [], uncertainties: [], citations: [] }],
  );
  return (spec: SessionSpec) => [{ kind: 'submit' as const, input: spec.role === 'initial-architect' ? submitted : requestCompletion() }];
}

/** Reopens the project after the crash and answers what recovery did. */
async function reopen(root: string, agent?: OpenRunsOptions['agent']) {
  const reopened = await openRuns(root, agent === undefined ? {} : { agent });
  cleanups.push(() => reopened.service.close());
  return reopened;
}

/** The capability of the one entry, and the request the local architect makes for it. */
const placementCapability = 'reviewer-note';

/**
 * A run that makes one placement request: one entry capability, a local
 * architect that asks where it belongs, and a fork that decides.
 */
function placementPlan(brief = 'The capability stays where the registry places it.') {
  return {
    'initial-architect': [submitStep(analysis([entry(placementCapability, 'collection-review/workspace/reviews')]))],
    'local-architect': [submitStep(requestPlacement({ forCapability: placementCapability })), submitStep(requestCompletion())],
    'global-fork': [submitStep(forkDecision({
      decision: decisionBody({ capability: placementCapability, owner: 'collection-review/workspace/reviews' }),
      brief,
    }))],
  };
}

describe('the recovery table', () => {
  test('a crash after job.json, before the first event, leaves a run that loads and is interrupted', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'job-created');

    const { service, recovery } = await reopen(root);
    expect(recovery.interrupted).toEqual([`review-notes/${runId}`]);
    expect(recovery.skipped).toEqual([]);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.map(event => event.type)).toEqual(['job-started', 'job-interrupted']);
    expect(onlyRun(service, 'review-notes').state).toBe('interrupted');
  }, 180_000);

  test('a crash after invocation-started closes that invocation without an agent call and without a second one', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'invocation-started');

    const { service, recovery, agent } = await reopen(root);
    expect(agent).toBeUndefined();
    expect(recovery.invocations).toEqual([`review-notes/${runId}: inv-0001`]);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.map(event => event.type)).toEqual(['job-started', 'invocation-started', 'invocation-ended', 'job-interrupted']);
    expect(events.filter(event => event.type === 'invocation-started')).toHaveLength(1);

    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome('inv-0001')), 'utf8')) as InvocationOutcome;
    expect(outcome).toMatchObject({ ended: 'failed', interruption: 'session-lost', disposition: 'incomplete', submission: null });
    expect(outcome.settled.confirmed).toBe(false);
    expect(onlyRun(service, 'review-notes').counts.invocations).toBe(1);
  }, 180_000);

  test('a crash after invocation-ended leaves the outcome as it was and appends no second end', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'invocation-ended');

    const { recovery } = await reopen(root);
    expect(recovery.invocations).toEqual([]);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'invocation-ended')).toHaveLength(1);
    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome('inv-0001')), 'utf8')) as InvocationOutcome;
    expect(outcome.ended).toBe('submitted');
  }, 180_000);

  test('a crash after analysis-accepted re-materializes the entries and accepts no second analysis', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'analysis-accepted');
    // The record file is removed, as a crash between the line and its file leaves it.
    await rm(runPath(root, 'review-notes', runId, runLayout.entries));

    const { recovery } = await reopen(root);
    expect(recovery.rematerialized.some(entry => entry.startsWith(`review-notes/${runId}`))).toBe(true);
    const entries = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.entries), 'utf8')) as { schema: string; entries: unknown[] };
    expect(entries.schema).toBe('ramify-agent.entry-assignments/1');
    expect(entries.entries).toEqual([]);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'analysis-accepted')).toHaveLength(1);
  }, 180_000);

  test('a crash after readiness re-materializes the attempt and its gate, and runs readiness no second time', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'readiness-attempted');
    await rm(runPath(root, 'review-notes', runId, runLayout.readiness(1)));

    const { recovery } = await reopen(root);
    expect(recovery.rematerialized.some(entry => entry.startsWith(`review-notes/${runId}`))).toBe(true);
    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.readiness(1)), 'utf8')) as { verdict: string };
    expect(attempt.verdict).toBe('passed');
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'readiness-passed')).toHaveLength(1);
  }, 180_000);

  test('a crash after placement-requested leaves the request, and no fork and no decision', async () => {
    const root = await target();
    const agent = createScriptedAgent(byRole(placementPlan()));
    const { runId } = await crashAfter(root, 'placement-requested', false, undefined, undefined, agent);
    await rm(runPath(root, 'review-notes', runId, architectureLayout.request('pr-001')));

    const { recovery } = await reopen(root, agent);
    // The record file is re-materialized from the line that committed it.
    expect(recovery.rematerialized.some(entry => entry.startsWith(`review-notes/${runId}`))).toBe(true);
    const request = JSON.parse(await readFile(runPath(root, 'review-notes', runId, architectureLayout.request('pr-001')), 'utf8')) as { id: string; forCapability: string };
    expect(request).toMatchObject({ id: 'pr-001', forCapability: placementCapability });

    const types = (await runEventsOnDisk(root, 'review-notes', runId)).map(event => event.type);
    expect(types.filter(type => type === 'placement-requested')).toHaveLength(1);
    expect(types).not.toContain('view-refreshed');
    expect(types).not.toContain('decision-accepted');
    // No fork was started, so none was repeated.
    expect(agent.sessions.filter(session => session.spec.role === 'global-fork')).toHaveLength(0);
  }, 180_000);

  test('a fork interrupted mid-investigation leaves no decision, and its invocation is closed without an agent call', async () => {
    const root = await target();
    // The fork is still investigating when the harness stops: its session
    // never answers.
    const agent = createScriptedAgent(byRole({
      ...placementPlan(),
      'global-fork': [[{ kind: 'hang' }]],
    }));
    const { runId } = await crashAfter(
      root, 'view-refreshed', false, undefined, undefined, agent,
      () => false,
      types => types.filter(type => type === 'invocation-started').length === 3
        && agent.sessions.filter(session => session.spec.role === 'global-fork').length === 1,
    );

    const { recovery } = await reopen(root, agent);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const types = events.map(event => event.type);
    expect(types.filter(type => type === 'view-refreshed')).toHaveLength(1);
    expect(types).not.toContain('decision-accepted');
    expect(types).not.toContain('brief-appended');
    // The fork's invocation was closed by recovery, with no agent call and
    // no second fork.
    expect(recovery.invocations).toEqual([`review-notes/${runId}: inv-0003`]);
    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome('inv-0003')), 'utf8')) as InvocationOutcome;
    expect(outcome).toMatchObject({ ended: 'failed', interruption: 'session-lost' });
    // One fork ran and was interrupted; recovery started no second one.
    expect(agent.sessions.filter(session => session.spec.role === 'global-fork')).toHaveLength(1);
  }, 180_000);

  test('a crash between an accepted decision and the parent append appends the brief once', async () => {
    const root = await target();
    const brief = 'The note stays with the reviews module, which already holds a review run.';
    const agent = createScriptedAgent(byRole(placementPlan(brief)));
    const { runId } = await crashAfter(root, 'decision-accepted', false, undefined, undefined, agent);
    await rm(runPath(root, 'review-notes', runId, architectureLayout.decision('gd-001')));

    const before = await runEventsOnDisk(root, 'review-notes', runId);
    expect(before.map(event => event.type)).not.toContain('brief-appended');

    const { recovery } = await reopen(root, agent);
    // The decision's own file is re-materialized, and the effect its intent
    // named is performed under the decision's identifier.
    const committed = JSON.parse(await readFile(runPath(root, 'review-notes', runId, architectureLayout.decision('gd-001')), 'utf8')) as { id: string; brief: string };
    expect(committed).toMatchObject({ id: 'gd-001', brief });
    expect(recovery.effects).toContain(`review-notes/${runId}: the parent append of decision gd-001`);

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const appended = events.filter(event => event.type === 'brief-appended');
    expect(appended).toHaveLength(1);
    expect(appended[0]!.data).toMatchObject({ decision: 'gd-001', outcome: 'appended', generation: 1 });
    expect(events.filter(event => event.type === 'decision-accepted')).toHaveLength(1);
    // The delivery follows the append, and the run is then interrupted.
    expect(events.filter(event => event.type === 'decision-delivered')).toHaveLength(1);
    expect(agent.sessions.filter(session => session.spec.role === 'global-fork')).toHaveLength(1);
  }, 180_000);

  test('G4: a crash after the append and before its completion answers already-present, and one brief exists', async () => {
    const root = await target();
    const brief = 'The note stays with the reviews module, which already holds a review run.';
    const agent = createScriptedAgent(byRole(placementPlan(brief)));
    const { runId } = await crashAfter(root, 'brief-appending', false, undefined, undefined, agent);

    // The append reached the parent before the crash: its key is in the
    // session the next fork would fork from.
    const before = await runEventsOnDisk(root, 'review-notes', runId);
    expect(before.map(event => event.type)).not.toContain('brief-appended');

    const { recovery } = await reopen(root, agent);
    expect(recovery.effects).toContain(`review-notes/${runId}: the parent append of decision gd-001`);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const appended = events.filter(event => event.type === 'brief-appended');
    expect(appended).toHaveLength(1);
    // The repeat was answered by the key, not by a second brief.
    expect(appended[0]!.data).toMatchObject({ decision: 'gd-001', outcome: 'already-present' });
    expect(events.filter(event => event.type === 'decision-delivered')).toHaveLength(1);
  }, 180_000);

  test('a crash after brief-appended delivers the decision once and starts nothing', async () => {
    const root = await target();
    const agent = createScriptedAgent(byRole(placementPlan()));
    const { runId } = await crashAfter(root, 'brief-appended', false, undefined, undefined, agent);

    const before = await runEventsOnDisk(root, 'review-notes', runId);
    expect(before.map(event => event.type)).not.toContain('decision-delivered');

    const { recovery } = await reopen(root, agent);
    expect(recovery.effects).toContain(`review-notes/${runId}: the delivery of decision gd-001`);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'brief-appended')).toHaveLength(1);
    const delivered = events.filter(event => event.type === 'decision-delivered');
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.data).toEqual({ decision: 'gd-001', workItem: 'wi-001' });
    // Recovery called no agent: the local architect's next turn belongs to a
    // run that is started again.
    expect(agent.sessions.filter(session => session.spec.role === 'local-architect')).toHaveLength(1);
  }, 180_000);

  test('a crash between the commit intent and the commit performs the effect again and makes one commit', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'gate-attempted', true);

    const before = (await git(root, 'log', '--format=%H', `ramify-agent/run-${runId}`)).trim().split('\n').filter(Boolean);
    expect(before).toHaveLength(1);

    const { recovery } = await reopen(root);
    expect(recovery.effects).toEqual([`review-notes/${runId}: the commit and audit of gate ga-0002`]);
    const after = (await git(root, 'log', '--format=%H', `ramify-agent/run-${runId}`)).trim().split('\n').filter(Boolean);
    expect(after).toHaveLength(2);

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.map(event => event.type)).toEqual([
      'job-started', 'invocation-started', 'invocation-ended', 'analysis-accepted',
      'readiness-passed', 'gate-committing', 'gate-attempted', 'job-interrupted',
    ]);
    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate('ga-0002')), 'utf8')) as { commit: string | null };
    expect(attempt.commit).toBe(after[0]);
  }, 180_000);

  test('a crash after the commit, before its completion line, finds the commit and makes no second one', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'gate-committing', true);

    const before = (await git(root, 'log', '--format=%H', `ramify-agent/run-${runId}`)).trim().split('\n').filter(Boolean);
    expect(before).toHaveLength(2);

    const { recovery } = await reopen(root);
    expect(recovery.effects).toEqual([`review-notes/${runId}: the commit and audit of gate ga-0002`]);
    const after = (await git(root, 'log', '--format=%H', `ramify-agent/run-${runId}`)).trim().split('\n').filter(Boolean);
    expect(after).toEqual(before);

    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate('ga-0002')), 'utf8')) as { commit: string | null };
    expect(attempt.commit).toBe(before[0]);
  }, 180_000);

  test('a crash after the complete attempt leaves the commit alone and appends the interruption only', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'gate-committed', true);

    const before = (await git(root, 'log', '--format=%H', `ramify-agent/run-${runId}`)).trim().split('\n').filter(Boolean);
    const { recovery } = await reopen(root);
    expect(recovery.effects).toEqual([]);
    expect((await git(root, 'log', '--format=%H', `ramify-agent/run-${runId}`)).trim().split('\n').filter(Boolean)).toEqual(before);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.at(-1)!.type).toBe('job-interrupted');
  }, 180_000);

  test('a restart of a completed run rewrites nothing and appends nothing', async () => {
    const root = await target();
    const { service } = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    const before = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    await service.close();

    const reopened = await reopen(root);
    expect(reopened.recovery).toMatchObject({ interrupted: [], rematerialized: [], effects: [], invocations: [], skipped: [] });
    expect(await runEventsOnDisk(root, 'review-notes', receipt.jobId)).toEqual(before);
    expect(onlyRun(reopened.service, 'review-notes').state).toBe('completed');
  }, 180_000);

  test('a crash after work-item-started starts no second one and delivers nothing twice', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'work-item-started', false, oneWorkItem());

    const { service, recovery } = await reopen(root);
    expect(recovery.interrupted).toEqual([`review-notes/${runId}`]);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'work-item-started')).toHaveLength(1);
    expect(events.filter(event => event.type === 'hypotheses-delivered')).toHaveLength(0);
    expect(events.at(-1)!.type).toBe('job-interrupted');
    expect(onlyRun(service, 'review-notes').counts.workItems).toBe(1);
  }, 180_000);

  test('a crash after hypotheses-delivered re-materializes the work item and delivers nothing a second time', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'hypotheses-delivered', false, oneWorkItem());
    // The work item's file is removed, as a crash between the line and its file leaves it.
    await rm(runPath(root, 'review-notes', runId, workLayout.item('wi-001')));
    await rm(runPath(root, 'review-notes', runId, analysisLayout.hypothesis('note-storage', 1)));

    const { recovery } = await reopen(root);
    expect(recovery.rematerialized.some(item => item.startsWith(`review-notes/${runId}`))).toBe(true);
    const item = JSON.parse(await readFile(runPath(root, 'review-notes', runId, workLayout.item('wi-001')), 'utf8')) as { schema: string; origin: unknown };
    expect(item).toMatchObject({ schema: 'ramify-agent.work-item/1', origin: { entry: 'reviewer-note' } });
    const hypothesis = JSON.parse(await readFile(runPath(root, 'review-notes', runId, analysisLayout.hypothesis('note-storage', 1)), 'utf8')) as { revision: number };
    expect(hypothesis.revision).toBe(1);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'hypotheses-delivered')).toHaveLength(1);
  }, 180_000);

  test('a crash after outline-revised re-materializes the outline and writes no second revision', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'outline-revised', false, oneWorkItem());
    await rm(runPath(root, 'review-notes', runId, workLayout.outline('wi-001', 1)));

    const { recovery } = await reopen(root);
    expect(recovery.rematerialized.some(item => item.startsWith(`review-notes/${runId}`))).toBe(true);
    const outline = JSON.parse(await readFile(runPath(root, 'review-notes', runId, workLayout.outline('wi-001', 1)), 'utf8')) as { revision: number; decomposition: { kind: string } };
    expect(outline).toMatchObject({ revision: 1, decomposition: { kind: 'single-iteration' } });
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'outline-revised')).toHaveLength(1);
    expect(existsSync(runPath(root, 'review-notes', runId, workLayout.outline('wi-001', 2)))).toBe(false);
  }, 180_000);

  test('a crash after work-item-completed leaves the item completed and starts it no second time', async () => {
    const root = await target();
    const { runId } = await crashAfter(root, 'work-item-completed', false, oneWorkItem());

    const { service } = await reopen(root);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'work-item-completed')).toHaveLength(1);
    expect(events.filter(event => event.type === 'work-item-started')).toHaveLength(1);
    // The run is interrupted, not completed: the final gate never ran.
    expect(events.at(-1)!.type).toBe('job-interrupted');
    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('interrupted');
    expect(snapshot.counts.completedWorkItems).toBe(1);
  }, 180_000);

  test('a mapping job directory Plan 1 left behind is not a run and is not listed', async () => {
    const root = await target();
    // Plan 1's record, as it stands on disk: the same schema literal, another kind.
    const directory = join(root, 'plans', 'review-notes', '.harness', 'jobs', '20260101T000000Z-aaaaaa');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'job.json'), `${JSON.stringify({
      schema: 'ramify-agent.job/2', jobId: '20260101T000000Z-aaaaaa', planId: 'review-notes', kind: 'mapping',
      agent: 'scripted', createdAt: '2026-01-01T00:00:00.000Z',
      manifest: { planHash: 'a'.repeat(64), source: null, versions: { architectPrompt: null, procedure: null, skill: null, ramify: null }, architectView: { status: 'placeholder' } },
    }, null, 2)}\n`);

    const { service, recovery, warnings } = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    cleanups.push(() => service.close());
    expect(service.listRuns('review-notes')).toEqual([]);
    expect(recovery.skipped).toEqual([]);
    expect(recovery.interrupted).toEqual([]);
    expect(warnings).toEqual([]);
  }, 180_000);
});

/*
 * The boundaries an iteration adds. A run is never resumed in place: it is
 * interrupted on load, every record file is re-materialized from the log,
 * and each external effect whose intent has no completion is performed
 * again. What was already closed stays closed.
 */
describe('the boundaries of an iteration', () => {
  const notes = 'collection-review/workspace/reviews/notes';
  const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

  /** A fixture copy with one module of this test's own and a runner that really runs its test. */
  async function iterationTarget() {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await addModule(fixture.root, notesDirectory, 'notes', {
      'src/notes.ts': 'export const noteLimit = 500;\n',
      'src/tests/notes.test.ts': [
        'import { test, expect } from \'vitest\';',
        'import { noteLimit } from \'../notes.ts\';',
        '',
        'test(\'the limit is the one the plan asks for\', () => { expect(noteLimit).toBe(500); });',
        '',
      ].join('\n'),
    });
    await installMiniRunner(fixture.root);
    await initRepository(fixture.root);
    return fixture.root;
  }

  /** One work item, one assignment, one engineer that writes a file and proposes completion. */
  function oneIteration(): OpenRunsOptions['script'] {
    return byRole({
      'initial-architect': [submitStep(analysis([entry('review-note', notes)]))],
      'local-architect': [submitStep(assign(notes, {}, outline())), submitStep(requestCompletion())],
      engineer: [[
        { kind: 'tool', tool: 'write', input: { path: `${notesDirectory}/src/store.ts`, content: 'export const store = new Map();\n' } },
        { kind: 'submit', input: completionProposed('Added the note store.') },
      ]],
    });
  }

  test('a crash after iteration-assigned rewrites the assignment from the log and assigns nothing twice', async () => {
    const root = await iterationTarget();
    const { runId } = await crashAfter(root, 'iteration-assigned', false, oneIteration(), treeInputs());
    const assignment = runPath(root, 'review-notes', runId, iterationLayout.assignment('wi-001', 1));
    await rm(assignment);

    const { service, recovery, agent } = await reopen(root);
    expect(agent).toBeUndefined();
    expect(recovery.interrupted).toEqual([`review-notes/${runId}`]);
    // The record the log committed is written again, byte for byte.
    expect(existsSync(assignment)).toBe(true);
    expect(JSON.parse(await readFile(assignment, 'utf8')) as { id: string }).toMatchObject({ id: 'wi-001.i01' });
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'iteration-assigned')).toHaveLength(1);
    expect(events.at(-1)!.type).toBe('job-interrupted');
    expect(onlyRun(service, 'review-notes').state).toBe('interrupted');
  }, 180_000);

  test('a crash after a breaking iteration-assigned rewrites its broad scope, guarded hashes and authorization, and assigns nothing twice', async () => {
    const root = await iterationTarget();
    const broken = outline({
      breakingChanges: [{ guarantee: 'The note limit is a plain number.', reason: 'The request asks for a structured limit.', affectedConsumers: [notes], citations: [] }],
      revisionReason: 'The limit changes shape, and the runner has to be told about its new suite.',
    });
    const script = byRole({
      'initial-architect': [submitStep(analysis([entry('review-note', notes)]))],
      'local-architect': [submitStep(assign(notes, {
        kind: 'breaking',
        scope: { base: { modules: [notes], rationale: 'The limit and its reader change together.' }, extra: [], read: [], rationale: 'r' },
        authorizations: [{ path: 'vitest.config.ts', rationale: 'The suite moves.' }],
      }, broken)), submitStep(requestCompletion())],
      engineer: [[{ kind: 'submit', input: completionProposed('Nothing to do.') }]],
    });
    const { runId } = await crashAfter(root, 'iteration-assigned', false, script, treeInputs());
    const path = runPath(root, 'review-notes', runId, iterationLayout.assignment('wi-001', 1));
    const before = await readFile(path, 'utf8');
    await rm(path);

    const { service, recovery, agent } = await reopen(root);
    expect(agent).toBeUndefined();
    expect(recovery.interrupted).toEqual([`review-notes/${runId}`]);
    // The same bytes: the broad base with its rationale, the guarded hashes
    // it was captured with, and the authorization with the outline revision
    // that recorded it. Nothing is captured a second time.
    expect(await readFile(path, 'utf8')).toBe(before);
    const assignment = JSON.parse(before) as IterationAssignment;
    expect(assignment.kind).toBe('breaking');
    expect(assignment.gate.checkpoint).toBe('breaking-iteration');
    expect(assignment.scope.base).toEqual({ modules: [notes], rationale: 'The limit and its reader change together.' });
    expect(assignment.guarded.map(file => file.path)).toContain('vitest.config.ts');
    expect(assignment.authorizations).toEqual([{ path: 'vitest.config.ts', rationale: 'The suite moves.', by: expect.objectContaining({ id: 'wi-001', revision: 1 }) }]);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'iteration-assigned')).toHaveLength(1);
    expect(events.some(event => event.type === 'gate-attempted')).toBe(false);
    expect(onlyRun(service, 'review-notes').state).toBe('interrupted');
  }, 180_000);

  test('a crash after writer-acquired closes that writer\'s invocation and acquires no second writer', async () => {
    const root = await iterationTarget();
    const { runId } = await crashAfter(root, 'writer-acquired', false, oneIteration(), treeInputs());

    const { service, recovery } = await reopen(root);
    expect(recovery.invocations).toEqual([`review-notes/${runId}: inv-0003`]);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'writer-acquired')).toHaveLength(1);
    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome('inv-0003')), 'utf8')) as InvocationOutcome;
    expect(outcome).toMatchObject({ ended: 'failed', interruption: 'session-lost' });
    expect(onlyRun(service, 'review-notes').state).toBe('interrupted');
  }, 180_000);

  /** An engineer that writes through the unguarded shell before it submits. */
  function oneShellIteration(marker: string): OpenRunsOptions['script'] {
    return byRole({
      'initial-architect': [submitStep(analysis([entry('review-note', notes)]))],
      'local-architect': [submitStep(assign(notes, {}, outline())), submitStep(requestCompletion())],
      engineer: [[
        shell(`printf 'export const store = new Map();\\n' > ${marker}`),
        { kind: 'submit', input: completionProposed('Added the note store with a command.') },
      ]],
    });
  }

  test('a crash after writer-released keeps what the shell wrote, closes the invocation and releases no second writer', async () => {
    const root = await iterationTarget();
    const written = `${notesDirectory}/src/store.ts`;
    const { runId } = await crashAfter(root, 'writer-released', false, oneShellIteration(written), treeInputs());

    // The tree is what the interrupted engineer left: recovery never
    // reverts, and the next run reads it as it stands.
    expect(await readFile(join(root, written), 'utf8')).toBe('export const store = new Map();\n');

    const { service, recovery } = await reopen(root);
    expect(recovery.invocations).toEqual([`review-notes/${runId}: inv-0003`]);
    expect(await readFile(join(root, written), 'utf8')).toBe('export const store = new Map();\n');

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'writer-released')).toHaveLength(1);
    expect(events.filter(event => event.type === 'writer-acquired')).toHaveLength(1);
    expect(events.at(-1)!.type).toBe('job-interrupted');
    expect(onlyRun(service, 'review-notes').state).toBe('interrupted');
    // Nothing was checked or committed against a tree the harness never saw
    // settle into a proposal.
    expect(events.some(event => event.type === 'gate-attempted')).toBe(false);
    expect(await commitCount(root, runId)).toBe(1);

    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome('inv-0003')), 'utf8')) as InvocationOutcome;
    expect(outcome).toMatchObject({ ended: 'failed', interruption: 'session-lost' });
    // The observation log is appended without a transaction, so what it
    // holds of an interrupted invocation is qualified rather than trusted.
    const observations = (await readFile(runPath(root, 'review-notes', runId, runLayout.observations('inv-0003')), 'utf8'))
      .split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string; data: { kind?: string } });
    expect(observations.some(line => line.type === 'coverage-gap' && line.data.kind === 'observation-truncated')).toBe(true);
    expect(observations.some(line => line.type === 'coverage-gap' && line.data.kind === 'unguarded-shell')).toBe(true);
  }, 180_000);

  test('a crash after iteration-closed leaves the accepted iteration accepted and its one commit where it is', async () => {
    const root = await iterationTarget();
    const { runId } = await crashAfter(root, 'iteration-closed', false, oneIteration(), treeInputs());
    const result = runPath(root, 'review-notes', runId, iterationLayout.result('wi-001', 1));
    const before = await readFile(result, 'utf8');
    await rm(result);

    const { service, recovery } = await reopen(root);
    expect(existsSync(result)).toBe(true);
    expect(await readFile(result, 'utf8')).toBe(before);
    expect(recovery.effects).toEqual([]);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'iteration-closed')).toHaveLength(1);
    // The run is not driven further: it is interrupted, and the work item it
    // was working is not closed by the interruption.
    expect(events.at(-1)!.type).toBe('job-interrupted');
    expect(events.some(event => event.type === 'work-item-completed')).toBe(false);
    expect(onlyRun(service, 'review-notes').state).toBe('interrupted');
    expect(await commitCount(root, runId)).toBe(2);
  }, 180_000);

  test('an interrupted run leaves every completed work item completed, and starts none of them again', async () => {
    const root = await iterationTarget();
    // Two entry capabilities: the first work item is closed before the crash.
    const script = byRole({
      'initial-architect': [submitStep(analysis([entry('review-note', notes), entry('review-note-two', notes)]))],
      'local-architect': [submitStep(requestCompletion()), submitStep(assign(notes, {}, outline())), submitStep(requestCompletion())],
      engineer: [[{ kind: 'submit', input: completionProposed('Nothing needed changing.') }]],
    });
    const { runId } = await crashAfter(root, 'iteration-assigned', false, script, treeInputs());

    const first = await reopen(root);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    // The first work item stays closed, and the second stays open.
    const completed = events.filter(event => event.type === 'work-item-completed');
    expect(completed.map(event => (event.data as { workItem: string }).workItem)).toEqual(['wi-001']);
    expect(events.filter(event => event.type === 'work-item-started')).toHaveLength(2);
    expect(events.at(-1)!.type).toBe('job-interrupted');
    expect(onlyRun(first.service, 'review-notes').state).toBe('interrupted');

    // Loading the run again neither repeats the closed item nor resumes the
    // open one: an interrupted run is not driven further.
    await first.service.close();
    const again = await reopen(root);
    expect((await runEventsOnDisk(root, 'review-notes', runId)).length).toBe(events.length);
    expect(again.recovery.interrupted).toEqual([]);
    expect(onlyRun(again.service, 'review-notes').state).toBe('interrupted');
  }, 180_000);
});

describe('the boundaries of a delegation', () => {
  const consumer = 'collection-review/workspace/reviews/notes';
  const consumerDirectory = 'subs/workspace/subs/reviews/subs/notes';
  const provider = 'collection-review/workspace/reviews/limits';
  const providerDirectory = 'subs/workspace/subs/reviews/subs/limits';

  const seam: Seam = {
    capability: 'note-limit',
    name: 'NoteLimit',
    providerDirectory,
    provider,
    consumerDirectory,
    consumerFile: 'notes.ts',
    reach: '../../limits',
    behavior: 'A note of at most 500 characters is within the limit.',
  };

  /** A project with the consumer that needs the behavior and the owner that will provide it. */
  async function delegationTarget() {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await addModule(fixture.root, consumerDirectory, 'notes', {
      'src/notes.ts': consumerStub,
      'src/tests/notes.test.ts': consumerTest('notes.ts'),
    });
    await addModule(fixture.root, providerDirectory, 'limits', {});
    await installMiniRunner(fixture.root);
    await initRepository(fixture.root);
    return fixture.root;
  }

  /** One delegation: a need, a contract sub-session, and the yield that follows it. */
  function oneDelegation(): OpenRunsOptions['script'] {
    return byRole({
      'initial-architect': [submitStep(analysis([entry('review-notes', consumer)]))],
      'local-architect': [
        submitStep({
          ...assign(consumer, {}, outline()),
          localDecisions: [localDecision(
            {
              question: 'Where does the note limit belong?',
              outcome: 'reuse',
              capability: 'note-limit',
              owner: provider,
              rationale: 'The limit is a capability of its own in a subtree this architect may place work in.',
            },
            [registryChange({ capability: 'note-limit', owner: provider, behavior: 'A note of at most 500 characters is within the limit.' })],
          )],
        }),
        submitStep({ kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'Waiting for the real limit.' }),
      ],
      engineer: [submitStep(contractNeeded(seam))],
      'contract-engineer': [[...contractWrites(seam), { kind: 'submit', input: established(seam) }]],
    });
  }

  test('a crash after contract-requested leaves the assignment, and no registration and no second sub-session', async () => {
    const root = await delegationTarget();
    const { runId } = await crashAfter(root, 'contract-requested', false, oneDelegation(), treeInputs());
    const assignment = runPath(root, 'review-notes', runId, iterationLayout.assignment('wi-001', 2));
    await rm(assignment);

    const { service, recovery, agent } = await reopen(root);
    expect(agent).toBeUndefined();
    expect(recovery.interrupted).toEqual([`review-notes/${runId}`]);
    // The assignment the log committed is written again, byte for byte.
    expect(existsSync(assignment)).toBe(true);
    expect(JSON.parse(await readFile(assignment, 'utf8')) as { id: string; kind: string; requestedBy?: string })
      .toMatchObject({ id: 'wi-001.i02', kind: 'contract', requestedBy: 'wi-001.i01' });
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'contract-requested')).toHaveLength(1);
    expect(events.map(event => event.type)).not.toContain('contract-registered');
    expect(onlyRun(service, 'review-notes').state).toBe('interrupted');
  }, 180_000);

  test('a restart after contract-registered recovers one obligation and one requirement, and the caller reads the outcome from them', async () => {
    const root = await delegationTarget();
    const { runId } = await crashAfter(root, 'contract-registered', false, oneDelegation(), treeInputs());
    const contract = runPath(root, 'review-notes', runId, contractsLayout.contract('ct-001', 1));
    const obligation = runPath(root, 'review-notes', runId, contractsLayout.obligation('ob-ct-001', 1));
    const requirement = runPath(root, 'review-notes', runId, contractsLayout.requirement('rq-001', 1));
    const providerItem = runPath(root, 'review-notes', runId, workLayout.item('wi-002'));
    for (const path of [contract, obligation, requirement, providerItem]) await rm(path);

    const { service, recovery, agent } = await reopen(root);
    expect(agent).toBeUndefined();
    expect(recovery.interrupted).toEqual([`review-notes/${runId}`]);
    // Every record of the registration is materialized again from the line
    // that committed it, and there is exactly one of each.
    for (const path of [contract, obligation, requirement, providerItem]) expect(existsSync(path)).toBe(true);
    expect(JSON.parse(await readFile(obligation, 'utf8')) as { id: string; revision: number })
      .toMatchObject({ id: 'ob-ct-001', revision: 1 });
    expect(JSON.parse(await readFile(requirement, 'utf8')) as { id: string; workItem: string })
      .toMatchObject({ id: 'rq-001', workItem: 'wi-001' });
    expect(JSON.parse(await readFile(providerItem, 'utf8')) as { id: string; startedFor: string })
      .toMatchObject({ id: 'wi-002', startedFor: 'wi-001' });

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'contract-registered')).toHaveLength(1);
    // The caller's own iteration closed before the sub-session started, and
    // the sub-session's own closing is not written yet. What the caller
    // learns about the outcome it learns from the committed registration,
    // not from a reply of a session it never held.
    const closings = events.filter(event => event.type === 'iteration-closed');
    expect(closings.map(event => event.data.iteration)).toEqual(['wi-001.i01']);
    expect(closings[0]!.data.outcome).toBe('partial');
    const requested = events.findIndex(event => event.type === 'contract-requested');
    const registeredAt = events.findIndex(event => event.type === 'contract-registered');
    expect(events.findIndex(event => event.type === 'iteration-closed')).toBeLessThan(requested);
    expect(registeredAt).toBeGreaterThan(requested);
    expect(onlyRun(service, 'review-notes').counts.openRequirements).toBe(1);
    expect(onlyRun(service, 'review-notes').state).toBe('interrupted');
  }, 180_000);

  /** The revised agreement: the same seam at a length the provider can keep. */
  const relaxed: Seam = { ...seam, limit: 300, behavior: 'A note of at most 300 characters is within the limit.' };

  /**
   * One delegation whose provider reports it cannot conform, and the
   * revision the consumer's architect assigns in answer.
   */
  function oneRevision(): OpenRunsOptions['script'] {
    return byWork({
      'initial-architect': [submitStep(analysis([entry('review-notes', consumer)]))],
      'local-architect:wi-001': [
        submitStep({
          ...assign(consumer, {}, outline()),
          localDecisions: [localDecision(
            {
              question: 'Where does the note limit belong?',
              outcome: 'reuse',
              capability: 'note-limit',
              owner: provider,
              rationale: 'The limit is a capability of its own in a subtree this architect may place work in.',
            },
            [registryChange({ capability: 'note-limit', owner: provider, behavior: 'A note of at most 500 characters is within the limit.' })],
          )],
        }),
        submitStep({ kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'Waiting for the real limit.' }),
        submitStep(assign(consumer, {
          kind: 'contract',
          revisesContract: 'ct-001',
          goal: 'Revise ct-001 to the length the provider can keep.',
          approach: 'The provider cannot index 500 characters; agree the length it can.',
          completionEvidence: 'The revised suite passes against the fake.',
        })),
      ],
      'engineer:wi-001': [submitStep(contractNeeded(seam))],
      'contract-engineer:wi-001': [
        [...contractWrites(seam), { kind: 'submit', input: established(seam) }],
        [...contractWrites(relaxed), { kind: 'submit', input: established(relaxed) }],
      ],
      'local-architect:wi-002': [submitStep(assign(provider, {}, outline({ changes: 'Implement the agreed limit.' })))],
      'engineer:wi-002': [submitStep({
        kind: 'unsuitable',
        reason: 'provider-cannot-conform',
        detail: 'The agreed suite requires a length the store cannot index.',
      })],
    });
  }

  test('a crash after revision-needed leaves the report standing and revises nothing', async () => {
    const root = await delegationTarget();
    const { runId } = await crashAfter(root, 'revision-needed', false, oneRevision(), treeInputs());

    const { service, recovery } = await reopen(root);
    expect(recovery.interrupted).toEqual([`review-notes/${runId}`]);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    // The report is in the log once, the provider's iteration closed as
    // unsuitable before it, and the agreement is untouched: recovery calls
    // no agent and revises nothing.
    const reports = events.filter(event => event.type === 'revision-needed');
    expect(reports).toHaveLength(1);
    expect(reports[0]!.data).toMatchObject({ iteration: 'wi-002.i01', consumerWorkItem: 'wi-001' });
    expect(events.map(event => event.type)).not.toContain('evidence-reopened');
    expect(existsSync(runPath(root, 'review-notes', runId, contractsLayout.contract('ct-001', 2)))).toBe(false);
    expect(onlyRun(service, 'review-notes').state).toBe('interrupted');
  }, 300_000);

  test('a restart after evidence-reopened recovers one revision of each record with the same bindings', async () => {
    const root = await delegationTarget();
    const { runId } = await crashAfter(root, 'evidence-reopened', false, oneRevision(), treeInputs());
    const reopenedRecords = [
      contractsLayout.contract('ct-001', 2),
      contractsLayout.obligation('ob-ct-001', 2),
      contractsLayout.requirement('rq-001', 2),
    ].map(path => runPath(root, 'review-notes', runId, path));
    for (const path of reopenedRecords) await rm(path);

    const { service, recovery } = await reopen(root);
    expect(recovery.interrupted).toEqual([`review-notes/${runId}`]);
    // Every record of the reopening is materialized again from the line
    // that committed it, and the revision in force before it is still there.
    for (const path of reopenedRecords) expect(existsSync(path)).toBe(true);
    expect(existsSync(runPath(root, 'review-notes', runId, contractsLayout.contract('ct-001', 1)))).toBe(true);
    expect(JSON.parse(await readFile(reopenedRecords[1]!, 'utf8')) as { id: string; revision: number })
      .toMatchObject({ id: 'ob-ct-001', revision: 2 });

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const reopenings = events.filter(event => event.type === 'evidence-reopened');
    expect(reopenings).toHaveLength(1);
    // Both items were unfinished, so the reopening reused them and created
    // no follow-up. Replay restores the same bindings and the same work
    // item identifiers, and no second reopening is appended.
    expect(reopenings[0]!.data).toMatchObject({ contract: 'ct-001', revision: 2, followUps: [], superseded: [] });
    expect((reopenings[0]!.data as { bindings: Array<{ subject: { id: string }; workItem: string }> }).bindings
      .map(binding => [binding.subject.id, binding.workItem])).toEqual([['ob-ct-001', 'wi-002'], ['rq-001', 'wi-001']]);
    expect(events.filter(event => event.type === 'work-item-started')).toHaveLength(2);
    expect(onlyRun(service, 'review-notes').counts.openRequirements).toBe(1);
    expect(onlyRun(service, 'review-notes').state).toBe('interrupted');
  }, 300_000);

  test('a crash after work-item-yielded leaves the yield standing and starts no provider work', async () => {
    const root = await delegationTarget();
    const { runId } = await crashAfter(root, 'work-item-yielded', false, oneDelegation(), treeInputs());

    const { service, recovery } = await reopen(root);
    expect(recovery.interrupted).toEqual([`review-notes/${runId}`]);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'work-item-yielded')).toHaveLength(1);
    expect(events.map(event => event.type)).not.toContain('work-item-resumed');
    // The provider work item exists and has not been started.
    expect(existsSync(runPath(root, 'review-notes', runId, workLayout.item('wi-002')))).toBe(true);
    expect(events.filter(event => event.type === 'work-item-started').map(event => event.data.workItem)).toEqual(['wi-001']);
    expect(onlyRun(service, 'review-notes').state).toBe('interrupted');
  }, 180_000);
});
