import { mkdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { isContained, resolveRealTarget } from '../guard/resolve-contained-path.js';
import { directoryOf } from './scope.js';
import type { WriteScope } from './iterations.js';

/** The first recorded base module is where an ordinary engineer starts. */
export async function engineerWorkingDirectory(projectRoot: string, scope: WriteScope, index: ArchitectIndex | null): Promise<string> {
  const module = 'module' in scope.base ? scope.base.module : scope.base.modules[0]!;
  const declared = directoryOf(index, module);
  const candidates = scope.bootstrap.filter(entry => entry.directory.split('/').at(-1) === module.split('/').at(-1));
  if (declared === null && candidates.length !== 1) throw new Error(`The assigned base module ${module} has no unambiguous bootstrap directory`);
  const bootstrap = candidates.length === 1 ? candidates[0] : undefined;
  const directory = declared ?? bootstrap?.directory;
  if (directory === undefined || directory === null) throw new Error(`The assigned base module ${module} has no resolved directory`);
  const target = await resolveRealTarget(projectRoot, join(directory, 'src'));
  if (!target.ok) throw new Error(`The assigned base module ${module} has no resolvable src directory: ${target.reason}`);
  const src = target.resolved;
  // Captured write authority, rather than the current view, must contain the
  // source directory. This also prevents a stale or ambiguous bootstrap name
  // from creating a directory outside the assignment.
  if (!isContained(projectRoot, src) || !scope.resolved.roots.some(root => root === src || isContained(root, src))) {
    throw new Error(`The source directory ${src} is outside the assigned write scope`);
  }
  const exists = await stat(src).catch(() => null);
  if (exists === null) {
    if (bootstrap?.directory !== directory) throw new Error(`The assigned base module ${module} has no src directory at ${src}`);
    await mkdir(src, { recursive: true });
  } else if (!exists.isDirectory()) {
    throw new Error(`The assigned base module ${module} has no src directory at ${src}`);
  }
  const canonical = await realpath(src);
  if (!scope.resolved.roots.some(root => root === canonical || isContained(root, canonical))) {
    throw new Error(`The source directory ${canonical} is outside the assigned write scope`);
  }
  return canonical;
}

/** A repair starts in an existing module source directory; it never bootstraps one. */
export async function repairWorkingDirectory(projectRoot: string, module: string, index: ArchitectIndex | null): Promise<string> {
  const directory = directoryOf(index, module);
  if (directory === null) throw new Error(`Repair starting module ${module} is not in the current architect view`);
  const target = await resolveRealTarget(projectRoot, join(directory, 'src'));
  if (!target.ok || !isContained(projectRoot, target.resolved)) {
    throw new Error(`Repair starting module ${module} has no contained src directory`);
  }
  const found = await stat(target.resolved).catch(() => null);
  if (!found?.isDirectory()) throw new Error(`Repair starting module ${module} has no existing src directory`);
  return await realpath(target.resolved);
}
