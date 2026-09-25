import { vi, type Mocked } from 'vitest';
import type { GitService } from '../../../subs/evidence/src/git.js';

/** Typed external-system mock. A scenario explicitly supplies every answer it needs. */
export function mockGit(answers: Partial<GitService> = {}): Mocked<GitService> & { readonly unexpected: string[] } {
  const unexpected: string[] = [];
  const mock = { unexpected } as Mocked<GitService> & { readonly unexpected: string[] };
  const operations: readonly (keyof GitService)[] = [
    'previewCandidateTree',
    'currentHead', 'isCleanRepository', 'createRunBranch', 'commitAccepted',
    'findCommitByTrailer', 'findCommitByTrailers', 'changedPaths', 'changedEntries',
    'diffNameStatus', 'diffNumstat', 'commitNameStatus', 'worktreeLineChanges', 'worktreePatch',
  ];
  for (const operation of operations) {
    const answer = answers[operation] as ((...args: unknown[]) => unknown) | undefined;
    Object.assign(mock, { [operation]: vi.fn(async (...args: unknown[]) => {
      if (!answer) {
        unexpected.push(operation);
        throw new Error(`No Git response scripted for ${operation}`);
      }
      try { return await answer(...args); }
      catch (error) {
        // A consumer may catch a Git failure as unavailable. It must not
        // swallow a failed assertion inside a mock callback.
        if (error instanceof Error && error.name === 'AssertionError') unexpected.push(`${operation}: ${error.message}`);
        throw error;
      }
    }) });
  }
  return mock;
}
