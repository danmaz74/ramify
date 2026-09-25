import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitAccepted, commitTree, createRunBranch, gitService } from '../git.js';
import { previewCandidateTree } from '../candidate-tree.js';
import { testRepository, withoutGitConfiguration, type TestRepository } from './helpers/git.js';

let restoreConfiguration: (() => void) | undefined;
const repositories: TestRepository[] = [];
beforeEach(() => { restoreConfiguration = withoutGitConfiguration(); });
afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.remove();
  restoreConfiguration?.();
});
async function repository(): Promise<TestRepository> {
  const created = await testRepository();
  repositories.push(created);
  return created;
}
async function withPrivateTemporaryDirectory<T>(run: () => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'candidate-tree-test-'));
  const previous = process.env['TMPDIR'];
  process.env['TMPDIR'] = directory;
  try {
    expect(tmpdir()).toBe(directory);
    const result = await run();
    expect(await readdir(directory)).toEqual([]);
    return result;
  } finally {
    if (previous === undefined) delete process.env['TMPDIR'];
    else process.env['TMPDIR'] = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

test('preview matches a whole-worktree commit and preserves staged user index bytes', async () => {
  const repo = await repository();
  await repo.write('delete.txt', 'remove me\n');
  await repo.git('add', '--all');
  await repo.git('-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '-m', 'add deletion source');
  await createRunBranch(repo.root, 'candidate-preview');
  await repo.write('README.md', 'staged version\n');
  await repo.git('add', 'README.md');
  await repo.write('README.md', 'working version\n');
  await repo.write('new.txt', 'untracked\n');
  await rm(join(repo.root, 'delete.txt'));
  const indexBefore = await readFile(join(repo.root, '.git', 'index'));
  const preview = await withPrivateTemporaryDirectory(() => previewCandidateTree(repo.root));
  expect(await withPrivateTemporaryDirectory(() => gitService.previewCandidateTree(repo.root))).toEqual(preview);
  expect(preview).toMatchObject({ repositoryRoot: repo.root, head: expect.stringMatching(/^[0-9a-f]{40}$/), tree: expect.stringMatching(/^[0-9a-f]{40}$/) });
  expect(await readFile(join(repo.root, '.git', 'index'))).toEqual(indexBefore);
  const commit = await commitAccepted(repo.root, 'preview witness');
  expect(commit).not.toBeNull();
  expect(await commitTree(repo.root, commit!)).toBe(preview.tree);
});

test('a late source mutation changes the preview tree', async () => {
  const repo = await repository();
  await createRunBranch(repo.root, 'candidate-late');
  await repo.write('README.md', 'first revision\n');
  const first = await previewCandidateTree(repo.root);
  await repo.write('README.md', 'later revision\n');
  const later = await previewCandidateTree(repo.root);
  expect(later.head).toBe(first.head);
  expect(later.tree).not.toBe(first.tree);
  const commit = await commitAccepted(repo.root, 'later preview witness');
  expect(await commitTree(repo.root, commit!)).toBe(later.tree);
});

test('nested cwd previews the entire eventual repository tree', async () => {
  const repo = await repository();
  await repo.write('nested/project/owned.txt', 'old\n');
  await repo.git('add', '--all');
  await repo.git('-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '-m', 'nested source');
  await createRunBranch(repo.root, 'candidate-nested');
  await repo.write('README.md', 'outside nested project\n');
  await repo.write('nested/project/owned.txt', 'inside nested project\n');
  const cwd = join(repo.root, 'nested', 'project');
  const preview = await previewCandidateTree(cwd);
  expect(preview.repositoryRoot).toBe(repo.root);
  const commit = await commitAccepted(cwd, 'nested preview witness');
  expect(await commitTree(cwd, commit!)).toBe(preview.tree);
});

test('a repository nested inside another uses its own root and index', async () => {
  const outer = await repository();
  const innerRoot = join(outer.root, 'other', 'inner');
  await mkdir(innerRoot, { recursive: true });
  const inner: TestRepository = {
    root: innerRoot,
    git: (...args) => outer.git('-C', innerRoot, ...args),
    write: (path, content) => outer.write(`other/inner/${path}`, content),
    remove: async () => undefined,
  };
  await inner.git('init', '--initial-branch=main');
  await inner.write('README.md', 'inner\n');
  await inner.git('add', '--all');
  await inner.git('-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '-m', 'inner first');
  await createRunBranch(innerRoot, 'candidate-inner');
  await inner.write('README.md', 'changed inner\n');
  const preview = await previewCandidateTree(innerRoot);
  expect(preview.repositoryRoot).toBe(innerRoot);
  const commit = await commitAccepted(innerRoot, 'inner witness');
  expect(await commitTree(innerRoot, commit!)).toBe(preview.tree);
});

test('a failed add cleans its isolated index and leaves the user index unchanged', async () => {
  const repo = await repository();
  await repo.git('config', 'filter.broken.clean', 'false');
  await repo.git('config', 'filter.broken.required', 'true');
  await repo.write('.gitattributes', '*.bad filter=broken\n');
  await repo.write('cannot-add.bad', 'unfiltered\n');
  const indexBefore = await readFile(join(repo.root, '.git', 'index'));
  await withPrivateTemporaryDirectory(async () => {
    await expect(previewCandidateTree(repo.root)).rejects.toThrow(/could not preview the candidate tree/);
  });
  expect(await readFile(join(repo.root, '.git', 'index'))).toEqual(indexBefore);
});

test('an aborted preview leaves no temporary index', async () => {
  const repo = await repository();
  const controller = new AbortController();
  controller.abort();
  await withPrivateTemporaryDirectory(async () => {
    await expect(previewCandidateTree(repo.root, controller.signal)).rejects.toThrow();
  });
});
