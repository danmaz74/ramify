import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { GuardDecision, GuardedCall } from '../../../../src/interfaces/port.js';
import { startPi, validMap } from './helpers/session.js';
import { call } from './helpers/scripted-provider.js';

/*
 * A guard nothing calls is no guard.
 *
 * Every writer role receives `edit` and `write`, and the adapter must ask
 * the harness before either of them executes. This is the test that fails
 * if an adapter ever stops asking: it runs a real pi session over the
 * scripted provider for each writer role, and a denied call must mutate
 * nothing while the session goes on.
 *
 * The decision here is the port's own contract, `GuardDecision`. What the
 * harness decides with it — which paths one iteration's write scope
 * contains — is its own, and is proved against real paths in the harness's
 * `write-guard` tests and in its runs.
 */

beforeAll(() => { process.env.PI_OFFLINE = '1'; });

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** The writer roles of this plan. Each of them edits and writes behind the guard. */
const writerRoles = ['engineer', 'contract-engineer'] as const;

/** The explanation a blocked call returns: the target, the scope, and what to do instead. */
const blocked = (target: string) => [
  `The target "${target}" is outside this iteration's write scope. Nothing was written.`,
  'Report the need in your submission, or ask for it through the delegation mechanism.',
].join('\n');

describe('the guard is installed for every writer role', () => {
  for (const role of writerRoles) {
    test(`${role}: a denied edit and a denied write mutate nothing, and the session continues`, async () => {
      const harness = await startPi(cleanups, [
        call('write', { path: 'outside/blocked.txt', content: 'must not appear' }, 'c-write-denied'),
        call('edit', { path: 'guarded.ts', edits: [{ oldText: 'original', newText: 'tampered' }] }, 'c-edit-denied'),
        call('write', { path: 'in-scope.ts', content: 'export const ok = 1;\n' }, 'c-write-allowed'),
        call('submit_implementation_map', validMap, 'c-submit'),
      ], {
        role,
        builtinTools: ['read', 'grep', 'ls', 'edit', 'write'],
        files: { 'guarded.ts': 'original\n' },
        deny: {},
        guard: true,
      });

      // The spec the adapter received carries a guard; the adapter is what
      // must call it.
      expect(harness.spec.guard).toBeDefined();
      await expect(harness.session.outcome).resolves.toMatchObject({ kind: 'submitted' });
      // Every mutating built-in was asked about, in order, with its call ID.
      expect(harness.guarded.map(guardedCall => [guardedCall.tool, guardedCall.callId])).toEqual([
        ['write', 'c-write-denied'],
        ['edit', 'c-edit-denied'],
        ['write', 'c-write-allowed'],
      ]);
      expect(harness.spec.role).toBe(role);
    });

    test(`${role}: what the guard denied was not written, and its reason reached the model`, async () => {
      const decisions: string[] = [];
      const deny = async (guardedCall: GuardedCall): Promise<GuardDecision> => {
        const path = (guardedCall.input as { path?: string }).path ?? '';
        decisions.push(`${guardedCall.tool}:${path}`);
        return path.startsWith('in-scope')
          ? { allow: true }
          : { allow: false, text: blocked(path) };
      };

      const harness = await startPi(cleanups, [
        call('write', { path: 'outside/blocked.txt', content: 'must not appear' }, 'c-1'),
        call('edit', { path: 'guarded.ts', edits: [{ oldText: 'original', newText: 'tampered' }] }, 'c-2'),
        call('write', { path: 'in-scope.ts', content: 'export const ok = 1;\n' }, 'c-3'),
        call('submit_implementation_map', validMap, 'c-4'),
      ], {
        role,
        builtinTools: ['read', 'grep', 'ls', 'edit', 'write'],
        files: { 'guarded.ts': 'original\n' },
        // The decision is by target, as one iteration's write scope decides.
        decide: deny,
      });

      await expect(harness.session.outcome).resolves.toMatchObject({ kind: 'submitted' });
      expect(decisions).toEqual(['write:outside/blocked.txt', 'edit:guarded.ts', 'write:in-scope.ts']);

      // Nothing the guard denied happened, and what it allowed did.
      expect(existsSync(join(harness.workingDirectory, 'outside', 'blocked.txt'))).toBe(false);
      expect(readFileSync(join(harness.workingDirectory, 'guarded.ts'), 'utf8')).toBe('original\n');
      expect(readFileSync(join(harness.workingDirectory, 'in-scope.ts'), 'utf8')).toBe('export const ok = 1;\n');

      // The reason reached the model as that call's error result, and the
      // session went on to submit.
      const sent = harness.requestText(harness.scripted.requests.length - 1);
      expect(sent).toContain('outside this iteration\'s write scope');
      expect(sent).toContain('Report the need in your submission');
      expect(harness.events).toContainEqual(expect.objectContaining({ type: 'tool-finished', callId: 'c-1', isError: true }));
      expect(harness.events).toContainEqual(expect.objectContaining({ type: 'tool-finished', callId: 'c-3', isError: false }));
    });
  }
});
