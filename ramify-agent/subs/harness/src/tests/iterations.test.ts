import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { GateAttempt } from '../checks/records.js';
import { iterationLayout, type IterationAssignment, type IterationResult } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import { ObservationLog, type Observation, type ObservationOf } from '../run/observations.js';
import { scriptedCandidates } from './helpers/candidates.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import {
  addModule, assign, byRole, completionProposed, outline, submit, treeInputs, write,
} from './helpers/iterations.js';
import { gateGit, scenariosCommit, operationsOf, type GateCommit } from './helpers/gate-git.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { installTestRunner, onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';

/*
 * Iteration assignments, engineers and the iteration gate, over the fixture
 * project.
 *
 * Every run here works a real copy of the fixture: a real module tree read
 * from its own declarations, a real write guard over real paths, the real
 * state machine and the real ledger. The agent is the scripted fake, which
 * writes for real through the port's own built-ins.
 *
 * Git is an external system and is answered rather than run: each scenario
 * states, in order, what Git reports at each commit boundary, including the
 * boundaries where it reports an unchanged tree. Nothing below observes a
 * repository; what it observes is the run's own records and the calls the
 * run made at that boundary. The one scenario whose subject is the boundary
 * itself — a passing commit and the audit published against it — keeps every
 * real tool, in `iterations-integration.test.ts`.
 *
 * The process guard below is the negative control: every scenario here
 * starts no process at all, and one that tried would name itself.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const reviews = 'collection-review/workspace/reviews';
const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

/** The revision the fixture is on before a run commits anything. */
const base = 'revision-00';
/** The harness's own commit of the run's feature files, made once readiness has passed. */
const materialized = 'scenarios-00';
const scenarios = scenariosCommit('review-notes', materialized, base);

/** A boundary Git reports as unchanged, which is what a passing gate over an unchanged tree records. */
const unchanged: GateCommit = { commit: null };

/**
 * A copy of the fixture with one module of its own, so that an iteration has
 * somewhere real to work and its tests are files this test wrote.
 */
async function target(options: { readonly notes?: boolean } = {}) {
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
  await installTestRunner(fixture.root);
  return fixture.root;
}

/** Opens a run over `root` with the scripted fake and the stated Git answers. */
async function run(root: string, plan: Parameters<typeof byRole>[0], commits: readonly GateCommit[]) {
  // The feature files' commit comes before every boundary a scenario states.
  const before = commits.slice(0, -1).flatMap(commit => commit.commit ?? []).at(-1) ?? materialized;
  const after = commits.at(-1)?.commit ?? before;
  const tree = 'a'.repeat(40);
  const scripted = gateGit(root, { head: base, commits: [scenarios, ...commits],
    previews: [before, before, before, after].map(head => ({ repositoryRoot: root, head, tree })) });
  const opened = await openRuns(root, {
    script: byRole(plan),
    inputs: treeInputs(),
    git: scripted.git,
    candidates: scriptedCandidates(root, { [after]: { tree, base: before, files: {}, changes: [] } }),
    readinessExecution: directReadinessExecution(),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  return { ...opened, runId: receipt.jobId, scripted };
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

describe('G8: a work item revised across several iterations keeps every obligation', () => {
  test('three outline revisions, each from its own turn of one continuing session, and nothing already closed reopens', async () => {
    const root = await target();
    // The engineer writes the store once; the two revisions that follow it
    // write the same content, which Git reports as an unchanged tree.
    const { service, runId, scripted } = await run(root, {
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
      engineer: [submit(completionProposed('Added the note store.'), write('store.ts', 'export const store = new Map();\n'))],
    }, [
      { commit: 'revision-01', changes: [{ status: 'A', path: `${notesDirectory}/src/store.ts` }] },
      unchanged,
      unchanged,
      unchanged,
      unchanged,
    ]);

    expect(onlyRun(service, 'review-notes').state, JSON.stringify(onlyRun(service, 'review-notes').failure)).toBe('completed');
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
    const invocations = events.filter(event => event.type === 'invocation-started'
      && event.data.role === 'local-architect' && architectTurns.has(event.data.invocation));
    expect(invocations).toHaveLength(4);
    expect(new Set(invocations.map(event => event.data.session)).size).toBe(1);

    // An obligation an earlier revision opened is not lost: the work item's
    // own gate is the only thing that closes it, and each accepted iteration
    // stays accepted in the log that follows it.
    for (const number of [1, 2, 3]) {
      const result = await readResult(root, runId, 'wi-001', number);
      expect(result.outcome).toBe('accepted');
      expect(result.gate).not.toBeNull();
    }
    expect(events.filter(event => event.type === 'work-item-completed')).toHaveLength(1);

    // What the run did with Git's answers: one commit for the iteration that
    // changed the tree, and the accepted boundary of every later attempt is
    // that same revision, which no unchanged attempt replaced.
    const attempts = await Promise.all(
      [...new Set(events.filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate))]
        .map(id => readGate(root, runId, id)));
    expect(attempts.map(attempt => attempt.commit)).toEqual(['revision-01', null, null, null, null]);
    expect(attempts.map(attempt => attempt.audited)).toEqual(['revision-01', 'revision-01', 'revision-01', 'revision-01', 'revision-01']);
    expect(attempts.map(attempt => attempt.head)).toEqual([materialized, 'revision-01', 'revision-01', 'revision-01', 'revision-01']);
    expect(scripted.revisions()).toEqual([materialized, 'revision-01']);
    expect(scripted.branch()).toBe(`ramify-agent-run/${runId}`);
    expect(scripted.messages).toHaveLength(6);
    expect(scripted.messages[1]).toContain('Ramify-Iteration: wi-001.i01');
    expect(scripted.messages[1]).toContain('Added the note store.');
    // The store the first iteration wrote is really on disk, whatever Git
    // was told to answer about it.
    expect(await readFile(join(root, notesDirectory, 'src', 'store.ts'), 'utf8')).toBe('export const store = new Map();\n');
    // No external tool was started for any of this.
    expectNoProcesses();
    scripted.assertComplete();
  }, 120_000);
});

describe('K3: exact-owner and included-subtree selections at gate time', () => {
  test('two assignments over one owner differ by exactly the included subtree\'s test files', async () => {
    const root = await target({ notes: false });
    // No engineer turn writes anything, so every boundary is an unchanged tree.
    const { service, runId, scripted } = await run(root, {
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
    }, [unchanged, unchanged, unchanged, unchanged]);

    expect(onlyRun(service, 'review-notes').state, JSON.stringify(onlyRun(service, 'review-notes').failure)).toBe('completed');
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

    // An accepted iteration over a tree Git reports unchanged commits
    // nothing and keeps the boundary the feature files' commit set.
    expect(firstGate).toMatchObject({ commit: null, audited: materialized, verdict: 'passed' });
    expect(secondGate).toMatchObject({ commit: null, audited: materialized, verdict: 'passed' });
    expect(scripted.revisions()).toEqual([materialized]);
    // No external tool was started for any of this.
    expectNoProcesses();
    scripted.assertComplete();
  }, 120_000);
});

describe('X1a: an engineer reaches its context budget', () => {
  test('it returns with its report, no compaction is recorded, and the third return exhausts the bound', async () => {
    const root = await target();
    const budgetTurn = [
      { kind: 'compaction' as const, reason: 'threshold' as const, tokensBefore: 130_000, tokensAfter: 40_000 },
      { kind: 'context' as const, tokens: 200_000, window: null },
      { kind: 'message' as const, text: 'I raised the limit and have not written its test.' },
    ];
    // The iteration is never accepted, so no gate of its own is reached: the
    // boundaries are the work item's and the run's.
    const { service, runId, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
      engineer: [budgetTurn, budgetTurn, budgetTurn],
    }, [unchanged, unchanged]);

    expect(onlyRun(service, 'review-notes').state, JSON.stringify(onlyRun(service, 'review-notes').failure)).toBe('completed');
    const result = await readResult(root, runId, 'wi-001', 1);
    expect(result.outcome).toBe('partial');
    expect(result.invocations).toHaveLength(3);
    expect(result.findings.some(finding => finding.includes('return 3 of 3'))).toBe(true);
    expect(result.commit).toBeNull();

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
    // No external tool was started for any of this.
    expectNoProcesses();
    scripted.assertComplete();
  }, 120_000);
});

describe('X4: a denied call mutates nothing and stays deduplicated', () => {
  test('every guarded call is an observation; a replay is dropped and a new call to the same target is not', async () => {
    const root = await target();
    const outside = 'subs/workspace/subs/shared-ui/src/status-badge.tsx';
    const before = await readFile(join(root, outside), 'utf8');
    // Only the allowed write reaches the tree, and that is the one change
    // Git is told to report for the iteration's commit.
    const { service, runId, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
      engineer: [submit(
        completionProposed('Wrote the store; the badge is not mine to write.'),
        write(join(root, outside), 'export const tampered = true;\n'),
        write(join(root, outside), 'export const tamperedAgain = true;\n'),
        write('store.ts', 'export const store = new Map();\n'),
      )],
    }, [
      { commit: 'revision-01', changes: [{ status: 'A', path: `${notesDirectory}/src/store.ts` }] },
      unchanged,
      unchanged,
    ]);

    expect(onlyRun(service, 'review-notes').state, JSON.stringify(onlyRun(service, 'review-notes').failure)).toBe('completed');
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
    expect(guards[0]!.data.requested).toBe(join(root, outside));
    // Nothing the guard denied was written, and the call it allowed was.
    expect(await readFile(join(root, outside), 'utf8')).toBe(before);
    expect(await readFile(join(root, notesDirectory, 'src', 'store.ts'), 'utf8')).toBe('export const store = new Map();\n');

    // A replayed `(invocation, callId, type)` is dropped; the same target
    // through a new call is recorded again.
    const log = await ObservationLog.open(path);
    const replayed = { ...guards[0]!.data, reason: 'replayed' };
    expect(await log.record({ type: 'guard', data: replayed })).toBe(false);
    expect(await log.record({ type: 'guard', data: { ...replayed, callId: 'call-99' } })).toBe(true);

    // The one path the guard allowed is the one changed entry the commit
    // boundary was told about, and the run asked Git for nothing else.
    expect(result.commit).toBe('revision-01');
    expect(operationsOf(scripted)).toEqual([
      'changedEntries', 'changedPaths', 'commitAccepted', 'createRunBranch',
      'currentHead', 'diffNameStatus', 'findCommitByTrailers', 'isCleanRepository', 'previewCandidateTree', 'worktreeLineChanges',
    ]);
    // No external tool was started for any of this.
    expectNoProcesses();
    scripted.assertComplete();
  }, 120_000);
});
