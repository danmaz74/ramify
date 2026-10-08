import { afterEach, describe, expect, test } from 'vitest';
import { ramifyExecutable } from '../../subs/evidence/src/ramify-cli.js';
import { checkpointPolicies, diagnosisChecks } from '../checks/checkpoint.js';
import { commandTimeouts, defaultLimits, defaultRunPolicy } from '../run/policy.js';
import { runPolicySchema } from '../run/records.js';
import { RunService, type RunServiceOptions } from '../run/service.js';
import { copyFixture } from './helpers/fixture.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/*
 * The policy a run captures: the bounds it ran under and the commands it
 * reached the project through. It is hardcoded and recorded, not
 * configurable while the run runs, so an exhaustion is reproducible.
 *
 * `env` names the variables the harness's allowlist gives the child and holds
 * no value of one; `recorded-environment.test.ts` covers what that keeps out.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe('the captured commands', () => {
  test('production constructor refuses policy injection before creating a service', async () => {
    await expect(RunService.open({ policy: () => defaultRunPolicy({ projectRoot: '/project' }) } as unknown as RunServiceOptions))
      .rejects.toThrow('Production run policy is fixed');
  });
  test('are the main plan\'s table, naming the environment the harness built', () => {
    const policy = defaultRunPolicy({ projectRoot: '/project' });
    expect(policy.version).toBe('run-policy/7');
    expect(policy.limits.maxIterationsPerCapabilityTask).toBe(24);
    expect(policy.limits.nonfunctionalRoundsPerPlan).toBe(3);
    // The first trial's review policy and reconciliation bound (Plan 12).
    expect(policy.reviews).toEqual({ version: 'review-policy/1', kinds: ['code', 'scope', 'design'], concurrency: 2, queue: 12, retries: 1, attemptMs: 600_000, settleMs: 900_000, maxConcerns: 20 });
    expect(policy.limits.reconciliationRoundsPerWorkItem).toBe(3);
    // The transcript's inline body limit is a recorded policy value.
    expect(policy.transcript).toEqual({ inlineBodyBytes: 8192 });
    expect(policy.commands.typeCheck.argv).toEqual(['npm', 'run', 'type-check']);
    // No test command is captured: a run's gates ask the committed audit,
    // whose definition names the project's suites and scenario checks.
    expect(Object.keys(policy.commands).sort()).toEqual(['hookTimeoutMs', 'ramifyChanged', 'ramifyCheck', 'typeCheck']);
    expect(policy.commands.ramifyCheck.argv).toEqual([ramifyExecutable, 'check', '--batch', '--root', '/project', '--format', 'json', '--no-snapshot']);
    expect(policy.commands.ramifyChanged.argv).toEqual([ramifyExecutable, 'check', '--changed', '--format', 'json', '--deadline', '5000']);
    expect(policy.commands.hookTimeoutMs).toBe(commandTimeouts.hook);
    expect(policy.commands.typeCheck.timeoutMs).toBe(300_000);
    expect(policy.commands.ramifyCheck.timeoutMs).toBe(600_000);
    expect(policy.commands.ramifyChanged.timeoutMs).toBe(5_000);
    for (const command of [policy.commands.typeCheck, policy.commands.ramifyCheck]) {
      expect(command.cwd).toBe('/project');
      expect(command.env).toContain('PATH');
      expect(command.env).not.toContain('NODE_OPTIONS');
      expect(command.envAdditions).toEqual({});
    }
  });

  test('the limits are the plan\'s, and the policy validates as one record', () => {
    const policy = defaultRunPolicy({ projectRoot: '/project' });
    expect(policy.limits).toEqual(defaultLimits);
    expect(defaultLimits).toMatchObject({
      repairRoundsPerIteration: 3, repairRoundsPerWorkItemGate: 3, infrastructureRetriesPerGate: 2,
      forkRetriesPerRequest: 2, budgetReturnsPerIteration: 6, sessionReconstructionsPerWork: 2,
      cycleReplansPerWorkItem: 1, rejectedSubmissionsPerTurn: 3, rejectedToolInputsPerTurn: 3,
      readinessRecoveries: 2, stopSettleMs: 30_000, writerSettleMs: 30_000,
      invocationIdleMs: 300_000, invocationAbsoluteMs: 3_600_000,
      maxIterationsPerWorkItem: 12, maxWorkItems: 64, maxPlacementRequests: 32,
      maxInvocationsPerRun: 400, runAbsoluteMs: 28_800_000,
    });
    expect(runPolicySchema.parse(policy)).toEqual(policy);
  });

  test('every role has its context policy, and a role with none is refused', () => {
    const policy = defaultRunPolicy({ projectRoot: '/project' });
    expect(policy.context['initial-architect']).toEqual({ compaction: 'allowed', budgetTokens: 150_000, budgetFraction: 0.75, reportReserveTokens: 16_000 });
    expect(policy.context['global-fork']).toEqual({ compaction: 'forbidden', budgetTokens: 120_000, budgetFraction: 0.6, reportReserveTokens: 16_000 });
    expect(policy.context['engineer']).toEqual({ compaction: 'forbidden', budgetTokens: 140_000, budgetFraction: 0.7, reportReserveTokens: 12_000 });
    const { engineer: _dropped, ...partial } = policy.context;
    expect(runPolicySchema.safeParse({ ...policy, context: partial }).success).toBe(false);
    // A run captured before the reviewer existed has no context for it, and reads back.
    const { reviewer: _reviewer, ...earlier } = policy.context;
    expect(runPolicySchema.safeParse({ ...policy, version: 'run-policy/2', context: earlier, reviews: undefined }).success).toBe(false);
  });
});

describe('new-run policy does not infer packages', () => {
  test('an unrelated manifest and a deep setup-only manifest add no command to the policy', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    for (const directory of ['subs/unrelated', 'subs/a/subs/b/subs/c/subs/d/tools']) {
      await mkdir(join(fixture.root, directory), { recursive: true });
      await writeFile(join(fixture.root, directory, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
    }
    const policy = defaultRunPolicy({ projectRoot: fixture.root });
    expect(Object.keys(policy.commands).sort()).toEqual(['hookTimeoutMs', 'ramifyChanged', 'ramifyCheck', 'typeCheck']);
  }, 60_000);
});

describe('the checkpoint policy', () => {
  test('readiness and the final gate request the full audit; ordinary gates leave the mode to the provider; readiness alone commits nothing', () => {
    expect(checkpointPolicies).toEqual({
      readiness: { committing: false, audit: 'full' },
      iteration: { committing: true, audit: 'project-default' },
      contract: { committing: true, audit: 'project-default' },
      'breaking-iteration': { committing: true, audit: 'project-default' },
      'work-item': { committing: true, audit: 'project-default' },
      final: { committing: true, audit: 'full' },
    });
  });

  test('a standalone diagnosis runs the project\'s setup, its type check and a complete Ramify check, and no test', () => {
    const policy = defaultRunPolicy({ projectRoot: '/project' });
    const checks = diagnosisChecks(policy.commands, [{ name: 'build', command: ['npm', 'run', 'build'] }], '/project');
    expect(checks.map(check => check.kind)).toEqual(['setup', 'type-check', 'ramify-check']);
    expect(checks[0]!.command.cwd).toBe('/project');
    expect(checks[1]!.command).toEqual(policy.commands.typeCheck);
    expect(checks[2]!.command).toEqual(policy.commands.ramifyCheck);
    expect(diagnosisChecks(policy.commands, [], '/project').map(check => check.kind)).toEqual(['type-check', 'ramify-check']);
  });
});
