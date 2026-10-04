import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  ScratchIgnoreConflictError, createScratchDirectory, ensureScratchRule,
  releasableScratchModules, removeScratchDirectories, scratchIgnoreConflicts, scratchPath, trackedScratchPaths,
} from '../work/scratch.js';
import { mockGit } from './helpers/mock-git.js';

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'ramify-scratch-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const ignored = (paths: readonly string[]) => paths.map(path => ({ path, ignored: true, rule: { source: '.gitignore', line: 1, pattern: '**/src/tmp/' } }));

describe('scratch ignore setup', () => {
  test.each([
    ['missing', null],
    ['empty', ''],
    ['populated without newline', '# retained\r\nother-rule'],
  ])('appends one rule to a %s .gitignore without changing existing bytes', async (_label, initial) => {
    if (initial !== null) await writeFile(join(root, '.gitignore'), initial);
    const git = mockGit({ async ignoreStatus(project, paths) {
      expect(project).toBe(root);
      expect(paths).toEqual(['src/tmp/', 'subs/notes/src/tmp/']);
      return ignored(paths);
    } });
    expect(await ensureScratchRule(root, ['', 'subs/notes'], git)).toEqual({ appended: true });
    const prefix = initial ?? '';
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe(`${prefix}${prefix !== '' && !prefix.endsWith('\n') ? '\n' : ''}**/src/tmp/\n`);
    expect(git.unexpected).toEqual([]);
  });

  test('a root-only project with /src/tmp/ still receives the general rule, then no duplicate', async () => {
    await writeFile(join(root, '.gitignore'), '/src/tmp/\n');
    const git = mockGit({ async ignoreStatus(_project, paths) { return ignored(paths); } });
    expect(await ensureScratchRule(root, [''], git)).toEqual({ appended: true });
    expect(await ensureScratchRule(root, [''], git)).toEqual({ appended: false });
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('/src/tmp/\n**/src/tmp/\n');
  });

  test.each([
    ['later exception', '**/src/tmp/\n!src/tmp/\n', { source: '.gitignore', line: 2, pattern: '!src/tmp/' }],
    ['nested exception', '# keep\n', { source: 'subs/notes/src/.gitignore', line: 1, pattern: '!tmp/' }],
  ])('%s is a conflict with the deciding rule and does not alter .gitignore', async (_label, initial, rule) => {
    const before = Buffer.from(initial);
    await writeFile(join(root, '.gitignore'), before);
    const git = mockGit({ async ignoreStatus(_project, paths) {
      return paths.map(path => ({ path, ignored: false, rule }));
    } });
    const error = await ensureScratchRule(root, ['subs/notes'], git).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ScratchIgnoreConflictError);
    expect((error as ScratchIgnoreConflictError).conflicts).toEqual([{ path: 'subs/notes/src/tmp/', rule }]);
    expect(await readFile(join(root, '.gitignore'))).toEqual(before);
    expect(await scratchIgnoreConflicts(root, ['subs/notes'], git)).toEqual([{ path: 'subs/notes/src/tmp/', rule }]);
  });

  test('a conflict after creating .gitignore removes the new file', async () => {
    const git = mockGit({ async ignoreStatus(_project, paths) {
      return paths.map(path => ({ path, ignored: false, rule: null }));
    } });
    await expect(ensureScratchRule(root, [''], git)).rejects.toBeInstanceOf(ScratchIgnoreConflictError);
    await expect(stat(join(root, '.gitignore'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('refuses a symlinked project .gitignore without changing its target', async () => {
    await writeFile(join(root, 'outside-ignore'), '# leave\n');
    await symlink(join(root, 'outside-ignore'), join(root, '.gitignore'));
    const git = mockGit();
    await expect(ensureScratchRule(root, [''], git)).rejects.toThrow('symlink');
    expect(await readFile(join(root, 'outside-ignore'), 'utf8')).toBe('# leave\n');
  });
});

test('creation is idempotent and refuses an unignored or symlinked scratch path', async () => {
  await mkdir(join(root, 'subs/notes/src'), { recursive: true });
  const git = mockGit({ async ignoreStatus(_project, paths) { return ignored(paths); } });
  const path = scratchPath(root, 'subs/notes');
  expect(await createScratchDirectory(root, 'subs/notes', git)).toBe(path);
  expect(await createScratchDirectory(root, 'subs/notes', git)).toBe(path);
  expect((await stat(path)).isDirectory()).toBe(true);

  const refused = mockGit({ async ignoreStatus(_project, paths) { return paths.map(path => ({ path, ignored: false, rule: null })); } });
  await expect(createScratchDirectory(root, '', refused)).rejects.toBeInstanceOf(ScratchIgnoreConflictError);
  await mkdir(join(root, 'subs'), { recursive: true });
  await symlink(join(root, 'subs/notes'), join(root, 'subs/link'));
  await expect(createScratchDirectory(root, 'subs/link', git)).rejects.toThrow('symlink');
});

test('removal covers root and nested scratch, leaves other source, and preserves indexed paths and parents', async () => {
  await mkdir(join(root, 'src/tmp/deep'), { recursive: true });
  await mkdir(join(root, 'subs/notes/src/tmp/deep'), { recursive: true });
  await writeFile(join(root, 'src/tmp/deep/free.txt'), 'free');
  await writeFile(join(root, 'src/kept.ts'), 'kept');
  await writeFile(join(root, 'subs/notes/src/tmp/deep/tracked.txt'), 'tracked');
  await writeFile(join(root, 'subs/notes/src/tmp/deep/free.txt'), 'free');
  const tracked = ['subs/notes/src/tmp/deep/tracked.txt'];
  const git = mockGit({ async trackedPaths(project, dirs) {
    expect(project).toBe(root);
    expect(dirs).toEqual(['src/tmp', 'subs/notes/src/tmp']);
    return tracked;
  } });
  expect(await trackedScratchPaths(root, ['', 'subs/notes'], git)).toEqual(tracked);
  expect(await removeScratchDirectories(root, ['', 'subs/notes'], git)).toEqual({ preservedTracked: tracked });
  await expect(stat(join(root, 'src/tmp'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(join(root, 'src/kept.ts'), 'utf8')).toBe('kept');
  expect(await readFile(join(root, tracked[0]!), 'utf8')).toBe('tracked');
  await expect(stat(join(root, 'subs/notes/src/tmp/deep/free.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});

test('a durable superseded result releases all owners except those held by an open assignment', async () => {
  const assignments = [
    { id: 'wi-001.i01', modules: ['subs/notes', 'subs/tags'] },
    { id: 'wi-002.i01', modules: ['subs/tags'] },
  ];
  const superseded = new Set(['wi-001.i01']);
  expect(releasableScratchModules('wi-001.i01', assignments, superseded)).toEqual(['subs/notes']);
  expect(releasableScratchModules('wi-002.i01', assignments, superseded)).toEqual([]);
  await mkdir(join(root, 'subs/notes/src/tmp'), { recursive: true });
  await mkdir(join(root, 'subs/tags/src/tmp'), { recursive: true });
  await writeFile(join(root, 'subs/notes/src/tmp/draft.txt'), 'notes');
  await writeFile(join(root, 'subs/tags/src/tmp/draft.txt'), 'tags');
  const git = mockGit({ async trackedPaths() { return []; } });
  await removeScratchDirectories(root, releasableScratchModules('wi-001.i01', assignments, superseded), git);
  await expect(readFile(join(root, 'subs/notes/src/tmp/draft.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(join(root, 'subs/tags/src/tmp/draft.txt'), 'utf8')).toBe('tags');
  const bothClosed = new Set(['wi-001.i01', 'wi-002.i01']);
  expect(releasableScratchModules('wi-001.i01', assignments, bothClosed)).toEqual(['subs/notes', 'subs/tags']);
  await removeScratchDirectories(root, releasableScratchModules('wi-001.i01', assignments, bothClosed), git);
  await expect(readFile(join(root, 'subs/tags/src/tmp/draft.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});

test('removal refuses a symlinked scratch directory without entering its target', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'ramify-scratch-outside-'));
  try {
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(outside, 'kept.txt'), 'kept');
    await symlink(outside, join(root, 'src/tmp'));
    const git = mockGit({ async trackedPaths() { return []; } });
    await expect(removeScratchDirectories(root, [''], git)).rejects.toThrow('symlink');
    expect(await readFile(join(outside, 'kept.txt'), 'utf8')).toBe('kept');
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});
