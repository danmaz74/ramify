import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand, childEnvironment } from './run-command.js';
import type { CommandOutcome } from './run-command.js';

/*
 * Git, for the run branch. Each function is one thin call over `runCommand`:
 * no git logic lives here beyond naming the invocation and reading what it
 * printed. Git is an external system: lifecycle tests inject scripted
 * GitService responses. Real Git belongs in this wrapper's integration tests,
 * not in every test of a consumer.
 *
 * Committing gates make a run-branch commit before the audit executes; this
 * service owns that commit and the revision queries used by the audit and by
 * accepted-boundary accounting. It does not decide whether an audit passed.
 */

/**
 * Every branch the harness commits on is named for its run. The prefix is a
 * directory of refs of its own: a repository with a branch of that one name
 * could hold no run branch at all, and `ramify-agent-run` is no name a
 * project's own branch is likely to have.
 */
export const runBranchPrefix = 'ramify-agent-run/';

/**
 * The prefix of run branches created before `ramify-agent-run/`. A run that
 * recorded one is still resumed on it, and the harness still commits there.
 */
export const legacyRunBranchPrefix = 'ramify-agent/run-';

/** The branch of one run: `ramify-agent-run/<run-id>`. */
export function runBranchName(runId: string): string {
  return `${runBranchPrefix}${runId}`;
}

/** Whether a branch is a run's own, by the current prefix or the earlier one. */
export function isRunBranch(branch: string): boolean {
  return branch.startsWith(runBranchPrefix) || branch.startsWith(legacyRunBranchPrefix);
}

/** The identity the harness commits under, so that no person's configuration is needed. */
const harnessIdentity = { name: 'ramify-agent', email: 'ramify-agent@localhost' };

const gitTimeoutMs = 60_000;

/** A git invocation that did not answer. `outcome` is how the command ended. */
export class GitError extends Error {
  constructor(
    message: string,
    readonly detail: { readonly argv: readonly string[]; readonly outcome: CommandOutcome; readonly output: string },
  ) {
    super(message);
    this.name = 'GitError';
  }
}

interface GitRun {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function git(root: string, args: readonly string[], signal?: AbortSignal): Promise<GitRun> {
  const argv = ['git', ...args];
  const run = await runCommand({
    argv,
    cwd: root,
    env: childEnvironment({ GIT_TERMINAL_PROMPT: '0' }),
    timeoutMs: gitTimeoutMs,
    ...(signal === undefined ? {} : { signal }),
  });
  if (run.outcome.kind !== 'completed') {
    throw new GitError(`\`${argv.join(' ')}\` did not complete: ${run.outcome.kind}`, { argv, outcome: run.outcome, output: run.output.tail });
  }
  return { exitCode: run.outcome.exitCode, stdout: run.stdout, stderr: run.stderr };
}

/** The same, refusing any exit code but zero. */
async function gitOk(root: string, args: readonly string[], signal?: AbortSignal): Promise<GitRun> {
  const run = await git(root, args, signal);
  if (run.exitCode !== 0) {
    throw new GitError(`\`git ${args.join(' ')}\` exited with ${run.exitCode}`, {
      argv: ['git', ...args],
      outcome: { kind: 'completed', exitCode: run.exitCode },
      output: `${run.stdout}${run.stderr}`.trim().slice(-2000),
    });
  }
  return run;
}

/** Whether the repository has nothing to commit. A directory that is no repository is a `GitError`. */
export async function isCleanRepository(root: string, signal?: AbortSignal): Promise<boolean> {
  const run = await gitOk(root, ['status', '--porcelain', '--untracked-files=all'], signal);
  return run.stdout.trim() === '';
}

/**
 * The run's branch, `ramify-agent-run/<run-id>`, checked out. A run repeated
 * after a crash finds its branch and stays on it; the branch is never reset,
 * so the commits of the earlier attempt are kept. A run whose branch was
 * created under the earlier prefix, `ramify-agent/run-<run-id>`, is found
 * there. Git refusing the branch, as it refuses one beneath an existing
 * branch's name, is a `GitError` that carries git's own message.
 */
export async function createRunBranch(root: string, runId: string, signal?: AbortSignal): Promise<{ readonly branch: string; readonly created: boolean }> {
  for (const existing of [runBranchName(runId), `${legacyRunBranchPrefix}${runId}`]) {
    const found = await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${existing}`], signal);
    if (found.exitCode !== 0) continue;
    await gitOk(root, ['switch', existing], signal);
    return { branch: existing, created: false };
  }
  const branch = runBranchName(runId);
  await gitOk(root, ['switch', '--create', branch], signal);
  return { branch, created: true };
}

/**
 * Commit the whole working directory on the run branch before its audit.
 *
 * `--no-verify` and `--no-gpg-sign` with the harness's own identity mean that
 * neither the project's hooks nor the person's git configuration can fail a
 * commit the harness has decided to audit. A branch that is not a run
 * branch is refused: the harness commits nowhere else. Nothing to commit is
 * `null`, which is what a passing gate over an unchanged tree records.
 */
export async function commitAccepted(root: string, message: string, signal?: AbortSignal): Promise<string | null> {
  const head = await gitOk(root, ['rev-parse', '--abbrev-ref', 'HEAD'], signal);
  const branch = head.stdout.trim();
  if (!isRunBranch(branch)) {
    throw new GitError(`The harness commits only on a run branch; HEAD is ${branch === '' ? 'unnamed' : branch}`, {
      argv: ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
      outcome: { kind: 'completed', exitCode: 0 },
      output: branch,
    });
  }

  await gitOk(root, ['add', '--all'], signal);
  const staged = await git(root, ['diff', '--cached', '--quiet'], signal);
  if (staged.exitCode === 0) return null;
  if (staged.exitCode !== 1) {
    throw new GitError(`\`git diff --cached --quiet\` exited with ${staged.exitCode}`, {
      argv: ['git', 'diff', '--cached', '--quiet'],
      outcome: { kind: 'completed', exitCode: staged.exitCode },
      output: `${staged.stdout}${staged.stderr}`.trim().slice(-2000),
    });
  }

  await gitOk(root, [
    '-c', `user.name=${harnessIdentity.name}`,
    '-c', `user.email=${harnessIdentity.email}`,
    'commit', '--no-verify', '--no-gpg-sign', '--message', message,
  ], signal);
  const committed = await gitOk(root, ['rev-parse', 'HEAD'], signal);
  return committed.stdout.trim();
}

/** One exact trailer a recovered commit must carry. */
export interface CommitTrailer {
  readonly key: string;
  readonly value: string;
}

/**
 * The newest commit carrying every supplied trailer on that same commit, or
 * null. The grep narrows the history; the parsed trailer fields establish the
 * exact key/value conjunction rather than trusting message text.
 */
export async function findCommitByTrailers(
  root: string,
  trailers: readonly CommitTrailer[],
  signal?: AbortSignal,
): Promise<string | null> {
  if (trailers.length === 0) throw new Error('At least one commit trailer is required');
  for (const trailer of trailers) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/u.test(trailer.key)) throw new Error(`Invalid commit trailer key ${trailer.key}`);
    if (trailer.value === '' || /[\r\n\u001e\u001f]/u.test(trailer.value)) throw new Error(`Invalid value for commit trailer ${trailer.key}`);
  }

  const fieldSeparator = '\u001f';
  const valueSeparator = '\u001e';
  const format = [
    '%H',
    ...trailers.map(trailer => `%(trailers:key=${trailer.key},valueonly,separator=${valueSeparator})`),
  ].join(fieldSeparator);
  const run = await gitOk(root, [
    'log', `--format=${format}`, '--fixed-strings', '--all-match',
    ...trailers.map(trailer => `--grep=${trailer.key}: ${trailer.value}`),
  ], signal);
  for (const line of run.stdout.split('\n')) {
    const [commit, ...fields] = line.split(fieldSeparator);
    if (commit === undefined || fields.length !== trailers.length) continue;
    if (trailers.every((trailer, index) => fields[index]?.split(valueSeparator).some(value => value.trim() === trailer.value))) {
      return commit.trim();
    }
  }
  return null;
}

/** The newest commit carrying one exact trailer, retained for single-key callers. */
export async function findCommitByTrailer(root: string, key: string, value: string, signal?: AbortSignal): Promise<string | null> {
  return findCommitByTrailers(root, [{ key, value }], signal);
}

/**
 * Every path the working directory changed against the supplied accepted
 * boundary, tracked or not, with both names of a rename. This is the only
 * place the harness learns what changed.
 */
export async function changedPaths(root: string, base: string = 'HEAD', signal?: AbortSignal): Promise<string[]> {
  const changed = await gitOk(root, ['diff', '--name-only', '-z', '--no-renames', base], signal);
  const paths = changed.stdout.split('\0').filter(Boolean);
  const run = await gitOk(root, ['status', '--porcelain', '-z', '--untracked-files=all'], signal);
  const fields = run.stdout.split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry === undefined || entry === '') continue;
    const status = entry.slice(0, 2);
    if (status === '??') paths.push(entry.slice(3));
    if (status.startsWith('R') || status.startsWith('C')) {
      const original = fields[index + 1];
      index += 1;
      if (status === '??' && original !== undefined && original !== '') paths.push(original);
    }
  }
  return [...new Set(paths)].sort();
}

/**
 * Every changed path since the supplied accepted boundary, with `??` for a
 * path git has never seen and `A`, `M` or `D` for one Git can diff. It is how
 * the harness knows that an attempt may add or remove a module declaration.
 */
export async function changedEntries(
  root: string,
  base: string = 'HEAD',
  signal?: AbortSignal,
): Promise<Array<{ readonly status: string; readonly path: string }>> {
  const changed = await gitOk(root, ['diff', '--name-status', '-z', '--no-renames', base], signal);
  const entries = nameStatusEntries(changed.stdout);
  const run = await gitOk(root, ['status', '--porcelain', '-z', '--untracked-files=all'], signal);
  const fields = run.stdout.split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry === undefined || entry === '') continue;
    const status = entry.slice(0, 2);
    if (status === '??') entries.push({ status: status.trim(), path: entry.slice(3) });
    if (status.startsWith('R') || status.startsWith('C')) index += 1;
  }
  return entries;
}

/** What changed between two accepted revisions, without folding renames. */
export async function diffNameStatus(
  root: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<Array<{ readonly status: string; readonly path: string }>> {
  const run = await gitOk(root, ['diff', '--name-status', '-z', '--no-renames', from, to], signal);
  return nameStatusEntries(run.stdout);
}

function nameStatusEntries(output: string): Array<{ status: string; path: string }> {
  const fields = output.split('\0');
  const entries: Array<{ status: string; path: string }> = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if (status === undefined || status === '' || path === undefined || path === '') continue;
    entries.push({ status: status.trim(), path });
  }
  return entries;
}

/** The lines each path added and deleted between two commits, for the run's KPIs. */
export async function diffNumstat(
  root: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<Array<{ readonly path: string; readonly added: number; readonly deleted: number; readonly binary: boolean }>> {
  const run = await gitOk(root, ['diff', '--numstat', '-z', from, to], signal);
  const fields = run.stdout.split('\0');
  const changes: Array<{ path: string; added: number; deleted: number; binary: boolean }> = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry === undefined || entry === '') continue;
    const [added, deleted, inlinePath] = entry.split('\t');
    if (added === undefined || deleted === undefined) continue;
    let path = inlinePath ?? '';
    if (path === '') {
      // A rename: the old and the new name follow as their own fields.
      index += 1;
      path = fields[index + 1] ?? fields[index] ?? '';
      index += 1;
    }
    changes.push({ path, added: Number.parseInt(added, 10) || 0, deleted: Number.parseInt(deleted, 10) || 0, binary: added === '-' && deleted === '-' });
  }
  return changes;
}

/**
 * What one commit added, changed or deleted, as `git show --name-status`
 * reports it. The harness reads a created or removed module from this and
 * never from an agent's words.
 */
export async function commitNameStatus(
  root: string,
  commit: string,
  signal?: AbortSignal,
): Promise<Array<{ readonly status: string; readonly path: string }>> {
  const run = await gitOk(root, ['show', '--name-status', '--format=', '-z', '--no-renames', commit], signal);
  const fields = run.stdout.split('\0');
  const changes: Array<{ status: string; path: string }> = [];
  for (let index = 0; index < fields.length; index += 1) {
    const status = fields[index];
    if (status === undefined || status.trim() === '') continue;
    const path = fields[index + 1];
    if (path === undefined || path === '') continue;
    index += 1;
    changes.push({ status: status.trim(), path });
  }
  return changes;
}

/**
 * The lines the working directory has added and deleted against the supplied
 * accepted boundary:
 * `git diff --numstat` for what git tracks, and the lines of each untracked
 * file beside it, because a file git has never seen is work too. The index is
 * not touched.
 */
export async function worktreeLineChanges(
  root: string,
  base: string = 'HEAD',
  signal?: AbortSignal,
): Promise<Array<{ readonly path: string; readonly added: number; readonly deleted: number; readonly binary: boolean; readonly bytes: number | null }>> {
  const tracked = await gitOk(root, ['diff', '--numstat', '-z', base], signal);
  const changes = new Map<string, { path: string; added: number; deleted: number; binary: boolean; bytes: number | null }>();
  const fields = tracked.stdout.split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry === undefined || entry === '') continue;
    const [added, deleted, inlinePath] = entry.split('\t');
    if (added === undefined || deleted === undefined) continue;
    let path = inlinePath ?? '';
    if (path === '') {
      index += 1;
      path = fields[index + 1] ?? fields[index] ?? '';
      index += 1;
    }
    const binary = added === '-' && deleted === '-';
    changes.set(path, {
      path,
      added: Number.parseInt(added, 10) || 0,
      deleted: Number.parseInt(deleted, 10) || 0,
      binary,
      // git reports no line count for a binary file, so its size is the only
      // honest figure there is. A file that has been deleted has none.
      bytes: binary ? await fileBytes(join(root, path)) : null,
    });
  }

  const status = await gitOk(root, ['status', '--porcelain', '-z', '--untracked-files=all'], signal);
  for (const entry of status.stdout.split('\0')) {
    if (entry === undefined || !entry.startsWith('?? ')) continue;
    const path = entry.slice(3);
    if (path === '' || changes.has(path)) continue;
    changes.set(path, { path, ...(await fileLines(join(root, path))) });
  }
  return [...changes.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The lines one untracked file contributes, whether it is binary, and its size where it is. */
async function fileLines(path: string): Promise<{ added: number; deleted: number; binary: boolean; bytes: number | null }> {
  let content: Buffer;
  try {
    content = await readFile(path);
  } catch {
    return { added: 0, deleted: 0, binary: false, bytes: null };
  }
  if (content.subarray(0, 8000).includes(0)) return { added: 0, deleted: 0, binary: true, bytes: content.byteLength };
  const text = content.toString('utf8');
  if (text === '') return { added: 0, deleted: 0, binary: false, bytes: null };
  return {
    added: text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length,
    deleted: 0,
    binary: false,
    bytes: null,
  };
}

/** The size of a file the worktree still holds, or null when it no longer does. */
async function fileBytes(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

// A committed candidate, read from Git's objects rather than from a working
// directory. A later writer changing the tree, the index or the generated
// views cannot change what these answer, and nothing here follows a
// symbolic link: a link is an entry whose content is its target's name.

/** One entry of a commit's tree: a regular or executable file, a symbolic link, or a submodule. */
export interface TreeEntry {
  readonly path: string;
  readonly kind: 'file' | 'executable' | 'symlink' | 'submodule';
  /** The blob's size in bytes; null for a submodule. */
  readonly bytes: number | null;
}

/** One line a search matched in a commit. */
export interface TreeMatch {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

/** The tree a commit names. */
export async function commitTree(root: string, commit: string, signal?: AbortSignal): Promise<string> {
  const run = await gitOk(root, ['rev-parse', '--verify', `${commit}^{tree}`], signal);
  return run.stdout.trim();
}

/** Every entry of a commit's tree, recursively, in Git's order. */
export async function treeEntries(root: string, commit: string, signal?: AbortSignal): Promise<TreeEntry[]> {
  const run = await gitOk(root, ['ls-tree', '-r', '-z', '-l', '--full-tree', commit], signal);
  const entries: TreeEntry[] = [];
  for (const field of run.stdout.split('\0')) {
    if (field === '') continue;
    const tab = field.indexOf('\t');
    if (tab < 0) continue;
    const [mode, , , size] = field.slice(0, tab).split(/\s+/);
    const path = field.slice(tab + 1);
    const kind = mode === '120000' ? 'symlink' : mode === '160000' ? 'submodule' : mode === '100755' ? 'executable' : 'file';
    const bytes = Number.parseInt(size ?? '', 10);
    entries.push({ path, kind, bytes: Number.isNaN(bytes) ? null : bytes });
  }
  return entries;
}

/** The content of one blob of a commit, as text. The caller bounds its size from `treeEntries`. */
export async function readBlob(root: string, commit: string, path: string, signal?: AbortSignal): Promise<string> {
  const run = await gitOk(root, ['cat-file', 'blob', `${commit}:${path}`], signal);
  return run.stdout;
}

/**
 * The lines of a commit's text files that match an extended regular
 * expression, beneath `paths` or everywhere. No match is an empty answer,
 * not an error.
 */
export async function grepTree(root: string, commit: string, pattern: string, paths: readonly string[] = [], signal?: AbortSignal): Promise<TreeMatch[]> {
  const run = await git(root, ['grep', '-n', '--null', '-I', '--no-color', '-E', '-e', pattern, commit, '--', ...paths], signal);
  if (run.exitCode === 1) return [];
  if (run.exitCode !== 0) {
    throw new GitError(`\`git grep\` exited with ${run.exitCode}`, {
      argv: ['git', 'grep', pattern, commit], outcome: { kind: 'completed', exitCode: run.exitCode }, output: run.stderr.trim().slice(-2000),
    });
  }
  const prefix = `${commit}:`;
  const matches: TreeMatch[] = [];
  for (const line of run.stdout.split('\n')) {
    if (line === '') continue;
    const [name, number, ...text] = line.split('\0');
    if (name === undefined || number === undefined) continue;
    matches.push({ path: name.startsWith(prefix) ? name.slice(prefix.length) : name, line: Number.parseInt(number, 10), text: text.join('\0') });
  }
  return matches;
}

/** The unified diff between two commits, of one path or of all of them. */
export async function diffPatch(root: string, from: string, to: string, path?: string, signal?: AbortSignal): Promise<string> {
  const run = await gitOk(root, ['diff', '--no-color', '--no-renames', '--no-ext-diff', from, to, '--', ...(path === undefined ? [] : [path])], signal);
  return run.stdout;
}

/**
 * The read-only boundary a review snapshot is served from: one committed
 * candidate and its diff from a base, by Git's objects alone. Consumer tests
 * inject scripted answers, as they do for `GitService`.
 */
export interface CandidateSource {
  readonly commitTree: typeof commitTree;
  readonly treeEntries: typeof treeEntries;
  readonly readBlob: typeof readBlob;
  readonly grepTree: typeof grepTree;
  readonly diffNameStatus: typeof diffNameStatus;
  readonly diffPatch: typeof diffPatch;
}

/** The process-backed candidate source. */
export const gitCandidateSource: CandidateSource = { commitTree, treeEntries, readBlob, grepTree, diffNameStatus, diffPatch };

/**
 * The external Git boundary. Inject scripted answers in consumer tests;
 * never reproduce repository behavior in a test double. Each function keeps
 * the project's root explicit, just as the command adapter does.
 */
export interface GitService {
  readonly currentHead: typeof currentHead;
  readonly isCleanRepository: typeof isCleanRepository;
  readonly createRunBranch: typeof createRunBranch;
  readonly commitAccepted: typeof commitAccepted;
  readonly findCommitByTrailer: typeof findCommitByTrailer;
  readonly findCommitByTrailers: typeof findCommitByTrailers;
  readonly changedPaths: typeof changedPaths;
  readonly changedEntries: typeof changedEntries;
  readonly diffNameStatus: typeof diffNameStatus;
  readonly diffNumstat: typeof diffNumstat;
  readonly commitNameStatus: typeof commitNameStatus;
  readonly worktreeLineChanges: typeof worktreeLineChanges;
}

/** The process-backed adapter. Consumer tests should supply a scripted GitService. */
export const gitService: GitService = {
  currentHead, isCleanRepository, createRunBranch, commitAccepted,
  findCommitByTrailer, findCommitByTrailers, changedPaths, changedEntries,
  diffNameStatus, diffNumstat, commitNameStatus, worktreeLineChanges,
};

/** The commit the working directory is on, or '' where Git cannot say. */
export async function currentHead(projectRoot: string): Promise<string> {
  const run = await runCommand({ argv: ['git', 'rev-parse', 'HEAD'], cwd: projectRoot, env: childEnvironment(), timeoutMs: 30_000 });
  return run.outcome.kind === 'completed' && run.outcome.exitCode === 0 ? run.stdout.trim() : '';
}
