import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseGitLog, projectPath, readGitHistory, repositoryState } from './git-history.js';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);

describe('git log parsing', () => {
  it('parses ids and NUL-terminated paths, including a commit without paths', () => {
    const output = `\x1e${a}\0\npkg/src/z.ts\0pkg/src/a b.ts\0docs/x.md\0\x1e${b}\0\x1e${c}\0\npkg/src/é.ts\0pkg/src/z.ts\0`;
    expect(parseGitLog(output, 'pkg')).toEqual([
      { id: a, paths: ['src/a b.ts', 'src/z.ts'] },
      { id: b, paths: [] },
      { id: c, paths: ['src/z.ts', 'src/é.ts'] },
    ]);
    expect(parseGitLog(output, '.')[0]).toEqual({ id: a, paths: ['docs/x.md', 'pkg/src/a b.ts', 'pkg/src/z.ts'] });
  });

  it('rejects an unexpected record and drops paths outside the project', () => {
    expect(() => parseGitLog('\x1enot-a-commit\0', '.')).toThrow(/Unexpected git log record/);
    expect(projectPath('pkgs/x.ts', 'pkg')).toBeNull();
    expect(projectPath('pkg/x.ts', 'pkg')).toBe('x.ts');
  });
});

describe('git history adapter', () => {
  const repository = mkdtempSync(join(tmpdir(), 'ramify-git-history-'));
  afterAll(() => rmSync(repository, { recursive: true, force: true }));
  const run = (...args: string[]) => execFileSync('git', ['-c', 'user.name=probe', '-c', 'user.email=probe@example.com',
    '-c', 'commit.gpgsign=false', ...args], { cwd: repository, encoding: 'utf8' }).trim();
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), text);
  };
  run('init', '-q', '-b', 'main');
  write('pkg/src/one.ts', 'export const one = 1;\n');
  write('README.md', 'root\n');
  run('add', '.');
  run('commit', '-q', '-m', 'first');
  run('mv', 'pkg/src/one.ts', 'pkg/src/renamed.ts');
  run('commit', '-q', '-m', 'rename');
  run('checkout', '-q', '-b', 'side');
  write('pkg/src/side.ts', 'export const side = 1;\n');
  run('add', '.');
  run('commit', '-q', '-m', 'side');
  run('checkout', '-q', 'main');
  write('pkg/src/main.ts', 'export const main = 1;\n');
  run('add', '.');
  run('commit', '-q', '-m', 'main');
  run('merge', '-q', '--no-ff', '-m', 'merge', 'side');
  const root = join(repository, 'pkg');

  it('reads oldest first, lists both rename paths and records provenance', () => {
    const history = readGitHistory({ root, range: 'HEAD', firstParent: false, merges: 'excluded' });
    expect(history.provenance).toEqual({ source: 'git', head: run('rev-parse', 'HEAD'), range: 'HEAD', firstParent: false,
      merges: 'excluded', projectDirectory: 'pkg' });
    const listed = history.commits.map(commit => commit.paths);
    expect(listed.slice(0, 2)).toEqual([['src/one.ts'], ['src/one.ts', 'src/renamed.ts']]);
    // Side and main commits may share a timestamp; their relative order is Git's.
    expect(listed.slice(2).sort()).toEqual([['src/main.ts'], ['src/side.ts']]);
    expect(history.commits).toHaveLength(4);
  });

  it('follows the first parent and includes merges against their first parent when requested', () => {
    const history = readGitHistory({ root, range: 'HEAD', firstParent: true, merges: 'included' });
    expect(history.commits.map(commit => commit.paths)).toEqual([['src/one.ts'], ['src/one.ts', 'src/renamed.ts'], ['src/main.ts'], ['src/side.ts']]);
    expect(history.commits.at(-1)!.id).toBe(history.provenance.head);
  });

  it('reports the head commit and worktree cleanliness', () => {
    expect(repositoryState(root)).toEqual({ commit: run('rev-parse', 'HEAD'), clean: true, changes: [] });
    write('pkg/src/untracked.ts', '\n');
    expect(repositoryState(root)).toMatchObject({ clean: false, changes: ['?? pkg/src/untracked.ts'] });
    rmSync(join(repository, 'pkg/src/untracked.ts'));
  });
});
