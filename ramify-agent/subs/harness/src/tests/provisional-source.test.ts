import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { captureProvisionalSource } from '../capability/source.js';
import { copyCapabilityFixture } from './helpers/capability.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { fixtureScratchGit, mockGit } from './helpers/mock-git.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';

vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
const cleanups: Array<() => Promise<void>> = [];
beforeEach(resetSpawnAttempts);
afterEach(async () => {
  try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); }
  finally { expect(spawnAttempts()).toEqual([]); }
});

test('CA19 CA30 injected capture/reconcile preserve distinct binary bytes and refuse changed index/tree', async () => {
  const fixture = await copyCapabilityFixture(); const directory = await temporaryDirectory();
  cleanups.push(fixture.remove, directory.remove);
  const path = 'subs/a/src/caller.ts';
  const base = Buffer.from([0, 255, 128]); const index = Buffer.from([1, 254, 129]); const worktree = Buffer.from([2, 253, 130]);
  await writeFile(join(fixture.root, path), worktree);
  let liveTree = '1'.repeat(40); let liveIndex = index;
  const git = fixtureScratchGit(mockGit({ async previewCandidateTree(root) {
    expect(root).toBe(fixture.root); return { repositoryRoot: root, head: 'base', tree: liveTree };
  } }));
  const sourceGit = {
    async stagedPaths(root: string) { expect(root).toBe(fixture.root); return [path]; },
    async readBlob(root: string, revision: string, asked: string) {
      expect(root).toBe(fixture.root); expect(asked).toBe(path); expect(['base', '']).toContain(revision);
      return revision === 'base' ? base : liveIndex;
    },
  };
  const input = { projectRoot: fixture.root, runDirectory: directory.path, request: 'need-001', acceptedBase: 'base',
    writerSettledBy: 'inv-0001', changedPaths: [path], git, sourceGit };
  const captured = await captureProvisionalSource(input);
  const bytes = await readFile(join(directory.path, captured.snapshot));
  const manifest = JSON.parse(bytes.toString()) as { files: Array<{ base: string; index: string; worktree: string }> };
  expect(manifest.files).toEqual([{ path, base: base.toString('base64'), index: index.toString('base64'), worktree: worktree.toString('base64'), staged: true }]);
  expect(captured.delta).toEqual([{ path, before: createHash('sha256').update(base).digest('hex'), after: createHash('sha256').update(worktree).digest('hex'), staged: true }]);
  expect(await captureProvisionalSource(input)).toEqual(captured);
  liveIndex = Buffer.from([9]);
  await expect(captureProvisionalSource(input)).rejects.toThrow('differs in the index');
  liveIndex = index; liveTree = '2'.repeat(40);
  await expect(captureProvisionalSource(input)).rejects.toThrow('differs from the live candidate');
  expect(await readFile(join(directory.path, captured.snapshot))).toEqual(bytes);
  expect(await readFile(join(fixture.root, path))).toEqual(worktree);
  expect(git.unexpected).toEqual([]);
});
