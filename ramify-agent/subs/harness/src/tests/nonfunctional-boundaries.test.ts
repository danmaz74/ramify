import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { nfrBoundaries } from './helpers/nonfunctional-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
afterEach(() => expect(spawnAttempts(), 'NFR script controls launch no process').toEqual([]));
const root = '/scripted-nfr-controls';
const id = '20261008T060000Z-aabbcc';

test('a caught unstated Git operation remains a teardown failure', async () => {
  const answers = nfrBoundaries(root);
  await answers.options.git.findCommitByTrailer(root, 'Ramify-Gate', 'ga-0002').catch(() => undefined);
  expect(() => answers.assertAnswered()).toThrow('caught Git failures');
});

test('a caught read of an undeclared frozen candidate remains a teardown failure', async () => {
  const answers = nfrBoundaries(root);
  await answers.options.candidates.commitTree(root, 'c'.repeat(40)).catch(() => undefined);
  expect(() => answers.assertAnswered()).toThrow('caught external failures');
});

test('a caught source-byte read with an undeclared revision remains a teardown failure', async () => {
  const answers = nfrBoundaries(root, { repair: 'one-module' });
  await answers.options.provisionalSourceGit.readBlob(root, 'c'.repeat(40),
    'subs/workspace/subs/reviews/subs/core/src/repair-recovery.ts').catch(() => undefined);
  expect(() => answers.assertAnswered()).toThrow('caught external failures');
});

test('unused required capture, branch and audit answers prevent qualification', async () => {
  const answers = nfrBoundaries(root);
  expect(() => answers.assertComplete()).toThrow('required capture answer consumed exactly once');
  await answers.options.inputs.capture(root, Buffer.from('# Synthetic plan\n'), new Map());
  expect(() => answers.assertComplete()).toThrow('required branch answer consumed exactly once');
  await answers.options.git.createRunBranch(root, id);
  expect(() => answers.assertComplete()).toThrow('required readiness-audit answer consumed exactly once');
});

test('a caught exhausted branch response remains a teardown failure', async () => {
  const answers = nfrBoundaries(root);
  await answers.options.git.createRunBranch(root, id);
  await answers.options.git.createRunBranch(root, id).catch(() => undefined);
  expect(() => answers.assertAnswered()).toThrow('caught Git failures');
});

test('a caught audit request that omits the nested full policy remains a teardown failure', async () => {
  const answers = nfrBoundaries(root);
  await answers.options.configuredAudit.run({ projectRoot: root, sourceCommit: 'a'.repeat(40),
    runId: id, attemptId: 'ga-0001', mode: 'full', nested: false,
    configuration: await answers.options.configuredAudit.read(root, 'a'.repeat(40)) }).catch(() => undefined);
  expect(() => answers.assertAnswered()).toThrow('caught external failures');
});

test('declared downtime drift changes the preview while the frozen candidate bytes remain immutable', async () => {
  const answers = nfrBoundaries(root);
  const before = await answers.options.git.previewCandidateTree(root);
  const frozen = await answers.options.candidates.commitTree(root, 'a'.repeat(40));
  answers.drift('downtime-mutation.ts');
  const after = await answers.options.git.previewCandidateTree(root);
  expect(before).toEqual({ repositoryRoot: root, head: 'a'.repeat(40), tree: '1'.repeat(40) });
  expect(after).toEqual({ repositoryRoot: root, head: 'a'.repeat(40), tree: '3'.repeat(40) });
  expect(frozen).toBe('1'.repeat(40));
  expect(await answers.options.candidates.commitTree(root, 'a'.repeat(40))).toBe(frozen);
  answers.assertAnswered();
});
