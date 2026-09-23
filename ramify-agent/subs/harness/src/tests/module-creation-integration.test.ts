import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { assign, byRole, completionProposed, installMiniRunner, outline, submit, treeInputs, viewedInputs, write } from './helpers/iterations.js';
import { forkDecision, registryChange, requestPlacement } from './helpers/placement.js';
import { architectureLayout, type PlacementDecision } from '../architecture/records.js';
import { analysisLayout, type RegistryEntry } from '../analysis/records.js';
import { gateGit, scenariosCommit, type GateCommit, type GateGitOptions } from './helpers/gate-git.js';
import { directReadinessExecution } from './helpers/external-tools.js';
import { installTestRunner, onlyRun, openRuns, realRamify, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';

/*
 * A module a run creates through a retained real architect-view boundary.
 *
 * An entry capability whose owner does not exist yet carries a proposal, and
 * the first assignment of that owner captures the bootstrap authority the
 * registry gives it. The module is created by the engineer, recognized by
 * the refreshed architect view before its gate can pass, and reported from the
 * changed declaration the commit boundary was told about.
 *
 * Git remains an explicit scenario boundary. Ramify is real because this
 * case proves that a newly created module enters the refreshed architect
 * view before its own gate passes.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
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
  test('a bootstrap assignment creates the module with nested source and its first test, and the notice is read from the commit', async () => {
    const { root, scripted } = await target({ commits: [scenarios, created, unchanged, unchanged] });
    // This scenario keeps the real architect view: what it proves is that
    // the module the engineer created is in the refreshed view before its
    // own gate can pass.
    const daemon = await realRamify();
    cleanups.push(() => daemon.dispose());
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
          ...moduleWrites,
        )],
      }),
      ramify: daemon.ramify,
      inputs: viewedInputs(daemon.ramify, message => unavailable.push(message)),
      git: scripted.git,
      readinessExecution: directReadinessExecution(),
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
    expect(result.commit).toBe('revision-01');
    // The module is in the refreshed view before its gate passes, and the
    // notice is read from the changed declaration Git reported rather than
    // from what the agent said.
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

    // The message the harness asked Git to commit names the module it
    // created, and the files it created really are on disk.
    expect(scripted.messages[1]).toContain('Ramify-Iteration: wi-001.i01');
    expect(scripted.messages[1]).toContain(`Modules created: ${notes} (${notesDirectory}/module.ramify)`);
    expect(await readFile(join(root, notesDirectory, 'module.ramify'), 'utf8')).toBe('ramify 1\nmodule notes\n');
    scripted.assertComplete();
  }, 300_000);
});
