import { finalCandidate } from './helpers/final-candidate.js';
import { declaringScenarios } from './helpers/declarations.js';
import type { GitCheckpoint } from './helpers/scripted-git.js';
import { protocolPorts } from './helpers/protocol-ports.js';
import { openUnchangedRuns, unchangedGit, assertUnchangedGit, type UnchangedRunsOptions } from './helpers/unchanged-run.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import { moduleTreeResponseSchema } from '../interfaces/protocol/evidence.js';
import { commandResponseSchema } from '../interfaces/protocol/jobs.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import {
  analysisResponseSchema, capabilityListResponseSchema, decisionListResponseSchema, gateResponseSchema,
  metricsResponseSchema, moduleCapabilityComparisonResponseSchema, runEventPageSchema, runListResponseSchema, runQueryLimits, runResponseSchema,
  workItemListResponseSchema, workItemResponseSchema,
  type ProjectedRunEvent, type RunSnapshot,
} from '../interfaces/protocol/runs.js';
import { startServerWith, type RunningServer } from '../http/server.js';
import { terminalRunEvents } from '../run/log.js';
import { treeInputs } from './helpers/iterations.js';
import {
  draftsDirectory, drafts, fileHashes, notes, outsidePath, protocolPolicy, protocolScript, protocolTarget,
} from './helpers/protocol.js';
import {
  emptyAnalysis, installTestRunner, openRuns as openRealRuns, runEventsOnDisk, runPath, startRun, testPolicy, until,
} from './helpers/runs.js';
import { copyFixture } from './helpers/fixture.js';
import { fixtureScratchGit } from './helpers/mock-git.js';
import { acquireProjectLock } from '../store/lock.js';
import { ObservationLog } from '../run/observations.js';
import { runLayout } from '../run/records.js';
import { passingAudit } from './helpers/direct-check-execution.js';

/*
 * The run protocol over HTTP, read by a plain Node client: `fetch` and the
 * protocol's schemas, nothing from the web client, and the web assets absent.
 *
 * C1: a run completes with no client connected, watched through the file
 * system alone; a client attached afterwards reads the same snapshot and the
 * same events, and so does one attached after the harness restarts.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
const fixtures = new Map<string, ReturnType<typeof protocolPorts>>();
async function scriptedTarget() {
  const target = await protocolTarget(false);
  fixtures.set(target.root, protocolPorts(target.root));
  return target;
}
async function openRuns(root: string, options: UnchangedRunsOptions = {}) {
  const ports = fixtures.get(root);
  if (!ports) return openUnchangedRuns(root, options);
  return openRealRuns(root, { ...options, ...ports });
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  fixtures.clear();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

const plan = 'review-notes';

async function get(server: RunningServer, path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server.url}${path}`);
  return { status: response.status, body: await response.json() };
}

async function post(server: RunningServer, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server.url}${protocolPaths.commands}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

/** Every event of a run, page after page from the cursor, as a reconnecting client reads it. */
async function allEvents(server: RunningServer, runId: string, from = 0): Promise<{ run: RunSnapshot; events: ProjectedRunEvent[]; pages: number }> {
  let cursor = from;
  const events: ProjectedRunEvent[] = [];
  let pages = 0;
  for (;;) {
    const { status, body } = await get(server, protocolPaths.runEvents(plan, runId, cursor));
    expect(status).toBe(200);
    const page = runEventPageSchema.parse(body);
    pages += 1;
    events.push(...page.events);
    cursor = page.cursor;
    if (!page.more) return { run: page.run, events, pages };
  }
}

/** Every answer of every query of one run, as JSON text, for comparing two readings byte for byte. */
async function everyAnswer(server: RunningServer, runId: string): Promise<Record<string, string>> {
  const paths = [
    protocolPaths.runs(plan),
    protocolPaths.run(plan, runId),
    protocolPaths.runEvents(plan, runId, 0),
    protocolPaths.runAnalysis(plan, runId),
    protocolPaths.runDecisions(plan, runId),
    protocolPaths.runWorkItems(plan, runId),
    protocolPaths.runWorkItem(plan, runId, 'wi-001'),
    protocolPaths.runWorkItem(plan, runId, 'wi-002'),
    protocolPaths.runCapabilities(plan, runId),
    protocolPaths.runMetrics(plan, runId),
  ];
  const answers: Record<string, string> = {};
  for (const path of paths) {
    const { status, body } = await get(server, path);
    expect([path, status]).toEqual([path, 200]);
    answers[path] = JSON.stringify(body);
  }
  return answers;
}

async function serve(
  root: string,
  extra: Partial<Parameters<typeof startServerWith>[0]> = {},
  unchangedCheckpoints: ReadonlyArray<string | GitCheckpoint> = [],
): Promise<RunningServer> {
  const ports = fixtures.get(root);
  return startServerWith({
    projectRoot: root, port: 0, assetsDirectory: join(root, 'no-such-build'),
    ramify: new FakeRamifyCli(), ...extra,
    ...(ports && extra.agent ? { agent: createScriptedAgent(ports.script) } : {}),
    runs: {
      inputs: treeInputs(), policy: projectRoot => protocolPolicy(projectRoot), stopGraceMs: 500, warn: () => undefined,
      ...extra.runs,
      ...(ports ?? { git: fixtureScratchGit(unchangedGit(root, unchangedCheckpoints, unchangedCheckpoints.length ? 4 : 0)),
        candidates: finalCandidate(root, 'unchanged-fixture-revision').candidates, configuredAudit: passingAudit() }),
    },
  });
}

describe('C1: a run completes with no client, and a client attached afterwards reads the same state and events', () => {
  test('driven while only the file system is watched; read over HTTP, and again after two restarts', async () => {
    const target = await scriptedTarget();
    cleanups.push(target.remove);
    const { root } = target;

    // The run is driven by the service with no server and no client. The
    // test watches the file system for the terminal event, and nothing else.
    const opened = await openRuns(root, { script: protocolScript(root), inputs: treeInputs(), policy: projectRoot => protocolPolicy(projectRoot) });
    const receipt = await opened.service.execute(startRun(plan));
    const runId = receipt.jobId;
    await until(async () => {
      const events = await runEventsOnDisk(root, plan, runId).catch(() => []);
      return events.some(event => (terminalRunEvents as readonly string[]).includes(event.type));
    }, 120_000);
    await opened.service.settled(plan, runId);
    await opened.service.close();
    const onDisk = await runEventsOnDisk(root, plan, runId);
    expect(onDisk.at(-1)!.type, JSON.stringify(onDisk.slice(-20))).toBe('job-completed');
    fixtures.get(root)!.git.assertComplete();

    // A client attaches afterwards, to a harness that has just loaded the run.
    const first = await serve(root);
    let answers: Record<string, string>;
    try {
      const { status, body } = await get(first, protocolPaths.run(plan, runId));
      expect(status).toBe(200);
      const { run } = runResponseSchema.parse(body);
      expect(run).toMatchObject({ jobId: runId, planId: plan, state: 'completed', phase: 'ended', version: onDisk.length, failure: null });
      expect(run.counts).toMatchObject({ workItems: 2, completedWorkItems: 2, openRequirements: 0 });

      // The same events, in order, each once: the event page is a projection
      // of the log, not a copy of it.
      const read = await allEvents(first, runId);
      expect(read.events.map(event => [event.sequence, event.transition])).toEqual(onDisk.map(event => [event.sequence, event.type]));
      expect(read.run).toEqual(run);
      for (const event of read.events) expect(Object.keys(event).sort()).toEqual(['at', 'refs', 'sequence', 'summary', 'transition']);

      // A reconnecting client resumes from its cursor and misses nothing.
      const half = Math.floor(onDisk.length / 2);
      const resumed = await allEvents(first, runId, half);
      expect(resumed.events).toEqual(read.events.slice(half));

      // The notices come first on the Run page: the module the engineer
      // created, read from the accepted commit, with the statement that no
      // placement decision proposed it.
      expect(run.notices).toHaveLength(1);
      expect(run.notices[0]).toMatchObject({ kind: 'module-created', module: drafts, declaration: `${draftsDirectory}/module.ramify`, decision: null });
      expect(run.notices[0]!.summary).toContain('No placement decision proposed it');

      answers = await everyAnswer(first, runId);
    } finally {
      await first.close();
    }

    // The harness restarts twice; every answer is the same, byte for byte.
    for (let restart = 1; restart <= 2; restart += 1) {
      const again = await serve(root);
      try {
        expect(again.recovery.interrupted).toEqual([]);
        expect(await everyAnswer(again, runId)).toEqual(answers);
      } finally {
        await again.close();
      }
    }
    expect(await runEventsOnDisk(root, plan, runId)).toEqual(onDisk);
  }, 300_000);
});

describe('every query of a completed run, over HTTP', () => {
  test('answers what the records hold: analysis, decisions, work items, capabilities, gates and metrics', async () => {
    const target = await scriptedTarget();
    cleanups.push(target.remove);
    const server = await serve(target.root, { agent: createScriptedAgent(protocolScript(target.root)) });
    cleanups.push(() => server.close());

    const started = await post(server, startRun(plan));
    expect(started.status).toBe(202);
    const runId = commandResponseSchema.parse(started.body).receipt.jobId;
    await until(async () => runResponseSchema.parse((await get(server, protocolPaths.run(plan, runId))).body).run.state !== 'running', 120_000);

    const list = runListResponseSchema.parse((await get(server, protocolPaths.runs(plan))).body);
    expect(list.runs.map(run => run.jobId)).toEqual([runId]);
    fixtures.get(target.root)!.git.assertComplete();
    expect(list.agent).toBe('scripted');
    expect(list.unserved).toEqual([]);

    const analysis = analysisResponseSchema.parse((await get(server, protocolPaths.runAnalysis(plan, runId))).body);
    expect(analysis.plan.markdown).toBe(await readFile(join(target.root, 'plans', plan, 'plan.md'), 'utf8'));
    if (analysis.analysis.status !== 'accepted') throw new Error('the analysis was accepted');
    expect(analysis.analysis.entries.map(entry => [entry.capability, entry.owner, entry.workItem])).toEqual([
      ['review-note', notes, 'wi-001'],
      ['note-drafts', drafts, 'wi-002'],
    ]);
    expect(analysis.analysis.entries[1]!.proposed).toMatchObject({ parent: notes, directory: draftsDirectory });
    // The hypothesis is a forecast, shown with its standing and revision
    // beside what revision 1 forecast.
    expect(analysis.analysis.hypotheses).toEqual([expect.objectContaining({
      id: 'note-search', revision: 1, standing: 'tentative', initial: { change: 'create', suggestedOwner: notes, rationale: 'Notes may need to be searched later.' }, decisions: [],
    })]);

    // The decision list: each scope and each outline, from the records that hold them.
    const decisions = decisionListResponseSchema.parse((await get(server, protocolPaths.runDecisions(plan, runId))).body);
    expect(decisions.decisions.filter(decision => decision.kind === 'scope').map(decision => decision.kind === 'scope' && [decision.iteration, decision.modules])).toEqual([
      ['wi-001.i01', [notes]],
      ['wi-001.i02', ['collection-review/workspace/reviews']],
      ['wi-002.i01', [drafts]],
    ]);
    // Each outline revision is a plan decision: the one the assignment came
    // with, and the one the completion request committed.
    expect(decisions.decisions.filter(decision => decision.kind === 'plan-revision').map(decision => decision.kind === 'plan-revision' && [decision.workItem, decision.outlineRevision]))
      .toEqual([['wi-001', 1], ['wi-001', 2], ['wi-002', 1], ['wi-002', 2]]);
    expect(decisions.total).toBe(decisions.decisions.length);

    const items = workItemListResponseSchema.parse((await get(server, protocolPaths.runWorkItems(plan, runId))).body);
    expect(items.workItems.map(item => [item.id, item.state, item.capability])).toEqual([
      ['wi-001', 'completed', 'review-note'],
      ['wi-002', 'completed', 'note-drafts'],
    ]);
    const detail = workItemResponseSchema.parse((await get(server, protocolPaths.runWorkItem(plan, runId, 'wi-001'))).body);
    expect(detail.iterations).toHaveLength(2);
    expect(detail.iterations[0]!.result?.outcome).toBe('partial');
    expect(detail.iterations[1]!.result?.outcome).toBe('accepted');
    const engineer = detail.iterations[0]!.invocations.find(invocation => invocation.role === 'engineer')!;
    expect(engineer.outsideScope).toContain(outsidePath);

    const capabilities = capabilityListResponseSchema.parse((await get(server, protocolPaths.runCapabilities(plan, runId))).body);
    expect(capabilities.capabilities.map(capability => [capability.capability, capability.state, capability.tentative])).toEqual([
      ['review-note', 'completed', false],
      ['note-drafts', 'completed', false],
      ['note-search', 'todo', true],
    ]);

    // The final gate asked the committed audit in full and plans no command
    // of its own: a client reads the request and its answer, and no
    // environment of any command.
    const final = items.workItems.length > 0 ? (await allEvents(server, runId)).events.find(event => event.transition === 'job-completed')!.refs.find(ref => ref.kind === 'gate')!.id : '';
    const gate = gateResponseSchema.parse((await get(server, protocolPaths.runGate(plan, runId, final))).body).gate;
    expect(gate.checkpoint).toBe('final');
    expect(gate.commands).toEqual([]);
    expect(gate.audit).toMatchObject({ mode: 'full', status: 'completed', verdict: 'pass', requestedSourceCommit: gate.audited, executedMode: 'full' });
    expect(gate.verdict).toBe('passed');
    expect(JSON.stringify(gate)).not.toContain('envAdditions');

    // The evaluation projection shows every change outside a write scope,
    // which tools were guarded, and the sentence that refuses to read zero
    // blocked calls as compliance.
    const metrics = metricsResponseSchema.parse((await get(server, protocolPaths.runMetrics(plan, runId))).body);
    expect(metrics.policyVersion).toBe('kpi/1');
    expect(metrics.measurementPolicy).toBe('scope-size/1');
    expect(metrics.evaluation.outsideScope.map(entry => entry.path)).toContain(outsidePath);
    expect(metrics.evaluation.guarding.guarded).toContain('edit');
    expect(metrics.evaluation.guarding.unguarded).toEqual(['shell']);
    expect(metrics.evaluation.guarding.complete).toBe(false);
    expect(metrics.evaluation.guarding.statement).toContain('A count of blocked calls is not evidence that every write respected its scope');
    // The run tests' baseline is unavailable, and the unguarded shell makes
    // one writer's line counts partial: no ratio is reported, and no zero.
    expect(metrics.baseline.state).toBe('unavailable');
    for (const id of ['scope-bytes-per-changed-line', 'scope-size-ratio', 'reduction-factor', 'session-weighted-total']) {
      const metric = metrics.metrics.find(candidate => candidate.id === id)!;
      expect([id, metric.state, metric.value]).toEqual([id, expect.not.stringMatching(/^measured$/), null]);
    }
    const blocked = metrics.metrics.find(metric => metric.id === 'blocked-write-attempts')!;
    expect(blocked.state).toBe('partial');
    expect(blocked.value).toBeNull();
    expect(blocked.note).toContain('not evidence');
    // Settlement's process-group count is not a metric: it is 0 by
    // construction and is never presented as a measurement.
    expect(metrics.metrics.some(metric => /group/i.test(metric.id))).toBe(false);
  }, 300_000);
});

describe('commands over HTTP', () => {
  async function commandTarget() {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    return fixture.root;
  }

  test('an identical retry returns its receipt; a conflicting reuse and a stale version are refused', async () => {
    const root = await commandTarget();
    const server = await serve(root, {
      agent: createScriptedAgent(declaringScenarios([{ kind: 'submit', input: emptyAnalysis() }])),
      runs: { inputs: treeInputs(), policy: projectRoot => testPolicy(projectRoot), stopGraceMs: 500, warn: () => undefined },
    }, ['final verification of plan "review-notes"']);
    cleanups.push(() => server.close());
    const command = startRun(plan, 'scripted', 'start-once');

    const first = await post(server, command);
    expect(first.status).toBe(202);
    const receipt = commandResponseSchema.parse(first.body).receipt;
    await until(async () => runResponseSchema.parse((await get(server, protocolPaths.run(plan, receipt.jobId))).body).run.state !== 'running', 60_000);

    // The identical retry, after the run has ended, returns the original receipt.
    const retried = await post(server, command);
    expect(retried.status).toBe(202);
    expect(commandResponseSchema.parse(retried.body).receipt).toEqual(receipt);

    // The same ID with other content is a conflict, and creates nothing.
    const conflicting = await post(server, { ...command, payload: { planId: 'revision-diff', agent: 'scripted' } });
    expect(conflicting.status).toBe(409);
    expect(errorResponseSchema.parse(conflicting.body).error.code).toBe('conflict');

    // A stop that expects an old version is stale, and says what is current.
    const version = runResponseSchema.parse((await get(server, protocolPaths.run(plan, receipt.jobId))).body).run.version;
    const stale = await post(server, { commandId: 'stop-stale', expectedVersion: 1, type: 'stop-job', payload: { planId: plan, jobId: receipt.jobId } });
    expect(stale.status).toBe(409);
    expect(errorResponseSchema.parse(stale.body).error).toMatchObject({ code: 'stale-version', currentVersion: version });

    // A new start that does not expect version 0 is stale too.
    const staleStart = await post(server, { ...startRun(plan, 'scripted', 'start-stale'), expectedVersion: 3 });
    expect(staleStart.status).toBe(409);
    expect(errorResponseSchema.parse(staleStart.body).error).toMatchObject({ code: 'stale-version', currentVersion: 0 });

    const list = runListResponseSchema.parse((await get(server, protocolPaths.runs(plan))).body);
    expect(list.runs).toHaveLength(1);
    expect(runListResponseSchema.parse((await get(server, protocolPaths.runs('revision-diff'))).body).runs).toEqual([]);
  }, 120_000);

  test('a start-run payload that breaks its schema is refused with every error and its path, and changes nothing', async () => {
    const root = await commandTarget();
    const server = await serve(
      root,
      { agent: createScriptedAgent(declaringScenarios([{ kind: 'submit', input: emptyAnalysis() }])) },
      ['final verification of plan "review-notes"'],
    );
    cleanups.push(() => server.close());

    const broken = await post(server, {
      commandId: 'start-broken', expectedVersion: 0, type: 'start-run',
      payload: { planId: plan, agent: 'someone-else', run: 'rm -rf /' },
    });
    expect(broken.status).toBe(400);
    const error = errorResponseSchema.parse(broken.body).error;
    expect(error.code).toBe('invalid-request');
    expect(error.message).toContain('payload.agent');
    expect(error.message).toContain('payload');
    expect(error.message).toMatch(/run/);
    expect(runListResponseSchema.parse((await get(server, protocolPaths.runs(plan))).body).runs).toEqual([]);

    // The corrected command is accepted: the refusal consumed nothing, not even its ID.
    const corrected = await post(server, startRun(plan, 'scripted', 'start-broken'));
    expect(corrected.status).toBe(202);
    const runId = commandResponseSchema.parse(corrected.body).receipt.jobId;
    await until(async () => runResponseSchema.parse((await get(server, protocolPaths.run(plan, runId))).body).run.state !== 'running', 60_000);
  }, 120_000);

  test('close keeps the project lock until a run driver is quiescent and no write follows its resolution', async () => {
    const root = await commandTarget();
    let reached!: () => void;
    let resume!: () => void;
    const atBoundary = new Promise<void>(resolve => { reached = resolve; });
    const paused = new Promise<void>(resolve => { resume = resolve; });
    const opened = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      afterWrite: async write => {
        if (write !== 'invocation-started') return;
        reached();
        await paused;
      },
    });
    const receipt = await opened.service.execute(startRun(plan));
    await atBoundary;

    let closeResolved = false;
    const closing = opened.service.close().then(() => { closeResolved = true; });
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    const resolvedBeforeDriver = closeResolved;
    const heldBeforeDriver = await opened.lock.held();
    const eventsBeforeDriver = await runEventsOnDisk(root, plan, receipt.jobId);

    resume();
    await closing;
    await opened.service.settled(plan, receipt.jobId);
    const eventsAtClose = await runEventsOnDisk(root, plan, receipt.jobId);
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(resolvedBeforeDriver).toBe(false);
    expect(heldBeforeDriver).toBe(true);
    expect(await runEventsOnDisk(root, plan, receipt.jobId)).toEqual(eventsAtClose);
    expect(eventsAtClose.length).toBeGreaterThan(eventsBeforeDriver.length);
    expect(await opened.lock.held()).toBe(false);

    const successor = await acquireProjectLock(root);
    expect(await successor.held()).toBe(true);
    await successor.release();
  }, 120_000);

  test('close drains delayed observation writes before it releases the project lock', async () => {
    const root = await commandTarget();
    let reached!: () => void;
    let resume!: () => void;
    const atObservation = new Promise<void>(resolve => { reached = resolve; });
    const paused = new Promise<void>(resolve => { resume = resolve; });
    const originalRecord = ObservationLog.prototype.record;
    const record = vi.spyOn(ObservationLog.prototype, 'record').mockImplementation(async function (this: ObservationLog, input, at) {
      if (input.type === 'context') {
        reached();
        await paused;
      }
      return originalRecord.call(this, input, at);
    });
    const opened = await openRuns(root, {
      script: [
        { kind: 'context', tokens: 1_000, window: 200_000 },
        { kind: 'wait', ms: 60_000 },
      ],
    });
    let closing: Promise<void> | undefined;
    try {
      const receipt = await opened.service.execute(startRun(plan));
      await atObservation;
      let closeResolved = false;
      closing = opened.service.close().then(() => { closeResolved = true; });
      await new Promise<void>(resolve => setImmediate(resolve));
      const resolvedBeforeObservation = closeResolved;
      const heldBeforeObservation = await opened.lock.held();

      resume();
      await closing;
      // The static script leaves the intake (inv-0001) to its default turn;
      // the initial architect's session, inv-0002, observes its context.
      const observations = await readFile(runPath(root, plan, receipt.jobId, runLayout.observations('inv-0002')), 'utf8');
      await new Promise<void>(resolve => setImmediate(resolve));

      expect(resolvedBeforeObservation).toBe(false);
      expect(heldBeforeObservation).toBe(true);
      expect(observations).toContain('"type":"context"');
      expect(await readFile(runPath(root, plan, receipt.jobId, runLayout.observations('inv-0002')), 'utf8')).toBe(observations);
      expect(await opened.lock.held()).toBe(false);
    } finally {
      resume();
      await closing?.catch(() => undefined);
      record.mockRestore();
    }
  }, 120_000);

  test('close waits for an admitted start before choosing the drivers it must quiesce', async () => {
    const root = await commandTarget();
    let reached!: () => void;
    let resume!: () => void;
    const atCapture = new Promise<void>(resolve => { reached = resolve; });
    const paused = new Promise<void>(resolve => { resume = resolve; });
    const inputs = treeInputs();
    const opened = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      inputs: {
        ...inputs,
        capture: async (...args) => {
          reached();
          await paused;
          return inputs.capture(...args);
        },
      },
    });

    const starting = opened.service.execute(startRun(plan));
    await atCapture;
    let closeResolved = false;
    const closing = opened.service.close().then(() => { closeResolved = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    const resolvedBeforeStart = closeResolved;
    const heldBeforeStart = await opened.lock.held();

    resume();
    const receipt = await starting;
    await closing;
    await opened.service.settled(plan, receipt.jobId);

    expect(resolvedBeforeStart).toBe(false);
    expect(heldBeforeStart).toBe(true);
    expect(await opened.lock.held()).toBe(false);
  }, 120_000);

  test('close remains bounded and retains the project lock when a driver cannot quiesce', async () => {
    const root = await commandTarget();
    let reached!: () => void;
    let resume!: () => void;
    const atBoundary = new Promise<void>(resolve => { reached = resolve; });
    const paused = new Promise<void>(resolve => { resume = resolve; });
    const opened = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      afterWrite: async write => {
        if (write !== 'invocation-started') return;
        reached();
        await paused;
      },
      policy: projectRoot => {
        const policy = testPolicy(projectRoot);
        return { ...policy, limits: { ...policy.limits, stopSettleMs: 50 } };
      },
    });
    const receipt = await opened.service.execute(startRun(plan));
    await atBoundary;

    await expect(opened.service.close()).rejects.toThrow('did not become quiescent within 50 ms');
    expect(await opened.lock.held()).toBe(true);

    resume();
    await opened.service.settled(plan, receipt.jobId);
    await opened.service.close();
    expect(await opened.lock.held()).toBe(false);
  }, 120_000);
});

describe('a record of an unsupported version', () => {
  test('surfaces as unsupported-version with evidence, never as an absent run', async () => {
    const target = await scriptedTarget();
    cleanups.push(target.remove);
    const runId = '20990101T000000Z-abcdef';
    await mkdir(runPath(target.root, plan, runId), { recursive: true });
    await writeFile(runPath(target.root, plan, runId, 'job.json'), `${JSON.stringify({ schema: 'ramify-agent.job/4', kind: 'implementation', jobId: runId, planId: plan })}\n`);

    const server = await serve(target.root);
    cleanups.push(() => server.close());
    expect(server.recovery.skipped).toEqual([`${plan}/${runId}`]);

    const { status, body } = await get(server, protocolPaths.run(plan, runId));
    expect(status).toBe(422);
    const error = errorResponseSchema.parse(body).error;
    expect(error.code).toBe('unsupported-version');
    expect(error.message).toContain('(missing policy)');
    expect(error.message).toContain('run-policy/7');
    expect(error.message).toContain('fresh run is required');
    for (const path of [protocolPaths.runEvents(plan, runId, 0), protocolPaths.runMetrics(plan, runId), protocolPaths.runGate(plan, runId, 'ga-0001')]) {
      expect(errorResponseSchema.parse((await get(server, path)).body).error.code).toBe('unsupported-version');
    }

    const list = runListResponseSchema.parse((await get(server, protocolPaths.runs(plan))).body);
    expect(list.unserved).toEqual([{
      jobId: runId, path: `plans/${plan}/.harness/jobs/${runId}/job.json`, code: 'unsupported-version',
      message: expect.stringContaining('fresh run is required'),
    }]);

    // A run that does not exist is `not-found`; the difference is the point.
    expect(errorResponseSchema.parse((await get(server, protocolPaths.run(plan, '20990101T000000Z-000000'))).body).error.code).toBe('not-found');
  }, 60_000);
});
