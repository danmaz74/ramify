import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { checkCommand } from '../checks/records.js';
import type { GateAttempt } from '../checks/records.js';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { workLayout } from '../work/records.js';
import { runLayout } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline, submit, treeInputs } from './helpers/iterations.js';
import { git, initRepository, onlyRun, openRuns, runEventsOnDisk, runPath, startRun, testPolicy } from './helpers/runs.js';

/*
 * Nothing already complete is reopened.
 *
 * Adding a work item, assigning another iteration or running a repair round
 * leaves every completed work item completed, every accepted iteration
 * accepted and every commit the harness made where it was. The log is the
 * authority and each record file is a materialized copy of it, so a run that
 * adds work writes new files and rewrites none.
 *
 * The same run shows what a failure outside the last engineer's scope does:
 * the work item's own gate runs the whole project beside that assignment's
 * own selection, and a failure that only the whole project sees returns to
 * the local architect rather than to the engineer.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const reviews = 'collection-review/workspace/reviews';
const notes = 'collection-review/workspace/reviews/notes';
const alerts = 'collection-review/workspace/reviews/alerts';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const alertsDirectory = 'subs/workspace/subs/reviews/subs/alerts';

const notesTest = (limit: number) => [
  'import { test, expect } from \'vitest\';',
  'import { notesLimit } from \'../notes.ts\';',
  '',
  'test(\'a note is as long as the plan allows\', () => {',
  `  expect(notesLimit).toBe(${limit});`,
  '});',
  '',
].join('\n');

/**
 * The alerts module's own test reads the note limit: it is a consumer of
 * the behavior the note module owns, and a change there is what breaks it.
 */
const alertsTest = [
  'import { test, expect } from \'vitest\';',
  'import { alertsLimit } from \'../alerts.ts\';',
  'import { notesLimit } from \'../../../notes/src/notes.ts\';',
  '',
  'test(\'an alert covers a hundred characters of a note\', () => {',
  '  expect(alertsLimit * 100).toBe(notesLimit);',
  '});',
  '',
].join('\n');

/**
 * A fixture copy with two modules of this test's own. Both are green as the
 * copy stands, because a run starts from a passing baseline; raising the
 * note limit is what breaks the consumer's own test.
 */
async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const notesLimit = 400;\n',
    'src/tests/notes.test.ts': notesTest(400),
  });
  await addModule(fixture.root, alertsDirectory, 'alerts', {
    'src/alerts.ts': 'export const alertsLimit = 4;\n',
    'src/tests/alerts.test.ts': alertsTest,
  });
  await installMiniRunner(fixture.root);
  await initRepository(fixture.root);
  return fixture.root;
}

/** The engineer that raises the note limit, in the source and in the test that states it. */
const raiseTheNoteLimit = submit(
  completionProposed('Raised the note limit to 500, in the source and in the test that states it.'),
  edit(`${notesDirectory}/src/notes.ts`, 'notesLimit = 400', 'notesLimit = 500'),
  edit(`${notesDirectory}/src/tests/notes.test.ts`, 'toBe(400)', 'toBe(500)'),
);

/** The engineer that repairs the consumer the raised limit broke. */
const repairTheAlert = submit(
  completionProposed('An alert now covers five hundred characters, as the note limit does.'),
  edit(`${alertsDirectory}/src/alerts.ts`, 'alertsLimit = 4', 'alertsLimit = 5'),
);

/**
 * A policy whose whole-project test command really runs both modules' tests.
 * The fixture's own suite needs dependencies this copy does not install, so
 * the project's runner is pointed at the files this test wrote.
 */
function wholeProject(projectRoot: string) {
  const base = testPolicy(projectRoot);
  return {
    ...base,
    commands: {
      ...base.commands,
      allTests: checkCommand({
        argv: [join(projectRoot, 'node_modules', '.bin', 'vitest'), 'run', `${notesDirectory}/src/tests/notes.test.ts`, `${alertsDirectory}/src/tests/alerts.test.ts`],
        cwd: projectRoot,
        timeoutMs: 60_000,
      }),
    },
  };
}

async function readResult(root: string, runId: string, workItem: string, number: number): Promise<IterationResult> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.result(workItem, number)), 'utf8')) as IterationResult;
}

async function readGate(root: string, runId: string, id: string): Promise<GateAttempt> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate(id)), 'utf8')) as GateAttempt;
}

describe('K2: a failure outside the last engineer\'s scope', () => {
  test('the work-item gate returns it to the local architect, who assigns the owner that failed', async () => {
    const root = await target();
    const opened = await openRuns(root, {
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes), entry('review-alert', alerts)]))],
        'local-architect': [
          // wi-001: the note module, and nothing else.
          submit(assign(notes, {}, outline())),
          // The work item's own gate runs the whole project and exposes the
          // alerts module, which that assignment could not have written.
          submit(requestCompletion()),
          submit(assign(alerts, { goal: 'Repair what the whole project exposed.', kind: 'repair' })),
          submit(requestCompletion()),
          // wi-002 needs nothing of its own.
          submit(requestCompletion()),
        ],
        engineer: [raiseTheNoteLimit, repairTheAlert],
      }),
      inputs: treeInputs(),
      policy: wholeProject,
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;

    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const workItemGates = await Promise.all(events
      .filter(event => event.type === 'gate-attempted' && (event.data as { checkpoint: string }).checkpoint === 'work-item')
      .map(event => readGate(root, runId, (event.data as { gate: string }).gate)));

    // The first work-item gate ran the whole project beside the last
    // assignment's own selection. The project's tests failed and that
    // selection passed, so the failure is outside the assignment.
    const returned = workItemGates[0]!;
    expect(returned.verdict).toBe('failed');
    expect(returned.cause).toBe('outside-assignment');
    expect(returned.next).toBe('return-to-local-architect');
    const probe = returned.commands.find(command => command.selection !== undefined)!;
    expect(probe.outcome).toBe('passed');
    expect(probe.selection!.resolved).toEqual([`${notesDirectory}/src/tests/notes.test.ts`]);
    expect(returned.commands.filter(command => command.kind === 'tests' && command.selection === undefined)[0]!.outcome).toBe('failed');

    // The architect assigned the owner that failed, and the work item's gate
    // then passed.
    const repair = JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.assignment('wi-001', 2)), 'utf8')) as {
      kind: string; scope: { base: { module: string } };
    };
    expect(repair.kind).toBe('repair');
    expect(repair.scope.base.module).toBe(alerts);
    expect(workItemGates.at(-1)!.verdict).toBe('passed');
    expect(await readFile(join(root, alertsDirectory, 'src', 'alerts.ts'), 'utf8')).toBe('export const alertsLimit = 5;\n');
  }, 300_000);
});

describe('adding work leaves every completed piece completed', () => {
  test('a second iteration, a repair round and a second work item rewrite nothing', async () => {
    const root = await target();
    const opened = await openRuns(root, {
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes), entry('review-alert', alerts)]))],
        'local-architect': [
          submit(assign(notes, {}, outline())),
          submit(assign(alerts, { goal: 'Raise the alert limit.' })),
          submit(requestCompletion()),
          submit(requestCompletion()),
        ],
        engineer: [
          // The first attempt changes the source and not the test that
          // states it, so the gate fails and one repair round follows.
          submit(completionProposed('Raised the note limit.'), edit(`${notesDirectory}/src/notes.ts`, 'notesLimit = 400', 'notesLimit = 500')),
          submit(completionProposed('Stated the new limit in the test as well.'),
            edit(`${notesDirectory}/src/tests/notes.test.ts`, 'toBe(400)', 'toBe(500)')),
          repairTheAlert,
        ],
      }),
      inputs: treeInputs(),
      policy: wholeProject,
      afterWrite: async (write, runId) => {
        // The moment the first iteration closes, the shape of everything it
        // wrote is taken; nothing that follows may change any of it.
        if (write === 'iteration-closed' && frozen.size === 0) {
          for (const path of [iterationLayout.assignment('wi-001', 1), iterationLayout.result('wi-001', 1), workLayout.outline('wi-001', 1)]) {
            const file = runPath(root, 'review-notes', runId, path);
            frozen.set(path, await readFile(file, 'utf8'));
            times.set(path, (await stat(file)).mtimeMs);
          }
        }
      },
    });
    const frozen = new Map<string, string>();
    const times = new Map<string, number>();
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;

    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    expect(frozen.size).toBe(3);

    // Every file the first iteration wrote is byte for byte what it was, and
    // untouched since.
    for (const [path, content] of frozen) {
      const file = runPath(root, 'review-notes', runId, path);
      expect(`${path}: ${await readFile(file, 'utf8')}`).toBe(`${path}: ${content}`);
      expect((await stat(file)).mtimeMs).toBe(times.get(path));
    }

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    // One closing event per iteration and per work item, and a repair round
    // that added none.
    expect(events.filter(event => event.type === 'iteration-closed')).toHaveLength(2);
    expect(events.filter(event => event.type === 'work-item-completed')).toHaveLength(2);
    expect((await readResult(root, runId, 'wi-001', 1)).outcome).toBe('accepted');
    expect((await readResult(root, runId, 'wi-001', 2)).outcome).toBe('accepted');

    // The first iteration's failed attempt and repaired attempt both remain
    // on the branch, and the second iteration added its own beside them.
    const log = await git(root, 'log', '--format=%H%x1f%B%x1e', `ramify-agent/run-${runId}`);
    const commits = log.split('\u001e').map(part => part.trim()).filter(Boolean);
    expect(commits.filter(commit => commit.includes('Ramify-Iteration: wi-001.i01'))).toHaveLength(2);
    expect(commits.filter(commit => commit.includes('Ramify-Iteration: wi-001.i02'))).toHaveLength(1);
    expect((await readResult(root, runId, 'wi-001', 1)).commit).not.toBeNull();

    // The work item that was closed first stays closed while the second runs.
    const closed = events.map((event, index) => ({ event, index })).filter(item => item.event.type === 'work-item-completed');
    const started = events.map((event, index) => ({ event, index })).filter(item => item.event.type === 'work-item-started');
    expect(closed[0]!.index).toBeLessThan(started[1]!.index);
    expect(events.filter(event => event.type === 'work-item-started' && (event.data as { workItem: string }).workItem === 'wi-001')).toHaveLength(1);
  }, 300_000);
});
