import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Script } from '../../subs/agent/src/scripted.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { analysis, entry } from './helpers/analysis.js';
import { copyCapabilityFixture, openCapabilityRuns } from './helpers/capability.js';
import { assign, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { directReadinessExecution } from './helpers/external-tools.js';
import { initRepository, runEventsOnDisk, runPath, startRun, stopRun, until } from './helpers/runs.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const a = 'capability-coordination/a';
const b = 'capability-coordination/b';

test('CA04 CA06 CA16: a pending question is durable and the retained A session answers without write equipment', async () => {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  await initRepository(fixture.root); await installMiniRunner(fixture.root);
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
  const opened = await openCapabilityRuns(fixture.root, { git: gitService, script, inputs: treeInputs(),
    readinessExecution: directReadinessExecution() });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-exchange-answered' || event.type === 'job-failed'), 30_000);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(events.filter(event => event.type === 'job-failed')).toHaveLength(0);
  const first = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    'capabilities/cap-001/exchanges/cap-001-ex01.1.json'), 'utf8')) as { answer: unknown; question: string };
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
  const current = opened.service.events('need', receipt.jobId)!;
  await opened.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence));
  await opened.service.settled('need', receipt.jobId);
}, 45_000);
