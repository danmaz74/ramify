import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { copyFixture } from './helpers/fixture.js';
import { emptyAnalysis, installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun, stopRun, until } from './helpers/runs.js';
import { runLayout, type InvocationOutcome } from '../run/records.js';

/*
 * A stop that arrives between `invocation-started` and the session's start
 * applies to that invocation.
 *
 * `invocation-started` is appended before `startSession`, so the invocation
 * the stop lands on is a known one: it is closed as `stopped`, its outcome
 * is a record, and no session ever runs for it.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

describe('a stop between the invocation and its session', () => {
  test('applies to that invocation: it is closed as stopped and no session starts', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);

    let stopped: Promise<unknown> = Promise.resolve();
    const { service, agent } = await openRuns(fixture.root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      // The stop is accepted while the run is between the event that
      // licenses the agent and the call that starts it.
      afterWrite: async (write, runId) => {
        if (write !== 'invocation-started') return;
        const version = service.getRun('review-notes', runId)!.version;
        stopped = service.execute(stopRun('review-notes', runId, version));
        await stopped;
      },
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await stopped;
    await service.settled('review-notes', receipt.jobId);
    await until(() => onlyRun(service, 'review-notes').state === 'stopped');

    // No session ran for the invocation the stop landed on.
    expect(agent!.sessions).toHaveLength(0);

    const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
    expect(events.map(event => event.type)).toEqual([
      'job-started', 'invocation-started', 'stop-requested', 'invocation-ended', 'job-stopped',
    ]);

    // The invocation is a record, and it says what became of it.
    const invocation = JSON.parse(await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.invocation('inv-0001')), 'utf8')) as { id: string; role: string };
    expect(invocation).toMatchObject({ id: 'inv-0001', role: 'initial-architect' });
    const outcome = JSON.parse(await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.outcome('inv-0001')), 'utf8')) as InvocationOutcome;
    expect(outcome).toMatchObject({ invocation: 'inv-0001', ended: 'stopped', disposition: 'incomplete', submission: null });

    // Nothing was derived from an analysis that never happened.
    await expect(readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.entries), 'utf8')).rejects.toThrow();
  }, 180_000);

  test('a stop before the first invocation ends the run with no invocation at all', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);

    let stopped: Promise<unknown> = Promise.resolve();
    const { service, agent } = await openRuns(fixture.root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      afterWrite: async (write, runId) => {
        if (write !== 'job-created') return;
        stopped = service.execute(stopRun('review-notes', runId, service.getRun('review-notes', runId)!.version));
        await stopped;
      },
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await stopped;
    await service.settled('review-notes', receipt.jobId);
    await until(() => onlyRun(service, 'review-notes').state === 'stopped');

    expect(agent!.sessions).toHaveLength(0);
    const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
    expect(events.map(event => event.type)).toEqual(['job-started', 'stop-requested', 'job-stopped']);
  }, 180_000);
});
