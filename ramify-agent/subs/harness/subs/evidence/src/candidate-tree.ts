import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitError } from './git.js';
import { childEnvironment, runCommand } from './run-command.js';

const timeoutMs = 60_000;
const treeOid = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/** The exact tree a whole-repository `git add --all` would stage now. */
export interface CandidateTreePreview {
  readonly repositoryRoot: string;
  readonly head: string;
  readonly tree: string;
}

async function git(
  cwd: string,
  args: readonly string[],
  signal?: AbortSignal,
  indexFile?: string,
): Promise<string> {
  const argv = ['git', ...args];
  const run = await runCommand({
    argv,
    cwd,
    env: childEnvironment({ GIT_TERMINAL_PROMPT: '0', ...(indexFile === undefined ? {} : { GIT_INDEX_FILE: indexFile }) }),
    timeoutMs,
    ...(signal === undefined ? {} : { signal }),
  });
  if (run.outcome.kind !== 'completed' || run.outcome.exitCode !== 0) {
    throw new GitError(`\`${argv.join(' ')}\` could not preview the candidate tree`, {
      argv,
      outcome: run.outcome,
      output: `${run.stdout}${run.stderr}`.trim().slice(-2000),
    });
  }
  return run.stdout.trim();
}

/**
 * Compute the eventual content tree through an isolated temporary index.
 * This does not change the caller's index or working files. Git may write
 * unreachable objects while hashing new source content.
 */
export async function previewCandidateTree(projectRoot: string, signal?: AbortSignal): Promise<CandidateTreePreview> {
  const repositoryRoot = await git(projectRoot, ['rev-parse', '--show-toplevel'], signal);
  const head = await git(repositoryRoot, ['rev-parse', 'HEAD'], signal);
  if (!treeOid.test(head)) throw new Error(`Git returned an invalid HEAD OID: ${head}`);
  const temporary = await mkdtemp(join(tmpdir(), 'ramify-candidate-index-'));
  const indexFile = join(temporary, 'index');
  try {
    await git(repositoryRoot, ['read-tree', 'HEAD'], signal, indexFile);
    await git(repositoryRoot, ['add', '--all', '--', ':/'], signal, indexFile);
    const tree = await git(repositoryRoot, ['write-tree'], signal, indexFile);
    if (!treeOid.test(tree)) throw new Error(`Git returned an invalid tree OID: ${tree}`);
    return { repositoryRoot, head, tree };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
