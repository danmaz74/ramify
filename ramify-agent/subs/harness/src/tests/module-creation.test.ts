import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { assign, byRole, completionProposed, installMiniRunner, outline, submit, viewedInputs, write } from './helpers/iterations.js';
import { forkDecision, registryChange, requestPlacement } from './helpers/placement.js';
import { architectureLayout, type PlacementDecision } from '../architecture/records.js';
import { analysisLayout, type RegistryEntry } from '../analysis/records.js';
import { git, initRepository, installTestRunner, onlyRun, openRuns, realRamify, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';

/*
 * A module a run creates.
 *
 * An entry capability whose owner does not exist yet carries a proposal, and
 * the first assignment of that owner captures the bootstrap authority the
 * registry gives it. The module is created by the engineer, recognized by
 * the refreshed architect view before its gate can pass, and reported from
 * the commit that added its declaration.
 *
 * Each test here works a real architect view, materialized and refreshed by
 * an installed Ramify with a daemon of its own. The daemon is started and
 * disposed per test, because one analysis of one temporary project is all
 * any of them needs and a daemon that has analysed a project which is then
 * removed cannot be relied on for the next.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const reviews = 'collection-review/workspace/reviews';
const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

/** A copy of the fixture, and an installed Ramify with a daemon of its own. */
async function target(options: { readonly miniRunner?: boolean } = {}) {
  const daemon = await realRamify();
  cleanups.push(() => daemon.dispose());
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  if (options.miniRunner === false) await installTestRunner(fixture.root);
  else await installMiniRunner(fixture.root);
  await initRepository(fixture.root);
  return { root: fixture.root, ramify: daemon.ramify };
}

async function readResult(root: string, runId: string, number: number): Promise<IterationResult> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.result('wi-001', number)), 'utf8')) as IterationResult;
}

async function commits(root: string, runId: string): Promise<string[]> {
  const log = await git(root, 'log', '--format=%H%x1f%B%x1e', `ramify-agent/run-${runId}`);
  return log.split('\u001e').map(part => part.trim()).filter(Boolean);
}

describe('G9: an accepted proposed entry owner reaches implementation', () => {
  test('a bootstrap assignment creates the module with nested source and its first test, and the notice is read from the commit', async () => {
    const { root, ramify } = await target();
    const unavailable: string[] = [];
    const analysed = analysis([entry('review-note', notes, 'The module holds a reviewer\'s note.', {
      parent: reviews, directory: notesDirectory, purpose: 'Holds a reviewer\'s note for one review run.', tags: [],
    })]);

    const opened = await openRuns(root, {
      script: byRole({
        'initial-architect': [submit(analysed)],
        'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
        engineer: [submit(
          completionProposed('Created the notes module with its first behavior and the test that states it.'),
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
        )],
      }),
      ramify,
      inputs: viewedInputs(ramify, message => unavailable.push(message)),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;

    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    // Every refresh answered, so nothing below rests on evidence the
    // harness could not obtain.
    expect(unavailable).toEqual([]);
    const assignment = JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.assignment('wi-001', 1)), 'utf8')) as {
      scope: { bootstrap: Array<{ directory: string }>; resolved: { roots: string[]; files: string[] } };
    };
    // The bootstrap authority came from the accepted registry entry, and it
    // reaches a directory that did not exist.
    expect(assignment.scope.bootstrap.map(entry => entry.directory)).toEqual([notesDirectory]);
    expect(assignment.scope.resolved.roots.some(path => path.endsWith(`${notesDirectory}/src`))).toBe(true);

    const result = await readResult(root, runId, 1);
    expect(result.outcome).toBe('accepted');
    // The module is in the refreshed view before its gate passes, and the
    // notice is read from the commit rather than from what the agent said.
    const closed = (await runEventsOnDisk(root, 'review-notes', runId)).find(event => event.type === 'iteration-closed');
    expect(closed).toBeDefined();
    expect((closed!.data as { notices: unknown[] }).notices).toEqual([{
      kind: 'module-created',
      module: notes,
      declaration: `${notesDirectory}/module.ramify`,
      commit: result.commit,
      iteration: 'wi-001.i01',
      // No placement decision proposed it: the entry assignment did, and a
      // notice with no decision says so.
      decision: null,
    }]);

    const accepted = (await commits(root, runId)).find(commit => commit.includes('Ramify-Iteration: wi-001.i01'))!;
    expect(accepted).toContain(`Modules created: ${notes} (${notesDirectory}/module.ramify)`);
  }, 300_000);

  test('an absent owner with no accepted authority is rejected, and so is a write outside the creation scope', async () => {
    // The assignment falls on a module of the fixture, whose own tests are
    // not this test's to run: the runner answers for them, and what is being
    // proved is the rejection and the guard.
    const { root, ramify } = await target({ miniRunner: false });
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
      ramify,
      inputs: viewedInputs(ramify),
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
  }, 300_000);
});

describe('G10: global placement authorizes a new owner without claiming it exists', () => {
  test('a create decision and its registry proposal lead to a bootstrap assignment that passes its gate', async () => {
    const { root, ramify } = await target();
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
          write(`${notesDirectory}/module.ramify`, 'ramify 1\nmodule notes\n'),
          write(`${notesDirectory}/README.md`, '# notes\n\nHolds a reviewer\'s note for one review run.\n'),
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
        )],
      }),
      ramify,
      inputs: viewedInputs(ramify),
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
    // The module is in the refreshed view before its gate passes, and the
    // notice names the decision that proposed it.
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
  }, 300_000);
});
