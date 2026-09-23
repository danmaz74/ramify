import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { assign, byRole, completionProposed, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { forkDecision, registryChange, requestPlacement } from './helpers/placement.js';
import { architectureLayout, type PlacementDecision } from '../architecture/records.js';
import { analysisLayout, type RegistryEntry } from '../analysis/records.js';
import { gateGit, scenariosCommit, type GateCommit, type GateGitOptions } from './helpers/gate-git.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { installTestRunner, onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * A module a run creates.
 *
 * An entry capability whose owner does not exist yet carries a proposal, and
 * the first assignment of that owner captures the bootstrap authority the
 * registry gives it. The module is created by the engineer, recognized by
 * the declared module inventory before its gate can pass, and reported from
 * the changed declaration the commit boundary was told about.
 *
 * What a commit added or removed is Git's to report, never the harness's to
 * observe: each scenario states the `A`, `M` and `D` entries Git answers,
 * and the assertions read the notice the run derived from them. The real
 * architect-view bootstrap witness lives in `module-creation-integration.test.ts`.
 */

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

/** A boundary Git reports as unchanged, which commits nothing. */
const unchanged: GateCommit = { commit: null };

/** The declaration, the prose and the first source of a module that did not exist. */
const moduleWrites = [
  write(`${notesDirectory}/module.ramify`, 'ramify 1\nmodule notes\n'),
  write(`${notesDirectory}/README.md`, '# notes\n\nHolds a reviewer\'s note for one review run.\n'),
  // A nested source directory that does not exist yet.
  write(`${notesDirectory}/src/store/notes.ts`, 'export const noteLimit = 500;\n'),
  write(`${notesDirectory}/src/tests/notes.test.ts`, [
    'import { test, expect } from \'vitest\';',
    'import { noteLimit } from \'../store/notes.ts\';',
    '',
    'test(\'the note limit is what the plan asks for\', () => {',
    '  expect(noteLimit).toBe(500);',
    '});',
    '',
  ].join('\n')),
];

/** What Git reports the created module added, which is where the notice comes from. */
const created: GateCommit = {
  commit: 'revision-01',
  changes: [
    { status: 'A', path: `${notesDirectory}/module.ramify` },
    { status: 'A', path: `${notesDirectory}/README.md` },
    { status: 'A', path: `${notesDirectory}/src/store/notes.ts` },
    { status: 'A', path: `${notesDirectory}/src/tests/notes.test.ts` },
  ],
};

/** A copy of the fixture whose runner answers, with Git's answers stated. */
async function target(answers: Omit<GateGitOptions, 'head'>, options: { readonly miniRunner?: boolean } = {}) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  if (options.miniRunner === false) await installTestRunner(fixture.root);
  else await installMiniRunner(fixture.root);
  return { root: fixture.root, scripted: gateGit(fixture.root, { head: base, ...answers }) };
}

async function readResult(root: string, runId: string, number: number): Promise<IterationResult> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.result('wi-001', number)), 'utf8')) as IterationResult;
}

describe('G9: an accepted proposed entry owner reaches implementation', () => {
  test('an absent owner with no accepted authority is rejected, and so is a write outside the creation scope', async () => {
    // The assignment falls on a module of the fixture, whose own tests are
    // not this test's to run: the runner answers for them, and what is being
    // proved is the rejection and the guard. Nothing the engineer wrote
    // reached the tree, so every boundary is an unchanged one.
    const { root, scripted } = await target({ commits: [scenarios, unchanged, unchanged, unchanged] }, { miniRunner: false });
    const opened = await openRuns(root, {
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', reviews)]))],
        'local-architect': [
          // No registry entry proposes this module, so the assignment is
          // refused; the same session corrects it in the same turn.
          [
            { kind: 'submit', input: assign(notes, {}, outline()) },
            { kind: 'submit', input: assign(reviews, {}, outline()) },
          ],
          submit(requestCompletion()),
        ],
        engineer: [submit(
          completionProposed('I could not create the module I was told not to create.'),
          // A module the assignment does not authorize.
          write(`${notesDirectory}/module.ramify`, 'ramify 1\nmodule notes\n'),
        )],
      }),
      inputs: treeInputs(),
      git: scripted.git,
      readinessExecution: directReadinessExecution(),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;

    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    // The first submission was rejected and the same session corrected it,
    // so the run has one assignment and it is over the module that exists.
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.filter(event => event.type === 'iteration-assigned')).toHaveLength(1);
    const assignment = JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.assignment('wi-001', 1)), 'utf8')) as {
      scope: { base: { module: string }; bootstrap: unknown[] };
    };
    expect(assignment.scope.base.module).toBe(reviews);
    expect(assignment.scope.bootstrap).toEqual([]);

    // The engineer's attempt to create a module outside the scope wrote
    // nothing, and no module was created.
    const result = await readResult(root, runId, 1);
    const observations = await readFile(runPath(root, 'review-notes', runId, runLayout.observations(result.invocations[0]!)), 'utf8');
    expect(observations).toContain('"blocked-scope"');
    const closedEvents = events.filter(event => event.type === 'iteration-closed');
    expect((closedEvents[0]!.data as { notices: unknown[] }).notices).toEqual([]);
    await expect(readFile(join(root, notesDirectory, 'module.ramify'), 'utf8')).rejects.toThrow();
    // Nothing but the feature files was committed, so the run's accepted
    // boundary stayed at their commit.
    expect(scripted.revisions()).toEqual([materialized]);
    expect(scripted.head()).toBe(materialized);
    scripted.assertComplete();
  }, 300_000);
});

describe('G10: global placement authorizes a new owner without claiming it exists', () => {
  test('a create decision and its registry proposal lead to a bootstrap assignment that passes its gate', async () => {
    const { root, scripted } = await target({ commits: [scenarios, created, unchanged, unchanged] });
    const proposal = {
      parent: reviews,
      directory: notesDirectory,
      purpose: 'Holds a reviewer\'s note for one review run.',
      tags: [] as string[],
    };
    const opened = await openRuns(root, {
      script: byRole({
        // The entry owner exists: what does not exist is the owner the
        // global architect decides on.
        'initial-architect': [submit(analysis([entry('review-note', reviews, 'A reviewer can attach one note to a review run.')]))],
        'local-architect': [
          submit(requestPlacement({
            forCapability: 'review-note',
            question: 'Does a reviewer\'s note belong in this module, or in one of its own?',
            requiredBehavior: 'One note per review run, with its own limit and its own test.',
          })),
          submit(assign(notes, {}, outline())),
          submit(requestCompletion()),
        ],
        'global-fork': [submit(forkDecision({
          decision: {
            question: 'Does a reviewer\'s note belong in this module, or in one of its own?',
            outcome: 'create',
            capability: 'note-store',
            changesExistingSymbols: false,
            owner: notes,
            proposed: proposal,
            rationale: 'A note has its own limit and its own lifetime, and the reviews module already carries the run.',
            constraints: [],
            uncertainties: [],
            evidence: { citations: [{ module: reviews }], gaps: [] },
          },
          registry: [registryChange({
            capability: 'note-store', owner: notes, proposed: proposal,
            behavior: 'Holds one reviewer\'s note for one review run.',
          })],
          brief: 'note-store is placed in a new module beneath reviews; nothing implements it yet.',
        }))],
        engineer: [submit(
          completionProposed('Created the notes module with its first behavior and the test that states it.'),
          ...moduleWrites,
        )],
      }),
      inputs: treeInputs(),
      git: scripted.git,
      readinessExecution: directReadinessExecution(),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;

    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const types = events.map(event => event.type);
    // The decision authorized the owner before anything was assigned.
    expect(types.indexOf('decision-accepted')).toBeLessThan(types.indexOf('iteration-assigned'));

    const decision = JSON.parse(await readFile(runPath(root, 'review-notes', runId, architectureLayout.decision('gd-001')), 'utf8')) as PlacementDecision;
    expect(decision.outcome).toBe('create');
    expect(decision.owner).toBe(notes);
    expect(decision.proposed).toEqual(proposal);
    const registered = JSON.parse(await readFile(runPath(root, 'review-notes', runId, analysisLayout.registry('note-store', 1)), 'utf8')) as RegistryEntry;
    expect(registered.origin).toBe('global-decision');
    expect(registered.decision).toBe('gd-001');
    // The decision and the registry carry the same proposal, which is what
    // the assignment's bootstrap authority is read from.
    expect(registered.proposed).toEqual(proposal);

    const assignment = JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.assignment('wi-001', 1)), 'utf8')) as {
      scope: { bootstrap: Array<{ directory: string }> };
    };
    expect(assignment.scope.bootstrap.map(entry => entry.directory)).toEqual([notesDirectory]);

    const result = await readResult(root, runId, 1);
    expect(result.outcome).toBe('accepted');
    expect(result.commit).toBe('revision-01');
    // The module is in the refreshed inventory before its gate passes, and
    // the notice names the decision that proposed it.
    const closed = events.find(event => event.type === 'iteration-closed');
    expect((closed!.data as { notices: Array<{ module: string; decision: { id: string; revision: number } | null }> }).notices).toEqual([
      {
        kind: 'module-created',
        module: notes,
        declaration: `${notesDirectory}/module.ramify`,
        commit: result.commit,
        iteration: 'wi-001.i01',
        decision: { id: 'gd-001', revision: 1, hash: expect.any(String) },
      },
    ]);
    scripted.assertComplete();
  }, 300_000);
});
