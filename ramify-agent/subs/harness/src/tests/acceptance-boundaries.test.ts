import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { acceptanceBoundaries } from './helpers/acceptance-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
afterEach(() => expect(spawnAttempts()).toEqual([]));

// The harness catches unavailable external answers. These controls prove that
// a caught unstated operation still fails the scenario's external recorder.
test.each([
  ['Git', async (fixture: ReturnType<typeof acceptanceBoundaries>) => fixture.git.currentHead('/wrong-project')],
  ['candidate', async (fixture: ReturnType<typeof acceptanceBoundaries>) => fixture.candidates.commitTree('/fixture', 'unstated')],
  ['candidate diff', async (fixture: ReturnType<typeof acceptanceBoundaries>) => fixture.candidates.diffNameStatus('/wrong-project', 'x', 'y')],
  ['provisional source', async (fixture: ReturnType<typeof acceptanceBoundaries>) => fixture.sourceGit.readBlob('/wrong-project', 'x', 'file')],
  ['audit configuration', async (fixture: ReturnType<typeof acceptanceBoundaries>) => fixture.audit.read('/wrong-project', 'x')],
  ['Ramify', async (fixture: ReturnType<typeof acceptanceBoundaries>) => fixture.ramify.run(['unstated'], '/fixture')],
] as const)('retains caught %s response errors', async (_boundary, operation) => {
  const fixture = acceptanceBoundaries('/fixture', 'revision');
  await operation(fixture).catch(() => undefined);
  expect(() => fixture.assertAnswered()).toThrow();
});

test('unused required acceptance responses fail completion', () => {
  const fixture = acceptanceBoundaries('/fixture', 'revision');
  fixture.assertAnswered();
  expect(() => fixture.assertComplete()).toThrow();
});
