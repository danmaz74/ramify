import { chmod, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GitError, gitCandidateSource as candidate, gitService as git, inspectGit } from '../git.js';
import { symlink } from 'node:fs/promises';
import { testRepository, withoutGitConfiguration } from './helpers/git.js';
import type { TestRepository } from './helpers/git.js';
import { temporaryDirectory } from './helpers/temporary.js';

// These tests verify our adapter against Git. Consumer tests inject a
// scripted GitService instead. Related assertions share one repository and
// its cleanup; independent scenarios never share mutable fixtures.
async function withRepository(check: (repository: TestRepository) => Promise<void>): Promise<void> {
  const restoreConfiguration = withoutGitConfiguration();
  let repository: TestRepository | undefined;
  try {
    repository = await testRepository();
    await check(repository);
  } finally {
    try { await repository?.remove(); } finally { restoreConfiguration(); }
  }
}

describe('the real Git adapter', { timeout: 30_000 }, () => {
  it('inspects committed, staged, unstaged, deleted and untracked source without changing files, index or refs', async () => {
    await withRepository(async repository => {
      const root = repository.root;
      await repository.write('src/change.ts', 'original\n');
      await repository.write('src/delete.ts', 'delete me\n');
      await repository.git('add', '.');
      await repository.git('-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '-m', 'inspection baseline');
      await repository.write('src/change.ts', 'staged\n');
      await repository.git('add', 'src/change.ts');
      await repository.write('src/change.ts', 'unstaged\n');
      await rm(join(root, 'src/delete.ts'));
      await repository.write('src/new.ts', 'untracked\n');
      const before = await readFile(join(root, '.git/index'));
      const refs = await repository.git('show-ref');
      const status = await inspectGit(root, { operation: 'status' });
      expect(status).toContain('MM src/change.ts');
      expect(status).toContain(' D src/delete.ts');
      expect(status).toContain('?? src/new.ts');
      expect(await inspectGit(root, { operation: 'diff' })).toContain('+unstaged');
      const staged = await inspectGit(root, { operation: 'diff', staged: true });
      expect(staged).toContain('+staged');
      expect(staged).not.toContain('+unstaged');
      expect(await inspectGit(root, { operation: 'log', limit: 1 })).toContain('inspection baseline');
      expect(await inspectGit(root, { operation: 'show', paths: ['src/change.ts'] })).toContain('+original');
      await expect(inspectGit(root, { operation: 'show', revision: '--output=changed' })).rejects.toThrow('Invalid Git revision');
      await expect(inspectGit(root, { operation: 'diff', paths: ['../outside'] })).rejects.toThrow('project-relative');
      expect(await readFile(join(root, '.git/index'))).toEqual(before);
      expect(await repository.git('show-ref')).toBe(refs);
      expect(await readFile(join(root, 'src/change.ts'), 'utf8')).toBe('unstaged\n');
      expect(await readFile(join(root, 'src/new.ts'), 'utf8')).toBe('untracked\n');
    });
  });

  it('creates and resumes a run branch, commits with its own policy, and recovers exact commit identities', async () => {
    await withRepository(async repository => {
      const root = repository.root;
      const base = await git.currentHead(root);
      expect(base).toMatch(/^[0-9a-f]{40}$/);
      expect(await git.isCleanRepository(root)).toBe(true);
      expect(await git.createRunBranch(root, 'run-identity'))
        .toEqual({ branch: 'ramify-agent-run/run-identity', created: true });
      expect(await git.commitAccepted(root, 'nothing changed')).toBeNull();
      expect(await git.currentHead(root)).toBe(base);

      await repository.git('switch', 'main');
      await repository.write('src/one.ts', 'export const one = 1;\n');
      expect(await git.isCleanRepository(root)).toBe(false);
      await expect(git.commitAccepted(root, 'on main')).rejects.toBeInstanceOf(GitError);
      expect((await repository.git('log', '--format=%s')).trim()).toBe('first');
      expect(await git.createRunBranch(root, 'run-identity'))
        .toEqual({ branch: 'ramify-agent-run/run-identity', created: false });

      const hook = join(root, '.git', 'hooks', 'pre-commit');
      await writeFile(hook, '#!/usr/bin/env bash\necho "the project hook refuses" >&2\nexit 1\n');
      await chmod(hook, 0o755);
      await repository.write('plans/p1/.harness/.gitignore', '*\n');
      await repository.write('plans/p1/.harness/jobs/run-identity/events.jsonl', '{"sequence":1}\n');
      await expect(repository.git('commit', '--all', '--message', 'by hand')).rejects.toThrow();
      const first = await git.commitAccepted(root, 'first run\n\nRamify-Run: run-a\nRamify-Gate: ga-0001\n');
      expect(first).toMatch(/^[0-9a-f]{40}$/);
      expect(await repository.git('log', '-1', '--format=%an <%ae>%n%s'))
        .toBe('ramify-agent <ramify-agent@localhost>\nfirst run\n');
      expect(await git.isCleanRepository(root)).toBe(true);
      expect(await git.commitNameStatus(root, first!)).toEqual([{ status: 'A', path: 'src/one.ts' }]);
      expect(await git.findCommitByTrailer(root, 'Ramify-Gate', 'ga-0001')).toBe(first);
      expect(await git.findCommitByTrailer(root, 'Ramify-Gate', 'ga-0002')).toBeNull();

      await repository.write('src/two.ts', 'export const two = 2;\n');
      const second = await git.commitAccepted(root, 'second run\n\nRamify-Run: run-b\nRamify-Gate: ga-0001\n');
      for (const [run, expected] of [['run-a', first], ['run-b', second], ['run-c', null]] as const) {
        expect(await git.findCommitByTrailers(root, [
          { key: 'Ramify-Run', value: run }, { key: 'Ramify-Gate', value: 'ga-0001' },
        ])).toBe(expected);
      }
      await repository.git('switch', 'main');
      expect(await git.createRunBranch(root, 'run-identity'))
        .toEqual({ branch: 'ramify-agent-run/run-identity', created: false });
      expect(await git.currentHead(root)).toBe(second);
    });
  });

  it('refuses a run branch git cannot create, with git\'s own message', async () => {
    await withRepository(async repository => {
      const root = repository.root;
      // A branch named as the prefix's directory: no ref can live beneath it.
      await repository.git('branch', 'ramify-agent-run');
      const refused = await git.createRunBranch(root, 'run-collides').catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(GitError);
      expect((refused as GitError).message).toContain('git switch --create ramify-agent-run/run-collides');
      expect((refused as GitError).detail.output).toContain('cannot lock ref');
      expect((await repository.git('rev-parse', '--abbrev-ref', 'HEAD')).trim()).toBe('main');
    });
  });

  it('reports staged, untracked and renamed paths through the adapter', async () => {
    await withRepository(async repository => {
      await repository.write('src/one.ts', 'export const one = 1;\n');
      await repository.write('src/untracked.ts', 'export const two = 2;\n');
      await repository.git('add', 'src/one.ts');
      expect(await git.changedPaths(repository.root)).toEqual(['src/one.ts', 'src/untracked.ts']);
      await repository.git('mv', 'README.md', 'READ.md');
      expect(await git.changedPaths(repository.root)).toEqual(['READ.md', 'README.md', 'src/one.ts', 'src/untracked.ts']);
    });
  });

  it('reads path and line changes relative to the accepted revision even after a failed attempt commits', async () => {
    await withRepository(async repository => {
      const root = repository.root;
      await git.createRunBranch(root, 'run-boundary');
      const base = await git.currentHead(root);
      await repository.write('subs/notes/module.ramify', 'ramify 1\nmodule notes\n');
      await repository.write('subs/notes/src/notes.ts', 'export const limit = 400;\n');
      const failed = await git.commitAccepted(root, 'failed attempt');
      await repository.write('subs/notes/src/notes.ts', 'export const limit = 500;\n');
      expect(await git.changedPaths(root, base)).toEqual(['subs/notes/module.ramify', 'subs/notes/src/notes.ts']);
      const entries = [
        { status: 'A', path: 'subs/notes/module.ramify' },
        { status: 'A', path: 'subs/notes/src/notes.ts' },
      ];
      expect(await git.changedEntries(root, base)).toEqual(entries);
      expect(await git.diffNameStatus(root, base, failed!)).toEqual(entries);
      expect(await git.diffNumstat(root, base, failed!)).toEqual([
        { path: 'subs/notes/module.ramify', added: 2, deleted: 0, binary: false },
        { path: 'subs/notes/src/notes.ts', added: 1, deleted: 0, binary: false },
      ]);
      expect(await git.worktreeLineChanges(root, base)).toEqual([
        { path: 'subs/notes/module.ramify', added: 2, deleted: 0, binary: false, bytes: null },
        { path: 'subs/notes/src/notes.ts', added: 1, deleted: 0, binary: false, bytes: null },
      ]);
    });
  });

  it('serves a committed candidate from Git objects, whatever the working tree holds afterwards', async () => {
    await withRepository(async repository => {
      const root = repository.root;
      const base = await git.currentHead(root);
      await repository.write('src/one.ts', 'export const one = 1;\n// hello\n');
      await symlink('../../outside.txt', join(root, 'src', 'link'));
      await repository.git('add', '--all');
      await repository.git('-c', 'user.name=f', '-c', 'user.email=f@l', 'commit', '--message', 'candidate');
      const commit = (await repository.git('rev-parse', 'HEAD')).trim();

      // A later writer changes the file and adds another; the candidate does not move.
      await repository.write('src/one.ts', 'export const one = 2;\n');
      await repository.write('src/two.ts', 'export const two = 2;\n');

      expect(await candidate.commitTree(root, commit)).toBe((await repository.git('rev-parse', `${commit}^{tree}`)).trim());
      expect(await candidate.treeEntries(root, commit)).toEqual([
        { path: 'README.md', kind: 'file', bytes: 8 },
        { path: 'src/link', kind: 'symlink', bytes: 17 },
        { path: 'src/one.ts', kind: 'file', bytes: 31 },
      ]);
      expect(await candidate.readBlob(root, commit, 'src/one.ts')).toBe('export const one = 1;\n// hello\n');
      expect(await candidate.grepTree(root, commit, 'hel+o', ['src'])).toEqual([{ path: 'src/one.ts', line: 2, text: '// hello' }]);
      expect(await candidate.grepTree(root, commit, 'absent')).toEqual([]);
      expect(await candidate.diffNameStatus(root, base, commit)).toEqual([{ status: 'A', path: 'src/link' }, { status: 'A', path: 'src/one.ts' }]);
      expect(await candidate.diffPatch(root, base, commit, 'src/one.ts')).toContain('+export const one = 1;');
      await expect(candidate.readBlob(root, commit, 'src/two.ts')).rejects.toBeInstanceOf(GitError);
    });
  });

  it('reports an unavailable head and a typed status error outside a repository', async () => {
    const directory = await temporaryDirectory();
    try {
      expect(await git.currentHead(directory.path)).toBe('');
      await expect(git.isCleanRepository(directory.path)).rejects.toBeInstanceOf(GitError);
    } finally {
      await directory.remove();
    }
  });
});
