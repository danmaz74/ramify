import { expect } from 'vitest';
import type { CommitTrailer, GitService } from '../../../subs/evidence/src/git.js';
import type { CandidateTreePreview } from '../../../subs/evidence/src/candidate-tree.js';
import type { LineChange } from '../../kpi/lines.js';
import { mockGit, scriptedScratchGit, type ScratchGitScript } from './mock-git.js';

/*
 * Git, answered rather than run, for a scenario that crashes and restarts.
 *
 * Git is external, like the model behind an agent. Nothing here is a
 * repository: there is no tree, no history, no diff and no rule. A scenario
 * states, as fixture data, what each of its commits answers and what the
 * working directory holds against the accepted boundary at that point. The
 * ledger below records what the run asked and what it was told, so that a
 * test can state which commits the run made, which it found again after a
 * crash, and which operations it performed at all.
 *
 * One instance outlives the service that used it, because a crash and its
 * restarts are the same scenario. The scenario states in advance which gate
 * lookup finds a commit. Its generated run identifier is bound only when the
 * run creates its branch, and every later lookup and commit message must carry
 * that exact identifier. No answer is inferred from an earlier call.
 */

/** A path the working directory changed against the accepted boundary. */
export interface GitChange {
  readonly status: string;
  readonly path: string;
}

/** What one commit of the scenario answers, and what the tree holds when it is made. */
export interface CommitResponse {
  /** The revision the commit answers with; `null` is a tree with nothing to commit. */
  readonly commit: string | null;
  /** What the working directory holds against the accepted boundary until this commit is made. */
  readonly changes?: readonly GitChange[] | undefined;
  /**
   * The accepted boundary the run is expected to ask those answers against
   * while this commit is pending. An answer asked against any other revision
   * fails; the fixture never derives it from earlier commit calls.
   */
  readonly against: string;
}

/**
 * One commit a repeat of an attempt finds, under the exact identity the
 * lookup has to be asked for. A scenario states it at the boundary where its
 * crash left a commit behind; nothing here deduces that a commit exists.
 */
export interface RecoveredCommit {
  /** The gate, or `scenarios` for the commit that materialized the feature files. */
  readonly gate: string;
  /** Exact answers for successive lookups of this gate; `null` means not found. */
  readonly answers: readonly (string | null)[];
}

/** The canned answers of one scenario, in the order its commits are made. */
export interface GitResponses {
  readonly scratch?: ScratchGitScript | undefined;
  /** The revision the project is on before the run commits anything. */
  readonly head: string;
  /** Exact ordered candidate tree answers; omitted means no preview may be requested. */
  readonly previews?: readonly CandidateTreePreview[] | undefined;
  readonly commits: readonly CommitResponse[];
  /** The accepted boundary after the last supplied commit response is consumed. */
  readonly after?: string | undefined;
  /**
   * Commits a restart finds, stated by the exact gate trailer it asks for,
   * or by `scenarios` for a lookup of the materialization commit, which
   * carries the run's `Ramify-Scenarios` trailer instead of a gate's.
   */
  readonly recovered?: readonly RecoveredCommit[] | undefined;
  /**
   * The lines the working directory changed, where the scenario states them.
   * Where it does not, the measurement is explicitly unavailable, which is
   * what a scenario with no line KPI says.
   */
  readonly lines?: readonly LineChange[] | undefined;
}

/** One commit the run asked for, and the answer it was given. */
export interface CommitCall {
  /**
   * The gate the commit was made for, taken from the identity lookup that
   * precedes it, or `scenarios` for the commit that materialized the
   * feature files, which the message's own trailer names.
   */
  readonly gate: string | null;
  readonly commit: string | null;
}

export interface ScenarioGit extends GitService {
  /** Every commit the run asked for, in order, with what it was told. */
  commits(): readonly CommitCall[];
  /** The revisions the scenario's commits answered with, newest last. */
  accepted(): readonly string[];
  /** The gates whose commit was found again by its identity trailers, rather than made. */
  recovered(): readonly string[];
  head(): string;
  branch(): string | null;
  /** How many times each operation was asked. */
  operations(): Readonly<Record<string, number>>;
  /** The operations the scenario stated no answer for, each named where it was asked. */
  readonly unexpected: readonly string[];
  /**
   * Fails when the run asked something this scenario states no answer for,
   * or when one of its answers was asked for wrongly. The run records the
   * failure of some of these operations as an unavailable measurement rather
   * than raising it, so an expectation that failed inside one is kept here
   * and stated at the end of the test instead.
   */
  assertAnswered(): void;
  /** Also fails unless every commit response the scenario supplied was consumed once. */
  assertComplete(): void;
}

const runTrailer = 'Ramify-Run';
const gateTrailer = 'Ramify-Gate';
const scenariosTrailer = 'Ramify-Scenarios';
/** How a scenario names the materialization commit where it names a gate's. */
export const scenariosCommitName = 'scenarios';

/**
 * A scenario's Git, as answers. `responses.commits` is consumed in order:
 * each commit the run makes takes the next one, and a crashed run leaves the
 * rest for the restart that follows it.
 */
export function scenarioGit(root: string, responses: GitResponses): ScenarioGit {
  const scratch = scriptedScratchGit(root, responses.scratch);
  if (responses.commits.length > 0 && responses.after === undefined) {
    throw new Error('A recovery Git scenario with commit responses must state its final accepted boundary');
  }
  let head = responses.head;
  let branch: string | null = null;
  let cursor = 0;
  let previewCursor = 0;
  let lastGate: string | null = null;
  const made: CommitCall[] = [];
  const found: string[] = [];
  const lookupCursors = new Map<string, number>();
  const counts: Record<string, number> = {};
  const failures: string[] = [];

  function asked(operation: string, project: string): void {
    counts[operation] = (counts[operation] ?? 0) + 1;
    check(() => expect(project, `${operation} was asked about another project`).toBe(root));
  }
  /**
   * Keeps an expectation that failed, as well as raising it: the run records
   * the failure of some of these operations as an unavailable answer, and a
   * test's expectation must not be swallowed with it.
   */
  function check(assertion: () => void): void {
    try {
      assertion();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
  function unanswered(detail: string): never {
    failures.push(detail);
    throw new Error(detail);
  }
  /** What the scenario states the tree holds until its next commit is made. */
  function pending(): readonly GitChange[] {
    return responses.commits[cursor]?.changes ?? [];
  }
  // Only the operations a scenario answers are supplied: `mockGit` records
  // and throws for every other one, so an unstated boundary fails rather
  // than passing silently.
  const mock = mockGit({
    ...scratch.answers,
    async previewCandidateTree(project) {
      asked('previewCandidateTree', project);
      const answer = responses.previews?.[previewCursor];
      if (answer === undefined) unanswered(`Git was asked for tree preview ${previewCursor + 1}; this scenario states ${responses.previews?.length ?? 0}`);
      check(() => {
        expect(answer.repositoryRoot).toBe(root);
        expect(answer.head).toBe(head);
      });
      previewCursor += 1;
      return answer;
    },
    async currentHead(project) {
      asked('currentHead', project);
      return head;
    },
    async isCleanRepository(project) {
      asked('isCleanRepository', project);
      return true;
    },
    async createRunBranch(project, runId) {
      asked('createRunBranch', project);
      const name = `ramify-agent-run/${runId}`;
      const created = branch === null;
      branch = name;
      return { branch: name, created };
    },
    async findCommitByTrailers(project, trailers: readonly CommitTrailer[]) {
      asked('findCommitByTrailers', project);
      // The identity a repeat is asked for: this run, and one gate of it.
      // Both halves are matched, so a commit stated for one run or one gate
      // is never answered for another.
      // The materialization commit is looked up by the run and its own
      // trailer, and never beside a gate's.
      const scenarios = trailers[1]?.key === scenariosTrailer;
      check(() => {
        expect(trailers.map(trailer => trailer.key)).toEqual([runTrailer, scenarios ? scenariosTrailer : gateTrailer]);
        expect(trailers[1]!.value).toMatch(scenarios ? /^materialized$/u : /^ga-\d{4}$/u);
        expect(branch, 'a recovery lookup was made before the run branch was created').not.toBeNull();
        expect(trailers[0]!.value, 'the recovery lookup carried another run').toBe(branch!.slice('ramify-agent-run/'.length));
      });
      lastGate = scenarios ? scenariosCommitName : trailers[1]!.value;
      const stated = responses.recovered?.find(entry => entry.gate === lastGate);
      if (stated === undefined) return null;
      const lookup = lookupCursors.get(lastGate) ?? 0;
      lookupCursors.set(lastGate, lookup + 1);
      const answer = stated.answers[lookup];
      if (answer === undefined) unanswered(`Git was asked for lookup ${lookup + 1} of ${lastGate}; this scenario states ${stated.answers.length}`);
      if (answer === null) return null;
      found.push(stated.gate);
      return answer;
    },
    async commitAccepted(project, message) {
      asked('commitAccepted', project);
      const response = responses.commits[cursor];
      if (response === undefined) {
        unanswered(`Git was asked for commit ${cursor + 1}; this scenario states ${responses.commits.length}`);
      }
      // The message the harness wrote carries the identity the lookup just
      // asked for, so a commit and the repeat that finds it name one attempt.
      // The materialization commit is named by its own trailer. The live
      // attempt makes it without a lookup, since its intent was appended a
      // moment before; only a restart looks it up first.
      const scenarios = message.includes(`\n${scenariosTrailer}: materialized\n`);
      check(() => {
        expect(branch, 'a commit was made before the run branch was created').not.toBeNull();
        expect(message).toContain(`${runTrailer}: ${branch!.slice('ramify-agent-run/'.length)}`);
        if (scenarios) {
          expect(message.split('\n')[0]).toMatch(/^Scenarios of /u);
          expect(message).not.toContain(`${gateTrailer}:`);
        } else {
          expect(lastGate, 'a commit was made without first looking up its gate identity').not.toBeNull();
          expect(message).toContain(`${gateTrailer}: ${lastGate!}`);
        }
      });
      cursor += 1;
      made.push({ gate: scenarios ? scenariosCommitName : lastGate, commit: response.commit });
      if (response.commit !== null) head = response.commit;
      return response.commit;
    },
    async changedPaths(project, base = 'HEAD') {
      asked('changedPaths', project);
      check(() => expect(base, 'the accepted boundary the changed paths were asked against').toBe(responses.commits[cursor]?.against ?? responses.after ?? responses.head));
      return [...new Set(pending().map(change => change.path))].sort();
    },
    async changedEntries(project, base = 'HEAD') {
      asked('changedEntries', project);
      check(() => expect(base, 'the accepted boundary the changed entries were asked against').toBe(responses.commits[cursor]?.against ?? responses.after ?? responses.head));
      return pending().map(change => ({ status: change.status, path: change.path }));
    },
    async diffNameStatus(project, from, to) {
      asked('diffNameStatus', project);
      // A revision against itself names no change; that is what a checkpoint
      // asks when it accepted a tree it had nothing to commit for.
      if (from === to) return [];
      const index = responses.commits.findIndex(response => response.commit === to);
      if (index < 0) unanswered(`No changed entries are stated for ${to}`);
      check(() => expect(from, `the revision ${to} was asked against`).toBe(responses.commits[index]!.against));
      return responses.commits[index]!.changes?.map(change => ({ status: change.status, path: change.path })) ?? [];
    },
    async commitNameStatus(project, commit) {
      asked('commitNameStatus', project);
      const response = responses.commits.find(response => response.commit === commit);
      if (response === undefined) unanswered(`No commit entries are stated for ${commit}`);
      return response?.changes?.map(change => ({ ...change })) ?? [];
    },
    async worktreeLineChanges(project, base = 'HEAD') {
      asked('worktreeLineChanges', project);
      check(() => expect(base, 'the accepted boundary the line measurement was asked against').toBe(responses.commits[cursor]?.against ?? responses.after ?? responses.head));
      // A scenario that states no measurement leaves it unavailable, as a
      // repository that cannot answer does; the run records that, not a zero.
      if (responses.lines === undefined) throw new Error('This scenario states no line measurements');
      return responses.lines.map(entry => ({ ...entry }));
    },
    async worktreePatch(project) {
      asked('worktreePatch', project);
      throw new Error('This scenario states no patch');
    },
  });

  return Object.assign(mock, {
    commits: () => made as readonly CommitCall[],
    accepted: () => made.flatMap(call => call.commit ?? []),
    recovered: () => found as readonly string[],
    head: () => head,
    branch: () => branch,
    operations: () => ({ ...counts }),
    assertAnswered() {
      scratch.assertComplete();
      expect(failures, 'Git answers this scenario was asked for wrongly').toEqual([]);
      expect(mock.unexpected, 'Git operations this scenario states no answer for').toEqual([]);
    },
    assertComplete() {
      scratch.assertComplete();
      expect(failures, 'Git answers this scenario was asked for wrongly').toEqual([]);
      expect(mock.unexpected, 'Git operations this scenario states no answer for').toEqual([]);
      expect(cursor, 'stated commit responses consumed').toBe(responses.commits.length);
      expect(previewCursor, 'stated tree previews consumed').toBe(responses.previews?.length ?? 0);
    },
  }) as unknown as ScenarioGit;
}

/** Changed paths, as a scenario states them. */
export const changed = (status: string, ...paths: string[]): GitChange[] => paths.map(path => ({ status, path }));
export const modified = (...paths: string[]): GitChange[] => changed('M', ...paths);
export const added = (...paths: string[]): GitChange[] => changed('A', ...paths);
export const deleted = (...paths: string[]): GitChange[] => changed('D', ...paths);
/** A path Git has never seen, as the working directory reports it. */
export const untracked = (...paths: string[]): GitChange[] => changed('??', ...paths);
