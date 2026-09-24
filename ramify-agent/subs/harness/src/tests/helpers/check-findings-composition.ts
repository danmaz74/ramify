import type { ScriptStep } from '../../../subs/agent/src/scripted.js';
import type { CheckFindingSummary } from '../../../subs/check-findings/src/interfaces/check-findings.js';
import type { RunEvent } from '../../run/log.js';
import type { RunPolicy } from '../../run/records.js';
import type { RunService } from '../../run/service.js';
import { snapshotToolNames } from '../../reviews/snapshot.js';
import { analysis, entry, requestCompletion } from './analysis.js';
import type { ScriptedCommit } from './candidates.js';
import type { GateCommit } from './gate-git.js';
import { addModule, assign, completionProposed, outline, submit, write } from './iterations.js';
import { notes, notesDirectory, plan, reviewTarget, store, tool, unchanged, type ReviewRun } from './reviews.js';
import { runEventsOnDisk } from './runs.js';

/*
 * The composed CheckFinding fixture of Plan 12 iteration 8: one run of two
 * work items, reviewed by code, scope and design readers on every accepted
 * iteration.
 *
 * - wi-001 (the notes module) is clean: one iteration, three clean reviews,
 *   and the work item reaches its gate with no reconciliation.
 * - wi-002 (the tags module) has two iterations. The three readers of its
 *   second candidate run concurrently and raise four concerns: a code
 *   defect (cf-0001), a low-risk code simplification in the same file
 *   (cf-0002), a scope concern (cf-0003) and a design concern grounded in a
 *   principles document that names the same behavior as the defect
 *   (cf-0004). The first reconciliation relates the two reports of one
 *   behavior, supersedes the scope judgment, waives the simplification as a
 *   reported material choice and plans a correction. The correction is a
 *   later changed candidate: its acceptance claims the repair, its own code
 *   review raises one more low-risk signal (cf-0005), and the second round
 *   fixes the repaired pair and leaves the low signal below its floor.
 *
 * The readers of one candidate overlap; each waits to submit until the one
 * before it has committed, so the CheckFinding IDs are the same in every
 * run. Git's answers for the gates and the candidates are scripted; no
 * process starts and no model is called.
 */

export const tags = 'collection-review/workspace/catalog/tags';
export const tagsDirectory = 'subs/workspace/subs/catalog/subs/tags';
export const tagStore = `${tagsDirectory}/src/tags.ts`;
export const tagLimit = `${tagsDirectory}/src/limit.ts`;
export const tagsReadme = `${tagsDirectory}/README.md`;
export const principles = 'docs/catalog.principles.md';

/** The project: the notes module of the review tests and a tags module beside it. */
export async function compositionTarget(cleanups: Array<() => Promise<void>>): Promise<string> {
  const root = await reviewTarget(cleanups);
  await addModule(root, tagsDirectory, 'tags', {
    'src/tags.ts': 'export const tagNames: string[] = [];\n',
    'src/tests/tags.test.ts': 'import { test, expect } from \'vitest\';\nimport { tagNames } from \'../tags.ts\';\n\ntest(\'no tag\', () => {\n  expect(tagNames).toEqual([]);\n});\n',
  });
  return root;
}

/** The candidates: each holds its module declarations, the guidance and the source so far. */
export function compositionCommits(): Record<string, ScriptedCommit> {
  const declarations = {
    'module.ramify': 'ramify 1\nmodule collection-review\n',
    'subs/workspace/module.ramify': 'ramify 1\nmodule workspace\n',
    'subs/workspace/subs/reviews/module.ramify': 'ramify 1\nmodule reviews\n',
    [`${notesDirectory}/module.ramify`]: 'ramify 1\nmodule notes\n',
    'subs/workspace/subs/catalog/module.ramify': 'ramify 1\nmodule catalog\n',
    [`${tagsDirectory}/module.ramify`]: 'ramify 1\nmodule tags\n',
  };
  const guidance = {
    [principles]: 'A catalog tag holds at most 500 characters.\n',
    [tagsReadme]: 'Tags name catalog entries. This module keeps them in memory.\n',
  };
  const notesStore = { [store]: 'export const store = new Map(); // v1\n' };
  const tagSource = { [tagStore]: 'export const tags = new Set<string>();\n' };
  const shortLimit = { [tagLimit]: 'export const tagLimit = (text: string) => text.length <= 50;\n' };
  const longLimit = { [tagLimit]: 'export const tagLimit = (text: string) => text.length <= 500;\n' };
  return {
    'revision-01': { tree: 'tree-01', base: 'scenarios-00', changes: [{ status: 'A', path: store }], files: { ...declarations, ...guidance, ...notesStore } },
    'revision-02': { tree: 'tree-02', base: 'revision-01', changes: [{ status: 'A', path: tagStore }], files: { ...declarations, ...guidance, ...notesStore, ...tagSource } },
    'revision-03': { tree: 'tree-03', base: 'revision-02', changes: [{ status: 'A', path: tagLimit }], files: { ...declarations, ...guidance, ...notesStore, ...tagSource, ...shortLimit } },
    'revision-04': { tree: 'tree-04', base: 'revision-03', changes: [{ status: 'M', path: tagLimit }], files: { ...declarations, ...guidance, ...notesStore, ...tagSource, ...longLimit } },
  };
}

/** What Git answers at each commit boundary after the scenarios' commit, in the order the run reaches them. */
export const compositionGates: readonly GateCommit[] = [
  { commit: 'revision-01', changes: [{ status: 'A', path: store }] },
  unchanged,
  { commit: 'revision-02', changes: [{ status: 'A', path: tagStore }] },
  { commit: 'revision-03', changes: [{ status: 'A', path: tagLimit }] },
  { commit: 'revision-04', changes: [{ status: 'M', path: tagLimit }] },
  unchanged,
  unchanged,
];

type Risk = 'high' | 'medium' | 'low';
/** One concern about a path of the candidate, grounded in a file the reader read or in nothing. */
export const concern = (path: string, summary: string, risk: Risk, ground: string | null = null) => ({
  summary, consequence: `${summary}, so the behavior differs from what was asked`, rationale: 'read the candidate diff', uncertainty: 'moderate',
  remedy: 'a bounded change in the named file', locations: [{ path, startLine: 1, endLine: 1 }], suggests: null, risk,
  ground: ground === null ? null : { path: ground },
});

/** A step that waits until the given review attempts have committed their results. */
export function afterFinished(root: string, attempts: readonly string[]): ScriptStep {
  return {
    kind: 'await',
    until: async () => {
      for (;;) {
        const events = await runEventsOnDisk(root, plan, (await runIds(root))[0]!).catch(() => [] as RunEvent[]);
        const finished = new Set(events.flatMap(event => (event.type === 'review-attempt-finished' ? [event.data.attempt] : [])));
        if (attempts.every(attempt => finished.has(attempt))) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    },
  };
}

async function runIds(root: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  return readdir(join(root, 'plans', plan, '.harness', 'jobs')).catch(() => []);
}

/** A reader that reads each changed path's patch, and each ground, and submits these concerns. */
export function review(paths: readonly string[], concerns: readonly ReturnType<typeof concern>[] = [], before: readonly ScriptStep[] = []): ScriptStep[] {
  const grounds = [...new Set(concerns.flatMap(one => (one.ground === null ? [] : [one.ground.path])))];
  return [
    ...paths.map(path => tool(snapshotToolNames.diff, { path })),
    ...grounds.map(path => tool(snapshotToolNames.read, { path })),
    ...before,
    { kind: 'submit', input: { inspected: [...paths], missing: [], concerns: [...concerns] } },
  ];
}

/** A design orientation that read its whole guidance selection. */
const orientation = (read: readonly string[]): ScriptStep[] => [{ kind: 'submit', input: { read: [...read], summary: 'Catalog tags hold at most 500 characters and stay in memory.' } }];

/** One disposition of a reconciliation submission. */
export const disposition = (checkFinding: string, action: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  checkFinding, rationale: `The assessment of ${checkFinding} against the current source.`, communication: { mode: 'quiet' }, action, ...extra,
});
export const submission = (dispositions: readonly unknown[], next: Record<string, unknown>, relations: readonly unknown[] = []) => ({
  relations: [...relations], dispositions: [...dispositions], next, brief: 'The concerns were assessed together.',
});
export const reconcile = (...inputs: unknown[]): ScriptStep[] => inputs.map(input => ({ kind: 'submit', input }) as ScriptStep);

/** The concerns of the fixture, by the CheckFinding each one opens. */
export const concerns = {
  defect: concern(tagLimit, 'The tag limit is 50 characters, and the plan asks for 500', 'high'),
  simplification: concern(tagLimit, 'The limit could take a trimmed text', 'low'),
  scope: concern(tagLimit, 'The iteration adds a limit the assignment did not name', 'medium', tagsReadme),
  design: concern(tagLimit, 'The limit contradicts the catalog principle of 500 characters', 'high', principles),
  constant: concern(tagLimit, 'The limit could be a named constant', 'low'),
} as const;

/** The composed scenario for `reviewRun`, with the policy it asks for. */
export function compositionScenario(root: string, policy: Partial<NonNullable<RunPolicy['reviews']>> = {}): ReviewRun {
  return {
    commits: compositionCommits(),
    gates: compositionGates,
    policy: { kinds: ['code', 'scope', 'design'], concurrency: 2, ...policy },
    engineer: [],
    roles: {
      'initial-architect': [submit(analysis([entry('review-notes', notes), entry('catalog-tags', tags)]))],
      'local-architect:wi-001': [
        submit(assign(notes, { goal: 'Add the note store.' }, outline())),
        submit(requestCompletion()),
      ],
      'engineer:wi-001': [submit(completionProposed('Added the note store.'), write(store, 'export const store = new Map(); // v1\n'))],
      'local-architect:wi-002': [
        submit(assign(tags, { goal: 'Add the tag store.' }, outline())),
        submit(assign(tags, { goal: 'Limit a tag to the plan\'s length.' })),
        submit(requestCompletion()),
        submit(assign(tags, { goal: 'Make the tag limit 500 characters, as the plan asks.', kind: 'repair' })),
        submit(requestCompletion()),
      ],
      'engineer:wi-002': [
        submit(completionProposed('Added the tag store.'), write(tagStore, 'export const tags = new Set<string>();\n')),
        submit(completionProposed('Limited a tag.'), write(tagLimit, 'export const tagLimit = (text: string) => text.length <= 50;\n')),
        submit(completionProposed('Corrected the tag limit.'), write(tagLimit, 'export const tagLimit = (text: string) => text.length <= 500;\n')),
      ],
    },
    reviewers: {
      // wi-001's selection is the principles document; wi-002's adds the tags README.
      'orientation#1': orientation([principles]),
      'orientation#2': orientation([principles, tagsReadme]),
      // wi-001.i01 and wi-002.i01: clean.
      'rq-0001': review([store]), 'rq-0002': review([store]), 'rq-0003': review([store]),
      'rq-0004': review([tagStore]), 'rq-0005': review([tagStore]), 'rq-0006': review([tagStore]),
      // wi-002.i02: three concurrent readers, four concerns, committed in request order.
      'rq-0007': review([tagLimit], [concerns.defect, concerns.simplification]),
      'rq-0008': review([tagLimit], [concerns.scope], [afterFinished(root, ['rq-0007.a01'])]),
      'rq-0009': review([tagLimit], [concerns.design], [afterFinished(root, ['rq-0008.a01'])]),
      // wi-002.i03, the correction: one more low-risk signal from its code review.
      'rq-0010': review([tagLimit], [concerns.constant]), 'rq-0011': review([tagLimit]), 'rq-0012': review([tagLimit]),
    },
    reconcilers: {
      'wi-002.rc01': reconcile(submission([
        disposition('cf-0001', { action: 'repair' }),
        disposition('cf-0004', { action: 'repair' }),
        disposition('cf-0003', { action: 'supersede', reassessed: ['cfr-0003'], replacement: 'The assignment cites the plan\'s limit; the limit is in scope.' }),
        disposition('cf-0002', { action: 'waive', uncertainty: 'Either input serves.' }, {
          communication: { mode: 'report', choice: 'The limit takes the text as given.', uncertainty: 'Either input serves.', reason: 'It departs from the reviewer\'s suggestion.' },
        }),
      ], { kind: 'correct', goal: 'Make the tag limit 500 characters, as the plan and the catalog principle ask.' }, [
        { from: 'cf-0004', to: 'cf-0001', relation: 'same-issue', shared: 'The tag limit is 500 characters.', evidence: [`${tagLimit}:1`], rationale: 'Both name the 50-character limit of the same function.' },
        { from: 'cf-0002', to: 'cf-0001', relation: 'related-but-distinct', shared: 'The tag limit function.', evidence: [`${tagLimit}:1`], rationale: 'One is a defect, the other a simplification.' },
      ])),
      'wi-002.rc02': reconcile(submission([
        disposition('cf-0001', { action: 'fixed', reassessed: ['cfr-0001'] }),
        disposition('cf-0004', { action: 'fixed', reassessed: ['cfr-0004'] }),
        disposition('cf-0005', { action: 'leave' }),
      ], { kind: 'unresolved' })),
    },
  };
}

/** Every CheckFinding summary of a run, in ID order. */
export function summariesOf(service: RunService, runId: string): CheckFindingSummary[] {
  const list = service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all', limit: 100 });
  if (list === undefined || !list.ok || list.view.kind !== 'list') throw new Error('no list');
  return [...list.view.items];
}
