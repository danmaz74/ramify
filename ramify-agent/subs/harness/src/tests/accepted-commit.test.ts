import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { commitMessage } from '../run/gates.js';
import type { GateAttempt } from '../checks/records.js';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import type { RunWrite } from '../run/service.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import {
  crashLock, freeze, git, initRepository, onlyRun, openRuns,
  runEventsOnDisk, runPath, startRun, until,
} from './helpers/runs.js';

/*
 * The commit at an accepted boundary.
 *
 * A change to the working directory blocks nothing: the gate runs the checks
 * in the working directory and, on a pass, the harness commits. A crash
 * between the pass and the commit's completion makes one commit, because the
 * effect is keyed by the gate attempt and a repeat finds it by its trailer.
 *
 * What the commit added or removed is read from the commit, never from what
 * an agent said.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

const firstTest = [
  'import { test, expect } from \'vitest\';',
  'import { noteLimit } from \'../notes.ts\';',
  '',
  'test(\'the note limit is what the plan asks for\', () => {',
  '  expect(noteLimit).toBe(500);',
  '});',
  '',
].join('\n');

async function target(options: { readonly withNotes?: boolean } = {}) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  if (options.withNotes !== false) {
    await addModule(fixture.root, notesDirectory, 'notes', {
      'src/notes.ts': 'export const noteLimit = 500;\n',
      'src/tests/notes.test.ts': firstTest,
    });
  }
  await installMiniRunner(fixture.root);
  await initRepository(fixture.root);
  return fixture.root;
}

/** The commits of the run branch, newest first, each as its whole message. */
async function commits(root: string, runId: string): Promise<string[]> {
  const log = await git(root, 'log', '--format=%H%x1f%B%x1e', `ramify-agent/run-${runId}`);
  return log.split('\u001e').map(part => part.trim()).filter(Boolean);
}

async function readResult(root: string, runId: string, number: number): Promise<IterationResult> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.result('wi-001', number)), 'utf8')) as IterationResult;
}

/** One accepted iteration over the notes module, with whatever the engineer does. */
function onePass(steps: Parameters<typeof submit>[1][] = []) {
  return {
    'initial-architect': [submit(analysis([entry('review-note', notes)]))],
    'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
    engineer: [submit(completionProposed('Raised the limit and left the rest alone.'), ...steps)],
  };
}

describe('a change to the working directory blocks nothing', () => {
  test('a gate that passes is followed by one commit, and a file changed while it ran is in that commit', async () => {
    const root = await target();
    const opened = await openRuns(root, {
      script: byRole(onePass([write(`${notesDirectory}/src/store.ts`, 'export const store = new Map();\n')])),
      inputs: treeInputs(),
      afterWrite: async current => {
        // A late write lands between the gate's pass and its commit. It
        // blocks nothing and joins the commit that follows.
        if (current === 'gate-attempted') {
          await writeFile(join(root, notesDirectory, 'src', 'late.ts'), 'export const late = true;\n');
        }
      },
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);

    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    const result = await readResult(root, receipt.jobId, 1);
    expect(result.outcome).toBe('accepted');
    const accepted = (await commits(root, receipt.jobId)).find(commit => commit.includes('Ramify-Iteration: wi-001.i01'));
    expect(accepted).toBeDefined();

    const files = await git(root, 'show', '--name-only', '--format=', result.commit!);
    expect(files).toContain(`${notesDirectory}/src/store.ts`);
    expect(files).toContain(`${notesDirectory}/src/late.ts`);
  }, 300_000);

  test('a crash between the gate\'s pass and the commit\'s completion makes exactly one commit', async () => {
    for (const boundary of ['gate-attempted', 'gate-committing'] as const satisfies readonly RunWrite[]) {
      const root = await target();
      const crashed = await openRuns(root, {
        script: byRole(onePass([write(`${notesDirectory}/src/store.ts`, 'export const store = new Map();\n')])),
        inputs: treeInputs(),
        afterWrite: async current => {
          if (current === boundary) await freeze();
        },
      });
      const receipt = await crashed.service.execute(startRun('review-notes'));
      const events = runPath(root, 'review-notes', receipt.jobId, runLayout.events);
      // The intent is in the log before the commit is made, so each boundary
      // is the intent plus the number of commits the branch holds there.
      await until(async () => {
        const text = await readFile(events, 'utf8').catch(() => '');
        if (!text.includes('"gate-attempted"')) return false;
        const made = (await commits(root, receipt.jobId)).filter(commit => commit.includes('Ramify-Run:')).length;
        return boundary === 'gate-attempted' ? made === 0 : made === 1;
      }, 120_000);
      await crashLock(root);

      const reopened = await openRuns(root, { inputs: treeInputs() });
      cleanups.push(() => reopened.service.close());
      expect(onlyRun(reopened.service, 'review-notes').state).toBe('interrupted');

      // The effect is keyed by the gate attempt: recovery performs it again,
      // finds the commit by its trailer where it was already made, and makes
      // no second one.
      const log = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
      const attempted = log.filter(event => event.type === 'gate-attempted' && (event.data as { committing: boolean }).committing);
      expect(attempted).toHaveLength(1);
      const gate = (attempted[0]!.data as { gate: string }).gate;
      const committed = log.filter(event => event.type === 'gate-committed' && (event.data as { gate: string }).gate === gate);
      expect(committed).toHaveLength(1);
      const made = (await commits(root, receipt.jobId)).filter(commit => commit.includes(`Ramify-Gate: ${gate}`));
      expect(`${boundary}: ${made.length}`).toBe(`${boundary}: 1`);

      const attempt = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.gate(gate)), 'utf8')) as GateAttempt;
      expect(attempt.verdict).toBe('passed');
      expect(attempt.commit).not.toBeNull();
    }
  }, 600_000);

  test('a later source change invalidates nothing: the accepted commit stays as it is', async () => {
    const root = await target();
    const opened = await openRuns(root, {
      script: byRole(onePass([write(`${notesDirectory}/src/store.ts`, 'export const store = new Map();\n')])),
      inputs: treeInputs(),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);

    const result = await readResult(root, receipt.jobId, 1);
    const head = result.commit!;
    // A change made after the boundary is uncommitted work for the next
    // gate. It does not reopen the iteration and does not touch the commit.
    await writeFile(join(root, notesDirectory, 'src', 'notes.ts'), 'export const noteLimit = 1;\n');
    expect((await git(root, 'rev-parse', head)).trim()).toBe(head);
    expect((await git(root, 'show', '--format=', '--name-only', head))).not.toContain('nothing');
    const status = await git(root, 'status', '--porcelain');
    expect(status).toContain(`${notesDirectory}/src/notes.ts`);
    const reloaded = await readResult(root, receipt.jobId, 1);
    expect(reloaded).toEqual(result);
  }, 300_000);
});

describe('the message the harness writes', () => {
  test('it is a pure function of the records, and an agent\'s words reach it only as the summary', () => {
    const gate: GateAttempt = {
      schema: 'ramify-agent.gate-attempt/1',
      id: 'ga-0012', checkpoint: 'iteration',
      subject: { workItem: 'wi-001', iteration: 'wi-001.i02' },
      proposedBy: 'inv-0014', repairRound: 1, infrastructureAttempt: 0,
      head: 'abc', commit: null, guardedChanges: [],
      commands: [
        { kind: 'ramify-check', command: { argv: ['ramify'], cwd: '/p', env: [], envAdditions: {}, timeoutMs: 1 }, startedAt: 'now', elapsedMs: 1200, exitCode: 0, outcome: 'passed', runnerError: null, output: { path: 'a', bytes: 0, truncated: false, tail: '' } },
        { kind: 'type-check', command: { argv: ['npm'], cwd: '/p', env: [], envAdditions: {}, timeoutMs: 1 }, startedAt: 'now', elapsedMs: 8400, exitCode: 0, outcome: 'passed', runnerError: null, output: { path: 'b', bytes: 0, truncated: false, tail: '' } },
        {
          kind: 'tests', command: { argv: ['vitest'], cwd: '/p', env: [], envAdditions: {}, timeoutMs: 1 }, startedAt: 'now', elapsedMs: 21000, exitCode: 0, outcome: 'passed', runnerError: null,
          selection: { policy: 'owned-by-scope', exactOwners: ['workspace/reviews'], subtrees: ['reviews/core'], extraSuites: [], resolved: ['a.test.ts', 'b.test.ts'] },
          output: { path: 'c', bytes: 0, truncated: false, tail: '' },
        },
      ],
      verdict: 'passed', cause: null, next: 'accept',
    };
    const parts = {
      runId: '20260920T101500Z-3f9a1c', planId: 'review-notes', gate,
      goal: 'send the customer email from the page',
      summary: 'Send the customer email from the page.',
      earlier: [{ id: 'ga-0011', verdict: 'failed', cause: 'in-scope' }],
      notCovered: ['test:cucumber (one supported runner)'],
      invocations: ['inv-0012', 'inv-0014'],
      modules: [{ kind: 'module-created' as const, module: 'workspace/reviews/notes', declaration: 'subs/workspace/subs/reviews/subs/notes/module.ramify' }],
    };

    const message = commitMessage(parts);
    expect(commitMessage(parts)).toBe(message);
    expect(message).toContain('wi-001.i02: send the customer email from the page');
    expect(message).toContain('Send the customer email from the page.');
    expect(message).toContain('Checks: passed (gate ga-0012, checkpoint iteration, repair round 1)');
    expect(message).toContain('2 files; owners workspace/reviews, reviews/core (subtree)');
    expect(message).toContain('Earlier attempts: ga-0011 failed (in-scope)');
    expect(message).toContain('Not covered: test:cucumber (one supported runner)');
    expect(message).toContain('Modules created: workspace/reviews/notes (subs/workspace/subs/reviews/subs/notes/module.ramify)');
    expect(message).toContain('Ramify-Run: 20260920T101500Z-3f9a1c');
    expect(message).toContain('Ramify-Gate: ga-0012');
    expect(message).toContain('Ramify-Invocations: inv-0012, inv-0014');
  });
});
