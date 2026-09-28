import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { sha256 } from '../prompts/packages.js';
import { provisionalSourceSchema, type ProvisionalSource } from './records.js';
import { previewCandidateTree } from '../../subs/evidence/src/candidate-tree.js';

const exec = promisify(execFile);

interface SnapshotFile {
  readonly path: string;
  readonly worktree: string | null;
  readonly index: string | null;
  readonly base: string | null;
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
    files.push({ path, worktree: worktree?.toString('base64') ?? null, index: index?.toString('base64') ?? null,
      base: base?.toString('base64') ?? null });
  }
  const delta = files.map(file => ({
    path: file.path,
    before: file.base === null ? null : sha256(Buffer.from(file.base, 'base64')),
    after: file.worktree === null ? null : sha256(Buffer.from(file.worktree, 'base64')),
    staged: stagedPaths.has(file.path),
  }));
  const snapshot = join('capabilities', 'snapshots', `${input.request}.json`).split(sep).join('/');
  const document = { schema: 'ramify-agent.provisional-source/1', acceptedBase: input.acceptedBase,
    writerSettledBy: input.writerSettledBy, files };
  const snapshotHash = sha256(JSON.stringify(document));
  const tree = (await previewCandidateTree(input.projectRoot)).tree;
  const target = join(input.runDirectory, snapshot);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({ ...document, tree, snapshotHash }, null, 2)}\n`, { flag: 'wx', flush: true });
  return provisionalSourceSchema.parse({ acceptedBase: input.acceptedBase, tree, snapshotHash, snapshot, delta,
    writerSettledBy: input.writerSettledBy });
}
