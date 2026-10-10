import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createPiAgentOn } from '../pi-agent.js';
import { nativeCall, nativeText, preservingPi } from './helpers/session.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('B17: installed Pi preserves explanatory history, exact caller input, normal guard and judge through resumed submission', async () => {
  const first = 'Ordinary task: change the owned parser.\n\nExplain your interpretation. Do not edit or submit.\n';
  const followup = 'How will you preserve the valid single project?\n';
  const proceed = 'Ordinary task continuation.\n\nNow implement and submit the ordinary result.\n';
  const f = await preservingPi(cleanups, [
    [nativeCall('write', { path: 'outside.ts', content: 'unauthorized' }, 'outside')],
    [nativeText('I understand the parser task and its scope.')],
    [nativeText('I will retain the single project semantics.')],
    [nativeCall('submit_map', { summary: 'invalid first result' }, 'invalid')],
    [nativeCall('submit_map', { summary: 'implemented ordinary result' }, 'accepted')],
  ], { builtins: ['read', 'write'], instructions: 'Ordinary engineer instructions: use the normal tools and submit the task.',
    verdicts: [{ accepted: false, errors: ['This result does not satisfy the assignment.'] }, { accepted: true }] });
  let guards = 0;
  const bindings = (message: string) => ({ ...f.bindings, task: { ...f.task, message },
    guard: async () => { guards++; return { allow: false as const, text: 'outside the assigned owner' }; } });
  const one = await f.operations.continue(f.input(f.initial.point!, 'explanation', bindings(first)));
  const r1 = await one.receipt;
  expect(await one.settled()).toEqual(r1);
  expect(r1).toMatchObject({ status: 'completed', outcome: { kind: 'ended' } });
  expect(guards).toBe(1);
  await expect(readFile(join(f.workingDirectory, 'outside.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(f.judged).toEqual([]);
  // A new adapter rebuilds the exact retained logical point; no SDK object is kept alive.
  const operations = createPiAgentOn(f.source).bindSessionStore!(f.store);
  const two = await operations.continue(f.input(r1.point!, 'followup', bindings(followup)));
  const r2 = await two.receipt;
  expect(await two.settled()).toEqual(r2);
  expect(r2).toMatchObject({ sessionId: r1.sessionId, outcome: { kind: 'ended' } });
  const three = await operations.continue(f.input(r2.point!, 'resume', bindings(proceed)));
  const r3 = await three.receipt;
  expect(await three.settled()).toEqual(r3);
  expect(r3).toMatchObject({ sessionId: r1.sessionId, outcome: { kind: 'submitted', input: { summary: 'implemented ordinary result' } } });
  expect(f.judged).toEqual([{ summary: 'invalid first result' }, { summary: 'implemented ordinary result' }]);
  const wire = f.native.wireRequests;
  expect(wire).toHaveLength(5);
  expect(wire[0]!['instructions']).toContain('Ordinary engineer instructions');
  expect(JSON.stringify(wire[0]!['input'])).toContain(JSON.stringify(first).slice(1, -1));
  expect(JSON.stringify(wire[2])).toContain('I understand the parser task and its scope.');
  expect(JSON.stringify(wire[2])).toContain(JSON.stringify(followup).slice(1, -1));
  expect(JSON.stringify(wire[3])).toContain('I will retain the single project semantics.');
  expect(JSON.stringify(wire[3])).toContain(JSON.stringify(proceed).slice(1, -1));
  expect(JSON.stringify(wire[4])).toContain('This result does not satisfy the assignment.');
  expect(f.native.wireHeaders.every(value => value.sessionId === r1.sessionId)).toBe(true);
  const snapshot = (await operations.inspect('pi-test', r3.sessionId, r3.point!))!;
  expect(snapshot.transcript.filter(entry => entry.kind === 'provider' && entry.key.includes(':pi-request:'))).toHaveLength(5);
  f.native.verify();
}, 30_000);
