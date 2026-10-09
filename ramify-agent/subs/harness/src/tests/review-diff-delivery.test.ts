import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';
import { exactInputHash, type DeliveredManifest } from '../prompts/delivered-manifest.js';
import type { TaskPacket } from '../prompts/tasks.js';
import { runLayout } from '../run/records.js';
import { snapshotToolNames } from '../reviews/snapshot.js';
import { reviewToolName } from '../reviews/submission.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { completionProposed, submit, write } from './helpers/iterations.js';
import type { ScriptedCandidates } from './helpers/candidates.js';
import { attemptRecord, candidates, eventsOf, gate, limit, notesDirectory, plan, reviewRun, reviewTarget, store, tool } from './helpers/reviews.js';
import { onlyRun, runEventsOnDisk, runPath, stopRun } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const index = `${notesDirectory}/src/index.ts`;
const clean = (...paths: string[]): ScriptStep => ({ kind: 'submit', input: { inspected: paths, missing: [], concerns: [] } });
function engineers(firstStore = 'export const store = new Map(); // v1\n'): (readonly ScriptStep[])[] {
  return [
    submit(completionProposed('Added the note store.'), write(store, firstStore)),
    submit(completionProposed('Stated the note limit.'), write(limit, 'export const limit = (text: string) => text.length <= 50;\n')),
    submit(completionProposed('Exported the store.'), write(store, 'export const store = new Map(); // v3\n'),
      write(index, 'export * from \'./store.js\';\n')),
  ];
}

/** Read the durable original task packet, rather than reconstructing prompt bytes. */
async function originalPacket(root: string, runId: string, invocation: string): Promise<TaskPacket> {
  const identity = exactInputHash(JSON.stringify([runId, invocation]));
  const intent = JSON.parse(await readFile(join(root, 'plans/.harness/session-operations/correlations/operations', `${identity}.json`), 'utf8')) as { packet: TaskPacket };
  return intent.packet;
}

async function expectRecordedDiff(root: string, runId: string, invocation: string) {
  const packet = await originalPacket(root, runId, invocation);
  const diff = packet.additions.filter(entry => entry.key.endsWith('support:candidate-diff'));
  expect(diff).toHaveLength(1);
  const delivered = diff[0]!;
  expect(packet.message.split(delivered.text)).toHaveLength(2);
  const record = JSON.parse(await readFile(runPath(root, plan, runId, runLayout.invocation(invocation)), 'utf8')) as { prompt: { manifest: DeliveredManifest } };
  expect(record.prompt.manifest).toEqual(packet.manifest);
  expect(record.prompt.manifest.entries.filter(entry => entry.key === delivered.key && entry.delivery === 'appended')).toEqual([
    expect.objectContaining({ hash: exactInputHash(delivered.text), bytes: Buffer.byteLength(delivered.text) }),
  ]);
  expect(record.prompt.manifest.currentMessage).toEqual({ hash: exactInputHash(packet.message), bytes: Buffer.byteLength(packet.message) });
  return { packet, diff: delivered.text };
}

/** A candidate producer that cooperates with cancellation but cannot finish on its own. */
function holdFirstPatch(source: ScriptedCandidates, entered: ReturnType<typeof gate>, aborted: ReturnType<typeof gate>) {
  const ordinary = source.diffPatch.bind(source);
  vi.spyOn(source, 'diffPatch').mockImplementation(async (root, base, candidate, path, signal) => {
    if (candidate !== 'revision-01') return ordinary(root, base, candidate, path, signal);
    expect(base).toBe('scenarios-00');
    expect(path).toBe(store);
    expect(signal).toBeDefined();
    source.calls.push(`diffPatch ${candidate} ${path}`);
    entered.open();
    return new Promise<string>((_resolve, reject) => {
      const abort = () => { aborted.open(); reject(signal!.reason); };
      if (signal!.aborted) abort();
      else signal!.addEventListener('abort', abort, { once: true });
    });
  });
}

describe('precollected candidate patches in actual review invocations', () => {
  test('fresh code and forked scope reviews receive complete pinned patches once and can inspect them without fetching tools', async () => {
    const root = await reviewTarget(cleanups);
    const run = await reviewRun(root, cleanups, {
      policy: { kinds: ['code', 'scope'] },
      engineer: engineers(),
      reviewers: {
        'rq-0001': [clean(store)], 'rq-0002': [clean(store)],
        'rq-0003': [clean(limit)], 'rq-0004': [clean(limit)],
        'rq-0005': [clean(store, index)], 'rq-0006': [clean(store, index)],
      },
    });
    expect(onlyRun(run.service, plan).state).toBe('completed');
    expect(eventsOf(run.events, 'review-attempt-finished')).toHaveLength(6);
    expect(eventsOf(run.events, 'review-attempt-finished').every(event => event.data.result === 'complete')).toBe(true);
    const reviewers = run.agent!.sessions.filter(session => session.spec.role === 'reviewer');
    expect(reviewers).toHaveLength(6);
    expect(reviewers.map(session => session.start.mode)).toEqual(expect.arrayContaining(['fresh', 'fork']));
    expect(reviewers.every(session => session.results.every(result => result.tool === reviewToolName))).toBe(true);
    expect(reviewers.every(session => session.verdicts.length === 1)).toBe(true);

    for (const request of ['rq-0001', 'rq-0002']) {
      const attempt = await attemptRecord(root, run.runId, `${request}.a01`);
      const { packet, diff } = await expectRecordedDiff(root, run.runId, attempt.invocation!);
      expect(diff).toContain('Base: scenarios-00; candidate: revision-01.');
      expect(diff).toContain(`--- a/${store}\n+++ b/${store}`);
      expect(diff).toContain('+export export const store = new Map(); // v1');
      expect(packet.message.split('+export export const store = new Map(); // v1')).toHaveLength(2);
      expect(attempt).toMatchObject({ requestedStart: request === 'rq-0001' ? 'fresh' : 'fork', result: { result: 'complete' } });
    }
    expect(run.source.calls).toContain(`diffPatch revision-01 ${store}`);
    run.git.assertComplete();
  }, 60_000);

  test('an oversized candidate delivers a bounded summary, requires per-file evidence, and never injects raw hunks', async () => {
    const root = await reviewTarget(cleanups);
    const large = `export const store = new Map(); // RAW_LARGE_PATCH_${'x'.repeat(210 * 1024)}\n`;
    const commits = candidates();
    commits['revision-01'] = { ...commits['revision-01']!, files: { ...commits['revision-01']!.files, [store]: large } };
    const run = await reviewRun(root, cleanups, {
      commits,
      engineer: engineers(large),
      reviewers: {
        // Merely naming the summarized path does not establish inspection.
        'rq-0001': [clean(store), tool(snapshotToolNames.diff, { path: store }), clean(store)],
        'rq-0002': [clean(limit)], 'rq-0003': [clean(store, index)],
      },
    });
    expect(onlyRun(run.service, plan).state).toBe('completed');
    const attempt = await attemptRecord(root, run.runId, 'rq-0001.a01');
    expect(attempt.result).toMatchObject({ result: 'complete' });
    const { packet, diff } = await expectRecordedDiff(root, run.runId, attempt.invocation!);
    expect(diff).toContain('Base: scenarios-00; candidate: revision-01.');
    expect(diff).toContain('No patches are included');
    expect(diff).toContain(store);
    expect(diff).toContain(snapshotToolNames.diff);
    expect(Buffer.byteLength(diff)).toBeLessThan(2048);
    expect(packet.message).not.toContain('RAW_LARGE_PATCH_');
    expect(packet.message).not.toContain(`--- a/${store}`);
    const reviewer = run.agent!.sessions.find(session => session.spec.role === 'reviewer' && session.spec.prompt.includes('rq-0001'))!;
    expect(reviewer.verdicts).toEqual([
      expect.objectContaining({ accepted: false }), expect.objectContaining({ accepted: true }),
    ]);
    const inspections = reviewer.results.filter(result => result.tool === snapshotToolNames.diff);
    expect(inspections).toHaveLength(1);
    expect(inspections[0]).toMatchObject({ tool: snapshotToolNames.diff, isError: false, text: expect.stringContaining('RAW_LARGE_PATCH_') });
    expect(run.source.calls.filter(call => call.startsWith('diffPatch revision-01'))).toEqual([
      `diffPatch revision-01 ${store}`, `diffPatch revision-01 ${store}`,
    ]);
    run.git.assertComplete();
  }, 60_000);

  test('a failed patch collection records unavailable evidence before any reviewer starts for that candidate', async () => {
    const root = await reviewTarget(cleanups);
    const run = await reviewRun(root, cleanups, {
      candidates: source => source.fail('diffPatch', 'revision-01'),
      engineer: engineers(),
      reviewers: { 'rq-0002': [clean(limit)], 'rq-0003': [clean(store, index)] },
    });
    expect(onlyRun(run.service, plan).state).toBe('completed');
    const attempt = await attemptRecord(root, run.runId, 'rq-0001.a01');
    expect(attempt).toMatchObject({ invocation: null, result: { result: 'not-verified', reason: 'unavailable' } });
    expect(eventsOf(run.events, 'review-attempt-started').map(event => event.data.request)).not.toContain('rq-0001');
    expect(run.agent!.sessions.filter(session => session.spec.role === 'reviewer')).toHaveLength(2);
    expect(eventsOf(run.events, 'review-attempt-finished').filter(event => event.data.request !== 'rq-0001').every(event => event.data.result === 'complete')).toBe(true);
    run.git.assertComplete();
  }, 60_000);

  test('the attempt deadline aborts patch preparation without starting a reviewer and releases the queue', async () => {
    const root = await reviewTarget(cleanups);
    const entered = gate();
    const aborted = gate();
    const run = await reviewRun(root, cleanups, {
      policy: { concurrency: 1, attemptMs: 1_000 },
      candidates: source => holdFirstPatch(source, entered, aborted),
      engineer: engineers(),
      reviewers: { 'rq-0002': [clean(limit)], 'rq-0003': [clean(store, index)] },
    });
    await entered.opened;
    await aborted.opened;
    expect(onlyRun(run.service, plan).state).toBe('completed');
    expect(await attemptRecord(root, run.runId, 'rq-0001.a01')).toMatchObject({
      invocation: null,
      result: { result: 'not-verified', reason: 'unavailable', detail: expect.stringContaining('attempt bound') },
    });
    expect(eventsOf(run.events, 'review-attempt-started').map(event => event.data.request)).toEqual(['rq-0002', 'rq-0003']);
    expect(eventsOf(run.events, 'review-attempt-finished').filter(event => event.data.request !== 'rq-0001').every(event => event.data.result === 'complete')).toBe(true);
    run.git.assertComplete();
  }, 60_000);

  test('stopping a run aborts pending patch preparation and settles its request before the terminal event', async () => {
    const root = await reviewTarget(cleanups);
    const entered = gate();
    const aborted = gate();
    const turns = engineers();
    turns[1] = [{ kind: 'await', until: () => new Promise(() => undefined) }];
    const run = await reviewRun(root, cleanups, {
      detached: true,
      policy: { concurrency: 1 },
      candidates: source => holdFirstPatch(source, entered, aborted),
      engineer: turns,
      reviewers: {},
    });
    cleanups.push(() => run.service.close());
    await entered.opened;
    // The writer may advance between taking the version and sending Stop.
    for (;;) {
      try {
        await run.service.execute(stopRun(plan, run.runId, run.service.getRun(plan, run.runId)!.version));
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== 'stale-version') throw error;
      }
    }
    await run.service.settled(plan, run.runId);
    await aborted.opened;
    const events = await runEventsOnDisk(root, plan, run.runId);
    expect(onlyRun(run.service, plan).state).toBe('stopped');
    expect(run.agent!.sessions.filter(session => session.spec.role === 'reviewer')).toHaveLength(0);
    expect(eventsOf(events, 'review-attempt-started')).toHaveLength(0);
    const finished = eventsOf(events, 'review-attempt-finished');
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ data: { request: 'rq-0001', result: 'not-verified', reason: 'stopped' } });
    expect(await attemptRecord(root, run.runId, 'rq-0001.a01')).toMatchObject({ invocation: null, result: { reason: 'stopped' } });
    expect(events.at(-1)?.type).toBe('job-stopped');
    expect(finished[0]!.sequence).toBeLessThan(events.at(-1)!.sequence);
  }, 60_000);
});
