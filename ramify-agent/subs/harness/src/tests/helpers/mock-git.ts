import { expect, vi, type Mocked } from 'vitest';
import type { GitService, IgnoreStatus } from '../../../subs/evidence/src/git.js';

/** Successive answers for scratch Git operations; no answer is inferred from disk. */
export interface ScratchGitScript {
  readonly trackedPaths?: readonly (readonly string[])[] | undefined;
  readonly ignoreStatus?: readonly (readonly IgnoreStatus[])[] | undefined;
}

/** Add only explicitly scripted operations to a Git mock. */
export function scriptedScratchGit(root: string, script: ScratchGitScript | undefined): {
  readonly answers: Partial<GitService>;
  assertComplete(): void;
} {
  let tracked = 0;
  let ignored = 0;
  const answers: Partial<GitService> = {
    ...(script?.trackedPaths === undefined ? {} : { async trackedPaths(project: string, _directories: readonly string[]) {
      expect(project).toBe(root);
      const answer = script.trackedPaths?.[tracked++];
      expect(answer, 'no additional tracked-path answer was scripted').toBeDefined();
      return [...answer!];
    } }),
    ...(script?.ignoreStatus === undefined ? {} : { async ignoreStatus(project: string, paths: readonly string[]) {
      expect(project).toBe(root);
      const answer = script.ignoreStatus?.[ignored++];
      expect(answer, 'no additional ignore-status answer was scripted').toBeDefined();
      expect(answer!.map(status => status.path)).toEqual(paths);
      return [...answer!];
    } }),
  };
  return { answers, assertComplete() {
    expect(tracked, 'tracked-path answers consumed').toBe(script?.trackedPaths?.length ?? 0);
    expect(ignored, 'ignore-status answers consumed').toBe(script?.ignoreStatus?.length ?? 0);
  } };
}

/** Typed external-system mock. A scenario explicitly supplies every answer it needs. */
export function mockGit(answers: Partial<GitService> = {}): Mocked<GitService> & { readonly unexpected: string[] } {
  const unexpected: string[] = [];
  const mock = { unexpected } as Mocked<GitService> & { readonly unexpected: string[] };
  const operations: readonly (keyof GitService)[] = [
    'trackedPaths', 'ignoreStatus',
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
