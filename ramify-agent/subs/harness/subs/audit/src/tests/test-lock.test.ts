import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { CommandRunner } from '../../../evidence/src/run-command.js';
import { testLockedRunner } from '../test-lock.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
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

  test('two suite commands serialize on a private lock; cancellation closes a wait', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-lock-'));
    directories.push(directory);
    const lockPath = join(directory, 'test.lock');
    const override = { held: false, lockPath, findFlock: async () => '/usr/bin/flock', waitTimeoutMs: 5000 };
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const firstEntered = new Promise<void>(resolve => { entered = resolve; });
    const first: CommandRunner = async input => { entered(); await hold; return result(input.env); };
    const run1 = testLockedRunner(first, owner, {}, override)(request);
    await firstEntered;
    const waiting: string[] = [];
    const lifecycle: string[] = [];
    const second = testLockedRunner(async input => result(input.env), owner, {
      waiting: line => { waiting.push(line); lifecycle.push('waiting'); },
      acquired: () => { lifecycle.push('acquired'); },
      settled: () => { lifecycle.push('settled'); },
    }, override)(request);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(waiting[0]).toContain('Waiting for another test run');
    release();
    await run1;
    const run2 = await second;
    expect(run2.stdout).toBe('1');
    expect(run2.receivedEnvironment).toContain('RAMIFY_AUDIT_TEST_LOCK_HELD');
    expect(run2.lockWaitMs).toBeGreaterThan(0);
    expect(lifecycle).toEqual(['waiting', 'acquired', 'settled']);
  });

  test('wait expiry reports a runner error without starting the command', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-lock-expiry-'));
    directories.push(directory);
    const lockPath = join(directory, 'test.lock');
    const override = { held: false, lockPath, findFlock: async () => '/usr/bin/flock', waitTimeoutMs: 30 };
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const firstEntered = new Promise<void>(resolve => { entered = resolve; });
    const holder = testLockedRunner(async input => { entered(); await hold; return result(input.env); }, owner, {}, override)(request);
    await firstEntered;
    let ran = false;
    let settled = false;
    const expired = await testLockedRunner(async input => { ran = true; return result(input.env); }, owner,
      { settled: () => { settled = true; } }, override)(request);
    expect(expired.outcome).toMatchObject({ kind: 'runner-error', error: { kind: 'test-lock-wait-exceeded' } });
    expect(expired.elapsedMs).toBe(0);
    expect(expired.lockWaitMs).toBeGreaterThan(0);
    expect(ran).toBe(false);
    expect(settled).toBe(true);
    release();
    await holder;
  });
});
