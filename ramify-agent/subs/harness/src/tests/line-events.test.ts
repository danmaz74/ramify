import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { lineEvents, ownerOf, takeLineSnapshot } from '../kpi/lines.js';
import { sessionMetrics, type SessionEntry } from '../kpi/sessions.js';
import { runLayout, type LineEventSummary } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { git, initRepository, onlyRun, openRuns, runPath, startRun } from './helpers/runs.js';
import { architectIndex, moduleEntry } from './helpers/views.js';

/*
 * Line events and session counts.
 *
 * What one writer invocation changed is read from git and nowhere else: two
 * snapshots around the session, and the difference between them. A session
 * that changed nothing has an empty summary and is still a session.
 *
 * Every figure is captured when the observation happens; none of it is added
 * after a trial.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

const noteTest = [
  'import { test, expect } from \'vitest\';',
  'import { noteLimit } from \'../notes.ts\';',
  '',
  'test(\'the limit is the one the plan asks for\', () => { expect(noteLimit).toBe(500); });',
  '',
].join('\n');

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': noteTest,
  });
  await installMiniRunner(fixture.root);
  await initRepository(fixture.root);
  return fixture.root;
}

describe('what one writer invocation changed', () => {
  test('the two snapshots around a session give its own lines, and the view gives each path its owner', async () => {
    const root = await target();
    const index = architectIndex([
      moduleEntry('collection-review', '', null),
      moduleEntry(notes, notesDirectory, 'collection-review'),
    ]);

    const before = await takeLineSnapshot(root);
    await writeFile(join(root, notesDirectory, 'src', 'store.ts'), 'export const store = new Map();\nexport const kept = true;\n');
    await writeFile(join(root, notesDirectory, 'src', 'notes.ts'), 'export const noteLimit = 500;\n');
    const after = await takeLineSnapshot(root);

    const summary = lineEvents({ invocation: 'inv-0003', before, after, index });
    expect(summary.coverage).toBe('complete');
    expect(summary.gaps).toEqual([]);
    expect(summary.paths).toEqual([
      { path: `${notesDirectory}/src/notes.ts`, owner: notes, added: 1, deleted: 1, binary: false, bytes: null },
      { path: `${notesDirectory}/src/store.ts`, owner: notes, added: 2, deleted: 0, binary: false, bytes: null },
    ]);
    expect(summary.unmapped).toEqual({ paths: 0, added: 0, deleted: 0 });

    // A second session over the same tree is charged only with what it
    // changed, not with what it found.
    const third = await takeLineSnapshot(root);
    await writeFile(join(root, notesDirectory, 'src', 'store.ts'), 'export const store = new Map();\nexport const kept = true;\nexport const added = 1;\n');
    const fourth = await takeLineSnapshot(root);
    const second = lineEvents({ invocation: 'inv-0004', before: third, after: fourth, index });
    expect(second.paths).toEqual([{ path: `${notesDirectory}/src/store.ts`, owner: notes, added: 1, deleted: 0, binary: false, bytes: null }]);
  });

  test('a session that changed nothing has an empty summary; a path with no owner is counted as unmapped', async () => {
    const root = await target();
    const index = architectIndex([moduleEntry(notes, notesDirectory, null)]);
    const before = await takeLineSnapshot(root);
    const unchanged = lineEvents({ invocation: 'inv-0005', before, after: await takeLineSnapshot(root), index });
    expect(unchanged.paths).toEqual([]);
    expect(unchanged.coverage).toBe('complete');

    await writeFile(join(root, 'src', 'loose.ts'), 'export const loose = true;\n');
    const summary = lineEvents({ invocation: 'inv-0006', before, after: await takeLineSnapshot(root), index });
    expect(summary.paths).toEqual([{ path: 'src/loose.ts', owner: null, added: 1, deleted: 0, binary: false, bytes: null }]);
    expect(summary.unmapped).toEqual({ paths: 1, added: 1, deleted: 0 });
  });

  test('a snapshot that could not be taken is a coverage gap, never a zero', async () => {
    const summary = lineEvents({
      invocation: 'inv-0007',
      before: { available: false, reason: 'the directory is no repository' },
      after: { available: false, reason: 'the directory is no repository' },
      index: null,
    });
    expect(summary.coverage).toBe('partial');
    expect(summary.gaps).toHaveLength(3);
    expect(summary.paths).toEqual([]);
  });

  test('a path no module\'s contents hold is unmapped, and is never attributed to the root', async () => {
    const root = await target();
    const index = architectIndex([
      moduleEntry('collection-review', '', null),
      moduleEntry(notes, notesDirectory, 'collection-review'),
    ]);

    const before = await takeLineSnapshot(root);
    // Two paths the project holds and no module's own contents do: a
    // document beside the root and the project's own manifest.
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, 'docs', 'decision.md'), '# A decision\n\nWritten beside the modules, owned by none of them.\n');
    await writeFile(join(root, 'notes.txt'), 'one\ntwo\n');
    // And one the root's own source area does hold.
    await writeFile(join(root, 'src', 'added.ts'), 'export const added = true;\n');
    const summary = lineEvents({ invocation: 'inv-0008', before, after: await takeLineSnapshot(root), index });

    expect(summary.paths.map(path => [path.path, path.owner])).toEqual([
      ['docs/decision.md', null],
      ['notes.txt', null],
      ['src/added.ts', 'collection-review'],
    ]);
    expect(summary.unmapped).toEqual({ paths: 2, added: 5, deleted: 0 });
  });

  test('a binary file carries its byte count and no invented line count', async () => {
    const root = await target();
    const index = architectIndex([moduleEntry(notes, notesDirectory, null)]);
    const before = await takeLineSnapshot(root);

    await writeFile(join(root, notesDirectory, 'src', 'logo.bin'), Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02, 0x03]));
    const summary = lineEvents({ invocation: 'inv-0009', before, after: await takeLineSnapshot(root), index });

    expect(summary.paths).toEqual([
      { path: `${notesDirectory}/src/logo.bin`, owner: notes, added: 0, deleted: 0, binary: true, bytes: 6 },
    ]);
    expect(summary.coverage).toBe('complete');
  });

  test('an invocation that used the unguarded shell says so rather than reporting a complete count', async () => {
    const root = await target();
    const index = architectIndex([moduleEntry(notes, notesDirectory, null)]);
    const before = await takeLineSnapshot(root);
    // A command that changed a file and put it back leaves the two
    // snapshots identical; what the invocation did is not in them.
    await writeFile(join(root, notesDirectory, 'src', 'notes.ts'), 'export const noteLimit = 1;\n');
    await writeFile(join(root, notesDirectory, 'src', 'notes.ts'), 'export const noteLimit = 400;\n');

    const summary = lineEvents({
      invocation: 'inv-0010',
      before,
      after: await takeLineSnapshot(root),
      index,
      gaps: ['unguarded-shell: this invocation ran unguarded commands'],
    });

    expect(summary.paths).toEqual([]);
    expect(summary.coverage).toBe('partial');
    expect(summary.gaps).toEqual(['unguarded-shell: this invocation ran unguarded commands']);
  });

  test('the owner of a path is the module whose own contents hold it', () => {
    const index = architectIndex([
      moduleEntry('collection-review', '', null),
      moduleEntry('collection-review/workspace', 'subs/workspace', 'collection-review'),
      moduleEntry(notes, notesDirectory, 'collection-review/workspace'),
    ]);
    expect(ownerOf(index, `${notesDirectory}/src/notes.ts`)).toBe(notes);
    expect(ownerOf(index, 'subs/workspace/src/app.tsx')).toBe('collection-review/workspace');
    expect(ownerOf(index, 'src/main.ts')).toBe('collection-review');
    expect(ownerOf(index, `${notesDirectory}/module.ramify`)).toBe(notes);
    expect(ownerOf(index, `${notesDirectory}/README.md`)).toBe(notes);
    // The root owns its own source area, not everything beneath the project.
    expect(ownerOf(index, 'package.json')).toBeNull();
    expect(ownerOf(index, 'docs/decision.md')).toBeNull();
    expect(ownerOf(index, `${notesDirectory}/docs/note.md`)).toBeNull();
    expect(ownerOf(null, 'src/main.ts')).toBeNull();
  });
});

describe('a run captures each writer\'s line events when the observation happens', () => {
  test('the summary beside the invocation names what that invocation wrote', async () => {
    const root = await target();
    const { service } = await openRuns(root, {
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
        engineer: [submit(
          completionProposed('Raised the limit and added the store.'),
          edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500'),
          write(`${notesDirectory}/src/store.ts`, 'export const store = new Map();\n'),
        )],
      }),
      inputs: treeInputs(),
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    expect(onlyRun(service, 'review-notes').state).toBe('completed');

    const summary = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.lineEvents('inv-0003')), 'utf8')) as LineEventSummary;
    expect(summary.invocation).toBe('inv-0003');
    expect(summary.paths.map(path => path.path).sort()).toEqual([
      `${notesDirectory}/src/notes.ts`,
      `${notesDirectory}/src/store.ts`,
    ]);
    expect(summary.paths.every(path => path.owner === notes)).toBe(true);
    // The figures are git's, taken around the session, not afterwards.
    const numstat = await git(root, 'diff', '--numstat', 'HEAD~1', 'HEAD');
    expect(numstat).toContain(`${notesDirectory}/src/notes.ts`);
  }, 300_000);
});

describe('M5: every session counts, whatever ended it', () => {
  test('failed, stopped, repaired, context-limited and no-change sessions are all in the session set', () => {
    const lines = (invocation: string, paths: number): LineEventSummary => ({
      schema: 'ramify-agent.line-events/1',
      invocation,
      paths: Array.from({ length: paths }, (_, index) => ({ path: `a${index}.ts`, owner: notes, added: 3, deleted: 1, binary: false, bytes: null })),
      unmapped: { paths: 0, added: 0, deleted: 0 },
      coverage: 'complete',
      gaps: [],
    });
    const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 };
    const entries: SessionEntry[] = [
      { invocation: 'inv-0001', role: 'engineer', ended: 'failed', usage, lines: lines('inv-0001', 1) },
      { invocation: 'inv-0002', role: 'engineer', ended: 'stopped', usage, lines: lines('inv-0002', 1) },
      // The repair: a second attempt at the same iteration.
      { invocation: 'inv-0003', role: 'engineer', ended: 'submitted', usage, lines: lines('inv-0003', 2) },
      { invocation: 'inv-0004', role: 'engineer', ended: 'context-budget-reached', usage, lines: lines('inv-0004', 1) },
      // The session that changed nothing.
      { invocation: 'inv-0005', role: 'engineer', ended: 'submitted', usage, lines: lines('inv-0005', 0) },
    ];

    const metrics = sessionMetrics(entries);
    expect(metrics.sessions).toBe(5);
    expect(metrics.byEnd).toEqual({ failed: 1, stopped: 1, submitted: 2, 'context-budget-reached': 1 });
    // The no-change session is a session and contributes no change weight.
    expect(metrics.withChange).toBe(4);
    expect(metrics.withoutChange).toBe(1);
    expect(metrics.added).toBe(15);
    expect(metrics.deleted).toBe(5);
    expect(metrics.tokens).toBe(75);

    // One session whose usage the implementation could not report makes the
    // total unavailable rather than smaller.
    const withGap = sessionMetrics([...entries, {
      invocation: 'inv-0006', role: 'engineer', ended: 'ended', usage: { unavailable: 'the session reported no usage' },
    }]);
    expect(withGap.sessions).toBe(6);
    expect(withGap.tokens).toBeNull();
    expect(withGap.usageUnavailable).toBe(1);
  });
});
