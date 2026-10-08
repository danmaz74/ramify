import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { capabilityFlowBoundaries, flowInitialHead } from './helpers/capability-flow-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
afterEach(() => expect(spawnAttempts()).toEqual([]));
const root = '/independently-stated-capability-flow';

test('literal flow reads answer declared bytes, topology and unavailable producer evidence without a process', async () => {
  const answers = capabilityFlowBoundaries(root, 'delegation');
  expect(await answers.options.git.currentHead(root)).toBe(flowInitialHead);
  expect(await answers.options.candidates.readBlob(root, flowInitialHead, 'subs/a/src/caller.ts'))
    .toBe('export function renderA(value: string): string { return `Fact: ${value}`; }\n');
  const ownership = await answers.options.ramify.queryOwnership(root, ['subs/b/src/fact.ts']);
  expect(ownership.selection.paths[0]).toMatchObject({ path: 'subs/b/src/fact.ts', module: 'capability-coordination/b', status: 'owned' });
  expect(await answers.options.ramify.materialize(root, 'subs/a')).toMatchObject({ ok: false });
  expect(await answers.options.provisionalSourceGit.readBlob(root, 'b'.repeat(40), 'subs/a/src/extra.ts')).toBeNull();
  answers.assertAnswered();
});

test('a caught unstated Git operation remains a teardown failure', async () => {
  const answers = capabilityFlowBoundaries(root, 'delegation');
  await expect(answers.options.git.findCommitByTrailer(root, 'Unknown', 'answer')).rejects.toThrow('No Git response');
  expect(() => answers.assertAnswered()).toThrow();
});

test('a caught unstated ownership path remains a teardown failure', async () => {
  const answers = capabilityFlowBoundaries(root, 'delegation');
  await expect(answers.options.ramify.queryOwnership(root, ['subs/unknown/src/source.ts'])).rejects.toThrow('unstated ownership');
  expect(() => answers.assertAnswered()).toThrow();
});

test('a caught unknown frozen revision remains a teardown failure', async () => {
  const answers = capabilityFlowBoundaries(root, 'delegation');
  await expect(answers.options.candidates.readBlob(root, 'unstated-commit', 'subs/a/src/caller.ts')).rejects.toThrow('no candidate');
  expect(() => answers.assertAnswered()).toThrow();
});

test('a caught unstated source byte read remains a teardown failure', async () => {
  const answers = capabilityFlowBoundaries(root, 'delegation');
  await expect(answers.options.provisionalSourceGit.readBlob(root, 'b'.repeat(40), 'subs/unknown/src/source.ts')).rejects.toThrow();
  expect(() => answers.assertAnswered()).toThrow();
});

test('a run branch answer cannot be consumed twice or hidden by a caught failure', async () => {
  const answers = capabilityFlowBoundaries(root, 'delegation');
  expect(await answers.options.git.createRunBranch(root, 'declared-run')).toEqual({ branch: 'ramify-agent-run/declared-run', created: true });
  await expect(answers.options.git.createRunBranch(root, 'declared-run')).rejects.toThrow('run branch is created once');
  expect(() => answers.assertAnswered()).toThrow();
});

test('unused required flow responses fail completion', () => {
  const answers = capabilityFlowBoundaries(root, 'delegation');
  expect(() => answers.assertComplete()).toThrow();
});
