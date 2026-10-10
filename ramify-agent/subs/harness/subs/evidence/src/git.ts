import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runCommand, childEnvironment } from './run-command.js';
import type { CommandOutcome } from './run-command.js';
import type { previewCandidateTree } from './candidate-tree.js';

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

/** The branch of one run: `ramify-agent-run/<run-id>`. */
export function runBranchName(runId: string): string {
  return `${runBranchPrefix}${runId}`;
}

/** Whether a branch is a run's own. */
export function isRunBranch(branch: string): boolean {
  return branch.startsWith(runBranchPrefix);
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

async function git(root: string, args: readonly string[], signal?: AbortSignal, stdin?: string): Promise<GitRun> {
  const argv = ['git', ...args];
  const run = await runCommand({
    argv,
    cwd: root,
    env: childEnvironment({ GIT_TERMINAL_PROMPT: '0' }),
    timeoutMs: gitTimeoutMs,
    ...(stdin === undefined ? {} : { stdin }),
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

/** Paths in Git's index beneath the supplied project-relative directories, including unchanged files. */
export async function trackedPaths(root: string, directories: readonly string[], signal?: AbortSignal): Promise<string[]> {
  if (directories.length === 0) return [];
  const paths = directories.map(directory => {
    validateProjectPath(directory);
    return directory.endsWith('/') ? directory : `${directory}/`;
  });
  const run = await gitOk(root, ['--literal-pathspecs', 'ls-files', '--cached', '-z', '--', ...paths], signal);
  return [...new Set(run.stdout.split('\0').filter(Boolean))].sort();
}

/** Git's deciding ignore rule, including a negating rule when it makes a path unignored. */
export interface IgnoreRule {
  readonly source: string;
  readonly line: number;
  readonly pattern: string;
}

/** One exact project-relative path and Git's answer about its ignore status. */
export interface IgnoreStatus {
  readonly path: string;
  readonly ignored: boolean;
  readonly rule: IgnoreRule | null;
}

/** Ask Git about paths as directories, even when a directory has not been created yet. */
export async function ignoreStatus(root: string, paths: readonly string[], signal?: AbortSignal): Promise<IgnoreStatus[]> {
  for (const path of paths) validateProjectPath(path);
  const primary = await decidingIgnoreRules(root, paths, signal);
  const answers: IgnoreStatus[] = [];
  for (const [index, path] of paths.entries()) {
    let rule = primary[index] ?? null;
    // Git describes a negated directory pattern on the path without its
    // trailing slash, although the slash is needed to check an absent directory.
    if (rule === null && path.endsWith('/')) {
      const bare = path.slice(0, -1);
      rule = await decidingIgnoreRule(root, bare, signal);
      if (rule === null) {
        const isolated = await absentDirectoryRule(root, bare, signal);
        // The real worktree alone decides ignored status. The isolated view
        // can only identify a negation behind an actual nonmatch.
        if (isolated?.pattern.startsWith('!')) rule = isolated;
      }
    }
    answers.push({ path, ignored: rule !== null && !rule.pattern.startsWith('!'), rule });
  }
  return answers;
}

/**
 * Git cannot name a negating directory rule while that directory is absent.
 * Recreate only the ancestor ignore files and an empty directory in an
 * isolated worktree view, keeping the real worktree untouched. Git still uses
 * the repository's own info/exclude and configured global rules.
 */
async function absentDirectoryRule(root: string, path: string, signal?: AbortSignal): Promise<IgnoreRule | null> {
  try {
    if ((await lstat(join(root, path))).isDirectory()) return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const gitDir = (await gitOk(root, ['rev-parse', '--absolute-git-dir'], signal)).stdout.trim();
  const topLevel = (await gitOk(root, ['rev-parse', '--show-toplevel'], signal)).stdout.trim();
  const prefix = (await gitOk(root, ['rev-parse', '--show-prefix'], signal)).stdout.trim();
  const fullPath = join(prefix, path);
  const worktree = await mkdtemp(join(tmpdir(), 'ramify-ignore-'));
  try {
    const components = fullPath.split('/');
    let ancestor = '';
    for (const component of components) {
      const source = join(topLevel, ancestor, '.gitignore');
      const info = await lstat(source).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      });
      if (info?.isFile()) {
        const destination = join(worktree, ancestor, '.gitignore');
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(source, destination);
      }
      ancestor = join(ancestor, component);
    }
    await mkdir(join(worktree, fullPath), { recursive: true });
    return await decidingIgnoreRule(join(worktree, prefix), path, signal, [`--git-dir=${gitDir}`, `--work-tree=${worktree}`]);
  } finally {
    await rm(worktree, { recursive: true, force: true });
  }
}

async function decidingIgnoreRule(root: string, path: string, signal?: AbortSignal, prefix: readonly string[] = []): Promise<IgnoreRule | null> {
  return (await decidingIgnoreRules(root, [path], signal, prefix))[0] ?? null;
}

/** One NUL-delimited Git query keeps paths, spaces and response order exact. */
async function decidingIgnoreRules(root: string, paths: readonly string[], signal?: AbortSignal, prefix: readonly string[] = []): Promise<Array<IgnoreRule | null>> {
  if (paths.length === 0) return [];
  const args = ['check-ignore', '--no-index', '--verbose', '--non-matching', '-z', '--stdin'];
  const run = await git(root, [...prefix, ...args], signal, `${paths.join('\0')}\0`);
  if (run.exitCode !== 0 && run.exitCode !== 1) {
    throw new GitError(`\`git check-ignore\` exited with ${run.exitCode}: ${run.stderr.trim()}`, {
      argv: ['git', ...prefix, ...args],
      outcome: { kind: 'completed', exitCode: run.exitCode },
      output: `${run.stdout}${run.stderr}`.trim().slice(-2000),
    });
  }
  const fields = run.stdout.split('\0');
  if (fields.length !== paths.length * 4 + 1 || fields.at(-1) !== '') {
    throw new Error(`Git gave ${fields.length - 1} ignore fields for ${paths.length} paths`);
  }
  return paths.map((path, index) => {
    const [source, line, pattern, answeredPath] = fields.slice(index * 4, index * 4 + 4);
    if (answeredPath !== path) throw new Error(`Git gave an ignore answer for ${answeredPath ?? '<missing>'} instead of ${path}`);
    if (source === '' && line === '' && pattern === '') return null;
    const number = Number.parseInt(line!, 10);
    if (!Number.isInteger(number) || number < 1) throw new Error(`Git gave an invalid ignore rule line for ${path}`);
    return { source: source!, line: number, pattern: pattern! };
  });
}

function validateProjectPath(path: string): void {
  if (path === '' || path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part === '..' || part === '.')) {
    throw new Error(`Git path must be project-relative without parent traversal: ${path}`);
  }
}

/**
 * The run's branch, `ramify-agent-run/<run-id>`, checked out. A run repeated
 * after a crash finds its branch and stays on it; the branch is never reset,
 * so the commits of the earlier attempt are kept. Git refusing the branch,
 * as it refuses one beneath an existing branch's name, is a `GitError` that
 * carries git's own message.
 */
export async function createRunBranch(root: string, runId: string, signal?: AbortSignal): Promise<{ readonly branch: string; readonly created: boolean }> {
  const branch = runBranchName(runId);
  const found = await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], signal);
  if (found.exitCode === 0) {
    await gitOk(root, ['switch', branch], signal);
    return { branch, created: false };
  }
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

  // The project's tree alone, as `previewCandidateTree` previews it: without
  // a pathspec, `git add --all` would stage the whole repository, which a
  // nested project shares with files no rule of the gate has seen.
  await gitOk(root, ['add', '--all', '--', '.'], signal);
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
 * boundary, tracked or not, with both names of a rename, as the project names
 * them: a nested project's paths lose the repository prefix, and a change
 * outside the project is not its change. This is the only place the harness
 * learns what changed.
 */
export async function changedPaths(root: string, base: string = 'HEAD', signal?: AbortSignal): Promise<string[]> {
  const prefix = await projectPrefix(root, signal);
  const changed = await gitOk(root, ['diff', '--name-only', '-z', '--no-renames', '--relative', base], signal);
  const paths = changed.stdout.split('\0').filter(Boolean);
  const run = await gitOk(root, ['status', '--porcelain', '-z', '--untracked-files=all'], signal);
  const fields = run.stdout.split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry === undefined || entry === '') continue;
    const status = entry.slice(0, 2);
    if (status === '??') {
      const path = projectPath(prefix, entry.slice(3));
      if (path !== null) paths.push(path);
    }
    if (status.startsWith('R') || status.startsWith('C')) index += 1;
  }
  return [...new Set(paths)].sort();
}

/**
 * The project's directory within the repository, as `git rev-parse
 * --show-prefix` names it: empty at the repository root, `nested/project/`
 * beneath it. Only the command's terminating newline is removed; spaces and
 * newlines can belong to directory names.
 */
async function projectPrefix(root: string, signal?: AbortSignal): Promise<string> {
  const shown = (await gitOk(root, ['rev-parse', '--show-prefix'], signal)).stdout;
  return shown.endsWith('\n') ? shown.slice(0, -1) : shown;
}

/**
 * A status path, which Git gives relative to the repository root, as the
 * project names it, or null for a file outside the project: that change is
 * not the project's.
 */
function projectPath(prefix: string, repositoryPath: string): string | null {
  if (!repositoryPath.startsWith(prefix)) return null;
  const path = repositoryPath.slice(prefix.length);
  return path === '' ? null : path;
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
  const prefix = await projectPrefix(root, signal);
  const changed = await gitOk(root, ['diff', '--name-status', '-z', '--no-renames', '--relative', base], signal);
  const entries = nameStatusEntries(changed.stdout);
  const run = await gitOk(root, ['status', '--porcelain', '-z', '--untracked-files=all'], signal);
  const fields = run.stdout.split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry === undefined || entry === '') continue;
    const status = entry.slice(0, 2);
    if (status === '??') {
      const path = projectPath(prefix, entry.slice(3));
      if (path !== null) entries.push({ status: status.trim(), path });
    }
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
  const run = await gitOk(root, ['diff', '--name-status', '-z', '--no-renames', '--relative', from, to], signal);
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
  const run = await gitOk(root, ['diff', '--numstat', '-z', '--relative', from, to], signal);
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
  options?: { readonly requireSingleParent?: boolean },
): Promise<Array<{ readonly status: string; readonly path: string }>> {
  if (options?.requireSingleParent === true) {
    const ancestry = await gitOk(root, ['rev-list', '--parents', '--max-count=1', commit], signal);
    if (ancestry.stdout.trim().split(/\s+/u).length !== 2) throw new Error(`Commit ${commit} is not a single-parent producer commit`);
  }
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
 *
 * The paths are the project's own, relative to its root, as `changedFiles`
 * reports them: `--relative` keeps the diff to a nested project's files,
 * and the status paths, which Git always gives relative to the repository
 * root, lose the project's prefix; a file outside the project is not its
 * change.
 */
export async function worktreeLineChanges(
  root: string,
  base: string = 'HEAD',
  signal?: AbortSignal,
): Promise<Array<{ readonly path: string; readonly added: number; readonly deleted: number; readonly binary: boolean; readonly bytes: number | null }>> {
  const prefix = await projectPrefix(root, signal);
  const tracked = await gitOk(root, ['diff', '--relative', '--numstat', '-z', base], signal);
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
    const path = projectPath(prefix, entry.slice(3));
    if (path === null || changes.has(path)) continue;
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
  /** The exact full Git blob object ID, when valid metadata supplies it; absent for submodules or unknown proof. */
  readonly objectId?: string;
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

/**
 * Every entry of a commit's tree beneath the project, recursively, in Git's
 * order, named as the project names it: a nested project's entries lose the
 * repository prefix, and the rest of the repository is not listed.
 */
export async function treeEntries(root: string, commit: string, signal?: AbortSignal): Promise<TreeEntry[]> {
  const run = await gitOk(root, ['ls-tree', '-r', '-z', '-l', commit], signal);
  return parseTreeEntries(run.stdout);
}

/** Decode the existing NUL-delimited ls-tree response without additional Git requests. */
export function parseTreeEntries(output: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  const fields = output.split('\0');
  for (const [index, field] of fields.entries()) {
    if (field === '') continue;
    const tab = field.indexOf('\t');
    if (tab < 0) continue;
    const metadata = field.slice(0, tab).split(/\s+/);
    const [mode, type, objectId, size] = metadata;
    const path = field.slice(tab + 1);
    const kind = mode === '120000' ? 'symlink' : mode === '160000' ? 'submodule' : mode === '100755' ? 'executable' : 'file';
    const bytes = Number.parseInt(size ?? '', 10);
    const validBlob = metadata.length === 4 && type === 'blob'
      && (mode === '100644' || mode === '100755' || mode === '120000')
      && objectId !== undefined && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(objectId) && /[1-9a-f]/u.test(objectId)
      && size !== undefined && /^(?:0|[1-9][0-9]*)$/u.test(size) && Number.isSafeInteger(bytes)
      && index < fields.length - 1 && path !== '';
    entries.push({ path, kind, bytes: Number.isNaN(bytes) ? null : bytes, ...(validBlob ? { objectId } : {}) });
  }
  return entries;
}

/**
 * The content of one blob of a commit, as text, by the project's name for the
 * path. The caller bounds its size from `treeEntries`.
 */
export async function readBlob(root: string, commit: string, path: string, signal?: AbortSignal): Promise<string> {
  // `<commit>:./<path>` names the path from the project's directory, where
  // `<commit>:<path>` would name it from the repository's root.
  const run = await gitOk(root, ['cat-file', 'blob', `${commit}:./${path}`], signal);
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
  // Run from the project's directory, `git grep` searches that directory alone
  // and names each match `<commit>:<path>` relative to it, which is the project's name.
  const revision = `${commit}:`;
  const matches: TreeMatch[] = [];
  for (const line of run.stdout.split('\n')) {
    if (line === '') continue;
    const [name, number, ...text] = line.split('\0');
    if (name === undefined || number === undefined) continue;
    const path = name.startsWith(revision) ? name.slice(revision.length) : name;
    matches.push({ path, line: Number.parseInt(number, 10), text: text.join('\0') });
  }
  return matches;
}

/** The unified diff between two commits, of one path or of all of them. */
export async function diffPatch(root: string, from: string, to: string, path?: string, signal?: AbortSignal): Promise<string> {
  const run = await gitOk(root, ['--literal-pathspecs', 'diff', '--no-color', '--no-renames', '--no-ext-diff', '--relative', from, to, '--', ...(path === undefined ? [] : [path])], signal);
  return run.stdout;
}

/**
 * The patch of the working tree's tracked changes against `base`, as
 * `git diff` prints it: what an engineer's uncommitted work changed in files
 * Git already tracks. A file it created is not in it; `worktreeLineChanges`
 * names those.
 */
export async function worktreePatch(root: string, base: string = 'HEAD', signal?: AbortSignal): Promise<string> {
  const run = await gitOk(root, ['diff', '--no-color', '--no-renames', '--no-ext-diff', '--relative', base, '--'], signal);
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

// The history a run's delivered change is attributed from: which commit
// introduced each line the run added and which removed each line it
// deleted. These read Git's objects only, so a later working tree cannot
// change what they answer.

/** A run of consecutive line numbers: its first line and how many lines follow from it. */
export type LineRange = readonly [start: number, count: number];

/** One path the diff between two commits changed, with renames detected. */
export interface ChangedFile {
  /** The path at the earlier commit; null for a file it did not have. */
  readonly before: string | null;
  /** The path at the later commit; null for a file it no longer has. */
  readonly after: string | null;
  /** Git reports no lines for a binary file. */
  readonly binary: boolean;
  /** Lines of `after` that are not in `before`. */
  readonly added: readonly LineRange[];
  /** Lines of `before` that are not in `after`. */
  readonly deleted: readonly LineRange[];
}

/** One line of a file and the commit Git names for it. */
export interface LineCommit {
  readonly line: number;
  readonly commit: string;
  /** Whether the line is the earlier commit's own, older than the range. */
  readonly boundary: boolean;
  /** Git porcelain original/source position at `commit`, not the requested line position. Missing in older scripted answers. */
  readonly sourceLine?: number;
  /** Decoded Git porcelain filename relative to the repository root, possibly outside the supplied project. */
  readonly sourcePath?: string;
  /** Verified project cwd prefix relative to its repository root, with trailing slash; empty at that root. */
  readonly projectPrefix?: string;
}

/** The read-only history boundary of delivered-change attribution. Consumer tests script it. */
export interface ChangeHistory {
  /** The commits after `from` up to and including `to`, oldest first, along the first-parent chain. */
  readonly commitsBetween: (root: string, from: string, to: string, signal?: AbortSignal) => Promise<string[]>;
  /** What the direct diff between the two commits added and deleted, per path, with renames detected. */
  readonly changedFiles: (root: string, from: string, to: string, signal?: AbortSignal) => Promise<ChangedFile[]>;
  /** For lines of `path` at `to`, the commit after `from` that introduced each; a boundary line is older. */
  readonly lineOrigins: (root: string, from: string, to: string, path: string, lines: readonly LineRange[], signal?: AbortSignal) => Promise<LineCommit[]>;
  /** For lines of `path` at `from`, the last commit up to `to` that still held each. */
  readonly lineLastSeen: (root: string, from: string, to: string, path: string, lines: readonly LineRange[], signal?: AbortSignal) => Promise<LineCommit[]>;
}

export async function commitsBetween(root: string, from: string, to: string, signal?: AbortSignal): Promise<string[]> {
  const run = await gitOk(root, ['rev-list', '--first-parent', '--reverse', `${from}..${to}`], signal);
  return run.stdout.split('\n').map(line => line.trim()).filter(line => line !== '');
}

/**
 * The paths are the project's own, relative to its root: `--relative` keeps
 * a project inside a larger repository to its own files, and blame resolves
 * them from the same directory.
 */
export async function changedFiles(root: string, from: string, to: string, signal?: AbortSignal): Promise<ChangedFile[]> {
  const statuses = await gitOk(root, ['diff', '--relative', '--name-status', '-z', '-M', from, to], signal);
  const numstat = await gitOk(root, ['diff', '--relative', '--numstat', '-z', '-M', from, to], signal);
  const binary = new Set<string>();
  const counts = numstat.stdout.split('\0');
  for (let index = 0; index < counts.length; index += 1) {
    const entry = counts[index];
    if (entry === undefined || entry === '') continue;
    const [added, deleted, inline] = entry.split('\t');
    if (added === undefined || deleted === undefined) continue;
    let path = inline ?? '';
    // A rename: its old and new names follow as fields of their own.
    if (path === '') { path = counts[index + 2] ?? ''; index += 2; }
    if (added === '-' && deleted === '-') binary.add(path);
  }
  const files: ChangedFile[] = [];
  const fields = statuses.stdout.split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const status = fields[index];
    if (status === undefined || status === '') continue;
    const renamed = /^[RC]/u.test(status);
    const first = fields[index + 1] ?? '';
    const second = renamed ? fields[index + 2] ?? '' : first;
    index += renamed ? 2 : 1;
    const before = status.startsWith('A') ? null : first;
    const after = status.startsWith('D') ? null : second;
    const isBinary = binary.has(after ?? before ?? '');
    if (isBinary) { files.push({ before, after, binary: true, added: [], deleted: [] }); continue; }
    const paths = [...new Set([before, after].filter((path): path is string => path !== null))];
    const patch = await gitOk(root, ['--literal-pathspecs', 'diff', '--relative', '-U0', '--no-color', '--no-ext-diff', '-M', from, to, '--', ...paths], signal);
    const added: LineRange[] = [];
    const deleted: LineRange[] = [];
    for (const line of patch.stdout.split('\n')) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(line);
      if (hunk === null) continue;
      const deletedCount = hunk[2] === undefined ? 1 : Number.parseInt(hunk[2], 10);
      const addedCount = hunk[4] === undefined ? 1 : Number.parseInt(hunk[4], 10);
      if (deletedCount > 0) deleted.push([Number.parseInt(hunk[1]!, 10), deletedCount]);
      if (addedCount > 0) added.push([Number.parseInt(hunk[3]!, 10), addedCount]);
    }
    files.push({ before, after, binary: false, added, deleted });
  }
  return files;
}

/** Decode Git's C-quoted pathname bytes, retaining unavailable proof on malformed output. */
function blameFilename(value: string): string | undefined {
  let path = value;
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2) return undefined;
    const bytes: number[] = [];
    const escaped: Readonly<Record<string, number>> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '\\': 92, '"': 34 };
    const body = value.slice(1, -1);
    for (let index = 0; index < body.length; index += 1) {
      const character = body[index]!;
      if (character === '"') return undefined;
      if (character !== '\\') {
        const code = body.codePointAt(index)!;
        bytes.push(...Buffer.from(String.fromCodePoint(code), 'utf8'));
        if (code > 0xffff) index += 1;
        continue;
      }
      const escape = body[++index];
      if (escape === undefined) return undefined;
      if (/[0-7]/u.test(escape)) {
        const octal = body.slice(index, index + 3);
        if (!/^[0-7]{3}$/u.test(octal)) return undefined;
        const byte = Number.parseInt(octal, 8);
        if (byte > 255) return undefined;
        bytes.push(byte);
        index += 2;
      } else {
        const byte = escaped[escape];
        if (byte === undefined) return undefined;
        bytes.push(byte);
      }
    }
    try { path = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)); }
    catch { return undefined; }
  }
  // Git paths are repository-relative. A malformed/undecodable path is not an ownership fact.
  if (path === '' || path.startsWith('/') || path.includes('\0') || path.split('/').some(part => part === '' || part === '.' || part === '..')) return undefined;
  return path;
}

/**
 * Parse exact line porcelain without launching a process. Source paths stay repository-relative;
 * the optional prefix must come from a separately verified `git rev-parse --show-prefix`.
 * Missing/malformed source metadata stays absent rather than guessed from the requested path.
 * In reverse blame, sourceLine/sourcePath name the position/path at the last-seen commit.
 */
export function parseBlamePorcelain(text: string, projectPrefix?: string): LineCommit[] {
  const answers: LineCommit[] = [];
  let current: { line: number; commit: string; boundary: boolean; sourceLine: number; sourcePath?: string; projectPrefix?: string } | null = null;
  let filenameSeen = false;
  for (const line of text.split('\n')) {
    const header = /^([0-9a-f]{40}|[0-9a-f]{64}) ([1-9]\d*) ([1-9]\d*)(?: ([1-9]\d*))?$/u.exec(line);
    if (header !== null) {
      const sourceLine = Number(header[2]);
      const requestedLine = Number(header[3]);
      current = Number.isSafeInteger(sourceLine) && Number.isSafeInteger(requestedLine)
        ? { commit: header[1]!, line: requestedLine, sourceLine, boundary: false, ...(projectPrefix === undefined ? {} : { projectPrefix }) }
        : null;
      filenameSeen = false;
      continue;
    }
    if (/^[0-9a-f]{40,64} /u.test(line)) { current = null; continue; }
    if (current === null) continue;
    if (line === 'boundary') current.boundary = true;
    else if (line.startsWith('filename ')) {
      const path = blameFilename(line.slice('filename '.length));
      if (!filenameSeen && path !== undefined) current.sourcePath = path;
      else delete current.sourcePath;
      filenameSeen = true;
    } else if (line.startsWith('\t')) { answers.push(current); current = null; }
  }
  return answers;
}

/** `git blame --line-porcelain` over given ranges, retaining exact source positions and filenames. */
async function blameRanges(root: string, range: readonly string[], path: string, lines: readonly LineRange[], signal?: AbortSignal): Promise<LineCommit[]> {
  const ranges = lines.filter(([, count]) => count > 0);
  if (ranges.length === 0) return [];
  const prefix = (await gitOk(root, ['rev-parse', '--show-prefix'], signal)).stdout;
  // Remove only the command's terminating newline: spaces/newlines can belong to directory names.
  const projectPrefix = prefix.endsWith('\n') ? prefix.slice(0, -1) : prefix;
  const run = await gitOk(root, ['--literal-pathspecs', 'blame', '--line-porcelain', ...ranges.flatMap(([start, count]) => ['-L', `${start},+${count}`]), ...range, '--', path], signal);
  return parseBlamePorcelain(run.stdout, projectPrefix);
}

export async function lineOrigins(root: string, from: string, to: string, path: string, lines: readonly LineRange[], signal?: AbortSignal): Promise<LineCommit[]> {
  return blameRanges(root, [`${from}..${to}`], path, lines, signal);
}

export async function lineLastSeen(root: string, from: string, to: string, path: string, lines: readonly LineRange[], signal?: AbortSignal): Promise<LineCommit[]> {
  return blameRanges(root, ['--reverse', `${from}..${to}`], path, lines, signal);
}

/** The process-backed history. */
export const gitChangeHistory: ChangeHistory = { commitsBetween, changedFiles, lineOrigins, lineLastSeen };

/** Fixed read-only Git operations for coordinating architects. No caller supplies command flags. */
export interface GitInspection {
  readonly operation: 'status' | 'diff' | 'log' | 'show';
  readonly revision?: string;
  readonly to?: string;
  readonly staged?: boolean;
  readonly paths?: readonly string[];
  readonly limit?: number;
}

export async function inspectGit(root: string, request: GitInspection, signal?: AbortSignal): Promise<string> {
  for (const revision of [request.revision, request.to]) {
    if (revision !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_./~^@{}-]*$/u.test(revision)) throw new Error('Invalid Git revision');
  }
  const paths = request.paths ?? [];
  if (paths.some(path => path === '' || path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').includes('..'))) {
    throw new Error('Git paths must be project-relative without parent traversal');
  }
  const limit = request.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Git log limit must be between 1 and 100');
  let args: string[];
  switch (request.operation) {
    case 'status': args = ['status', '--porcelain=v1', '--untracked-files=all']; break;
    case 'diff':
      if (request.to !== undefined && request.staged) throw new Error('A staged diff cannot name a destination revision');
      args = ['diff', '--no-ext-diff', '--no-textconv', '--no-color', ...(request.staged ? ['--cached'] : []), request.revision ?? 'HEAD', ...(request.to === undefined ? [] : [request.to])];
      break;
    case 'log': args = ['log', '--no-color', '--format=medium', `-n${limit}`, request.revision ?? 'HEAD']; break;
    case 'show': args = ['show', '--no-ext-diff', '--no-textconv', '--no-color', '--format=medium', request.revision ?? 'HEAD']; break;
    default: throw new Error('Unknown Git inspection operation');
  }
  // status must not refresh the real index; disable configured helpers as well.
  const result = await gitOk(root, ['--no-pager', '--no-optional-locks', '--literal-pathspecs', '-c', 'core.fsmonitor=false', ...args, '--', ...paths], signal);
  return result.stdout;
}

/**
 * The external Git boundary. Inject scripted answers in consumer tests;
 * never reproduce repository behavior in a test double. Each function keeps
 * the project's root explicit, just as the command adapter does.
 */
export interface GitService {
  readonly trackedPaths: typeof trackedPaths;
  readonly ignoreStatus: typeof ignoreStatus;
  readonly previewCandidateTree: typeof previewCandidateTree;
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
  readonly worktreePatch: typeof worktreePatch;
}

/** The process-backed adapter. Consumer tests should supply a scripted GitService. */
export const gitService: GitService = {
  trackedPaths, ignoreStatus,
  previewCandidateTree: async (projectRoot, signal) => (await import('./candidate-tree.js')).previewCandidateTree(projectRoot, signal),
  currentHead, isCleanRepository, createRunBranch, commitAccepted,
  findCommitByTrailer, findCommitByTrailers, changedPaths, changedEntries,
  diffNameStatus, diffNumstat, commitNameStatus, worktreeLineChanges, worktreePatch,
};

/** The commit the working directory is on, or '' where Git cannot say. */
export async function currentHead(projectRoot: string): Promise<string> {
  const run = await runCommand({ argv: ['git', 'rev-parse', 'HEAD'], cwd: projectRoot, env: childEnvironment(), timeoutMs: 30_000 });
  return run.outcome.kind === 'completed' && run.outcome.exitCode === 0 ? run.stdout.trim() : '';
}
