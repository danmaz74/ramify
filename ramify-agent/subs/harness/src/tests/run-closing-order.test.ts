import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { stat } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { copyFixture } from './helpers/fixture.js';
import { emptyAnalysis, installTestRunner, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { runLayout } from '../run/records.js';
import type { RunEvent } from '../run/log.js';

/*
 * Work is never marked complete before its last write.
 *
 * The event that closes a piece of work is appended after every write that
 * belongs to it, and nothing is awaited from an agent afterwards. An event
 * that licenses an agent is appended before the agent starts. This test
 * reads the order from the log and from the files beside it, so an ordering
 * that drifts is caught where it happened and not at the end of a trial.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

/** Which record files exist at the moment each write completes. */
async function recordedAt(root: string) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  void root;
  await installTestRunner(fixture.root);

  const seen: Array<{ write: string; files: string[] }> = [];
  const { service } = await openRuns(fixture.root, {
    script: [{ kind: 'submit', input: emptyAnalysis() }],
    unchangedCheckpoints: ['final verification of plan "review-notes"'],
    afterWrite: async (write, runId) => {
      const candidates: Array<[string, string]> = [
        ['invocation.json', runLayout.invocation('inv-0001')],
        ['submission.json', runLayout.submission('inv-0001')],
        ['outcome.json', runLayout.outcome('inv-0001')],
        ['entries.json', runLayout.entries],
        ['readiness/01', runLayout.readiness(1)],
        ['gates/ga-0001', runLayout.gate('ga-0001')],
        ['gates/ga-0002', runLayout.gate('ga-0002')],
      ];
      const files: string[] = [];
      for (const [name, path] of candidates) {
        if (await exists(runPath(fixture.root, 'review-notes', runId, path))) files.push(name);
      }
      seen.push({ write, files });
    },
  });
  cleanups.push(() => service.close());
  const receipt = await service.execute(startRun('review-notes'));
  await service.settled('review-notes', receipt.jobId);
  return { root: fixture.root, runId: receipt.jobId, seen, events: await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId) };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('closing is the last write', () => {
  test('every record of a piece of work is on disk before the event that closes it', async () => {
    const { seen, events } = await recordedAt('');
    const at = (write: string) => seen.find(entry => entry.write === write)!;

    // The invocation is licensed before the agent starts, so its record is
    // there while the session runs.
    expect(at('invocation-started').files).toContain('invocation.json');
    expect(at('invocation-started').files).not.toContain('outcome.json');

    // The submission the harness accepted is stored verbatim before anything
    // is derived from it, and before the invocation is closed.
    expect(at('invocation-ended').files).toContain('submission.json');
    expect(at('invocation-ended').files).toContain('outcome.json');
    expect(at('invocation-ended').files).not.toContain('entries.json');

    // The analysis is accepted only once the invocation that produced it is
    // closed, and its own record is committed with that event.
    expect(at('analysis-accepted').files).toContain('entries.json');

    // Readiness commits its attempt and its gate in one transition.
    expect(at('readiness-attempted').files).toEqual(expect.arrayContaining(['readiness/01', 'gates/ga-0001']));

    // The run is completed only after the final gate's attempt is a record
    // and its commit is in the log.
    expect(at('job-completed').files).toContain('gates/ga-0002');
    expect(events.at(-1)!.type).toBe('job-completed');
  }, 180_000);

  test('the closing event of the run is last, and nothing follows it', async () => {
    const { events } = await recordedAt('');
    const order = events.map((event: RunEvent) => event.type);
    expect(order.indexOf('analysis-accepted')).toBeGreaterThan(order.indexOf('invocation-ended'));
    expect(order.indexOf('gate-attempted')).toBeGreaterThan(order.indexOf('gate-committing'));
    expect(order.indexOf('job-completed')).toBe(order.length - 1);
    // One transition per piece of work, never two.
    expect(order.filter(type => type === 'analysis-accepted')).toHaveLength(1);
    expect(order.filter(type => type === 'job-completed')).toHaveLength(1);
  }, 180_000);
});
