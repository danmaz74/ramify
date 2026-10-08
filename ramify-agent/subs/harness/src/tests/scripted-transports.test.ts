import { afterEach, expect, test } from 'vitest';
import { join } from 'node:path';
import { childEnvironment, type CommandRequest } from '../../subs/evidence/src/run-command.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { inPlaceReplies } from './helpers/in-place-replies.js';
import { scratchCandidateReplies } from './helpers/scratch-candidate-replies.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

test('a caught unexpected or exhausted command reply stays a failure; unused replies fail independently', async () => {
  const directory = await temporaryDirectory(); cleanups.push(directory.remove);
  const request: CommandRequest = { argv: ['literal-command'], cwd: directory.path, env: childEnvironment(), timeoutMs: 30_000,
    outputFile: join(directory.path, '01-type-check.log'), signal: new AbortController().signal };
  const unknown = inPlaceReplies(directory.path, []);
  await unknown.runner(request).catch(() => undefined);
  expect(() => unknown.assertComplete()).toThrow();
  const exhausted = inPlaceReplies(directory.path, [{ argv: ['literal-command'] }]);
  expect((await exhausted.runner(request)).outcome).toEqual({ kind: 'completed', exitCode: 0 });
  await exhausted.runner(request).catch(() => undefined);
  expect(() => exhausted.assertComplete()).toThrow();
  const unused = inPlaceReplies(directory.path, [{ argv: ['literal-command'] }]);
  expect(() => unused.assertComplete()).toThrow();
});

test('a caught undeclared candidate observation stays a failure; exact required replies and unused replies are distinguished', async () => {
  const root = '/independent-candidate-fixture';
  const noCalls = scratchCandidateReplies(root, []);
  noCalls.assertComplete();
  await noCalls.candidates.commitTree(root, 'unexpected').catch(() => undefined);
  expect(() => noCalls.assertComplete()).toThrow();
  const exact = scratchCandidateReplies(root, [{ operation: 'commitTree', args: [root, 'source'], answer: 'literal-tree' }]);
  expect(await exact.candidates.commitTree(root, 'source')).toBe('literal-tree');
  exact.assertComplete();
  await exact.candidates.commitTree(root, 'source').catch(() => undefined);
  expect(() => exact.assertComplete()).toThrow();
  const unused = scratchCandidateReplies(root, [{ operation: 'commitTree', args: [root, 'source'], answer: 'literal-tree' }]);
  expect(() => unused.assertComplete()).toThrow();
});
