import { byteOrder, freeze } from './data.js';
import { isRamifyGeneratedSegment } from './generated-path.js';
import type { TextSpan } from '../../descriptions/src/interfaces/syntax.js';
import type { InventoryModule, PathOwner, PathOwnership, ProjectExclusion, ProjectOwnership, ProjectScope } from './interfaces/project.js';

/** Directory names excluded wherever they occur: repository metadata and installed packages. */
const reservedNames: ReadonlyMap<string, 'repository' | 'packages'> = new Map([
  ['.git', 'repository'], ['node_modules', 'packages'], ['bower_components', 'packages'], ['jspm_packages', 'packages'],
]);

/**
 * The canonical segment rule: the exclusion kind of one path segment that is
 * repository metadata, an installed-package directory or one of Ramify's
 * generated paths, else null. It holds at every segment position.
 */
export function reservedSegmentKind(segment: string): 'repository' | 'packages' | 'generated' | null {
  return reservedNames.get(segment) ?? (isRamifyGeneratedSegment(segment) ? 'generated' : null);
}

/** Why a declared nested tree cannot enter the ownership table. */
export type NestedTreeProblem = 'invalid-path' | 'escape' | 'child-module' | 'external-in-src' | 'always-excluded' | 'overlap';
/**
 * One nested-tree statement decoded against its declaring module, with its
 * located evidence. `directory` is the normalized project-relative path, null
 * when the written string is malformed or leaves the project root. Only the
 * checks that need no filesystem are applied here; a declaration with a
 * problem contributes no exclusion.
 */
export interface NestedTreeDeclaration {
  readonly module: string;
  readonly description: string;
  readonly statement: number;
  readonly kind: 'owned-ignored' | 'external';
  readonly decoded: string;
  readonly span: TextSpan;
  readonly directory: string | null;
  readonly problem: NestedTreeProblem | null;
}
export interface OwnershipBuild {
  readonly ownership: ProjectOwnership;
  readonly declarations: readonly NestedTreeDeclaration[];
}

const segmentsOf = (directory: string): string[] => directory === '.' ? [] : directory.split('/');
const joined = (segments: readonly string[]): string => segments.length ? segments.join('/') : '.';
/** True when `path` is `directory` or lies beneath it; both are normalized project-relative. */
const contains = (directory: string, path: string): boolean =>
  directory === '.' || path === directory || path.startsWith(`${directory}/`);

/** The scratch directory of a module directory: `tmp` directly beneath its `src/`. */
export const scratchDirectory = (directory: string): string => directory === '.' ? 'src/tmp' : `${directory}/src/tmp`;

/**
 * Resolve a declared directory string against its module's directory (both
 * normalized project-relative), or say why it cannot be. Reads nothing.
 */
export function decodeNestedTree(module: string, written: string): { directory: string | null; problem: NestedTreeProblem | null } {
  if (written === '' || written.startsWith('/') || /^[A-Za-z]:/.test(written) || written.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(written)) return { directory: null, problem: 'invalid-path' };
  const base = segmentsOf(module);
  const result = [...base];
  for (const segment of written.split('/')) {
    if (segment === '') return { directory: null, problem: 'invalid-path' };
    if (segment === '.') continue;
    if (segment !== '..') { result.push(segment); continue; }
    if (!result.length) return { directory: null, problem: 'escape' };
    result.pop();
  }
  const directory = joined(result);
  const strictlyBeneath = result.length > base.length && base.every((segment, index) => result[index] === segment);
  return { directory, problem: strictlyBeneath ? null : 'escape' };
}

/**
 * Build the immutable ownership table of one revision from its modules, their
 * parsed declarations and the configured output directories (project-relative,
 * normalized). Every module receives its scratch directory, `src/tmp`, whether
 * or not it exists; nothing is read from the filesystem.
 */
export function buildProjectOwnership(modules: readonly Pick<InventoryModule, 'id' | 'parent' | 'directory' | 'description'>[],
  outputs: readonly string[]): OwnershipBuild {
  const owners: PathOwner[] = modules.map(({ id, parent, directory }) => ({ id, parent, directory }))
    .sort((a, b) => byteOrder(a.directory, b.directory) || byteOrder(a.id, b.id));
  const exclusions: ProjectExclusion[] = [];
  for (const owner of owners) exclusions.push({ kind: 'scratch', directory: scratchDirectory(owner.directory), owner: owner.id });
  const outputDirectories = [...new Set(outputs)].filter(directory => directory !== '.' && directory !== '..' && !directory.startsWith('../'));
  for (const directory of outputDirectories) exclusions.push({ kind: 'output', directory, owner: null });

  const nearest = (path: string): PathOwner | null => {
    let found: PathOwner | null = null;
    for (const owner of owners) {
      if (contains(owner.directory, path) && (!found || owner.directory.length > found.directory.length)) found = owner;
    }
    return found;
  };
  const declarations: NestedTreeDeclaration[] = [];
  for (const module of modules) {
    if (module.description.status !== 'valid') continue;
    for (const statement of module.description.document.statements) {
      if (!('directory' in statement)) continue;
      const decoded = decodeNestedTree(module.directory, statement.directory.value);
      let problem = decoded.problem;
      const directory = decoded.directory;
      if (!problem && directory !== null) {
        if (nearest(directory)?.id !== module.id) problem = 'child-module';
        else if (statement.kind === 'external' && contains(module.directory === '.' ? 'src' : `${module.directory}/src`, directory)) {
          problem = 'external-in-src';
        } else if (segmentsOf(directory).some(segment => reservedSegmentKind(segment) !== null)
          || outputDirectories.some(output => contains(output, directory)) || contains(scratchDirectory(module.directory), directory)) {
          problem = 'always-excluded';
        }
      }
      declarations.push({ module: module.id, description: module.description.document.file, statement: statement.index,
        kind: statement.kind, decoded: statement.directory.value, span: statement.directory.span, directory, problem });
    }
  }
  // Equal or nested declarations are all invalid, whatever their kinds or modules.
  const candidates = declarations.filter(declaration => declaration.problem === null);
  const overlapping = new Set(candidates.filter(declaration => candidates.some(other => other !== declaration
    && (contains(other.directory!, declaration.directory!) || contains(declaration.directory!, other.directory!)))));
  const evidence = declarations.map(declaration => overlapping.has(declaration) ? { ...declaration, problem: 'overlap' as const } : declaration);
  for (const declaration of evidence) {
    if (declaration.problem !== null) continue;
    exclusions.push({ kind: declaration.kind, directory: declaration.directory!,
      owner: declaration.kind === 'owned-ignored' ? declaration.module : null });
  }
  exclusions.sort((a, b) => byteOrder(a.directory, b.directory) || byteOrder(a.kind, b.kind));
  return freeze({ ownership: { modules: owners, exclusions }, declarations: evidence });
}

/**
 * The project-relative directories discovery never enters for one module: its
 * scratch directory and every nested tree it declares whose directory string
 * decodes strictly beneath it. Other problems of a declaration make the
 * acquisition invalid; they do not reopen the tree to interpretation.
 */
export function prunedDirectories(module: Pick<InventoryModule, 'directory' | 'description'>): string[] {
  const directories = [scratchDirectory(module.directory)];
  if (module.description.status !== 'valid') return directories;
  for (const statement of module.description.document.statements) {
    if (!('directory' in statement)) continue;
    const decoded = decodeNestedTree(module.directory, statement.directory.value);
    if (!decoded.problem && decoded.directory !== null) directories.push(decoded.directory);
  }
  return directories;
}

/**
 * Whether a normalized project-relative path is one of `directories` or lies
 * beneath one. It looks up each prefix of the path once, so its work follows
 * the path's depth, not the number of directories.
 */
export function withinAnyDirectory(directories: ReadonlySet<string>, path: string): boolean {
  let prefix = '';
  for (const segment of path.split('/')) {
    prefix = prefix ? `${prefix}/${segment}` : segment;
    if (directories.has(prefix)) return true;
  }
  return false;
}

interface OwnershipIndex {
  readonly modules: ReadonlyMap<string, PathOwner>;
  readonly byId: ReadonlyMap<string, PathOwner>;
  readonly exclusions: ReadonlyMap<string, ProjectExclusion>;
}
const indices = new WeakMap<ProjectOwnership, OwnershipIndex>();
function indexOf(ownership: ProjectOwnership): OwnershipIndex {
  let index = indices.get(ownership);
  if (!index) {
    index = {
      modules: new Map(ownership.modules.map(module => [module.directory, module])),
      byId: new Map(ownership.modules.map(module => [module.id, module])),
      // The table holds at most one exclusion per directory; the first is kept otherwise.
      exclusions: new Map([...ownership.exclusions].reverse().map(exclusion => [exclusion.directory, exclusion])),
    };
    indices.set(ownership, index);
  }
  return index;
}

const invalid = (path: string, reason: string): PathOwnership =>
  ({ status: 'invalid-path', message: `Path ${JSON.stringify(path)} ${reason}` });

/**
 * Classify one canonical project-relative path against the scope's ownership
 * table. It reads nothing and checks no existence, so absent, new and deleted
 * paths classify alike. A path is `'.'`, a `/`-separated relative path without
 * empty, `.` or `..` segments, or such a path after leading `..` segments,
 * which is outside the project. Walking from the root, the first exclusion
 * reached wins, as discovery would stop there; otherwise the nearest module
 * owns the path.
 */
export function classifyProjectPath(scope: ProjectScope, path: string): PathOwnership {
  if (typeof path !== 'string' || path === '') return invalid(String(path), 'is empty');
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return invalid(path, 'is absolute');
  if (path.includes('\\')) return invalid(path, 'contains a backslash');
  const segments = path === '.' ? [] : path.split('/');
  let leading = 0;
  while (leading < segments.length && segments[leading] === '..') leading++;
  for (const segment of segments.slice(leading)) {
    if (segment === '' || segment === '.' || segment === '..') return invalid(path, 'has an empty, "." or interior ".." segment');
  }
  if (leading) return { status: 'outside-project', module: null };

  const index = indexOf(scope.ownership);
  let owner = index.modules.get('.') ?? null;
  for (let depth = 1; depth <= segments.length; depth++) {
    const prefix = segments.slice(0, depth).join('/');
    const reserved = reservedSegmentKind(segments[depth - 1]!);
    const exclusion = index.exclusions.get(prefix) ?? (reserved ? freeze({ kind: reserved, directory: prefix, owner: null }) : null);
    if (exclusion) {
      if (exclusion.owner === null) return { status: 'excluded', module: null, exclusion };
      const holder = index.byId.get(exclusion.owner) ?? owner;
      if (!holder) return invalid(path, 'has no owning module in this scope');
      return { status: 'owned', module: holder.id, directory: holder.directory, exclusion };
    }
    owner = index.modules.get(prefix) ?? owner;
  }
  if (!owner) return invalid(path, 'has no owning module in this scope');
  return { status: 'owned', module: owner.id, directory: owner.directory, exclusion: null };
}
