import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The checkout's ignore rules that apply at any depth, from this package's
 * `.gitignore` and the reference example's: installed packages (a directory or
 * a linked entry), build output, harness work copies, editor and tool state,
 * and Ramify's generated views with their transient siblings and marker files.
 */
const ignoredEntries = new Set(['node_modules']);
const ignoredDirectories = new Set(['dist', '.reference-work', '.history', '.playwright-mcp', '.cucumber-viz']);
const generatedDirectory = /^\.ramify(?:-architect)?(?:\.(?:tmp|old)-.+)?$/;
const ignoredFile = (name: string): boolean => name === 'cucumber-viz.config.local.json'
  || /^\.ramify(?:-architect)?\.(?:tmp|old)-.+\.marker\.json$/.test(name);
const ignoredDirectory = (name: string): boolean => ignoredDirectories.has(name) || generatedDirectory.test(name) || name.endsWith('.viz.feature.meta');

/**
 * The files under `paths` (files or directories, relative to `root`) that the
 * checkout tracks or would track, `/`-separated and byte-ordered: what
 * `git ls-files --cached --others --exclude-standard` lists for them in a
 * checkout, without Git, so a plain copy of the package lists the same files.
 * A symbolic link is listed as one entry and never followed.
 */
export async function checkoutFiles(root: string, paths: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  async function visit(path: string, name: string): Promise<void> {
    const entry = await lstat(join(root, path)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!entry || ignoredEntries.has(name)) return;
    if (entry.isDirectory()) {
      if (ignoredDirectory(name)) return;
      for (const child of await readdir(join(root, path))) await visit(`${path}/${child}`, child);
    } else if (!ignoredFile(name)) files.push(path);
  }
  for (const path of paths) await visit(path, path.split('/').at(-1)!);
  return files.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}
