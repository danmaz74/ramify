import childProcess from 'node:child_process';
import { describe, expect, test, vi } from 'vitest';
import { commitForGate } from '../run/gates.js';
import { createProcessGuard, ProcessSpawnGuardError } from '../../../../src/tests/helpers/process-guard.js';

describe('external boundary controls', () => {
  test('commit orchestration uses exact recovery identity and propagates the scripted outcome', async () => {
    const git = {
      findCommitByTrailers: vi.fn().mockResolvedValue('already-committed'),
      commitAccepted: vi.fn().mockResolvedValue('new-commit'),
    };
    const commit = () => commitForGate('/scenario', 'run-a', 'ga-0001', 'message', undefined, git);
    expect(await commit()).toBe('already-committed');
    expect(git.findCommitByTrailers).toHaveBeenLastCalledWith('/scenario', [
      { key: 'Ramify-Run', value: 'run-a' }, { key: 'Ramify-Gate', value: 'ga-0001' },
    ], undefined);
    expect(git.commitAccepted).not.toHaveBeenCalled();
    git.findCommitByTrailers.mockResolvedValue(null);
    expect(await commit()).toBe('new-commit');
    expect(git.commitAccepted).toHaveBeenLastCalledWith('/scenario', 'message', undefined);
    git.commitAccepted.mockResolvedValue(null);
    expect(await commit()).toBeNull();
    git.commitAccepted.mockRejectedValue(new Error('Git unavailable'));
    await expect(commit()).rejects.toThrow('Git unavailable');
  });

  test('the subprocess guard rejects named and default exports without starting a process', () => {
    const recorder = createProcessGuard(childProcess);
    {
      const guarded = recorder.childProcess as unknown as Record<string, (...args: unknown[]) => unknown> & {
        default: Record<string, (...args: unknown[]) => unknown>;
      };
      for (const api of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
        expect(() => guarded[api]!('not-an-executable')).toThrow(ProcessSpawnGuardError);
        expect(() => guarded.default[api]!('not-an-executable')).toThrow(ProcessSpawnGuardError);
      }
      expect(recorder.attempts()).toHaveLength(14);
    }
  });
});
