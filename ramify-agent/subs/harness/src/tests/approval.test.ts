import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { mapApprovalSchema } from '../interfaces/map.js';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import { commandResponseSchema, type Command } from '../interfaces/protocol/jobs.js';
import { moduleTreeResponseSchema, revisionListResponseSchema, revisionResponseSchema } from '../interfaces/protocol/maps.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { startServer, type RunningServer } from '../http/server.js';
import { CommandRejection, type JobService } from '../jobs/service.js';
import { architectProcedure } from '../mapping/architect.js';
import { privateRamify } from '../mapping/ramify-cli.js';
import { readArchitectMeta } from '../mapping/views.js';
import { copyFixture } from './helpers/fixture.js';
import { eventsOnDisk, openJobs, start, until, validMap } from './helpers/jobs.js';

/*
 * Approval on real evidence: the architect procedure materializes the
 * fixture's views through the `ramify` CLI, with a daemon of this file's own,
 * the scripted fake saves a map, and the map is approved or refused as stale.
 */

const plan = 'review-notes';
const approvalPath = (root: string, revision = 1) => join(root, 'plans', plan, 'map', `${String(revision).padStart(3, '0')}.approval.json`);
const mapPath = (root: string, revision = 1) => join(root, 'plans', plan, 'map', `${String(revision).padStart(3, '0')}.json`);
const sha256 = (content: Uint8Array | string) => createHash('sha256').update(content).digest('hex');

let ramify: Awaited<ReturnType<typeof privateRamify>>;
beforeAll(async () => { ramify = await privateRamify(); });
afterAll(async () => { await ramify.dispose(); });

let fixture: Awaited<ReturnType<typeof copyFixture>>;
const services: JobService[] = [];
beforeEach(async () => { fixture = await copyFixture(); });
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  await fixture.remove();
});

async function open() {
  const opened = await openJobs(fixture.root, [{ kind: 'submit', input: validMap() }], {
    procedure: architectProcedure({ ramify: ramify.ramify, freshContextPerJob: true }),
  });
  services.push(opened.service);
  return opened;
}

/** A service with one completed job that saved revision 1. */
async function mapped() {
  const opened = await open();
  const receipt = await opened.service.execute(start(plan));
  await opened.service.settled(plan, receipt.jobId);
  const job = opened.service.getJob(plan, receipt.jobId)!;
  expect(job).toMatchObject({ state: 'completed', revision: 1 });
  return { ...opened, job };
}

let count = 0;
function approve(jobId: string, expectedVersion: number, revision = 1, commandId = `approve-${++count}`): Extract<Command, { type: 'approve-map' }> {
  return { commandId, expectedVersion, type: 'approve-map', payload: { planId: plan, jobId, revision } };
}

async function rejection(promise: Promise<unknown>): Promise<CommandRejection> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandRejection) return error;
    throw error;
  }
  throw new Error('The command was accepted');
}

async function manifestOf(jobId: string) {
  const record = JSON.parse(await readFile(join(fixture.root, 'plans', plan, '.harness', 'jobs', jobId, 'job.json'), 'utf8'));
  return record.manifest as { planHash: string; architectView: { input: string } };
}

describe('approving a saved map', () => {
  test('writes the approval record once, with the map hash and the manifest\'s identities, and leaves the input identity unchanged', async () => {
    const { service, job } = await mapped();
    const receipt = await service.execute(approve(job.jobId, job.version));
    expect(receipt).toMatchObject({ jobId: job.jobId, sequence: job.version + 1 });

    const manifest = await manifestOf(job.jobId);
    const record = mapApprovalSchema.parse(JSON.parse(await readFile(approvalPath(fixture.root), 'utf8')));
    expect(record).toEqual({
      schema: 'ramify-agent.map-approval/1',
      planId: plan,
      revision: 1,
      mapHash: sha256(await readFile(mapPath(fixture.root))),
      planHash: manifest.planHash,
      input: manifest.architectView.input,
      approvedAt: receipt.acceptedAt,
    });

    // The event records the command and the approval; the job stays completed.
    const events = await eventsOnDisk(fixture.root, plan, job.jobId);
    expect(events.map(event => event.type).slice(-2)).toEqual(['job-completed', 'map-approved']);
    expect(events.at(-1)).toMatchObject({ data: { approval: record, command: { receipt } } });
    expect(service.getJob(plan, job.jobId)).toMatchObject({ state: 'completed', version: job.version + 1, revision: 1 });

    // Writing the record changed nothing Ramify observes.
    const materialized = await ramify.ramify.materialize(fixture.root);
    expect(materialized.ok).toBe(true);
    expect((await readArchitectMeta(fixture.root)).input).toBe(manifest.architectView.input);
  }, 120_000);

  test('an identical retry returns the original receipt, and no command approves the revision a second time', async () => {
    const { service, job } = await mapped();
    const command = approve(job.jobId, job.version, 1, 'approve-once');
    const receipt = await service.execute(command);
    const written = await readFile(approvalPath(fixture.root), 'utf8');

    expect(await service.execute(command)).toEqual(receipt);
    const again = await rejection(service.execute(approve(job.jobId, job.version + 1)));
    expect(again.code).toBe('conflict');
    expect(again.message).toMatch(/^Revision 1 was already approved at /);
    const reused = await rejection(service.execute({ ...command, payload: { ...command.payload, revision: 2 } }));
    expect(reused.code).toBe('conflict');
    const stale = await rejection(service.execute(approve(job.jobId, job.version)));
    expect(stale).toMatchObject({ code: 'stale-version', currentVersion: job.version + 1 });

    expect(await readFile(approvalPath(fixture.root), 'utf8')).toBe(written);
    expect((await eventsOnDisk(fixture.root, plan, job.jobId)).filter(event => event.type === 'map-approved')).toHaveLength(1);
  }, 120_000);

  test('is refused as stale after the plan changed, and writes nothing', async () => {
    const { service, job } = await mapped();
    await appendFile(join(fixture.root, 'plans', plan, 'plan.md'), '\nOne more requirement.\n');
    const refused = await rejection(service.execute(approve(job.jobId, job.version)));
    expect(refused.code).toBe('inputs-changed');
    expect(refused.message).toContain(`plans/${plan}/plan.md changed since the map was made`);
    // A plan edit is also a change of the project's files, so the input identity differs too.
    expect(refused.message).toMatch(/input identity is now input\/1:\w+, not input\/1:\w+/);
    expect(existsSync(approvalPath(fixture.root))).toBe(false);
    expect(service.getJob(plan, job.jobId)?.version).toBe(job.version);
  }, 120_000);

  test('is refused as stale after the source changed, and writes nothing', async () => {
    const { service, job } = await mapped();
    await appendFile(join(fixture.root, 'subs/workspace/subs/contracts/src/interfaces/vocabulary.ts'), '\n// changed after mapping\n');
    const refused = await rejection(service.execute(approve(job.jobId, job.version)));
    expect(refused.code).toBe('inputs-changed');
    expect(refused.message).not.toContain('plan.md');
    expect(refused.message).toMatch(/input identity is now input\/1:\w+, not input\/1:\w+: the project's source or layout changed since the map was made/);
    expect(existsSync(approvalPath(fixture.root))).toBe(false);
    expect((await eventsOnDisk(fixture.root, plan, job.jobId)).some(event => event.type === 'map-approved')).toBe(false);
  }, 120_000);

  test('names only a revision its job saved, and only a map file its job wrote', async () => {
    const { service, job } = await mapped();
    expect((await rejection(service.execute(approve(job.jobId, job.version, 2)))).message).toBe(`Job ${job.jobId} saved revision 1, not 2`);
    expect((await rejection(service.execute(approve('20260101T000000Z-000000', 0)))).code).toBe('not-found');
    await appendFile(mapPath(fixture.root), ' ');
    const edited = await rejection(service.execute(approve(job.jobId, job.version)));
    expect(edited.message).toBe(`plans/${plan}/map/001.json is not the map the job saved`);
    expect(existsSync(approvalPath(fixture.root))).toBe(false);
  }, 120_000);

  test('a restart writes the record of an approval whose event was written before a crash', async () => {
    const { service, job } = await mapped();
    const command = approve(job.jobId, job.version, 1, 'approve-before-crash');
    const receipt = await service.execute(command);
    const written = await readFile(approvalPath(fixture.root), 'utf8');
    services.splice(0);
    await service.close();
    await rm(approvalPath(fixture.root));

    const reopened = await open();
    expect(reopened.recovery.approvals).toEqual([`${plan}/${job.jobId}: revision 1`]);
    expect(await readFile(approvalPath(fixture.root), 'utf8')).toBe(written);
    expect(await reopened.service.execute(command)).toEqual(receipt);
  }, 120_000);
});

describe('maps over HTTP', () => {
  let server: RunningServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  async function get(path: string): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${server!.url}${path}`);
    return { status: response.status, body: await response.json() };
  }

  async function send(command: Command): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${server!.url}${protocolPaths.commands}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command),
    });
    return { status: response.status, body: await response.json() };
  }

  test('lists revisions, reads one with its approval, serves the module tree, and approves', async () => {
    server = await startServer({
      projectRoot: fixture.root, port: 0, ramify: ramify.ramify,
      agent: createScriptedAgent([{ kind: 'submit', input: validMap() }]),
    });
    // Before the first job, the architect view has never been materialized.
    expect(moduleTreeResponseSchema.parse((await get(protocolPaths.modules)).body).tree.status).toBe('unavailable');
    const { receipt } = commandResponseSchema.parse((await send(start(plan, 'http-approval-start'))).body);
    await until(async () => (await eventsOnDisk(fixture.root, plan, receipt.jobId)).at(-1)?.type === 'job-completed', 60_000);

    const listed = revisionListResponseSchema.parse((await get(protocolPaths.maps(plan))).body);
    expect(listed.revisions).toEqual([{
      status: 'readable', revision: 1, path: `plans/${plan}/map/001.json`, jobId: receipt.jobId,
      mapHash: sha256(await readFile(mapPath(fixture.root))), approval: null,
    }]);
    const read = revisionResponseSchema.parse((await get(protocolPaths.map(plan, 1))).body);
    expect(read.revision.map.identity).toMatchObject({ planId: plan, revision: 1, jobId: receipt.jobId, manifest: { architectView: { status: 'materialized' } } });
    expect(read.revision.approval).toBeNull();

    const tree = moduleTreeResponseSchema.parse((await get(protocolPaths.modules)).body).tree;
    expect(tree.status).toBe('available');
    if (tree.status === 'available') {
      expect(tree.modules).toHaveLength(15);
      expect(tree.modules.find(entry => entry.parent === null)).toEqual({ module: 'collection-review', dir: '', parent: null });
      expect(tree.input).toBe((read.revision.map.identity.manifest.architectView as { input: string }).input);
    }

    const job = (await get(protocolPaths.job(plan, receipt.jobId))).body as { job: { version: number } };
    const approved = await send(approve(receipt.jobId, job.job.version, 1, 'http-approve'));
    expect(approved.status).toBe(202);
    const after = revisionListResponseSchema.parse((await get(protocolPaths.maps(plan))).body).revisions[0]!;
    expect(after.status === 'readable' && after.approval?.revision).toBe(1);

    const again = await send(approve(receipt.jobId, job.job.version + 1));
    expect(again.status).toBe(409);
    expect(errorResponseSchema.parse(again.body).error.code).toBe('conflict');
    expect((await get(protocolPaths.map(plan, 2))).status).toBe(404);
    expect((await get(`${protocolPaths.maps(plan)}/first`)).status).toBe(400);
    expect((await get(protocolPaths.maps('no-such-plan'))).status).toBe(404);
  }, 120_000);

  test('a stale approval is answered 409 inputs-changed', async () => {
    server = await startServer({
      projectRoot: fixture.root, port: 0, ramify: ramify.ramify,
      agent: createScriptedAgent([{ kind: 'submit', input: validMap() }]),
    });
    const { receipt } = commandResponseSchema.parse((await send(start(plan, 'http-stale-start'))).body);
    await until(async () => (await eventsOnDisk(fixture.root, plan, receipt.jobId)).at(-1)?.type === 'job-completed', 60_000);
    await appendFile(join(fixture.root, 'plans', plan, 'plan.md'), '\nChanged.\n');
    const job = (await get(protocolPaths.job(plan, receipt.jobId))).body as { job: { version: number } };
    const refused = await send(approve(receipt.jobId, job.job.version));
    expect(refused.status).toBe(409);
    expect(errorResponseSchema.parse(refused.body).error.code).toBe('inputs-changed');
  }, 120_000);
});
