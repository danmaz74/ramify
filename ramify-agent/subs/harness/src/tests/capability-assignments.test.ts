import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Script } from '../../subs/agent/src/scripted.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { analysis, entry } from './helpers/analysis.js';
import { copyCapabilityFixture, openCapabilityRuns } from './helpers/capability.js';
import { assign, edit, installMiniRunner, outline, runScopeTests, submit, treeInputs, write } from './helpers/iterations.js';
import { directReadinessExecution } from './helpers/external-tools.js';
import { initRepository, runEventsOnDisk, runPath, startRun, stopRun, until } from './helpers/runs.js';
import type { CapabilityAssignment } from '../capability/records.js';
import { decision, forkDecision } from './helpers/placement.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const a = 'capability-coordination/a';
const b = 'capability-coordination/b';
const d = 'capability-coordination/d';
const p = 'capability-coordination';

function script(seen: string[], mode: 'assignments' | 'boundary' = 'assignments'): Script {
  let engineer = 0;
  let architect = 0;
  return spec => {
    seen.push(`${spec.role}:${spec.submission.name}:${spec.session.mode}:${spec.builtinTools.join(',')}`);
    if (spec.role === 'initial-architect') return submit(analysis([entry('richer-a-fact', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
    if (spec.submission.name === 'submit_capability_qualification') {
      const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2], provider: b,
        placementReason: 'B owns the fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'global-fork') return submit(forkDecision({
      decision: decision({ question: 'Does a wider owner boundary need redesign?', outcome: 'reuse',
        capability: 'b-entry', owner: b, rationale: 'Keep B ownership and A integration.',
        evidence: { citations: [{ module: b }], gaps: [] } }),
      brief: 'The wider owner keeps its existing responsibility.',
    }));
    if (spec.submission.name === 'answer_capability_consultation') {
      return submit({ answer: 'A needs source metadata beside the value', objections: ['Preserve the old text API'] },
        write('caller.ts', 'export const forbidden = true;\n'));
    }
    if (spec.role === 'engineer') {
      engineer += 1;
      if (engineer === 1) return submit({ kind: 'capability-needed', summary: 'A needs source metadata', request: {
        need: 'Read a B fact and source in A',
        usage: [{ path: 'subs/a/src/caller.ts', symbol: 'renderA', use: 'Show source', prospective: false }],
        constraints: ['D retains old text'], knownInterface: { kind: 'none-known' },
        examples: [{ title: 'source appears', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
      } },
      edit('caller.ts', 'Fact: ${value}', 'Fresh fact: ${value}'),
      write('extra.ts', "export const sourceHint = 'B';\n"),
      edit('tests/caller.test.ts', "toBe('Fact: old')", "toBe('this test still fails')"),
      runScopeTests());
      const owner = /Capability assignment (cap-\d+\.i\d+) in ([^\n]+)/u.exec(spec.prompt)?.[2];
      if (owner === b) return submit({ kind: 'completion-proposed', summary: 'B extended', findings: [] },
        write('fact.ts', "export const readFact = () => 'old from B';\n"),
        write('../../a/src/caller.ts', 'export const escaped = true;\n'));
      if (owner === d) return submit({ kind: 'completion-proposed', summary: 'D migrated', findings: [] },
        write('consumer.ts', "export const useFact = () => 'old';\n"),
        write('../module.ramify', 'ramify 1\nmodule d\nexpose-src legacyLabel from \"consumer.ts\" to parent\n'));
      if (owner === p) return submit({ kind: 'completion-proposed', summary: 'P exposed', findings: [] },
        write('../module.ramify', 'ramify 1\nmodule capability-coordination\nexpose-sub readFact from b to descendants\nexpose-sub legacyLabel from d to descendants\n'),
        write('../subs/b/src/companion.ts', 'export const companion = true;\n'));
      if (owner === a) return submit({ kind: 'completion-proposed', summary: 'A integrated', findings: [] },
        write('caller.ts', "export const renderA = () => 'old from B';\n"));
      throw new Error(`Unexpected engineer turn ${engineer}: ${spec.prompt.slice(0, 150)}`);
    }
    if (spec.role === 'capability-architect') {
      architect += 1;
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      const basis = { task: ids[1], planRevision: Number(ids[2]), invocation: ids[3] };
      if (mode === 'boundary' && architect === 1) return submit({ ...basis, kind: 'request-placement',
        problem: 'Should another owner take the source fact?', evidence: ['B currently owns it'] });
      if (mode === 'boundary' && architect === 2) return submit({ ...basis, kind: 'consult-consumer',
        question: 'Can A use B unchanged?', sections: ['need'], references: ['subs/a/src/caller.ts'] });
      if (mode === 'boundary') return submit({ ...basis, kind: 'request-handback', summary: 'Pending gate',
        coverage: [{ case: 'need-001.ex01', evidence: ['candidate'] }],
        interfaces: [{ path: 'subs/b/src/fact.ts', use: 'A calls B' }], limitations: [] });
      if (architect === 1) return [
        { kind: 'tool', tool: 'validate_capability_action', input: { ...basis, kind: 'assign', owner: b } },
        { kind: 'tool', tool: 'update_capability_plan', input: { task: ids[1], basedOn: 1,
          invocation: ids[3], reason: 'A needs a direct answer before implementation',
          changes: { proposedInterface: 'B returns fact text with its source' } } },
        { kind: 'submit', input: { ...basis, kind: 'consult-consumer', question: 'What must A display?',
          sections: ['need'], references: ['subs/a/src/caller.ts'] } },
        ...submit({ ...basis, planRevision: 2, kind: 'consult-consumer', question: 'What must A display?',
          sections: ['need'], references: ['subs/a/src/caller.ts'] }),
      ];
      const owners = [b, d, p, a];
      if (architect >= 2 && architect <= 5) return submit({ ...basis, kind: 'assign', owner: owners[architect - 2],
        ...(owners[architect - 2] === p ? { includedChildren: [b] } : {}),
        purpose: `Update ${owners[architect - 2]}`, approach: 'Change owned source', requirementRefs: [], intendedEvidence: ['Owned source diff'] });
      return submit({ ...basis, kind: 'request-handback', summary: 'Pending gate',
        coverage: [{ case: 'need-001.ex01', evidence: ['candidate'] }], interfaces: [{ path: 'subs/b/src/fact.ts', use: 'A calls B' }], limitations: [] });
    }
    return [];
  };
}

test('CA06–CA10 CA28–CA30: consultation stays read-only and B, D, P, A receive task-owned scopes', async () => {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  await initRepository(fixture.root); await installMiniRunner(fixture.root);
  const seen: string[] = [];
  const opened = await openCapabilityRuns(fixture.root, { git: gitService, script: script(seen), inputs: treeInputs(),
    readinessExecution: directReadinessExecution() });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => { const events = opened.service.events('need', receipt.jobId) ?? []; return events.filter(event => event.type === 'capability-assignment-settled').length >= 4 || events.some(event => event.type === 'job-failed'); }, 40_000);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(events.filter(event => event.type === 'job-failed'), JSON.stringify({ seen, tail: events.slice(-8) })).toHaveLength(0);
  expect(events.filter(event => event.type === 'capability-exchange-answered')).toHaveLength(1);
  expect(events.filter(event => event.type === 'capability-plan-revised')).toHaveLength(1);
  expect(events.filter(event => event.type === 'capability-assigned')).toHaveLength(4);
  expect(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    'capabilities/cap-001/plan/2.json'), 'utf8')).toContain('B returns fact text with its source');
  const firstArchitect = events.find(event => event.type === 'invocation-started' && event.data.role === 'capability-architect')!;
  if (firstArchitect.type !== 'invocation-started') throw new Error('Missing capability architect invocation');
  const architectObservations = (await readFile(runPath(fixture.root, 'need', receipt.jobId,
    `invocations/${firstArchitect.data.invocation}/observations.jsonl`), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as {
      type: string; data: { target?: string; errors?: Array<{ path: string }> };
    });
  expect(architectObservations.filter(observation => observation.type === 'rejection' &&
    observation.data.target === 'submit_capability_action')).toHaveLength(1);
  expect(architectObservations.find(observation => observation.type === 'rejection')?.data.errors)
    .toContainEqual(expect.objectContaining({ path: 'planRevision' }));
  expect(seen.find(s => s.includes('answer_capability_consultation'))).toContain(':continue:read,grep,ls');
  expect(await readFile(join(fixture.root, 'subs/a/src/caller.ts'), 'utf8')).not.toContain('forbidden');
  expect(await readFile(join(fixture.root, 'subs/a/src/extra.ts'), 'utf8')).toContain('sourceHint');
  expect(events.filter(event => event.type === 'writer-acquired')).toHaveLength(5); // original A plus four X assignments
  const writerEvents = events.filter(event => event.type === 'writer-acquired' || event.type === 'writer-released');
  expect(writerEvents.map(event => event.type)).toEqual(Array.from({ length: 5 }, () => ['writer-acquired', 'writer-released']).flat());
  const engineerStarts = events.filter((event): event is Extract<typeof event, { type: 'invocation-started' }> =>
    event.type === 'invocation-started' && event.data.role === 'engineer');
  const original = engineerStarts[0]!;
  const originalObservations = (await readFile(runPath(fixture.root, 'need', receipt.jobId,
    `invocations/${original.data.invocation}/observations.jsonl`), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as {
      type: string; data: { outcome?: string };
    });
  expect(originalObservations).toContainEqual(expect.objectContaining({ type: 'scope-tests',
    data: expect.objectContaining({ outcome: 'failed' }) }));
  const consultation = engineerStarts.find(event => event.data.work.capabilityTask === 'cap-001' &&
    event.data.work.capabilityAssignment === undefined)!;
  const aExperiment = engineerStarts.find(event => event.data.work.capabilityAssignment === 'cap-001.i04')!;
  expect(consultation.data.session).toBe(original.data.session);
  expect(aExperiment.data.session).toBe(original.data.session);
  expect(aExperiment.data.start).toBe('continued');
  const bInvocation = engineerStarts.find(event => event.data.work.capabilityAssignment === 'cap-001.i01')!;
  const bObservations = (await readFile(runPath(fixture.root, 'need', receipt.jobId,
    `invocations/${bInvocation.data.invocation}/observations.jsonl`), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as {
      type: string; data: { verdict?: string; requested?: string };
    });
  expect(bObservations).toContainEqual(expect.objectContaining({ type: 'guard',
    data: expect.objectContaining({ verdict: 'blocked-scope', requested: '../../a/src/caller.ts' }) }));
  const settled = events.filter(event => event.type === 'capability-assignment-settled');
  expect(settled.map(event => event.type === 'capability-assignment-settled' ? event.data.mutated : [])).toEqual([
    ['subs/b/src/fact.ts'], ['subs/d/module.ramify', 'subs/d/src/consumer.ts'],
    ['module.ramify', 'subs/b/src/companion.ts'], ['subs/a/src/caller.ts'],
  ]);
  const assignments = await Promise.all([1, 2, 3, 4].map(async number => JSON.parse(await readFile(
    runPath(fixture.root, 'need', receipt.jobId, `capabilities/cap-001/assignments/cap-001.i0${number}.json`), 'utf8')) as CapabilityAssignment));
  expect(assignments.map(a => a.owner)).toEqual([b, d, p, a]);
  expect(assignments.map(a => a.sequence)).toEqual([1, 2, 3, 4]);
  expect(events.filter(event => event.type === 'invocation-started' && event.data.role === 'local-architect' &&
    event.sequence > events.find(delegated => delegated.type === 'capability-delegated')!.sequence)).toHaveLength(0);
  expect(events.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
  const denied = events.filter(event => event.type === 'writer-released');
  expect(denied).toHaveLength(5);
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).filter(event => event.type === 'invocation-ended' &&
    (opened.service.events('need', receipt.jobId) ?? []).some(start => start.type === 'invocation-started' &&
      start.data.invocation === event.data.invocation && start.data.role === 'capability-architect')).length >= 6);
  const current = opened.service.events('need', receipt.jobId)!;
  await opened.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence));
  await opened.service.settled('need', receipt.jobId);
}, 60_000);

test('CA10: a wider boundary decision returns to the same capability architect', async () => {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  await initRepository(fixture.root); await installMiniRunner(fixture.root);
  const seen: string[] = [];
  const opened = await openCapabilityRuns(fixture.root, { git: gitService, script: script(seen, 'boundary'),
    inputs: treeInputs(), readinessExecution: directReadinessExecution() });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-exchange-answered' || event.type === 'job-failed'), 30_000);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(events.filter(event => event.type === 'job-failed')).toHaveLength(0);
  expect(events.filter(event => event.type === 'placement-requested')).toHaveLength(1);
  expect(events.filter(event => event.type === 'decision-accepted')).toHaveLength(1);
  const architects = events.filter((event): event is Extract<typeof event, { type: 'invocation-started' }> =>
    event.type === 'invocation-started' && event.data.role === 'capability-architect');
  expect(architects.length).toBeGreaterThanOrEqual(2);
  expect(architects[1]?.data.session).toBe(architects[0]?.data.session);
  expect(events.filter(event => event.type === 'invocation-started' && event.data.role === 'local-architect' &&
    event.sequence > events.find(delegated => delegated.type === 'capability-delegated')!.sequence)).toHaveLength(0);
  await until(() => {
    const current = opened.service.events('need', receipt.jobId) ?? [];
    return current.filter(event => event.type === 'invocation-ended' && current.some(start =>
      start.type === 'invocation-started' && start.data.invocation === event.data.invocation &&
      start.data.role === 'capability-architect')).length >= 3;
  });
  const current = opened.service.events('need', receipt.jobId)!;
  await opened.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence));
  await opened.service.settled('need', receipt.jobId);
}, 45_000);
