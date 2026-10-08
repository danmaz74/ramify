import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { childEnvironment } from '../../subs/evidence/src/run-command.js';
import { shellDefaultTimeoutMs } from '../tools/shell.js';
import { commandResult } from './helpers/command-result.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { externalResponseRecorder, literalOwnershipRamify, settlementBoundaries, strictMarkerCommand, strictSessionCommand } from './helpers/settlement-boundaries.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const failures: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) { try { await cleanup(); } catch (error) { failures.push(error); } }
  try { expectNoProcesses(); } catch (error) { failures.push(error); } finally { forgetExternalTools(); }
  if (failures.length) throw new AggregateError(failures, 'control cleanup failed');
});

test('a caught undeclared Git operation remains a settlement script failure', async () => {
  const boundary = settlementBoundaries('/declared');
  await boundary.options.git.createRunBranch('/declared', 'run').catch(() => undefined);
  expect(() => boundary.assertComplete()).toThrow(/caught Git violations/u);
});

test('a caught candidate read remains a settlement script failure', async () => {
  const boundary = settlementBoundaries('/declared');
  await boundary.options.candidates.commitTree('/declared', 'unknown').catch(() => undefined);
  expect(() => boundary.assertComplete()).toThrow(/caught external violations/u);
});

test('a caught provisional read remains a settlement script failure', async () => {
  const boundary = settlementBoundaries('/declared');
  await boundary.options.provisionalSourceGit.stagedPaths().catch(() => undefined);
  expect(() => boundary.assertComplete()).toThrow(/caught external violations/u);
});

test('a caught audit execution remains a settlement script failure', async () => {
  const boundary = settlementBoundaries('/declared');
  await boundary.options.configuredAudit.run({ projectRoot: '/declared', sourceCommit: 'a'.repeat(40), runId: 'run', attemptId: 'gate',
    mode: 'full', configuration: await boundary.options.configuredAudit.read('/declared', 'a'.repeat(40)) }).catch(() => undefined);
  expect(() => boundary.assertComplete()).toThrow(/caught external violations/u);
});

test('a caught command execution remains a settlement script failure', async () => {
  const boundary = settlementBoundaries('/declared');
  await boundary.options.commandExecution().catch(() => undefined);
  expect(() => boundary.assertComplete()).toThrow(/caught external violations/u);
});

test('declared literal ownership is independent of an absent filesystem', async () => {
  const boundary = literalOwnershipRamify('/absent', true);
  const answer = await boundary.ramify.queryOwnership('/absent', ['subs/workspace/subs/reviews/subs/notes/src/notes.ts']);
  expect(answer.selection.paths).toMatchObject([{ module: 'collection-review/workspace/reviews/notes', status: 'owned' }]);
  await expect(boundary.refresh('/absent')).resolves.toMatchObject({ revision: 'scripted-settlement/1' });
  boundary.assertComplete();
});

test('a caught unknown ownership path remains a script failure', async () => {
  const boundary = literalOwnershipRamify('/declared', true);
  await boundary.ramify.queryOwnership('/declared', ['undeclared.ts']).catch(() => undefined);
  expect(() => boundary.assertComplete()).toThrow(/caught ownership violations/u);
});

test('a caught undeclared Ramify operation remains a script failure', async () => {
  const boundary = literalOwnershipRamify('/declared');
  await boundary.ramify.run(['check'], '/declared').catch(() => undefined);
  expect(() => boundary.assertComplete()).toThrow(/caught ownership violations/u);
});

test('a required marker response cannot remain unused', () => {
  const command = strictMarkerCommand('/declared', '/declared/written.txt');
  expect(() => command.assertComplete()).toThrow(/required marker command/u);
});

test('a caught marker argument mismatch remains a script failure', async () => {
  const command = strictMarkerCommand('/declared', '/declared/written.txt');
  await command.run({ argv: ['bash', '-c', 'wrong'], cwd: '/declared', env: childEnvironment(), timeoutMs: shellDefaultTimeoutMs,
    outputFile: '/declared/output/1.log' }).catch(() => undefined);
  expect(() => command.assertComplete()).toThrow(/caught command violations/u);
});

test('a declared command persists its output and cannot be reused after consumption', async () => {
  const directory = await temporaryDirectory(); cleanups.push(directory.remove);
  const outputFile = join(directory.path, 'plans/.harness/sessions/session/shell/001.log');
  const command = strictSessionCommand(directory.path, directory.path, 'echo checking', request => commandResult(request, { stdout: 'checking\n' }));
  const request = { argv: ['bash', '-c', 'echo checking'], cwd: directory.path, env: childEnvironment(), timeoutMs: shellDefaultTimeoutMs, outputFile };
  await expect(command.run(request)).resolves.toMatchObject({ stdout: 'checking\n', output: { bytes: 9 } });
  command.assertComplete();
  await command.run(request).catch(() => undefined);
  expect(() => command.assertComplete()).toThrow(/caught session boundary violations/u);
});

test('a caught callback assertion remains visible to the isolated response recorder', async () => {
  const recorder = externalResponseRecorder();
  await recorder.answer(async () => { expect('wrong-form').toBe('changed'); }).catch(() => undefined);
  expect(() => recorder.assertComplete()).toThrow(/caught session boundary violations/u);
});
