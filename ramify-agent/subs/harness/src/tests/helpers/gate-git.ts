import { expect } from 'vitest';
import type { LineChange } from '../../kpi/lines.js';
import { mockGit } from './mock-git.js';

/*
 * The answers Git gives a committing lifecycle scenario.
 *
 * Git is an external system. Nothing here is a repository: there is no tree,
 * no diff and no history. A scenario states, in order, what Git answers each
 * time the run reaches a commit boundary — a new revision or `null` for a
 * tree Git reports as unchanged — and what changed entries it reports for
 * that attempt. Every answer is fixture data, and what the run then did with
 * those answers is what the assertions read, from the run's own records and
 * from the ledger of calls below.
 */

/** One changed entry, in the form `git diff --name-status` names it. */
export interface GitChange {
  readonly status: string;
  readonly path: string;
}

/** What Git answers for one attempt that reaches the commit boundary. */
export interface GateCommit {
  /** The revision `commitAccepted` answers, or `null` for an unchanged tree. */
  readonly commit: string | null;
  /**
   * What Git reports the working directory changed against the accepted
   * boundary the run asks about. That boundary is not always the revision
   * Git's HEAD is on: an attempt that committed and was not accepted leaves
   * the two apart, and a scenario states each answer for itself.
   */
  readonly changes?: readonly GitChange[] | undefined;
  /**
   * The accepted boundary the run is expected to ask those answers against
   * while this boundary is pending. Where a scenario states it, an answer
   * asked against any other revision fails.
   */
  readonly against?: string | undefined;
  /** The subject line the commit message is expected to carry. */
  readonly subject?: string | undefined;
}

/**
 * The commit that writes the run's feature files onto its branch, before
 * the first work item: "Scenarios of <planId>", made over the tree
 * readiness found, adding each feature file.
 */
export function scenariosCommit(planId: string, commit: string, against: string, files: readonly string[] = []): GateCommit {
  return { commit, against, subject: `Scenarios of ${planId}`, changes: files.map(path => ({ status: 'A', path })) };
}

/** One commit Git answers for an exact conjunction of identity trailers. */
export interface TrailedCommit {
  readonly trailers: ReadonlyArray<{ readonly key: string; readonly value: string }>;
  readonly commit: string;
}

export interface GateGitOptions {
  /** The revision the project is on before the run commits anything. */
  readonly head: string;
  /** The commit boundaries this scenario reaches, in order. */
  readonly commits: readonly GateCommit[];
  /**
   * What Git reports between two revisions the run asks about across more
   * than one boundary, such as an accepted boundary reached after a failing
   * attempt had already committed. Each boundary's own range is answered
   * from the table above; a wider one is stated here, never composed.
   */
  readonly diffs?: ReadonlyArray<{
    readonly from: string;
    readonly to: string;
    readonly changes: readonly GitChange[];
  }> | undefined;
  /**
   * The commits a recovery lookup finds, each under the exact trailers Git
   * would have to be asked for. A scenario whose repeat must find nothing
   * leaves the table out or states only commits under another identity.
   */
  readonly trailed?: readonly TrailedCommit[] | undefined;
  /** Whether readiness is told the working tree is clean. */
  readonly clean?: boolean | undefined;
  /**
   * The line measurements Git answers, or `'unavailable'` for a scenario
   * that supplies none: the wrapper then throws, as a repository that cannot
   * answer does, and the run records the metric unavailable rather than zero.
   */
  readonly lines?: readonly LineChange[] | 'unavailable' | undefined;
}

/** One call the run made at this boundary, in the order it made them. */
export interface GitCall {
  readonly operation: string;
  readonly detail: string;
}

export interface GateGit {
  readonly git: ReturnType<typeof mockGit>;
  /** Every call the run made, and every mark the scenario put between them. */
  readonly calls: readonly GitCall[];
  /** The whole message of each commit the run asked for, in order. */
  readonly messages: readonly string[];
  /** The trailer pairs each recovery lookup asked for, in order. */
  readonly lookups: ReadonlyArray<readonly { key: string; value: string }[]>;
  /** The revisions Git answered, skipping the unchanged boundaries. */
  revisions(): readonly string[];
  /** The branch the run asked Git to check out, or null where it asked for none. */
  branch(): string | null;
  /** The revision Git now answers for `currentHead`. */
  head(): string;
  /** Puts a named point of the scenario into the call ledger. */
  mark(name: string): void;
  /** States that every scripted boundary was reached and nothing unscripted was asked. */
  assertComplete(): void;
}

/**
 * A `GitService` of canned answers for one run.
 *
 * Only the operations a scenario states are answered: `mockGit` records and
 * throws for every other one, so an unstated boundary is a failure rather
 * than a silent success.
 */
export function gateGit(root: string, options: GateGitOptions): GateGit {
  const calls: GitCall[] = [];
  const messages: string[] = [];
  const lookups: Array<readonly { key: string; value: string }[]> = [];
  const failures: string[] = [];
  // The revision each committing boundary moved from and to, so that a later
  // `diff` between two revisions is answered from the entry that minted them
  // rather than computed.
  const ranges = new Map<string, readonly GitChange[]>();
  const minted: string[] = [];
  let head = options.head;
  let branch: string | null = null;
  let gate: string | null = null;
  let cursor = 0;
  for (const range of options.diffs ?? []) ranges.set(`${range.from}..${range.to}`, range.changes);

  function record(operation: string, detail = ''): void {
    calls.push({ operation, detail });
  }

  function fail(message: string): never {
    failures.push(message);
    throw new Error(message);
  }

  /** The boundary the run is working towards, whose changes stand in the working directory. */
  function pending(): GateCommit | undefined {
    return options.commits[cursor];
  }

  /**
   * The accepted boundary this scenario states the run asks against, which
   * is not always the revision Git's HEAD is on.
   */
  function expectAgainst(base: string): void {
    const against = pending()?.against;
    if (against !== undefined) expect(base).toBe(against);
  }

  function advance(entry: GateCommit, to: string | null): void {
    cursor += 1;
    if (to === null) return;
    ranges.set(`${head}..${to}`, entry.changes ?? []);
    minted.push(to);
    head = to;
  }

  const git = mockGit({
    async currentHead(project) {
      expect(project).toBe(root);
      record('currentHead', head);
      return head;
    },
    async isCleanRepository(project) {
      expect(project).toBe(root);
      record('isCleanRepository');
      return options.clean ?? true;
    },
    async createRunBranch(project, runId) {
      expect(project).toBe(root);
      branch = `ramify-agent-run/${runId}`;
      record('createRunBranch', branch);
      return { branch, created: true };
    },
    async findCommitByTrailers(project, trailers) {
      expect(project).toBe(root);
      const asked = trailers.map(trailer => ({ key: trailer.key, value: trailer.value }));
      lookups.push(asked);
      // The identity a repeat is asked for: this run, and one gate of it.
      expect(asked.map(trailer => trailer.key)).toEqual(['Ramify-Run', 'Ramify-Gate']);
      if (branch !== null) expect(asked[0]!.value).toBe(branch.slice('ramify-agent-run/'.length));
      expect(asked[1]!.value).toMatch(/^ga-\d{4}$/u);
      gate = asked[1]!.value;
      const entry = pending();
      const recovered = (options.trailed ?? []).find(known =>
        known.trailers.length === asked.length
        && known.trailers.every((trailer, index) => trailer.key === asked[index]?.key && trailer.value === asked[index]?.value))?.commit ?? null;
      record('findCommitByTrailers', recovered ?? 'none');
      // A repeat that finds its earlier commit makes no second one, so this
      // boundary is spent here rather than at `commitAccepted`.
      if (entry !== undefined && recovered !== null) advance(entry, recovered);
      return recovered;
    },
    async commitAccepted(project, message) {
      expect(project).toBe(root);
      const entry = pending();
      if (entry === undefined) {
        fail(`Git was asked for commit ${cursor + 1}; this scenario scripts ${options.commits.length}`);
      }
      messages.push(message);
      // The message the harness wrote carries the identity the lookup just
      // asked for, so a commit and its recovery name the same attempt.
      if (branch !== null) expect(message).toContain(`Ramify-Run: ${branch.slice('ramify-agent-run/'.length)}`);
      // A scenario commit of the harness's own is made without a lookup and names no gate.
      if (message.includes('\nRamify-Scenarios: ')) gate = null;
      if (gate !== null) expect(message).toContain(`Ramify-Gate: ${gate}`);
      if (entry.subject !== undefined) expect(message.split('\n')[0]).toContain(entry.subject);
      record('commitAccepted', entry.commit ?? 'unchanged');
      advance(entry, entry.commit);
      return entry.commit;
    },
    async changedPaths(project, base = 'HEAD') {
      expect(project).toBe(root);
      expectAgainst(base);
      record('changedPaths', base);
      return (pending()?.changes ?? []).map(change => change.path);
    },
    async changedEntries(project, base = 'HEAD') {
      expect(project).toBe(root);
      expectAgainst(base);
      record('changedEntries', base);
      return [...(pending()?.changes ?? [])];
    },
    async diffNameStatus(project, from, to) {
      expect(project).toBe(root);
      record('diffNameStatus', `${from}..${to}`);
      if (from === to) return [];
      const changes = ranges.get(`${from}..${to}`);
      if (changes === undefined) fail(`No changed entries are scripted between ${from} and ${to}`);
      return [...changes];
    },
    async worktreeLineChanges(project, base = 'HEAD') {
      expect(project).toBe(root);
      expectAgainst(base);
      record('worktreeLineChanges', base);
      if (options.lines === undefined || options.lines === 'unavailable') {
        throw new Error('This scenario states no line measurements');
      }
      return [...options.lines];
    },
  });

  return {
    git,
    calls,
    messages,
    lookups,
    revisions: () => [...minted],
    branch: () => branch,
    head: () => head,
    mark: name => record('mark', name),
    assertComplete() {
      expect(failures).toEqual([]);
      expect(git.unexpected).toEqual([]);
      expect(`${cursor} of ${options.commits.length} commit boundaries`).toBe(`${options.commits.length} of ${options.commits.length} commit boundaries`);
    },
  };
}

/** The operations one scenario asked for, once each, in alphabetical order. */
export function operationsOf(gate: GateGit): string[] {
  return [...new Set(gate.calls.map(call => call.operation).filter(operation => operation !== 'mark'))].sort();
}
