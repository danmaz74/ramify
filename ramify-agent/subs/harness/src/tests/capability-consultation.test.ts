import { capabilityFlowBoundaries } from './helpers/capability-flow-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Script } from '../../subs/agent/src/scripted.js';
import { analysis, entry } from './helpers/analysis.js';
import { copyCapabilityFixture, openCapabilityRuns } from './helpers/capability.js';
import { assign, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { runEventsOnDisk, runPath, startRun, stopRun, until } from './helpers/runs.js';

vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(() => resetSpawnAttempts());
const answers: ReturnType<typeof capabilityFlowBoundaries>[] = [];
async function openGuardedCapabilityRuns(root: string, answers: ReturnType<typeof capabilityFlowBoundaries>, options: Parameters<typeof openCapabilityRuns>[1]) {
  return openCapabilityRuns(root, { ...options, ...(options.script === undefined ? {} : { script: answers.script(options.script) }) });
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
  for (const answer of answers.splice(0)) try { answer.assertComplete(); } catch (error) { errors.push(error); }
  try { expect(spawnAttempts(), 'ordinary capability setup/flow/teardown process attempts').toEqual([]); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'Capability flow fixture teardown failed');
});
const a = 'capability-coordination/a';
const b = 'capability-coordination/b';

test('CA04 CA06 CA16: a pending question is durable and the retained A session answers without write equipment', async () => {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  const boundaryAnswers = capabilityFlowBoundaries(fixture.root, 'consultation', 'a'); answers.push(boundaryAnswers);

  let architectTurns = 0;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('richer-a-fact', a)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.submission.name === 'answer_capability_consultation') {
      expect(spec.session.mode).toBe('continue');
      expect(spec.builtinTools).toEqual(['read', 'grep', 'ls']);
      return submit({ answer: 'A needs the B source beside the value', objections: [] },
        write('caller.ts', 'export const disallowed = true;\n'));
    }
    if (spec.role === 'engineer') return submit({ kind: 'capability-needed', summary: 'A needs B source', request: {
      need: 'B fact with source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
      constraints: [], knownInterface: { kind: 'none-known' },
      examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
    } });
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      const basis = { task: ids[1], planRevision: Number(ids[2]), invocation: ids[3] };
      if (architectTurns === 1) return submit({ ...basis, kind: 'consult-consumer',
        question: 'What does the calling code require?', sections: ['need'], references: ['subs/a/src/caller.ts'] });
      if (architectTurns === 2) return submit({ ...basis, kind: 'partial', progress: 'Consumer answered',
        unfinished: ['Implementation and acceptance remain'] });
      return [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const opened = await openGuardedCapabilityRuns(fixture.root, boundaryAnswers, { ...boundaryAnswers.options, script, inputs: treeInputs(),
    });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-exchange-answered' || event.type === 'job-failed'), 30_000);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(events.filter(event => event.type === 'job-failed')).toHaveLength(0);
  const first = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    'capabilities/cap-001/exchanges/cap-001-ex01.1.json'), 'utf8')) as { answer: unknown; question: string };
  await until(async () => {
    try { await readFile(runPath(fixture.root, 'need', receipt.jobId, 'capabilities/cap-001/exchanges/cap-001-ex01.2.json')); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  });
  const second = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    'capabilities/cap-001/exchanges/cap-001-ex01.2.json'), 'utf8')) as { answer: { text: string } };
  expect(first.answer).toBeNull();
  expect(first.question).toBe('What does the calling code require?');
  expect(second.answer.text).toContain('B source');
  expect(await readFile(join(fixture.root, 'subs/a/src/caller.ts'), 'utf8')).not.toContain('disallowed');
  expect(events.filter(event => event.type === 'writer-acquired')).toHaveLength(1);
  const engineer = events.filter((event): event is Extract<typeof event, { type: 'invocation-started' }> =>
    event.type === 'invocation-started' && event.data.role === 'engineer');
  expect(engineer[1]?.data.session).toBe(engineer[0]?.data.session);
  expect(engineer[1]?.data.start).toBe('continued');
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).filter(event =>
    event.type === 'invocation-ended' && (opened.service.events('need', receipt.jobId) ?? []).some(start =>
      start.type === 'invocation-started' && start.data.invocation === event.data.invocation &&
      start.data.role === 'capability-architect')).length >= 2);
  let stopped = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = opened.service.events('need', receipt.jobId)!;
    try {
      await opened.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence));
      stopped = true;
      break;
    } catch (error) {
      if (!String(error).includes('at version')) throw error;
    }
  }
  expect(stopped).toBe(true);
  await opened.service.settled('need', receipt.jobId);
  const finished = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(finished.filter(event => event.type === 'job-stopped')).toHaveLength(1);
  expect(finished.filter(event => event.type === 'capability-handed-back')).toHaveLength(0);
}, 45_000);
