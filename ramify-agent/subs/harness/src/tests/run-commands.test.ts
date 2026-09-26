import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CommandRejection } from '../jobs/commands.js';
import { runCommandSchema, startRunCommandSchema } from '../interfaces/protocol/runs.js';
import { copyFixture } from './helpers/fixture.js';
import { emptyAnalysis, installTestRunner, onlyRun, startRun, stopRun, until } from './helpers/runs.js';

/*
 * Plan 1's three command rules hold unchanged for the run's commands: an
 * identical retry returns its receipt, a reused ID with other content
 * conflicts, and a stale expected version is rejected with the current
 * version. A second run while one is active is busy.
 *
 * Every rule is decided before the command has any effect.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  return fixture.root;
}

/**
 * A run that waits, so a command can reach it while it is still active. A
 * static script leaves the intake to its default turn, so the initial
 * architect's session is the one that waits, and nothing is written while
 * it does.
 */
const waiting = [{ kind: 'stall', ms: 3000 } as const];
const architectWaits = (agent: { readonly sessions: ReadonlyArray<{ readonly spec: { readonly role: string } }> }) =>
  agent.sessions.some(session => session.spec.role === 'initial-architect');

describe('start-run', () => {
  test('an identical retry returns the original receipt and starts no second run', async () => {
    const root = await target();
    const { service } = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      unchangedCheckpoints: ['final verification of plan "review-notes"'],
    });
    cleanups.push(() => service.close());

    const command = startRun('review-notes', 'scripted', 'start-once');
    const first = await service.execute(command);
    await service.settled('review-notes', first.jobId);
    const second = await service.execute({ ...command });

    expect(second).toEqual(first);
    expect(service.listRuns('review-notes')).toHaveLength(1);
  }, 120_000);

  test('a reused ID with other content is a conflict, and nothing is started', async () => {
    const root = await target();
    const { service } = await openRuns(root, {
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      unchangedCheckpoints: ['final verification of plan "review-notes"'],
    });
    cleanups.push(() => service.close());

    const first = await service.execute(startRun('review-notes', 'scripted', 'start-again'));
    await service.settled('review-notes', first.jobId);

    const conflicting = startRun('revision-diff', 'scripted', 'start-again');
    await expect(service.execute(conflicting)).rejects.toMatchObject({ code: 'conflict' });
    expect(service.listRuns('revision-diff')).toHaveLength(0);
  }, 120_000);

  test('a stale expected version is rejected with the current version', async () => {
    const root = await target();
    const { service, agent } = await openRuns(root, { script: waiting });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await until(() => architectWaits(agent!));
    const version = service.getRun('review-notes', receipt.jobId)!.version;
    expect(version).toBeGreaterThan(0);

    const stale = stopRun('review-notes', receipt.jobId, version - 1);
    const rejection = await service.execute(stale).catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(CommandRejection);
    expect(rejection).toMatchObject({ code: 'stale-version', currentVersion: version });
    expect(onlyRun(service, 'review-notes').stopRequested).toBe(false);
  }, 120_000);

  test('a second run while one is active is busy', async () => {
    const root = await target();
    const { service, agent } = await openRuns(root, { script: waiting });
    cleanups.push(() => service.close());

    await service.execute(startRun('review-notes'));
    await until(() => architectWaits(agent!));
    await expect(service.execute(startRun('revision-diff'))).rejects.toMatchObject({ code: 'busy' });
    expect(service.listRuns('revision-diff')).toHaveLength(0);
  }, 120_000);

  test('a start creates the run, so it expects version 0, and an unknown plan is not found', async () => {
    const root = await target();
    const { service } = await openRuns(root, { script: waiting });
    cleanups.push(() => service.close());

    await expect(service.execute({ ...startRun('review-notes'), expectedVersion: 1 })).rejects.toMatchObject({ code: 'stale-version' });
    await expect(service.execute(startRun('no-such-plan'))).rejects.toMatchObject({ code: 'not-found' });
    expect(service.listRuns('review-notes')).toHaveLength(0);
  }, 120_000);

  test('a start without a configured agent, or naming another one, is unavailable', async () => {
    const root = await target();
    const without = await openRuns(root);
    cleanups.push(() => without.service.close());
    await expect(without.service.execute(startRun('review-notes'))).rejects.toMatchObject({ code: 'unavailable' });
    await without.service.close();

    const { service } = await openRuns(root, { script: waiting });
    cleanups.push(() => service.close());
    await expect(service.execute(startRun('review-notes', 'pi'))).rejects.toMatchObject({ code: 'unavailable' });
  }, 120_000);
});

describe('stop-job', () => {
  test('a repeat returns the original receipt, and a second stop of the same run conflicts', async () => {
    const root = await target();
    const { service, agent } = await openRuns(root, { script: waiting, stopGraceMs: 4000 });
    cleanups.push(() => service.close());

    const started = await service.execute(startRun('review-notes'));
    await until(() => architectWaits(agent!));
    const version = service.getRun('review-notes', started.jobId)!.version;
    const stop = stopRun('review-notes', started.jobId, version, 'stop-once');

    const first = await service.execute(stop);
    expect(await service.execute({ ...stop })).toEqual(first);
    await service.settled('review-notes', started.jobId);

    const again = stopRun('review-notes', started.jobId, service.getRun('review-notes', started.jobId)!.version);
    await expect(service.execute(again)).rejects.toMatchObject({ code: 'conflict' });
  }, 120_000);

  test('a stop of a run that is not there is not found', async () => {
    const root = await target();
    const { service } = await openRuns(root, { script: waiting });
    cleanups.push(() => service.close());
    await expect(service.execute(stopRun('review-notes', '20260920T101500Z-3f9a1c', 0))).rejects.toMatchObject({ code: 'not-found' });
  }, 120_000);
});

describe('the command schema', () => {
  test('start-run carries the plan, the agent and the review stop, and nothing the harness executes', () => {
    const accepted = startRunCommandSchema.parse({
      commandId: 'c1', expectedVersion: 0, type: 'start-run', payload: { planId: 'review-notes', agent: 'pi' },
    });
    expect(accepted.payload).toEqual({ planId: 'review-notes', agent: 'pi', reviewStop: false });
    expect(startRunCommandSchema.safeParse({
      commandId: 'c1', expectedVersion: 0, type: 'start-run', payload: { planId: 'review-notes', agent: 'scripted', command: 'rm -rf /' },
    }).success).toBe(false);
    expect(startRunCommandSchema.safeParse({
      commandId: 'c1', expectedVersion: 0, type: 'start-run', payload: { planId: 'review-notes', agent: 'other' },
    }).success).toBe(false);
  });

  test('the run serves start-run, Plan 1\'s stop-job, approve-analysis and the three CheckFinding commands, and nothing else', () => {
    expect(runCommandSchema.options.map(option => option.shape.type.value)).toEqual([
      'start-run', 'stop-job', 'approve-analysis', 'respond-to-check-finding', 'waive-check-finding', 'revoke-check-finding-waiver',
    ]);
    // There is no command that marks a CheckFinding resolved.
    expect(runCommandSchema.safeParse({
      commandId: 'c2', expectedVersion: 3, type: 'resolve-check-finding',
      payload: { planId: 'review-notes', jobId: 'run-1', checkFinding: 'cf-0001', expectedRevision: 1, responder: 'dan' },
    }).success).toBe(false);
    expect(runCommandSchema.safeParse({
      commandId: 'c1', expectedVersion: 0, type: 'start-mapping', payload: { planId: 'review-notes' },
    }).success).toBe(false);
  });
});
