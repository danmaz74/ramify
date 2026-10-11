import { writeFile } from 'node:fs/promises';
import { afterEach, expect, test } from 'vitest';
import { createApp } from '../http/app.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { planListResponseSchema, planResponseSchema } from '../interfaces/protocol/queries.js';
import {
  debugStateResponseSchema, debugExchangeResponseSchema, debugInspectionResponseSchema, runEventPageSchema, runListResponseSchema, runResponseSchema, runSnapshotSchema,
  startRunCommandSchema, type ProjectedRunEvent,
} from '../interfaces/protocol/runs.js';
import { runSnapshot } from '../run/snapshot.js';
import { constructedRecord } from './helpers/constructed.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { assign, byRole, completionProposed, outline, submit, treeInputs } from './helpers/iterations.js';
import { installTestRunner, startRun, stopRun, until } from './helpers/runs.js';
import { openUnchangedRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import type { Request, Response } from 'express';

const plan = 'review-notes', module = 'collection-review/workspace/reviews';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); assertUnchangedGit(); });

type Handle = (method: 'get' | 'post', path: string, body?: unknown) => Promise<{ status: number; body: unknown }>;

/**
 * A scripted run hosted through the real route handlers, paused before its
 * engineer. `before` reads the routes before the start; `toEnd` scripts the
 * checkpoints a resumed run needs to complete.
 */
async function host({ before, toEnd = false }: { before?: (handle: Handle) => Promise<void>; toEnd?: boolean } = {}) {
  const fixture = await copyFixture(); cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  let release: () => void = () => {};
  const held = new Promise<void>(done => { release = done; });
  const opened = await openUnchangedRuns(fixture.root, { inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit(plan), ...toEnd ? ['wi-001.i01', 'wi-001', `final verification of plan "${plan}"`] : []],
    script: byRole({ 'initial-architect': [submit(analysis([entry('review-note', module)]))],
      'local-architect': [submit(assign(module, {}, outline())), submit(toEnd ? requestCompletion() : assign(module))],
      engineer: [[{ kind: 'await', until: () => held }, { kind: 'message', text: 'I understand the normal task.' }, { kind: 'end', message: 'I understand the normal task.' }], submit(completionProposed())] }) });
  cleanups.push(() => opened.service.close());
  const app = createApp({ projectRoot: fixture.root, runs: opened.service });
  // Call the real final route handler directly: no process or network substitute is claimed as native HTTP evidence.
  const handle: Handle = async (method, path, body) => {
    const url = new URL(path, 'http://test');
    const route = (app.router.stack as unknown as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (request: Request, response: Response) => Promise<void> }> } }>).find(layer => {
      const route = layer.route;
      if (!route?.methods[method]) return false;
      return new RegExp(`^${route.path.replace(/:[^/]+/g, '[^/]+')}$`).test(url.pathname);
    })!.route!;
    const names = [...route.path.matchAll(/:([^/]+)/g)].map(match => match[1]!);
    const pattern = new RegExp(`^${route.path.replace(/:[^/]+/g, '([^/]+)')}$`);
    const matches = pattern.exec(url.pathname)!;
    const params = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(matches[index + 1]!)]));
    let status = 200, result: unknown;
    const response = { status(code: number) { status = code; return this; }, json(value: unknown) { result = value; return this; } } as Response;
    await route.stack.at(-1)!.handle({ params, query: Object.fromEntries(url.searchParams), body } as Request, response);
    return { status, body: result };
  };
  await before?.(handle);
  const receipt = await opened.service.execute(startRunCommandSchema.parse({ ...startRun(plan, 'scripted', 'start-http'),
    payload: { planId: plan, agent: 'scripted', breakpoint: 'before-agent:engineer' } }));
  await until(() => opened.service.debugState(plan, receipt.jobId)?.state === 'paused');
  return { ...opened, handle, release, runId: receipt.jobId, pause: opened.service.debugState(plan, receipt.jobId)! };
}

test('B11/B13: HTTP admits immediately, retries once, retains actual exchange and separates current released state', async () => {
  const hosted = await host();
  const { service, runId, pause, handle } = hosted;
  const input = { commandId: 'message-http', expectedVersion: 0, type: 'debug-message', payload: {
    planId: plan, jobId: runId, pauseId: pause.pauseId, expectedRevision: pause.revision, message: 'Explain without editing.' } };
  const admitted = await handle('post', protocolPaths.commands, input);
  expect(admitted.status).toBe(202);
  expect(service.debugResult(plan, runId, 'message-http')?.status).toBe('admitted');
  expect(await handle('post', protocolPaths.commands, input)).toEqual(admitted);
  await expect(handle('post', protocolPaths.commands, { ...input, payload: { ...input.payload, message: 'Different' } })).rejects.toMatchObject({ code: 'conflict' });
  await expect(handle('post', protocolPaths.commands, { ...input, commandId: 'concurrent-http' })).rejects.toMatchObject({ code: 'busy' });
  const waiting = debugExchangeResponseSchema.parse((await handle('get', protocolPaths.runDebugExchange(plan, runId, 'message-http'))).body);
  expect(waiting).toMatchObject({ exchange: { status: 'admitted' }, current: { state: 'exchanging' } });
  hosted.release();
  await until(() => service.debugResult(plan, runId, 'message-http')?.status === 'settled');
  const settled = debugExchangeResponseSchema.parse((await handle('get', protocolPaths.runDebugExchange(plan, runId, 'message-http'))).body);
  expect(settled.exchange).toMatchObject({ answer: 'I understand the normal task.', status: 'settled', revision: 2, verdicts: [] });
  expect(settled.exchange!.evidence.length).toBeGreaterThan(0);
  expect(settled.current).toMatchObject({ revision: 2, taskState: 'pending' });
  expect(await handle('post', protocolPaths.commands, input)).toEqual(admitted);
  await expect(handle('post', protocolPaths.commands, { ...input, commandId: 'stale-http' })).rejects.toMatchObject({ code: 'stale-version' });
  const inspection = debugInspectionResponseSchema.parse((await handle('get', protocolPaths.runDebugInspect(plan, runId, pause.pauseId))).body);
  expect(inspection).toMatchObject({ inspection: { preview: true, revision: 2, input: { continuity: 'retained' } }, current: { revision: 2 } });
  const resume = { commandId: 'resume-http', expectedVersion: 0, type: 'debug-resume', payload: { planId: plan, jobId: runId, pauseId: pause.pauseId, expectedRevision: 2, message: 'Now implement.' } };
  const released = await handle('post', protocolPaths.commands, resume);
  expect(released.status).toBe(202);
  expect(await handle('post', protocolPaths.commands, resume)).toEqual(released);
  expect(service.debugState(plan, runId)).toBeNull();
  const historical = debugExchangeResponseSchema.parse((await handle('get', protocolPaths.runDebugExchange(plan, runId, 'message-http'))).body);
  expect(historical).toMatchObject({ exchange: { revision: 2, status: 'settled' }, current: null });
  const reached = debugStateResponseSchema.parse((await handle('get', protocolPaths.runDebug(plan, runId))).body);
  expect(reached.reached).toEqual([expect.objectContaining({ pauseId: pause.pauseId, revision: 1, state: 'paused', taskState: 'pending' })]);
  expect(reached.current).toBeNull();
  const drained = debugStateResponseSchema.parse((await handle('get', protocolPaths.runDebug(plan, runId, reached.cursor))).body);
  expect(drained.reached).toEqual([]);
  await expect(handle('get', protocolPaths.runDebug('other-plan', runId))).rejects.toMatchObject({ code: 'not-found' });
});

test('U01: a run snapshot names its breakpoint in the run and run-list queries, and null without one', async () => {
  const { runId, handle } = await host();
  const run = runResponseSchema.parse((await handle('get', protocolPaths.run(plan, runId))).body).run;
  expect(run.breakpoint).toBe('before-agent:engineer');
  const list = runListResponseSchema.parse((await handle('get', protocolPaths.runs(plan))).body);
  expect(list.runs.find(entry => entry.jobId === runId)?.breakpoint).toBe('before-agent:engineer');
  expect(debugStateResponseSchema.parse((await handle('get', protocolPaths.runDebug(plan, runId))).body).run.breakpoint).toBe('before-agent:engineer');
  expect(runSnapshot(constructedRecord({ breakpoint: 'before-agent:engineer' }), []).breakpoint).toBe('before-agent:engineer');
  expect(runSnapshot(constructedRecord(), []).breakpoint).toBeNull();
  const { breakpoint: _omitted, ...legacy } = run;
  expect(runSnapshotSchema.parse(legacy).breakpoint).toBeNull();
});

test('U02: interventions list every message with its exchange as the harness derives it, then the resume, whatever the after cursor', async () => {
  const hosted = await host();
  const { service, runId, pause, handle } = hosted;
  const state = async (after = 0) => debugStateResponseSchema.parse((await handle('get', protocolPaths.runDebug(plan, runId, after))).body);
  expect((await state()).interventions).toEqual([]);
  const text = 'Explain without editing.\nKeep  the spacing.';
  await handle('post', protocolPaths.commands, { commandId: 'message-u02', expectedVersion: 0, type: 'debug-message', payload: {
    planId: plan, jobId: runId, pauseId: pause.pauseId, expectedRevision: pause.revision, message: text } });
  const admitted = await state();
  expect(admitted.current).toMatchObject({ state: 'exchanging' });
  expect(admitted.interventions).toEqual([expect.objectContaining({ kind: 'message', pauseId: pause.pauseId, revision: 1, commandId: 'message-u02',
    message: text, exchange: expect.objectContaining({ kind: 'exchange', commandId: 'message-u02', status: 'admitted', answer: null }) })]);
  const [message] = admitted.interventions;
  expect(service.events(plan, runId)!.find(event => event.sequence === message!.sequence)).toMatchObject({ type: 'debug-exchange-admitted', at: message!.at });

  hosted.release();
  await until(() => service.debugResult(plan, runId, 'message-u02')?.status === 'settled');
  const settled = await state();
  expect(settled.interventions).toHaveLength(1);
  expect(settled.interventions[0]!.exchange).toEqual(service.debugResult(plan, runId, 'message-u02'));
  expect(settled.interventions[0]!.exchange).toMatchObject({ status: 'settled', answer: 'I understand the normal task.' });
  expect(settled.current).toMatchObject({ state: 'paused', revision: 2, taskState: 'pending' });
  // A cursor beyond the admission event pages `reached` only; the interventions stay complete.
  expect(settled.cursor).toBeGreaterThan(message!.sequence);
  const later = await state(settled.cursor);
  expect(later.reached).toEqual([]);
  expect(later.interventions).toEqual(settled.interventions);

  await handle('post', protocolPaths.commands, { commandId: 'resume-u02', expectedVersion: 0, type: 'debug-resume', payload: {
    planId: plan, jobId: runId, pauseId: pause.pauseId, expectedRevision: 2, message: 'Now implement.' } });
  const resumed = await state(settled.cursor);
  expect(resumed.interventions.map(entry => [entry.kind, entry.commandId, entry.revision, entry.message, entry.exchange?.status ?? null])).toEqual([
    ['message', 'message-u02', 1, text, 'settled'],
    ['resume', 'resume-u02', 2, 'Now implement.', null],
  ]);
  expect(resumed.interventions[1]!.sequence).toBeGreaterThan(resumed.interventions[0]!.sequence);
});

test('U02: a message whose run was stopped before settlement carries the stopped exchange and its error', async () => {
  const hosted = await host();
  const { service, runId, pause, handle } = hosted;
  await handle('post', protocolPaths.commands, { commandId: 'message-stop', expectedVersion: 0, type: 'debug-message', payload: {
    planId: plan, jobId: runId, pauseId: pause.pauseId, expectedRevision: pause.revision, message: 'Work.' } });
  const stopping = service.execute(stopRun(plan, runId, service.getRun(plan, runId)!.version));
  hosted.release();
  await stopping;
  await until(() => service.getRun(plan, runId)?.state === 'stopped');
  const stopped = debugStateResponseSchema.parse((await handle('get', protocolPaths.runDebug(plan, runId))).body);
  expect(stopped.current).toBeNull();
  expect(stopped.run.state).toBe('stopped');
  expect(stopped.interventions).toEqual([expect.objectContaining({ kind: 'message', commandId: 'message-stop', message: 'Work.',
    exchange: expect.objectContaining({ status: 'stopped', taskState: 'terminal', error: expect.any(String) }) })]);
  expect(service.events(plan, runId)!.some(event => event.type === 'debug-exchange-settled')).toBe(false);
});

// The Plan 35 browser witness replays these answers: with PLAN35_DEBUG_EXPORT naming a file, they are written there.
test('U13: the actual debug answers of one breakpoint run, from the pause through a message, its answer and a resume to the end', async () => {
  const before: Record<string, unknown> = {};
  const hosted = await host({ toEnd: true, before: async handle => {
    before['plans'] = planListResponseSchema.parse((await handle('get', protocolPaths.plans)).body);
    before['plan'] = planResponseSchema.parse((await handle('get', protocolPaths.plan(plan))).body);
    before['runs'] = runListResponseSchema.parse((await handle('get', protocolPaths.runs(plan))).body);
  } });
  const { service, runId, pause, handle } = hosted;
  const state = async () => debugStateResponseSchema.parse((await handle('get', protocolPaths.runDebug(plan, runId))).body);
  const events = async () => {
    const all: ProjectedRunEvent[] = [];
    for (let after = 0, more = true; more;) {
      const page = runEventPageSchema.parse((await handle('get', protocolPaths.runEvents(plan, runId, after))).body);
      all.push(...page.events);
      after = page.cursor;
      more = page.more;
    }
    return all;
  };
  const step = async () => ({ debug: await state(), events: await events() });
  const message = 'Explain the task before you edit anything.';
  const resumeText = 'Now implement it as planned.';

  const paused = await step();
  expect(paused.debug.current).toMatchObject({ state: 'paused', pauseId: pause.pauseId, revision: 1, taskState: 'pending' });
  const runs = runListResponseSchema.parse((await handle('get', protocolPaths.runs(plan))).body);
  expect(runs.runs.find(entry => entry.jobId === runId)?.breakpoint).toBe('before-agent:engineer');
  const inspection = debugInspectionResponseSchema.parse((await handle('get', protocolPaths.runDebugInspect(plan, runId, pause.pauseId))).body);
  expect(inspection.inspection).toMatchObject({ pauseId: pause.pauseId, revision: 1, preview: true });

  expect((await handle('post', protocolPaths.commands, { commandId: 'message-plan35', expectedVersion: 0, type: 'debug-message', payload: {
    planId: plan, jobId: runId, pauseId: pause.pauseId, expectedRevision: 1, message } })).status).toBe(202);
  const admitted = await step();
  expect(admitted.debug.current).toMatchObject({ state: 'exchanging' });
  expect(admitted.debug.interventions).toEqual([expect.objectContaining({ commandId: 'message-plan35', message, exchange: expect.objectContaining({ status: 'admitted' }) })]);
  const exchangeAdmitted = debugExchangeResponseSchema.parse((await handle('get', protocolPaths.runDebugExchange(plan, runId, 'message-plan35'))).body);

  hosted.release();
  await until(() => service.debugResult(plan, runId, 'message-plan35')?.status === 'settled');
  const settled = await step();
  expect(settled.debug.current).toMatchObject({ state: 'paused', revision: 2, taskState: 'pending' });
  expect(settled.debug.interventions[0]!.exchange).toMatchObject({ status: 'settled', answer: 'I understand the normal task.' });
  const exchangeSettled = debugExchangeResponseSchema.parse((await handle('get', protocolPaths.runDebugExchange(plan, runId, 'message-plan35'))).body);

  expect((await handle('post', protocolPaths.commands, { commandId: 'resume-plan35', expectedVersion: 0, type: 'debug-resume', payload: {
    planId: plan, jobId: runId, pauseId: pause.pauseId, expectedRevision: 2, message: resumeText } })).status).toBe(202);
  const resumed = await step();
  expect(resumed.debug.current).toBeNull();
  expect(resumed.debug.run.state).toBe('running');
  expect(resumed.debug.interventions.map(entry => [entry.kind, entry.message])).toEqual([['message', message], ['resume', resumeText]]);

  await until(() => service.getRun(plan, runId)!.state !== 'running');
  await service.settled(plan, runId);
  const ended = await step();
  expect(ended.debug.run.state, JSON.stringify(ended.debug.run.failure)).toBe('completed');
  expect(ended.debug.interventions).toEqual(resumed.debug.interventions.map(entry => entry.kind === 'message' ? { ...entry, exchange: expect.objectContaining({ status: 'settled' }) } : entry));
  const after = runListResponseSchema.parse((await handle('get', protocolPaths.runs(plan))).body);

  const output = process.env['PLAN35_DEBUG_EXPORT'];
  if (output) {
    await writeFile(output, `${JSON.stringify({
      source: 'execution-breakpoints-http.test.ts: one scripted breakpoint run read through the real route handlers',
      planId: plan, runId, message, resume: resumeText, before,
      runs: { paused: runs, ended: after },
      steps: { paused, admitted, settled, resumed, ended },
      inspection, exchanges: { admitted: exchangeAdmitted, settled: exchangeSettled },
    }, null, 2)}\n`);
  }
});
