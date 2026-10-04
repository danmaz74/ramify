import { basename, join, relative, resolve, sep } from 'node:path';
import { Capture } from './capture.js';
import { AcquisitionError, byteOrder, freeze, hash, within } from './data.js';
import { isRamifyGeneratedPath } from './generated-path.js';
import { descriptionMarker } from './marker.js';
import { nestedTreeIssues } from './nested-trees.js';
import { buildProjectOwnership, classifyProjectPath, prunedDirectories, reservedSegmentKind, withinAnyDirectory } from './ownership.js';
import { readPurpose } from './purpose.js';
import { exactReferences } from './references.js';
import { unmarkedRoot } from './selection.js';
import type { DescriptionParser, RootMarkerReader, TextSpan } from '../../descriptions/src/interfaces/syntax.js';
import type { ConfigurationData } from './configuration-data.js';
import type { ExactReference, InventoryFile, InventoryModule, ProjectInventory, ProjectIssue, ProjectOwnership, ProjectScope, ProjectWarning } from './interfaces/project.js';

const compilerSource = /\.(?:[cm]?[jt]sx?)$/;
/** Compiler-visible source, as distinct from an owned resource. */
export const inventoryFileKind = (path: string): InventoryFile['kind'] => compilerSource.test(path) ? 'source' : 'resource';
type Metadata = Record<string, { identity: string; purpose: InventoryModule['purpose'] }>;
/** `enclosing` is the nearest valid module at or above `directory`; `module` is null for a layout-invalid boundary. */
interface Boundary { directory: string; module: InventoryModule | null; enclosing: InventoryModule | null; depth: number }
interface Walk { directory: string; boundary: Boundary | null }
type InventoryRead = { inventory: ProjectInventory; issues: ProjectIssue[]; metadata: Metadata; metadataReused: boolean }
  & ({ status: 'complete' } | { status: 'failed'; error: unknown });

export function excludedDirectory(path: string, config: ConfigurationData): boolean {
  const reserved = reservedSegmentKind(basename(path));
  if (reserved === 'repository' || reserved === 'packages') return true;
  // Compiler exclusion never removes a directory from discovery: an excluded
  // or unselected tests/ or tools/ directory is still walked, and only declared
  // nested trees and module scratch directories are pruned beyond these.
  return [config.options.outDir, config.options.declarationDir]
    .some(directory => typeof directory === 'string' && within(directory, path));
}
/** The configuration's output directories, project-relative and normalized. */
function outputDirectories(root: string, config: ConfigurationData): string[] {
  return [config.options.outDir, config.options.declarationDir]
    .filter((directory): directory is string => typeof directory === 'string')
    .map(directory => relative(root, resolve(root, directory)).split(sep).join('/') || '.');
}
/**
 * The scope's ownership table for these modules: their declarations, scratch
 * directories and the configuration's output directories. Reads nothing.
 */
export function scopeOwnership(root: string, modules: readonly InventoryModule[], config: ConfigurationData): ProjectOwnership {
  return buildProjectOwnership(modules, outputDirectories(root, config)).ownership;
}
/** The most files one warning lists; its `count` states the total. */
const warningFileLimit = 20;
const selectedFiles = (count: number): string => `${count} compiler-selected file${count === 1 ? '' : 's'}`;
/** One warning per group, `files` byte-ordered and bounded, ordered by path and then code. */
function projectWarnings(groups: ReadonlyMap<string, { readonly code: ProjectWarning['code']; readonly message: (count: number) => string;
  readonly files: readonly string[] }>): ProjectWarning[] {
  return [...groups].map(([path, { code, message, files }]) => {
    const ordered = [...files].sort(byteOrder);
    return { code, path, message: message(ordered.length), files: ordered.slice(0, warningFileLimit), count: ordered.length };
  }).sort((a, b) => byteOrder(a.path, b.path) || byteOrder(a.code, b.code));
}
/**
 * One transitional `outside-module-source` warning per first path entry of
 * compiler-selected source outside every module's `src/`.
 */
function outsideSourceWarnings(outsideModuleFiles: readonly string[]): ProjectWarning[] {
  const groups = new Map<string, { code: ProjectWarning['code']; message: (count: number) => string; files: string[] }>();
  for (const file of outsideModuleFiles) {
    const entry = file.split('/')[0]!;
    const group = groups.get(entry) ?? { code: 'outside-module-source', message: count => `${selectedFiles(count)} outside module source`, files: [] };
    group.files.push(file); groups.set(entry, group);
  }
  return projectWarnings(groups);
}
/**
 * One warning per owned-ignored tree or module scratch directory holding
 * compiler-selected source, located at that directory. Such source is neither
 * inventoried nor read; an external tree's selected files warn about nothing.
 */
function excludedSelectionWarnings(ownership: ProjectOwnership, scope: Omit<ProjectScope, 'walkedAreas' | 'ownership'>,
  files: readonly string[]): ProjectWarning[] {
  const groups = new Map<string, { code: ProjectWarning['code']; message: (count: number) => string; files: string[] }>();
  for (const file of files) {
    const owned = classifyProjectPath({ ...scope, walkedAreas: [], ownership }, file);
    const exclusion = owned.status === 'owned' ? owned.exclusion : null;
    if (exclusion?.kind !== 'owned-ignored' && exclusion?.kind !== 'scratch') continue;
    const group = groups.get(exclusion.directory) ?? (exclusion.kind === 'owned-ignored'
      ? { code: 'compiler-selected-owned-ignored', files: [],
        message: count => `${selectedFiles(count)} in an owned-ignored tree of module ${exclusion.owner}, which Ramify does not analyze; exclude the tree from the compiler configuration` }
      : { code: 'compiler-selected-scratch', files: [],
        message: count => `${selectedFiles(count)} in the scratch directory of module ${exclusion.owner}, which Ramify does not analyze; exclude the directory from the compiler configuration` });
    group.files.push(file); groups.set(exclusion.directory, group);
  }
  return projectWarnings(groups);
}
/**
 * A marked description other than the root's: located at its marker, naming
 * the nested-tree declaration its nearest enclosing module would add.
 */
function undeclaredBoundary(root: string, path: string, directory: string, marker: TextSpan | null, enclosing: InventoryModule | null): ProjectIssue {
  const owner = join(root, enclosing?.directory ?? '.');
  const declared = JSON.stringify(relative(owner, directory).split(sep).join('/'));
  const kinds = within(join(owner, 'src'), directory) ? `owned-ignored ${declared}` : `owned-ignored ${declared} or external ${declared}`;
  const description = enclosing ? join(enclosing.directory, 'module.ramify') : 'its nearest enclosing module description';
  const declare = `declare ${kinds} in ${description}`;
  return marker
    ? { code: 'undeclared-project-boundary', path, span: marker,
      message: `Invalid module boundary: undeclared-project-boundary at ${marker.line}:${marker.column}: a marked project root must lie in a declared nested tree; ${declare}` }
    // A package manifest outside a module's own directory marks another project or package.
    : { code: 'undeclared-project-boundary', path,
      message: `Invalid module boundary: undeclared-project-boundary: a directory with a package manifest must be a module's own directory or lie in a declared nested tree; ${declare}` };
}
export async function inventoryProject(capture: Capture, scope: Omit<ProjectScope, 'walkedAreas' | 'ownership'>,
  config: ConfigurationData, parse: DescriptionParser, read: RootMarkerReader, previousMetadata?: Metadata): Promise<InventoryRead> {
  const metadata: Metadata = {};
  let metadataReused = true;
  async function purpose(readme: string): Promise<InventoryModule['purpose']> {
    const path = relative(capture.root, readme), text = await capture.readFile(readme, 'readme');
    const identity = text === undefined ? 'absent' : hash(text);
    const previous = previousMetadata?.[path];
    const product = previous?.identity === identity ? previous.purpose : readPurpose(path, text);
    if (previous?.identity !== identity) metadataReused = false;
    metadata[path] = { identity, purpose: product };
    return product;
  }
  const modules: InventoryModule[] = [], files: InventoryFile[] = [], issues: ProjectIssue[] = [];
  const references: ExactReference[] = [];
  let outsideModuleFiles: string[] = [];
  let warnings: ProjectWarning[] = [];
  const excludedRoots: string[] = [];
  // Scratch directories and declared nested trees of the modules found so far,
  // absolute: discovery never descends into them, so nothing beneath is read.
  const pruned = new Set<string>();
  const queue: Walk[] = [{ directory: capture.root, boundary: null }];
  const names = new Map<string, InventoryModule>();
  // Generated output is isolated before any compiler selection can admit it,
  // even when an explicit tsconfig `files`/`include` entry names it directly.
  const selected = config.files.filter(path => within(capture.root, path)
    && !isRamifyGeneratedPath(relative(capture.root, path)));
  function snapshot(): ProjectInventory {
    return freeze({
      scope: { ...scope, walkedAreas: modules.flatMap(module => module.areas.map(area => area.root)).sort(byteOrder),
        ownership: scopeOwnership(capture.root, modules, config) },
      modules: modules.sort((a, b) => byteOrder(a.directory, b.directory)),
      files: files.sort((a, b) => byteOrder(a.path, b.path)), references, outsideModuleFiles, warnings,
    });
  }
  try {
    for (let cursor = 0; cursor < queue.length; cursor++) {
      capture.check();
      const walk = queue[cursor]!;
      const directory = walk.directory;
      let boundary = walk.boundary;
      const entries = await capture.readDirectory(directory);
      const descriptionPath = join(directory, 'module.ramify');
      const hasDescription = entries.includes(descriptionPath);
      const inSource = boundary !== null && within(join(boundary.directory, 'src'), directory);
      const underSubs = boundary !== null && within(join(boundary.directory, 'subs'), directory);
      const legalChild = underSubs && directory !== join(boundary!.directory, 'subs');
      if (hasDescription) {
        const path = relative(capture.root, descriptionPath);
        const kind = await capture.kind(descriptionPath);
        const isRoot = directory === capture.root;
        const enclosing = boundary?.enclosing ?? null;
        // Every regular description discovery meets has its marker decided:
        // only the root's carries it, wherever another one lies.
        const bytes = kind === 'file' ? await capture.bytes(descriptionPath, 'description') : undefined;
        const marker = bytes === undefined ? null : descriptionMarker(path, bytes, read);
        let code: ProjectIssue['code'] | undefined;
        if (kind === 'symlink') code = 'symlink-description';
        else if (kind !== 'file') code = 'invalid-description';
        else if (!isRoot && marker) code = 'undeclared-project-boundary';
        else if (inSource) code = 'description-in-src';
        else if (boundary && (directory === join(boundary.directory, 'src') || directory === join(boundary.directory, 'subs'))) code = 'reserved-container';
        else if (directory !== capture.root && (!legalChild || !boundary?.module)) code = 'stray-description';
        if (code) {
          issues.push(code === 'undeclared-project-boundary' ? undeclaredBoundary(capture.root, path, directory, marker!, enclosing)
            : { code, path, message: `Invalid module boundary: ${code}` });
          boundary = { directory, module: null, enclosing, depth: (boundary?.depth ?? -1) + 1 };
        } else {
          if (isRoot && !marker) issues.push({ code: 'unmarked-root-description', path, message: unmarkedRoot(path) });
          let text: string | undefined;
          try { text = await capture.readFile(descriptionPath, 'description'); }
          catch (error) {
            if (!(error instanceof AcquisitionError) || !error.message.includes('UTF-8')) throw error;
            issues.push({ code: 'invalid-description', path, message: '1:1: invalid-encoding: Description is not valid UTF-8' });
          }
          const description = text === undefined ? undefined : parse(path, text);
          if (!description || description.status === 'invalid') {
            for (const issue of description?.issues ?? []) issues.push({ code: 'invalid-description', path,
              message: `${issue.span.line}:${issue.span.column}: ${issue.code}: ${issue.message} [${issue.span.start},${issue.span.end})` });
            boundary = { directory, module: null, enclosing, depth: (boundary?.depth ?? -1) + 1 };
          } else {
            if (modules.length >= capture.limits.maxOwners || (boundary?.depth ?? -1) + 1 > capture.limits.maxDepth) {
              throw new AcquisitionError('resource-limit', path, 'Owner count or module depth limit exceeded');
            }
            const name = description.document.module.name;
            const parent = boundary?.module?.id ?? null;
            const id = parent ? `${parent}/${name}` : name;
            const moduleDirectory = relative(capture.root, directory) || '.';
            const readme = join(directory, 'README.md');
            const module: InventoryModule = {
              id, name, parent, directory: moduleDirectory, headerTags: description.document.module.tags, description,
              areas: [
                { owner: id, kind: 'ordinary', root: join(moduleDirectory, 'src'), present: await capture.kind(join(directory, 'src')) === 'directory' },
                { owner: id, kind: 'tests', root: join(moduleDirectory, 'src/tests'), present: await capture.kind(join(directory, 'src/tests')) === 'directory' },
              ],
              purpose: await purpose(readme),
            };
            const previous = names.get(id);
            if (previous) {
              for (const marker of [previous.description.status === 'valid' ? previous.description.document.file : previous.description.file, path]) {
                if (!issues.some(issue => issue.code === 'duplicate-name' && issue.path === marker)) {
                  issues.push({ code: 'duplicate-name', path: marker, message: `Duplicate sibling declared name ${name}` });
                }
              }
            } else names.set(id, module);
            modules.push(module);
            for (const excluded of prunedDirectories(module)) pruned.add(join(capture.root, excluded));
            boundary = { directory, module, enclosing: module, depth: (boundary?.depth ?? -1) + 1 };
            await capture.readFile(join(directory, 'package.json'), 'dependency');
          }
        }
      } else if (entries.includes(join(directory, 'package.json'))) {
        // An undeclared directory with a package manifest is another project's
        // or package's root: a layout error whose contents no module receives.
        const enclosing = boundary?.enclosing ?? null;
        issues.push(undeclaredBoundary(capture.root, relative(capture.root, join(directory, 'package.json')), directory, null, enclosing));
        boundary = { directory, module: null, enclosing, depth: (boundary?.depth ?? -1) + 1 };
      }
      for (const path of entries) {
        // Isolate the reserved `.ramify` catalog and its transient stage/
        // rollback siblings before observation, walk descent or file
        // classification can admit anything beneath them.
        if (isRamifyGeneratedPath(basename(path))) continue;
        const kind = await capture.kind(path);
        if (kind === 'directory') {
          if (excludedDirectory(path, config)) { excludedRoots.push(path); continue; }
          // A declared nested tree or a scratch directory is observed as an
          // entry of its parent, never entered: a description inside, marked
          // or not, is not read. A nested configuration ends nothing.
          if (pruned.has(path)) continue;
          queue.push({ directory: path, boundary });
        } else if (kind === 'file' && boundary?.module && within(join(boundary.directory, 'src'), path)) {
          if (basename(path) === 'module.ramify') continue;
          const area = within(join(boundary.directory, 'src/tests'), path) ? 'tests' : 'ordinary';
          const fileKind = compilerSource.test(path) ? 'source' : 'resource';
          files.push({ path: relative(capture.root, path), owner: boundary.module.id, area, kind: fileKind, placement: 'src',
            ...await capture.application(path, fileKind) });
        }
        // POSIX symlinks are observed, never traversed during discovery. A linked
        // description was diagnosed above; a declared link target is checked next.
      }
    }
    modules.sort((a, b) => byteOrder(a.directory, b.directory));
    files.sort((a, b) => byteOrder(a.path, b.path));
    const owned = new Set(files.map(file => file.path));
    issues.push(...await nestedTreeIssues(capture, modules, buildProjectOwnership(modules, outputDirectories(capture.root, config)).declarations));
    await exactReferences(capture, modules, owned, issues, references);
    // Selected source in a declared tree or a scratch directory is neither
    // inventoried nor read; owned-ignored and scratch selections are warned about.
    // Each selected path is tested by its prefixes, not against every directory.
    const projectRelative = (path: string): string => relative(capture.root, path).split(sep).join('/');
    const prunedPaths = new Set([...pruned].map(projectRelative));
    const excludedPaths = new Set(excludedRoots.map(projectRelative));
    const isPruned = (path: string): boolean => withinAnyDirectory(prunedPaths, projectRelative(path));
    const isExcluded = (path: string): boolean => withinAnyDirectory(excludedPaths, projectRelative(path));
    const unanalyzed = [...new Set(selected.filter(isPruned).map(path => relative(capture.root, path)))];
    outsideModuleFiles = [...new Set(selected.filter(path => !isExcluded(path) && !isPruned(path))
      .map(path => relative(capture.root, path)))].filter(path => !owned.has(path) && basename(path) !== 'module.ramify').sort(byteOrder);
    warnings = [...outsideSourceWarnings(outsideModuleFiles),
      ...excludedSelectionWarnings(scopeOwnership(capture.root, modules, config), scope, unanalyzed)]
      .sort((a, b) => byteOrder(a.path, b.path) || byteOrder(a.code, b.code));
    // Selected outside source is captured as input, but receives no owner/area.
    for (const file of outsideModuleFiles) await capture.readFile(file, 'dependency');
  } catch (error) {
    return { status: 'failed', inventory: snapshot(), issues, metadata, metadataReused, error };
  }
  return { status: 'complete', inventory: snapshot(), issues, metadata, metadataReused };
}
