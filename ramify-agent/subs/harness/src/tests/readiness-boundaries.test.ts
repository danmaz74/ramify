import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommittedAuditConfiguration, ConfiguredAuditInput, ConfiguredAuditPort } from '../../subs/audit/src/check-execution.js';
import { childEnvironment } from '../../subs/evidence/src/run-command.js';
import { readinessBoundaries, readinessHead, strictReadinessAudit, strictReadinessCommand } from './helpers/readiness-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  expect(spawnAttempts(), 'strict readiness controls start no process').toEqual([]);
});
const root = '/declared-readiness-control';
const config: CommittedAuditConfiguration = {
  sourceCommit: readinessHead, path: 'ramify-audit.json', blob: 'committed-blob', projectRoot: '.',
  checks: [{ id: 'configured-tests' }], ignorePaths: [], undetectedConfigFilesForcingFullAudit: [],
  workspace: { preparationId: 'nodejs', packageDirectoriesDeclared: false, linkNodeModules: true,
    packageDirectories: [''], setupCommands: [] },
};
const port: ConfiguredAuditPort = { async read() { return config; }, async run(input) {
  return { status: 'completed', requestId: 'control', mode: 'full', nested: true, projects: null, discovery: null,
    requestedSourceCommit: readinessHead, auditedSourceCommit: readinessHead, reused: false, reuse: null,
    requestedMode: 'full', executedMode: 'full', fallbackReason: null, verdict: 'pass', reportCommit: 'report', runRef: 'ref', treeRef: 'tree',
    definition: { path: config.path, blob: config.blob }, detail: 'synthetic control', provider: {}, checks: {} };
} };
const input: ConfiguredAuditInput = { projectRoot: root, sourceCommit: readinessHead, configuration: config,
  runId: 'readiness-fixture', attemptId: 'ga-0001', mode: 'full', nested: true };

test('readiness scripts retain an unknown Git call after its error is caught', async () => {
  const answer = readinessBoundaries(root);
  await expect(answer.options.git.commitNameStatus(root, readinessHead)).rejects.toThrow('No Git response');
  expect(() => answer.assertComplete()).toThrow('commitNameStatus');
});

test('readiness scripts retain a wrong Git project after its error is caught', async () => {
  const answer = readinessBoundaries(root);
  await expect(answer.options.git.currentHead('/other-project')).rejects.toThrow();
  expect(() => answer.assertComplete()).toThrow('currentHead');
});

test('readiness scripts refuse exhausted branch answers even when the caller catches them', async () => {
  const answer = readinessBoundaries(root); answer.expectBranches(0);
  await expect(answer.options.git.createRunBranch(root, 'readiness-fixture')).rejects.toThrow('exhausted branch');
  expect(() => answer.assertComplete()).toThrow('createRunBranch');
});

test('readiness scripts fail for an unused required branch response', () => {
  const answer = readinessBoundaries(root);
  expect(() => answer.assertComplete()).toThrow('required branch answers');
});

test('readiness audit refuses a non-nested request and retains the caught mismatch', async () => {
  const answer = strictReadinessAudit(port, root, config, ['ga-0001']);
  await answer.adapter.read(root, readinessHead);
  await expect(answer.adapter.run({ ...input, nested: false })).rejects.toThrow();
  expect(() => answer.assertComplete()).toThrow('caught audit failures');
});

test('readiness audit refuses an exhausted response and retains the caught mismatch', async () => {
  const answer = strictReadinessAudit(port, root, config, ['ga-0001']);
  await answer.adapter.read(root, readinessHead); await answer.adapter.run(input);
  await expect(answer.adapter.run(input)).rejects.toThrow();
  expect(() => answer.assertComplete()).toThrow('caught audit failures');
});

test('readiness audit fails for an unused required response', async () => {
  const answer = strictReadinessAudit(port, root, config, ['ga-0001']);
  await answer.adapter.read(root, readinessHead);
  expect(() => answer.assertComplete()).toThrow('required audit responses');
});

test('readiness command refuses wrong argv, cwd, environment and deadline and retains each caught mismatch', async () => {
  const declaration = { argv: ['npm', 'ci'], cwd: 'subs/tool', env: {}, timeoutMs: 900_000 };
  const request = { argv: ['npm', 'ci'], cwd: join(root, 'subs/tool'), env: childEnvironment({}), timeoutMs: 900_000, outputFile: '/unused/control.log' };
  for (const difference of [{ argv: ['npm', 'install'] }, { cwd: '/outside' }, { env: {} }, { timeoutMs: 1 }]) {
    const answer = strictReadinessCommand(root, declaration, 1);
    await expect(answer.run({ ...request, ...difference })).rejects.toThrow();
    expect(() => answer.assertComplete()).toThrow('caught command failures');
  }
});

test('readiness command refuses unused and exhausted required responses without starting a process', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'readiness-command-control-')); cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const declaration = { argv: ['npm', 'ci'], cwd: 'subs/tool', env: {}, timeoutMs: 900_000 };
  const request = { argv: ['npm', 'ci'], cwd: join(root, 'subs/tool'), env: childEnvironment({}), timeoutMs: 900_000, outputFile: join(directory, 'output.log') };
  const unused = strictReadinessCommand(root, declaration, 1);
  expect(() => unused.assertComplete()).toThrow('required command responses');
  const exhausted = strictReadinessCommand(root, declaration, 1);
  await exhausted.run(request);
  await expect(exhausted.run(request)).rejects.toThrow('exhausted command response');
  expect(() => exhausted.assertComplete()).toThrow('caught command failures');
});
