import { expect } from 'vitest';
import { analysis, entry, requestCompletion } from './analysis.js';
import { finalCandidate } from './final-candidate.js';
import { copyFixture } from './fixture.js';
import { addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline, submit, treeInputs } from './iterations.js';
import { mockGit } from './mock-git.js';
import { onlyRun, openRuns, startRun } from './runs.js';

/*
 * A finished scripted run whose engineer starts fresh and, after its
 * iteration gate reports a module violation, repairs it by continuing the
 * same session: one fresh and one repair-continuation engineer invocation.
 */

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const source = `${notesDirectory}/src/notes.ts`;

/** A finding exactly as `ramify check --batch --format json` reports one. */
function notVisible(file: string, line: number): Record<string, unknown> {
  return {
    id: `source-diagnostic/1:${file}:${line}`, category: 'import', code: 'not-visible',
    message: 'collection-review:interfaces/protocol.ts#ToolResult: not-visible',
    location: { file, start: 587, end: 597, line, column: 3 },
    importer: { owner: 'collection-review/workspace/reviews/notes', kind: 'ordinary' },
    original: { kind: 'code', owner: 'collection-review', file: 'interfaces/protocol.ts', binding: 'ToolResult' },
  };
}

export interface RepairRun {
  readonly root: string;
  readonly planId: 'review-notes';
  readonly runId: string;
}

/** Runs the plan `review-notes` to completion with one gate repair. Cleanups close the service and remove the copy. */
export async function repairContinuationRun(cleanups: Array<() => Promise<void>>): Promise<RepairRun> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  const root = fixture.root;
  await addModule(root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': [
      'import { test, expect } from \'vitest\';',
      'import { noteLimit } from \'../notes.ts\';',
      '',
      'test(\'the limit is what the plan asks for\', () => { expect(noteLimit).toBe(500); });',
      '',
    ].join('\n'),
  });
  await installMiniRunner(root);
  let head = 'base';
  const final = finalCandidate(root, 'repaired-source');
  let previewIndex = 0;
  const git = mockGit({
    previewCandidateTree: async () => {
      const preview = final.previews[previewIndex++];
      if (preview === undefined) throw new Error(`Unscripted final tree preview ${previewIndex}`);
      return preview;
    },
    currentHead: async () => head,
    isCleanRepository: async () => true,
    createRunBranch: async (_root, runId) => ({ branch: `ramify-agent-run/${runId}`, created: true }),
    findCommitByTrailers: async () => null,
    changedPaths: async (_root, accepted) => accepted === 'scenarios' ? [source] : [],
    changedEntries: async (_root, accepted) => accepted === 'scenarios' ? [{ status: 'M', path: source }] : [],
    diffNameStatus: async () => [{ status: 'M', path: source }],
    worktreeLineChanges: async () => { throw new Error('Line metrics not scripted in the repair run'); },
  });
  git.commitAccepted
    .mockImplementationOnce(async () => { head = 'scenarios'; return head; })
    .mockImplementationOnce(async () => { head = 'repaired-source'; return head; }).mockResolvedValue(null);
  const opened = await openRuns(root, {
    inputs: treeInputs(), git, candidates: final.candidates,
    checkScript: ({ check, context }) => check.kind === 'ramify-check' && context.attemptId === 'ga-0002'
      ? { stdout: JSON.stringify({ schemaVersion: 'ramify.check/1', outcome: 'findings', findings: [notVisible(source, 13)] }), outcome: { kind: 'completed', exitCode: 1 } }
      : {},
    script: byRole({
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
      engineer: [
        submit(completionProposed('Raised the limit to 500.'), edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500')),
        submit(completionProposed('Used what the module receives.')),
      ],
    }),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
  return { root, planId: 'review-notes', runId: receipt.jobId };
}
