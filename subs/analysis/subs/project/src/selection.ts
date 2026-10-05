import { dirname, join, resolve } from 'node:path';
import { Capture } from './capture.js';
import { AcquisitionError } from './data.js';
import { descriptionMarker } from './marker.js';
import type { RootMarkerReader } from '../../descriptions/src/interfaces/syntax.js';
import type { ProjectRequest } from './interfaces/project.js';

/** One description selection read, by canonical path, and whether it carried the root marker. */
export interface MarkerAnswer {
  readonly path: string;
  readonly marked: boolean;
}
export interface SelectedRoot {
  readonly root: string;
  readonly invokedFrom: string;
  readonly selection: 'given' | 'found';
  /** Every description read, in reading order. */
  readonly markers: readonly MarkerAnswer[];
}

/**
 * The description in one directory: absent, a regular file with or without
 * the marker, or another kind. Selection reads only a regular file; a linked
 * or other entry is never followed, so it is a candidate as before and its
 * own rules reject it.
 */
async function described(capture: Capture, directory: string, read: RootMarkerReader,
  markers: MarkerAnswer[]): Promise<'absent' | 'marked' | 'unmarked' | 'unread'> {
  const path = join(directory, 'module.ramify');
  if (!await capture.hasExactEntry(path)) return 'absent';
  if (await capture.kind(path) !== 'file') return 'unread';
  const bytes = await capture.bytes(path, 'description');
  const marked = bytes !== undefined && descriptionMarker(path, bytes, read) !== null;
  markers.push({ path, marked });
  return marked ? 'marked' : 'unmarked';
}
/**
 * Select the root by the root marker. Without `--root`, the nearest
 * description at or above the canonical working directory that carries it;
 * unmarked descriptions never stop the climb. `--root` must name a directory
 * whose description carries it.
 */
export async function selectRoot(capture: Capture, request: ProjectRequest, read: RootMarkerReader): Promise<SelectedRoot> {
  const cwd = resolve(request.cwd);
  const invokedFrom = await capture.realPath(cwd);
  if (!invokedFrom || !await capture.directoryExists(cwd)) throw new AcquisitionError('root-not-found', cwd, 'Working directory does not exist');
  const markers: MarkerAnswer[] = [];
  if (request.root !== undefined) {
    const given = resolve(cwd, request.root);
    if (await capture.kind(given) === 'symlink') throw new AcquisitionError('symlink-root', given, 'The selected root must not be a symlink');
    const root = await capture.realPath(given);
    if (!root || !await capture.directoryExists(root) || !await capture.hasExactEntry(join(root, 'module.ramify'))) {
      throw new AcquisitionError('missing-root-description', join(given, 'module.ramify'), 'Explicit root requires module.ramify');
    }
    if (await described(capture, root, read, markers) === 'unmarked') {
      const path = join(given, 'module.ramify');
      throw new AcquisitionError('unmarked-root-description', path, unmarkedRoot(path));
    }
    return { root, invokedFrom, selection: 'given', markers };
  }
  let nearest: string | undefined;
  for (let directory = invokedFrom;; directory = dirname(directory)) {
    const state = await described(capture, directory, read, markers);
    if (state === 'marked' || state === 'unread') return { root: directory, invokedFrom, selection: 'found', markers };
    if (state === 'unmarked') nearest ??= join(directory, 'module.ramify');
    if (dirname(directory) === directory) break;
  }
  throw new AcquisitionError('root-not-found', invokedFrom, nearest === undefined
    ? `No marked project root at or above ${invokedFrom}`
    : `No marked project root at or above ${invokedFrom}; the nearest description is ${nearest}: add root before module on its module line if it is the project root`);
}
/** The message of a selected root description without the marker. */
export const unmarkedRoot = (path: string): string =>
  `${path} does not carry the root marker: add root before module on its module line to declare the project root`;
export async function findConfiguration(capture: Capture): Promise<string> {
  for (let directory = capture.root;; directory = dirname(directory)) {
    const path = join(directory, 'tsconfig.json');
    if (await capture.fileExists(path)) return await capture.realPath(path) ?? path;
    if (dirname(directory) === directory) throw new AcquisitionError('configuration-not-found', capture.root, 'No tsconfig.json at the root or its ancestors');
  }
}
