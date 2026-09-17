// Git history adapter of the modularity probe.
//
// Produces the plain `ChangeHistory` that `projectChangeAffinity` reads
// (docs/architecture/modularity-report.spec.md, section 8). It only acquires
// repository history: rename detection is disabled so a rename lists both
// paths, repository-relative paths are rewritten relative to the project root
// and paths outside it are dropped. Mapping paths to owners, and therefore
// excluding documentation, root configuration and other non-source paths,
// belongs to the pure projection.

import { execFileSync } from 'node:child_process';
import type { ChangeHistory, HistoryCommit } from 'ramify.ts/analysis';

export interface GitHistoryRequest {
  /** The project root; any directory inside the repository. */
  readonly root: string;
  /** A revision range given to `git log`, for example `HEAD` or `<base>..HEAD`. */
  readonly range: string;
  readonly firstParent: boolean;
  /** Excluded merges use `--no-merges`; included merges are compared with their first parent. */
  readonly merges: 'excluded' | 'included';
}

export interface RepositoryState {
  /** Full id of `HEAD`. */
  readonly commit: string;
  /** No staged, unstaged or untracked change outside ignored paths. */
  readonly clean: boolean;
  /** `git status --porcelain` lines, for the refusal message. */
  readonly changes: readonly string[];
}

const recordSeparator = '\x1e';

export function git(root: string, args: readonly string[]): string {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args],
    { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function repositoryState(root: string): RepositoryState {
  const changes = git(root, ['status', '--porcelain', '--untracked-files=all']).split('\n').filter(line => line.length > 0);
  return { commit: git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim(), clean: changes.length === 0, changes };
}

export function readGitHistory(request: GitHistoryRequest): ChangeHistory {
  const prefix = git(request.root, ['rev-parse', '--show-prefix']).trim();
  const projectDirectory = prefix === '' ? '.' : prefix.replace(/\/$/, '');
  const head = git(request.root, ['rev-list', '-n', '1', request.range, '--']).trim();
  if (!/^[0-9a-f]{40,64}$/.test(head)) throw new Error(`The range ${request.range} names no commit`);
  const args = ['log', '--reverse', '--no-renames', '--name-only', '-z', `--format=${recordSeparator}%H`,
    ...(request.firstParent ? ['--first-parent'] : []),
    ...(request.merges === 'excluded' ? ['--no-merges'] : ['--diff-merges=first-parent']),
    request.range, '--'];
  return {
    provenance: { source: 'git', head, range: request.range, firstParent: request.firstParent, merges: request.merges, projectDirectory },
    commits: parseGitLog(git(request.root, args), projectDirectory),
  };
}

/**
 * Parses `git log --name-only -z --format=%x1e%H` output: each record is the
 * separator, the full id, NUL, a newline before the first path, then
 * NUL-terminated repository-relative paths.
 */
export function parseGitLog(output: string, projectDirectory: string): HistoryCommit[] {
  return output.split(recordSeparator).filter(record => record.length > 0).map(record => {
    const [id = '', ...fields] = record.split('\0');
    if (!/^[0-9a-f]{40,64}$/.test(id)) throw new Error(`Unexpected git log record: ${JSON.stringify(record.slice(0, 80))}`);
    if (fields.length > 0 && fields[0]!.startsWith('\n')) fields[0] = fields[0]!.slice(1);
    const paths = fields.filter(field => field.length > 0)
      .map(path => projectPath(path, projectDirectory))
      .filter((path): path is string => path !== null);
    return { id, paths: [...new Set(paths)].sort(utf8Order) };
  });
}

/** A repository-relative path relative to the project directory, or null outside it. */
export function projectPath(path: string, projectDirectory: string): string | null {
  if (projectDirectory === '.') return path;
  const prefix = `${projectDirectory}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

export const utf8Order = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
