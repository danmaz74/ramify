import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { recoveryBoundaries } from './helpers/recovery-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
import { testPolicy } from './helpers/runs.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
afterEach(() => expect(spawnAttempts(), 'ordinary recovery script controls start no processes').toEqual([]));

test('independent completion and changed-path checks consume distinct exact recovery argv without inventing a passing report', async () => {
  const root = '/declared/project';
  const answer = recoveryBoundaries(root);
  const complete = await answer.options.ramify.checkComplete(root);
  const changed = await answer.options.ramify.checkChanged(['subs/a/src/caller.ts'], root, testPolicy(root).commands.hookTimeoutMs);
  expect(complete).toMatchObject({ form: 'complete', outcome: 'not-checked' });
  expect(changed).toMatchObject({ form: 'changed', outcome: 'not-checked' });
  expect(answer.options.ramify.calls.map(call => call.argv)).toEqual([
    ['check', '--batch', '--root', root, '--format', 'json', '--no-snapshot'],
    ['check', '--changed', 'subs/a/src/caller.ts', '--format', 'json', '--deadline', String(testPolicy(root).commands.hookTimeoutMs)],
  ]);
  expect(() => answer.assertAnswered()).not.toThrow();
});

test.each([
  ['wrong completion root', ['check', '--batch', '--root', '/other/project', '--format', 'json', '--no-snapshot']],
  ['missing completion snapshot flag', ['check', '--batch', '--root', '/declared/project', '--format', 'json']],
  ['mutation deadline on completion', ['check', '--batch', '--root', '/declared/project', '--format', 'json', '--no-snapshot', '--deadline', '1']],
  ['unstated mutation path', ['check', '--changed', 'subs/unknown/src/file.ts', '--format', 'json', '--deadline', '1']],
  ['wrong mutation deadline', ['check', '--changed', 'subs/a/src/caller.ts', '--format', 'json', '--deadline', '1']],
  ['completion flags on mutation', ['check', '--changed', 'subs/a/src/caller.ts', '--format', 'json', '--no-snapshot']],
] as const)('a caught recovery %s argv violation remains visible at teardown', async (_name, argv) => {
  const answer = recoveryBoundaries('/declared/project');
  await answer.options.ramify.run(argv, '/declared/project').catch(() => undefined);
  expect(() => answer.assertAnswered()).toThrow('caught');
});

for (const operation of ['Git', 'candidate', 'source', 'Ramify'] as const) {
  test(`a caught recovery ${operation} script violation remains visible at teardown`, async () => {
    const answer = recoveryBoundaries('/declared/project');
    if (operation === 'Git') await answer.options.git.currentHead('/wrong/project').catch(() => undefined);
    if (operation === 'candidate') await answer.options.candidates.commitTree('/declared/project', 'undeclared').catch(() => undefined);
    if (operation === 'source') await answer.options.provisionalSourceGit.readBlob('/declared/project', 'undeclared', 'subs/a/src/caller.ts').catch(() => undefined);
    if (operation === 'Ramify') await answer.options.ramify.queryOwnership('/declared/project', ['subs/unknown/src/file.ts']).catch(() => undefined);
    expect(() => answer.assertAnswered()).toThrow('caught');
  });
}

test('a recovery fixture refuses a second branch creation and retains the caught exhaustion', async () => {
  const answer = recoveryBoundaries('/declared/project');
  await answer.options.git.createRunBranch('/declared/project', 'job-001');
  await answer.options.git.createRunBranch('/declared/project', 'job-001').catch(() => undefined);
  expect(() => answer.assertAnswered()).toThrow('caught');
});

test('unused required recovery answers fail fixture completion', () => {
  const answer = recoveryBoundaries('/declared/project');
  expect(() => answer.assertComplete()).toThrow();
});

test('a caught partial or unnested readiness audit request fails its recovery fixture', async () => {
  for (const request of [{ mode: 'project-default' as const, nested: true }, { mode: 'full' as const, nested: false }]) {
    const answer = recoveryBoundaries('/declared/project');
    await answer.options.git.createRunBranch('/declared/project', 'job-001');
    const configuration = await answer.options.configuredAudit.read('/declared/project', 'a'.repeat(40));
    await answer.options.configuredAudit.run({ ...request, projectRoot: '/declared/project', sourceCommit: 'a'.repeat(40), configuration,
      runId: 'job-001', attemptId: 'ga-0001' }).catch(() => undefined);
    expect(() => answer.assertAnswered()).toThrow('caught');
  }
});

test('a caught undeclared recovery daemon stop fails its fixture', async () => {
  const answer = recoveryBoundaries('/declared/project');
  await answer.options.ramify.stopDaemon().catch(() => undefined);
  expect(() => answer.assertAnswered()).toThrow('caught');
});

test('a caught exhausted recovery trailer lookup fails its fixture', async () => {
  const answer = recoveryBoundaries('/declared/project', 'a+b', true);
  await answer.options.git.createRunBranch('/declared/project', 'job-001');
  const trailers = [{ key: 'Ramify-Run', value: 'job-001' }, { key: 'Ramify-Gate', value: 'ga-0002' }];
  await answer.options.git.findCommitByTrailers('/declared/project', trailers);
  await answer.options.git.findCommitByTrailers('/declared/project', trailers).catch(() => undefined);
  expect(() => answer.assertAnswered()).toThrow('caught');
});

test('a caught exhausted no-change recovery completion answer fails its fixture', async () => {
  const answer = recoveryBoundaries('/declared/project', 'a+b', true);
  await answer.options.git.createRunBranch('/declared/project', 'job-001');
  await answer.options.git.commitAccepted('/declared/project', 'Ramify-Scenarios: materialized\nRamify-Run: job-001');
  await answer.options.git.findCommitByTrailers('/declared/project', [{ key: 'Ramify-Run', value: 'job-001' }, { key: 'Ramify-Gate', value: 'ga-0002' }]);
  const message = 'cap-001.i01: completion\nRamify-Run: job-001\nRamify-Gate: ga-0002';
  expect(await answer.options.git.commitAccepted('/declared/project', message)).toBeNull();
  await answer.options.git.commitAccepted('/declared/project', message).catch(() => undefined);
  expect(() => answer.assertAnswered()).toThrow('caught');
});
