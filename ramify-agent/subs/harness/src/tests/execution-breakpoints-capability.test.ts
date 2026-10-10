import { afterEach, expect, test } from 'vitest';
import type { Script } from '../../subs/agent/src/scripted.js';
import { analysis, entry } from './helpers/analysis.js';
import { copyCapabilityFixture, openCapabilityRuns } from './helpers/capability.js';
import { assign, outline, submit, treeInputs } from './helpers/iterations.js';
import { recoveryBoundaries } from './helpers/recovery-boundaries.js';
import { startRun, stopRun, until } from './helpers/runs.js';

const cleanups: Array<() => Promise<void>> = [];
const answers: ReturnType<typeof recoveryBoundaries>[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  for (const answer of answers.splice(0)) answer.assertComplete();
});

test('B01 B14: a delegated capability engineer parks at a new occurrence and server loss interrupts its stack without reconciliation', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const answer = recoveryBoundaries(fixture.root, 'a');
  answers.push(answer);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.role === 'engineer') return submit({ kind: 'capability-needed', summary: 'A needs B source', request: {
      need: 'B fact with source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
      constraints: [], knownInterface: { kind: 'none-known' },
      examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
    } });
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'capability-architect') {
      const ids = [...spec.prompt.matchAll(/Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3], kind: 'assign',
        assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B source appears in A' }).assignment });
    }
    return [];
  };
  const options = { ...answer.options, script, inputs: treeInputs() };
  const first = await openCapabilityRuns(fixture.root, options);
  const start = startRun('need');
  if (start.type !== 'start-run') throw new Error('Unexpected start');
  const receipt = await first.service.execute({ ...start, payload: { ...start.payload, breakpoint: 'before-agent:engineer' } });
  await until(() => first.service.debugState('need', receipt.jobId)?.state === 'paused');
  const original = first.service.debugState('need', receipt.jobId)!;
  await first.service.execute({ commandId: 'capability-resume', expectedVersion: 0, type: 'debug-resume', payload: {
    planId: 'need', jobId: receipt.jobId, pauseId: original.pauseId, expectedRevision: 1,
  } });
  await until(() => first.service.debugState('need', receipt.jobId)?.state === 'paused');
  const delegated = first.service.debugState('need', receipt.jobId)!;
  expect(delegated.pauseId).not.toBe(original.pauseId);
  expect(delegated.work).toMatchObject({ iteration: 'cap-001.i01' });
  expect(delegated.goal).toBe('Return B source');
  expect(first.agent!.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(1);
  await first.service.close();
  const second = await openCapabilityRuns(fixture.root, { ...options, script: [] });
  cleanups.push(() => second.service.close());
  expect(second.recovery.interrupted).toEqual([`need/${receipt.jobId}`]);
  expect(second.recovery.effects).toEqual([]);
  expect(second.agent!.sessions).toHaveLength(0);
  expect(second.service.getRun('need', receipt.jobId)?.state).toBe('interrupted');
  await expect(second.service.execute(stopRun('need', receipt.jobId, second.service.getRun('need', receipt.jobId)!.version))).rejects.toMatchObject({ code: 'conflict' });
}, 30_000);
