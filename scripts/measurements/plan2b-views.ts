import { spawn } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath, stat, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Plan 2B's isolated project copies, architect view trees and specified
 * architect limits, shared by `plan2b.mjs`, `plan2c.mjs` and the reference
 * harness's `plan2b-cases.ts`. They live with the measurements, outside the
 * harness tree, so the measurements import nothing from the tree.
 */

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
export const viewName = '.ramify-architect';
/** Generated names never copied into an isolated project: Plan 2A's and Plan 2B's reserved directories. */
export const generatedName = /^\.ramify(?:-architect)?(?:\.(?:tmp|old)-.+)?$/;
/** Top-level toolkit paths that are not the toolkit project, as Plan 2A's isolated copies exclude them. */
const toolkitExcluded = new Set(['examples', 'site', '.cucumber-viz', '.claude', '.agents', '.devcontainer', '.github', '.reference-work']);

/** The architect limits the specification and contracts C2 and C3 fix, transcribed independently of the daemon. */
export const specifiedArchitectLimits = {
  details: { maxSignatureBytes: 240, maxDocumentationBytes: 280, maxOverloads: 4, maxResultBytes: 32 * 1024 ** 2 },
  tests: { maxTitleBytes: 240, maxTitlesPerRecord: 40, maxResultBytes: 16 * 1024 ** 2 },
  maxProjectionBytes: 64 * 1024 ** 2,
} as const;

export type ProjectKind = 'reference' | 'toolkit';

export function git(cwd: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [], err: Buffer[] = [];
    child.stdout.on('data', chunk => out.push(chunk));
    child.stderr.on('data', chunk => err.push(chunk));
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`git ${args.join(' ')}: ${Buffer.concat(err).toString()}`)));
  });
}

/**
 * An isolated copy of the reference project or the toolkit: its tracked and
 * untracked unignored files, with `node_modules` linked to the source's own.
 * Generated view directories are never copied, so every copy starts without a view.
 */
export async function copyProject(kind: ProjectKind, destination: string): Promise<string> {
  const source = kind === 'reference' ? join(repositoryRoot, 'examples/collection-review') : repositoryRoot;
  const listed = (await git(source, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).toString('utf8').split('\0').filter(Boolean);
  const files = [...new Set(listed)].filter(path => {
    const segments = path.split('/');
    if (segments.some(segment => generatedName.test(segment))) return false;
    return kind === 'reference' || !toolkitExcluded.has(segments[0]!);
  });
  await mkdir(destination, { recursive: true });
  for (const path of files) {
    const from = join(source, path);
    let info;
    try { info = await lstat(from); } catch { continue; } // deleted in the working tree
    if (!info.isFile()) continue;
    await mkdir(dirname(join(destination, path)), { recursive: true });
    await writeFile(join(destination, path), await readFile(from));
  }
  await symlink(join(source, 'node_modules'), join(destination, 'node_modules'));
  return realpath(destination);
}

export interface ViewFileStat { readonly bytes: number; readonly mtimeMs: number; readonly ino: number }

/** Every file of a view directory by its path relative to the view root; refuses anything but files and directories. */
export async function readViewTree(root: string): Promise<{ readonly files: Map<string, string>; readonly stats: Map<string, ViewFileStat> }> {
  const base = join(root, viewName);
  const files = new Map<string, string>(), stats = new Map<string, ViewFileStat>();
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const key = relative(base, path).split('\\').join('/');
        const info = await stat(path);
        files.set(key, await readFile(path, 'utf8'));
        stats.set(key, { bytes: info.size, mtimeMs: info.mtimeMs, ino: info.ino });
      } else throw new Error(`A view entry is neither a file nor a directory: ${path}`);
    }
  }
  await walk(base);
  return { files: new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)), stats };
}

/** The tree with one revision identifier replaced, and where it occurred. */
export function withoutRevision(files: ReadonlyMap<string, string>, revision: string): { readonly files: Map<string, string>; readonly occurrences: Map<string, number> } {
  const out = new Map<string, string>(), occurrences = new Map<string, number>();
  for (const [path, text] of files) {
    const parts = text.split(revision);
    if (parts.length > 1) occurrences.set(path, parts.length - 1);
    out.set(path, parts.join('<revision>'));
  }
  return { files: out, occurrences };
}
