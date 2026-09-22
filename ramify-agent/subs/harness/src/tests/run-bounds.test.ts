import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent, type Script } from '../../subs/agent/src/scripted.js';
import type { AgentPort } from '../../subs/agent/src/interfaces/port.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { byRole, submit, treeInputs } from './helpers/iterations.js';
import { installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun, testPolicy } from './helpers/runs.js';
import { runLayout, type InvocationOutcome, type RunPolicy } from '../run/records.js';

/*
 * The run policy's time and count bounds, enforced.
 *
 * Iteration 12's composition suite found that four of the policy's bounds
 * were captured in `job.json` and never read: `invocationIdleMs`,
 * `invocationAbsoluteMs`, `maxInvocationsPerRun` and `runAbsoluteMs`. The
 * union values that report them, `idle-timeout`, `absolute-timeout` and
 * `limit-exceeded` for those two counters, had no producer. This is the
 * defect's test: each bound ends what it bounds, with the bound as evidence.
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

async function run(
  script: Script,
  limits: Partial<RunPolicy['limits']>,
  unchangedCheckpoints: readonly string[] = [],
) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const opened = await openRuns(fixture.root, {
    script,
    unchangedCheckpoints,
    inputs: treeInputs(),
    policy: projectRoot => {
      const policy = testPolicy(projectRoot);
      return { ...policy, limits: { ...policy.limits, ...limits } };
    },
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun(plan));
  await opened.service.settled(plan, receipt.jobId);
  return { root: fixture.root, runId: receipt.jobId, service: opened.service };
}

async function outcome(root: string, runId: string, invocation: string): Promise<InvocationOutcome> {
  return JSON.parse(await readFile(runPath(root, plan, runId, runLayout.outcome(invocation)), 'utf8')) as InvocationOutcome;
}

describe('the bounds on one invocation', () => {
  test('no port event for invocationIdleMs ends the invocation as failed, idle-timeout', async () => {
    const { root, runId, service } = await run([{ kind: 'wait', ms: 60_000 }], { invocationIdleMs: 300 });
    const snapshot = onlyRun(service, plan);
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('agent-failed');
    const ended = await outcome(root, runId, 'inv-0001');
    expect(ended).toMatchObject({ ended: 'failed', interruption: 'idle-timeout', disposition: 'incomplete' });
    expect(ended.error).toContain('300 ms');
    // The session was asked to stop and did, well before its own minute.
    expect(ended.elapsedMs).toBeLessThan(30_000);
  }, 120_000);

  test('a session that keeps talking past invocationAbsoluteMs ends as failed, absolute-timeout', async () => {
    // A port event every 50 ms, so the idle bound never fires.
    const talking = Array.from({ length: 200 }, (_, index) => [
      { kind: 'message' as const, text: `still working, step ${index}` },
      { kind: 'wait' as const, ms: 50 },
    ]).flat();
    const { root, runId, service } = await run(talking, { invocationIdleMs: 2_000, invocationAbsoluteMs: 600 });
    expect(onlyRun(service, plan).failure?.reason).toBe('agent-failed');
    const ended = await outcome(root, runId, 'inv-0001');
    expect(ended).toMatchObject({ ended: 'failed', interruption: 'absolute-timeout' });
    expect(ended.elapsedMs).toBeLessThan(5_000);
  }, 120_000);

  test('an invocation that ends within its bounds is not interrupted', async () => {
    const { root, runId, service } = await run(
      byRole({ 'initial-architect': [submit(analysis([]))] }),
      { invocationIdleMs: 5_000, invocationAbsoluteMs: 10_000 },
      ['final verification of plan "review-notes"'],
    );
    expect(onlyRun(service, plan).state).toBe('completed');
    expect((await outcome(root, runId, 'inv-0001')).interruption).toBeUndefined();
  }, 120_000);
});

describe('an implementation that cannot start a session', () => {
  test('is an adapter fault: the invocation ends failed with that interruption, and the run fails agent-failed', async () => {
    // Also found by the composition suite: the harness's defense against a
    // `startSession` that throws, which the port's rules forbid, had no test.
    const scripted = createScriptedAgent([{ kind: 'submit', input: analysis([]) }]);
    const broken: AgentPort = {
      name: scripted.name,
      observations: scripted.observations,
      startSession: () => { throw new Error('the adapter could not build a session'); },
      appendContext: (ref, key, text) => scripted.appendContext(ref, key, text),
    };
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
      const opened = await openRuns(fixture.root, { agent: broken, inputs: treeInputs() });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, receipt.jobId);
    expect(onlyRun(opened.service, plan).failure?.reason).toBe('agent-failed');
    const ended = await outcome(fixture.root, receipt.jobId, 'inv-0001');
    expect(ended).toMatchObject({ ended: 'failed', interruption: 'adapter-fault' });
    expect(ended.error).toContain('the adapter could not build a session');
  }, 120_000);
});

describe('the bounds on the whole run', () => {
  test('a run that has made maxInvocationsPerRun invocations starts no further one and fails limit-exceeded', async () => {
    const { root, runId, service } = await run(byRole({
      'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
      'local-architect': [submit(requestCompletion())],
    }), { maxInvocationsPerRun: 1 });
    const snapshot = onlyRun(service, plan);
    expect(snapshot.failure?.reason).toBe('limit-exceeded');
    expect(snapshot.failure?.message).toBe('The run has made 1 invocations; the policy allows 1');
    const events = await runEventsOnDisk(root, plan, runId);
    expect(events.filter(event => event.type === 'invocation-started')).toHaveLength(1);
    expect(events.at(-1)?.type).toBe('job-failed');
  }, 120_000);

  test('a run older than runAbsoluteMs at an invocation boundary starts nothing more and fails limit-exceeded', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
      let current = new Date('2026-09-22T12:00:00.000Z');
    const scripted = createScriptedAgent(byRole({
      'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
      'local-architect': [submit(requestCompletion())],
    }));
    const timed: AgentPort = {
      name: scripted.name,
      observations: scripted.observations,
      appendContext: (ref, key, text) => scripted.appendContext(ref, key, text),
      startSession: spec => {
        const session = scripted.startSession(spec);
        current = new Date(current.getTime() + 201);
        return session;
      },
    };
    const opened = await openRuns(fixture.root, {
      agent: timed,
      now: () => current,
      policy: projectRoot => {
        const policy = testPolicy(projectRoot);
        return { ...policy, limits: { ...policy.limits, runAbsoluteMs: 200 } };
      },
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, receipt.jobId);

    const snapshot = onlyRun(opened.service, plan);
    expect(snapshot.failure?.reason).toBe('limit-exceeded');
    expect(snapshot.failure?.message).toBe('The run has run for 201 ms; the policy allows 200');
    const events = await runEventsOnDisk(fixture.root, plan, receipt.jobId);
    expect(events.filter(event => event.type === 'invocation-started')).toHaveLength(1);
  }, 120_000);
});
