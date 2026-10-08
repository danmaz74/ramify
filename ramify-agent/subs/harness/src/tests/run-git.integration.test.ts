import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { sha256 } from '../prompts/packages.js';

import { coordinatorAssessmentToolName, coordinatorActionToolName, nonfunctionalRepairToolName } from '../nonfunctional/submissions.js';
import { intakeToolName } from '../analysis/extraction.js';
import { analysis } from './helpers/analysis.js';
import { submit, treeInputs, write } from './helpers/iterations.js';

/** Real current-engine coordinator authority, captured before the repair writer starts. */
function authorizedRepair(root: string) {
  return (spec: import('../../subs/agent/src/interfaces/port.js').SessionSpec) => {
    if (spec.submission.name === intakeToolName) return submit({ goal: 'Retain an audit record.', elements: [
      { key: 'audit', kind: 'non-functional', document: 'doc-001', text: 'The review must retain an audit record.', conditions: [], uncertainty: '' },
    ], incorporation: { documents: [{ document: 'doc-001', scenarios: true, uncertainty: '' }], missing: [] } });
    if (spec.role === 'initial-architect') return submit(analysis([]));
    if (spec.submission.name === coordinatorAssessmentToolName) return submit({ kind: 'assessment', results: [{ nfr: 'nfr-001',
      result: spec.prompt.includes('(after-repair)') ? 'satisfied' : 'not-satisfied', inspectedScope: ['src'], evidence: ['Current source inspected'], uncertainty: '' }] });
    if (spec.submission.name === coordinatorActionToolName) return submit({ kind: 'repair', nfrs: ['nfr-001'], startingModule: 'collection-review', task: 'Record the audit source.', evidence: [], uncertainty: '' });
    if (spec.submission.name === nonfunctionalRepairToolName) return submit({ kind: 'completed', summary: 'Audit record source added.', evidence: ['src/late.ts'], remaining: [] }, write(join(root, 'src/late.ts'), 'export const late = true;\n'));
    return [];
  };
}

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
  const plan = join(fixture.root, 'plans/review-notes/plan.md');
  await writeFile(plan, `${await readFile(plan, 'utf8')}\nThe review must retain an audit record.\n`);
  const head = await initRepository(fixture.root);
  return { root: fixture.root, head };
}

describe('run-to-Git integration', () => {
  test('PB3: real producer proof refuses unrelated, missing, stale, aliased and merge candidates', async () => {
    const { root } = await target();
    const ramify = new FakeRamifyCli();
    const opened = await openRuns(root, { git: gitService, ramify, script: [] });
    cleanups.push(() => opened.service.close());
    const producer = opened.service as unknown as {
      verifyProducerCommit(files: readonly { path: string; content: string }[], commit: string): Promise<void>;
      renderedFeatureAllowed(path: string, hash: string, answer: Awaited<ReturnType<FakeRamifyCli['queryOwnership']>>): Promise<boolean>;
      renderProducerFeatures(run: unknown, files: readonly { path: string; content: string }[]): Promise<void>;
    };
    const identity = ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost'];
    const path = 'src/tests/producer.feature', content = 'Feature: exact ledger bytes\n';
    const expected = [{ path, content }];
    const commit = async (message: string) => {
      await git(root, 'add', '--all'); await git(root, ...identity, 'commit', '--allow-empty', '-m', message);
      return (await git(root, 'rev-parse', 'HEAD')).trim();
    };
    const missing = await commit('empty producer with a missing expected file');
    await expect(producer.verifyProducerCommit(expected, missing)).rejects.toThrow('exact rendered bytes');
    await mkdir(join(root, 'src/tests'), { recursive: true });
    await writeFile(join(root, path), content);
    const exact = await commit('exact producer');
    await expect(producer.verifyProducerCommit(expected, exact)).resolves.toBeUndefined();
    const answer = await ramify.queryOwnership(root, [path]);
    expect(await producer.renderedFeatureAllowed(path, sha256(content), answer)).toBe(true);
    await writeFile(join(root, path), 'tampered producer bytes\n');
    expect(await producer.renderedFeatureAllowed(path, sha256(content), answer)).toBe(false);
    const stale = await commit('stale producer');
    await expect(producer.verifyProducerCommit(expected, stale)).rejects.toThrow('exact rendered bytes');
    const unchangedStale = await commit('empty commit retaining stale expected bytes');
    await expect(producer.verifyProducerCommit(expected, unchangedStale)).rejects.toThrow('exact rendered bytes');
    await writeFile(join(root, path), content);
    await writeFile(join(root, 'src/unassigned.ts'), 'unassigned source\n');
    await expect(producer.renderProducerFeatures({}, expected)).rejects.toThrow('unrelated candidate changes');
    const unrelated = await commit('whole-tree commit must not become producer authority');
    await expect(producer.verifyProducerCommit(expected, unrelated)).rejects.toThrow('unrelated paths');
    const external = await counterDirectory(); const externalBytes = 'external content must survive rejected rendering\n';
    await writeFile(join(external, 'target.feature'), externalBytes);
    await rm(join(root, path)); await symlink(join(external, 'target.feature'), join(root, path));
    expect(await producer.renderedFeatureAllowed(path, sha256(content), answer)).toBe(false);
    await expect(producer.renderProducerFeatures({}, expected)).rejects.toThrow('outside ordinary ownership');
    expect(await readFile(join(external, 'target.feature'), 'utf8')).toBe(externalBytes);
    await git(root, 'restore', path);
    await git(root, 'switch', '-c', 'producer-side');
    await writeFile(join(root, 'src/merge-only.ts'), 'merge-owned source\n');
    await commit('side change');
    await git(root, 'switch', 'main');
    await git(root, ...identity, 'merge', '--no-ff', 'producer-side', '-m', 'trailer-matched merge producer');
    const merge = (await git(root, 'rev-parse', 'HEAD')).trim();
    await expect(producer.verifyProducerCommit(expected, merge)).rejects.toThrow('single-parent producer');
  }, 120_000);

  test('a final candidate without any captured writer origin is refused before a real Git commit', async () => {
    const { root } = await target();
    const opened = await openRuns(root, { git: gitService, script: [{ kind: 'submit', input: emptyAnalysis() }],
      afterWrite: async write => { if (write === 'readiness-attempted') await writeFile(join(root, 'src/late.ts'), 'export const late = true;\n'); } });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    expect(onlyRun(opened.service, 'review-notes').state).toBe('failed');
    expect((await git(root, 'log', '--format=%H')).trim().split('\n')).toHaveLength(1);
    const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    const gate = events.find(event => event.type === 'gate-attempted' && event.data.checkpoint === 'final');
    if (gate?.type !== 'gate-attempted') throw new Error('No final gate recorded');
    const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate(gate.data.gate)), 'utf8'));
    expect(attempt.commit).toBeNull();
    expect(attempt.rules).toContainEqual(expect.objectContaining({ rule: 'write-scope', outcome: 'failed', violations: [expect.objectContaining({ path: 'src/late.ts' })] }));
  }, 120_000);

  test('a passing final gate over a changed tree makes exactly one commit, with the gate as its trailer', async () => {
    const { root } = await target();
    const { service } = await openRuns(root, {
      git: gitService,
      script: authorizedRepair(root), inputs: treeInputs(),
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
    const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    const invocations = events.filter(event => event.type === 'invocation-started' && !['reviewer', 'failure-analyst'].includes(event.data.role)).map(event => event.type === 'invocation-started' ? event.data.invocation : '');
    expect(body).toContain(`Ramify-Invocations: ${invocations.join(', ')}`);
    expect(events.some(event => event.type === 'nonfunctional-repair-assigned')).toBe(true);
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
      script: authorizedRepair(root), inputs: treeInputs(),
      afterWrite: async write => {
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
    const reopened = await openRuns(root, { git: gitService, script: [] });
    cleanups.unshift(() => reopened.service.close());

    expect(reopened.recovery.effects).toContain(`review-notes/${receipt.jobId}: resumed the non-functional phase`);
    await reopened.service.settled('review-notes', receipt.jobId);
    expect(onlyRun(reopened.service, 'review-notes').state).toBe('completed');

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
