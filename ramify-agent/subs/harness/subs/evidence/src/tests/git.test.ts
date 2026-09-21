import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GitError, changedPaths, commitAccepted, createRunBranch, diffNumstat,
  findCommitByTrailer, isCleanRepository,
} from '../git.js';
import { testRepository, withoutGitConfiguration } from './helpers/git.js';
import type { TestRepository } from './helpers/git.js';
import { temporaryDirectory } from './helpers/temporary.js';

/**
 * The run branch and the commit made after a gate passes. Neither the
 * project's hooks nor the person's configuration can fail that commit, and no
 * identity of the working tree is taken or compared anywhere.
 */
describe('the git service', () => {
  let repository: TestRepository;
  let restoreConfiguration: () => void;

  beforeEach(async () => {
    restoreConfiguration = withoutGitConfiguration();
    repository = await testRepository();
  });
  afterEach(async () => {
    restoreConfiguration();
    await repository.remove();
  });

  it('answers whether the repository has anything to commit', async () => {
    expect(await isCleanRepository(repository.root)).toBe(true);

    await repository.write('src/added.ts', 'export const added = 1;\n');

    expect(await isCleanRepository(repository.root)).toBe(false);
  });

  it('refuses a directory that is no repository', async () => {
    const directory = await temporaryDirectory();
    try {
      await expect(isCleanRepository(directory.path)).rejects.toBeInstanceOf(GitError);
    } finally {
      await directory.remove();
    }
  });

  it('creates the run branch and finds it again, keeping what it already holds', async () => {
    const first = await createRunBranch(repository.root, '20260920T101500Z-3f9a1c');
    expect(first).toEqual({ branch: 'ramify-agent/run-20260920T101500Z-3f9a1c', created: true });

    await repository.write('src/one.ts', 'export const one = 1;\n');
    const commit = await commitAccepted(repository.root, 'first iteration');
    await repository.git('switch', 'main');

    const again = await createRunBranch(repository.root, '20260920T101500Z-3f9a1c');

    expect(again).toEqual({ branch: 'ramify-agent/run-20260920T101500Z-3f9a1c', created: false });
    expect((await repository.git('rev-parse', 'HEAD')).trim()).toBe(commit);
  });

  it('commits where a project hook fails and where no identity is configured', async () => {
    const hook = join(repository.root, '.git', 'hooks', 'pre-commit');
    await writeFile(hook, '#!/usr/bin/env bash\necho "the project hook refuses" >&2\nexit 1\n');
    await chmod(hook, 0o755);
    await createRunBranch(repository.root, 'run-1');
    await repository.write('src/one.ts', 'export const one = 1;\n');

    // Without the harness's own flags and identity, this project cannot commit at all.
    await expect(repository.git('commit', '--all', '--message', 'by hand')).rejects.toThrow();

    const commit = await commitAccepted(repository.root, 'the harness commits');

    expect(commit).toMatch(/^[0-9a-f]{40}$/);
    expect(await repository.git('log', '-1', '--format=%an <%ae>%n%s')).toBe('ramify-agent <ramify-agent@localhost>\nthe harness commits\n');
    expect(await isCleanRepository(repository.root)).toBe(true);
  });

  it('refuses a branch that is not a run branch', async () => {
    await repository.write('src/one.ts', 'export const one = 1;\n');

    await expect(commitAccepted(repository.root, 'on main')).rejects.toBeInstanceOf(GitError);
    expect(await isCleanRepository(repository.root)).toBe(false);
    expect((await repository.git('log', '--format=%s')).trim()).toBe('first');
  });

  it('makes no commit when a passing gate changed nothing', async () => {
    await createRunBranch(repository.root, 'run-2');

    expect(await commitAccepted(repository.root, 'nothing changed')).toBeNull();
    expect((await repository.git('log', '--format=%s')).trim()).toBe('first');
  });

  it('never commits a plan\'s .harness/', async () => {
    await createRunBranch(repository.root, 'run-3');
    await repository.write('plans/p1/.harness/.gitignore', '*\n');
    await repository.write('plans/p1/.harness/jobs/run-3/events.jsonl', '{"sequence":1}\n');
    await repository.write('src/one.ts', 'export const one = 1;\n');

    const commit = await commitAccepted(repository.root, 'with records beside it');

    expect(commit).not.toBeNull();
    const committed = (await repository.git('show', '--name-only', '--format=', commit ?? '')).trim().split('\n');
    expect(committed).toEqual(['src/one.ts']);
  });

  it('finds an earlier commit by its trailer, so a repeat makes no second one', async () => {
    await createRunBranch(repository.root, 'run-4');
    await repository.write('src/one.ts', 'export const one = 1;\n');
    const commit = await commitAccepted(repository.root, 'wi-001.i02: the work\n\nChecks: passed\n\nRamify-Gate: ga-0012\n');

    expect(await findCommitByTrailer(repository.root, 'Ramify-Gate', 'ga-0012')).toBe(commit);
    expect(await findCommitByTrailer(repository.root, 'Ramify-Gate', 'ga-0013')).toBeNull();
  });

  it('reads what changed from git and nowhere else', async () => {
    await repository.write('src/one.ts', 'export const one = 1;\n');
    await repository.write('src/untracked.ts', 'export const two = 2;\n');
    await repository.git('add', 'src/one.ts');

    expect(await changedPaths(repository.root)).toEqual(['src/one.ts', 'src/untracked.ts']);

    await repository.git('mv', 'README.md', 'READ.md');

    expect(await changedPaths(repository.root)).toEqual(['READ.md', 'README.md', 'src/one.ts', 'src/untracked.ts']);
  });

  it('counts the lines between two accepted commits', async () => {
    await createRunBranch(repository.root, 'run-5');
    const base = (await repository.git('rev-parse', 'HEAD')).trim();
    await repository.write('src/one.ts', 'export const one = 1;\nexport const two = 2;\n');
    const head = await commitAccepted(repository.root, 'two lines');

    expect(await diffNumstat(repository.root, base, head ?? '')).toEqual([
      { path: 'src/one.ts', added: 2, deleted: 0, binary: false },
    ]);
  });
});
