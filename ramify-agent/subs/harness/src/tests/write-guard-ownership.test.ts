import { guardedChildProcess, resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('node:child_process', async importOriginal => guardedChildProcess(await importOriginal<typeof import('node:child_process')>()));
import { writeGuardOwnership } from './helpers/write-guard-ownership.js';

beforeEach(() => resetSpawnAttempts());
afterEach(() => expect(spawnAttempts()).toEqual([]));

test('caught ownership calls with the wrong project root still fail completion', async () => {
  const script = writeGuardOwnership('/project', [['.']]);
  await expect(script.ramify.queryOwnership('/wrong', ['.'])).rejects.toThrow('ownership root');
  await expect(script.ramify.queryOwnership('/project', ['.'])).resolves.toMatchObject({ root: '/project' });
  expect(() => script.assertComplete()).toThrow('caught ownership script violations');
});

test('caught exhausted or unstated ownership queries still fail completion', async () => {
  const script = writeGuardOwnership('/project', [['.']]);
  await script.ramify.queryOwnership('/project', ['.']);
  await expect(script.ramify.queryOwnership('/project', ['.'])).rejects.toThrow('unstated or exhausted');
  expect(() => script.assertComplete()).toThrow('caught ownership script violations');
});

test('a required query cannot invent a seed outside the literal ownership facts', async () => {
  const script = writeGuardOwnership('/project', [['made-up.ts']]);
  await expect(script.ramify.queryOwnership('/project', ['made-up.ts'])).rejects.toThrow('unstated ownership path');
  expect(() => script.assertComplete()).toThrow('caught ownership script violations');
});

test('unused required ownership answers fail completion', () => {
  const script = writeGuardOwnership('/project', [['.']]);
  expect(() => script.assertComplete()).toThrow('unused required ownership answers');
});
