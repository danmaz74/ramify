import { afterEach, describe, expect, test, vi } from 'vitest';
import { spawnAttempts } from '../../../../src/tests/helpers/process-guard.js';

vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('../../../../src/tests/helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});

afterEach(() => {
  expect(spawnAttempts(), 'ordinary setup/flow/teardown process attempts').toEqual([]);
});

import type { CommandRunner } from '../../../evidence/src/run-command.js';
import { testLockedRunner } from '../test-lock.js';

const owner = { repositoryPath: '/project', checkId: 'tests', command: 'npm test' };
const request = { argv: ['true'], cwd: '/project', env: { PATH: process.env.PATH ?? '' }, timeoutMs: 5000 };
const result = (env: Readonly<Record<string, string>>) => ({
  outcome: { kind: 'completed' as const, exitCode: 0 }, startedAt: new Date().toISOString(), elapsedMs: 1,
  output: { path: null, bytes: 0, truncated: false, tail: '' }, stdout: env.RAMIFY_AUDIT_TEST_LOCK_HELD ?? '', stderr: '',
});

describe('audit module test lock wrapper', () => {
  test('a nested process runs without waiting and receives the lock marker', async () => {
    const runner: CommandRunner = async input => result(input.env);
    const run = await testLockedRunner(runner, owner, {}, { held: true })(request);
    expect(run.stdout).toBe('1');
    expect(run.receivedEnvironment).toContain('RAMIFY_AUDIT_TEST_LOCK_HELD');
    expect(run.lockWaitMs).toBeUndefined();
  });

  test('unavailable lock prefixes its note and still runs', async () => {
    const runner: CommandRunner = async input => result(input.env);
    const run = await testLockedRunner(runner, owner, {}, { held: false, findFlock: async () => undefined })(request);
    expect(run.outcome.kind).toBe('completed');
    expect(run.stdout).toMatch(/^Ran without the machine test lock:/u);
  });
});
