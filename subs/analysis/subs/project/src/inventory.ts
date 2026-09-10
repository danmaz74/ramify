import { basename, join, relative } from 'node:path';
import { Capture } from './capture.js';
import { AcquisitionError, byteOrder, freeze, within } from './data.js';
import { readPurpose } from './purpose.js';
import { exactReferences } from './references.js';
import type { DescriptionParser } from '../../descriptions/src/interfaces/syntax.js';
import type { ConfigurationData } from './configuration-data.js';
import type { ExactReference, InventoryFile, InventoryModule, ProjectInventory, ProjectIssue, ProjectScope } from './interfaces/project.js';

const compilerSource = /\.(?:[cm]?[jt]sx?)$/;
interface Boundary { directory: string; module: InventoryModule | null; depth: number }
interface Walk { directory: string; boundary: Boundary | null }
type InventoryRead = { inventory: ProjectInventory; issues: ProjectIssue[] }
  & ({ status: 'complete' } | { status: 'failed'; error: unknown });

function excludedDirectory(path: string, config: ConfigurationData): boolean {
  if (['.git', 'node_modules', 'bower_components', 'jspm_packages'].includes(basename(path))) return true;
  if ([config.options.outDir, config.options.declarationDir]
    .some(directory => typeof directory === 'string' && within(directory, path))) return true;
  // Only generated scratch conventions use an explicit directory exclusion.
  // An arbitrary excluded/unselected tests/ or tools/ directory still needs
  // discovery: a marker there is a layout error regardless of source selection.
  return basename(path) === '.reference-work' && config.exclusions.some(exclusion =>
    exclusion.patterns.some(pattern => pattern === '**/.reference-work'
      || join(exclusion.directory, pattern) === path));
}
export async function inventoryProject(capture: Capture, scope: Omit<ProjectScope, 'walkedAreas' | 'independentScopes'>,
  config: ConfigurationData, parse: DescriptionParser): Promise<InventoryRead> {
  const modules: InventoryModule[] = [], files: InventoryFile[] = [], issues: ProjectIssue[] = [];
  const references: ExactReference[] = [];
  let outsideModuleFiles: string[] = [];
  const independentScopes: string[] = [];
  const excludedRoots: string[] = [];
  const queue: Walk[] = [{ directory: capture.root, boundary: null }];
  const names = new Map<string, InventoryModule>();
  const selected = config.files.filter(path => within(capture.root, path));
  function snapshot(): ProjectInventory {
    const groups = new Map<string, string[]>();
    for (const file of outsideModuleFiles) {
      const entry = file.split('/')[0]!;
      const group = groups.get(entry) ?? []; group.push(file); groups.set(entry, group);
    }
    return freeze({
      scope: { ...scope, walkedAreas: modules.flatMap(module => module.areas.map(area => area.root)).sort(byteOrder),
        independentScopes: independentScopes.sort(byteOrder) },
      modules: modules.sort((a, b) => byteOrder(a.directory, b.directory)),
      files: files.sort((a, b) => byteOrder(a.path, b.path)), references, outsideModuleFiles,
      warnings: [...groups].sort(([a], [b]) => byteOrder(a, b)).map(([entry, files]) => ({ code: 'outside-module-source' as const, entry, count: files.length, files })),
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
        let code: ProjectIssue['code'] | undefined;
        if (kind === 'symlink') code = 'symlink-description';
        else if (kind !== 'file') code = 'invalid-description';
        else if (inSource) code = 'description-in-src';
        else if (boundary && (directory === join(boundary.directory, 'src') || directory === join(boundary.directory, 'subs'))) code = 'reserved-container';
        else if (directory !== capture.root && (!legalChild || !boundary?.module)) code = 'stray-description';
        if (code) {
          issues.push({ code, path, message: `Invalid module boundary: ${code}` });
          boundary = { directory, module: null, depth: (boundary?.depth ?? -1) + 1 };
        } else {
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
            boundary = { directory, module: null, depth: (boundary?.depth ?? -1) + 1 };
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
              purpose: readPurpose(relative(capture.root, readme), await capture.readFile(readme, 'readme')),
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
            boundary = { directory, module, depth: (boundary?.depth ?? -1) + 1 };
            await capture.readFile(join(directory, 'package.json'), 'dependency');
          }
        }
      }
      for (const path of entries) {
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
    return { status: 'failed', inventory: snapshot(), issues, error };
  }
  return { status: 'complete', inventory: snapshot(), issues };
}
