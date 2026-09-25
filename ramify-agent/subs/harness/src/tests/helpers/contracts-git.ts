import { expect, type Mocked } from 'vitest';
import type { GitService } from '../../../subs/evidence/src/git.js';
import { mockGit } from './mock-git.js';

/*
 * The Git answers one contract or verification scenario gives.
 *
 * Git is external, like the model behind an agent. Nothing here is a
 * repository: there is no tree, no history, no diff and no rule. A scenario
 * states, in order, what Git reports for each commit the run attempts — the
 * revision it minted, or that the tree was unchanged — and what it reports
 * as changed beside it. Every other answer is either stated by the scenario
 * or refused, and a refused operation is recorded rather than guessed.
 */

/** One change as `git status`-style fixture data: never derived from a tree. */
export interface GitChange {
  readonly status: string;
  readonly path: string;
}

/** What Git answers for one commit the harness attempts. */
export interface CommitResponse {
  /** The subject line this commit is expected to carry: an iteration, a work item or a final gate. */
  readonly subject: string;
  /** The revision Git reports, or `null` where it reports an unchanged tree. */
  readonly commit: string | null;
  /** What Git reports as changed for it, before and after the commit. */
  readonly changes?: readonly GitChange[];
}

export interface GitAnswers {
  /** The revision the fixture is on before the run commits anything. */
  readonly head: string;
  readonly commits: readonly CommitResponse[];
  /**
   * Revisions Git reports for a gate's identity trailers, or a scenario
   * commit's `Ramify-Scenarios` value: what a recovery lookup finds. Those
   * absent from this map are reported as not committed.
   */
  readonly recovered?: Readonly<Record<string, string>> | undefined;
  /** What Git reports about the working tree at readiness. */
  readonly clean?: boolean | undefined;
  /** Line measurements, where the scenario has them. Omitted means Git cannot say. */
  readonly lines?: Awaited<ReturnType<GitService['worktreeLineChanges']>> | undefined;
}

export interface AnsweredGit extends Mocked<GitService> {
  readonly unexpected: string[];
  /** Every commit message the harness wrote, in order. */
  messages(): readonly string[];
  /** The subject line of each of them. */
  subjects(): readonly string[];
  /** The revisions Git reported as minted, in order. */
  minted(): readonly string[];
  head(): string;
  branch(): string | null;
  /** The gate identities a recovery lookup asked about. */
  lookups(): readonly string[];
  /**
   * The boundary revision the run asked each observation about, in order.
   * A scenario that depends on which revision is the accepted one states
   * this sequence, so a stale boundary cannot pass unnoticed.
   */
  bases(operation: 'changedPaths' | 'changedEntries' | 'diffNameStatus'): readonly string[];
  /** Every answer was used, every argument was one this scenario knows, and nothing else was asked. */
  assertAnswered(): void;
}

const runBranchPrefix = 'ramify-agent-run/';

/** A scripted external Git for one scenario. */
export function answeredGit(root: string, answers: GitAnswers): AnsweredGit {
  let index = 0;
  let head = answers.head;
  let branch: string | null = null;
  const messages: string[] = [];
  const lookups: string[] = [];
  const minted: string[] = [];
  const failures: string[] = [];
  const known = new Set<string>([answers.head, '']);
  const bases: Record<string, string[]> = { changedPaths: [], changedEntries: [], diffNameStatus: [] };
  const byCommit = new Map<string, readonly GitChange[]>();

  function check(operation: string, assertion: () => void): void {
    try { assertion(); }
    catch (error) { failures.push(`${operation}: ${String(error)}`); throw error; }
  }

  /** The changes of the answer that has not been given yet: what a pending commit would carry. */
  const pending = (): readonly GitChange[] => answers.commits[index]?.changes ?? [];

  const git = mockGit({
    async currentHead(project) {
      check('currentHead', () => expect(project).toBe(root));
      return head;
    },
    async isCleanRepository(project) {
      check('isCleanRepository', () => expect(project).toBe(root));
      return answers.clean ?? true;
    },
    async createRunBranch(project, runId) {
      check('createRunBranch', () => expect(project).toBe(root));
      branch = `${runBranchPrefix}${runId}`;
      return { branch, created: true };
    },
    async commitAccepted(project, message) {
      const response = answers.commits[index];
      check('commitAccepted', () => {
        expect(project).toBe(root);
        expect(branch, 'a commit was attempted before the run branch was asked for').not.toBeNull();
        const title = message.split('\n')[0]!;
        expect(response, `no Git answer is scripted for "${title}"`).toBeDefined();
        expect(
          title === response!.subject || title.startsWith(`${response!.subject}:`),
          `expected the commit of ${response!.subject}, got "${title}"`,
        ).toBe(true);
      });
      index += 1;
      messages.push(message);
      if (response!.commit !== null) {
        head = response!.commit;
        known.add(head);
        minted.push(head);
        byCommit.set(head, response!.changes ?? []);
      }
      return response!.commit;
    },
    async findCommitByTrailers(project, trailers) {
      check('findCommitByTrailers', () => {
        expect(project).toBe(root);
        // A gate's commit, or one of the harness's own scenario commits.
        expect(trailers.map(trailer => trailer.key)).toHaveLength(2);
        expect(trailers[0]!.key).toBe('Ramify-Run');
        expect(['Ramify-Gate', 'Ramify-Scenarios']).toContain(trailers[1]!.key);
        expect(trailers[0]!.value).toBe(branch?.slice(runBranchPrefix.length));
      });
      const gate = trailers[1]!.value;
      lookups.push(gate);
      return answers.recovered?.[gate] ?? null;
    },
    async changedPaths(project, base = 'HEAD') {
      bases['changedPaths']!.push(base);
      check('changedPaths', () => { expect(project).toBe(root); expect(known.has(base)).toBe(true); });
      return pending().map(change => change.path);
    },
    async changedEntries(project, base = 'HEAD') {
      bases['changedEntries']!.push(base);
      check('changedEntries', () => { expect(project).toBe(root); expect(known.has(base)).toBe(true); });
      return [...pending()];
    },
    async diffNameStatus(project, from, to) {
      bases['diffNameStatus']!.push(from);
      check('diffNameStatus', () => {
        expect(project).toBe(root);
        expect(known.has(from)).toBe(true);
        expect(known.has(to)).toBe(true);
      });
      // The answer for the revision asked about, as this scenario stated it.
      return [...(byCommit.get(to) ?? [])];
    },
    async worktreeLineChanges(project, base = 'HEAD') {
      check('worktreeLineChanges', () => { expect(project).toBe(root); expect(known.has(base)).toBe(true); });
      if (answers.lines === undefined) throw new Error('Line measurements are unavailable in this scenario');
      return answers.lines;
    },
    async worktreePatch(project, base = 'HEAD') {
      check('worktreePatch', () => { expect(project).toBe(root); expect(known.has(base)).toBe(true); });
      throw new Error('The working tree\'s patch is unavailable in this scenario');
    },
  }) as AnsweredGit;

  return Object.assign(git, {
    messages: () => [...messages],
    subjects: () => messages.map(message => message.split('\n')[0]!),
    minted: () => [...minted],
    lookups: () => [...lookups],
    bases: (operation: string) => [...(bases[operation] ?? [])],
    head: () => head,
    branch: () => branch,
    assertAnswered() {
      expect(failures).toEqual([]);
      expect(git.unexpected).toEqual([]);
      expect(index).toBe(answers.commits.length);
    },
  });
}

/** Fixture changes, written as a scenario states them. */
export const modified = (...paths: string[]): GitChange[] => paths.map(path => ({ status: 'M', path }));
export const added = (...paths: string[]): GitChange[] => paths.map(path => ({ status: 'A', path }));

/** A commit Git reports as accepted, with what it carried. */
export function accepted(subject: string, commit: string, changes: readonly GitChange[] = []): CommitResponse {
  return { subject, commit, changes };
}

/**
 * The harness's own commit of the run's feature files, "Scenarios of
 * <planId>", made once readiness has passed and before the first work item.
 * It adds every feature file, so Git reports a revision.
 */
export function scenariosCommitted(planId: string, commit = `scenarios-of-${planId}`, files: readonly string[] = []): CommitResponse {
  return accepted(`Scenarios of ${planId}`, commit, added(...files));
}

/**
 * The harness's own commit of a withdrawal, "Withdraw sc-001" or "Withdraw
 * sc-001, sc-002", which restores the pending tag in each file it names.
 */
export function withdrawn(scenarios: readonly string[], commit: string, files: readonly string[]): CommitResponse {
  return accepted(`Withdraw ${scenarios.join(', ')}`, commit, modified(...files));
}

/** A commit attempt Git reports as an unchanged tree. */
export function unchanged(subject: string): CommitResponse {
  return { subject, commit: null, changes: [] };
}
