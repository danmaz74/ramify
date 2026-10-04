import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { sha256 } from '../prompts/packages.js';
import { provisionalSourceSchema, type ProvisionalSource } from './records.js';
import { previewCandidateTree } from '../../subs/evidence/src/candidate-tree.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { declaredModuleDirectories } from '../run/project-config.js';
import { assertScratchSafe } from '../work/scratch.js';

const exec = promisify(execFile);

interface SnapshotFile {
  readonly path: string;
  readonly worktree: string | null;
  readonly index: string | null;
  readonly base: string | null;
  readonly staged: boolean;
}

interface SnapshotDocument {
  readonly schema: 'ramify-agent.provisional-source/1';
  readonly acceptedBase: string;
  readonly writerSettledBy: string;
  readonly files: readonly SnapshotFile[];
  readonly tree: string;
  readonly snapshotHash: string;
}

function sourceOf(document: SnapshotDocument, snapshot: string): ProvisionalSource {
  const delta = document.files.map(file => ({
    path: file.path,
    before: file.base === null ? null : sha256(Buffer.from(file.base, 'base64')),
    after: file.worktree === null ? null : sha256(Buffer.from(file.worktree, 'base64')),
    staged: file.staged,
  }));
  return provisionalSourceSchema.parse({ acceptedBase: document.acceptedBase, tree: document.tree,
    snapshotHash: document.snapshotHash, snapshot, delta, writerSettledBy: document.writerSettledBy });
}

/** A snapshot is written before its request event. A retry may adopt that
 * uncommitted effect only when its exact bytes and candidate tree still match.
 * A changed worktree is left untouched for an explicit recovery decision. */
export async function reconcileProvisionalSource(input: {
  readonly projectRoot: string;
  readonly runDirectory: string;
  readonly request: string;
  readonly acceptedBase: string;
  readonly writerSettledBy: string;
}): Promise<ProvisionalSource | null> {
  const snapshot = join('capabilities', 'snapshots', `${input.request}.json`).split(sep).join('/');
  let document: SnapshotDocument;
  try {
    document = JSON.parse(await readFile(join(input.runDirectory, snapshot), 'utf8')) as SnapshotDocument;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (document.schema !== 'ramify-agent.provisional-source/1' ||
    document.acceptedBase !== input.acceptedBase || document.writerSettledBy !== input.writerSettledBy ||
    !Array.isArray(document.files)) throw new Error(`Provisional snapshot ${snapshot} has a conflicting basis`);
  const { tree, snapshotHash, ...content } = document;
  if (sha256(JSON.stringify(content)) !== snapshotHash) throw new Error(`Provisional snapshot ${snapshot} has invalid bytes`);
  await assertScratchSafe(input.projectRoot, await declaredModuleDirectories(input.projectRoot), gitService);
  if ((await previewCandidateTree(input.projectRoot)).tree !== tree) {
    throw new Error(`Provisional snapshot ${snapshot} differs from the live candidate; source was preserved`);
  }
  for (const file of document.files) {
    if (isAbsolute(file.path) || file.path.split('/').includes('..') || file.path.includes('\\')) {
      throw new Error(`Provisional snapshot ${snapshot} contains an invalid path`);
    }
    const current = await readFile(join(input.projectRoot, file.path)).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    if ((current?.toString('base64') ?? null) !== file.worktree) {
      throw new Error(`Provisional snapshot ${snapshot} differs at ${file.path}; source was preserved`);
    }
    const index = await gitBlob(input.projectRoot, '', file.path);
    const base = await gitBlob(input.projectRoot, input.acceptedBase, file.path);
    if ((index?.toString('base64') ?? null) !== (file.staged ? file.index : file.base) ||
      (base?.toString('base64') ?? null) !== file.base) {
      throw new Error(`Provisional snapshot ${snapshot} differs in the index at ${file.path}; source was preserved`);
    }
  }
  return sourceOf(document, snapshot);
}

async function gitBlob(root: string, revision: string, path: string): Promise<Buffer | null> {
  try {
    const result = await exec('git', ['show', `${revision}:${path}`], { cwd: root, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
    return Buffer.from(result.stdout);
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 128) return null;
    throw error;
  }
}

/** Capture the settled, provisional candidate without changing its live tree.
 * The manifest retains worktree and index bytes separately, so staged edits,
 * untracked source and deletions survive a restart with attribution. */
export async function captureProvisionalSource(input: {
  readonly projectRoot: string;
  readonly runDirectory: string;
  readonly request: string;
  readonly acceptedBase: string;
  readonly writerSettledBy: string;
  readonly changedPaths: readonly string[];
}): Promise<ProvisionalSource> {
  const existing = await reconcileProvisionalSource(input);
  if (existing !== null) return existing;
  const staged = await exec('git', ['diff', '--cached', '--name-only', '-z'], { cwd: input.projectRoot });
  const stagedPaths = new Set(staged.stdout.split('\0').filter(Boolean));
  const files: SnapshotFile[] = [];
  for (const path of [...new Set(input.changedPaths)].sort()) {
    if (isAbsolute(path) || path.split('/').includes('..') || path.includes('\\') || path.trim() === '') {
      throw new Error(`Invalid provisional source path ${path}`);
    }
    const absolute = join(input.projectRoot, path);
    const beneath = relative(input.projectRoot, absolute);
    if (beneath.startsWith(`..${sep}`) || beneath === '..') throw new Error(`Path escapes the project: ${path}`);
    const worktree = await readFile(absolute).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    const index = stagedPaths.has(path) ? await gitBlob(input.projectRoot, '', path) : null;
    const base = await gitBlob(input.projectRoot, input.acceptedBase, path);
    files.push({ path, staged: stagedPaths.has(path), worktree: worktree?.toString('base64') ?? null, index: index?.toString('base64') ?? null,
      base: base?.toString('base64') ?? null });
  }
  const snapshot = join('capabilities', 'snapshots', `${input.request}.json`).split(sep).join('/');
  const document = { schema: 'ramify-agent.provisional-source/1' as const, acceptedBase: input.acceptedBase,
    writerSettledBy: input.writerSettledBy, files };
  const snapshotHash = sha256(JSON.stringify(document));
  await assertScratchSafe(input.projectRoot, await declaredModuleDirectories(input.projectRoot), gitService);
  const tree = (await previewCandidateTree(input.projectRoot)).tree;
  const target = join(input.runDirectory, snapshot);
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(target, `${JSON.stringify({ ...document, tree, snapshotHash }, null, 2)}\n`, { flag: 'wx', flush: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      const recovered = await reconcileProvisionalSource(input);
      if (recovered !== null) return recovered;
    }
    throw error;
  }
  return sourceOf({ ...document, tree, snapshotHash }, snapshot);
}
