import { dirname, join, resolve, basename } from 'node:path';
import { Capture } from './capture.js';
import { AcquisitionError, within } from './data.js';
import type { ProjectRequest } from './interfaces/project.js';

async function marker(capture: Capture, directory: string): Promise<boolean> {
  return capture.hasExactEntry(join(directory, 'module.ramify'));
}
async function nearest(capture: Capture, start: string): Promise<string | undefined> {
  for (let directory = start;; directory = dirname(directory)) {
    if (await marker(capture, directory)) return directory;
    if (dirname(directory) === directory) return undefined;
  }
}
export async function selectRoot(capture: Capture, request: ProjectRequest): Promise<{ root: string; invokedFrom: string; selection: 'given' | 'found' }> {
  const cwd = resolve(request.cwd);
  const invokedFrom = await capture.realPath(cwd);
  if (!invokedFrom || !await capture.directoryExists(cwd)) throw new AcquisitionError('root-not-found', cwd, 'Working directory does not exist');
  if (request.root !== undefined) {
    const given = resolve(cwd, request.root);
    if (await capture.kind(given) === 'symlink') throw new AcquisitionError('symlink-root', given, 'The selected root must not be a symlink');
    const root = await capture.realPath(given);
    if (!root || !await capture.directoryExists(root) || !await marker(capture, root)) {
      throw new AcquisitionError('missing-root-description', join(given, 'module.ramify'), 'Explicit root requires module.ramify');
    }
    return { root, invokedFrom, selection: 'given' };
  }
  const found = await nearest(capture, invokedFrom);
  if (!found) throw new AcquisitionError('root-not-found', invokedFrom, `No ramified project at or above ${invokedFrom}`);
  let candidate: string = found;
  for (;;) {
    const ancestor: string | undefined = dirname(candidate) === candidate ? undefined : await nearest(capture, dirname(candidate));
    if (ancestor && candidate !== join(ancestor, 'subs') && within(join(ancestor, 'subs'), candidate)) {
      candidate = ancestor; continue;
    }
    if (basename(dirname(candidate)) === 'subs' && !await marker(capture, dirname(dirname(candidate)))) {
      throw new AcquisitionError('missing-root-description', join(dirname(dirname(candidate)), 'module.ramify'), 'A child directly beneath subs requires its parent description');
    }
    return { root: candidate, invokedFrom, selection: 'found' };
  }
}
export async function findConfiguration(capture: Capture): Promise<string> {
  for (let directory = capture.root;; directory = dirname(directory)) {
    const path = join(directory, 'tsconfig.json');
    if (await capture.fileExists(path)) return await capture.realPath(path) ?? path;
    if (dirname(directory) === directory) throw new AcquisitionError('configuration-not-found', capture.root, 'No tsconfig.json at the root or its ancestors');
  }
}
