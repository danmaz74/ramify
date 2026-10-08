import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { reviewLayout, type ReviewRequest } from '../reviews/records.js';
import { assign, completionProposed, outline, submit, write } from './helpers/iterations.js';
import { attemptRecord, eventsOf, limit, notes, notesDirectory, plan, reviewRun, reviewTarget, store } from './helpers/reviews.js';
import { runEventsOnDisk, runPath } from './helpers/runs.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

/*
 * The frozen catalog is unreadable while the first iteration's reviews are
 * requested, and whole again at the run's next write: the scope review
 * cannot cite its assignment package, so it is recorded as unavailable.
 */
test('an assignment package that cannot be cited leaves a scope review explicitly not verified', async () => {
  const root = await reviewTarget(cleanups);
  const index = `${notesDirectory}/src/index.ts`;
  let catalog: { path: string; bytes: string } | undefined;
  let restored = false;
  const run = await reviewRun(root, cleanups, {
    policy: { kinds: ['scope'] },
    afterWrite: async (write, runId) => {
      if (catalog === undefined && write === 'iteration-closed') {
        const accepted = (await runEventsOnDisk(root, plan, runId)).find(event => event.type === 'analysis-accepted');
        if (accepted?.type !== 'analysis-accepted' || accepted.data.evidence === undefined) throw new Error('The run has no accepted catalog');
        const path = runPath(root, plan, runId, accepted.data.evidence.catalog.path);
        catalog = { path, bytes: await readFile(path, 'utf8') };
        await writeFile(path, '{"schema":"not a catalog"}\n');
      } else if (catalog !== undefined && !restored) {
        restored = true;
        await writeFile(catalog.path, catalog.bytes);
      }
    },
    architect: [
      submit(assign(notes, { goal: 'Add the note store.', citedElements: ['fr-001'] }, outline())),
      submit(assign(notes, { goal: 'State the note limit.' })),
      submit(assign(notes, { goal: 'Export the store.' })),
      submit({ kind: 'request-completion', outline: outline() }),
    ],
    engineer: [
      submit(completionProposed('Added the store.'), write(store, 'export const store = new Map(); // v1\n')),
      submit(completionProposed('Stated the limit.'), write(limit, 'export const limit = (text: string) => text.length <= 50;\n')),
      submit(completionProposed('Exported the store.'), write(store, 'export const store = new Map(); // v3\n'), write(index, "export * from './store.js';\n")),
    ],
    reviewers: {},
  });
  const request = eventsOf(run.events, 'review-request-recorded')[0];
  expect(request).toBeDefined();
  const record = JSON.parse(await readFile(runPath(root, plan, run.runId, reviewLayout.request(request!.data.request)), 'utf8')) as ReviewRequest;
  expect(restored).toBe(true);
  expect(record.inputsUnavailable).toContain('The scope review\'s assignment package could not be cited');
  expect(record.source).toBeUndefined();
  expect(await attemptRecord(root, run.runId, `${request!.data.request}.a01`)).toMatchObject({
    result: { result: 'not-verified', reason: 'unavailable', detail: expect.stringContaining('assignment package could not be cited') },
  });
  expect(run.agent?.sessions.filter(session => session.spec.role === 'reviewer'
    && session.spec.prompt.includes(request!.data.request))).toHaveLength(0);
});
