import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { GateAttempt } from '../checks/records.js';
import { iterationLayout, type IterationAssignment, type IterationResult } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import { ObservationLog, type Observation, type ObservationOf } from '../run/observations.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import {
  addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline,
  runScopeTests, submit, treeInputs, viewedInputs, write,
} from './helpers/iterations.js';
import {
  git, initRepository, installTestRunner, onlyRun, openRuns, realRamify, runEventsOnDisk,
  runPath, startRun,
} from './helpers/runs.js';

/*
 * Iteration assignments, engineers and the iteration gate, over the fixture
 * project.
 *
 * Every run here works a real copy of the fixture: a real git repository, a
 * real architect view materialized and refreshed by the installed Ramify, a
 * real write guard over real paths, and a real test runner whose exit code
 * the harness reads. The agent is the scripted fake, which writes for real
 * through the port's own built-ins.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const reviews = 'collection-review/workspace/reviews';
const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

/**
 * A copy of the fixture with one module of its own, so that an iteration has
 * somewhere real to work and its tests are files this test wrote.
 */
async function target(options: { readonly miniRunner?: boolean; readonly notes?: boolean } = {}) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  if (options.notes !== false) {
    await addModule(fixture.root, notesDirectory, 'notes', {
      'src/notes.ts': 'export const noteLimit = 400;\n',
      'src/tests/notes.test.ts': [
        'import { test, expect } from \'vitest\';',
        'import { noteLimit } from \'../notes.ts\';',
        '',
        'test(\'the note limit is what the plan asks for\', () => {',
        '  expect(noteLimit).toBe(500);',
        '});',
        '',
      ].join('\n'),
    });
  }
  if (options.miniRunner === true) await installMiniRunner(fixture.root);
  else await installTestRunner(fixture.root);
  await initRepository(fixture.root);
  return fixture.root;
}

/** Opens a run over `root` with the scripted fake, the real Ramify and a real architect view. */
async function run(root: string, plan: Parameters<typeof byRole>[0], options: { readonly declaredTree?: boolean } = {}) {
  // A test that must prove the refresh gets an installed Ramify with a
  // daemon of its own, disposed with the test: a daemon that has analysed a
  // project which is then removed cannot be relied on for the next.
  const daemon = options.declaredTree === true ? undefined : await realRamify();
  if (daemon !== undefined) cleanups.push(() => daemon.dispose());
  const opened = await openRuns(root, {
    script: byRole(plan),
    ...(daemon === undefined
      ? { inputs: treeInputs() }
      : { ramify: daemon.ramify, inputs: viewedInputs(daemon.ramify) }),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  return { ...opened, runId: receipt.jobId };
}

async function readGate(root: string, runId: string, id: string): Promise<GateAttempt> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate(id)), 'utf8')) as GateAttempt;
}

async function readAssignment(root: string, runId: string, workItem: string, number: number): Promise<IterationAssignment> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.assignment(workItem, number)), 'utf8')) as IterationAssignment;
}

async function readResult(root: string, runId: string, workItem: string, number: number): Promise<IterationResult> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.result(workItem, number)), 'utf8')) as IterationResult;
}

describe('G8: one small work item completes in one iteration', () => {
  test('a local architect assigns it, an engineer works it, the gate accepts it and the harness commits', async () => {
    const root = await target({ miniRunner: true });
    const { service, runId } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, {}, outline())),
        submit(requestCompletion({ changes: 'The iteration carried the goal; the work item is ready.', revisionReason: 'The iteration is accepted.' })),
      ],
      engineer: [submit(
        completionProposed('Raised the note limit to the 500 characters the plan asks for.'),
        edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500'),
        runScopeTests(),
      )],
    });

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('completed');

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const types = events.map(event => event.type);
    expect(types).toContain('iteration-assigned');
    expect(types).toContain('writer-acquired');
    expect(types).toContain('writer-released');
    expect(types).toContain('iteration-closed');
    // The writer is acquired before the session starts and released before
    // the gate runs.
    expect(types.indexOf('writer-acquired')).toBeLessThan(types.indexOf('writer-released'));

    const assignment = await readAssignment(root, runId, 'wi-001', 1);
    expect(assignment.id).toBe('wi-001.i01');
    expect(assignment.gate).toEqual({
      checkpoint: 'iteration',
      tests: { policy: 'owned-by-scope', exactOwners: [notes], subtrees: [], extraSuites: [] },
    });
    expect(assignment.scope.resolved.roots.some(path => path.endsWith(`${notesDirectory}/src`))).toBe(true);
    expect(assignment.guarded.map(file => file.path)).toContain('package.json');

    const result = await readResult(root, runId, 'wi-001', 1);
    expect(result.outcome).toBe('accepted');
    expect(result.gate).not.toBeNull();
    expect(result.commit).not.toBeNull();

    // The gate ran the files the policy resolved to, and the repair the
    // engineer made is what let it pass.
    const gate = await readGate(root, runId, result.gate!);
    expect(gate.verdict).toBe('passed');
    expect(gate.subject).toEqual({ workItem: 'wi-001', iteration: 'wi-001.i01' });
    expect(gate.commands[0]!.selection!.resolved).toEqual([`${notesDirectory}/src/tests/notes.test.ts`]);
    expect(await readFile(join(root, notesDirectory, 'src', 'notes.ts'), 'utf8')).toBe('export const noteLimit = 500;\n');

    // One commit for the accepted iteration, with the harness's own message.
    const log = await git(root, 'log', '--format=%H%x1f%B%x1e', `ramify-agent/run-${runId}`);
    const commits = log.split('\u001e').map(part => part.trim()).filter(Boolean);
    const accepted = commits.find(commit => commit.includes('Ramify-Iteration: wi-001.i01'));
    expect(accepted).toBeDefined();
    expect(accepted).toContain('Raised the note limit to the 500 characters the plan asks for.');
    expect(accepted).toContain('Checks: passed');
    expect(accepted).toContain(`Ramify-Gate: ${result.gate}`);
    expect(accepted).toContain('1 file; owners collection-review/workspace/reviews/notes');

    // The fixture's Cucumber suite is outside the one runner this MVP
    // selects. It is a coverage gap on the attempt, never an absence of
    // tests, and it is read from the project's own manifest.
    const observations = (await readFile(runPath(root, 'review-notes', runId, runLayout.observations(result.invocations[0]!)), 'utf8'))
      .split('\n').filter(Boolean).map(line => JSON.parse(line) as Observation)
      .filter((line): line is ObservationOf<'coverage-gap'> => line.type === 'coverage-gap');
    const unsupported = observations.filter(line => line.data.kind === 'unsupported-runner');
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]!.data.detail).toContain('test:cucumber');
  }, 300_000);
});

describe('G8: a work item revised across several iterations keeps every obligation', () => {
  test('three outline revisions, each from its own turn of one continuing session, and nothing already closed reopens', async () => {
    const root = await target();
    const { service, runId } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, {}, outline({ changes: 'The note needs a store and a limit.', revisionReason: '' }))),
        submit(assign(notes, { goal: 'State the limit where the plan asks for it.' }, outline({
          changes: 'The store is there; the limit is not.',
          revisionReason: 'The first iteration showed the limit belongs beside the store.',
        }))),
        submit(assign(notes, { goal: 'Cover the limit with a test.' }, outline({
          changes: 'The limit is there; the evidence for it is not.',
          revisionReason: 'The second iteration left the evidence obligation open.',
        }))),
        submit(requestCompletion({
          changes: 'The note, its limit and the evidence for it are all in place.',
          revisionReason: 'Every obligation the earlier revisions opened is discharged.',
        })),
      ],
      engineer: [submit(completionProposed('Added the note store.'), write(`${notesDirectory}/src/store.ts`, 'export const store = new Map();\n'))],
    }, { declaredTree: true });

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const events = await runEventsOnDisk(root, 'review-notes', runId);

    // Three assignments, three accepted iterations, and four outline
    // revisions: one per assignment and one with the completion request.
    const assigned = events.filter(event => event.type === 'iteration-assigned');
    expect(assigned.map(event => (event.data as { iteration: string }).iteration)).toEqual(['wi-001.i01', 'wi-001.i02', 'wi-001.i03']);
    const closed = events.filter(event => event.type === 'iteration-closed');
    expect(closed.map(event => (event.data as { outcome: string }).outcome)).toEqual(['accepted', 'accepted', 'accepted']);
    const revisions = events.filter(event => event.type === 'outline-revised');
    expect(revisions.map(event => (event.data as { revision: number }).revision)).toEqual([1, 2, 3, 4]);

    // Every revision came from its own invocation of one continuing session:
    // each turn is its own invocation, and the architect that receives the
    // third result is the one that wrote the first outline.
    const architectTurns = new Set(revisions.map(event => (event.data as { invocation: string }).invocation));
    expect(architectTurns.size).toBe(4);
    const invocations = events.filter(event => event.type === 'invocation-started' && (event.data as { role: string }).role === 'local-architect');
    expect(invocations).toHaveLength(4);

    // An obligation an earlier revision opened is not lost: the work item's
    // own gate is the only thing that closes it, and each accepted iteration
    // stays accepted in the log that follows it.
    for (const number of [1, 2, 3]) {
      const result = await readResult(root, runId, 'wi-001', number);
      expect(result.outcome).toBe('accepted');
      expect(result.gate).not.toBeNull();
    }
    expect(events.filter(event => event.type === 'work-item-completed')).toHaveLength(1);
  }, 300_000);
});

describe('K3: exact-owner and included-subtree selections at gate time', () => {
  test('two assignments over one owner differ by exactly the included subtree\'s test files', async () => {
    const root = await target({ notes: false });
    const { service, runId } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', reviews)]))],
      'local-architect': [
        submit(assign(reviews, {}, outline())),
        submit(assign(reviews, {
          goal: 'Carry the change into the core beneath it.',
          scope: {
            base: { module: reviews, includedChildren: [`${reviews}/core`] },
            extra: [], read: [], rationale: 'The core changes with it.',
          },
        })),
        submit(requestCompletion()),
      ],
      engineer: [submit(completionProposed('Nothing needed changing.'))],
    }, { declaredTree: true });

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const first = await readAssignment(root, runId, 'wi-001', 1);
    const second = await readAssignment(root, runId, 'wi-001', 2);
    expect(first.gate.tests.subtrees).toEqual([]);
    expect(second.gate.tests.subtrees).toEqual([`${reviews}/core`]);

    const firstGate = await readGate(root, runId, (await readResult(root, runId, 'wi-001', 1)).gate!);
    const secondGate = await readGate(root, runId, (await readResult(root, runId, 'wi-001', 2)).gate!);
    const exact = firstGate.commands[0]!.selection!.resolved;
    const withSubtree = secondGate.commands[0]!.selection!.resolved;

    expect(exact).toEqual([
      'subs/workspace/subs/reviews/src/tests/router.test.ts',
      'subs/workspace/subs/reviews/src/tests/sessions.test.ts',
      'subs/workspace/subs/reviews/src/tests/typing.test.ts',
    ]);
    expect(withSubtree.filter(file => !exact.includes(file))).toEqual([
      'subs/workspace/subs/reviews/subs/core/src/tests/runtime.test.ts',
      'subs/workspace/subs/reviews/subs/core/subs/controller/src/tests/controller.test.ts',
      'subs/workspace/subs/reviews/subs/core/subs/tasks/src/tests/inspection-task.test.ts',
      'subs/workspace/subs/reviews/subs/core/subs/tasks/src/tests/result.test.ts',
    ]);
    // The scope the engineer could write differs the same way.
    expect(first.scope.resolved.roots.some(path => path.includes('subs/reviews/subs/core'))).toBe(false);
    expect(second.scope.resolved.roots.some(path => path.endsWith('subs/workspace/subs/reviews/subs/core'))).toBe(true);
  }, 300_000);
});

describe('X1a: an engineer reaches its context budget', () => {
  test('it returns with its report, no compaction is recorded, and the third return exhausts the bound', async () => {
    const root = await target();
    const budgetTurn = [
      { kind: 'compaction' as const, reason: 'threshold' as const, tokensBefore: 130_000, tokensAfter: 40_000 },
      { kind: 'context' as const, tokens: 200_000, window: null },
      { kind: 'message' as const, text: 'I raised the limit and have not written its test.' },
    ];
    const { service, runId } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
      engineer: [budgetTurn, budgetTurn, budgetTurn],
    }, { declaredTree: true });

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const result = await readResult(root, runId, 'wi-001', 1);
    expect(result.outcome).toBe('partial');
    expect(result.invocations).toHaveLength(3);
    expect(result.findings.some(finding => finding.includes('return 3 of 3'))).toBe(true);

    for (const [index, invocation] of result.invocations.entries()) {
      const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome(invocation)), 'utf8')) as {
        ended: string; budget?: { threshold: number; observed: number | null; reportDelivered: boolean };
      };
      expect(outcome.ended).toBe('context-budget-reached');
      expect(outcome.budget).toEqual({ threshold: 140_000, observed: 200_000, reportDelivered: true });

      // A fresh session does not reset the counter: each return after the
      // first is its own fresh session, and the third is still the third.
      const record = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.invocation(invocation)), 'utf8')) as {
        session: { requested: string; actual: string }; attempt: number;
      };
      expect(record.session).toMatchObject({ requested: 'fresh', actual: 'fresh' });
      expect(record.attempt).toBe(index + 1);

      // Compaction is forbidden for the role, so none is recorded for it.
      const observations = await readFile(runPath(root, 'review-notes', runId, runLayout.observations(invocation)), 'utf8');
      expect(observations).not.toContain('"compaction"');
      expect(observations).toContain('"context"');
    }
  }, 300_000);
});

describe('X4: a denied call mutates nothing and stays deduplicated', () => {
  test('every guarded call is an observation; a replay is dropped and a new call to the same target is not', async () => {
    const root = await target();
    const outside = 'subs/workspace/subs/shared-ui/src/status-badge.tsx';
    const before = await readFile(join(root, outside), 'utf8');
    const { service, runId } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
      engineer: [submit(
        completionProposed('Wrote the store; the badge is not mine to write.'),
        write(outside, 'export const tampered = true;\n'),
        write(outside, 'export const tamperedAgain = true;\n'),
        write(`${notesDirectory}/src/store.ts`, 'export const store = new Map();\n'),
      )],
    }, { declaredTree: true });

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const result = await readResult(root, runId, 'wi-001', 1);
    const invocation = result.invocations[0]!;
    const path = runPath(root, 'review-notes', runId, runLayout.observations(invocation));
    const guards = (await readFile(path, 'utf8')).split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as Observation)
      .filter((line): line is ObservationOf<'guard'> => line.type === 'guard');

    // Two denied calls to the same target and one allowed call: a retry is a
    // new attempt and stays visible.
    expect(guards.map(guard => guard.data.verdict)).toEqual(['blocked-scope', 'blocked-scope', 'allowed']);
    expect(new Set(guards.map(guard => guard.data.callId)).size).toBe(3);
    expect(guards[0]!.data.requested).toBe(outside);
    // Nothing the guard denied was written, and the call it allowed was.
    expect(await readFile(join(root, outside), 'utf8')).toBe(before);
    expect(await readFile(join(root, notesDirectory, 'src', 'store.ts'), 'utf8')).toBe('export const store = new Map();\n');

    // A replayed `(invocation, callId, type)` is dropped; the same target
    // through a new call is recorded again.
    const log = await ObservationLog.open(path);
    const replayed = { ...guards[0]!.data, reason: 'replayed' };
    expect(await log.record({ type: 'guard', data: replayed })).toBe(false);
    expect(await log.record({ type: 'guard', data: { ...replayed, callId: 'call-99' } })).toBe(true);
  }, 300_000);
});
