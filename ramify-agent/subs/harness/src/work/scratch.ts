import { lstat, mkdir, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitService, IgnoreRule } from '../../subs/evidence/src/git.js';

/** The general project rule also covers modules introduced after setup. */
export const scratchIgnoreRule = '**/src/tmp/';

/** A module directory is a project-relative filesystem path, not its declared name. */
function scratchRelativePath(moduleDir: string): string {
  if (moduleDir !== '' && (moduleDir.startsWith('/') || moduleDir.includes('\\') || moduleDir.includes('\0') ||
    moduleDir.split('/').some(part => part === '' || part === '.' || part === '..'))) {
    throw new Error(`Invalid module directory for scratch: ${moduleDir}`);
  }
  return moduleDir === '' ? 'src/tmp' : `${moduleDir}/src/tmp`;
}

/** The assigned module's scratch directory, within its ordinary source area. */
export function scratchPath(projectRoot: string, moduleDir: string): string {
  return join(projectRoot, scratchRelativePath(moduleDir));
}

function scratchDirectories(moduleDirs: readonly string[]): string[] {
  return [...new Set(moduleDirs.map(scratchRelativePath))].sort();
}

/** All indexed paths under the supplied modules' scratch, even when unchanged. */
export async function trackedScratchPaths(projectRoot: string, moduleDirs: readonly string[], git: GitService): Promise<readonly string[]> {
  return git.trackedPaths(projectRoot, scratchDirectories(moduleDirs));
}

/** The reason Git currently allows a scratch directory into the candidate. */
export interface ScratchIgnoreConflict {
  readonly path: string;
  readonly rule: IgnoreRule | null;
}

export class ScratchIgnoreConflictError extends Error {
  constructor(readonly conflicts: readonly ScratchIgnoreConflict[]) {
    super(`Scratch is not ignored: ${conflicts.map(conflict =>
      `${conflict.path}${conflict.rule === null ? ' (no matching rule)' : ` (${conflict.rule.source}:${conflict.rule.line}: ${conflict.rule.pattern})`}`,
    ).join(', ')}`);
    this.name = 'ScratchIgnoreConflictError';
  }
}

/** Verify the effective rule, including later negations and nested ignore files. */
export async function scratchIgnoreConflicts(projectRoot: string, moduleDirs: readonly string[], git: GitService): Promise<readonly ScratchIgnoreConflict[]> {
  for (const moduleDir of moduleDirs) await refuseSymlinkedScratch(projectRoot, moduleDir);
  const paths = scratchDirectories(moduleDirs).map(path => `${path}/`);
  const statuses = await git.ignoreStatus(projectRoot, paths);
  return statuses.filter(status => !status.ignored).map(status => ({ path: status.path, rule: status.rule }));
}

/**
 * Append the one general rule if absent, then verify every current module.
 * A failed verification restores the exact prior bytes (or removes a newly
 * created file), leaving both runs and single sessions unchanged.
 */
export async function ensureScratchRule(projectRoot: string, moduleDirs: readonly string[], git: GitService): Promise<{ readonly appended: boolean }> {
  const path = join(projectRoot, '.gitignore');
  const info = await lstat(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (info?.isSymbolicLink()) throw new Error(`Project .gitignore is a symlink: ${path}`);
  const before = await readFile(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  const text = before?.toString('utf8') ?? '';
  const present = text.split('\n').some(line => line.replace(/\r$/u, '') === scratchIgnoreRule);
  const appended = !present;
  if (appended) {
    const suffix = before === null || before.length === 0 || before.at(-1) === 10 ? '' : '\n';
    await writeFile(path, Buffer.concat([before ?? Buffer.alloc(0), Buffer.from(`${suffix}${scratchIgnoreRule}\n`)]));
  }
  try {
    const conflicts = await scratchIgnoreConflicts(projectRoot, moduleDirs, git);
    if (conflicts.length > 0) throw new ScratchIgnoreConflictError(conflicts);
    return { appended };
  } catch (error) {
    if (appended) {
      if (before === null) await rm(path, { force: true });
      else await writeFile(path, before);
    }
    throw error;
  }
}

/** Check each existing path component before a filesystem operation enters scratch. */
async function refuseSymlinkedScratch(projectRoot: string, moduleDir: string): Promise<void> {
  let current = projectRoot;
  for (const component of scratchRelativePath(moduleDir).split('/')) {
    current = join(current, component);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`Scratch path uses a symlink: ${current}`);
    if (!info.isDirectory()) throw new Error(`Scratch path uses a nondirectory: ${current}`);
  }
}

/** Refuse unignored scratch before creating its directory. Repeated calls are safe. */
export async function createScratchDirectory(projectRoot: string, moduleDir: string, git: GitService): Promise<string> {
  const [conflict] = await scratchIgnoreConflicts(projectRoot, [moduleDir], git);
  if (conflict !== undefined) throw new ScratchIgnoreConflictError([conflict]);
  await refuseSymlinkedScratch(projectRoot, moduleDir);
  const path = scratchPath(projectRoot, moduleDir);
  await mkdir(path, { recursive: true });
  return path;
}

/**
 * Remove scratch in the supplied modules while preserving every indexed path
 * and the directories above it. Symlinks within scratch are unlinked, never
 * followed; a symlink in the scratch path itself refuses cleanup.
 */
export async function removeScratchDirectories(projectRoot: string, moduleDirs: readonly string[], git: GitService): Promise<{ readonly preservedTracked: readonly string[] }> {
  const directories = scratchDirectories(moduleDirs);
  const preservedTracked = await git.trackedPaths(projectRoot, directories);
  const protectedPaths = new Set(preservedTracked);
  for (const directory of directories) {
    const moduleDir = directory === 'src/tmp' ? '' : directory.slice(0, -'/src/tmp'.length);
    await refuseSymlinkedScratch(projectRoot, moduleDir);
    await removeDirectory(join(projectRoot, directory), directory);
  }
  return { preservedTracked };

  async function removeDirectory(path: string, relative: string): Promise<boolean> {
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`Scratch directory uses a symlink: ${path}`);
    if (!info.isDirectory()) throw new Error(`Scratch path is not a directory: ${path}`);
    let kept = false;
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const childRelative = `${relative}/${entry.name}`;
      const child = join(path, entry.name);
      if (protectedPaths.has(childRelative)) { kept = true; continue; }
      if (entry.isDirectory()) {
        if (await removeDirectory(child, childRelative)) kept = true;
      } else {
        await rm(child);
      }
    }
    if (!kept) await rmdir(path);
    return kept;
  }
}
