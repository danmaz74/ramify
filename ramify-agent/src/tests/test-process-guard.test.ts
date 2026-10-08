import childProcess from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import { createProcessGuard, ProcessSpawnGuardError, spawnAttempts } from './helpers/process-guard.js';

describe('isolated process guard recorder', () => {
  test('refuses all seven named/default launch APIs and keeps immutable argument snapshots', () => {
    const recorder = createProcessGuard(childProcess);
    const module = recorder.childProcess as unknown as Record<string, (...args: unknown[]) => unknown> & { default: Record<string, (...args: unknown[]) => unknown> };
    const argv = ['--version'];
    for (const api of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
      expect(() => module[api]!('git', argv)).toThrow(ProcessSpawnGuardError);
      expect(() => module.default[api]!('git', argv)).toThrow(ProcessSpawnGuardError);
    }
    argv.push('changed-after-call');
    expect(recorder.attempts()).toHaveLength(14);
    expect(recorder.attempts()[0]).toEqual({ api: 'spawn', argv: ['git', '--version'] });
    expect(() => (recorder.attempts() as unknown as unknown[]).pop()).toThrow();
    expect(() => (recorder.attempts()[0]!.argv as string[]).push('erase')).toThrow();
    expect(recorder.attempts()).toHaveLength(14);
    expect(spawnAttempts()).toEqual([]);
  });
  test('promisified refusal rejects while retaining the launch attempt independently of other recorders', async () => {
    const first = createProcessGuard(childProcess);
    const second = createProcessGuard(childProcess);
    await expect(promisify(first.childProcess.execFile)('git', ['--version'])).rejects.toThrow(ProcessSpawnGuardError);
    expect(first.attempts()).toEqual([{ api: 'execFile', argv: ['git', '--version'] }]);
    expect(second.attempts()).toEqual([]);
    expect(spawnAttempts()).toEqual([]);
  });
});
