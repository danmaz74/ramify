import { declaringScenarios } from './helpers/declarations.js';
import { scenariosCommit, type GitCheckpoint } from './helpers/scripted-git.js';
import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent, type Script } from '../../subs/agent/src/scripted.js';
import type { AgentPort, AgentSession, SessionOutcome } from '../../subs/agent/src/interfaces/port.js';
import { runCommand, type CommandRunner } from '../../subs/evidence/src/run-command.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { commandResult } from './helpers/command-result.js';
import { copyFixture } from './helpers/fixture.js';
import { assign, byRole, outline, partialReport, shell, submit, treeInputs } from './helpers/iterations.js';
import { installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun, testPolicy } from './helpers/runs.js';
import { InvocationBounds } from '../run/port-events.js';
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
  unchangedCheckpoints: ReadonlyArray<string | GitCheckpoint> = [],
  commandExecution?: CommandRunner,
) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const opened = await openRuns(fixture.root, {
    script,
    unchangedCheckpoints,
    inputs: treeInputs(),
    ...(commandExecution === undefined ? {} : { commandExecution }),
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
      support: scripted.support,
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
    }), { maxInvocationsPerRun: 1 }, [scenariosCommit(plan)]);
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
    const scripted = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
      'local-architect': [submit(requestCompletion())],
    })));
    const timed: AgentPort = {
      name: scripted.name,
      support: scripted.support,
      appendContext: (ref, key, text) => scripted.appendContext(ref, key, text),
      startSession: spec => {
        const session = scripted.startSession(spec);
        current = new Date(current.getTime() + 201);
        return session;
      },
    };
    const opened = await openRuns(fixture.root, {
      agent: timed,
      unchangedCheckpoints: [scenariosCommit(plan)],
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

/*
 * A command the harness runs for a session is the harness's work, not the
 * session's silence. The first real toolkit run lost three hours when a
 * shell call given ten minutes was killed at the five-minute idle bound, and
 * the run failed with its engineer. The idle bound is now held for a
 * command's own timeout and a margin, and an engineer that fails returns its
 * iteration to the local architect.
 */

/** A session that ends only when it is stopped, and says when that was. */
function silentSession() {
  let end: (outcome: SessionOutcome) => void = () => undefined;
  const outcome = new Promise<SessionOutcome>(resolve => { end = resolve; });
  const stops: number[] = [];
  const session: AgentSession = {
    outcome,
    start: { mode: 'fresh' },
    ref: 'silent',
    settled: async () => 'settled',
    stop: async () => {
      stops.push(Date.now());
      end({ kind: 'stopped' });
    },
  };
  return { session, stops };
}

describe('the idle bound while a command runs', () => {
  const limits = { invocationIdleMs: 300_000, invocationAbsoluteMs: 3_600_000, writerSettleMs: 1_000 };
  afterEach(() => {
    vi.useRealTimers();
  });

  test('a held command is not idleness until its own timeout and the margin have passed', async () => {
    vi.useFakeTimers();
    const started = Date.now();
    const bounds = new InvocationBounds(limits, 60_000);
    const { session, stops } = silentSession();
    const ended = bounds.outcome(session);
    // The shell call of the real run: ten minutes of its own, silent throughout.
    bounds.hold(600_000);
    await vi.advanceTimersByTimeAsync(659_000);
    expect(stops).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(stops).toHaveLength(1);
    expect(stops[0]! - started).toBe(660_000);
    expect(bounds.interruption).toBe('idle-timeout');
    await vi.advanceTimersByTimeAsync(limits.writerSettleMs);
    expect(await ended).toEqual({ kind: 'stopped' });
  });

  test('its release starts the idle bound afresh, and silence without a command still ends the session', async () => {
    vi.useFakeTimers();
    const bounds = new InvocationBounds(limits, 60_000);
    const { session, stops } = silentSession();
    const ended = bounds.outcome(session);
    const release = bounds.hold(600_000);
    await vi.advanceTimersByTimeAsync(400_000);
    const released = Date.now();
    release();
    // A second release of the same hold changes nothing.
    await vi.advanceTimersByTimeAsync(100_000);
    release();
    await vi.advanceTimersByTimeAsync(199_000);
    expect(stops).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(stops.map(at => at - released)).toEqual([limits.invocationIdleMs]);
    expect(bounds.interruption).toBe('idle-timeout');
    await vi.advanceTimersByTimeAsync(limits.writerSettleMs);
    await ended;
  });

  test('a hold does not lift the absolute bound', async () => {
    vi.useFakeTimers();
    const bounds = new InvocationBounds({ ...limits, invocationAbsoluteMs: 120_000 }, 60_000);
    const { session, stops } = silentSession();
    const ended = bounds.outcome(session);
    bounds.hold(600_000);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(stops).toHaveLength(1);
    expect(bounds.interruption).toBe('absolute-timeout');
    await vi.advanceTimersByTimeAsync(limits.writerSettleMs);
    await ended;
  });

  test('an engineer\'s shell command that outlasts the idle bound within its own timeout ends nothing', async () => {
    // The shell command takes twice the idle bound, well within its own timeout.
    const slowShell: CommandRunner = async request => {
      if (request.argv[0] !== 'bash') return runCommand(request);
      await new Promise(resolve => setTimeout(resolve, 2_000));
      return commandResult(request, { stdout: 'built\n', elapsedMs: 2_000 });
    };
    const { root, runId, service } = await run(byRole({
      'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
      'local-architect': [submit(assign(reviews, {}, outline())), submit(requestCompletion())],
      engineer: [submit(partialReport(['the build'], ['the rest']), shell('npm run build', { timeoutMs: 10_000 }))],
    }), { invocationIdleMs: 1_000 }, [scenariosCommit(plan), 'wi-001', `final verification of plan "${plan}"`], slowShell);

    expect(onlyRun(service, plan).state).toBe('completed');
    const events = await runEventsOnDisk(root, plan, runId);
    const engineer = events.filter(event => event.type === 'invocation-started')
      .map(event => event.data as { invocation: string; role: string })
      .find(data => data.role === 'engineer')!;
    const ended = await outcome(root, runId, engineer.invocation);
    expect(ended).toMatchObject({ ended: 'submitted', disposition: 'applied' });
    expect(ended.interruption).toBeUndefined();
    expect(ended.elapsedMs).toBeGreaterThanOrEqual(2_000);
  }, 120_000);
});

describe('an engineer that ends without a result', () => {
  test('closes its iteration partial, and its local architect is told why and goes on', async () => {
    const prompts: string[] = [];
    const script = byRole({
      'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
      'local-architect': [submit(assign(reviews, {}, outline())), submit(requestCompletion())],
      // The session goes silent and the idle bound ends it.
      engineer: [[{ kind: 'wait', ms: 60_000 }]],
    });
    const { root, runId, service } = await run(spec => {
      if (spec.role === 'local-architect') prompts.push(spec.prompt);
      return typeof script === 'function' ? script(spec) : script;
    }, { invocationIdleMs: 300 }, [scenariosCommit(plan), 'wi-001', `final verification of plan "${plan}"`]);

    expect(onlyRun(service, plan).state).toBe('completed');
    const events = await runEventsOnDisk(root, plan, runId);
    const engineer = events.filter(event => event.type === 'invocation-started')
      .map(event => event.data as { invocation: string; role: string })
      .find(data => data.role === 'engineer')!;
    expect(await outcome(root, runId, engineer.invocation)).toMatchObject({ ended: 'failed', interruption: 'idle-timeout' });
    expect(events.filter(event => event.type === 'iteration-closed').map(event => event.data))
      .toEqual([expect.objectContaining({ iteration: 'wi-001.i01', outcome: 'partial', commit: null })]);

    // The architect's next turn names the failure, the bound and the invocation.
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('`wi-001.i01` ended `partial`, with nothing committed.');
    expect(prompts[1]).toContain(
      `the engineer of wi-001.i01 ended without a result (idle-timeout: No port event for 300 ms; invocation ${engineer.invocation})`,
    );
  }, 120_000);

  test('that keeps failing ends the run through the work item\'s iteration bound', async () => {
    const { root, runId, service } = await run(byRole({
      'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
      'local-architect': [submit(assign(reviews, {}, outline()))],
      engineer: [[{ kind: 'fail', error: 'the provider refused the request' }]],
    }), { maxIterationsPerWorkItem: 2 }, [scenariosCommit(plan)]);

    const snapshot = onlyRun(service, plan);
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('limit-exceeded');
    expect(snapshot.failure?.message).toBe('wi-001 has reached 2 iterations, which the policy allows');
    const events = await runEventsOnDisk(root, plan, runId);
    expect(events.filter(event => event.type === 'iteration-closed').map(event => (event.data as { outcome: string }).outcome))
      .toEqual(['partial', 'partial']);
  }, 120_000);
});
