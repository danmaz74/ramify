import { basename, join, relative, resolve, sep } from 'node:path';
import { Capture } from './capture.js';
import { AcquisitionError, byteOrder, freeze, hash, within } from './data.js';
import { isRamifyGeneratedPath } from './generated-path.js';
import { descriptionMarker } from './marker.js';
import { buildProjectOwnership, reservedSegmentKind } from './ownership.js';
import { readPurpose } from './purpose.js';
import { exactReferences } from './references.js';
import { unmarkedRoot } from './selection.js';
import type { DescriptionParser, RootMarkerReader, TextSpan } from '../../descriptions/src/interfaces/syntax.js';
import type { ConfigurationData } from './configuration-data.js';
import type { ExactReference, InventoryFile, InventoryModule, OutsideSourceWarning, ProjectInventory, ProjectIssue, ProjectOwnership, ProjectScope } from './interfaces/project.js';

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
  if ([config.options.outDir, config.options.declarationDir]
    .some(directory => typeof directory === 'string' && within(directory, path))) return true;
  // Only generated scratch conventions use an explicit directory exclusion.
  // An arbitrary excluded/unselected tests/ or tools/ directory still needs
  // discovery: a marker there is a layout error regardless of source selection.
  return basename(path) === '.reference-work' && config.exclusions.some(exclusion =>
    exclusion.patterns.some(pattern => pattern === '**/.reference-work'
      || join(exclusion.directory, pattern) === path));
}
/**
 * The scope's ownership table for these modules: their declarations, scratch
 * directories and the configuration's output directories. Reads nothing.
 */
export function scopeOwnership(root: string, modules: readonly InventoryModule[], config: ConfigurationData): ProjectOwnership {
  const outputs = [config.options.outDir, config.options.declarationDir]
    .filter((directory): directory is string => typeof directory === 'string')
    .map(directory => relative(root, resolve(root, directory)).split(sep).join('/') || '.');
  return buildProjectOwnership(modules, outputs).ownership;
}
/** One warning per first path entry, in byte order, for outside selected source. */
export function outsideSourceWarnings(outsideModuleFiles: readonly string[]): readonly OutsideSourceWarning[] {
  const groups = new Map<string, string[]>();
  for (const file of outsideModuleFiles) {
    const entry = file.split('/')[0]!;
    const group = groups.get(entry) ?? []; group.push(file); groups.set(entry, group);
  }
  return [...groups].sort(([a], [b]) => byteOrder(a, b))
    .map(([entry, files]) => ({ code: 'outside-module-source' as const, entry, count: files.length, files }));
}
/**
 * A marked description other than the root's: located at its marker, naming
 * the nested-tree declaration its nearest enclosing module would add.
 */
function undeclaredBoundary(root: string, path: string, directory: string, marker: TextSpan, enclosing: InventoryModule | null): ProjectIssue {
  const owner = join(root, enclosing?.directory ?? '.');
  const declared = JSON.stringify(relative(owner, directory).split(sep).join('/'));
  const kinds = within(join(owner, 'src'), directory) ? `owned-ignored ${declared}` : `owned-ignored ${declared} or external ${declared}`;
  const description = enclosing ? join(enclosing.directory, 'module.ramify') : 'its nearest enclosing module description';
  return { code: 'undeclared-project-boundary', path, span: marker,
    message: `Invalid module boundary: undeclared-project-boundary at ${marker.line}:${marker.column}: a marked project root must lie in a declared nested tree; declare ${kinds} in ${description}` };
}
export async function inventoryProject(capture: Capture, scope: Omit<ProjectScope, 'walkedAreas' | 'independentScopes' | 'ownership'>,
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
  const independentScopes: string[] = [];
  const excludedRoots: string[] = [];
  const queue: Walk[] = [{ directory: capture.root, boundary: null }];
  const names = new Map<string, InventoryModule>();
  // Generated output is isolated before any compiler selection can admit it,
  // even when an explicit tsconfig `files`/`include` entry names it directly.
  const selected = config.files.filter(path => within(capture.root, path)
    && !isRamifyGeneratedPath(relative(capture.root, path)));
  function snapshot(): ProjectInventory {
    return freeze({
      scope: { ...scope, walkedAreas: modules.flatMap(module => module.areas.map(area => area.root)).sort(byteOrder),
        independentScopes: independentScopes.sort(byteOrder), ownership: scopeOwnership(capture.root, modules, config) },
      modules: modules.sort((a, b) => byteOrder(a.directory, b.directory)),
      files: files.sort((a, b) => byteOrder(a.path, b.path)), references, outsideModuleFiles,
      warnings: outsideSourceWarnings(outsideModuleFiles),
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
            boundary = { directory, module, enclosing: module, depth: (boundary?.depth ?? -1) + 1 };
            await capture.readFile(join(directory, 'package.json'), 'dependency');
          }
        }
      }
      for (const path of entries) {
        // Isolate the reserved `.ramify` catalog and its transient stage/
        // rollback siblings before observation, walk descent or file
        // classification can admit anything beneath them.
        if (isRamifyGeneratedPath(basename(path))) continue;
        const kind = await capture.kind(path);
        if (kind === 'directory') {
          const ownSource = boundary && within(join(boundary.directory, 'src'), path);
          const childContainer = boundary && within(join(boundary.directory, 'subs'), path);
          if (excludedDirectory(path, config)) { excludedRoots.push(path); continue; }
          // Independent configurations only end a non-src/non-subs branch. An
          // owner's own tsconfig never excludes that owner from its parent tree.
          if (!ownSource && !childContainer && await capture.fileExists(join(path, 'tsconfig.json')) && !selected.some(file => within(path, file))) {
            independentScopes.push(relative(capture.root, path)); continue;
          }
          queue.push({ directory: path, boundary });
        } else if (kind === 'file' && boundary?.module && within(join(boundary.directory, 'src'), path)) {
          if (basename(path) === 'module.ramify') continue;
          const area = within(join(boundary.directory, 'src/tests'), path) ? 'tests' : 'ordinary';
          const fileKind = compilerSource.test(path) ? 'source' : 'resource';
          files.push({ path: relative(capture.root, path), owner: boundary.module.id, area, kind: fileKind,
            ...await capture.application(path, fileKind) });
        }
        // POSIX symlinks are observed, never traversed during discovery. A linked
        // description was diagnosed above; a declared link target is checked next.
      }
    }
    modules.sort((a, b) => byteOrder(a.directory, b.directory));
    files.sort((a, b) => byteOrder(a.path, b.path));
    const owned = new Set(files.map(file => file.path));
    await exactReferences(capture, modules, owned, issues, references);
    outsideModuleFiles = [...new Set(selected.filter(path => !excludedRoots.some(root => within(root, path)))
      .map(path => relative(capture.root, path)))].filter(path => !owned.has(path) && basename(path) !== 'module.ramify').sort(byteOrder);
    // Selected outside source is captured as input, but receives no owner/area.
    for (const file of outsideModuleFiles) await capture.readFile(file, 'dependency');
  } catch (error) {
    return { status: 'failed', inventory: snapshot(), issues, metadata, metadataReused, error };
  }
  return { status: 'complete', inventory: snapshot(), issues, metadata, metadataReused };
}
