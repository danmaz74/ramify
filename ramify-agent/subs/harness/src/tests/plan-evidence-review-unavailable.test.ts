import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { reviewLayout, type ReviewRequest } from '../reviews/records.js';
import { assign, completionProposed, outline, submit, write } from './helpers/iterations.js';
import { attemptRecord, eventsOf, limit, notes, notesDirectory, plan, reviewRun, reviewTarget, store } from './helpers/reviews.js';
import { runPath } from './helpers/runs.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('a missing companion passage leaves a scope review explicitly not verified', async () => {
  const root = await reviewTarget(cleanups);
  const planFile = join(root, 'plans', plan, 'plan.md');
  await writeFile(join(root, 'plans', plan, 'companion.md'), '# Companion\n\nThe review retains source context.\n');
  await writeFile(planFile, `${await readFile(planFile, 'utf8')}\n[Companion](companion.md)\n`);
  const index = `${notesDirectory}/src/index.ts`;
  const run = await reviewRun(root, cleanups, {
    policy: { kinds: ['scope'] },
    architect: [
      submit(assign(notes, { goal: 'Add the note store.', requirementRefs: [{ document: 'doc-002', anchor: 'Absent passage' }] }, outline())),
      submit(assign(notes, { goal: 'State the note limit.' })),
      submit(assign(notes, { goal: 'Export the store.' })),
      submit({ kind: 'request-completion', scenarios: [], outline: outline() }),
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
  expect(record.inputsUnavailable).toContain('No heading Absent passage in plans/review-notes/companion.md');
  expect(await attemptRecord(root, run.runId, `${request!.data.request}.a01`)).toMatchObject({
    result: { result: 'not-verified', reason: 'unavailable', detail: expect.stringContaining('Absent passage') },
  });
  expect(run.agent?.sessions.filter(session => session.spec.role === 'reviewer'
    && session.spec.prompt.includes(request!.data.request))).toHaveLength(0);
});
