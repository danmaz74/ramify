import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { gitService } from '../../subs/evidence/src/git.js';
import { runCommand } from '../../subs/evidence/src/run-command.js';
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
    git: gitService, script, inputs: treeInputs(),
    commandExecution: async request => {
      const result = await runCommand({ ...request, registerProcessGroup: async (pid, identity) => {
        cleanups.push(async () => nodeProcessGroups.kill(pid));
        await request.registerProcessGroup?.(pid, identity);
      } });
      // A crashed service cannot receive the executor's completion callback
      // when recovery kills its real group. Freezing registration alone leaves
      // this independent callback alive in the in-process crash fixture.
      if (frozen) await freeze();
      return result;
    },
    afterWrite: async write => { if (write === 'writer-process-registered' && !frozen) { frozen = true; await freeze(); } },
  });
  const receipt = await first.service.execute(startRun('need'));
  await until(() => frozen, 30_000);
  const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const registered = before.find(event => event.type === 'writer-process-registered');
  if (registered?.type !== 'writer-process-registered') throw new Error('Missing durable process registration');
  const pid = registered.data.pid;
  expect(nodeProcessGroups.alive(pid)).toBe(true);
  expect(before.some(event => event.type === 'writer-released' && event.data.invocation === registered.data.invocation)).toBe(false);

  await staleCrashLock(fixture.root);
  const second = await openCapabilityRuns(fixture.root, {
    git: gitService, script, inputs: treeInputs(),
  });
  cleanups.push(() => second.service.close());
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(nodeProcessGroups.alive(pid)).toBe(false);
  expect(events.find(event => event.type === 'job-failed')?.data.reason).toBe('writer-unsettled');
  expect(events.filter(event => event.type === 'capability-handed-back' || event.type === 'gate-attempted')).toHaveLength(0);
  expect(events.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
  expect(first.service.events('need', receipt.jobId)).toEqual(before);
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
}, 30_000);

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
}, 30_000);
