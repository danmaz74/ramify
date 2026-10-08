import { capabilityFlowBoundaries } from './helpers/capability-flow-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
import { rootDescription } from './helpers/root-description.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Script } from '../../subs/agent/src/scripted.js';
import { analysis, entry } from './helpers/analysis.js';
import { copyCapabilityFixture, openCapabilityRuns } from './helpers/capability.js';
import { assign, edit, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { runEventsOnDisk, runPath, startRun, stopRun, until } from './helpers/runs.js';
import type { IterationAssignment } from '../work/iterations.js';
import { decision, forkDecision } from './helpers/placement.js';

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
const d = 'capability-coordination/d';
const p = 'capability-coordination';

function script(seen: string[], mode: 'assignments' | 'boundary' | 'partial-blocker' = 'assignments',
  prompts: string[] = []): Script {
  let engineer = 0;
  let architect = 0;
  return spec => {
    seen.push(`${spec.role}:${spec.submission.name}:${spec.session.mode}:${spec.builtinTools.join(',')}`);
    prompts.push(spec.prompt);
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
      edit('tests/caller.test.ts', "toBe('Fact: old')", "toBe('this test still fails')"));
      const owner = spec.prompt.includes('# Iteration cap-') ? /Your starting module is `([^`]+)`/u.exec(spec.prompt)?.[1] : undefined;
      if (mode === 'partial-blocker' && owner === a) return submit({
        kind: 'partial', done: ['A kept the readable selected denial'], unfinished: ['Root-owned stale assertion in src/tests/stale.test.ts'],
        findings: ['A cannot write the root test from its module scope'],
      }, write('caller.ts', "export const renderA = () => 'readable denial';\n"));
      if (mode === 'partial-blocker' && owner === p) return submit({
        kind: 'completion-proposed', summary: 'Root updated its stale assertion', findings: [],
      }, edit('tests/stale.test.ts', "expect('old')", "expect('readable denial')"));
      if (owner === b) return submit({ kind: 'completion-proposed', summary: 'B extended', findings: [] },
        write('fact.ts', "export const readFact = () => 'old from B';\n"),
        write('../../a/src/caller.ts', 'export const escaped = true;\n'));
      if (owner === d) return submit({ kind: 'completion-proposed', summary: 'D migrated', findings: [] },
        write('consumer.ts', "export const useFact = () => 'old';\n"),
        write('../module.ramify', 'ramify 1\nmodule d\nexpose-src legacyLabel from \"consumer.ts\" to parent\n'));
      if (owner === p) return submit({ kind: 'completion-proposed', summary: 'P exposed', findings: [] },
        write('../module.ramify', rootDescription('capability-coordination', 'expose-sub readFact from b to descendants\nexpose-sub legacyLabel from d to descendants\n')),
        write('../subs/b/src/companion.ts', 'export const companion = true;\n'));
      if (owner === a) return submit({ kind: 'completion-proposed', summary: 'A integrated', findings: [] },
        write('caller.ts', "export const renderA = () => 'old from B';\n"));
      throw new Error(`Unexpected engineer turn ${engineer}: ${spec.prompt.slice(0, 150)}`);
    }
    if (spec.role === 'capability-architect') {
      architect += 1;
      const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      const basis = { task: ids[1], planRevision: Number(ids[2]), invocation: ids[3] };
      if (mode === 'partial-blocker') return architect <= 2
        ? submit({ ...basis, kind: 'assign', assignment: assign(architect === 1 ? a : p, { goal: architect === 1 ? 'Render A denial' : 'Repair root-owned stale assertion', approach: 'Change only owned source or tests', completionEvidence: 'Owned source diff' }).assignment })
        : [{ kind: 'wait', ms: 60_000 }];
      if (mode === 'boundary' && architect === 1) return submit({ ...basis, kind: 'request-placement',
        problem: 'Should another owner take the source fact?', evidence: ['B currently owns it'] });
      if (mode === 'boundary' && architect === 2) return submit({ ...basis, kind: 'consult-consumer',
        question: 'Can A use B unchanged?', sections: ['need'], references: ['subs/a/src/caller.ts'] });
      if (mode === 'boundary') return architect === 3
        ? submit({ ...basis, kind: 'partial', progress: 'Boundary decision returned', unfinished: ['Acceptance remains'] })
        : [{ kind: 'wait', ms: 60_000 }];
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
      if (architect >= 2 && architect <= 5) return submit({ ...basis, kind: 'assign', assignment: assign(owners[architect - 2]!, {
        goal: `Update ${owners[architect - 2]}`, approach: 'Change owned source', completionEvidence: 'Owned source diff',
        scope: { base: { module: owners[architect - 2]!, included: owners[architect - 2] === p ? [{ directory: 'subs/b', reason: 'Fixture child', instructions: 'Implement fixture behavior' }] : [] },
          extra: [], read: [], rationale: 'Scoped compatibility change' },
      }).assignment });
      return architect === 6
        ? submit({ ...basis, kind: 'partial', progress: 'Assignments are provisional', unfinished: ['Acceptance remains'] })
        : [{ kind: 'wait', ms: 60_000 }];
    }
    return [];
  };
}

test('an explicit partial capability result returns its cross-owner blocker to the architect', async () => {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  const boundaryAnswers = capabilityFlowBoundaries(fixture.root, 'partial', 'a+b'); answers.push(boundaryAnswers);
  await mkdir(join(fixture.root, 'src/tests'), { recursive: true });
  await writeFile(join(fixture.root, 'src/tests/stale.test.ts'), "expect('old');\n");

  const seen: string[] = [], prompts: string[] = [];
  const opened = await openGuardedCapabilityRuns(fixture.root, boundaryAnswers, { ...boundaryAnswers.options,
    script: script(seen, 'partial-blocker', prompts), inputs: treeInputs(),
    });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => {
    const events = opened.service.events('need', receipt.jobId) ?? [];
    return events.filter(event => event.type === 'capability-assignment-settled').length >= 2 ||
      events.some(event => event.type === 'job-failed');
  }, 40_000);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(events.filter(event => event.type === 'job-failed'), JSON.stringify(events.slice(-8))).toHaveLength(0);
  const settled = events.filter(event => event.type === 'capability-assignment-settled');
  expect(settled).toHaveLength(2);
  expect(settled[0]?.data).toMatchObject({ assignment: 'cap-001.i01', outcome: 'partial',
    mutated: ['subs/a/src/caller.ts'] });
  expect(settled[1]?.data).toMatchObject({ assignment: 'cap-001.i02', outcome: 'accepted',
    mutated: ['src/tests/stale.test.ts'] });
  expect(events.filter(event => event.type === 'capability-assigned').map(event => event.data.assignment))
    .toEqual(['cap-001.i01', 'cap-001.i02']);
  const partial = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId, 'work-items/cap-001/iterations/01/result.json'), 'utf8'));
  expect(partial.findings).toContain('unfinished: Root-owned stale assertion in src/tests/stale.test.ts');
  expect(prompts.some(prompt => prompt.includes('unfinished: Root-owned stale assertion in src/tests/stale.test.ts')))
    .toBe(true);
  expect(await readFile(join(fixture.root, 'src/tests/stale.test.ts'), 'utf8')).toContain("expect('readable denial')");
  await stopAfterArchitectYield(opened.service, receipt.jobId);
  await opened.service.settled('need', receipt.jobId);
}, 60_000);

test('CA06–CA10 CA28–CA30: consultation stays read-only and B, D, P, A receive task-owned scopes', async () => {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  const boundaryAnswers = capabilityFlowBoundaries(fixture.root, 'assignment', 'a+b'); answers.push(boundaryAnswers);

  const seen: string[] = [];
  const opened = await openGuardedCapabilityRuns(fixture.root, boundaryAnswers, { ...boundaryAnswers.options, script: script(seen), inputs: treeInputs(),
    });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => { const events = opened.service.events('need', receipt.jobId) ?? []; return events.filter(event => event.type === 'capability-assignment-settled').length >= 4 || events.some(event => event.type === 'job-failed'); }, 120_000)
    .catch(async error => { throw new Error(`${String(error)}; seen=${JSON.stringify(seen)}; tail=${JSON.stringify((await runEventsOnDisk(fixture.root, 'need', receipt.jobId)).slice(-25))}`); });
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
  // Its writes are what the observations record.
  expect(originalObservations.length).toBeGreaterThan(0);
  const consultation = engineerStarts.find(event => event.data.work.capabilityTask === 'cap-001')!;
  const aExperiment = engineerStarts.find(event => event.data.work.iteration === 'cap-001.i04')!;
  expect(consultation.data.session).toBe(original.data.session);
  expect(aExperiment.data.session).not.toBe(original.data.session);
  expect(aExperiment.data.start).toBe('opened');
  const bInvocation = engineerStarts.find(event => event.data.work.iteration === 'cap-001.i01')!;
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
    runPath(fixture.root, 'need', receipt.jobId, `work-items/cap-001/iterations/0${number}/assignment.json`), 'utf8')) as IterationAssignment));
  expect(assignments.map(assignment => 'module' in assignment.scope.base ? assignment.scope.base.module : assignment.scope.base.modules[0])).toEqual([b, d, p, a]);
  expect(assignments.map(assignment => assignment.coordination?.kind === 'capability-task' ? assignment.coordination.sequence : null)).toEqual([1, 2, 3, 4]);
  expect(events.filter(event => event.type === 'invocation-started' && event.data.role === 'local-architect' &&
    event.sequence > events.find(delegated => delegated.type === 'capability-delegated')!.sequence)).toHaveLength(0);
  expect(events.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
  const denied = events.filter(event => event.type === 'writer-released');
  expect(denied).toHaveLength(5);
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).filter(event => event.type === 'invocation-ended' &&
    (opened.service.events('need', receipt.jobId) ?? []).some(start => start.type === 'invocation-started' &&
      start.data.invocation === event.data.invocation && start.data.role === 'capability-architect')).length >= 6);
  await stopAfterArchitectYield(opened.service, receipt.jobId);
  await opened.service.settled('need', receipt.jobId);
}, 180_000);

test('CA10: a wider boundary decision returns to the same capability architect', async () => {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  const boundaryAnswers = capabilityFlowBoundaries(fixture.root, 'boundary', 'a+b'); answers.push(boundaryAnswers);

  const seen: string[] = [];
  const opened = await openGuardedCapabilityRuns(fixture.root, boundaryAnswers, { ...boundaryAnswers.options, script: script(seen, 'boundary'),
    inputs: treeInputs(), });
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
  await stopAfterArchitectYield(opened.service, receipt.jobId);
  await opened.service.settled('need', receipt.jobId);
}, 45_000);

async function stopAfterArchitectYield(service: Awaited<ReturnType<typeof openCapabilityRuns>>['service'], jobId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const events = service.events('need', jobId)!;
    try {
      await service.execute(stopRun('need', jobId, events.at(-1)!.sequence));
      return;
    } catch (error) {
      if (!String(error).includes('at version')) throw error;
    }
  }
  throw new Error('The architect did not yield a stable stop version');
}


test('PB3: unreadable inherited directory bytes cannot be captured as absent authority', async () => {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  const boundaryAnswers = capabilityFlowBoundaries(fixture.root, 'unreadable', 'a+b'); answers.push(boundaryAnswers);

  const baseScript = script([]);
  let unreadableCandidate = false;
  const git = Object.assign(Object.create(boundaryAnswers.options.git), {
    changedPaths: async (root: string, base?: string) => unreadableCandidate ? ['subs/a/src'] : boundaryAnswers.options.git.changedPaths(root, base),
  });
  const opened = await openGuardedCapabilityRuns(fixture.root, boundaryAnswers, { ...boundaryAnswers.options, git, inputs: treeInputs(), script: spec => {
    const steps = typeof baseScript === 'function' ? baseScript(spec) : baseScript;
    if (spec.role === 'capability-architect' && steps.some(step => step.kind === 'submit' && (step.input as { kind?: string }).kind === 'assign')) unreadableCandidate = true;
    return steps;
  } });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('need'));
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 60_000);
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const failure = events.find(event => event.type === 'job-failed');
  expect(failure?.data).toMatchObject({ reason: 'internal', message: expect.stringContaining('EISDIR') });
  expect(events.filter(event => event.type === 'capability-assigned')).toEqual([]);
}, 90_000);
