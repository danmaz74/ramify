import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { breakpointStateSchema, startRunCommandSchema, type DebugResumeCommand } from '../interfaces/protocol/runs.js';
import { projectEvent } from '../projections/events.js';
import { analysis, entry } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { assign, byRole, completionProposed, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { installTestRunner, startRun, stopRun, testPolicy, until, runEventsOnDisk, emptyAnalysis, freeze, staleCrashLock } from './helpers/runs.js';
import { reviewRun, reviewTarget, gate, store, tool, candidates as reviewCandidates, notesDirectory } from './helpers/reviews.js';
import { snapshotToolNames } from '../../subs/reviews/src/snapshot.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { openUnchangedRuns, assertUnchangedGit } from './helpers/unchanged-run.js';

const plan = 'review-notes';
const module = 'collection-review/workspace/reviews';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  assertUnchangedGit();
});

async function fixture() {
  const copied = await copyFixture();
  cleanups.push(copied.remove);
  await installTestRunner(copied.root);
  return copied.root;
}

function start(commandId = 'debug-start', reviewStop = false) {
  return startRunCommandSchema.parse({ ...startRun(plan, 'scripted', commandId, reviewStop),
    payload: { planId: plan, agent: 'scripted', reviewStop, breakpoint: 'before-agent:engineer' } });
}

function resume(jobId: string, pauseId: string, commandId = 'debug-resume'): DebugResumeCommand {
  return { commandId, expectedVersion: 0, type: 'debug-resume', payload: { planId: plan, jobId, pauseId, expectedRevision: 1 } };
}

async function paused(service: Awaited<ReturnType<typeof openUnchangedRuns>>['service'], runId: string) {
  await until(() => service.debugState(plan, runId)?.state === 'paused');
  return service.debugState(plan, runId)!;
}

async function ordinary(options: Parameters<typeof openUnchangedRuns>[1] = {}) {
  const root = await fixture();
  const opened = await openUnchangedRuns(root, { inputs: treeInputs(),
    unchangedCheckpoints: [scenariosCommit(plan)],
    script: byRole({ 'initial-architect': [submit(analysis([entry('review-note', module)]))],
      'local-architect': [submit(assign(module, {}, outline())), submit(assign(module))],
      engineer: [submit(completionProposed())] }), ...options });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(start());
  return { ...opened, root, runId: receipt.jobId };
}

async function stop(service: Awaited<ReturnType<typeof openUnchangedRuns>>['service'], runId: string) {
  // A settling reader may commit between reading the run version and admission.
  for (;;) {
    try { await service.execute(stopRun(plan, runId, service.getRun(plan, runId)!.version)); break; }
    catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'stale-version') throw error; }
  }
  await service.settled(plan, runId);
}

test('B01 B04 B15: prepared engineer pause has no model invocation or writer; stop closes it and refuses resume', async () => {
  const { service, agent, runId } = await ordinary();
  const state = breakpointStateSchema.parse(await paused(service, runId));
  expect(state).toMatchObject({ kind: 'breakpoint', role: 'engineer', revision: 1, taskState: 'pending',
    work: { workItem: 'wi-001', iteration: 'wi-001.i01' }, goal: `Carry out the work in ${module}.` });
  expect(state.summary).toContain('engineer not yet invoked');
  expect(service.getRun(plan, runId)?.state).toBe('running');
  await expect(service.execute({ commandId: 'ordinary-approval-while-paused', expectedVersion: state.cursor,
    type: 'approve-analysis', payload: { planId: plan, jobId: runId, reviewer: 'caller' } })).rejects.toMatchObject({ code: 'busy' });
  expect(agent!.sessions.some(session => session.spec.role === 'engineer')).toBe(false);
  expect(service.events(plan, runId)!.some(event => event.type === 'writer-acquired')).toBe(false);
  const before = service.events(plan, runId)!.length;
  // Discarding one client view and taking another changes no state or evidence.
  state.work.iteration = 'caller-mutated';
  expect(service.debugState(plan, runId)?.work.iteration).toBe('wi-001.i01');
  expect(service.events(plan, runId)!.length).toBe(before);
  expect(service.events(plan, runId)!.map(projectEvent).at(-1)?.transition).toBe('debug-paused');
  await stop(service, runId);
  expect(service.getRun(plan, runId)?.state).toBe('stopped');
  expect(service.debugState(plan, runId)).toBeNull();
  await expect(service.execute(resume(runId, state.pauseId))).rejects.toMatchObject({ code: 'conflict' });
  expect(agent!.sessions.some(session => session.spec.role === 'engineer')).toBe(false);
});

test('B01 B03: caller waiting preserves the run budget, exact resume retry releases once, and the next assignment is a new occurrence', async () => {
  let clock = new Date('2026-10-10T12:00:00Z');
  const { service, runId, agent } = await ordinary({ now: () => clock,
    unchangedCheckpoints: [scenariosCommit(plan), 'wi-001.i01'],
    policy: root => { const policy = testPolicy(root); return { ...policy,
      limits: { ...policy.limits, runAbsoluteMs: 1_000 } }; } });
  const first = await paused(service, runId);
  clock = new Date(clock.getTime() + 100_000);
  const command = resume(runId, first.pauseId);
  const receipt = await service.execute(command);
  expect(await service.execute(command)).toEqual(receipt);
  await expect(service.execute({ ...command, payload: { ...command.payload, expectedRevision: 2 } })).rejects.toMatchObject({ code: 'conflict' });
  const second = await paused(service, runId);
  expect(second.pauseId).not.toBe(first.pauseId);
  expect(second.work.iteration).toBe('wi-001.i02');
  expect(agent!.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(1);
  await expect(service.execute(resume(runId, first.pauseId, 'stale-occurrence'))).rejects.toMatchObject({ code: 'conflict' });
  await stop(service, runId);
});

test('B03: an already exhausted run fails instead of publishing a usable breakpoint', async () => {
  let clock = new Date('2026-10-10T12:00:00Z');
  const { service, runId } = await ordinary({ now: () => clock,
    afterWrite: async write => { if (write === 'iteration-assigned') clock = new Date(clock.getTime() + 2_000); },
    policy: root => { const policy = testPolicy(root); return { ...policy,
      limits: { ...policy.limits, runAbsoluteMs: 1_000 } }; } });
  await service.settled(plan, runId);
  expect(service.getRun(plan, runId)).toMatchObject({ state: 'failed', failure: { reason: 'limit-exceeded' } });
  expect(service.events(plan, runId)!.some(event => event.type === 'debug-paused')).toBe(false);
});

test('B01: a repair continuation reaches a second occurrence of the prepared assignment', async () => {
  const { service, runId, agent } = await ordinary({
    unchangedCheckpoints: [scenariosCommit(plan), 'wi-001.i01'],
    checkScript: ({ context, check }) => context.attemptId === 'ga-0002' && check.kind === 'tests'
      ? { outcome: { kind: 'completed', exitCode: 1 }, stdout: 'A declared test failed' } : {},
  });
  const first = await paused(service, runId);
  await service.execute(resume(runId, first.pauseId));
  const repair = await paused(service, runId);
  expect(repair.pauseId).not.toBe(first.pauseId);
  expect(repair.work.iteration).toBe(first.work.iteration);
  expect(agent!.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(1);
  await stop(service, runId);
});

test('B15: unsupported selection is refused; legacy starts still omit the debugger', () => {
  expect(startRunCommandSchema.safeParse({ ...start(), payload: { ...start().payload, breakpoint: 'before-agent:reviewer' } }).success).toBe(false);
  expect(startRunCommandSchema.parse(startRun(plan)).payload.breakpoint).toBeUndefined();
});

test('B14: server loss interrupts a debug-enabled run before its first breakpoint instead of restoring the review stop', async () => {
  const root = await fixture();
  const first = await openUnchangedRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
  const receipt = await first.service.execute(start('debug-before-pause', true));
  await until(() => first.service.getRun(plan, receipt.jobId)?.phase === 'awaiting-review');
  await first.service.close();
  const restarted = await openUnchangedRuns(root, { script: [] });
  cleanups.push(() => restarted.service.close());
  expect(restarted.recovery.interrupted).toEqual([`${plan}/${receipt.jobId}`]);
  expect(restarted.recovery.effects).toEqual([]);
  expect(restarted.agent!.sessions).toHaveLength(0);
  expect(restarted.service.getRun(plan, receipt.jobId)?.state).toBe('interrupted');
});

test('B14: losing a paused host retains evidence and never redispatches the engineer', async () => {
  const { service, runId, root } = await ordinary();
  const reached = await paused(service, runId);
  await service.close();
  const restarted = await openUnchangedRuns(root, { script: [] });
  cleanups.push(() => restarted.service.close());
  expect(restarted.recovery.interrupted).toEqual([`${plan}/${runId}`]);
  expect(restarted.recovery.effects).toEqual([]);
  expect(restarted.agent!.sessions).toHaveLength(0);
  expect((await runEventsOnDisk(root, plan, runId)).find(event => event.type === 'debug-paused')?.data.pauseId).toBe(reached.pauseId);
  expect(restarted.service.getRun(plan, runId)?.state).toBe('interrupted');
});

test('B04: resume revalidates the captured source documents before starting the engineer', async () => {
  const { service, runId, root, agent } = await ordinary();
  const pause = await paused(service, runId);
  await writeFile(join(root, 'plans', plan, 'plan.md'), 'Changed while caller waited\n');
  await service.execute(resume(runId, pause.pauseId));
  await service.settled(plan, runId);
  expect(service.getRun(plan, runId)).toMatchObject({ state: 'failed', failure: { reason: 'inputs-changed' } });
  expect(agent!.sessions.some(session => session.spec.role === 'engineer')).toBe(false);
});


test.each(['code', 'design'] as const)('B02 B04: pausing settles an admitted %s review pipeline while its queued successor stays suspended', async kind => {
  const root = await reviewTarget(cleanups);
  const active = gate();
  const release = gate();
  const exchangeStarted = gate();
  const exchangeRelease = gate();
  let engineerCalls = 0;
  const opened = await reviewRun(root, cleanups, { breakpoint: 'before-agent:engineer', detached: true,
    commits: Object.fromEntries(Object.entries(reviewCandidates()).map(([id, candidate]) => [id, { ...candidate, files: { ...candidate.files,
      'ramify-agent.json': '{\"schema\":\"ramify-agent.project/1\"}\n',
      [`${notesDirectory}/src/tests/notes.test.ts`]: 'export {};\n',
      [`${notesDirectory}/README.md`]: 'Keep one note per review run.\n',
    } }])),
    policy: { kinds: kind === 'code' ? ['code', 'scope'] : ['design', 'code'], concurrency: 1, retries: 0 },
    engineer: [[{ kind: 'await', until: async () => { if (++engineerCalls === 2) { exchangeStarted.open(); await exchangeRelease.opened; } } },
      ...submit(completionProposed('Added store'), write('store.ts', 'export const store = new Map(); // v1\n'))]],
    reviewers: {
      orientation: [{ kind: 'await', until: async () => { active.open(); await release.opened; } }, { kind: 'end', message: 'No orientation submitted' }],
      'rq-0001': kind === 'code'
        ? [{ kind: 'await', until: async () => { active.open(); await release.opened; } },
          tool(snapshotToolNames.diff, { path: store }), { kind: 'submit', input: { inspected: [store], missing: [], concerns: [] } }]
        : [{ kind: 'end', message: 'No design verdict submitted' }],
    },
  });
  cleanups.push(() => opened.service.close());
  const first = await paused(opened.service, opened.runId);
  await opened.service.execute(resume(opened.runId, first.pauseId));
  await active.opened;
  await until(() => opened.service.debugState(plan, opened.runId)?.state === 'pausing');
  const settling = opened.service.debugState(plan, opened.runId)!;
  await expect(opened.service.execute(resume(opened.runId, settling.pauseId, 'too-early'))).rejects.toMatchObject({ code: 'busy' });
  expect(opened.service.events(plan, opened.runId)!.filter(event => event.type === 'review-attempt-started').map(event => event.data.request)).not.toContain('rq-0002');
  release.open();
  const second = await paused(opened.service, opened.runId);
  const events = opened.service.events(plan, opened.runId)!;
  const reached = events.filter(event => event.type === 'debug-paused').at(-1)!;
  const finished = events.find(event => event.type === 'review-attempt-finished' && event.data.request === 'rq-0001');
  expect(finished).toBeDefined();
  expect(finished!.sequence).toBeLessThan(reached.sequence);
  expect(events.filter(event => event.type === 'review-attempt-started').map(event => event.data.request)).not.toContain('rq-0002');
  expect(events.filter(event => event.type === 'writer-acquired')).toHaveLength(1);
  expect(events.filter(event => event.type === 'writer-released')).toHaveLength(1);
  if (kind === 'design') expect(finished?.data).toMatchObject({ result: 'not-verified', reason: 'invalid-output' });
  await opened.service.execute({ commandId: 'suspended-review-chat', expectedVersion: 0, type: 'debug-message', payload: {
    planId: plan, jobId: opened.runId, pauseId: second.pauseId, expectedRevision: second.revision, message: 'Perform the ordinary task.' } });
  await exchangeStarted.opened;
  expect(opened.service.debugState(plan, opened.runId)?.state).toBe('exchanging');
  expect(opened.service.events(plan, opened.runId)!.filter(event => event.type === 'review-attempt-started').map(event => event.data.request)).not.toContain('rq-0002');
  exchangeRelease.open();
  await until(() => opened.service.debugResult(plan, opened.runId, 'suspended-review-chat')?.status === 'settled');
  expect(opened.service.debugResult(plan, opened.runId, 'suspended-review-chat')?.taskState).toBe('accepted');
  expect(opened.service.events(plan, opened.runId)!.filter(event => event.type === 'review-attempt-started').map(event => event.data.request)).not.toContain('rq-0002');
  await stop(opened.service, opened.runId);
  await expect(opened.service.execute(resume(opened.runId, second.pauseId, 'after-stop'))).rejects.toMatchObject({ code: 'conflict' });
});

test('B02: an unconfirmed admitted reader barrier fails settlement instead of publishing a usable pause', async () => {
  const root = await reviewTarget(cleanups);
  const barrier = gate();
  const opened = await reviewRun(root, cleanups, { breakpoint: 'before-agent:engineer', detached: true,
    limits: { writerSettleMs: 20, stopSettleMs: 20 }, policy: { kinds: ['code'], concurrency: 1, retries: 0 },
    engineer: [submit(completionProposed('Added store'), write('store.ts', 'export const store = new Map(); // v1\n'))],
    reviewers: { 'rq-0001': [tool(snapshotToolNames.diff, { path: store }),
      { kind: 'submit', input: { inspected: [store], missing: [], concerns: [] } }] },
    agentReady: agent => {
      const bind = agent.bindSessionStore.bind(agent);
      agent.bindSessionStore = store => {
        const operations = bind(store);
        return { ...operations, async continue(input) {
          const handle = await operations.continue(input);
          return input.task.role === 'reviewer' ? { ...handle, settled: () => barrier.opened.then(() => handle.settled()) } : handle;
        } };
      };
    },
  });
  cleanups.push(async () => { barrier.open(); await new Promise(resolve => setTimeout(resolve, 0)); await opened.service.close(); });
  const first = await paused(opened.service, opened.runId);
  await opened.service.execute(resume(opened.runId, first.pauseId));
  await opened.service.settled(plan, opened.runId);
  expect(opened.service.getRun(plan, opened.runId)).toMatchObject({ state: 'failed', failure: {
    reason: 'agent-failed', message: expect.stringContaining('settlement was not confirmed'),
  } });
  expect(opened.service.events(plan, opened.runId)!.filter(event => event.type === 'debug-paused')).toHaveLength(1);
  expect(opened.agent!.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(1);
});


test.each(['scenarios-materializing', 'gate-committing'] as const)('B14: server loss at %s interrupts before replaying an unfinished external effect', async boundary => {
  const root = await fixture();
  let crashed = false;
  let resumed = false;
  const first = await openUnchangedRuns(root, { inputs: treeInputs(),
    unchangedCheckpoints: boundary === 'scenarios-materializing' ? [] : [scenariosCommit(plan)],
    script: byRole({ 'initial-architect': [submit(analysis([entry('review-note', module)]))],
      'local-architect': [submit(assign(module, {}, outline()))], engineer: [submit(completionProposed())] }),
    afterWrite: async write => { if (write === boundary || (boundary === 'gate-committing' && resumed && write === 'gate-attempted')) { crashed = true; await freeze(); } },
  });
  const receipt = await first.service.execute(start());
  if (boundary === 'gate-committing') {
    const before = await paused(first.service, receipt.jobId);
    resumed = true;
    await first.service.execute(resume(receipt.jobId, before.pauseId));
  }
  await until(() => crashed);
  const before = first.service.events(plan, receipt.jobId)!.length;
  await staleCrashLock(root);
  const restarted = await openUnchangedRuns(root, { script: [] });
  cleanups.push(() => restarted.service.close());
  expect(restarted.recovery.interrupted).toEqual([`${plan}/${receipt.jobId}`]);
  expect(restarted.recovery.effects).toEqual([]);
  expect(restarted.agent!.sessions).toHaveLength(0);
  const events = restarted.service.events(plan, receipt.jobId)!;
  expect(events.slice(before).map(event => event.type)).not.toContain(boundary === 'scenarios-materializing' ? 'scenarios-materialized' : 'gate-attempted');
  expect(restarted.service.getRun(plan, receipt.jobId)?.state).toBe('interrupted');
  if (boundary === 'gate-committing') expect(events.some(event => event.type === 'debug-resumed')).toBe(true);
});

test('B04: stop during pausing settles its admitted reader and prevents pause publication or later dispatch', async () => {
  const root = await reviewTarget(cleanups);
  const active = gate();
  const opened = await reviewRun(root, cleanups, { breakpoint: 'before-agent:engineer', detached: true,
    policy: { kinds: ['code', 'scope'], concurrency: 1, retries: 0 },
    engineer: [submit(completionProposed('Added store'), write('store.ts', 'export const store = new Map(); // v1\n'))],
    reviewers: { 'rq-0001': [{ kind: 'await', until: async () => { active.open(); await new Promise(() => undefined); } }] },
  });
  cleanups.push(() => opened.service.close());
  const first = await paused(opened.service, opened.runId);
  await opened.service.execute(resume(opened.runId, first.pauseId));
  await active.opened;
  await until(() => opened.service.debugState(plan, opened.runId)?.state === 'pausing');
  const interruptedPause = opened.service.debugState(plan, opened.runId)!;
  await stop(opened.service, opened.runId);
  await expect(opened.service.execute(resume(opened.runId, interruptedPause.pauseId, 'resume-after-stop'))).rejects.toMatchObject({ code: 'conflict' });
  const events = opened.service.events(plan, opened.runId)!;
  expect(events.filter(event => event.type === 'debug-paused')).toHaveLength(1);
  expect(events.at(-1)?.type).toBe('job-stopped');
  expect(events.filter(event => event.type === 'invocation-started' && event.data.role === 'engineer')).toHaveLength(1);
  expect(events.some(event => event.type === 'review-attempt-started' && event.data.request === 'rq-0002')).toBe(false);
});

test('B03: resumed model execution still consumes the run budget after a long caller wait', async () => {
  let clock = new Date('2026-10-10T12:00:00Z');
  const script = byRole({ 'initial-architect': [submit(analysis([entry('review-note', module)]))],
    'local-architect': [submit(assign(module, {}, outline())), submit(assign(module))], engineer: [submit(completionProposed())] });
  const { service, runId, agent } = await ordinary({ now: () => clock,
    unchangedCheckpoints: [scenariosCommit(plan), 'wi-001.i01'],
    policy: root => { const policy = testPolicy(root); return { ...policy,
      limits: { ...policy.limits, runAbsoluteMs: 1_000 } }; },
    script: spec => { if (spec.role === 'engineer') clock = new Date(clock.getTime() + 2_000); return typeof script === 'function' ? script(spec) : script; },
  });
  const before = await paused(service, runId);
  clock = new Date(clock.getTime() + 100_000);
  await service.execute(resume(runId, before.pauseId));
  await service.settled(plan, runId);
  expect(agent!.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(1);
  expect(service.getRun(plan, runId)).toMatchObject({ state: 'failed', failure: { reason: 'limit-exceeded' } });
  expect(service.getRun(plan, runId)?.failure?.message).toContain('2000 ms');
});
