import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { copyFixture } from './helpers/fixture.js';
import {
  emptyAnalysis, git, initRepository, installTestRunner, onlyRun, openRuns,
  runEventsOnDisk, runPath, startRun, stopRun, testPolicy, until } from './helpers/runs.js';
import { runLayout } from '../run/records.js';

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

describe('an implementation run with no entry capabilities', () => {
  test('starts, passes readiness, passes its final gate and completes, with no client connected', async () => {
    const { root } = await target();
    const { service, agent } = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    expect(events.map(event => event.type)).toEqual([
      'job-started',
      'invocation-started',
      'invocation-ended',
      'analysis-accepted',
      'readiness-passed',
      'gate-committing',
      'gate-attempted',
      'job-completed',
    ]);

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('completed');
    expect(snapshot.phase).toBe('ended');
    expect(snapshot.failure).toBeNull();
    expect(snapshot.counts.invocations).toBe(1);
    expect(snapshot.counts.readinessAttempts).toBe(1);

    // The one invocation was the initial architect's, and it submitted.
    expect(agent!.sessions).toHaveLength(1);
    expect(agent!.sessions[0]!.spec.role).toBe('initial-architect');
    expect(agent!.sessions[0]!.spec.context.compaction).toBe('allowed');
    expect(agent!.sessions[0]!.spec.context.budgetFraction).toBe(0.75);

    // Every record of the run is a file beneath it.
    const record = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.record), 'utf8')) as Record<string, unknown>;
    expect(record['schema']).toBe('ramify-agent.job/2');
    expect(record['kind']).toBe('implementation');
    const entries = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.entries), 'utf8')) as { entries: unknown[] };
    expect(entries.entries).toEqual([]);
    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.readiness(1)), 'utf8')) as { verdict: string; steps: Array<{ step: string; outcome: string }> };
    expect(attempt.verdict).toBe('passed');
    expect(attempt.steps.every(step => step.outcome === 'passed')).toBe(true);
    expect(attempt.steps.map(step => step.step)).toEqual([
      'project-root', 'git-clean', 'compiler-config', 'test-runner', 'nested-packages',
      'test-discovery', 'ramify-daemon', 'baseline-tests', 'baseline-type-check', 'baseline-ramify-check',
    ]);
  }, 120_000);

  test('works on its own branch, and its own records are never committed', async () => {
    const { root } = await target();
    const { service } = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    expect((await git(root, 'rev-parse', '--abbrev-ref', 'HEAD')).trim()).toBe(`ramify-agent/run-${receipt.jobId}`);
    // Nothing changed, so the passing gate made no commit, and the tree is
    // clean although the run wrote its whole log into it.
    expect((await git(root, 'status', '--porcelain', '--untracked-files=all')).trim()).toBe('');
    const ignore = await readFile(runPath(root, 'review-notes', receipt.jobId, '..', '..', '.gitignore'), 'utf8');
    expect(ignore.trim().endsWith('*')).toBe(true);
  }, 120_000);

  test('a final gate that does not pass fails the run, with the attempt as evidence', async () => {
    const { root } = await target();
    const counter = join(await counterDirectory(), 'tests-run');
    const { service } = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      // The captured test command passes at readiness and fails the second
      // time it runs, which is the final gate.
      policy: projectRoot => testPolicy(projectRoot, { testsFailFrom: { run: 2, counter } }),
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('repair-exhausted');
    expect(snapshot.failure?.evidence).toEqual([runLayout.gate('ga-0002')]);

    const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    expect(events.map(event => event.type)).toEqual([
      'job-started', 'invocation-started', 'invocation-ended', 'analysis-accepted',
      'readiness-passed', 'gate-committing', 'gate-attempted', 'job-failed',
    ]);
    // The unchanged tree needs no new commit, but its current revision was
    // audited and the failing attempt records that identity and evidence.
    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate('ga-0002')), 'utf8')) as { verdict: string; cause: string; commit: string | null; audited: string | null; evidence: unknown };
    expect(attempt).toMatchObject({ verdict: 'failed', cause: 'in-scope', commit: null, audited: expect.any(String), evidence: expect.any(Object) });
  }, 120_000);

  test('a passing final gate over a changed tree makes exactly one commit, with the gate as its trailer', async () => {
    const { root } = await target();
    const { service } = await openRuns(root, {
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
    const log = await git(root, 'log', '--format=%H %s', `ramify-agent/run-${receipt.jobId}`);
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

  test('a run stopped mid-invocation ends stopped, and the late submission is rejected', async () => {
    const { root } = await target();
    const { service, agent } = await openRuns(root, {
      script: [{ kind: 'stall', ms: 250, thenIgnoreStop: true }, { kind: 'submit', input: emptyAnalysis() }],
      stopGraceMs: 2000,
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await until(() => agent!.sessions.length === 1);
    await service.execute(stopRun('review-notes', receipt.jobId, service.getRun('review-notes', receipt.jobId)!.version));
    await service.settled('review-notes', receipt.jobId);

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('stopped');
    const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    expect(events.map(event => event.type)).toContain('stop-requested');
    expect(events.at(-1)!.type).toBe('job-stopped');

    // The submission the session made afterwards was refused, and nothing
    // of it was written.
    await until(() => agent!.sessions[0]!.verdicts.length === 1);
    expect(agent!.sessions[0]!.verdicts[0]).toMatchObject({ accepted: false, final: true });
    await expect(readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.entries), 'utf8')).rejects.toThrow();
  }, 120_000);
});
