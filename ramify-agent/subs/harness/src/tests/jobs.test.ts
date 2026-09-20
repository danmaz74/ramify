import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { implementationMapSchema } from '../interfaces/map.js';
import type { Receipt } from '../interfaces/protocol/jobs.js';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';
import { CommandRejection, type JobService } from '../jobs/service.js';
import { copyFixture } from './helpers/fixture.js';
import { eventsOnDisk, openJobs, start, stop, validMap } from './helpers/jobs.js';

const plan = 'review-notes';
const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');

let fixture: Awaited<ReturnType<typeof copyFixture>>;
const services: JobService[] = [];
beforeEach(async () => { fixture = await copyFixture(); });
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  await fixture.remove();
});

async function open(script?: Parameters<typeof openJobs>[1], options?: Parameters<typeof openJobs>[2]) {
  const opened = await openJobs(fixture.root, script, options);
  services.push(opened.service);
  return opened;
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

const jobDir = (jobId: string) => join(fixture.root, 'plans', plan, '.harness', 'jobs', jobId);

describe('a mapping job on the scripted fake', () => {
  test('completes, writing the manifest and captured plan before its first event, and saves revision 1', async () => {
    const seenAtStart: string[] = [];
    const script = (spec: { sessionDirectory: string }): ScriptStep[] => {
      const directory = join(spec.sessionDirectory, '..');
      for (const name of ['job.json', 'input/plan.md']) if (existsSync(join(directory, name))) seenAtStart.push(name);
      seenAtStart.push(...readFileLines(join(directory, 'events.jsonl')).map(line => (JSON.parse(line) as { type: string }).type));
      return [
        { kind: 'tool', tool: 'read', input: { path: 'module.ramify' } },
        { kind: 'tool', tool: 'grep', input: { pattern: 'expose-sub', path: 'subs' } },
        { kind: 'message', text: 'Mapping', usage: { input: 100, output: 20, cacheRead: 5, cacheWrite: 0, total: 125 } },
        { kind: 'submit', input: validMap() },
      ];
    };
    const { service, agent } = await open(script);
    const receipt = await service.execute(start(plan, 'c-start'));
    expect(receipt).toMatchObject({ commandId: 'c-start', sequence: 1 });
    await service.settled(plan, receipt.jobId);

    expect(seenAtStart).toEqual(['job.json', 'input/plan.md', 'job-started']);
    const job = service.getJob(plan, receipt.jobId)!;
    expect(job).toMatchObject({
      state: 'completed', revision: 1, failure: null, agent: 'scripted', stopRequested: false,
      totals: { filesRead: 1, searches: 1, rejectedSubmissions: 0, usage: { input: 100, output: 20, cacheRead: 5, total: 125 } },
    });
    const events = await eventsOnDisk(fixture.root, plan, receipt.jobId);
    expect(events.map(event => event.type)).toEqual([
      'job-started', 'activity', 'activity', 'activity', 'activity', 'submission-accepted', 'map-validated', 'job-completed',
    ]);
    expect(events.map(event => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(job.version).toBe(8);
    expect(events[1]!.data).toEqual({ activity: { kind: 'read', callId: 'call-1', path: 'module.ramify' } });
    expect(events[2]!.data).toEqual({ activity: { kind: 'search', callId: 'call-2', tool: 'grep', query: 'expose-sub in subs' } });

    const planBytes = await readFile(join(fixture.root, 'plans', plan, 'plan.md'));
    const record = JSON.parse(await readFile(join(jobDir(receipt.jobId), 'job.json'), 'utf8'));
    expect(record).toMatchObject({ jobId: receipt.jobId, planId: plan, agent: 'scripted', manifest: { planHash: sha256(planBytes), source: null, architectView: { status: 'placeholder' } } });
    expect(await readFile(join(jobDir(receipt.jobId), 'input', 'plan.md'))).toEqual(planBytes);

    const saved = await readFile(join(fixture.root, 'plans', plan, 'map', '001.json'));
    expect(await readFile(join(jobDir(receipt.jobId), 'output', 'map.json'))).toEqual(saved);
    const map = implementationMapSchema.parse(JSON.parse(saved.toString('utf8')));
    expect(map.identity).toMatchObject({ planId: plan, revision: 1, jobId: receipt.jobId, manifest: record.manifest });
    expect(events.at(-1)!.data).toEqual({ revision: 1, mapHash: sha256(saved) });
    expect(await service.mappingState(plan)).toEqual({ state: 'completed', jobId: receipt.jobId, latestRevision: 1 });

    const spec = agent!.sessions[0]!.spec;
    expect(spec).toMatchObject({ role: 'architect', scope: { workingDirectory: fixture.root }, builtinTools: ['read', 'grep', 'ls'] });
    expect(spec.submission.name).toBe('submit_implementation_map');
    expect(spec.prompt).toContain(planBytes.toString('utf8'));
  });

  test('a later job saves the next revision, one above the highest saved', async () => {
    const { service } = await open([{ kind: 'submit', input: validMap() }]);
    await mkdir(join(fixture.root, 'plans', plan, 'map'), { recursive: true });
    await writeFile(join(fixture.root, 'plans', plan, 'map', '005.json'), '{}\n');
    await writeFile(join(fixture.root, 'plans', plan, 'map', '009.approval.json'), '{}\n');
    const first = await service.execute(start(plan));
    await service.settled(plan, first.jobId);
    const second = await service.execute(start(plan));
    await service.settled(plan, second.jobId);
    expect(service.getJob(plan, first.jobId)!.revision).toBe(6);
    expect(service.getJob(plan, second.jobId)!.revision).toBe(7);
    expect(service.listJobs(plan).map(job => job.jobId)).toEqual([second.jobId, first.jobId]);
  });
});

describe('commands', () => {
  test('an identical retry returns the original receipt, whatever the version now is', async () => {
    const { service } = await open([{ kind: 'submit', input: validMap() }]);
    const command = start(plan, 'same-id');
    const receipt = await service.execute(command);
    await service.settled(plan, receipt.jobId);
    expect(service.getJob(plan, receipt.jobId)!.version).toBeGreaterThan(1);
    expect(await service.execute({ ...command })).toEqual(receipt);
    expect(service.listJobs(plan)).toHaveLength(1);
  });

  test('a reused ID with different content conflicts', async () => {
    const { service } = await open([{ kind: 'wait', ms: 60_000 }]);
    const receipt = await service.execute(start(plan, 'reused'));
    const other = await rejection(service.execute(start('revision-diff', 'reused')));
    expect(other.code).toBe('conflict');
    const asStop = await rejection(service.execute(stop(plan, receipt.jobId, 1, 'reused')));
    expect(asStop.code).toBe('conflict');
    expect(service.getJob(plan, receipt.jobId)!.state).toBe('running');
  });

  test('a new command with a stale expected version is rejected with the current version', async () => {
    const { service } = await open([{ kind: 'message', text: 'working' }, { kind: 'wait', ms: 60_000 }]);
    const receipt = await service.execute(start(plan));
    await new Promise(resolve => setTimeout(resolve, 20));
    const version = service.getJob(plan, receipt.jobId)!.version;
    expect(version).toBe(2);
    const stale = await rejection(service.execute(stop(plan, receipt.jobId, 1)));
    expect([stale.code, stale.currentVersion]).toEqual(['stale-version', 2]);
    const staleStart = await rejection(service.execute({ ...start(plan), expectedVersion: 3 }));
    expect([staleStart.code, staleStart.currentVersion]).toEqual(['stale-version', 0]);
    expect(service.getJob(plan, receipt.jobId)!.stopRequested).toBe(false);
  });

  test('one job at a time, and the refusals of a start', async () => {
    const { service } = await open([{ kind: 'wait', ms: 60_000 }]);
    await service.execute(start(plan));
    expect((await rejection(service.execute(start('revision-diff')))).code).toBe('busy');
  });

  test('a start without an agent, for an unknown plan, and an approval of an unknown job are refused', async () => {
    const { service } = await open();
    expect((await rejection(service.execute(start(plan)))).code).toBe('unavailable');
    await service.close();
    services.splice(0);
    const withAgent = (await open([])).service;
    expect((await rejection(withAgent.execute(start('no-such-plan')))).code).toBe('not-found');
    const approve = await rejection(withAgent.execute({ commandId: 'a', expectedVersion: 1, type: 'approve-map', payload: { planId: plan, jobId: 'j', revision: 1 } }));
    expect(approve.code).toBe('not-found');
  });

  test('a map whose manifest names no materialized view cannot be approved', async () => {
    const { service } = await open([{ kind: 'submit', input: validMap() }]);
    const receipt = await service.execute(start(plan));
    await service.settled(plan, receipt.jobId);
    const job = service.getJob(plan, receipt.jobId)!;
    expect(job.state).toBe('completed');
    const approve = await rejection(service.execute({ commandId: 'a', expectedVersion: job.version, type: 'approve-map', payload: { planId: plan, jobId: job.jobId, revision: 1 } }));
    expect(approve.code).toBe('unavailable');
    expect(approve.message).toMatch(/names no materialized architect view/);
  });
});

describe('Stop', () => {
  test('ends a waiting session and marks the job stopped; a retried stop returns its receipt', async () => {
    const { service, agent } = await open([{ kind: 'wait', ms: 60_000 }, { kind: 'submit', input: validMap() }]);
    const receipt = await service.execute(start(plan));
    const command = stop(plan, receipt.jobId, 1, 'stop-1');
    const stopReceipt = await service.execute(command);
    expect(stopReceipt).toMatchObject({ commandId: 'stop-1', jobId: receipt.jobId, sequence: 2 });
    await service.settled(plan, receipt.jobId);
    const job = service.getJob(plan, receipt.jobId)!;
    expect(job).toMatchObject({ state: 'stopped', stopRequested: false, revision: null });
    const events = await eventsOnDisk(fixture.root, plan, receipt.jobId);
    expect(events.map(event => event.type)).toEqual(['job-started', 'stop-requested', 'job-stopped']);
    expect(events[2]!.data).toEqual({ settled: true });
    expect(agent!.sessions[0]!.outcome).toEqual({ kind: 'stopped' });
    expect(await service.execute(command)).toEqual(stopReceipt);
    const late = await rejection(service.execute(stop(plan, receipt.jobId, 3)));
    expect(late.code).toBe('conflict');
  });

  test('is bounded: a session that ignores it is marked stopped after the grace period', async () => {
    const { service } = await open([{ kind: 'hang' }], { stopGraceMs: 50 });
    const receipt = await service.execute(start(plan));
    const started = Date.now();
    await service.execute(stop(plan, receipt.jobId, 1));
    await service.settled(plan, receipt.jobId);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(service.getJob(plan, receipt.jobId)).toMatchObject({ state: 'stopped' });
    expect((await eventsOnDisk(fixture.root, plan, receipt.jobId)).at(-1)!.data).toEqual({ settled: false });
    // The stopped job no longer blocks the project.
    await service.execute(start('revision-diff'));
  });

  test('discards a submission made after Stop', async () => {
    const { service, agent } = await open([
      { kind: 'message', text: 'about to stall' },
      { kind: 'stall', ms: 100, thenIgnoreStop: true },
      { kind: 'message', text: 'late' },
      { kind: 'submit', input: validMap() },
    ], { stopGraceMs: 1000 });
    const receipt = await service.execute(start(plan));
    await new Promise(resolve => setTimeout(resolve, 20));
    await service.execute(stop(plan, receipt.jobId, 2));
    await service.settled(plan, receipt.jobId);
    expect(agent!.sessions[0]!.verdicts).toEqual([{ accepted: false, final: true, errors: ['This job accepts no further submissions'] }]);
    expect(service.getJob(plan, receipt.jobId)).toMatchObject({ state: 'stopped', revision: null });
    const types = (await eventsOnDisk(fixture.root, plan, receipt.jobId)).map(event => event.type);
    expect(types).toEqual(['job-started', 'activity', 'stop-requested', 'job-stopped']);
    expect(existsSync(join(fixture.root, 'plans', plan, 'map', '001.json'))).toBe(false);
    expect(existsSync(join(jobDir(receipt.jobId), 'output', 'map.json'))).toBe(false);
  });
});

describe('failures', () => {
  async function runToEnd(script: ScriptStep[]) {
    const { service, agent } = await open(script);
    const receipt: Receipt = await service.execute(start(plan));
    await service.settled(plan, receipt.jobId);
    return { job: service.getJob(plan, receipt.jobId)!, events: await eventsOnDisk(fixture.root, plan, receipt.jobId), agent: agent! };
  }

  test('a crashed session fails the job', async () => {
    const { job } = await runToEnd([{ kind: 'fail', error: 'provider error' }]);
    expect(job).toMatchObject({ state: 'failed', failure: { reason: 'agent-failed', message: 'The agent session failed: provider error' } });
  });

  test('a closing message is never a result', async () => {
    const { job } = await runToEnd([{ kind: 'message', text: 'Here is the map: ...' }, { kind: 'end', message: 'done' }]);
    expect(job).toMatchObject({ state: 'failed', failure: { reason: 'no-submission' } });
  });

  test('an invalid submission is answered with its errors and can be corrected', async () => {
    const { job, events, agent } = await runToEnd([
      { kind: 'submit', input: { summary: 'not a map' } },
      { kind: 'submit', input: validMap() },
    ]);
    expect(job).toMatchObject({ state: 'completed', revision: 1, totals: { rejectedSubmissions: 1 } });
    const verdict = agent.sessions[0]!.verdicts[0] as { accepted: boolean; errors: string[] };
    expect(verdict.accepted).toBe(false);
    expect(verdict.errors.some(error => error.startsWith('summary:'))).toBe(true);
    expect(events.filter(event => event.type.startsWith('submission-')).map(event => [event.type, event.data])).toEqual([
      ['submission-rejected', { attempt: 1, errors: verdict.errors }],
      ['submission-accepted', { attempt: 2 }],
    ]);
  });

  test('after two corrections the job fails with the diagnostics', async () => {
    const { job, events, agent } = await runToEnd([
      { kind: 'submit', input: {} },
      { kind: 'submit', input: {} },
      { kind: 'submit', input: {} },
      { kind: 'submit', input: validMap() },
    ]);
    expect(job).toMatchObject({ state: 'failed', failure: { reason: 'invalid-submission' }, revision: null });
    expect(agent.sessions[0]!.verdicts.map(verdict => 'final' in (verdict as object))).toEqual([false, false, true]);
    expect(events.filter(event => event.type === 'submission-rejected')).toHaveLength(3);
    const failed = events.at(-1)!;
    expect(failed.type).toBe('job-failed');
    expect((failed.data as { diagnostics: string[] }).diagnostics.length).toBeGreaterThan(0);
  });

  test('a plan changed during the job fails it as inputs changed and saves nothing', async () => {
    const { service } = await open([{ kind: 'wait', ms: 100 }, { kind: 'submit', input: validMap() }]);
    const receipt = await service.execute(start(plan));
    await appendFile(join(fixture.root, 'plans', plan, 'plan.md'), '\nOne more requirement.\n');
    await service.settled(plan, receipt.jobId);
    expect(service.getJob(plan, receipt.jobId)).toMatchObject({ state: 'failed', revision: null, failure: { reason: 'inputs-changed' } });
    const failed = (await eventsOnDisk(fixture.root, plan, receipt.jobId)).at(-1)!;
    expect(failed.data).toMatchObject({ diagnostics: ['plans/review-notes/plan.md changed during the job'] });
    expect(existsSync(join(fixture.root, 'plans', plan, 'map', '001.json'))).toBe(false);
    expect(existsSync(join(jobDir(receipt.jobId), 'output', 'map.json'))).toBe(false);
  });
});

function readFileLines(path: string): string[] {
  try {
    return readFileSync(path, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}
