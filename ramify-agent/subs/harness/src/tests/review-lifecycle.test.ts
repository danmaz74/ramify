import { readdir, readFile, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';
import type { CheckExecutionPort } from '../checks/execution.js';
import type { RunEvent } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { reduceSessions } from '../run/sessions.js';
import { reviewLayout } from '../reviews/records.js';
import { snapshotToolNames } from '../reviews/snapshot.js';
import { scriptedCandidates, testReviewPolicy } from './helpers/candidates.js';
import { createPassingCheckExecution } from './helpers/direct-check-execution.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { completionProposed, submit, write } from './helpers/iterations.js';
import { mockGit } from './helpers/mock-git.js';
import {
  attemptRecord, candidates, eventsOf, gate, limit, notesDirectory, plan, reviewRun, reviewTarget, store, tool,
} from './helpers/reviews.js';
import { freeze, onlyRun, openRuns, runEventsOnDisk, runPath, staleCrashLock, stopRun, testPolicy, until } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * The lifecycle of review readers (Plan 12 iteration 3): a stop and the
 * reviews' settlement bound own every live reader and settle or fence each
 * attempt before the run's terminal event; a crash between a passing gate
 * and its request, or while a reader runs, is recovered once from the log;
 * a result committed before a crash is rebuilt without a reviewer; and a
 * slow gate audit no longer holds a reader's result back.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

/** The only run of the project, whose ID a script step needs before the test has it. */
let currentRun = '';
const runIdOf = (): string => currentRun;

const never = (): ScriptStep => ({ kind: 'await', until: () => new Promise(() => undefined) });
/** A reader's turn that reads the path's patch through its tool, then submits a clean review of it. */
const clean = (inspected: string): ScriptStep[] => [tool(snapshotToolNames.diff, { path: inspected }), { kind: 'submit', input: { inspected: [inspected], missing: [], concerns: [] } }];
const concern = (path: string, summary: string): ScriptStep[] => [tool(snapshotToolNames.diff, { path }), { kind: 'submit', input: { inspected: [path], missing: [], concerns: [{
  summary, consequence: `${summary}, so the behavior differs from the goal`, rationale: 'read the candidate', uncertainty: 'low',
  remedy: 'a bounded change in the named file', locations: [{ path, startLine: 1, endLine: 1 }], suggests: null, risk: 'low', ground: null,
}] } }];

/** The three engineers of the scenario, the third starting only once `before` settles. */
function engineers(before?: () => Promise<unknown>, after?: ScriptStep) {
  return [
    submit(completionProposed('Added the note store.'), write(store, 'export const store = new Map(); // v1\n')),
    submit(completionProposed('Stated the note limit.'), write(limit, 'export const limit = (text: string) => text.length <= 50;\n')),
    submit(completionProposed('Exported the store.'),
      ...(before === undefined ? [] : [{ kind: 'await', until: before } as ScriptStep]),
      ...(after === undefined ? [] : [after]),
      write(store, 'export const store = new Map(); // v3\n'), write(`${notesDirectory}/src/index.ts`, 'export * from \'./store.js\';\n')),
  ];
}

/** The events of a run's log, once it stops changing. */
async function settledLog(root: string, runId: string): Promise<RunEvent[]> {
  let last = -1;
  for (;;) {
    const events = await runEventsOnDisk(root, plan, runId);
    if (events.length === last) return events;
    last = events.length;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}

/** A service opened over the crashed project: what recovery asks of Git is answered, and nothing is driven. */
async function restart(root: string) {
  const restarted = await openRuns(root, {
    script: [],
    git: mockGit({ changedPaths: async () => [], currentHead: async () => 'revision-03' }),
    candidates: scriptedCandidates(root, candidates()),
    policy: projectRoot => testPolicy(projectRoot, { reviews: testReviewPolicy() }),
  });
  cleanups.push(() => restarted.service.close());
  return restarted;
}

describe('CF07: a stop owns every live reader, and a late result is fenced', () => {
  test('two live readers are stopped with the writer, each attempt is settled before job-stopped, and a reader that ignores its stop ingests nothing', async () => {
    const root = await reviewTarget(cleanups);
    const waiting = [gate(), gate()] as const;
    const signal = (index: 0 | 1): ScriptStep => ({ kind: 'await', until: async () => { waiting[index].open(); } });
    const run = await reviewRun(root, cleanups, {
      detached: true,
      stopGraceMs: 300,
      engineer: engineers(undefined, never()),
      reviewers: {
        'rq-0001': [tool(snapshotToolNames.diff, { path: store }), signal(0), never()],
        // This reader ignores its stop and submits a concern afterwards.
        'rq-0002': [signal(1), { kind: 'stall', ms: 1_500, thenIgnoreStop: true },
          ...concern(limit, 'A late concern that must not be ingested')],
      },
    });
    cleanups.push(() => run.service.close());
    const { service, runId } = run;
    await Promise.all(waiting.map(entry => entry.opened));
    // The third iteration's writer is live beside both readers: its session
    // has started, not only its invocation. A stop between the two ends the
    // invocation before any session exists, and there is none to stop.
    await until(async () => (await runEventsOnDisk(root, plan, runId)).some(event => event.type === 'invocation-started' && event.data.work.iteration === 'wi-001.i03')
      && run.agent!.sessions.filter(session => session.spec.role === 'engineer').length === 3);
    // Readers may still be writing, so the stop is sent at the version it finds.
    for (;;) {
      try {
        await service.execute(stopRun(plan, runId, service.getRun(plan, runId)!.version));
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== 'stale-version') throw error;
      }
    }
    await service.settled(plan, runId);
    // The reader that ignored its stop has submitted by now, after the run ended.
    await until(() => run.agent!.sessions.some(session => session.spec.prompt.includes('rq-0002') && session.outcome !== undefined), 10_000);
    const events = await settledLog(root, runId);

    expect(onlyRun(service, plan).state).toBe('stopped');
    const stopped = events.find(event => event.type === 'job-stopped')!;
    expect(events.at(-1)).toBe(stopped);
    expect(stopped.data).toEqual({ settled: false });
    const finished = eventsOf(events, 'review-attempt-finished').sort((a, b) => (a.data.attempt < b.data.attempt ? -1 : 1));
    expect(finished.map(event => [event.data.attempt, event.data.result, event.data.reason, event.data.settles, event.data.checkFindings.length]))
      .toEqual([['rq-0001.a01', 'not-verified', 'stopped', true, 0], ['rq-0002.a01', 'not-verified', 'stopped', true, 0]]);
    expect(finished.every(event => event.sequence < stopped.sequence)).toBe(true);
    // Every reader and the writer were asked to stop.
    const reviewers = run.agent!.sessions.filter(session => session.spec.role === 'reviewer');
    expect(reviewers).toHaveLength(2);
    expect(reviewers.every(session => session.stopCalls > 0)).toBe(true);
    expect(run.agent!.sessions.find(session => session.spec.role === 'engineer' && session.stopCalls > 0)).toBeDefined();
    // The late concern reached the submission tool after the run ended, and was refused there.
    const late = reviewers.find(session => session.spec.prompt.includes('rq-0002'))!;
    expect(late.verdicts.at(-1)).toMatchObject({ accepted: false, final: true });
    expect(service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all' })).toMatchObject({ ok: true, view: { total: 0 } });
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 2, complete: 0, partial: 0, notVerified: 2, pending: 0 });
  }, 60_000);

  test('the settlement bound stops a reader that never answers, and the run completes with no reader left', async () => {
    const root = await reviewTarget(cleanups);
    const run = await reviewRun(root, cleanups, {
      policy: { settleMs: 300 },
      engineer: engineers(),
      reviewers: { 'rq-0001': clean(store), 'rq-0002': clean(limit), 'rq-0003': [never()] },
    });
    const { events, service, runId } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    const finished = eventsOf(events, 'review-attempt-finished').sort((a, b) => (a.data.attempt < b.data.attempt ? -1 : 1));
    expect(finished.map(event => [event.data.attempt, event.data.result, event.data.reason])).toEqual([
      ['rq-0001.a01', 'complete', null], ['rq-0002.a01', 'complete', null], ['rq-0003.a01', 'not-verified', 'deadline'],
    ]);
    const completed = events.find(event => event.type === 'job-completed')!;
    expect(finished.every(event => event.sequence < completed.sequence)).toBe(true);
    expect((await attemptRecord(root, runId, 'rq-0003.a01')).result).toMatchObject({ reason: 'deadline', detail: expect.stringContaining('settlement bound') });
    // No session of the run is left live or suspended.
    expect([...reduceSessions(events).values()].filter(session => session.state !== 'finished')).toEqual([]);
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 3, complete: 2, partial: 0, notVerified: 1, pending: 0 });
    run.git.assertComplete();
  }, 60_000);
});

describe('CF04: an unscheduled review', () => {
  test('a request beyond the queue\'s bound is finished as overflowed and never run', async () => {
    const root = await reviewTarget(cleanups);
    // One reader, one waiting request: the third request has no room while
    // the first reader waits for it to be refused.
    const run = await reviewRun(root, cleanups, {
      policy: { concurrency: 1, queue: 1 },
      afterWrite: async (_write, id) => { currentRun = id; },
      engineer: engineers(),
      reviewers: {
        'rq-0001': [{ kind: 'await', until: () => until(async () => (await runEventsOnDisk(root, plan, runIdOf())).some(event =>
          event.type === 'review-attempt-finished' && event.data.reason === 'queue-overflow')) }, ...clean(store)],
        'rq-0002': clean(limit),
      },
    });
    const { events, service, runId } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    expect(eventsOf(events, 'review-attempt-finished').map(event => [event.data.attempt, event.data.result, event.data.reason])).toEqual([
      ['rq-0003.a01', 'not-verified', 'queue-overflow'], ['rq-0001.a01', 'complete', null], ['rq-0002.a01', 'complete', null],
    ]);
    expect(eventsOf(events, 'review-attempt-started').map(event => event.data.request)).toEqual(['rq-0001', 'rq-0002']);
    expect(await attemptRecord(root, runId, 'rq-0003.a01')).toMatchObject({ startedAt: null, invocation: null, result: { detail: expect.stringContaining('More than 1 review request') } });
  }, 60_000);
});

describe('CF06: a crash around a review is recovered exactly once', () => {
  test('a crash after the gate and before its request records the request on restart, once', async () => {
    const root = await reviewTarget(cleanups);
    const crashed = gate();
    let frozen = false;
    const run = await reviewRun(root, cleanups, {
      detached: true,
      engineer: engineers(),
      reviewers: { 'rq-0001': clean(store) },
      afterWrite: async write => {
        if (frozen) return freeze();
        if (write !== 'iteration-closed') return;
        frozen = true;
        crashed.open();
        return freeze();
      },
    });
    await crashed.opened;
    const before = await settledLog(root, run.runId);
    expect(before.at(-1)).toMatchObject({ type: 'iteration-closed', data: { iteration: 'wi-001.i01', outcome: 'accepted' } });
    expect(before.some(event => event.type === 'review-request-recorded')).toBe(false);
    await staleCrashLock(root);

    const restarted = await restart(root);
    expect(restarted.agent!.sessions).toHaveLength(0);
    expect(restarted.recovery.reviews).toEqual([
      `${plan}/${run.runId}: review request rq-0001 of wi-001.i01`,
      `${plan}/${run.runId}: review attempt rq-0001.a01, finished as not verified`,
    ]);
    const after = await runEventsOnDisk(root, plan, run.runId);
    // The request and its terminal attempt, then what every recovery appends:
    // the three kept sessions finished, and the interruption.
    expect(after.slice(before.length).map(event => event.type)).toEqual([
      'review-request-recorded', 'review-attempt-finished', 'session-finished', 'session-finished', 'session-finished', 'job-interrupted',
    ]);
    expect(eventsOf(after, 'review-request-recorded')[0]!.data).toEqual({
      request: 'rq-0001', workItem: 'wi-001', iteration: 'wi-001.i01', kind: 'code', gate: 'ga-0002', candidate: 'revision-01',
    });
    expect(await attemptRecord(root, run.runId, 'rq-0001.a01')).toMatchObject({
      startedAt: null, invocation: null, settles: true, result: { result: 'not-verified', reason: 'stopped' },
    });
    expect(restarted.service.reviews(plan, run.runId)!.coverage).toEqual({ state: 'available', requested: 1, complete: 0, partial: 0, notVerified: 1, pending: 0 });

    // A second restart finds nothing owed and changes nothing.
    await restarted.service.close();
    cleanups.pop();
    const again = await restart(root);
    expect(again.recovery.reviews).toEqual([]);
    expect(await runEventsOnDisk(root, plan, run.runId)).toEqual(after);
  }, 60_000);

  test('a crash while a reader runs finishes its attempt as not verified, and its session as interrupted', async () => {
    const root = await reviewTarget(cleanups);
    const crashed = gate();
    let frozen = false;
    const run = await reviewRun(root, cleanups, {
      detached: true,
      engineer: engineers(),
      reviewers: { 'rq-0001': clean(store) },
      afterWrite: async (write, runId) => {
        if (frozen) return freeze();
        if (write !== 'invocation-started') return;
        if (!(await runEventsOnDisk(root, plan, runId)).some(event => event.type === 'review-attempt-started')) return;
        frozen = true;
        crashed.open();
        return freeze();
      },
    });
    await crashed.opened;
    const before = await settledLog(root, run.runId);
    const started = eventsOf(before, 'review-attempt-started');
    expect(started.map(event => event.data.attempt)).toEqual(['rq-0001.a01']);
    expect(before.some(event => event.type === 'review-attempt-finished')).toBe(false);
    await staleCrashLock(root);

    const restarted = await restart(root);
    expect(restarted.agent!.sessions).toHaveLength(0);
    expect(restarted.recovery.invocations).toContain(`${plan}/${run.runId}: ${started[0]!.data.invocation}`);
    expect(restarted.recovery.reviews).toEqual([`${plan}/${run.runId}: review attempt rq-0001.a01, finished as not verified`]);
    const after = await runEventsOnDisk(root, plan, run.runId);
    const finished = eventsOf(after, 'review-attempt-finished');
    expect(finished.map(event => [event.data.attempt, event.data.result, event.data.reason, event.data.settles])).toEqual([['rq-0001.a01', 'not-verified', 'execution-failed', true]]);
    expect(await attemptRecord(root, run.runId, 'rq-0001.a01')).toMatchObject({
      invocation: started[0]!.data.invocation, session: started[0]!.data.session, startedAt: expect.any(String), actualStart: null,
    });
    const sessions = reduceSessions(after);
    expect(sessions.get(started[0]!.data.session)).toMatchObject({ role: 'reviewer', state: 'finished', finished: 'interrupted' });
    expect(after.at(-1)).toMatchObject({ type: 'job-interrupted' });

    await restarted.service.close();
    cleanups.pop();
    const again = await restart(root);
    expect(again.recovery.reviews).toEqual([]);
    expect(await runEventsOnDisk(root, plan, run.runId)).toEqual(after);
  }, 60_000);

  test('a committed result is rebuilt from the log with its CheckFinding, and no reviewer runs again', async () => {
    const root = await reviewTarget(cleanups);
    const run = await reviewRun(root, cleanups, {
      engineer: engineers(),
      reviewers: { 'rq-0001': clean(store), 'rq-0002': concern(limit, 'The limit counts UTF-16 units'), 'rq-0003': clean(store) },
    });
    const { service, runId } = run;
    const coverage = service.reviews(plan, runId)!;
    const list = service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all' });
    expect(list).toMatchObject({ ok: true, view: { total: 1 } });
    const attempt = await readFile(runPath(root, plan, runId, reviewLayout.attempt('rq-0002.a01')), 'utf8');
    await service.close();
    cleanups.splice(cleanups.indexOf(cleanups.at(-1)!), 1);

    // The crash lost every materialized review and CheckFinding record.
    await rm(runPath(root, plan, runId, 'reviews'), { recursive: true });
    await rm(runPath(root, plan, runId, 'check-findings'), { recursive: true });
    const restarted = await restart(root);
    expect(restarted.agent!.sessions).toHaveLength(0);
    expect(restarted.recovery.rematerialized).toEqual([expect.stringMatching(new RegExp(`^${plan}/${runId}: \\d+ record file\\(s\\)$`, 'u'))]);
    expect(restarted.recovery.reviews).toEqual([]);
    expect(restarted.service.reviews(plan, runId)).toEqual(coverage);
    expect(restarted.service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all' })).toEqual(list);
    expect(await readFile(runPath(root, plan, runId, reviewLayout.attempt('rq-0002.a01')), 'utf8')).toBe(attempt);
    expect((await readdir(runPath(root, plan, runId, 'reviews'))).sort()).toEqual(['rq-0001', 'rq-0002', 'rq-0003']);
  }, 60_000);
});

describe('the gate audit and the run mutex', () => {
  test('a reader\'s result is committed while the next iteration\'s audit is still running', async () => {
    const root = await reviewTarget(cleanups);
    const auditing = gate();
    const release = gate();
    const passing = createPassingCheckExecution();
    const slowAudit: CheckExecutionPort = {
      async run(checks, request) {
        // The second iteration's gate audits slowly, as a real audit does.
        if (request.context.attemptId === 'ga-0003') {
          auditing.open();
          await release.opened;
        }
        return passing.run(checks, request);
      },
    };
    const run = await reviewRun(root, cleanups, {
      detached: true,
      checkExecution: slowAudit,
      engineer: engineers(),
      reviewers: {
        'rq-0001': [{ kind: 'await', until: () => auditing.opened }, ...clean(store)],
        'rq-0002': clean(limit),
        'rq-0003': clean(store),
      },
    });
    cleanups.push(() => run.service.close());
    await auditing.opened;
    const audited = Date.now();
    await until(async () => (await runEventsOnDisk(root, plan, run.runId)).some(event => event.type === 'review-attempt-finished'), 5_000);
    const delay = Date.now() - audited;
    const during = await runEventsOnDisk(root, plan, run.runId);
    // The audit is still held open: its attempt is not committed yet.
    expect(during.some(event => event.type === 'gate-committing' && event.data.gate === 'ga-0003')).toBe(true);
    expect(during.some(event => event.type === 'gate-attempted' && event.data.gate === 'ga-0003')).toBe(false);
    expect(delay).toBeLessThan(2_000);
    release.open();
    await run.service.settled(plan, run.runId);
    const events = await runEventsOnDisk(root, plan, run.runId);
    expect(onlyRun(run.service, plan).state).toBe('completed');
    const committing = events.find(event => event.type === 'gate-committing' && event.data.gate === 'ga-0003')!;
    const attempted = events.find(event => event.type === 'gate-attempted' && event.data.gate === 'ga-0003')!;
    const finished = events.find(event => event.type === 'review-attempt-finished' && event.data.attempt === 'rq-0001.a01')!;
    expect(committing.sequence).toBeLessThan(finished.sequence);
    expect(finished.sequence).toBeLessThan(attempted.sequence);
    // The gate's verdict and its record are what they were: a passing attempt.
    expect(attempted.data).toMatchObject({ verdict: 'passed', next: 'accept' });
    expect(JSON.parse(await readFile(runPath(root, plan, run.runId, runLayout.gate('ga-0003')), 'utf8'))).toMatchObject({ verdict: 'passed', audited: 'revision-02' });
    run.git.assertComplete();
  }, 60_000);
});
