import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { JobService, PublicationWrite } from '../jobs/service.js';
import { copyFixture } from './helpers/fixture.js';
import { crashLock, eventsOnDisk, freeze, openJobs, start, until, validMap } from './helpers/jobs.js';

const plan = 'review-notes';
let fixture: Awaited<ReturnType<typeof copyFixture>>;
const open: JobService[] = [];
beforeEach(async () => { fixture = await copyFixture(); });
afterEach(async () => {
  for (const service of open.splice(0)) await service.close();
  await fixture.remove();
});

const jobDir = (jobId: string) => join(fixture.root, 'plans', plan, '.harness', 'jobs', jobId);
const mapFile = join('plans', plan, 'map', '001.json');

/** Runs a job that freezes after publication write `write`, crashes, and restarts. */
async function crashAfter(write: PublicationWrite, beforeRestart?: (jobId: string) => Promise<void>) {
  let reached!: () => void;
  const frozen = new Promise<void>(resolve => { reached = resolve; });
  const first = await openJobs(fixture.root, [{ kind: 'submit', input: validMap() }], {
    afterPublicationWrite: async current => {
      if (current !== write) return;
      reached();
      await freeze();
    },
  });
  const command = start(plan);
  const receipt = await first.service.execute(command);
  await frozen;
  const before = await eventsOnDisk(fixture.root, plan, receipt.jobId);
  await crashLock(fixture.root);
  await beforeRestart?.(receipt.jobId);
  const second = await openJobs(fixture.root, [{ kind: 'submit', input: validMap() }]);
  open.push(second.service);
  const after = await eventsOnDisk(fixture.root, plan, receipt.jobId);
  return { ...second, jobId: receipt.jobId, command, receipt, before, after, key: `${plan}/${receipt.jobId}` };
}

describe('a restart forced after each publication write recovers as the recovery table states', () => {
  test('after write 1, output/map.json: interrupted, and the output stays unpublished', async () => {
    const { service, recovery, jobId, before, after, key } = await crashAfter(1);
    expect(before.at(-1)!.type).toBe('submission-accepted');
    expect(existsSync(join(jobDir(jobId), 'output', 'map.json'))).toBe(true);
    expect(recovery).toEqual({ interrupted: [key], completed: [], failed: [], skipped: [], approvals: [] });
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toMatchObject({ type: 'job-interrupted', sequence: before.length + 1 });
    expect((after.at(-1)!.data as { message: string }).message).toMatch(/output was not published/);
    expect(service.getJob(plan, jobId)).toMatchObject({ state: 'interrupted', revision: null });
    expect(existsSync(join(fixture.root, mapFile))).toBe(false);
  });

  test('after write 2, map-validated: published from output/map.json, then completed', async () => {
    const { service, recovery, jobId, before, after, key } = await crashAfter(2);
    expect(before.at(-1)!.type).toBe('map-validated');
    expect(existsSync(join(fixture.root, mapFile))).toBe(true);
    expect(await readFile(join(fixture.root, mapFile))).toEqual(await readFile(join(jobDir(jobId), 'output', 'map.json')));
    expect(recovery.completed).toEqual([key]);
    expect(after.map(event => event.type).slice(-2)).toEqual(['map-validated', 'job-completed']);
    expect(service.getJob(plan, jobId)).toMatchObject({ state: 'completed', revision: 1 });
  });

  test('after write 3, the map file: completed', async () => {
    const { service, recovery, jobId, before, after, key } = await crashAfter(3);
    expect(before.at(-1)!.type).toBe('map-validated');
    expect(recovery.completed).toEqual([key]);
    expect(after.at(-1)).toMatchObject({ type: 'job-completed', data: { revision: 1 } });
    expect(service.getJob(plan, jobId)).toMatchObject({ state: 'completed', revision: 1 });
  });

  test('after write 4, job-completed: nothing to recover', async () => {
    const { service, recovery, jobId, before, after } = await crashAfter(4);
    expect(before.at(-1)!.type).toBe('job-completed');
    expect(recovery).toEqual({ interrupted: [], completed: [], failed: [], skipped: [], approvals: [] });
    expect(after).toEqual(before);
    expect(service.getJob(plan, jobId)!.state).toBe('completed');
  });

  test('a reserved revision whose file has a different hash fails the job and leaves the file alone', async () => {
    const other = '{"not":"this job\'s map"}\n';
    const { service, recovery, jobId, key } = await crashAfter(2, async () => {
      await mkdir(join(fixture.root, 'plans', plan, 'map'), { recursive: true });
      await writeFile(join(fixture.root, mapFile), other);
    });
    expect(recovery.failed).toEqual([key]);
    expect(service.getJob(plan, jobId)).toMatchObject({ state: 'failed', failure: { reason: 'revision-conflict' } });
    expect(await readFile(join(fixture.root, mapFile), 'utf8')).toBe(other);
  });

  test('a retried command returns its receipt after the restart', async () => {
    const { service, command, receipt } = await crashAfter(2);
    expect(await service.execute(command)).toEqual(receipt);
  });
});

describe('restart recovery of other jobs', () => {
  async function crashWhileRunning(damage?: (jobId: string) => Promise<void>) {
    const first = await openJobs(fixture.root, [{ kind: 'hang' }]);
    const receipt = await first.service.execute(start(plan));
    await crashLock(fixture.root);
    await damage?.(receipt.jobId);
    const second = await openJobs(fixture.root, []);
    open.push(second.service);
    return { ...second, jobId: receipt.jobId };
  }

  test('a running job is marked interrupted, and another job can start', async () => {
    const { service, recovery, jobId } = await crashWhileRunning();
    expect(recovery.interrupted).toEqual([`${plan}/${jobId}`]);
    const job = service.getJob(plan, jobId)!;
    expect(job.state).toBe('interrupted');
    expect(await service.mappingState(plan)).toEqual({ state: 'interrupted', jobId, latestRevision: null });
    await service.execute(start(plan));
  });

  test('a trailing partial line is discarded before the interruption is appended', async () => {
    const { jobId } = await crashWhileRunning(async id => {
      await appendFile(join(jobDir(id), 'events.jsonl'), '{"sequence":2,"jobId":');
    });
    const text = await readFile(join(jobDir(jobId), 'events.jsonl'), 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect((await eventsOnDisk(fixture.root, plan, jobId)).map(event => [event.sequence, event.type])).toEqual([[1, 'job-started'], [2, 'job-interrupted']]);
  });

  test('a job with its manifest but no event is marked interrupted', async () => {
    const { service, jobId } = await crashWhileRunning(async id => { await truncate(join(jobDir(id), 'events.jsonl'), 0); });
    expect(service.getJob(plan, jobId)).toMatchObject({ state: 'interrupted', version: 1 });
  });

  test('a log where an event other than one approval follows the terminal event is not loaded', async () => {
    const first = await openJobs(fixture.root, [{ kind: 'submit', input: validMap() }]);
    const receipt = await first.service.execute(start(plan));
    await first.service.settled(plan, receipt.jobId);
    await first.service.close();
    const events = await eventsOnDisk(fixture.root, plan, receipt.jobId);
    const last = events.at(-1)!;
    expect(last.type).toBe('job-completed');
    await appendFile(join(jobDir(receipt.jobId), 'events.jsonl'), `${JSON.stringify({ sequence: last.sequence + 1, jobId: receipt.jobId, at: last.at, type: 'job-interrupted', data: { message: 'm' } })}\n`);

    const second = await openJobs(fixture.root, []);
    open.push(second.service);
    expect(second.recovery.skipped).toEqual([`${plan}/${receipt.jobId}`]);
    expect(second.warnings[0]).toMatch(/the job has ended; job-interrupted cannot follow job-completed/);
  });

  test('a directory without job.json is not a job', async () => {
    await mkdir(join(fixture.root, 'plans', plan, '.harness', 'jobs', '20260101T000000Z-abcdef', 'input'), { recursive: true });
    const { service, recovery, warnings } = await openJobs(fixture.root, []);
    open.push(service);
    expect(recovery.skipped).toEqual([`${plan}/20260101T000000Z-abcdef`]);
    expect(warnings[0]).toMatch(/no job\.json/);
    expect(service.listJobs(plan)).toEqual([]);
  });

  test('closing the harness leaves a running job for the next start to interrupt', async () => {
    const first = await openJobs(fixture.root, [{ kind: 'wait', ms: 60_000 }]);
    const receipt = await first.service.execute(start(plan));
    await first.service.close();
    await until(() => !existsSync(join(fixture.root, 'plans', '.harness', 'lock')));
    const second = await openJobs(fixture.root, []);
    open.push(second.service);
    expect(second.service.getJob(plan, receipt.jobId)!.state).toBe('interrupted');
  });
});
