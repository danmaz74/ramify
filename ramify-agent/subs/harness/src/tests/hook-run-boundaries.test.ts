import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { hookRunBoundaries } from './helpers/hook-run-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
afterEach(() => expect(spawnAttempts(), 'hook boundary controls start no process').toEqual([]));
const root = '/declared-hook-project';
describe('strict hook RunService ports', () => {
  test('an unused required fixture response fails completion', () => {
    expect(() => hookRunBoundaries(root).assertComplete()).toThrow('required capture');
  });
  test('a wrong revision pair persists after the Git refusal is caught', async () => {
    const boundary = hookRunBoundaries(root);
    await expect(boundary.options.git.diffNameStatus(root, 'b'.repeat(40), 'a'.repeat(40))).rejects.toThrow('unstated diff pair');
    expect(() => boundary.assertAnswered()).toThrow('caught Git failures');
  });
  test('undeclared candidate source bytes persist after a caught read failure', async () => {
    const boundary = hookRunBoundaries(root);
    await expect(boundary.options.candidates.readBlob(root, 'a'.repeat(40), 'undeclared.ts')).rejects.toThrow('does not exist');
    expect(() => boundary.assertAnswered()).toThrow('caught external failures');
  });
  test('ownership cannot be guessed for an unstated path', async () => {
    const boundary = hookRunBoundaries(root);
    await expect(boundary.options.ramify.queryOwnership(root, ['undeclared.ts'])).rejects.toThrow('unstated ownership path');
    expect(() => boundary.assertAnswered()).toThrow('caught external failures');
  });
  test('a branch mutation exhausts and its refusal persists', async () => {
    const boundary = hookRunBoundaries(root);
    await boundary.options.git.createRunBranch(root, '20261008T080000Z-abcdef');
    await expect(boundary.options.git.createRunBranch(root, '20261008T080000Z-abcdef')).rejects.toThrow('exhausted branch');
    expect(() => boundary.assertAnswered()).toThrow('caught Git failures');
  });
  test('provisional index reads cannot fall through to native Git', async () => {
    const boundary = hookRunBoundaries(root);
    await expect(boundary.options.provisionalSourceGit.stagedPaths(root)).rejects.toThrow('no provisional index');
    expect(() => boundary.assertAnswered()).toThrow('caught external failures');
  });
});
