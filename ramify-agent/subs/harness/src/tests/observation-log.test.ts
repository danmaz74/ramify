import { finalCandidate } from './helpers/final-candidate.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ObservationLog } from '../run/observations.js';
import { runLayout } from '../run/records.js';
import { temporaryDirectory, copyFixture } from './helpers/fixture.js';
import { expectNoProcesses, forgetExternalTools, openRunsWithoutProcesses } from './helpers/external-tools.js';
import { emptyAnalysis, installTestRunner, runPath, startRun } from './helpers/runs.js';
import { scriptedGit } from './helpers/scripted-git.js';

/*
 * The observation log of one invocation. It is canonical for what was
 * observed and for nothing else: no state of the run derives from it, so it
 * does not go through the ledger. A replayed `(invocation, callId, type)` is
 * dropped, so replay counts once and a new tool call counts again.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  try { expectNoProcesses(); } finally { forgetExternalTools(); }
});

function observationGit(root: string) {
  return scriptedGit(root, { previews: finalCandidate(root, 'observation-base').previews, head: 'observation-base', checkpoints: [
    { subject: 'final verification of plan "review-notes"', commit: null, changes: [] },
  ] });
}

async function log() {
  const directory = await temporaryDirectory();
  cleanups.push(directory.remove);
  const path = join(directory.path, 'observations.jsonl');
  return { path, open: () => ObservationLog.open(path) };
}

describe('the observation log', () => {
  test('a replayed call of the same type is dropped, and a new call counts again', async () => {
    const { path, open } = await log();
    const first = await open();
    const rejection = { type: 'rejection' as const, data: { callId: 'c1', target: 'submit', attempt: 1, errors: [{ path: 'entries', message: 'wrong' }] } };

    expect(await first.record(rejection)).toBe(true);
    expect(await first.record(rejection)).toBe(false);
    expect(first.count('rejection')).toBe(1);
    expect(first.replays).toBe(1);

    expect(await first.record({ ...rejection, data: { ...rejection.data, callId: 'c2', attempt: 2 } })).toBe(true);
    expect(first.count('rejection')).toBe(2);

    // A restart reads what is there, so the same call is dropped again.
    const reopened = await open();
    expect(reopened.count('rejection')).toBe(2);
    expect(await reopened.record(rejection)).toBe(false);
    expect((await readFile(path, 'utf8')).split('\n').filter(Boolean)).toHaveLength(2);
  });

  test('an observation with no call is appended each time, because it names no call to replay', async () => {
    const { open } = await log();
    const observations = await open();
    const context = { type: 'context' as const, data: { tokens: 100, window: 200_000, threshold: 150_000 } };
    expect(await observations.record(context)).toBe(true);
    expect(await observations.record(context)).toBe(true);
    expect(observations.count('context')).toBe(2);
  });

  test('a line the reader cannot parse is skipped, and the log keeps counting', async () => {
    const { path, open } = await log();
    const observations = await open();
    await observations.record({ type: 'coverage-gap', data: { kind: 'usage-unavailable', detail: 'none reported' } });
    await writeFile(path, `${await readFile(path, 'utf8')}{"n":2,"at":"x","type":"nonsense","data":{}}\n`);
    const reopened = await open();
    expect(reopened.count('coverage-gap')).toBe(1);
    expect(await reopened.record({ type: 'coverage-gap', data: { kind: 'context-unavailable', detail: 'none' } })).toBe(true);
  });

  test('the numbering is the log\'s own, and each line carries its time', async () => {
    const { path, open } = await log();
    const observations = await open();
    await observations.record({ type: 'coverage-gap', data: { kind: 'usage-unavailable', detail: 'a' } });
    await observations.record({ type: 'coverage-gap', data: { kind: 'context-unavailable', detail: 'b' } });
    const lines = (await readFile(path, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line) as { n: number; at: string });
    expect(lines.map(line => line.n)).toEqual([1, 2]);
    expect(lines.every(line => !Number.isNaN(Date.parse(line.at)))).toBe(true);
  });
});

describe('what a run observes', () => {
  test('a session that reports no context size at all is a coverage gap, not an empty context', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);

    const git = observationGit(fixture.root);
    const { service } = await openRunsWithoutProcesses(fixture.root, git, {
      candidates: finalCandidate(fixture.root, 'observation-base').candidates, script: [{ kind: 'submit', input: emptyAnalysis() }] });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    git.assertComplete();

    const lines = (await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.observations('inv-0001')), 'utf8'))
      .split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string; data: { kind?: string; detail?: string } });
    const gaps = lines.filter(line => line.type === 'coverage-gap');
    expect(gaps.map(gap => gap.data.kind).sort()).toEqual(['context-unavailable', 'usage-unavailable']);
    expect(gaps.every(gap => (gap.data.detail ?? '') !== '')).toBe(true);
  }, 180_000);

  test('the context and compaction a session does report are observations, with the role\'s threshold', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);

    const git = observationGit(fixture.root);
    const { service } = await openRunsWithoutProcesses(fixture.root, git, {
      candidates: finalCandidate(fixture.root, 'observation-base').candidates,
      script: [
        { kind: 'message', text: 'orienting', usage: { input: 10, output: 2, cacheRead: 1, cacheWrite: 0, total: 13 } },
        { kind: 'context', tokens: 1000, window: 200_000 },
        { kind: 'compaction', reason: 'threshold', tokensBefore: 1000, tokensAfter: 400 },
        { kind: 'context', tokens: null, window: 200_000 },
        { kind: 'submit', input: emptyAnalysis() },
      ],
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    git.assertComplete();

    const lines = (await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.observations('inv-0001')), 'utf8'))
      .split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string; data: Record<string, unknown> });
    const contexts = lines.filter(line => line.type === 'context');
    expect(contexts).toHaveLength(2);
    // The threshold recorded is the initial architect's own, from the policy.
    expect(contexts[0]!.data).toEqual({ tokens: 1000, window: 200_000, threshold: 150_000 });
    // An unknown size is recorded as unknown, and never as room.
    expect(contexts[1]!.data).toEqual({ tokens: null, window: 200_000, threshold: 150_000 });

    const compactions = lines.filter(line => line.type === 'compaction');
    expect(compactions).toHaveLength(1);
    expect(compactions[0]!.data).toEqual({ trigger: 'threshold', succeeded: true, before: 1000, after: 400 });

    // Usage and context were both reported, so no gap is recorded for either.
    expect(lines.filter(line => line.type === 'coverage-gap')).toEqual([]);
  }, 180_000);
});
