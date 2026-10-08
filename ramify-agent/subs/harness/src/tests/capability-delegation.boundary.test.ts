import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { gitService } from '../../subs/evidence/src/git.js';
import { copyCapabilityFixture } from './helpers/capability.js';
import { git, initRepository } from './helpers/runs.js';
import { captureProvisionalSource } from '../capability/source.js';
import { temporaryDirectory } from './helpers/fixture.js';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('CA30: provisional snapshot keeps staged, worktree, untracked and deleted bytes separately', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const run = await temporaryDirectory();
  cleanups.push(run.remove);
  const base = await initRepository(fixture.root);
  const tracked = 'subs/a/src/caller.ts';
  await writeFile(join(fixture.root, tracked), 'export const staged = true;\n');
  await git(fixture.root, 'add', tracked);
  await writeFile(join(fixture.root, tracked), 'export const worktree = true;\n');
  await writeFile(join(fixture.root, 'subs/a/src/extra.ts'), 'export const untracked = true;\n');
  await rm(join(fixture.root, 'subs/d/src/consumer.ts'));
  const captured = await captureProvisionalSource({
    projectRoot: fixture.root, runDirectory: run.path, request: 'need-001', acceptedBase: base,
    writerSettledBy: 'inv-0001', changedPaths: await gitService.changedPaths(fixture.root, base),
  });
  const manifest = JSON.parse(await readFile(join(run.path, captured.snapshot), 'utf8')) as {
    files: Array<{ path: string; worktree: string | null; index: string | null; base: string | null }>;
    tree: string; snapshotHash: string;
  };
  expect(captured.tree).toBe(manifest.tree);
  expect(captured.snapshotHash).toBe(manifest.snapshotHash);
  expect(captured.tree).not.toBe(captured.snapshotHash);
  expect((await git(fixture.root, 'cat-file', '-t', captured.tree)).trim()).toBe('tree');
  expect((await git(fixture.root, 'diff', '--name-only', captured.tree, base)).trim().split('\n'))
    .toContain('subs/a/src/extra.ts');
  const staged = manifest.files.find(file => file.path === tracked)!;
  expect(Buffer.from(staged.index!, 'base64').toString()).toContain('staged = true');
  expect(Buffer.from(staged.worktree!, 'base64').toString()).toContain('worktree = true');
  expect(captured.delta.find(file => file.path === tracked)?.staged).toBe(true);
  const untracked = manifest.files.find(file => file.path === 'subs/a/src/extra.ts')!;
  expect(untracked.base).toBeNull();
  expect(untracked.index).toBeNull();
  expect(Buffer.from(untracked.worktree!, 'base64').toString()).toContain('untracked = true');
  const deleted = manifest.files.find(file => file.path === 'subs/d/src/consumer.ts')!;
  expect(deleted.worktree).toBeNull();
  expect(deleted.base).not.toBeNull();
});
