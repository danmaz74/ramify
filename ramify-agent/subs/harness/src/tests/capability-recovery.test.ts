import { readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Script } from '../../subs/agent/src/scripted.js';
import { analysis, entry } from './helpers/analysis.js';
import { RunLog, type RunEvent } from '../run/log.js';
import { measurementSnapshotSchema, runLayout, snapshotId, type InvocationOutcome } from '../run/records.js';
import { committedRecords } from '../work/committed.js';
import { replayCapabilityState } from '../capability/state.js';
import { copyCapabilityFixture, openCapabilityRuns } from './helpers/capability.js';
import { assign, edit, outline, submit, treeInputs } from './helpers/iterations.js';
import { freeze, runEventsOnDisk, runPath, staleCrashLock, startRun, stopRun, testPolicy, until } from './helpers/runs.js';

import { recoveryBoundaries } from './helpers/recovery-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
const answers: ReturnType<typeof recoveryBoundaries>[] = [];
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
  for (const answer of answers.splice(0)) try { answer.assertComplete(); } catch (error) { errors.push(error); }
  try { expect(spawnAttempts(), 'ordinary recovery setup/flow/teardown process attempts').toEqual([]); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'Recovery fixture teardown failed');
});

async function lostBWriterCase(restartBeforeSettlement: boolean): Promise<void> {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = recoveryBoundaries(fixture.root, 'a');
  answers.push(boundaryAnswers);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let engineerTurns = 0;
  let architectTurns = 0;
  const prompts: string[] = [];
  let frozen = false;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') {
      engineerTurns += 1;
      if (engineerTurns === 1) return submit({ kind: 'capability-needed', summary: 'A needs source', request: {
        need: 'B fact with source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
        constraints: [], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
      } });
      prompts.push(spec.prompt);
      if (engineerTurns === 2) { boundaryAnswers.stage('b'); return [edit('fact.ts', "return 'old';", "return 'old from B';"), { kind: 'end', message: 'Context lost before submission' }]; }
      throw new Error('An ended engineer must close partial rather than restart automatically');
    }
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      const ids = [...spec.prompt.matchAll(/Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return architectTurns === 1 ? submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        kind: 'assign', assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B source appears in A' }).assignment }) : [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { ...boundaryAnswers.options, script, inputs: treeInputs(),
    ...(restartBeforeSettlement ? {
      policy: (root: string) => ({ ...testPolicy(root), limits: {
        ...testPolicy(root).limits, sessionReconstructionsPerWork: 1,
      } }),
      afterWrite: async (write: string) => {
        if (write === 'invocation-ended' && engineerTurns === 2 && !frozen) { frozen = true; await freeze(); }
      },
    } : {}) };
  let opened = await openCapabilityRuns(fixture.root, options);
  const receipt = await opened.service.execute(startRun('need'));
  if (restartBeforeSettlement) {
    await until(() => frozen, 30_000);
    await staleCrashLock(fixture.root);
    opened = await openCapabilityRuns(fixture.root, options);
  }
  cleanups.push(() => opened.service.close());
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-assignment-settled' || event.type === 'job-failed'), 30_000);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const failedOutcomes = await Promise.all(events.flatMap(event => event.type === 'invocation-ended' && event.data.ended === 'failed'
    ? [readFile(runPath(fixture.root, 'need', receipt.jobId, `invocations/${event.data.invocation}/outcome.json`), 'utf8')] : []));
  expect(events.filter(event => event.type === 'job-failed'), JSON.stringify({ tail: events.slice(-12), failedOutcomes })).toHaveLength(0);
  expect(events.filter(event => event.type === 'capability-assigned')).toHaveLength(1);
  expect(events.filter(event => event.type === 'capability-assignment-settled')).toHaveLength(1);
  expect(events.filter(event => event.type === 'invocation-started' && event.data.role === 'engineer' &&
    event.data.work.iteration === 'cap-001.i01')).toHaveLength(1);
  const partial = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    'work-items/cap-001/iterations/01/result.json'), 'utf8')) as { outcome: string; gate: string | null; findings: string[]; failure?: unknown };
  expect(partial).toMatchObject({ outcome: 'partial', gate: null });
  expect(partial.findings.join(' ')).toContain('ended without a result');
  expect(partial.failure).toBeDefined();
  expect(events.filter(event => event.type === 'capability-handed-back')).toHaveLength(0);
  expect(await readFile(join(fixture.root, 'subs/b/src/fact.ts'), 'utf8')).toContain('old from B');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = opened.service.events('need', receipt.jobId)!;
    try {
      await opened.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence));
      break;
    } catch (error) {
      if (!String(error).includes('at version') || attempt === 19) throw error;
    }
  }
  await opened.service.settled('need', receipt.jobId);
}

test('CA18 CA26 CA29: an ended B writer keeps dirty source and closes partial through ordinary failure analysis',
  () => lostBWriterCase(false), 45_000);
test('CA18 CA26 CA29: restart after an ended B writer preserves its ordinary partial result without a second writer',
  () => lostBWriterCase(true), 45_000);

test('CA05 CA19 CA22 CA32: service restart continues the durable active architect without dispatching the B entry', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = recoveryBoundaries(fixture.root, 'a+b', true);
  answers.push(boundaryAnswers);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let architectTurns = 0;
  let engineerTurns = 0;
  let frozen = false;
  const starts: string[] = [];
  const prompts: string[] = [];
  const script: Script = spec => {
    starts.push(`${spec.role}:${spec.submission.name}:${spec.session.mode}`);
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') {
      engineerTurns += 1;
      return engineerTurns === 1 ? submit({ kind: 'capability-needed', summary: 'A needs source', request: {
        need: 'B fact with source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
        constraints: [], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
      } }) : submit({ kind: 'completion-proposed', summary: 'B source provided', findings: [] });
    }
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      prompts.push(spec.prompt);
      const ids = [...spec.prompt.matchAll(/Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      const basis = { task: ids[1], planRevision: Number(ids[2]), invocation: ids[3] };
      if (architectTurns === 1) return submit({ ...basis, kind: 'partial', progress: 'A source inspected',
        unfinished: ['Assign B'] });
      if (architectTurns === 2) return submit({ ...basis, kind: 'assign', assignment: assign(b, { goal: 'Provide B source', approach: 'Update B owned source', completionEvidence: 'A uses B source' }).assignment });
      return [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { ...boundaryAnswers.options, script, inputs: treeInputs(),
    afterWrite: async (write: string, runId: string) => {
      if (write !== 'capability-coordinator-resumed' || frozen) return;
      const events = await runEventsOnDisk(fixture.root, 'need', runId);
      if (events.at(-1)?.type === 'capability-coordinator-resumed') { frozen = true; await freeze(); }
    } };
  const first = await openCapabilityRuns(fixture.root, options);
  const receipt = await first.service.execute(startRun('need'));
  await until(() => frozen, 30_000);
  await staleCrashLock(fixture.root);
  const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(before.filter(event => event.type === 'capability-delegated')).toHaveLength(1);
  const second = await openCapabilityRuns(fixture.root, options);
  cleanups.push(() => second.service.close());
  expect(second.recovery.effects, JSON.stringify({ recovery: second.recovery,
    tail: (await runEventsOnDisk(fixture.root, 'need', receipt.jobId)).slice(-8) })).toContainEqual(
    expect.stringContaining('resumed capability coordination'));
  await until(() => (second.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-assignment-settled' || event.type === 'job-failed'), 30_000);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(events.filter(event => event.type === 'job-failed')).toHaveLength(0);
  expect(events.filter(event => event.type === 'capability-delegated')).toHaveLength(1);
  expect(events.filter(event => event.type === 'capability-assigned')).toHaveLength(1);
  expect(events.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
  expect(starts.filter(entry => entry === 'capability-architect:submit_capability_action:fresh')).toHaveLength(1);
  expect(starts).toContain('capability-architect:submit_capability_action:continue');
  const architectStarts = events.filter(event => event.type === 'invocation-started' && event.data.role === 'capability-architect');
  expect(architectStarts[1]?.type === 'invocation-started' ? architectStarts[1].data.session : null)
    .toBe(architectStarts[0]?.type === 'invocation-started' ? architectStarts[0].data.session : null);
  expect(prompts[1]).toContain('# Selected plan package ');
  expect(prompts[1]).toContain('Current plan:');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = second.service.events('need', receipt.jobId)!;
    try { await second.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
    catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
  }
  await second.service.settled('need', receipt.jobId);
}, 60_000);

test('restart preserves raw capability context exhaustion as unfinished failure without another dispatch', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = recoveryBoundaries(fixture.root);
  answers.push(boundaryAnswers);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let architectTurns = 0;
  const starts: string[] = [];
  const script: Script = spec => {
    starts.push(`${spec.role}:${spec.submission.name}:${spec.session.mode}`);
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') return submit({ kind: 'capability-needed', summary: 'A needs source', request: {
      need: 'B fact with source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
      constraints: [], knownInterface: { kind: 'none-known' },
      examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
    } });
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      const ids = [...spec.prompt.matchAll(/Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      if (architectTurns === 1) return [
        { kind: 'context', tokens: 200_000, window: null },
        { kind: 'message', text: 'The capability task is unfinished at my context budget.' },
      ];
      return submit({ kind: 'assign', task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        assignment: assign(b, { goal: 'Provide B source', approach: 'Update B owned source', completionEvidence: 'A uses B source' }).assignment });
    }
    return [];
  };
  const options = { ...boundaryAnswers.options, script, inputs: treeInputs() };
  const first = await openCapabilityRuns(fixture.root, options);
  const receipt = await first.service.execute(startRun('need'));
  await first.service.settled('need', receipt.jobId);
  const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(before.find(event => event.type === 'job-failed')?.data).toMatchObject({ reason: 'limit-exceeded', message: expect.stringContaining('unfinished task remains') });
  expect(before.filter(event => event.type === 'capability-assigned' || event.type === 'capability-handed-back')).toEqual([]);
  await first.service.close();
  const second = await openCapabilityRuns(fixture.root, options); cleanups.push(() => second.service.close());
  expect(second.recovery.effects).toEqual([]);
  expect(await runEventsOnDisk(fixture.root, 'need', receipt.jobId)).toEqual(before);
  expect(starts.filter(start => start.startsWith('capability-architect:'))).toEqual(['capability-architect:submit_capability_action:fresh']);
}, 60_000);

test('CA19: accepted qualification before delegation replays one decision after restart', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = recoveryBoundaries(fixture.root);
  answers.push(boundaryAnswers);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let frozen = false;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') return submit({ kind: 'capability-needed', summary: 'A needs source', request: {
      need: 'B fact for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
      constraints: [], knownInterface: { kind: 'none-known' },
      examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
    } });
    if (spec.role === 'capability-architect') return [{ kind: 'wait', ms: 60_000 }];
    return [];
  };
  const options = { ...boundaryAnswers.options, script, inputs: treeInputs(),
    afterWrite: async (write: string, runId: string) => {
      if (write !== 'invocation-ended' || frozen) return;
      const events = await runEventsOnDisk(fixture.root, 'need', runId);
      const ended = events.at(-1);
      if (ended?.type !== 'invocation-ended') return;
      if (events.some(event => event.type === 'invocation-started' &&
        event.data.invocation === ended.data.invocation && event.data.role === 'local-architect' &&
        event.data.work.request === 'need-001')) { frozen = true; await freeze(); }
    } };
  const first = await openCapabilityRuns(fixture.root, options);
  const receipt = await first.service.execute(startRun('need'));
  await until(() => frozen, 30_000);
  await staleCrashLock(fixture.root);
  const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(before.filter(event => event.type === 'capability-delegated')).toHaveLength(0);
  const second = await openCapabilityRuns(fixture.root, options);
  cleanups.push(() => second.service.close());
  await until(() => (second.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-delegated' || event.type === 'job-failed'), 30_000);
  const after = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const failedOutcomes = await Promise.all(after.flatMap(event => event.type === 'invocation-ended' && event.data.ended === 'failed' ? [readFile(runPath(fixture.root, 'need', receipt.jobId, `invocations/${event.data.invocation}/outcome.json`), 'utf8')] : []));
  expect(after.filter(event => event.type === 'job-failed'), JSON.stringify({ tail: after.slice(-12), failedOutcomes })).toHaveLength(0);
  expect(after.filter(event => event.type === 'capability-delegated')).toHaveLength(1);
  expect(after.filter(event => event.type === 'invocation-started' && event.data.role === 'local-architect' &&
    event.data.work.request === 'need-001')).toHaveLength(1);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = second.service.events('need', receipt.jobId)!;
    try { await second.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
    catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
  }
  await second.service.settled('need', receipt.jobId);
}, 60_000);

test('CA19: accepted assign action before its effect replays without a second coordinator', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = recoveryBoundaries(fixture.root, 'a+b', true);
  answers.push(boundaryAnswers);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let engineerTurns = 0;
  let architectTurns = 0;
  let frozen = false;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') {
      engineerTurns += 1;
      return engineerTurns === 1 ? submit({ kind: 'capability-needed', summary: 'A needs source', request: {
        need: 'B fact for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
        constraints: [], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
      } }) : submit({ kind: 'completion-proposed', summary: 'B submitted its result', findings: [] });
    }
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      const ids = [...spec.prompt.matchAll(/Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return architectTurns === 1 ? submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        kind: 'assign', assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B result' }).assignment }) : [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { ...boundaryAnswers.options, script, inputs: treeInputs(),
    afterWrite: async (write: string, runId: string) => {
      if (write !== 'capability-coordinator-resumed' || frozen) return;
      const events = await runEventsOnDisk(fixture.root, 'need', runId);
      const resumed = events.at(-1);
      if (resumed?.type === 'capability-coordinator-resumed' && resumed.data.task === 'cap-001') {
        frozen = true;
        await freeze();
      }
    } };
  const first = await openCapabilityRuns(fixture.root, options);
  const receipt = await first.service.execute(startRun('need'));
  await until(() => frozen, 30_000);
  await staleCrashLock(fixture.root);
  const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(before.filter(event => event.type === 'capability-assigned')).toHaveLength(0);
  const second = await openCapabilityRuns(fixture.root, options);
  cleanups.push(() => second.service.close());
  await until(() => (second.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-assignment-settled' || event.type === 'job-failed'), 30_000);
  const after = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const failedOutcomes = await Promise.all(after.flatMap(event => event.type === 'invocation-ended' && event.data.ended === 'failed' ? [readFile(runPath(fixture.root, 'need', receipt.jobId, `invocations/${event.data.invocation}/outcome.json`), 'utf8')] : []));
  expect(after.filter(event => event.type === 'job-failed'), JSON.stringify({ tail: after.slice(-12), failedOutcomes })).toHaveLength(0);
  const resumed = after.filter(event => event.type === 'capability-coordinator-resumed' && event.data.task === 'cap-001');
  expect(resumed.length).toBeGreaterThanOrEqual(1);
  expect(new Set(resumed.map(event => event.type === 'capability-coordinator-resumed' ? event.data.invocation : '')).size).toBe(1);
  expect(after.filter(event => event.type === 'capability-assigned')).toHaveLength(1);
  expect(after.filter(event => event.type === 'capability-assignment-settled')).toHaveLength(1);
  const assigned = after.find(event => event.type === 'capability-assigned')!;
  expect(after.filter(event => event.type === 'invocation-started' && event.data.role === 'capability-architect' &&
    event.data.work.capabilityTask === 'cap-001' && event.sequence < assigned.sequence)).toHaveLength(1);
  await second.service.close();
}, 60_000);

for (const boundary of ['invocation-ended', 'obligation-reported'] as const) {
test(`PB3-C04 PB3-C05: restart after ${boundary} keeps the accepted action's report once, with no second coordinator or writer, and the next turn retrieves it`, async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = recoveryBoundaries(fixture.root, 'a+b', true);
  answers.push(boundaryAnswers);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let engineerTurns = 0;
  let architectTurns = 0;
  let frozen = false;
  const architectPrompts: string[] = [];
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') {
      engineerTurns += 1;
      return engineerTurns === 1 ? submit({ kind: 'capability-needed', summary: 'A needs source', request: {
        need: 'B fact for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
        constraints: [], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
      } }) : submit({ kind: 'completion-proposed', summary: 'B submitted its result', findings: [] });
    }
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      architectPrompts.push(spec.prompt);
      const ids = [...spec.prompt.matchAll(/Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      // The accepted assignment carries the architect's own done report.
      return architectTurns === 1 ? submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        kind: 'assign', assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B result' }).assignment,
        reports: [{ id: 'cap-001', judgment: 'done', basedOnRevision: 0 }] }) : [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { ...boundaryAnswers.options, script, inputs: treeInputs(),
    afterWrite: async (write: string, runId: string) => {
      if (write !== boundary || frozen) return;
      const events = await runEventsOnDisk(fixture.root, 'need', runId);
      const last = events.at(-1);
      const architect = new Set(events.flatMap(event => event.type === 'invocation-started' && event.data.role === 'capability-architect'
        ? [event.data.invocation] : []));
      if ((last?.type === 'invocation-ended' && architect.has(last.data.invocation) && last.data.ended === 'submitted')
        || (last?.type === 'obligation-reported' && last.data.id === 'cap-001')) {
        frozen = true;
        await freeze();
      }
    } };
  const first = await openCapabilityRuns(fixture.root, options);
  const receipt = await first.service.execute(startRun('need'));
  await until(() => frozen, 30_000);
  await staleCrashLock(fixture.root);
  const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(before.filter(event => event.type === 'obligation-reported')).toHaveLength(boundary === 'obligation-reported' ? 1 : 0);
  expect(before.filter(event => event.type === 'capability-assigned')).toHaveLength(0);
  const second = await openCapabilityRuns(fixture.root, options);
  cleanups.push(() => second.service.close());
  await until(() => architectTurns >= 2 || (second.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 30_000);
  const after = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const failedOutcomes = await Promise.all(after.flatMap(event => event.type === 'invocation-ended' && event.data.ended === 'failed' ? [readFile(runPath(fixture.root, 'need', receipt.jobId, `invocations/${event.data.invocation}/outcome.json`), 'utf8')] : []));
  expect(after.filter(event => event.type === 'job-failed'), JSON.stringify({ tail: after.slice(-12), failedOutcomes })).toHaveLength(0);
  // The report is recorded once, by the accepted invocation, before the
  // action's effect; the action is replayed, not asked for again.
  const reports = after.filter(event => event.type === 'obligation-reported');
  expect(reports.map(event => event.data)).toEqual([expect.objectContaining({ id: 'cap-001', judgment: 'done', revision: 1 })]);
  const assigned = after.filter(event => event.type === 'capability-assigned');
  expect(assigned).toHaveLength(1);
  expect(reports[0]!.sequence).toBeLessThan(assigned[0]!.sequence);
  const coordinators = after.filter(event => event.type === 'invocation-started' && event.data.role === 'capability-architect' &&
    event.data.work.capabilityTask === 'cap-001' && event.sequence < assigned[0]!.sequence);
  expect(coordinators).toHaveLength(1);
  const original = coordinators[0]!;
  if (original.type !== 'invocation-started') throw new Error('Missing original coordinator');
  const originalOutcome = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    `invocations/${original.data.invocation}/outcome.json`), 'utf8'));
  const originalPoint = JSON.parse(originalOutcome.session.ref).point;
  // Replay forks assignment authority at the original accepted action, while
  // the next coordinator advances from the separately appended recovery brief.
  expect(assigned[0]!.data.architectRef!.ref).toBe(originalOutcome.session.ref);
  const nextActor = second.agent!.sessions.find(session => session.spec.role === 'capability-architect')!;
  expect(nextActor.start.mode).toBe('continue');
  expect(nextActor.spec.session.mode).toBe('continue');
  if (nextActor.spec.session.mode !== 'continue') throw new Error('Expected resumed coordinator');
  const resumedPoint = JSON.parse(nextActor.spec.session.ref);
  expect(resumedPoint).toMatchObject({ sessionId: originalPoint.sessionId, turn: originalPoint.turn });
  expect(resumedPoint.checkpoint).not.toBe(originalPoint.checkpoint);
  const recoveryBrief = `Recover capability cap-001 from the committed plan and task state`;
  expect(nextActor.inherited.filter(bytes => bytes === recoveryBrief)).toHaveLength(1);
  expect(nextActor.spec.prompt).not.toContain(recoveryBrief);
  expect(reports[0]!.data).toMatchObject({ by: coordinators[0]!.type === 'invocation-started' ? coordinators[0]!.data.invocation : '' });
  // No writer was acquired between the crash and the replayed effect, and
  // the assignment has one writer.
  expect(after.filter(event => event.type === 'writer-acquired' && event.sequence > before.length && event.sequence < assigned[0]!.sequence)).toHaveLength(0);
  expect(after.filter(event => event.type === 'writer-acquired' && event.sequence > assigned[0]!.sequence)).toHaveLength(1);
  expect(after.filter(event => event.type === 'capability-assignment-settled')).toHaveLength(1);
  // The architect's next turn retrieves its own report.
  expect(architectPrompts).toHaveLength(2);
  expect(architectPrompts[1]).toContain('# Registered obligations');
  expect(architectPrompts[1]).toMatch(/- cap-001 \(delegated outcome\): done, revision 1; not bound; last report done by inv-\d+/u);
  await second.service.close();
}, 60_000);
}

for (const boundary of ['capability-assigned', 'invocation-ended'] as const) {
test(`CA18 CA19 CA26 CA29: restart after ${boundary} settles an explicit partial once`, async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = recoveryBoundaries(fixture.root);
  answers.push(boundaryAnswers);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let engineerTurns = 0;
  let architectTurns = 0;
  let closing: Promise<void> | undefined;
  let closeFirst: (() => Promise<void>) | undefined;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') {
      engineerTurns += 1;
      if (engineerTurns === 1) return submit({ kind: 'capability-needed', summary: 'A needs source', request: {
        need: 'B fact with source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
        constraints: [], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
      } });
      if (engineerTurns === 2) { boundaryAnswers.stage('b'); return submit({ kind: 'partial', done: ['Edited B source'], unfinished: ['Submit provider result'], findings: [] },
        edit('fact.ts', "return 'old';", "return 'old from B';")); }
      throw new Error('A settled partial must not start another B writer');
    }
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      const ids = [...spec.prompt.matchAll(/Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return architectTurns === 1 ? submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        kind: 'assign', assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B source appears in A' }).assignment }) : [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { ...boundaryAnswers.options, script, inputs: treeInputs(),
    afterWrite: async (write: string) => {
      if (write === boundary && (boundary !== 'invocation-ended' || engineerTurns === 2) && closing === undefined) closing = closeFirst?.();
    } };
  const first = await openCapabilityRuns(fixture.root, options);
  closeFirst = () => first.service.close();
  const receipt = await first.service.execute(startRun('need'));
  await until(() => closing !== undefined, 30_000);
  await closing;
  const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(before.filter(event => event.type === 'capability-assigned')).toHaveLength(1);
  expect(before.filter(event => event.type === 'capability-assignment-settled')).toHaveLength(0);
  if (boundary !== 'capability-assigned') {
    expect(await readFile(join(fixture.root, 'subs/b/src/fact.ts'), 'utf8')).toContain('old from B');
  }
  const second = await openCapabilityRuns(fixture.root, options);
  cleanups.push(() => second.service.close());
  await until(() => (second.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-assignment-settled' || event.type === 'job-failed'), 30_000);
  const after = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const failedOutcomes = await Promise.all(after.flatMap(event => event.type === 'invocation-ended' && event.data.ended === 'failed' ? [readFile(runPath(fixture.root, 'need', receipt.jobId, `invocations/${event.data.invocation}/outcome.json`), 'utf8')] : []));
  expect(after.filter(event => event.type === 'job-failed'), JSON.stringify({ tail: after.slice(-12), failedOutcomes })).toHaveLength(0);
  expect(after.filter(event => event.type === 'capability-assigned')).toHaveLength(1);
  const settlements = after.filter(event => event.type === 'capability-assignment-settled');
  expect(settlements).toHaveLength(1);
  expect(settlements[0].data).toMatchObject({ outcome: 'partial' });
  expect(settlements[0].data.mutated).toContain('subs/b/src/fact.ts');
  const writer = after.find(event => event.type === 'invocation-started' &&
    event.data.role === 'engineer' && event.data.work.iteration === 'cap-001.i01');
  if (writer?.type !== 'invocation-started') throw new Error('Missing capability writer');
  const invocation = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    `invocations/${writer.data.invocation}/invocation.json`), 'utf8')) as { candidateBefore?: string };
  const outcome = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    `invocations/${writer.data.invocation}/outcome.json`), 'utf8')) as { candidateAfter?: string };
  expect(invocation.candidateBefore).toMatch(/^[0-9a-f]{40,64}$/u);
  expect(outcome.candidateAfter).toMatch(/^[0-9a-f]{40,64}$/u);
  expect(outcome.candidateAfter).not.toBe(invocation.candidateBefore);
  const partialResult = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    'work-items/cap-001/iterations/01/result.json'), 'utf8')) as { outcome: string; findings: string[] };
  expect(partialResult).toMatchObject({ outcome: 'partial', findings: expect.arrayContaining(['unfinished: Submit provider result']) });
  expect(after.filter(event => event.type === 'invocation-started' && event.data.role === 'engineer' && event.data.work.iteration === 'cap-001.i01'), JSON.stringify(after.slice(-25))).toHaveLength(1);
  expect(await readFile(join(fixture.root, 'subs/b/src/fact.ts'), 'utf8')).toContain('old from B');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = second.service.events('need', receipt.jobId)!;
    try { await second.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
    catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
  }
  await second.service.settled('need', receipt.jobId);
}, 60_000);
}

test('CA19: accepted B completion before assignment settlement replays without a second writer', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = recoveryBoundaries(fixture.root, 'a+b', true);
  answers.push(boundaryAnswers);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let engineerTurns = 0;
  let architectTurns = 0;
  let closing: Promise<void> | undefined;
  let closeFirst: (() => Promise<void>) | undefined;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') {
      engineerTurns += 1;
      return engineerTurns === 1 ? submit({ kind: 'capability-needed', summary: 'A needs source', request: {
        need: 'B fact for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
        constraints: [], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
      } }) : submit({ kind: 'completion-proposed', summary: 'B result submitted', findings: [] });
    }
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      const ids = [...spec.prompt.matchAll(/Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return architectTurns === 1 ? submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        kind: 'assign', assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B result' }).assignment }) : [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { ...boundaryAnswers.options, script, inputs: treeInputs(),
    afterWrite: async (write: string) => {
      if (write === 'invocation-ended' && engineerTurns === 2 && closing === undefined) closing = closeFirst?.();
    } };
  const first = await openCapabilityRuns(fixture.root, options);
  closeFirst = () => first.service.close();
  const receipt = await first.service.execute(startRun('need'));
  await until(() => closing !== undefined, 30_000);
  await closing;
  const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(before.filter(event => event.type === 'capability-assignment-settled')).toHaveLength(0);
  const second = await openCapabilityRuns(fixture.root, options);
  cleanups.push(() => second.service.close());
  await until(() => (second.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-assignment-settled' || event.type === 'job-failed'), 30_000);
  const after = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const failedOutcomes = await Promise.all(after.flatMap(event => event.type === 'invocation-ended' && event.data.ended === 'failed' ? [readFile(runPath(fixture.root, 'need', receipt.jobId, `invocations/${event.data.invocation}/outcome.json`), 'utf8')] : []));
  expect(after.filter(event => event.type === 'job-failed'), JSON.stringify({ tail: after.slice(-12), failedOutcomes })).toHaveLength(0);
  expect(after.filter(event => event.type === 'capability-assigned')).toHaveLength(1);
  expect(after.filter(event => event.type === 'capability-assignment-settled')).toHaveLength(1);
  expect(after.filter(event => event.type === 'invocation-started' && event.data.role === 'engineer' && event.data.work.iteration === 'cap-001.i01'), JSON.stringify(after.slice(-25))).toHaveLength(1);
  expect(after.filter(event => event.type === 'writer-acquired' &&
    after.some(started => started.type === 'invocation-started' && started.data.invocation === event.data.invocation &&
      started.data.work.iteration === 'cap-001.i01'))).toHaveLength(1);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = second.service.events('need', receipt.jobId)!;
    try { await second.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
    catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
  }
  await second.service.settled('need', receipt.jobId);
}, 60_000);

test('CA20 CA32: restart with a B writer lacking confirmed release stops the stack and frontier', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = recoveryBoundaries(fixture.root);
  answers.push(boundaryAnswers);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let engineerTurns = 0;
  let frozen = false;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') {
      engineerTurns += 1;
      return engineerTurns === 1 ? submit({ kind: 'capability-needed', summary: 'A needs source', request: {
        need: 'B fact for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
        constraints: [], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
      } }) : submit({ kind: 'completion-proposed', summary: 'B result', findings: [] });
    }
    if (spec.role === 'capability-architect') {
      const ids = [...spec.prompt.matchAll(/Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        kind: 'assign', assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B result' }).assignment });
    }
    return [];
  };
  const options = { ...boundaryAnswers.options, script, inputs: treeInputs(),
    afterWrite: async (write: string, runId: string) => {
      if (write !== 'writer-acquired') return;
      const events = await runEventsOnDisk(fixture.root, 'need', runId);
      const acquired = events.at(-1);
      if (acquired?.type === 'writer-acquired' && events.some(event => event.type === 'invocation-started' &&
        event.data.invocation === acquired.data.invocation &&
        event.data.work.iteration === 'cap-001.i01')) {
        frozen = true;
        await freeze();
      }
    } };
  const first = await openCapabilityRuns(fixture.root, options);
  const receipt = await first.service.execute(startRun('need'));
  await until(() => frozen, 30_000);
  await staleCrashLock(fixture.root);
  const second = await openCapabilityRuns(fixture.root, options);
  cleanups.push(() => second.service.close());
  await second.service.settled('need', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(events.filter(event => event.type === 'writer-acquired' &&
    events.some(started => started.type === 'invocation-started' && started.data.invocation === event.data.invocation &&
      started.data.work.iteration === 'cap-001.i01'))).toHaveLength(1);
  expect(events.filter(event => event.type === 'capability-stopped')).toHaveLength(1);
  expect(events.filter(event => event.type === 'job-failed').at(-1)?.data.reason).toBe('writer-unsettled');
  expect(events.filter(event => event.type === 'capability-assignment-settled')).toHaveLength(0);
  expect(events.filter(event => event.type === 'capability-handed-back')).toHaveLength(0);
  expect(events.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
}, 60_000);

test('CA19 CA30: service restart adopts a source snapshot before its request ledger commit', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = recoveryBoundaries(fixture.root);
  answers.push(boundaryAnswers);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let architectTurns = 0;
  let closing: Promise<void> | undefined;
  let closeFirst: (() => Promise<void>) | undefined;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') { boundaryAnswers.stage('a'); return submit({ kind: 'capability-needed', summary: 'A has unfinished source', request: {
      need: 'B source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
      constraints: [], knownInterface: { kind: 'none-known' },
      examples: [{ title: 'source displayed', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
    } }, edit('caller.ts', 'Fact: ${value}', 'A is waiting for B: ${value}')); }
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      return [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { ...boundaryAnswers.options, script, inputs: treeInputs(),
    afterWrite: async (write: string) => {
      if (write === 'capability-source-captured' && closing === undefined) closing = closeFirst?.();
    } };
  const first = await openCapabilityRuns(fixture.root, options);
  closeFirst = () => first.service.close();
  const receipt = await first.service.execute(startRun('need'));
  await until(() => closing !== undefined, 30_000);
  await closing;
  const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(before.filter(event => event.type === 'capability-requested')).toHaveLength(0);
  const snapshot = await readFile(join(fixture.root, 'plans/need/.harness/jobs', receipt.jobId, 'capabilities/snapshots/need-001.json'));
  const second = await openCapabilityRuns(fixture.root, options);
  cleanups.push(() => second.service.close());
  await until(() => (second.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-delegated' || event.type === 'job-failed'), 30_000);
  const after = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const failedOutcomes = await Promise.all(after.flatMap(event => event.type === 'invocation-ended' && event.data.ended === 'failed' ? [readFile(runPath(fixture.root, 'need', receipt.jobId, `invocations/${event.data.invocation}/outcome.json`), 'utf8')] : []));
  expect(after.filter(event => event.type === 'job-failed'), JSON.stringify({ tail: after.slice(-12), failedOutcomes })).toHaveLength(0);
  expect(after.filter(event => event.type === 'capability-requested')).toHaveLength(1);
  expect(after.filter(event => event.type === 'capability-delegated')).toHaveLength(1);
  expect(after.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
  expect(await readFile(join(fixture.root, 'plans/need/.harness/jobs', receipt.jobId, 'capabilities/snapshots/need-001.json'))).toEqual(snapshot);
  expect(await readFile(join(fixture.root, 'subs/a/src/caller.ts'), 'utf8')).toContain('A is waiting for B');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = second.service.events('need', receipt.jobId)!;
    try { await second.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
    catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
  }
  await second.service.settled('need', receipt.jobId);
}, 60_000);

for (const boundary of ['capability-exchange-opened', 'capability-exchange-answered'] as const) {
  test(`CA05 CA20: restart after ${boundary} keeps one consumer question and answer`, async () => {
    const fixture = await copyCapabilityFixture();
    cleanups.push(fixture.remove);
    const boundaryAnswers = recoveryBoundaries(fixture.root, 'a');
    answers.push(boundaryAnswers);
    const a = 'capability-coordination/a';
    const b = 'capability-coordination/b';
    let closing: Promise<void> | undefined;
    let closeFirst: (() => Promise<void>) | undefined;
    let architectTurns = 0;
    const script: Script = spec => {
      if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a)]));
      if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
      if (spec.submission.name === 'submit_capability_qualification') {
        const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
        return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
          placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
      }
      if (spec.submission.name === 'answer_capability_consultation') return submit({
        answer: 'A calls B and needs its original source', objections: [],
      });
      if (spec.role === 'engineer') return submit({ kind: 'capability-needed', summary: 'A needs source', request: {
        need: 'B fact with source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
        constraints: [], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
      } });
      if (spec.role === 'capability-architect') {
        architectTurns += 1;
        const ids = [...spec.prompt.matchAll(/Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/gu)].at(-1)!;
        return architectTurns === 1 ? submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
          kind: 'consult-consumer', question: 'How will A render the source?', sections: ['calling code'], references: [] })
          : [{ kind: 'wait', ms: 60_000 }];
      }
      return [];
    };
    const options = { ...boundaryAnswers.options, script, inputs: treeInputs(),
      afterWrite: async (write: string) => { if (write === boundary && closing === undefined) closing = closeFirst?.(); } };
    const first = await openCapabilityRuns(fixture.root, options);
    closeFirst = () => first.service.close();
    const receipt = await first.service.execute(startRun('need'));
    await until(() => closing !== undefined, 30_000);
    await closing;
    const second = await openCapabilityRuns(fixture.root, options);
    cleanups.push(() => second.service.close());
    await until(() => (second.service.events('need', receipt.jobId) ?? []).filter(event =>
      event.type === 'invocation-started' && event.data.role === 'capability-architect' &&
      event.data.work.capabilityTask === 'cap-001').length >= 2 ||
      (second.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 30_000);
    const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(events.filter(event => event.type === 'job-failed'), JSON.stringify(events.slice(-12))).toHaveLength(0);
    expect(events.filter(event => event.type === 'capability-exchange-opened')).toHaveLength(1);
    expect(events.filter(event => event.type === 'capability-exchange-answered')).toHaveLength(1);
    const records = committedRecords((await RunLog.open(join(fixture.root, 'plans/need/.harness/jobs', receipt.jobId,
      'events.jsonl'), receipt.jobId)).ledger.replay());
    expect(records.capabilityExchanges.get('cap-001-ex01')).toHaveLength(2);
    expect(records.capabilityExchanges.get('cap-001-ex01')?.[1]?.answer?.text).toContain('original source');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = second.service.events('need', receipt.jobId)!;
      try { await second.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
      catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
    }
    await second.service.settled('need', receipt.jobId);
  }, 60_000);
}


test('discarded coordinator shutdown refuses corrupted proof, applied non-kept results and already applied effects before any recovery dispatch', async () => {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  const boundary = recoveryBoundaries(fixture.root, 'a'); answers.push(boundary);
  let closed: Promise<void> | undefined;
  let release!: () => void;
  const closing = new Promise<void>(resolve => { release = resolve; });
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', 'capability-coordination/a')]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign('capability-coordination/a', {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = [...spec.prompt.matchAll(/Use request (need-\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: 'capability-coordination/b',
        placementReason: 'B owns the source', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') return submit({ kind: 'capability-needed', summary: 'A needs source', request: {
      need: 'B fact with source', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
      constraints: [], knownInterface: { kind: 'none-known' },
      examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
    } });
    if (spec.role === 'capability-architect') {
      const ids = [...spec.prompt.matchAll(/Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/gu)].at(-1)!;
      return submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3], kind: 'partial',
        progress: 'Source inspected', unfinished: ['Assign B'] });
    }
    return [];
  };
  const opened = await openCapabilityRuns(fixture.root, { ...boundary.options, script, inputs: treeInputs() });
  cleanups.push(() => opened.service.close());
  const settle = opened.service['settleSession'].bind(opened.service);
  opened.service['settleSession'] = async (...args) => {
    const result = await settle(...args);
    const invocation = args[0].log.all('invocation-started').find(event => event.data.invocation === args[1]);
    if (invocation?.data.role === 'capability-architect') {
      expect(result.confirmed).toBe(true);
      closed = opened.service.close(); release(); await closing;
    }
    return result;
  };
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => closed !== undefined, 30_000); await closed;
  const run = opened.service['runs'].get(`need/${receipt.jobId}`)!;
  const events = run.log.events;
  const original = events.filter(event => event.type === 'invocation-started' && event.data.role === 'capability-architect').at(-1)!;
  if (original.type !== 'invocation-started') throw new Error('Missing coordinator');
  const end = events.find(event => event.type === 'invocation-ended' && event.data.invocation === original.data.invocation)!;
  if (end.type !== 'invocation-ended') throw new Error('Missing coordinator end');
  const path = runLayout.outcome(original.data.invocation);
  const durable = opened.service['committedBody'](run, path) as InvocationOutcome;
  expect(durable).toMatchObject({ ended: 'submitted', disposition: 'superseded', settled: { confirmed: true } });
  expect(end.data).toMatchObject({ kept: false, finished: 'run-ended' });
  const submissionPath = run.path(runLayout.submission(original.data.invocation));
  const submitted = await readFile(submissionPath);
  const baseline = measurementSnapshotSchema.parse(JSON.parse(await readFile(run.path(runLayout.measurement(snapshotId(1))), 'utf8')));
  const body = opened.service['committedBody'].bind(opened.service);
  const refusals: string[] = [];
  opened.service['fail'] = async (_run, reason, text) => { refusals.push(`${reason}: ${text}`); };
  const actorCount = opened.agent!.sessions.length;
  const cases: Array<{ name: string; outcome?: unknown; bytes?: string; missingBytes?: boolean; ending?: Partial<typeof end.data>; effect?: RunEvent }> = [
    { name: 'missing outcome', outcome: null },
    { name: 'missing ended hash', ending: { submission: null } },
    { name: 'missing outcome hash', outcome: { ...durable, submission: null } },
    { name: 'missing submitted bytes', missingBytes: true },
    { name: 'malformed outcome', outcome: { ...durable, settled: null } },
    { name: 'wrong outcome invocation', outcome: { ...durable, invocation: 'inv-9999' } },
    { name: 'unconfirmed settlement', outcome: { ...durable, settled: { ...durable.settled, confirmed: false } } },
    { name: 'applied non-kept result', outcome: { ...durable, disposition: 'applied' } },
    { name: 'non-shutdown end', ending: { kept: false, finished: 'not-kept' } },
    { name: 'changed accepted bytes', bytes: submitted.toString().replace('Source inspected', 'Changed after acceptance') },
    { name: 'wrong operation identity', outcome: { ...durable, sessionOperation: { ...durable.sessionOperation, operationId: 'inv-9999' } } },
    { name: 'wrong point checkpoint', outcome: { ...durable, sessionOperation: { ...durable.sessionOperation, point: null } } },
    { name: 'null submission envelope', bytes: 'null' },
    { name: 'primitive submission envelope', bytes: '7' },
    { name: 'array submission envelope', bytes: '[]' },
    { name: 'wrong task', bytes: submitted.toString().replace('cap-001', 'cap-999') },
    { name: 'discarded plan mutation', effect: { ...end, type: 'capability-plan-revised', data: {
      task: 'cap-001', revision: 2, basedOn: 1, invocation: original.data.invocation } } },
    { name: 'discarded obligation registration', effect: { ...end, type: 'obligation-registered', data: {
      id: 'extra-case', kind: 'test', responsible: { kind: 'capability-task', id: 'cap-001' },
      by: original.data.invocation, submission: end.data.submission!, description: 'Extra obligation' } } },
    { name: 'discarded obligation report', effect: { ...end, type: 'obligation-reported', data: {
      id: 'cap-001', judgment: 'done', basedOnRevision: 0, revision: 1,
      by: original.data.invocation, submission: end.data.submission! } } },
  ];
  for (const fault of cases) {
    let outcome: unknown = Object.hasOwn(fault, 'outcome') ? fault.outcome : durable;
    let ending = { ...end, data: { ...end.data, ...fault.ending } } as typeof end;
    if (fault.missingBytes) await rm(submissionPath);
    if (fault.bytes !== undefined) {
      await writeFile(submissionPath, fault.bytes);
      // Primitive/schema cases retain mutually matching hashes, so shape
      // authentication, rather than a preceding hash mismatch, must refuse.
      if (fault.name !== 'changed accepted bytes') {
        const hash = createHash('sha256').update(fault.bytes).digest('hex');
        outcome = { ...durable, submission: { hash } };
        ending = { ...end, data: { ...end.data, submission: hash } };
      }
    }
    const suppliedEvents = events.map(event => event === end ? ending : event).concat(fault.effect ? [fault.effect] : []);
    if (fault.name === 'discarded plan mutation') {
      expect(() => replayCapabilityState(suppliedEvents), 'the prestate corrupted plan already lacks authority')
        .toThrow(/has no coordination authority/u);
    }
    // An independently corrupted observation becomes visible after the original
    // state read, while the submitted bytes are being authenticated. The
    // final discarded-effect guard must reject it before reconstruction.
    let effectVisible = fault.effect === undefined;
    const log = new Proxy(run.log, { get(target, key) {
      if (key === 'events') return effectVisible ? suppliedEvents : events;
      if (key === 'all') return (type: string) => suppliedEvents.filter(event => event.type === type);
      const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const captured = new Proxy(run, { get(target, key) { return key === 'log' ? log : Reflect.get(target, key, target); } });
    opened.service['committedBody'] = (owner, file) => {
      if (file !== path) return body(owner, file);
      effectVisible = true;
      return outcome;
    };
    const before = refusals.length;
    try {
      expect(await opened.service['resumeCapabilityTask'](captured, opened.agent!, new Map(), baseline), fault.name).toBe(false);
      expect(refusals.slice(before), fault.name).toHaveLength(1);
      expect(refusals.at(-1), fault.name).toMatch(/^recovery-exhausted: Capability cap-001 has an (unauthenticated|invalid)/u);
      expect(opened.agent!.sessions, fault.name).toHaveLength(actorCount);
      expect(run.log.events, fault.name).toEqual(events);
    } finally { await writeFile(submissionPath, submitted); }
  }
  expect(await readFile(run.path(path), 'utf8')).toBe(`${JSON.stringify(durable, null, 2)}\n`);
  expect(run.log.events.filter(event => event.type === 'capability-handed-back' || event.type === 'capability-assigned')).toEqual([]);
}, 60_000);
