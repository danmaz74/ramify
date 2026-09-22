import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand, childEnvironment } from './run-command.js';
import type { CommandOutcome } from './run-command.js';

/*
 * Git, for the run branch. Each function is one thin call over `runCommand`:
 * no git logic lives here beyond naming the invocation and reading what it
 * printed.
 *
 * Committing gates make a run-branch commit before the audit executes; this
 * service owns that commit and the revision queries used by the audit and by
 * accepted-boundary accounting. It does not decide whether an audit passed.
 */

/** Every branch the harness commits on is named for its run. */
export const runBranchPrefix = 'ramify-agent/run-';

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
 * The run's branch, `ramify-agent/run-<run-id>`, checked out. A run repeated
 * after a crash finds its branch and stays on it; the branch is never reset,
 * so the commits of the earlier attempt are kept.
 */
export async function createRunBranch(root: string, runId: string, signal?: AbortSignal): Promise<{ readonly branch: string; readonly created: boolean }> {
  const branch = `${runBranchPrefix}${runId}`;
  const existing = await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], signal);
  const created = existing.exitCode !== 0;
  await gitOk(root, created ? ['switch', '--create', branch] : ['switch', branch], signal);
  return { branch, created };
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
  if (!branch.startsWith(runBranchPrefix)) {
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
