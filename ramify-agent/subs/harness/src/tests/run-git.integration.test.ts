import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { copyFixture } from './helpers/fixture.js';
import {
  crashLock, emptyAnalysis, freeze, git, initRepository, installTestRunner, onlyRun, openRuns,
  runEventsOnDisk, runPath, startRun, stopRun, testPolicy, until } from './helpers/runs.js';
import { runLayout } from '../run/records.js';
import type { GateAttempt } from '../checks/records.js';
import { gitService } from '../../subs/evidence/src/git.js';

/*
 * The smallest coherent run: one with no entry capabilities. It starts,
 * invokes the initial architect, passes readiness, passes its final gate and
 * completes, with no client connected: the file system alone is watched.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** A directory outside the project, where a counting command keeps its count. */
async function counterDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'ramify-agent-counter-'));
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

/** A fixture copy that a run can work in: a git repository, with the runner readiness requires. */
async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const head = await initRepository(fixture.root);
  return { root: fixture.root, head };
}

describe('run-to-Git integration', () => {
  test('a passing final gate over a changed tree makes exactly one commit, with the gate as its trailer', async () => {
    const { root } = await target();
    const { service } = await openRuns(root, {
      git: gitService,
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      // A change that arrives after readiness blocks nothing: a gate runs the
      // commit, then the gate audits that exact revision.
      afterWrite: async write => {
        if (write === 'readiness-attempted') await writeFile(join(root, 'src', 'late.ts'), 'export const late = true;\n');
      },
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const log = await git(root, 'log', '--format=%H %s', `ramify-agent-run/${receipt.jobId}`);
    const commits = log.trim().split('\n');
    expect(commits).toHaveLength(2);
    expect(commits[0]).toContain('final verification of plan "review-notes"');

    const body = await git(root, 'log', '-1', '--format=%B');
    expect(body).toContain('Ramify-Run: ' + receipt.jobId);
    expect(body).toContain('Ramify-Gate: ga-0002');
    expect(body).toContain('Ramify-Invocations: inv-0001');
    expect(body).not.toContain('Checks:');
    expect(body).toContain('Audit-Note: git notes --ref=audit show');

    // The commit holds the change and none of the run's own records.
    const files = (await git(root, 'show', '--name-only', '--format=', 'HEAD')).trim().split('\n');
    expect(files).toEqual(['src/late.ts']);

    // The attempt record names the commit the effect made.
    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate('ga-0002')), 'utf8')) as { commit: string | null };
    expect(attempt.commit).toBe(commits[0]!.split(' ')[0]);
  }, 120_000);

  test('recovery finds the real commit by both trailers and does not create a duplicate', async () => {
    const { root } = await target();
    let commitMade = false;
    const crashed = await openRuns(root, {
      git: gitService,
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      afterWrite: async write => {
        if (write === 'readiness-attempted') {
          await writeFile(join(root, 'src', 'late.ts'), 'export const late = true;\n');
        }
        // `gate-committing` is reported after Git answered the commit and
        // before the audit and immutable attempt completion are written.
        if (write === 'gate-committing') {
          commitMade = true;
          await freeze();
        }
      },
    });
    const receipt = await crashed.service.execute(startRun('review-notes'));
    await until(() => commitMade, 60_000);

    const branch = `ramify-agent-run/${receipt.jobId}`;
    const before = (await git(root, 'log', '--format=%H', branch)).trim().split('\n');
    expect(before).toHaveLength(2);
    const accepted = before[0]!;
    const body = await git(root, 'show', '-s', '--format=%B', accepted);
    expect(body).toContain(`Ramify-Run: ${receipt.jobId}`);
    expect(body).toContain('Ramify-Gate: ga-0002');

    const frozen = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    expect(frozen.filter(event => event.type === 'gate-committing')).toHaveLength(1);
    expect(frozen.some(event => event.type === 'gate-attempted')).toBe(false);

    // This witness intentionally uses the real dead-process helper and the
    // production Git default on both service instances.
    await crashLock(root);
    const reopened = await openRuns(root, { git: gitService });
    cleanups.unshift(() => reopened.service.close());

    expect(reopened.recovery.effects).toEqual([
      `review-notes/${receipt.jobId}: the commit and audit of gate ga-0002`,
    ]);
    expect(onlyRun(reopened.service, 'review-notes').state).toBe('interrupted');

    const after = (await git(root, 'log', '--format=%H', branch)).trim().split('\n');
    expect(after).toEqual(before);
    const recovered = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    expect(recovered.filter(event => event.type === 'gate-committing')).toHaveLength(1);
    expect(recovered.filter(event => event.type === 'gate-attempted')).toHaveLength(1);

    const attempt = JSON.parse(
      await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate('ga-0002')), 'utf8'),
    ) as GateAttempt;
    expect(attempt.commit).toBe(accepted);
    expect(attempt.audited).toBe(accepted);
  }, 120_000);

});
