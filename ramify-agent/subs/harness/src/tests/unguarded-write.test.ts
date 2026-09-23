import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { guardingReport } from '../kpi/guarding.js';
import { runLayout, type InvocationOutcome, type LineEventSummary } from '../run/records.js';
import type { Observation } from '../run/observations.js';
import type { IterationResult } from '../work/iterations.js';
import { iterationLayout } from '../work/iterations.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import {
  addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline, read, shell, submit, treeInputs,
} from './helpers/iterations.js';
import { git, initRepository, onlyRun, openRuns, runPath, startRun } from './helpers/runs.js';
import { gitService } from '../../subs/evidence/src/git.js';

/*
 * The guard this plan names: a write the guard cannot see appears in
 * `git status` when the writer settles and in `outsideScope`.
 *
 * The shell is unguarded by design. Nothing here blocks it, and nothing here
 * claims it was blocked. What the harness owes instead is the record: the
 * command, the coverage gap, the tree afterwards, and the paths of it that
 * lie outside the scope the assignment recorded.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const reviews = 'collection-review/workspace/reviews';
const outsidePath = 'subs/workspace/subs/reviews/src/outside-the-scope.ts';

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': [
      'import { test, expect } from \'vitest\';',
      'import { noteLimit } from \'../notes.ts\';',
      '',
      'test(\'the note limit is what the plan asks for\', () => { expect(noteLimit).toBe(500); });',
      '',
    ].join('\n'),
  });
  await installMiniRunner(fixture.root);
  await initRepository(fixture.root);
  return fixture.root;
}

async function observationsOf(root: string, runId: string, invocation: string): Promise<Observation[]> {
  const text = await readFile(runPath(root, 'review-notes', runId, runLayout.observations(invocation)), 'utf8');
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Observation);
}

describe('X6: an unguarded shell mutation and an outside read make the MVP\'s limits visible', () => {
  test('the write is reported and not blocked: it is in git status, in outsideScope and in the coverage gap', async () => {
    const root = await target();
    const { service } = await openRuns(root, {
      git: gitService,
      inputs: treeInputs(),
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
        engineer: [submit(
          completionProposed('Raised the note limit where the test asks for it.'),
          // A read into another module: permitted, recorded once.
          read('subs/workspace/subs/reviews/src/router.ts'),
          read('subs/workspace/subs/reviews/src/session.ts'),
          // The guarded write, inside the scope.
          edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500'),
          // The unguarded write, outside it. Nothing refuses this.
          shell(`printf 'export const outside = true;\\n' > ${outsidePath}`),
        )],
      }),
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(service, 'review-notes').state).toBe('completed');

    // The write happened. The guard did not see it and did not stop it.
    expect((await stat(join(root, outsidePath))).isFile()).toBe(true);
    expect(await readFile(join(root, outsidePath), 'utf8')).toBe('export const outside = true;\n');

    const result = JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.result('wi-001', 1)), 'utf8')) as IterationResult;
    const invocation = result.invocations[0]!;
    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome(invocation)), 'utf8')) as InvocationOutcome;
    const observations = await observationsOf(root, runId, invocation);

    // `outsideScope` names it, and the guarded write inside the scope is not
    // there: the comparison is with the scope, not with the tools used.
    expect(outcome.outsideScope).toContain(outsidePath);
    expect(outcome.outsideScope).not.toContain(`${notesDirectory}/src/notes.ts`);
    expect(outcome.settled.confirmed).toBe(true);

    // The snapshot the writer left: `git status` since the last accepted
    // commit, in one `mutation` observation that is not one call's doing.
    const snapshot = observations.filter(line => line.type === 'mutation' && line.data.observedBy === 'snapshot');
    expect(snapshot).toHaveLength(1);
    const paths = snapshot[0]!.type === 'mutation' ? snapshot[0]!.data.paths : [];
    expect(paths).toContain(outsidePath);
    expect(paths).toContain(`${notesDirectory}/src/notes.ts`);
    expect(snapshot[0]!.type === 'mutation' && snapshot[0]!.data.attributable).toBe(false);

    // The gap that qualifies every count of blocked calls.
    const gaps = observations.filter(line => line.type === 'coverage-gap' && line.data.kind === 'unguarded-shell');
    expect(gaps).toHaveLength(1);

    // The command text is in the record, and it is the only place it is.
    const commands = observations
      .filter(line => line.type === 'activity' && line.data.activity.kind === 'tool' && line.data.activity.tool === 'shell')
      .map(line => (line.type === 'activity' && line.data.activity.kind === 'tool' ? line.data.activity.command : undefined));
    expect(commands).toEqual([`printf 'export const outside = true;\\n' > ${outsidePath}`]);

    // One excursion, on first entry, for two reads of the same module.
    const excursions = observations.filter(line => line.type === 'excursion');
    expect(excursions).toHaveLength(1);
    expect(excursions[0]!.type === 'excursion' && excursions[0]!.data.module).toBe(reviews);
    expect(excursions[0]!.type === 'excursion' && excursions[0]!.data.firstEntry).toBe(true);

    // The evaluation projection names which tools were guarded and refuses
    // to read zero blocked calls as compliance.
    const report = guardingReport(observations);
    expect(report.guarded).toEqual(['edit']);
    expect(report.unguarded).toEqual(['shell']);
    expect(report.verdicts).toEqual({ allowed: 1, 'blocked-scope': 0, 'blocked-unresolved': 0 });
    expect(report.complete).toBe(false);
    expect(report.excursions).toEqual([reviews]);
    expect(report.gaps.map(gap => gap.kind)).toContain('unguarded-shell');
    expect(report.statement).toContain('not evidence');

    // Line events cannot see what an unguarded command changed and put back,
    // so they say so rather than reporting a complete count.
    const lines = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.lineEvents(invocation)), 'utf8')) as LineEventSummary;
    expect(lines.coverage).toBe('partial');
    expect(lines.gaps.some(gap => gap.startsWith('unguarded-shell'))).toBe(true);

    // The harness never resets or reverts: the iteration's accepted commit
    // carries what the shell wrote, and the record is what says it was
    // outside the scope. The work-item gate's commit after it holds the
    // feature file its completion request declared.
    const committed = await git(root, 'show', '--name-only', '--format=', result.commit!);
    expect(committed).toContain(outsidePath);
  }, 300_000);
});
