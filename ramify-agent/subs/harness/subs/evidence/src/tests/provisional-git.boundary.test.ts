import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { productionSourceGit } from '../provisional-git.js';
import { testRepository, withoutGitConfiguration } from './helpers/git.js';

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('actual provisional Git reads binary committed/index bytes, exact staged paths and absent blobs', async () => {
  cleanups.push(withoutGitConfiguration());
  const repository = await testRepository(); cleanups.push(repository.remove);
  const file = 'binary source.bin';
  const base = Buffer.from([0, 255, 128, 13, 10]);
  await writeFile(join(repository.root, file), base);
  await repository.git('add', '--', file);
  await repository.git('-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '-m', 'binary');
  const revision = (await repository.git('rev-parse', 'HEAD')).trim();
  const staged = Buffer.from([0, 254, 129, 10]);
  await writeFile(join(repository.root, file), staged);
  await repository.git('add', '--', file);
  await writeFile(join(repository.root, file), Buffer.from([5, 0, 253]));
  expect(await productionSourceGit.stagedPaths(repository.root)).toEqual([file]);
  expect(await productionSourceGit.readBlob(repository.root, revision, file)).toEqual(base);
  expect(await productionSourceGit.readBlob(repository.root, '', file)).toEqual(staged);
  expect(await productionSourceGit.readBlob(repository.root, revision, 'absent')).toBeNull();
  expect(await productionSourceGit.readBlob(repository.root, '', 'absent')).toBeNull();
});

test('actual provisional Git propagates process/cwd errors rather than reporting absent blobs', async () => {
  await expect(productionSourceGit.stagedPaths('/nonexistent/plan22-provisional-git')).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(productionSourceGit.readBlob('/nonexistent/plan22-provisional-git', '', 'file')).rejects.toMatchObject({ code: 'ENOENT' });
});
