import { afterEach, describe, expect, test } from 'vitest';
import { ramifyExecutable } from '../../subs/evidence/src/ramify-cli.js';
import { checkpointPolicies, allProjectChecks } from '../checks/checkpoint.js';
import { commandTimeouts, defaultLimits, defaultRunPolicy, discoverNestedPackages, nestedPackageDepth } from '../run/policy.js';
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
    await expect(RunService.open({ policy: () => defaultRunPolicy({ projectRoot: '/project', nested: [] }) } as unknown as RunServiceOptions))
      .rejects.toThrow('Production run policy is fixed');
  });
  test('are the main plan\'s table, naming the environment the harness built', () => {
    const policy = defaultRunPolicy({ projectRoot: '/project', nested: [] });
    expect(policy.version).toBe('run-policy/6');
    expect(policy.limits.maxIterationsPerCapabilityTask).toBe(24);
    expect(policy.limits.nonfunctionalRoundsPerPlan).toBe(3);
    // The first trial's review policy and reconciliation bound (Plan 12).
    expect(policy.reviews).toEqual({ version: 'review-policy/1', kinds: ['code', 'scope', 'design'], concurrency: 2, queue: 12, retries: 1, attemptMs: 600_000, settleMs: 900_000, maxConcerns: 20 });
    expect(policy.limits.reconciliationRoundsPerWorkItem).toBe(3);
    // The transcript's inline body limit is a recorded policy value.
    expect(policy.transcript).toEqual({ inlineBodyBytes: 8192 });
    expect(policy.commands.typeCheck.argv).toEqual(['npm', 'run', 'type-check']);
    expect(policy.commands.allTests.argv).toEqual(['npm', 'test']);
    expect(policy.commands.ramifyCheck.argv).toEqual([ramifyExecutable, 'check', '--batch', '--root', '/project', '--format', 'json', '--no-snapshot']);
    expect(policy.commands.ramifyChanged.argv).toEqual([ramifyExecutable, 'check', '--changed', '--format', 'json', '--deadline', '5000']);
    expect(policy.commands.hookTimeoutMs).toBe(commandTimeouts.hook);
    expect(policy.commands.typeCheck.timeoutMs).toBe(300_000);
    expect(policy.commands.allTests.timeoutMs).toBe(900_000);
    expect(policy.commands.ramifyCheck.timeoutMs).toBe(600_000);
    expect(policy.commands.ramifyChanged.timeoutMs).toBe(5_000);
    for (const command of [policy.commands.typeCheck, policy.commands.allTests, policy.commands.ramifyCheck]) {
      expect(command.cwd).toBe('/project');
      expect(command.env).toContain('PATH');
      expect(command.env).not.toContain('NODE_OPTIONS');
      expect(command.envAdditions).toEqual({});
    }
  });

  test('a nested package gets its install and its test command, or none where it has no test script', () => {
    const policy = defaultRunPolicy({
      projectRoot: '/project',
      nested: [
        { directory: 'tools', manifest: 'tools/package.json', installed: true, testScript: 'vitest run' },
        { directory: 'docs', manifest: 'docs/package.json', installed: true, testScript: null },
      ],
    });
    expect(policy.commands.nestedPackages.map(entry => entry.directory)).toEqual(['tools', 'docs']);
    expect(policy.commands.nestedPackages[0]!.install.argv).toEqual(['npm', 'ci']);
    expect(policy.commands.nestedPackages[0]!.install.cwd).toBe(join('/project', 'tools'));
    expect(policy.commands.nestedPackages[0]!.tests?.argv).toEqual(['npm', 'test']);
    expect(policy.commands.nestedPackages[1]!.tests).toBeNull();
  });

  test('the limits are the plan\'s, and the policy validates as one record', () => {
    const policy = defaultRunPolicy({ projectRoot: '/project', nested: [] });
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
    const policy = defaultRunPolicy({ projectRoot: '/project', nested: [] });
    expect(policy.context['initial-architect']).toEqual({ compaction: 'allowed', budgetTokens: 150_000, budgetFraction: 0.75, reportReserveTokens: 16_000 });
    expect(policy.context['global-fork']).toEqual({ compaction: 'forbidden', budgetTokens: 120_000, budgetFraction: 0.6, reportReserveTokens: 16_000 });
    expect(policy.context['engineer']).toEqual({ compaction: 'forbidden', budgetTokens: 140_000, budgetFraction: 0.7, reportReserveTokens: 12_000 });
    const { engineer: _dropped, ...partial } = policy.context;
    expect(runPolicySchema.safeParse({ ...policy, context: partial }).success).toBe(false);
    // A run captured before the reviewer existed has no context for it, and reads back.
    const { reviewer: _reviewer, ...earlier } = policy.context;
    expect(runPolicySchema.safeParse({ ...policy, version: 'run-policy/2', context: earlier, reviews: undefined }).success).toBe(true);
  });
});

describe('nested-package discovery', () => {
  test('does not enter a module scratch directory holding a package manifest', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await write(join(fixture.root, 'src/tmp'), { scripts: { test: 'vitest run' } }, false);
    await write(join(fixture.root, 'subs/workspace/src/tmp'), { scripts: { test: 'vitest run' } }, false);
    expect(await discoverNestedPackages(fixture.root)).toEqual([]);
  }, 60_000);

  test('finds an independent package, skips node_modules and the harness\'s own directories', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    const root = fixture.root;

    await write(join(root, 'subs/workspace/subs/catalog/tools'), { scripts: { test: 'vitest run' } }, true);
    await write(join(root, 'node_modules/some-package'), {}, false);
    await write(join(root, 'plans/review-notes/.harness'), {}, false);
    await writeFile(join(root, 'plans/review-notes/.harness/tsconfig.json'), '{ "files": [] }\n');

    const found = await discoverNestedPackages(root);
    expect(found.map(entry => entry.directory)).toEqual(['subs/workspace/subs/catalog/tools']);
    expect(found[0]).toMatchObject({ manifest: 'subs/workspace/subs/catalog/tools/package.json', installed: true, testScript: 'vitest run' });
    expect(nestedPackageDepth).toBeGreaterThanOrEqual(5);
  }, 60_000);

  test('a package with no test script is recorded with none, and the root manifest is not one', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await write(join(fixture.root, 'subs/docs'), { name: 'docs' }, false);
    const found = await discoverNestedPackages(fixture.root);
    expect(found).toEqual([{ directory: 'subs/docs', manifest: 'subs/docs/package.json', installed: false, testScript: null }]);
  }, 60_000);

  async function write(directory: string, manifest: Record<string, unknown>, installed: boolean) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), `${JSON.stringify({ name: 'nested', private: true, ...manifest }, null, 2)}\n`);
    if (installed) await mkdir(join(directory, 'node_modules'), { recursive: true });
  }
});

describe('the checkpoint policy', () => {
  test('readiness and the final gate require all project tests; only the final one commits', () => {
    expect(checkpointPolicies.readiness).toEqual({
      selection: 'all-project', nestedTests: true, committing: false, scenarios: { mode: 'quick', selection: 'all-untagged', strict: true },
    });
    expect(checkpointPolicies.final).toEqual({
      selection: 'all-project', nestedTests: false, committing: true, scenarios: { mode: 'full', selection: 'all', strict: true },
    });
    expect(checkpointPolicies.iteration.selection).toBe('owned-by-scope');
  });

  test('every checkpoint also runs the type check and a complete Ramify check', () => {
    const policy = defaultRunPolicy({
      projectRoot: '/project',
      nested: [{ directory: 'tools', manifest: 'tools/package.json', installed: true, testScript: 'vitest run' }],
    });
    const readiness = allProjectChecks(policy.commands, checkpointPolicies.readiness);
    expect(readiness.map(check => check.kind)).toEqual(['tests', 'tests', 'type-check', 'ramify-check']);
    expect(readiness[1]!.command.cwd).toBe(join('/project', 'tools'));

    const final = allProjectChecks(policy.commands, checkpointPolicies.final);
    expect(final.map(check => check.kind)).toEqual(['tests', 'type-check', 'ramify-check']);
    // No selection is attached: the project's own runner does the selecting.
    expect(final.every(check => check.selection === undefined)).toBe(true);
  });
});
