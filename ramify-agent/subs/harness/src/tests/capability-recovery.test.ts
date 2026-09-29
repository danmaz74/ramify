import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { gitService } from '../../subs/evidence/src/git.js';
import type { Script } from '../../subs/agent/src/scripted.js';
import { analysis, entry } from './helpers/analysis.js';
import { captureProvisionalSource } from '../capability/source.js';
import { commitCapabilityTransition } from '../capability/ledger.js';
import { capabilityLayout } from '../capability/records.js';
import { RunLog } from '../run/log.js';
import { committedRecords } from '../work/committed.js';
import { copyCapabilityFixture, fixtureRequest, openCapabilityRuns } from './helpers/capability.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { assign, edit, installMiniRunner, outline, shell, submit, treeInputs } from './helpers/iterations.js';
import { directReadinessExecution } from './helpers/external-tools.js';
import { freeze, git, initRepository, runEventsOnDisk, runPath, staleCrashLock, startRun, stopRun, testPolicy, until } from './helpers/runs.js';
import { nodeProcessGroups } from '../run/writer.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('CA20: a registered real process group survives a service crash and is settled before any successor work', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let engineerTurns = 0;
  let frozen = false;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the source fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') {
      engineerTurns += 1;
      if (engineerTurns === 1) return submit({ kind: 'capability-needed', summary: 'A needs source', request: {
        need: 'B source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display B source', prospective: false }],
        constraints: [], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
      } });
      return [shell('node -e "setTimeout(() => {}, 60000)"', { timeoutMs: 60000 })];
    }
    if (spec.role === 'capability-architect') {
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3], kind: 'assign', assignment: assign(b, { goal: 'Provide B source', approach: 'Implement B source', completionEvidence: 'A consumes B source' }).assignment });
    }
    return [];
  };
  const first = await openCapabilityRuns(fixture.root, {
    git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
    afterWrite: async write => { if (write === 'writer-process-registered' && !frozen) { frozen = true; await freeze(); } },
  });
  const receipt = await first.service.execute(startRun('need'));
  await until(() => frozen, 30_000);
  const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const registered = before.find(event => event.type === 'writer-process-registered');
  if (registered?.type !== 'writer-process-registered') throw new Error('Missing durable process registration');
  const pid = registered.data.pid;
  cleanups.push(async () => nodeProcessGroups.kill(pid));
  expect(nodeProcessGroups.alive(pid)).toBe(true);
  expect(before.some(event => event.type === 'writer-released' && event.data.invocation === registered.data.invocation)).toBe(false);

  await staleCrashLock(fixture.root);
  const second = await openCapabilityRuns(fixture.root, {
    git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
  });
  cleanups.push(() => second.service.close());
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(nodeProcessGroups.alive(pid)).toBe(false);
  expect(events.find(event => event.type === 'job-failed')?.data.reason).toBe('writer-unsettled');
  expect(events.filter(event => event.type === 'capability-handed-back' || event.type === 'gate-attempted')).toHaveLength(0);
  expect(events.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
}, 45_000);

test('CA19 CA30: a snapshot written before its request commit is adopted with the exact dirty index and tree', async () => {
  const fixture = await copyCapabilityFixture();
  const directory = await temporaryDirectory();
  cleanups.push(fixture.remove, directory.remove);
  const base = await initRepository(fixture.root);
  const tracked = 'subs/a/src/caller.ts';
  const untracked = 'subs/a/src/pending.ts';
  const deleted = 'subs/d/src/consumer.ts';
  await writeFile(join(fixture.root, tracked), 'export const staged = true;\n');
  await git(fixture.root, 'add', tracked);
  await writeFile(join(fixture.root, tracked), 'export const worktree = true;\n');
  await writeFile(join(fixture.root, untracked), 'export const pending = true;\n');
  await rm(join(fixture.root, deleted));
  await git(fixture.root, 'add', deleted);
  const input = { projectRoot: fixture.root, runDirectory: directory.path, request: 'need-001',
    acceptedBase: base, writerSettledBy: 'inv-0001', changedPaths: await gitService.changedPaths(fixture.root, base) };
  const before = await captureProvisionalSource(input);
  const snapshotBytes = await readFile(join(directory.path, before.snapshot));
  // Simulate a process stop after the exclusive write, before ledger append.
  const recovered = await captureProvisionalSource(input);
  expect(recovered).toEqual(before);
  expect(await readFile(join(directory.path, before.snapshot))).toEqual(snapshotBytes);
  expect((await git(fixture.root, 'show', ':subs/a/src/caller.ts')).trim()).toContain('staged = true');
  expect(await readFile(join(fixture.root, untracked), 'utf8')).toContain('pending = true');
  expect((await git(fixture.root, 'status', '--porcelain')).trim()).toContain('D  subs/d/src/consumer.ts');
  expect(before.delta.find(change => change.path === deleted)?.staged).toBe(true);

  const log = await RunLog.open(join(directory.path, 'events.jsonl'), 'job-001');
  const request = { ...fixtureRequest(), source: recovered };
  await commitCapabilityTransition(log, { type: 'capability-requested', data: {
    request: request.id, parent: request.parent.id, assignment: request.assignment, invocation: request.invocation,
  } }, [{ path: capabilityLayout.request(request.id), id: request.id, revision: 1, body: request }]);
  const reopened = await RunLog.open(join(directory.path, 'events.jsonl'), 'job-001');
  expect(committedRecords(reopened.ledger.replay()).capabilityRequests.get(request.id)?.source).toEqual(before);
  expect(await captureProvisionalSource(input)).toEqual(before);
});

test('CA19: retry refuses a changed staged or untracked candidate and preserves its bytes', async () => {
  const fixture = await copyCapabilityFixture();
  const directory = await temporaryDirectory();
  cleanups.push(fixture.remove, directory.remove);
  const base = await initRepository(fixture.root);
  const tracked = 'subs/a/src/caller.ts';
  const untracked = 'subs/a/src/pending.ts';
  await writeFile(join(fixture.root, tracked), 'export const staged = true;\n');
  await git(fixture.root, 'add', tracked);
  await writeFile(join(fixture.root, untracked), 'export const pending = true;\n');
  const input = { projectRoot: fixture.root, runDirectory: directory.path, request: 'need-001',
    acceptedBase: base, writerSettledBy: 'inv-0001', changedPaths: await gitService.changedPaths(fixture.root, base) };
  await captureProvisionalSource(input);
  await writeFile(join(fixture.root, untracked), 'export const pending = false;\n');
  await expect(captureProvisionalSource(input)).rejects.toThrow('source was preserved');
  expect(await readFile(join(fixture.root, untracked), 'utf8')).toContain('pending = false');
  await writeFile(join(fixture.root, untracked), 'export const pending = true;\n');
  await writeFile(join(fixture.root, tracked), 'export const changedIndex = true;\n');
  await git(fixture.root, 'add', tracked);
  await expect(captureProvisionalSource(input)).rejects.toThrow('source was preserved');
  expect((await git(fixture.root, 'show', ':subs/a/src/caller.ts')).trim()).toContain('changedIndex = true');
});

async function lostBWriterCase(restartBeforeSettlement: boolean): Promise<void> {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
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
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
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
      if (engineerTurns === 2) return [edit('fact.ts', "return 'old';", "return 'old from B';"), { kind: 'end', message: 'Context lost before submission' }];
      throw new Error('An ended engineer must close partial rather than restart automatically');
    }
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return architectTurns === 1 ? submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        kind: 'assign', assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B source appears in A' }).assignment }) : [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
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

test('CA05 CA19 CA22 CA32: service restart reconstructs the active architect without dispatching the B entry', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
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
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
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
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      const basis = { task: ids[1], planRevision: Number(ids[2]), invocation: ids[3] };
      if (architectTurns === 1) return submit({ ...basis, kind: 'partial', progress: 'A source inspected',
        unfinished: ['Assign B'] });
      if (architectTurns === 2) return submit({ ...basis, kind: 'assign', assignment: assign(b, { goal: 'Provide B source', approach: 'Update B owned source', completionEvidence: 'A uses B source' }).assignment });
      return [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
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
  expect(starts.filter(entry => entry === 'capability-architect:submit_capability_action:fresh').length).toBeGreaterThanOrEqual(2);
  expect(prompts[1]).toContain('# Selected plan package ');
  expect(prompts[1]).toContain('Current plan:');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = second.service.events('need', receipt.jobId)!;
    try { await second.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
    catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
  }
  await second.service.settled('need', receipt.jobId);
}, 60_000);

test('a restart after a capability architect budget return reconstructs from committed task state', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let frozen = false;
  let architectTurns = 0;
  const starts: string[] = [];
  const script: Script = spec => {
    starts.push(`${spec.role}:${spec.submission.name}:${spec.session.mode}`);
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
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
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      if (architectTurns === 1) return [
        { kind: 'context', tokens: 200_000, window: null },
        { kind: 'message', text: 'The capability task is unfinished at my context budget.' },
      ];
      return submit({ kind: 'assign', task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        assignment: assign(b, { goal: 'Provide B source', approach: 'Update B owned source', completionEvidence: 'A uses B source' }).assignment });
    }
    return [];
  };
  const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
    afterWrite: async (write: string, runId: string) => {
      if (write !== 'capability-coordinator-resumed' || frozen) return;
      const events = await runEventsOnDisk(fixture.root, 'need', runId);
      const latest = events.at(-1);
      if (latest?.type === 'capability-coordinator-resumed' && events.some(event =>
        event.type === 'invocation-ended' && event.data.ended === 'context-budget-reached')) {
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
  await until(() => (second.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-assigned' || event.type === 'job-failed'), 30_000);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(events.some(event => event.type === 'job-failed')).toBe(false);
  expect(events.filter(event => event.type === 'capability-assigned')).toHaveLength(1);
  expect(events.filter(event => event.type === 'capability-handed-back')).toHaveLength(0);
  expect(starts.filter(start => start.startsWith('capability-architect:'))).toEqual([
    'capability-architect:submit_capability_action:fresh',
    'capability-architect:submit_capability_action:fresh',
  ]);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = second.service.events('need', receipt.jobId)!;
    try { await second.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
    catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
  }
  await second.service.settled('need', receipt.jobId);
}, 60_000);

test('CA19: accepted qualification before delegation replays one decision after restart', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let frozen = false;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
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
  const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
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
  expect(after.filter(event => event.type === 'job-failed'), JSON.stringify(after.slice(-12))).toHaveLength(0);
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
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let engineerTurns = 0;
  let architectTurns = 0;
  let frozen = false;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
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
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return architectTurns === 1 ? submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        kind: 'assign', assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B result' }).assignment }) : [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
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
  expect(after.filter(event => event.type === 'job-failed'), JSON.stringify(after.slice(-12))).toHaveLength(0);
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

for (const boundary of ['capability-assigned', 'invocation-ended'] as const) {
test(`CA18 CA19 CA26 CA29: restart after ${boundary} settles an explicit partial once`, async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
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
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
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
      if (engineerTurns === 2) return submit({ kind: 'partial', done: ['Edited B source'], unfinished: ['Submit provider result'], findings: [] },
        edit('fact.ts', "return 'old';", "return 'old from B';"));
      throw new Error('A settled partial must not start another B writer');
    }
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return architectTurns === 1 ? submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        kind: 'assign', assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B source appears in A' }).assignment }) : [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
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
  expect(after.filter(event => event.type === 'job-failed'), JSON.stringify(after.slice(-12))).toHaveLength(0);
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
  expect(after.filter(event => event.type === 'capability-assignment-interrupted')).toHaveLength(0);
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
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
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
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
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
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return architectTurns === 1 ? submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        kind: 'assign', assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B result' }).assignment }) : [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
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
  expect(after.filter(event => event.type === 'job-failed'), JSON.stringify(after.slice(-12))).toHaveLength(0);
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
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let engineerTurns = 0;
  let frozen = false;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
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
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
        kind: 'assign', assignment: assign(b, { goal: 'Return B source', approach: 'Extend B result', completionEvidence: 'B result' }).assignment });
    }
    return [];
  };
  const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
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
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  const a = 'capability-coordination/a';
  const b = 'capability-coordination/b';
  let architectTurns = 0;
  let closing: Promise<void> | undefined;
  let closeFirst: (() => Promise<void>) | undefined;
  const script: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') return submit({ kind: 'capability-needed', summary: 'A has unfinished source', request: {
      need: 'B source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
      constraints: [], knownInterface: { kind: 'none-known' },
      examples: [{ title: 'source displayed', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
    } }, edit('caller.ts', 'Fact: ${value}', 'A is waiting for B: ${value}'));
    if (spec.role === 'capability-architect') {
      architectTurns += 1;
      return [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
  const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
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
  expect(after.filter(event => event.type === 'job-failed'), JSON.stringify(after.slice(-12))).toHaveLength(0);
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
    await initRepository(fixture.root);
    await installMiniRunner(fixture.root);
    const a = 'capability-coordination/a';
    const b = 'capability-coordination/b';
    let closing: Promise<void> | undefined;
    let closeFirst: (() => Promise<void>) | undefined;
    let architectTurns = 0;
    const script: Script = spec => {
      if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a)]));
      if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
      if (spec.submission.name === 'submit_capability_qualification') {
        const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
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
        const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        return architectTurns === 1 ? submit({ task: ids[1], planRevision: Number(ids[2]), invocation: ids[3],
          kind: 'consult-consumer', question: 'How will A render the source?', sections: ['calling code'], references: [] })
          : [{ kind: 'wait', ms: 60_000 }];
      }
      return [];
    };
    const options = { git: gitService, script, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
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
