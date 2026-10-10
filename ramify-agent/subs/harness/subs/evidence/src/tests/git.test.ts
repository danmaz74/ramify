import { chmod, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GitError, gitCandidateSource as candidate, gitChangeHistory, gitService as git, inspectGit } from '../git.js';
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

  it('names a nested project\'s changes as the project does, and leaves the rest of the repository out', async () => {
    await withRepository(async repository => {
      await repository.write('nested/project/src/kept.ts', 'export const kept = 1;\n');
      await repository.write('elsewhere/tracked.ts', 'export const elsewhere = 1;\n');
      await repository.git('add', '--all');
      await repository.git('-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--message', 'nested source');
      const project = join(repository.root, 'nested/project');
      const before = (await repository.git('rev-parse', 'HEAD')).trim();
      await repository.write('nested/project/src/kept.ts', 'export const kept = 2;\n');
      await repository.write('nested/project/src/added.ts', 'export const added = true;\n');
      await repository.write('elsewhere/tracked.ts', 'export const elsewhere = 2;\n');
      await repository.write('elsewhere/untracked.ts', 'export const stray = true;\n');
      expect(await git.changedPaths(project)).toEqual(['src/added.ts', 'src/kept.ts']);
      expect(await git.changedEntries(project)).toEqual([{ status: 'M', path: 'src/kept.ts' }, { status: '??', path: 'src/added.ts' }]);
      expect((await git.worktreeLineChanges(project)).map(change => change.path)).toEqual(['src/added.ts', 'src/kept.ts']);
      // The repository root still sees everything, under its own names.
      expect(await git.changedPaths(repository.root)).toEqual(['elsewhere/tracked.ts', 'elsewhere/untracked.ts', 'nested/project/src/added.ts', 'nested/project/src/kept.ts']);
      // A gate's commit from the nested project stages the project's tree alone; the rest stays dirty.
      await git.createRunBranch(project, 'nested-commit');
      const committed = await git.commitAccepted(project, 'nested candidate');
      expect(committed).not.toBeNull();
      expect(await git.changedPaths(repository.root)).toEqual(['elsewhere/tracked.ts', 'elsewhere/untracked.ts']);
      // The committed candidate is read by the project's names too, and only the project's files are in it.
      expect(await git.diffNameStatus(project, before, committed!)).toEqual([{ status: 'A', path: 'src/added.ts' }, { status: 'M', path: 'src/kept.ts' }]);
      expect((await git.diffNumstat(project, before, committed!)).map(change => change.path)).toEqual(['src/added.ts', 'src/kept.ts']);
      expect(await candidate.diffPatch(project, before, committed!, 'src/kept.ts')).toContain('--- a/src/kept.ts');
      expect((await candidate.treeEntries(project, committed!)).map(entry => entry.path)).toEqual(['src/added.ts', 'src/kept.ts']);
      expect(await candidate.readBlob(project, committed!, 'src/kept.ts')).toBe('export const kept = 2;\n');
      expect(await candidate.grepTree(project, committed!, 'kept = ')).toEqual([{ path: 'src/kept.ts', line: 1, text: 'export const kept = 2;' }]);
      expect(await candidate.grepTree(project, committed!, 'elsewhere')).toEqual([]);
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

      // A project nested in the repository sees its own paths, project-relative,
      // tracked and untracked alike, and nothing of the enclosing repository.
      await repository.write('nested/src/inner.ts', 'export const inner = 1;\n');
      await git.commitAccepted(root, 'nested attempt');
      await repository.write('nested/src/inner.ts', 'export const inner = 1;\nexport const more = 2;\n');
      await repository.write('nested/src/loose.ts', 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n');
      expect(await git.worktreeLineChanges(join(root, 'nested'), base)).toEqual([
        { path: 'src/inner.ts', added: 2, deleted: 0, binary: false, bytes: null },
        { path: 'src/loose.ts', added: 3, deleted: 0, binary: false, bytes: null },
      ]);
    });
  });

  it('serves a committed candidate from Git objects, whatever the working tree holds afterwards', async () => {
    await withRepository(async repository => {
      const root = repository.root;
      const base = await git.currentHead(root);
      await repository.write('src/one.ts', 'export const one = 1;\n// hello\n');
      await symlink('../../outside.txt', join(root, 'src', 'link'));
      await repository.write('src/replacement.ts', 'literal \uFFFD\n');
      await writeFile(join(root, 'src', 'raw.bin'), Buffer.from([0xff, 0x0a]));
      await repository.git('add', '--all');
      await repository.git('-c', 'user.name=f', '-c', 'user.email=f@l', 'commit', '--message', 'candidate');
      const commit = (await repository.git('rev-parse', 'HEAD')).trim();

      // A later writer changes the file and adds another; the candidate does not move.
      await repository.write('src/one.ts', 'export const one = 2;\n');
      await repository.write('src/two.ts', 'export const two = 2;\n');

      expect(await candidate.commitTree(root, commit)).toBe((await repository.git('rev-parse', `${commit}^{tree}`)).trim());
      // Fixed original bytes authenticate Git's object IDs independently of decoded text.
      const originals = [
        { path: 'README.md', kind: 'file', content: Buffer.from('fixture\n') },
        { path: 'src/link', kind: 'symlink', content: Buffer.from('../../outside.txt') },
        { path: 'src/one.ts', kind: 'file', content: Buffer.from('export const one = 1;\n// hello\n') },
        { path: 'src/raw.bin', kind: 'file', content: Buffer.from([0xff, 0x0a]) },
        { path: 'src/replacement.ts', kind: 'file', content: Buffer.from('literal \uFFFD\n') },
      ];
      const objectIdOf = (content: Buffer): string => createHash('sha1')
        .update(Buffer.from(`blob ${content.byteLength}\0`)).update(content).digest('hex');
      const expectedEntries = originals.map(({ path, kind, content }) => ({ path, kind, bytes: content.byteLength, objectId: objectIdOf(content) }));
      expect(await candidate.treeEntries(root, commit)).toEqual(expectedEntries);
      for (const expected of expectedEntries) {
        expect((await repository.git('rev-parse', `${commit}:${expected.path}`)).trim()).toBe(expected.objectId);
      }
      const replacement = await candidate.readBlob(root, commit, 'src/replacement.ts');
      expect(replacement).toBe('literal \uFFFD\n');
      expect(objectIdOf(Buffer.from(replacement))).toBe(expectedEntries.find(entry => entry.path === 'src/replacement.ts')!.objectId);
      const lossy = await candidate.readBlob(root, commit, 'src/raw.bin');
      expect(lossy).toBe('\uFFFD\n');
      expect(objectIdOf(Buffer.from(lossy))).not.toBe(expectedEntries.find(entry => entry.path === 'src/raw.bin')!.objectId);
      expect(await candidate.readBlob(root, commit, 'src/one.ts')).toBe('export const one = 1;\n// hello\n');
      expect(await candidate.grepTree(root, commit, 'hel+o', ['src'])).toEqual([{ path: 'src/one.ts', line: 2, text: '// hello' }]);
      expect(await candidate.grepTree(root, commit, 'absent')).toEqual([]);
      expect(await candidate.diffNameStatus(root, base, commit)).toEqual(['src/link', 'src/one.ts', 'src/raw.bin', 'src/replacement.ts'].map(path => ({ status: 'A', path })));
      expect(await candidate.diffPatch(root, base, commit, 'src/one.ts')).toContain('+export const one = 1;');
      await expect(candidate.readBlob(root, commit, 'src/two.ts')).rejects.toBeInstanceOf(GitError);

      // A real filename can contain Git pathspec metacharacters. A validated
      // snapshot path must never select other source or generated-view files.
      await repository.write('src/*.ts', 'literal-star-only\n');
      await repository.write('src/.ramify/private.ts', 'generated-view-must-not-leak\n');
      await repository.git('add', '--all');
      await repository.git('-c', 'user.name=f', '-c', 'user.email=f@l', 'commit', '--message', 'literal candidate path');
      const literalCommit = (await repository.git('rev-parse', 'HEAD')).trim();
      const literalPatch = await candidate.diffPatch(root, base, literalCommit, 'src/*.ts');
      expect(literalPatch).toContain('+literal-star-only');
      expect(literalPatch).not.toContain('generated-view-must-not-leak');
      expect(literalPatch).not.toContain('export const one');
      expect(literalPatch).not.toContain('export const two');
    });
  });

  it('names the commit that delivered each changed line, and the one that removed each deleted line, over the direct diff', async () => {
    await withRepository(async repository => {
      const identity = ['-c', 'user.name=Test', '-c', 'user.email=test@localhost'];
      const commit = async (message: string) => {
        await repository.git('add', '--all');
        await repository.git(...identity, 'commit', '--message', message);
        return (await repository.git('rev-parse', 'HEAD')).trim();
      };
      await repository.write('project/src/a.ts', 'one\ntwo\nthree\n');
      await repository.write('project/src/moved \"é\".ts', 'kept\nlines\n');
      await repository.write('outside.txt', 'not the project\n');
      const base = await commit('base');
      // The first writer adds two lines, and a line the second rewrites.
      await repository.write('project/src/a.ts', 'one\ninserted\ntwo\nthree\nfour\nfive\n');
      await repository.write('project/logo.bin', '\u0000\u0001binary');
      const first = await commit('first');
      // The second rewrites `five`, deletes base line `two`, moves a file and
      // edits it, and changes a file outside the project.
      await repository.write('project/src/a.ts', 'one\ninserted\nthree\nfour\nFIVE\n');
      await rm(join(repository.root, 'project/src/moved \"é\".ts'));
      await repository.write('project/src/renamed \"é\".ts', 'kept\nlines\nadded\n');
      await repository.write('outside.txt', 'changed\n');
      const second = await commit('second');

      const project = join(repository.root, 'project');
      expect(await gitChangeHistory.commitsBetween(project, base, second)).toEqual([first, second]);
      const files = await gitChangeHistory.changedFiles(project, base, second);
      expect(files).toEqual([
        { before: null, after: 'logo.bin', binary: true, added: [], deleted: [] },
        { before: 'src/a.ts', after: 'src/a.ts', binary: false, added: [[2, 1], [4, 2]], deleted: [[2, 1]] },
        { before: 'src/moved \"é\".ts', after: 'src/renamed \"é\".ts', binary: false, added: [[3, 1]], deleted: [] },
      ]);
      // `four` from the first writer and `FIVE` from the second, in the final tree.
      expect(await gitChangeHistory.lineOrigins(project, base, second, 'src/a.ts', [[4, 2]])).toEqual([
        { line: 4, commit: first, boundary: false, sourceLine: 5, sourcePath: 'project/src/a.ts', projectPrefix: 'project/' },
        { line: 5, commit: second, boundary: false, sourceLine: 5, sourcePath: 'project/src/a.ts', projectPrefix: 'project/' },
      ]);
      expect(await gitChangeHistory.lineOrigins(project, base, second, 'src/renamed \"é\".ts', [[1, 3]])).toEqual([
        { line: 1, commit: base, boundary: true, sourceLine: 1, sourcePath: 'project/src/moved \"é\".ts', projectPrefix: 'project/' },
        { line: 2, commit: base, boundary: true, sourceLine: 2, sourcePath: 'project/src/moved \"é\".ts', projectPrefix: 'project/' },
        { line: 3, commit: second, boundary: false, sourceLine: 3, sourcePath: 'project/src/renamed \"é\".ts', projectPrefix: 'project/' },
      ]);
      // Base line 2 (`two`) was last held at position 3 in the first commit; the second removed it.
      expect(await gitChangeHistory.lineLastSeen(project, base, second, 'src/a.ts', [[2, 1]])).toEqual([{ line: 2, commit: first, boundary: false, sourceLine: 3, sourcePath: 'project/src/a.ts', projectPrefix: 'project/' }]);
      // At repository cwd the source path is still repository-relative, with an explicitly empty prefix.
      expect(await gitChangeHistory.lineOrigins(repository.root, base, second, 'project/src/a.ts', [[4, 1]])).toEqual([
        { line: 4, commit: first, boundary: false, sourceLine: 5, sourcePath: 'project/src/a.ts', projectPrefix: '' },
      ]);
      await expect(gitChangeHistory.changedFiles(project, base, 'no-such-revision')).rejects.toThrow();
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
