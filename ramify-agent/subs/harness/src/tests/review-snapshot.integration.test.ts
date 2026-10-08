import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { reviewLayout } from '../reviews/records.js';
import { snapshotToolNames } from '../reviews/snapshot.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { testReviewPolicy } from './helpers/candidates.js';
import { addModule, assign, byRole, completionProposed, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { gate, notes, notesDirectory, plan, reviewTarget, store, tool } from './helpers/reviews.js';
import { git, initRepository, onlyRun, openRuns, runEventsOnDisk, runPath, startRun, testPolicy } from './helpers/runs.js';

/*
 * The real-process witness of a review snapshot (Plan 12 iteration 3): a
 * driven run over a real Git repository, whose first iteration's reviewer
 * reads its audited candidate through the real snapshot tools, from Git's
 * objects, while the second iteration's writer changes the live store and
 * its gate commits it. The reviewer is the scripted fake; every Git answer
 * is real, and no model is called.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe('a review snapshot over a real repository', () => {
  test('the reader reads the audited candidate while a later writer changes and commits the live tree', async () => {
    const root = await reviewTarget(cleanups);
    // Committed with the fixture: a link out of the project. Live only, and
    // ignored by Git: a generated architect view and a module's API view.
    await symlink('/etc/hostname', join(root, notesDirectory, 'src', 'escape'));
    const head = await initRepository(root);
    await mkdir(join(root, '.ramify-architect'), { recursive: true });
    await writeFile(join(root, '.ramify-architect', 'README.md'), 'the live architect view\n');
    await mkdir(join(root, notesDirectory, 'src', '.ramify'), { recursive: true });
    await writeFile(join(root, notesDirectory, 'src', '.ramify', 'api.json'), '{"live":true}\n');

    const waiting = gate();
    const wrote = gate();
    const roles = byRole({
      'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
      'local-architect': [
        submit(assign(notes, { goal: 'Add the note store.' }, outline())),
        submit(assign(notes, { goal: 'Revise the note store.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit(completionProposed('Added the note store.'), write('store.ts', 'export const store = new Map(); // v1\n')),
        submit(completionProposed('Revised the note store.'),
          { kind: 'await', until: () => waiting.opened },
          write('store.ts', 'export const store = new Map(); // v3\n'),
          { kind: 'await', until: async () => { wrote.open(); } }),
      ],
    }) as (spec: SessionSpec) => readonly ScriptStep[];
    const reviewer: Record<string, readonly ScriptStep[]> = {
      'rq-0001': [
        tool(snapshotToolNames.diff, {}),
        tool(snapshotToolNames.read, { path: join(root, store) }),
        tool(snapshotToolNames.read, { path: '.ramify-architect/README.md' }),
        tool(snapshotToolNames.read, { path: `${notesDirectory}/src/.ramify/api.json` }),
        tool(snapshotToolNames.read, { path: `${notesDirectory}/src/escape` }),
        tool(snapshotToolNames.list, { path: `${notesDirectory}/src` }),
        { kind: 'await', until: async () => { waiting.open(); await wrote.opened; } },
        // The live store is v3 and the second gate is about to commit it.
        tool(snapshotToolNames.read, { path: store }),
        tool(snapshotToolNames.search, { pattern: 'v3', path: notesDirectory }),
        { kind: 'submit', input: { inspected: [store], missing: [], concerns: [] } },
      ],
      'rq-0002': [tool(snapshotToolNames.diff, { path: store }), { kind: 'submit', input: { inspected: [store], missing: [], concerns: [] } }],
    };
    const script = (spec: SessionSpec): readonly ScriptStep[] => {
      if (spec.role !== 'reviewer') return roles(spec);
      const request = /Code review (rq-\d{4})/u.exec(spec.prompt)?.[1] ?? '';
      return reviewer[request] ?? [{ kind: 'end', message: 'unscripted' }];
    };
    const opened = await openRuns(root, {
      script,
      git: gitService,
      inputs: treeInputs(),

      policy: projectRoot => testPolicy(projectRoot, { reviews: testReviewPolicy() }),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, plan).state).toBe('completed');

    const events = await runEventsOnDisk(root, plan, runId);
    const requests = events.flatMap(event => (event.type === 'review-request-recorded' ? [event.data] : []));
    const commits = events.flatMap(event => (event.type === 'iteration-closed' && event.data.outcome === 'accepted' ? [event.data.commit!] : []));
    expect(commits).toHaveLength(2);
    expect(requests.map(request => request.candidate)).toEqual(commits);
    const request = JSON.parse(await readFile(runPath(root, plan, runId, reviewLayout.request('rq-0001')), 'utf8'));
    expect(request.tree).toBe((await git(root, 'rev-parse', `${commits[0]}^{tree}`)).trim());
    expect(request.base).not.toBe(head);

    const session = opened.agent!.sessions.find(entry => entry.spec.role === 'reviewer' && entry.spec.prompt.includes('rq-0001'))!;
    const results = session.results.map(result => [result.tool, result.isError, result.text]);
    expect(results[0]).toEqual([snapshotToolNames.diff, false, `A\t${store}`]);
    expect(results.slice(1, 5)).toEqual([
      [snapshotToolNames.read, true, expect.stringContaining('is an absolute path')],
      [snapshotToolNames.read, true, expect.stringContaining('is a generated view')],
      [snapshotToolNames.read, true, expect.stringContaining('is a generated view')],
      [snapshotToolNames.read, true, expect.stringContaining('is a symbolic link')],
    ]);
    // The listing is the committed directory: the link is named and not
    // followed, and the live API view is not there.
    expect(results[5]).toEqual([snapshotToolNames.list, false, 'escape (symbolic link, not followed)\nnotes.ts\nstore.ts\ntests/']);
    // What the live tree and the second commit hold, and what the reader read.
    expect(await readFile(join(root, store), 'utf8')).toBe('export const store = new Map(); // v3\n');
    expect(await git(root, 'show', `${commits[1]}:${store}`)).toBe('export const store = new Map(); // v3\n');
    expect(results[6]).toEqual([snapshotToolNames.read, false, '     1\texport const store = new Map(); // v1']);
    expect(results[7]).toEqual([snapshotToolNames.search, false, 'No match']);
    const finished = events.flatMap(event => (event.type === 'review-attempt-finished' ? [event.data] : []));
    expect(finished.map(entry => [entry.attempt, entry.result])).toEqual([['rq-0001.a01', 'complete'], ['rq-0002.a01', 'complete']]);
  }, 120_000);
});
