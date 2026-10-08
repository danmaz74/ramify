import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { dependencyBoundaries } from './helpers/dependency-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
afterEach(() => expect(spawnAttempts()).toEqual([]));

test('nested boundary script retains a caught wrong-root Git assertion', async () => {
  const boundary = dependencyBoundaries('/fixture', 'decision');
  await expect(boundary.options.git.currentHead('/elsewhere')).rejects.toThrow();
  expect(() => boundary.assertAnswered()).toThrow('caught Git');
});
test('nested boundary script retains an unknown candidate even when its reader catches it', async () => {
  const boundary = dependencyBoundaries('/fixture', 'decision');
  await expect(boundary.options.candidates.commitTree('/fixture', 'undeclared')).rejects.toThrow('no candidate');
  expect(() => boundary.assertAnswered()).toThrow('caught candidate');
});
test('nested boundary script retains a caught invalid source read', async () => {
  const boundary = dependencyBoundaries('/fixture', 'gate');
  await expect(boundary.options.provisionalSourceGit.readBlob('/fixture', 'undeclared', 'subs/b/src/fact.ts')).rejects.toThrow();
  expect(() => boundary.assertAnswered()).toThrow('caught candidate');
});
test('nested boundary script refuses an undeclared diff and requires its stated answers to be consumed', async () => {
  const boundary = dependencyBoundaries('/fixture', 'decision');
  expect(() => boundary.assertComplete()).toThrow();
  await expect(boundary.options.git.diffNameStatus('/fixture', 'undeclared', 'another')).rejects.toThrow('No nested dependency diff');
  expect(() => boundary.assertAnswered()).toThrow('caught candidate');
});
