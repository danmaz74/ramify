import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

/**
 * The one destination a trial writes its evidence to: resolved through the
 * real paths of the project and of the destination's directory, outside the
 * analyzed project, and never a symbolic link. The scripts and the fixture
 * trials guard their outputs with it alike.
 */
export async function trialReportDestination(project: string, destination: string): Promise<string> {
  const absolute = resolve(destination); const root = await realpath(project);
  const parent = await realpath(dirname(absolute)); const target = join(parent, basename(absolute));
  const relation = relative(root, target);
  if (relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`) && !relation.startsWith(sep))) throw new Error('Trial verification output must be outside the analyzed project');
  const existing = await lstat(target).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
  if (existing?.isSymbolicLink()) throw new Error('Trial verification output must not be a symlink');
  return target;
}
