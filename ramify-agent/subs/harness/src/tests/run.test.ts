import { openUnchangedRuns as openRuns, assertUnchangedGit, unchangedGit } from './helpers/unchanged-run.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { GitError } from '../../subs/evidence/src/git.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { copyFixture } from './helpers/fixture.js';
import {
  emptyAnalysis, installTestRunner, onlyRun, openRuns as openRunsWithGit,
  runEventsOnDisk, runPath, startRun, stopRun, testPolicy, until } from './helpers/runs.js';
import { runLayout } from '../run/records.js';

/*
 * The smallest coherent run: one with no entry capabilities. It starts,
 * invokes the initial architect, passes readiness, passes its final gate and
 * completes, with no client connected: the file system alone is watched.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
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
  const head = 'unchanged-fixture-revision';
  return { root: fixture.root, head };
}

describe('an implementation run with no entry capabilities', () => {
  test('starts, passes readiness, passes its final gate and completes, with no client connected', async () => {
    const { root } = await target();
    const { service, agent } = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      unchangedCheckpoints: ['final verification of plan "review-notes"'],
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    expect(events.map(event => event.type)).toEqual([
      'job-started',
      'document-manifest-committed',
      'session-opened',
      'invocation-started',
      'invocation-ended',
      'analysis-accepted',
      'gate-started',
      'readiness-passed',
      'candidate-prepared',
      'nonfunctional-assessed',
      'nonfunctional-round-closed',
      'gate-committing',
      'gate-attempted',
      'candidate-bound-to-gate',
      'session-finished',
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
    expect(record['schema']).toBe('ramify-agent.job/3');
    expect(record['kind']).toBe('implementation');
    const entries = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.entries), 'utf8')) as { entries: unknown[] };
    expect(entries.entries).toEqual([]);
    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.readiness(1)), 'utf8')) as { verdict: string; steps: Array<{ step: string; outcome: string }> };
    expect(attempt.verdict).toBe('passed');
    expect(attempt.steps.every(step => step.outcome === 'passed')).toBe(true);
    expect(attempt.steps.map(step => step.step)).toEqual([
      'project-root', 'git-clean', 'compiler-config', 'test-runner', 'project-config', 'acceptance-runner',
      'nested-packages', 'test-discovery', 'ramify-daemon', 'baseline-setup', 'baseline-tests', 'baseline-type-check', 'baseline-ramify-check',
      'baseline-acceptance', 'acceptance-full', 'run-branch',
    ]);
  }, 120_000);

  test('works on its own branch, and its own records are never committed', async () => {
    const { root } = await target();
    const { service, git } = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      unchangedCheckpoints: ['final verification of plan "review-notes"'],
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    expect(git.operations()['createRunBranch']).toBe(1);
    expect(git.branch()).toBe(`ramify-agent-run/${receipt.jobId}`);
    // Nothing changed, so the passing gate made no commit, and the tree is
    // clean although the run wrote its whole log into it.
    expect(git.operations()['commitAccepted']).toBe(1);
    expect(git.commits()).toEqual([]);
    const ignore = await readFile(runPath(root, 'review-notes', receipt.jobId, '..', '..', '.gitignore'), 'utf8');
    expect(ignore.trim().endsWith('*')).toBe(true);
  }, 120_000);

  test('a run branch git refuses fails readiness at run-branch, with git\'s own message, before any work', async () => {
    const { root } = await target();
    const scripted = unchangedGit(root);
    const refusal = 'fatal: cannot lock ref \'refs/heads/ramify-agent-run/x\': \'refs/heads/ramify-agent-run\' exists';
    const git = {
      ...scripted,
      async createRunBranch(): Promise<never> {
        throw new GitError('`git switch --create ramify-agent-run/x` exited with 128', {
          argv: ['git', 'switch', '--create', 'ramify-agent-run/x'], outcome: { kind: 'completed', exitCode: 128 }, output: refusal,
        });
      },
    };
    const { service } = await openRunsWithGit(root, { git, readinessExecution: directReadinessExecution(), script: [{ kind: 'submit', input: emptyAnalysis() }] });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('readiness-failed');
    expect(snapshot.failure?.message).toContain('Readiness failed at run-branch');
    expect(snapshot.failure?.message).toContain(refusal);
    const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    expect(events.map(event => event.type)).toEqual([
      'job-started', 'document-manifest-committed', 'session-opened', 'invocation-started', 'invocation-ended', 'analysis-accepted',
      'gate-started', 'readiness-failed', 'session-finished', 'job-failed',
    ]);
    expect(events.find(event => event.type === 'readiness-failed')?.data).toMatchObject({ step: 'run-branch', recovery: null, final: true });
    expect(scripted.operations()['commitAccepted']).toBeUndefined();
  }, 120_000);

  test('a final gate that does not pass fails the run, with the attempt as evidence', async () => {
    const { root } = await target();
    const { service } = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      // Readiness passes; the direct executor then reports the final test
      // command's completed failure to the production gate classifier.
      checkScript: ({ check, context }) => context.checkpoint === 'final' && check.kind === 'tests'
        ? { outcome: { kind: 'completed', exitCode: 1 } }
        : {},
      unchangedCheckpoints: ['final verification of plan "review-notes"'],
      previewCount: 3,
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
      'job-started', 'document-manifest-committed', 'session-opened', 'invocation-started', 'invocation-ended', 'analysis-accepted',
      'gate-started', 'readiness-passed', 'candidate-prepared', 'nonfunctional-assessed', 'nonfunctional-round-closed',
      'gate-committing', 'gate-attempted', 'candidate-bound-to-gate', 'session-finished', 'job-failed',
    ]);
    // The unchanged tree needs no new commit, but its current revision was
    // audited and the failing attempt records that identity and evidence.
    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate('ga-0002')), 'utf8')) as { verdict: string; cause: string; commit: string | null; audited: string | null; evidence: unknown };
    expect(attempt).toMatchObject({ verdict: 'failed', cause: 'in-scope', commit: null, audited: expect.any(String), evidence: expect.any(Object) });
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
