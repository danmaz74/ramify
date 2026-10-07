import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/*
 * The identity of the files whose change could weaken a check: the test
 * runner's configuration, the compiler's, the package manifests, the
 * project's configuration for the harness, and whatever else a caller
 * names, such as the contract artifacts an assignment requires, the
 * scenario harness's support files and the tracked feature files. The
 * identity is one hash per file, not one hash over the set, so that what
 * changed is named.
 *
 * Nothing here compares: a caller captures hashes once and asks again later.
 * The working tree's own identity is never taken. A change to a file outside
 * this set is content for the next commit and blocks nothing.
 */

/**
 * The configuration and manifests guarded in every project, relative to its
 * root, `ramify-agent.json` among them. A project that does not have one of them records it as absent.
 */
export const guardedConfigurationFiles: readonly string[] = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mts',
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mts',
  'ramify-agent.json',
];

/**
 * The SHA-256 of each guarded file, in path order, with `null` for one that
 * does not exist. With `paths`, exactly those files, which is how a captured
 * set is asked for again; without, the configuration and manifests above.
 *
 * Paths are project-relative in and out. A path escaping the root is refused,
 * so a captured set can never reach outside the project it describes.
 */
export async function guardedFilesHash(
  root: string,
  paths?: readonly string[],
): Promise<Array<{ readonly path: string; readonly hash: string | null }>> {
  const selected = [...new Set(paths ?? guardedConfigurationFiles)].sort();
  return Promise.all(selected.map(async path => ({ path, hash: await hashWithin(root, path) })));
}

async function hashWithin(root: string, path: string): Promise<string | null> {
  const absolute = isAbsolute(path) ? path : join(root, path);
  const within = relative(resolve(root), resolve(absolute));
  if (within === '' || within.startsWith('..') || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new RangeError(`A guarded path must lie within the project: ${path}`);
  }
  try {
    return createHash('sha256').update(await readFile(absolute)).digest('hex');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return null;
    throw error;
  }
}
