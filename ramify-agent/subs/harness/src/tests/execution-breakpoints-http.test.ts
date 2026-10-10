import { afterEach, expect, test } from 'vitest';
import { createApp } from '../http/app.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { debugStateResponseSchema, debugExchangeResponseSchema, debugInspectionResponseSchema, startRunCommandSchema } from '../interfaces/protocol/runs.js';
import { analysis, entry } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { assign, byRole, completionProposed, outline, submit, treeInputs } from './helpers/iterations.js';
import { installTestRunner, startRun, until } from './helpers/runs.js';
import { openUnchangedRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import type { Request, Response } from 'express';

const plan = 'review-notes', module = 'collection-review/workspace/reviews';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); assertUnchangedGit(); });

async function host() {
  const fixture = await copyFixture(); cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  let release: () => void = () => {};
  const held = new Promise<void>(done => { release = done; });
  const opened = await openUnchangedRuns(fixture.root, { inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit(plan)],
    script: byRole({ 'initial-architect': [submit(analysis([entry('review-note', module)]))],
      'local-architect': [submit(assign(module, {}, outline())), submit(assign(module))],
      engineer: [[{ kind: 'await', until: () => held }, { kind: 'message', text: 'I understand the normal task.' }, { kind: 'end', message: 'I understand the normal task.' }], submit(completionProposed())] }) });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRunCommandSchema.parse({ ...startRun(plan, 'scripted', 'start-http'),
    payload: { planId: plan, agent: 'scripted', breakpoint: 'before-agent:engineer' } }));
  await until(() => opened.service.debugState(plan, receipt.jobId)?.state === 'paused');
  const app = createApp({ projectRoot: fixture.root, runs: opened.service });
  // Call the real final route handler directly: no process or network substitute is claimed as native HTTP evidence.
  const handle = async (method: 'get' | 'post', path: string, body?: unknown) => {
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
