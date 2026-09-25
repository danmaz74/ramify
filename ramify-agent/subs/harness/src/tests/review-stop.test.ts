import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent, type Script } from '../../subs/agent/src/scripted.js';
import type { AgentPort } from '../../subs/agent/src/interfaces/port.js';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import { commandResponseSchema } from '../interfaces/protocol/jobs.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { runCommandSchema, runResponseSchema, runSnapshotSchema, startRunCommandSchema } from '../interfaces/protocol/runs.js';
import { startServerWith, type RunningServer } from '../http/server.js';
import { RunQueries } from '../projections/queries.js';
import { RunLog } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { reduceSessions } from '../run/sessions.js';
import type { RunService } from '../run/service.js';
import { analysis, entry } from './helpers/analysis.js';
import { createPassingCheckExecution } from './helpers/direct-check-execution.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { copyFixture } from './helpers/fixture.js';
import { byRole, submit, treeInputs } from './helpers/iterations.js';
import {
  approveRun, emptyAnalysis, installTestRunner, onlyRun, runEventsOnDisk, runPath, staleCrashLock, startRun, stopRun, testPolicy, until,
} from './helpers/runs.js';
import { unchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { withPlan13Fixture } from './helpers/declarations.js';

/*
 * The review stop, architecture §3. A run started with `reviewStop` waits
 * after its analysis is accepted, holding the project, until a person
 * approves the analysis or stops the run. Nothing is written to the tree
 * before one of them: Git is scripted, and a stop at the review stop leaves
 * it asked for no branch and no commit.
 *
 * `approve-analysis` is also accepted by a run without the stop, before its
 * final verification and after it completed, and changes nothing but the
 * run's review. The time a run waited at its stop is not counted against
 * `runAbsoluteMs`.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

const plan = 'review-notes';
const reviews = 'collection-review/workspace/reviews';
const finalVerification = `final verification of plan "${plan}"`;

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  return fixture.root;
}

function version(service: RunService, runId: string): number {
  return service.getRun(plan, runId)!.version;
}

function phaseOf(service: RunService, runId: string) {
  return service.getRun(plan, runId)?.phase;
}

async function types(root: string, runId: string): Promise<string[]> {
  return (await runEventsOnDisk(root, plan, runId)).map(event => event.type);
}

describe('a run started with the review stop', () => {
  test('refuses approval when a captured companion changes', async () => {
    const root = await target();
    const path = join(root, 'plans', plan, 'plan.md');
    await writeFile(path, `${await readFile(path, 'utf8')}\n[Companion](companion.md)\n`);
    await writeFile(join(root, 'plans', plan, 'companion.md'), 'First version\n');
    const { service } = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun(plan, 'scripted', undefined, true));
    await until(() => phaseOf(service, receipt.jobId) === 'awaiting-review');
    await writeFile(join(root, 'plans', plan, 'companion.md'), 'Second version\n');
    await expect(service.execute(approveRun(plan, receipt.jobId, version(service, receipt.jobId), 'dana@example.com')))
      .rejects.toMatchObject({ code: 'inputs-changed' });
    expect(await types(root, receipt.jobId)).not.toContain('analysis-approved');
    await service.execute(stopRun(plan, receipt.jobId, version(service, receipt.jobId)));
    await service.settled(plan, receipt.jobId);
  });

  test('refuses completion when a companion changes during the final gate', async () => {
    const root = await target();
    const path = join(root, 'plans', plan, 'plan.md');
    await writeFile(path, `${await readFile(path, 'utf8')}\n[Companion](companion.md)\n`);
    await writeFile(join(root, 'plans', plan, 'companion.md'), 'First version\n');
    let changed = false;
    const { service } = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }], unchangedCheckpoints: [finalVerification],
      checkScript: async invocation => {
        if (!changed && invocation.context.checkpoint === 'final') {
          changed = true;
          await writeFile(join(root, 'plans', plan, 'companion.md'), 'Changed during gate\n');
        }
        return {};
      },
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun(plan));
    await service.settled(plan, receipt.jobId);
    expect(changed).toBe(true);
    expect(service.getRun(plan, receipt.jobId)).toMatchObject({ state: 'failed', failure: { reason: 'inputs-changed' } });
    expect(await types(root, receipt.jobId)).not.toContain('job-completed');
  });

  test('recovery verifies captured bytes and reconstructs a missing manifest event', async () => {
    const root = await target();
    const first = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    cleanups.push(() => first.service.close());
    const receipt = await first.service.execute(startRun(plan, 'scripted', undefined, true));
    await until(() => phaseOf(first.service, receipt.jobId) === 'awaiting-review');
    await first.service.close();
    const eventsPath = runPath(root, plan, receipt.jobId, runLayout.events);
    const firstLine = (await readFile(eventsPath, 'utf8')).split('\n')[0]!;
    await writeFile(eventsPath, `${firstLine}\n`);
    const restarted = await openRuns(root, { script: [] });
    cleanups.push(() => restarted.service.close());
    expect((await types(root, receipt.jobId)).slice(0, 2)).toEqual(['job-started', 'document-manifest-committed']);
    expect(restarted.recovery.interrupted).toEqual([`${plan}/${receipt.jobId}`]);
  });

  test('recovery does not publish staged capture without job-started', async () => {
    const root = await target();
    const first = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    cleanups.push(() => first.service.close());
    const receipt = await first.service.execute(startRun(plan, 'scripted', undefined, true));
    await until(() => phaseOf(first.service, receipt.jobId) === 'awaiting-review');
    await first.service.close();
    await writeFile(runPath(root, plan, receipt.jobId, runLayout.events), '');
    const restarted = await openRuns(root, { script: [] });
    cleanups.push(() => restarted.service.close());
    expect(restarted.recovery.skipped).toContain(`${plan}/${receipt.jobId}`);
    expect(restarted.service.getRun(plan, receipt.jobId)).toBeUndefined();
  });

  test('waits at awaiting-review holding the project, and an approval continues it to completion', async () => {
    const root = await target();
    const { service, git } = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      unchangedCheckpoints: [finalVerification],
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun(plan, 'scripted', 'start-reviewed', true));
    await until(() => phaseOf(service, receipt.jobId) === 'awaiting-review');

    const waiting = service.getRun(plan, receipt.jobId)!;
    expect(waiting).toMatchObject({ state: 'running', phase: 'awaiting-review', review: 'not-reviewed', current: null });
    expect((await types(root, receipt.jobId)).slice(-2)).toEqual(['analysis-accepted', 'review-requested']);
    const record = JSON.parse(await readFile(runPath(root, plan, receipt.jobId, runLayout.record), 'utf8')) as Record<string, unknown>;
    expect(record['reviewStop']).toBe(true);
    // Nothing touched the repository: readiness, which creates the branch, has not run.
    expect(git.branch()).toBeNull();
    expect(git.operations()['createRunBranch']).toBeUndefined();

    // The run holds the project: a second start is busy.
    await expect(service.execute(startRun('revision-diff'))).rejects.toMatchObject({ code: 'busy' });

    const approval = approveRun(plan, receipt.jobId, waiting.version, 'dana@example.com', 'The scenarios match the plan.');
    const approved = await service.execute(approval);
    expect(await service.execute({ ...approval })).toEqual(approved);
    await service.settled(plan, receipt.jobId);

    const done = onlyRun(service, plan);
    expect(done).toMatchObject({ state: 'completed', phase: 'ended', review: { reviewer: 'dana@example.com', at: approved.acceptedAt, duringRun: false } });
    const events = await runEventsOnDisk(root, plan, receipt.jobId);
    expect(events.map(event => event.type)).toEqual([
      'job-started', 'document-manifest-committed', 'session-opened', 'invocation-started', 'invocation-ended', 'analysis-accepted', 'review-requested', 'analysis-approved',
      'gate-started', 'readiness-passed', 'gate-committing', 'gate-attempted', 'session-finished', 'job-completed',
    ]);
    expect(events.find(event => event.type === 'analysis-approved')!.data).toMatchObject({
      reviewer: 'dana@example.com', note: 'The scenarios match the plan.', duringRun: false, command: { receipt: approved },
    });
    expect(git.branch()).toBe(`ramify-agent-run/${receipt.jobId}`);
  }, 120_000);

  test('a stop at awaiting-review ends the run stopped with no branch and no commit', async () => {
    const root = await target();
    const { service, git } = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun(plan, 'scripted', undefined, true));
    await until(() => phaseOf(service, receipt.jobId) === 'awaiting-review');
    await service.execute(stopRun(plan, receipt.jobId, version(service, receipt.jobId)));
    await service.settled(plan, receipt.jobId);

    expect(onlyRun(service, plan)).toMatchObject({ state: 'stopped', phase: 'ended', review: 'not-reviewed' });
    expect(await types(root, receipt.jobId)).toEqual([
      'job-started', 'document-manifest-committed', 'session-opened', 'invocation-started', 'invocation-ended', 'analysis-accepted', 'review-requested', 'stop-requested',
      'session-finished', 'job-stopped',
    ]);
    // The architect's session, kept through the stop, is finished as the run ends.
    expect([...reduceSessions(await runEventsOnDisk(root, plan, receipt.jobId)).values()].map(one => [one.id, one.state, one.finished]))
      .toEqual([['ses-0001', 'finished', 'run-ended']]);
    const stopped = (await runEventsOnDisk(root, plan, receipt.jobId)).at(-1)!;
    expect(stopped).toMatchObject({ type: 'job-stopped', data: { settled: true } });
    // The scripted Git was asked for no branch and no commit, and made none.
    expect(git.branch()).toBeNull();
    expect(git.commits()).toEqual([]);
    expect(git.operations()['createRunBranch']).toBeUndefined();
    expect(git.operations()['commitAccepted']).toBeUndefined();

    // A stopped run's analysis is not approved.
    await expect(service.execute(approveRun(plan, receipt.jobId, version(service, receipt.jobId))))
      .rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('stopped') });
  }, 120_000);

  test('closing the service while a run waits at the stop leaves it to be interrupted, as any other phase', async () => {
    const root = await target();
    const first = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    const receipt = await first.service.execute(startRun(plan, 'scripted', undefined, true));
    await until(() => phaseOf(first.service, receipt.jobId) === 'awaiting-review');
    // The waiting driver is woken by close, so the service quiesces at once.
    await first.service.close();
    expect(await types(root, receipt.jobId)).toEqual(['job-started', 'document-manifest-committed', 'session-opened', 'invocation-started', 'invocation-ended', 'analysis-accepted', 'review-requested']);
    // At the stop the architect's session is kept: suspended, to be continued after the approval.
    expect([...reduceSessions(await runEventsOnDisk(root, plan, receipt.jobId)).values()].map(one => [one.id, one.state]))
      .toEqual([['ses-0001', 'suspended']]);

    const second = await openRuns(root, { script: [] });
    cleanups.push(() => second.service.close());
    expect(second.recovery.interrupted).toEqual([`${plan}/${receipt.jobId}`]);
    expect(onlyRun(second.service, plan)).toMatchObject({ state: 'interrupted', phase: 'ended', review: 'not-reviewed' });
    expect(first.git.branch()).toBeNull();
    expect(second.git.operations()['createRunBranch']).toBeUndefined();
  }, 120_000);

  test('a crash at awaiting-review is recovered as interrupted, calls no agent, and refuses a later approval', async () => {
    const root = await target();
    const crashed = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    const receipt = await crashed.service.execute(startRun(plan, 'scripted', undefined, true));
    await until(() => phaseOf(crashed.service, receipt.jobId) === 'awaiting-review');
    // The crashed service is abandoned, never closed, and its lock is a dead process's.
    await staleCrashLock(root);

    const restarted = await openRuns(root, { script: [] });
    cleanups.push(() => restarted.service.close());
    expect(restarted.recovery.interrupted).toEqual([`${plan}/${receipt.jobId}`]);
    expect(restarted.recovery.invocations).toEqual([]);
    expect(await types(root, receipt.jobId)).toEqual([
      'job-started', 'document-manifest-committed', 'session-opened', 'invocation-started', 'invocation-ended', 'analysis-accepted', 'review-requested',
      'session-finished', 'job-interrupted',
    ]);
    expect(restarted.agent!.sessions).toHaveLength(0);
    expect(onlyRun(restarted.service, plan)).toMatchObject({ state: 'interrupted', review: 'not-reviewed' });

    await expect(restarted.service.execute(approveRun(plan, receipt.jobId, version(restarted.service, receipt.jobId))))
      .rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('interrupted') });
    expect(crashed.git.branch()).toBeNull();
    expect(restarted.git.operations()['createRunBranch']).toBeUndefined();
  }, 120_000);
});

describe('approve-analysis in a run without the stop', () => {
  test('while the run works it records the approval with duringRun and changes nothing else', async () => {
    const root = await target();
    const { service, agent } = await openRuns(root, {
      script: byRole({
        'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
        'local-architect': [[{ kind: 'wait', ms: 60_000 }]],
      }),
      inputs: treeInputs(),
      unchangedCheckpoints: [scenariosCommit(plan)],
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun(plan));
    await until(() => agent!.sessions.some(session => session.spec.submission.name === 'submit_work_item_result'));
    const before = service.getRun(plan, receipt.jobId)!;
    expect(before.phase).toBe('working');

    const approved = await service.execute(approveRun(plan, receipt.jobId, before.version, 'lee@example.com'));
    const after = service.getRun(plan, receipt.jobId)!;
    expect(after).toMatchObject({ phase: 'working', state: 'running', review: { reviewer: 'lee@example.com', at: approved.acceptedAt, duringRun: true } });
    expect(after.version).toBe(before.version + 1);
    expect({ ...after, version: before.version, updatedAt: before.updatedAt, review: before.review }).toEqual(before);
    expect(agent!.sessions.some(session => session.spec.submission.name === 'submit_work_item_result')).toBe(true);

    // A second approval is refused with the first one's reviewer.
    await expect(service.execute(approveRun(plan, receipt.jobId, after.version, 'kim@example.com')))
      .rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('already approved by lee@example.com') });

    await service.execute(stopRun(plan, receipt.jobId, service.getRun(plan, receipt.jobId)!.version));
    await service.settled(plan, receipt.jobId);
    expect(onlyRun(service, plan)).toMatchObject({ state: 'stopped', review: { reviewer: 'lee@example.com', duringRun: true } });
  }, 120_000);

  test('after completion it is recorded after job-completed, survives a restart, and a retry returns its receipt', async () => {
    const root = await target();
    const first = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      unchangedCheckpoints: [finalVerification],
    });
    const receipt = await first.service.execute(startRun(plan));
    await first.service.settled(plan, receipt.jobId);
    const completed = onlyRun(first.service, plan);
    expect(completed).toMatchObject({ state: 'completed', review: 'not-reviewed' });

    const approval = approveRun(plan, receipt.jobId, completed.version, 'sam@example.com', undefined, 'approve-after');
    const approved = await first.service.execute(approval);
    const reviewed = onlyRun(first.service, plan);
    expect(reviewed).toMatchObject({
      state: 'completed', phase: 'ended', endedAt: completed.endedAt, version: completed.version + 1,
      review: { reviewer: 'sam@example.com', at: approved.acceptedAt, duringRun: false },
    });
    expect((await types(root, receipt.jobId)).slice(-2)).toEqual(['job-completed', 'analysis-approved']);
    await first.service.close();

    // The log loads with the approval after its terminal event, and the
    // approval's command is remembered from it.
    const second = await openRuns(root, { script: [] });
    cleanups.push(() => second.service.close());
    expect(second.recovery).toMatchObject({ interrupted: [], skipped: [] });
    expect(onlyRun(second.service, plan)).toEqual(reviewed);
    expect(await second.service.execute({ ...approval })).toEqual(approved);
    await expect(second.service.execute(approveRun(plan, receipt.jobId, reviewed.version)))
      .rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('already approved') });

    // The snapshot a client reads carries the review.
    const snapshot = await new RunQueries(second.service).run(plan, receipt.jobId);
    expect(runSnapshotSchema.parse(snapshot.run).review).toEqual({ reviewer: 'sam@example.com', at: approved.acceptedAt, duringRun: false });
  }, 120_000);

  test('is refused before the analysis is accepted, during the final verification, for a failed run, and at a stale version', async () => {
    const root = await target();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const { service, agent } = await openRuns(root, {
      // The first run's architect submits after a moment; the second one's ends without an analysis.
      script: (() => {
        let sessions = 0;
        return () => (sessions++ === 0
          ? [{ kind: 'wait', ms: 400 }, { kind: 'submit', input: emptyAnalysis() }] as const
          : [{ kind: 'end', message: 'no analysis' }] as const);
      })(),
      unchangedCheckpoints: [finalVerification],
      // Readiness has passed with no work item, so the run is in its final
      // verification; it is held there, outside any lock, until released.
      afterWrite: async write => { if (write === 'readiness-attempted') await held; },
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun(plan));
    await until(() => agent!.sessions.length === 1);
    await expect(service.execute(approveRun(plan, receipt.jobId, version(service, receipt.jobId))))
      .rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('no accepted analysis') });

    await until(() => phaseOf(service, receipt.jobId) === 'final-verification');
    const current = version(service, receipt.jobId);
    await expect(service.execute(approveRun(plan, receipt.jobId, current - 1)))
      .rejects.toMatchObject({ code: 'stale-version', currentVersion: current });
    await expect(service.execute(approveRun(plan, receipt.jobId, current)))
      .rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('final verification') });
    release();
    await service.settled(plan, receipt.jobId);
    expect(onlyRun(service, plan)).toMatchObject({ state: 'completed', review: 'not-reviewed' });

    // The second run's initial architect ends without an analysis, so it fails.
    const failing = await service.execute(startRun(plan));
    await service.settled(plan, failing.jobId);
    expect(service.getRun(plan, failing.jobId)!.state).toBe('failed');
    await expect(service.execute(approveRun(plan, failing.jobId, version(service, failing.jobId))))
      .rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('failed') });
    await expect(service.execute(approveRun(plan, '20260920T101500Z-3f9a1c', 0))).rejects.toMatchObject({ code: 'not-found' });
  }, 120_000);
});

describe('the run budget', () => {
  /**
   * A run with the stop whose clock the test holds. Each session start moves
   * the clock by `perSession`; the test moves it by `pause` while the run
   * waits at its stop, and then approves.
   */
  async function budgeted(perSession: number, pause: number) {
    const root = await target();
    let current = new Date('2026-09-23T12:00:00.000Z');
    const scripted = createScriptedAgent(withPlan13Fixture(byRole({
      'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
      'local-architect': [[{ kind: 'wait', ms: 60_000 }]],
    })));
    const timed: AgentPort = {
      name: scripted.name,
      support: scripted.support,
      appendContext: (ref, key, text) => scripted.appendContext(ref, key, text),
      startSession: spec => {
        const session = scripted.startSession(spec);
        current = new Date(current.getTime() + perSession);
        return session;
      },
    };
    const opened = await openRuns(root, {
      agent: timed,
      now: () => current,
      unchangedCheckpoints: [scenariosCommit(plan)],
      inputs: treeInputs(),
      policy: projectRoot => {
        const policy = testPolicy(projectRoot);
        return { ...policy, limits: { ...policy.limits, runAbsoluteMs: 1000 } };
      },
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan, 'scripted', undefined, true));
    await until(() => phaseOf(opened.service, receipt.jobId) === 'awaiting-review');
    current = new Date(current.getTime() + pause);
    await opened.service.execute(approveRun(plan, receipt.jobId, version(opened.service, receipt.jobId)));
    return { root, runId: receipt.jobId, service: opened.service, scripted };
  }

  test('the time between review-requested and analysis-approved is not counted against runAbsoluteMs', async () => {
    const { root, runId, service, scripted } = await budgeted(600, 10_000);
    // The run's clock has moved 10,600 ms, of which 10,000 were the stop.
    await until(() => scripted.sessions.length === 2);
    expect(service.getRun(plan, runId)).toMatchObject({ state: 'running', phase: 'working' });
    const events = await runEventsOnDisk(root, plan, runId);
    const requested = events.find(event => event.type === 'review-requested')!;
    const approved = events.find(event => event.type === 'analysis-approved')!;
    expect(Date.parse(approved.at) - Date.parse(requested.at)).toBe(10_000);

    await service.execute(stopRun(plan, runId, version(service, runId)));
    await service.settled(plan, runId);
  }, 120_000);

  test('the time outside the stop still is: the age reported excludes exactly the pause', async () => {
    const { root, runId, service, scripted } = await budgeted(1100, 10_000);
    await service.settled(plan, runId);
    expect(onlyRun(service, plan).failure).toMatchObject({ reason: 'limit-exceeded', message: 'The run has run for 1100 ms; the policy allows 1000' });
    expect(scripted.sessions).toHaveLength(1);
    expect((await types(root, runId)).filter(type => type === 'invocation-started')).toHaveLength(1);
  }, 120_000);
});

describe('over HTTP', () => {
  async function serve(root: string, script: Script): Promise<RunningServer> {
    return startServerWith({
      projectRoot: root, port: 0, assetsDirectory: join(root, 'no-such-build'),
      ramify: new FakeRamifyCli(),
      agent: createScriptedAgent(withPlan13Fixture(script)),
      runs: {
        inputs: treeInputs(), policy: projectRoot => testPolicy(projectRoot), stopGraceMs: 500, warn: () => undefined,
        git: unchangedGit(root, [finalVerification]), readinessExecution: directReadinessExecution(), checkExecution: createPassingCheckExecution(),
      },
    });
  }

  async function post(server: RunningServer, body: unknown) {
    const response = await fetch(`${server.url}${protocolPaths.commands}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as unknown };
  }

  async function run(server: RunningServer, runId: string) {
    return runResponseSchema.parse(await (await fetch(`${server.url}${protocolPaths.run(plan, runId)}`)).json()).run;
  }

  test('start-run with reviewStop and approve-analysis are accepted as stop-job is, and a malformed approval is refused', async () => {
    const root = await target();
    const server = await serve(root, [{ kind: 'submit', input: emptyAnalysis() }]);
    cleanups.push(() => server.close());

    const started = await post(server, { commandId: 'start-http', expectedVersion: 0, type: 'start-run', payload: { planId: plan, agent: 'scripted', reviewStop: true } });
    expect(started.status).toBe(202);
    const runId = commandResponseSchema.parse(started.body).receipt.jobId;
    await until(async () => (await run(server, runId)).phase === 'awaiting-review');
    const waiting = await run(server, runId);
    expect(waiting.review).toBe('not-reviewed');

    const malformed = await post(server, { commandId: 'approve-http', expectedVersion: waiting.version, type: 'approve-analysis', payload: { planId: plan, jobId: runId, reviewer: '' } });
    expect(malformed.status).toBe(400);
    expect(errorResponseSchema.parse(malformed.body).error.code).toBe('invalid-request');

    const approval = { commandId: 'approve-http', expectedVersion: waiting.version, type: 'approve-analysis', payload: { planId: plan, jobId: runId, reviewer: 'dana@example.com' } };
    const approved = await post(server, approval);
    expect(approved.status).toBe(202);
    const receipt = commandResponseSchema.parse(approved.body).receipt;
    await until(async () => (await run(server, runId)).state !== 'running');
    expect(await run(server, runId)).toMatchObject({ state: 'completed', review: { reviewer: 'dana@example.com', at: receipt.acceptedAt, duringRun: false } });

    const again = await post(server, approval);
    expect(commandResponseSchema.parse(again.body).receipt).toEqual(receipt);
    const second = await post(server, { ...approval, commandId: 'approve-twice', expectedVersion: (await run(server, runId)).version });
    expect(second.status).toBe(409);
    expect(errorResponseSchema.parse(second.body).error).toMatchObject({ code: 'conflict' });
  }, 120_000);
});

describe('the run log', () => {
  test('an approval is the one event that may follow job-completed, and follows no other terminal event', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-review-log-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const runId = '20260923T120000Z-abcdef';
    const command = { commandId: 'c', contentHash: 'h', receipt: { commandId: 'c', jobId: runId, sequence: 1, acceptedAt: '2026-09-23T12:00:00.000Z' } };
    const approval = { type: 'analysis-approved', data: { command, reviewer: 'dana', note: null, duringRun: false } } as const;

    const completed = await RunLog.open(join(directory, 'completed.jsonl'), runId);
    await completed.append({ type: 'job-started', data: { command } });
    await completed.append({ type: 'job-completed', data: { gate: 'ga-0001', commit: null, workItems: 0 } });
    await completed.append(approval);
    expect(() => completed.next({ type: 'job-failed', data: { reason: 'internal', message: 'm', evidence: [] } })).toThrow(/has ended/);
    expect((await RunLog.open(join(directory, 'completed.jsonl'), runId)).events.map(event => event.type))
      .toEqual(['job-started', 'job-completed', 'analysis-approved']);

    const failed = await RunLog.open(join(directory, 'failed.jsonl'), runId);
    await failed.append({ type: 'job-started', data: { command } });
    await failed.append({ type: 'job-failed', data: { reason: 'internal', message: 'm', evidence: [] } });
    expect(() => failed.next(approval)).toThrow(/has ended/);
  });
});

describe('the command schema', () => {
  test('reviewStop defaults to false, and approve-analysis carries the reviewer and an optional note only', () => {
    expect(startRunCommandSchema.parse({ commandId: 'c1', expectedVersion: 0, type: 'start-run', payload: { planId: plan, agent: 'pi' } }).payload)
      .toEqual({ planId: plan, agent: 'pi', reviewStop: false });
    const approval = { commandId: 'c2', expectedVersion: 4, type: 'approve-analysis', payload: { planId: plan, jobId: '20260920T101500Z-3f9a1c', reviewer: 'dana' } };
    expect(runCommandSchema.parse(approval)).toEqual(approval);
    expect(runCommandSchema.safeParse({ ...approval, payload: { ...approval.payload, note: 'fine' } }).success).toBe(true);
    expect(runCommandSchema.safeParse({ ...approval, payload: { ...approval.payload, reviewer: '' } }).success).toBe(false);
    expect(runCommandSchema.safeParse({ ...approval, payload: { ...approval.payload, approve: 'rm -rf /' } }).success).toBe(false);
  });
});
