import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { gitService } from '../git.js';
import { testRepository, withoutGitConfiguration, type TestRepository } from './helpers/git.js';

let repository: TestRepository;
let restoreConfiguration: () => void;

beforeAll(async () => {
  restoreConfiguration = withoutGitConfiguration();
  repository = await testRepository();
});

afterAll(async () => {
  try { await repository?.remove(); } finally { restoreConfiguration?.(); }
});

test('index paths and effective ignore rules come from Git, including unchanged and staged scratch', async () => {
  const root = repository.root;
  await repository.write('src/tmp/unchanged.txt', 'committed\n');
  await repository.git('add', 'src/tmp/unchanged.txt');
  await repository.git('-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '-m', 'tracked scratch');
  await repository.write('subs/notes/src/tmp/new file.txt', 'staged\n');
  await repository.git('add', 'subs/notes/src/tmp/new file.txt');

  expect(await gitService.trackedPaths(root, ['src/tmp', 'subs/notes/src/tmp'])).toEqual([
    'src/tmp/unchanged.txt', 'subs/notes/src/tmp/new file.txt',
  ]);
  expect(await gitService.ignoreStatus(root, ['src/tmp/', 'src/other/'])).toEqual([
    { path: 'src/tmp/', ignored: false, rule: null },
    { path: 'src/other/', ignored: false, rule: null },
  ]);

  await repository.write('.gitignore', '**/src/tmp/\n');
  expect(await gitService.ignoreStatus(root, [])).toEqual([]);
  expect(await gitService.ignoreStatus(root, ['src/tmp/', 'subs/space name/src/tmp/'])).toEqual([
    { path: 'src/tmp/', ignored: true, rule: { source: '.gitignore', line: 1, pattern: '**/src/tmp/' } },
    { path: 'subs/space name/src/tmp/', ignored: true, rule: { source: '.gitignore', line: 1, pattern: '**/src/tmp/' } },
  ]);
  expect(await gitService.ignoreStatus(root, ['subs/space name/src/tmp/', 'src/other/', 'src/tmp/', 'subs/space name/src/tmp/'])).toEqual([
    { path: 'subs/space name/src/tmp/', ignored: true, rule: { source: '.gitignore', line: 1, pattern: '**/src/tmp/' } },
    { path: 'src/other/', ignored: false, rule: null },
    { path: 'src/tmp/', ignored: true, rule: { source: '.gitignore', line: 1, pattern: '**/src/tmp/' } },
    { path: 'subs/space name/src/tmp/', ignored: true, rule: { source: '.gitignore', line: 1, pattern: '**/src/tmp/' } },
  ]);

  await repository.write('.gitignore', '**/src/tmp/\n!src/tmp/\n');
  await repository.write('subs/notes/src/.gitignore', '!tmp/\n');
  await repository.write('subs/future/src/.gitignore', '!tmp/\n');
  expect(await gitService.ignoreStatus(root, ['src/tmp/', 'subs/notes/src/tmp/'])).toEqual([
    { path: 'src/tmp/', ignored: false, rule: { source: '.gitignore', line: 2, pattern: '!src/tmp/' } },
    { path: 'subs/notes/src/tmp/', ignored: false, rule: { source: 'subs/notes/src/.gitignore', line: 1, pattern: '!tmp/' } },
  ]);
  expect(await gitService.ignoreStatus(root, ['subs/future/src/tmp/'])).toEqual([
    { path: 'subs/future/src/tmp/', ignored: false, rule: { source: 'subs/future/src/.gitignore', line: 1, pattern: '!tmp/' } },
  ]);
  await repository.write('subproject/src/.gitignore', '!tmp/\n');
  await mkdir(join(root, 'subproject/src'), { recursive: true });
  expect(await gitService.ignoreStatus(join(root, 'subproject'), ['src/tmp/'])).toEqual([
    { path: 'src/tmp/', ignored: false, rule: { source: 'subproject/src/.gitignore', line: 1, pattern: '!tmp/' } },
  ]);
}, 30_000);
