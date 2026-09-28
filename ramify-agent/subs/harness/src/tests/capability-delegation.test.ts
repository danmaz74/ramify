import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Script } from '../../subs/agent/src/scripted.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { analysis, entry } from './helpers/analysis.js';
import { copyCapabilityFixture, openCapabilityRuns } from './helpers/capability.js';
import { assign, edit, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { directReadinessExecution } from './helpers/external-tools.js';
import { git, initRepository, openRuns, runEventsOnDisk, runPath, startRun, stopRun, testPolicy, until } from './helpers/runs.js';
import { capabilityPolicyFrom } from '../capability/policy.js';
import { captureProvisionalSource } from '../capability/source.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { decision, forkDecision } from './helpers/placement.js';
import type { CapabilityRequest, CapabilityTask } from '../capability/records.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

const a = 'capability-coordination/a';
const b = 'capability-coordination/b';

function script(starts: string[], capabilityPrompts: string[] = [], qualification: 'placement' | 'unresolved' = 'placement'): Script {
  let localTurns = 0;
  let capabilityTurns = 0;
  let qualificationTurns = 0;
  return spec => {
    starts.push(`${spec.role}:${spec.submission.name}:${spec.session.mode}`);
    if (spec.role === 'initial-architect') return submit(analysis([
      entry('richer-a-fact', a), entry('b-entry', b),
    ]));
    if (spec.submission.name === 'submit_work_item_result') {
      localTurns += 1;
      if (localTurns > 1) throw new Error('B local architect was dispatched while X owns the stack');
      return submit(assign(a, { goal: 'Render the richer B fact in A.' }, outline()));
    }
    if (spec.submission.name === 'submit_capability_qualification') {
      qualificationTurns += 1;
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt);
      if (!ids) throw new Error('Qualification prompt lost its request or invocation');
      if (qualificationTurns === 1) return submit({ kind: qualification === 'placement' ? 'request-placement' : 'unresolved',
        request: ids[1], invocation: ids[2], problem: 'B ownership needs a global decision',
        evidence: ['B owns the source fact; A owns calling code'] });
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact and A owns integration', constraints: ['D still uses the old text'], requirementRefs: [] });
    }
    if (spec.role === 'global-fork') return submit(forkDecision({
      decision: decision({ question: 'Does B own the richer fact?', outcome: 'reuse', capability: 'b-entry',
        owner: b, rationale: 'B owns the fact source and exposes its current API.',
        evidence: { citations: [{ module: b }], gaps: [] } }),
      brief: 'B owns the source fact. A integrates its calling code.',
    }));
    if (spec.role === 'engineer') return [
      edit('caller.ts', "return `Fact: ${value}`;", "return `Fresh fact: ${value}`;"),
      write('extra.ts', "export const sourceHint = 'B';\n"),
      edit('tests/caller.test.ts', "toBe('Fact: old')", "toBe('this test still fails')"),
      ...submit({ kind: 'capability-needed', summary: 'A has a provisional caller and a failing example', request: {
        need: 'Read B fact with its source for A',
        usage: [{ path: 'subs/a/src/caller.ts', symbol: 'renderA', use: 'Render the richer result', prospective: false }],
        constraints: ['D must retain the old text result'], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'A shows source', code: "expect(renderA(readFactWithSource())).toBe('Fresh fact: old from B')", designation: 'pseudocode' }],
        suggestedProvider: { module: b, reason: 'B owns fact data' },
      } }),
    ];
    if (spec.role === 'capability-architect') {
      capabilityPrompts.push(spec.prompt);
      capabilityTurns += 1;
      const ids = /Use task (cap-\d+), planRevision 1 and invocation (inv-\d+)/u.exec(spec.prompt);
      if (!ids) throw new Error('Capability prompt lost its task basis');
      if (capabilityTurns === 1) return submit({ kind: 'partial', task: ids[1], planRevision: 1, invocation: ids[2],
        progress: 'Read A source and B entry context', unfinished: ['Coordinate B and A assignments'] });
      return submit({ kind: 'assign', task: ids[1], planRevision: 1, invocation: ids[2], owner: b,
        purpose: 'Provide richer fact', approach: 'Extend B fact API', requirementRefs: [], intendedEvidence: ['A consumes the new B fact'] });
    }
    return [];
  };
}

test('CA01 CA03 CA04 CA28 CA30 CA32: request reaches one fresh architect and keeps A and B separate', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const base = await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  const starts: string[] = [];
  const capabilityPrompts: string[] = [];
  const opened = await openCapabilityRuns(fixture.root, {
    git: gitService, script: script(starts, capabilityPrompts), inputs: treeInputs(), readinessExecution: directReadinessExecution(),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-delegated' || event.type === 'job-failed' || event.type === 'job-completed'));
  expect((opened.service.events('need', receipt.jobId) ?? []).find(event => event.type === 'job-failed')).toBeUndefined();
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).filter(event =>
    event.type === 'invocation-ended' && (opened.service.events('need', receipt.jobId) ?? []).some(start =>
      start.type === 'invocation-started' && start.data.invocation === event.data.invocation &&
      start.data.role === 'capability-architect')).length >= 2);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(events.filter(event => event.type === 'capability-delegated')).toHaveLength(1);
  expect(events.filter(event => event.type === 'placement-requested')).toHaveLength(1);
  expect(events.filter(event => event.type === 'decision-accepted')).toHaveLength(1);
  const capabilityStarts = events.filter(event => event.type === 'invocation-started' && event.data.role === 'capability-architect');
  expect(capabilityStarts).toHaveLength(2);
  expect(starts).toContain('capability-architect:submit_capability_action:fresh');
  expect(starts).toContain('capability-architect:submit_capability_action:continue');
  expect(capabilityPrompts[0]).toContain('# Selected plan package ');
  expect(capabilityPrompts[0]).toContain('B owns the source fact. A integrates its calling code.');
  expect(capabilityPrompts[1]).toContain('was delivered in full in the earlier turn; it is unchanged');
  expect(capabilityPrompts[1]).not.toContain('# Selected plan package ');
  expect(capabilityPrompts[1]).not.toContain('Original request:');
  expect(capabilityStarts[1]?.type === 'invocation-started' ? capabilityStarts[1].data.session : null)
    .toBe(capabilityStarts[0]?.type === 'invocation-started' ? capabilityStarts[0].data.session : null);
  expect(starts.filter(start => start.startsWith('local-architect:submit_work_item_result'))).toHaveLength(1);
  expect(events.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
  expect(events.filter(event => event.type === 'contract-requested')).toHaveLength(0);
  const capabilitySession = capabilityStarts[0]?.type === 'invocation-started' ? capabilityStarts[0].data.session : null;
  expect(events.filter(event => event.type === 'session-finished' && event.data.session === capabilitySession)).toHaveLength(0);
  const request = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId, 'capabilities/requests/need-001.json'), 'utf8')) as CapabilityRequest;
  const task = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId, 'capabilities/cap-001/task.json'), 'utf8')) as CapabilityTask;
  expect(request.source.acceptedBase).not.toBe(base);
  expect((await git(fixture.root, 'rev-parse', 'HEAD')).trim()).toBe(request.source.acceptedBase);
  expect(request.original.examples[0]?.id).toBe('need-001.ex01');
  expect(request.source.delta.map(delta => delta.path)).toEqual([
    'subs/a/src/caller.ts', 'subs/a/src/extra.ts', 'subs/a/src/tests/caller.test.ts',
  ]);
  expect(task.deferredWorkItems).toContain('wi-002');
  expect(await readFile(join(fixture.root, 'subs/a/src/extra.ts'), 'utf8')).toContain('sourceHint');
  expect(opened.service.getRun('need', receipt.jobId)?.state).toBe('running');
  let stopped = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const version = opened.service.getRun('need', receipt.jobId)!.version;
    try {
      await opened.service.execute(stopRun('need', receipt.jobId, version));
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
}, 30_000);

test('historical test composition cannot create a policy/5 run', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  const opened = await openRuns(fixture.root, { git: gitService, script: script([]),
    readinessExecution: directReadinessExecution(),
    policy: root => capabilityPolicyFrom(testPolicy(root)) });
  cleanups.push(() => opened.service.close());
  await expect(opened.service.execute(startRun('need'))).rejects.toThrow('historical test workflow cannot create');
});

test('CA33: production composition captures policy/5 and delegates without contract dispatch', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  const opened = await openRuns(fixture.root, {
    production: true, git: gitService, script: script([]), inputs: treeInputs(),
    readinessExecution: directReadinessExecution(),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-delegated' || event.type === 'job-failed'));
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(events.filter(event => event.type === 'capability-delegated')).toHaveLength(1);
  expect(events.filter(event => event.type === 'contract-requested')).toHaveLength(0);
  const job = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId, 'job.json'), 'utf8')) as {
    policy: { version: string }; prompts: Record<string, unknown>;
  };
  expect(job.policy.version).toBe('run-policy/5');
  expect(job.prompts['capability-architect']).toBeDefined();
  expect(job.prompts['contract-engineer']).toBeUndefined();
  await opened.service.close();
}, 30_000);

test('an unresolved qualification returns through the global architect and the same local architect', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  const starts: string[] = [];
  const opened = await openCapabilityRuns(fixture.root, {
    git: gitService, script: script(starts, [], 'unresolved'), inputs: treeInputs(), readinessExecution: directReadinessExecution(),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-delegated' || event.type === 'job-failed'));
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(events.filter(event => event.type === 'job-failed')).toHaveLength(0);
  expect(events.filter(event => event.type === 'unresolved-requested')).toHaveLength(1);
  expect(events.filter(event => event.type === 'decision-accepted')).toHaveLength(1);
  expect(starts.filter(start => start.startsWith('local-architect:submit_capability_qualification'))).toEqual([
    'local-architect:submit_capability_qualification:continue',
    'local-architect:submit_capability_qualification:continue',
  ]);
  // The runner may append another event after the on-disk snapshot above.
  // Stop against the live version, retrying only that optimistic-concurrency race.
  for (;;) {
    const current = opened.service.getRun('need', receipt.jobId)!;
    if (current.state !== 'running') break;
    try {
      await opened.service.execute(stopRun('need', receipt.jobId, current.version));
      break;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('version')) throw error;
    }
  }
  await opened.service.settled('need', receipt.jobId);
}, 30_000);

test('CA02: local architect finds an existing API and the same engineer verifies it', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);
  await installMiniRunner(fixture.root);
  let engineerTurns = 0;
  const scripted: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return submit({ kind: 'satisfy-with-existing', request: ids[1], invocation: ids[2],
        api: { owner: b, path: 'subs/b/src/fact.ts', symbol: 'readFact' },
        guidance: 'Call readFact and retain its old text behavior', evidence: ['subs/b/src/fact.ts exports readFact'] });
    }
    if (spec.role === 'engineer') {
      engineerTurns += 1;
      return engineerTurns === 1 ? submit({ kind: 'capability-needed', summary: 'A needs the B text', request: {
        need: 'Read the B old fact in A',
        usage: [{ path: 'subs/a/src/caller.ts', symbol: 'renderA', use: 'Show the old fact', prospective: false }],
        constraints: [], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'A shows old fact', code: "expect(renderA(readFact())).toBe('Fact: old')", designation: 'pseudocode' }],
      } }) : submit({ kind: 'completion-proposed', summary: 'The existing B API meets the need', findings: [] });
    }
    if (spec.role === 'capability-architect') throw new Error('Existing behavior must not start a new task');
    return [];
  };
  const opened = await openCapabilityRuns(fixture.root, {
    git: gitService, script: scripted, inputs: treeInputs(), readinessExecution: directReadinessExecution(),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).filter(event =>
    event.type === 'invocation-started' && event.data.role === 'engineer').length >= 2);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const engineerStarts = events.filter((event): event is Extract<typeof event, { type: 'invocation-started' }> =>
    event.type === 'invocation-started' && event.data.role === 'engineer');
  expect(engineerStarts[1]?.data.session).toBe(engineerStarts[0]?.data.session);
  expect(engineerStarts[1]?.data.start).toBe('continued');
  expect(events.filter(event => event.type === 'capability-qualified' && event.data.outcome === 'satisfied')).toHaveLength(1);
  expect(events.filter(event => event.type === 'capability-delegated')).toHaveLength(0);
  expect(events.filter(event => event.type === 'contract-requested')).toHaveLength(0);
  if (!events.some(event => event.type === 'job-completed' || event.type === 'job-failed')) {
    for (;;) {
      const version = opened.service.getRun('need', receipt.jobId)!.version;
      try {
        await opened.service.execute(stopRun('need', receipt.jobId, version));
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('version')) throw error;
      }
    }
  }
  await opened.service.settled('need', receipt.jobId);
}, 30_000);

test('CA30: provisional snapshot keeps staged, worktree, untracked and deleted bytes separately', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const run = await temporaryDirectory();
  cleanups.push(run.remove);
  const base = await initRepository(fixture.root);
  const tracked = 'subs/a/src/caller.ts';
  await writeFile(join(fixture.root, tracked), 'export const staged = true;\n');
  await git(fixture.root, 'add', tracked);
  await writeFile(join(fixture.root, tracked), 'export const worktree = true;\n');
  await writeFile(join(fixture.root, 'subs/a/src/extra.ts'), 'export const untracked = true;\n');
  await rm(join(fixture.root, 'subs/d/src/consumer.ts'));
  const captured = await captureProvisionalSource({
    projectRoot: fixture.root, runDirectory: run.path, request: 'need-001', acceptedBase: base,
    writerSettledBy: 'inv-0001', changedPaths: await gitService.changedPaths(fixture.root, base),
  });
  const manifest = JSON.parse(await readFile(join(run.path, captured.snapshot), 'utf8')) as {
    files: Array<{ path: string; worktree: string | null; index: string | null; base: string | null }>;
    tree: string; snapshotHash: string;
  };
  expect(captured.tree).toBe(manifest.tree);
  expect(captured.snapshotHash).toBe(manifest.snapshotHash);
  expect(captured.tree).not.toBe(captured.snapshotHash);
  expect((await git(fixture.root, 'cat-file', '-t', captured.tree)).trim()).toBe('tree');
  expect((await git(fixture.root, 'diff', '--name-only', captured.tree, base)).trim().split('\n'))
    .toContain('subs/a/src/extra.ts');
  const staged = manifest.files.find(file => file.path === tracked)!;
  expect(Buffer.from(staged.index!, 'base64').toString()).toContain('staged = true');
  expect(Buffer.from(staged.worktree!, 'base64').toString()).toContain('worktree = true');
  expect(captured.delta.find(file => file.path === tracked)?.staged).toBe(true);
  const untracked = manifest.files.find(file => file.path === 'subs/a/src/extra.ts')!;
  expect(untracked.base).toBeNull();
  expect(untracked.index).toBeNull();
  expect(Buffer.from(untracked.worktree!, 'base64').toString()).toContain('untracked = true');
  const deleted = manifest.files.find(file => file.path === 'subs/d/src/consumer.ts')!;
  expect(deleted.worktree).toBeNull();
  expect(deleted.base).not.toBeNull();
});
