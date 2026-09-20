import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import {
  commandResponseSchema,
  eventPageSchema,
  jobListResponseSchema,
  jobResponseSchema,
  type Command,
} from '../interfaces/protocol/jobs.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { planResponseSchema } from '../interfaces/protocol/queries.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { startServer, type RunningServer } from '../http/server.js';
import { copyFixture } from './helpers/fixture.js';
import { shapeOnlyProcedure } from './helpers/procedures.js';
import { eventsOnDisk, start, stop, until, validMap } from './helpers/jobs.js';

// A plain Node client: `fetch` and the protocol's schemas, nothing from the web client.
async function get(server: RunningServer, path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server.url}${path}`);
  return { status: response.status, body: await response.json() };
}

async function send(server: RunningServer, command: Command | unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server.url}${protocolPaths.commands}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof command === 'string' ? command : JSON.stringify(command),
  });
  return { status: response.status, body: await response.json() };
}

const plan = 'revision-diff';
let fixture: Awaited<ReturnType<typeof copyFixture>>;
let server: RunningServer | undefined;
beforeEach(async () => { fixture = await copyFixture(); });
afterEach(async () => {
  await server?.close();
  server = undefined;
  await fixture.remove();
});

describe('mapping jobs over HTTP', () => {
  test('a job completes with no client connected; a client attached afterwards reads the same job', async () => {
    const agent = createScriptedAgent([
      { kind: 'wait', ms: 30 },
      { kind: 'tool', tool: 'read', input: { path: 'module.ramify' } },
      { kind: 'message', text: 'Submitting', usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 } },
      { kind: 'submit', input: validMap() },
    ]);
    server = await startServer({ projectRoot: fixture.root, port: 0, agent, jobs: { procedure: shapeOnlyProcedure } });
    const accepted = await send(server, start(plan, 'http-start'));
    expect(accepted.status).toBe(202);
    const { receipt } = commandResponseSchema.parse(accepted.body);

    // No client asks anything while the job runs; only the file system is watched.
    await until(() => existsSync(join(fixture.root, 'plans', plan, 'map', '001.json')));
    await until(async () => (await eventsOnDisk(fixture.root, plan, receipt.jobId)).at(-1)?.type === 'job-completed');

    const onDisk = await eventsOnDisk(fixture.root, plan, receipt.jobId);
    const job = jobResponseSchema.parse((await get(server, protocolPaths.job(plan, receipt.jobId))).body).job;
    expect(job).toMatchObject({ jobId: receipt.jobId, planId: plan, state: 'completed', version: onDisk.length, revision: 1 });
    const page = eventPageSchema.parse((await get(server, protocolPaths.events(plan, receipt.jobId))).body);
    expect(page.events).toEqual(onDisk);
    expect(page.job).toEqual(job);
    expect([page.cursor, page.more]).toEqual([onDisk.length, false]);
    const tail = eventPageSchema.parse((await get(server, protocolPaths.events(plan, receipt.jobId, onDisk.length - 2))).body);
    expect(tail.events.map(event => event.type)).toEqual(['map-validated', 'job-completed']);
    const list = jobListResponseSchema.parse((await get(server, protocolPaths.jobs(plan))).body);
    expect(list.jobs).toEqual([job]);
    const planAnswer = planResponseSchema.parse((await get(server, protocolPaths.plan(plan))).body);
    expect(planAnswer.plan.mapping).toEqual({ state: 'completed', jobId: receipt.jobId, latestRevision: 1 });

    // The same answers after a restart of the harness.
    await server.close();
    server = await startServer({ projectRoot: fixture.root, port: 0 });
    expect(jobResponseSchema.parse((await get(server, protocolPaths.job(plan, receipt.jobId))).body).job).toEqual(job);
    expect(eventPageSchema.parse((await get(server, protocolPaths.events(plan, receipt.jobId))).body).events).toEqual(onDisk);
  });

  test('command rules and errors carry their protocol codes', async () => {
    server = await startServer({ projectRoot: fixture.root, port: 0, agent: createScriptedAgent([{ kind: 'message', text: 'm' }, { kind: 'wait', ms: 60_000 }]), jobs: { procedure: shapeOnlyProcedure } });
    const command = start(plan, 'c1');
    const first = commandResponseSchema.parse((await send(server, command)).body).receipt;
    await until(async () => jobResponseSchema.parse((await get(server!, protocolPaths.job(plan, first.jobId))).body).job.version === 2);

    const retry = await send(server, command);
    expect([retry.status, commandResponseSchema.parse(retry.body).receipt]).toEqual([202, first]);

    const cases: Array<[unknown, number, string, number | undefined]> = [
      [{ ...command, payload: { planId: 'review-notes' } }, 409, 'conflict', undefined],
      [stop(plan, first.jobId, 1), 409, 'stale-version', 2],
      [start('review-notes'), 409, 'busy', undefined],
      [stop(plan, 'no-such-job', 0), 404, 'not-found', undefined],
      [{ commandId: 'x', expectedVersion: 0, type: 'explode', payload: {} }, 400, 'invalid-request', undefined],
      ['{not json', 400, 'invalid-request', undefined],
      [{ commandId: 'a', expectedVersion: 2, type: 'approve-map', payload: { planId: plan, jobId: first.jobId, revision: 1 } }, 409, 'conflict', undefined],
    ];
    for (const [body, status, code, currentVersion] of cases) {
      const answer = await send(server, body);
      const error = errorResponseSchema.parse(answer.body).error;
      expect([answer.status, error.code, error.currentVersion]).toEqual([status, code, currentVersion]);
    }

    const stopped = await send(server, stop(plan, first.jobId, 2));
    expect(stopped.status).toBe(202);
    await until(async () => jobResponseSchema.parse((await get(server!, protocolPaths.job(plan, first.jobId))).body).job.state === 'stopped');
    expect(errorResponseSchema.parse((await get(server, protocolPaths.events(plan, first.jobId).replace('after=0', 'after=x'))).body).error.code).toBe('invalid-request');
    expect((await get(server, protocolPaths.job(plan, 'missing'))).status).toBe(404);
  });

  test('without an agent a start is unavailable', async () => {
    server = await startServer({ projectRoot: fixture.root, port: 0 });
    expect(server.agent).toBeUndefined();
    const answer = await send(server, start(plan));
    expect([answer.status, errorResponseSchema.parse(answer.body).error.code]).toEqual([503, 'unavailable']);
  });

  test('a second harness on the same project is refused while the first runs', async () => {
    server = await startServer({ projectRoot: fixture.root, port: 0 });
    await expect(startServer({ projectRoot: fixture.root, port: 0 })).rejects.toThrow(/holds the project lock/);
  });
});
