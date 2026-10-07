import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/*
 * Readers for the views `ramify materialize` generates: the project's
 * architect view (`.ramify-architect/`) and a module's API views
 * (`src/.ramify/`, `src/tests/.ramify/`). Formats as the toolkit specifies
 * them: docs/architecture/architect-view.spec.md and
 * materialized-api-view.spec.md.
 */

export const architectViewDirectory = '.ramify-architect';

/** `.ramify-architect/_meta.json`. Exceptional counts are present only when nonzero. */
export interface ArchitectMeta {
  readonly schema: string;
  readonly revision: string;
  /** The input identity: the source state the view describes. */
  readonly input: string;
  readonly modules: number;
  readonly dependencies: 'measured' | 'unavailable';
  readonly dependencyReason?: string;
  readonly testReferences?: string;
  readonly [key: string]: unknown;
}

const exceptionalCounts = ['unknownShapes', 'cut', 'detailsUnavailable', 'dynamicTitles', 'testsUnavailable', 'unclassifiedExercises', 'coverage'] as const;

export async function readArchitectMeta(projectRoot: string): Promise<ArchitectMeta> {
  const meta = JSON.parse(await readFile(join(projectRoot, architectViewDirectory, '_meta.json'), 'utf8')) as ArchitectMeta;
  if (meta.schema !== 'ramify.architect-view/3' || typeof meta.revision !== 'string' || !meta.revision ||
      typeof meta.input !== 'string' || !meta.input || !Number.isInteger(meta.modules) || meta.modules < 1 ||
      !['measured', 'unavailable'].includes(meta.dependencies) || meta.dependencyScope !== 'production') {
    throw new Error(`${architectViewDirectory}/_meta.json is not a valid ramify.architect-view/3 document`);
  }
  return meta;
}

/** What the view says it could not establish, one statement each; empty when complete. */
export function coverageLimitsOf(meta: ArchitectMeta): string[] {
  const limits: string[] = [];
  if (meta.dependencies === 'unavailable') limits.push(`dependencies unavailable (${meta.dependencyReason ?? 'no reason given'}): no consumer lists, uses or usedBy`);
  if (meta.testReferences === 'unavailable' && meta.dependencies !== 'unavailable') limits.push('test references unavailable: test records carry no exercises');
  if (meta.metrics === 'unavailable') limits.push('module metrics unavailable');
  for (const key of exceptionalCounts) {
    const value = meta[key];
    if (typeof value === 'number' && value > 0) limits.push(`${key}: ${value}`);
  }
  return limits;
}

export interface ModuleEntry {
  /** The declared-name path, such as `app/orders`. */
  readonly module: string;
  /** The project-relative directory; `''` for the root module. */
  readonly dir: string;
  readonly parent: string | null;
  /** The declared-name paths of its direct children, as the view lists them. */
  readonly children: readonly string[];
  /** The module header's tags. `testing` is the one Ramify reserves. */
  readonly tags: readonly string[];
  /** The source areas the view found, such as `src` and `src/tests`. */
  readonly areas: readonly string[];
}

/** One module as the architect view's `module.json` records what this reader needs. */
interface ModuleDocument {
  readonly schema: string;
  readonly module: string;
  readonly dir: string;
  readonly parent: string | null;
  readonly children?: readonly string[];
  readonly tags?: readonly string[];
  readonly areas?: readonly string[];
}

/** Whether the module header classifies this owner as testing source. */
export function isTestingModule(entry: ModuleEntry): boolean {
  return entry.tags.includes('testing');
}

function entryOf(document: ModuleDocument): ModuleEntry {
  if (document.schema !== 'ramify.architect-module/3' || typeof document.module !== 'string' ||
      typeof document.dir !== 'string' || (document.parent !== null && typeof document.parent !== 'string') ||
      !Array.isArray(document.children) || !document.children.every(item => typeof item === 'string') ||
      !Array.isArray(document.tags) || !document.tags.every(item => typeof item === 'string') ||
      !Array.isArray(document.areas) || !document.areas.every(item => item === 'src' || item === 'src/tests')) {
    throw new Error('Invalid ramify.architect-module/3 document');
  }
  return {
    module: document.module,
    dir: document.dir,
    parent: document.parent,
    children: document.children ?? [],
    tags: document.tags ?? [],
    areas: document.areas ?? [],
  };
}

/** Where an owner, or an ancestor that re-exposes what it received, exposes an original. */
export type ExposureChannel = 'parent' | 'descendants';

/** An exported original, as the architect view records it under its owner. */
export interface SymbolRecord {
  readonly module: string;
  readonly name: string;
  readonly binding?: string;
  readonly as?: readonly string[];
  readonly file: string;
  /** `exposed` when the owner exposes it, `internal` when no declaration does. */
  readonly role?: 'exposed' | 'internal';
  /** Where the owner exposes it; absent for an internal original. */
  readonly to?: readonly ExposureChannel[];
  /** The required tags an importer needs, from the source area's classification. */
  readonly tags?: readonly string[];
  /** Each ancestor that re-exposes what it received, and where to, nearest first. */
  readonly reexposed?: ReadonlyArray<{ readonly by: string; readonly to: readonly ExposureChannel[] }>;
}

export interface ArchitectIndex {
  readonly revision: string;
  readonly input: string;
  readonly modules: ReadonlyMap<string, ModuleEntry>;
  /** Each module's exported originals, behavior-capable and supporting. */
  readonly symbols: ReadonlyMap<string, readonly SymbolRecord[]>;
}

/** Every module and exported original of the architect view. */
export async function loadArchitectIndex(projectRoot: string): Promise<ArchitectIndex> {
  const root = join(projectRoot, architectViewDirectory);
  const meta = await readArchitectMeta(projectRoot);
  const modules = new Map<string, ModuleEntry>();
  const symbols = new Map<string, SymbolRecord[]>();
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some(entry => entry.isFile() && entry.name === 'module.json')) {
      const document = JSON.parse(await readFile(join(directory, 'module.json'), 'utf8')) as ModuleDocument;
      modules.set(document.module, entryOf(document));
      const records: SymbolRecord[] = [];
      for (const file of ['behavior.jsonl', 'supporting.jsonl']) {
        let text = '';
        try {
          text = await readFile(join(directory, file), 'utf8');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          const record = JSON.parse(line) as SymbolRecord;
          records.push({
            module: record.module, name: record.name, binding: record.binding, as: record.as, file: record.file,
            role: record.role, to: record.to, tags: record.tags, reexposed: record.reexposed,
          });
        }
      }
      symbols.set(document.module, records);
    }
    for (const entry of entries) if (entry.isDirectory()) await walk(join(directory, entry.name));
  };
  await walk(root);
  return { revision: meta.revision, input: meta.input, modules, symbols };
}

/** The architect view's modules alone, with its revision and input identity: the project's module tree. */
export async function loadModuleTree(projectRoot: string): Promise<{ readonly revision: string; readonly input: string; readonly modules: ModuleEntry[] }> {
  const meta = await readArchitectMeta(projectRoot);
  const modules: ModuleEntry[] = [];
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some(entry => entry.isFile() && entry.name === 'module.json')) {
      const document = JSON.parse(await readFile(join(directory, 'module.json'), 'utf8')) as ModuleDocument;
      modules.push(entryOf(document));
    }
    for (const entry of entries) if (entry.isDirectory()) await walk(join(directory, entry.name));
  };
  await walk(join(projectRoot, architectViewDirectory));
  modules.sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : 0));
  return { revision: meta.revision, input: meta.input, modules };
}

/** The module named by its declared-name path, or by its project-relative directory. */
export function findModule(index: ArchitectIndex, name: string): ModuleEntry | undefined {
  const byName = index.modules.get(name);
  if (byName) return byName;
  const directory = name.replace(/^\.\/?/, '').replace(/\/+$/, '');
  return [...index.modules.values()].find(entry => entry.dir === directory);
}

/** The records of `owner` that a map may cite as `name`: its export name, an exposure name or its local binding. */
export function symbolRecords(index: ArchitectIndex, owner: string, name: string): SymbolRecord[] {
  return (index.symbols.get(owner) ?? []).filter(record => record.name === name || record.binding === name || record.as?.includes(name));
}

export type SourceArea = 'src' | 'src/tests';

/** One API view of a requester, as materialized: which originals are available in that source area. */
export interface ApiViewSnapshot {
  readonly module: string;
  readonly area: SourceArea;
  /** The view's directory, project-relative. */
  readonly path: string;
  readonly revision: string;
  /** Source-analysis limits: when present, absence from the view is not proof of unavailability. */
  readonly coverage: number | null;
  /** Each generated file, by its project-relative path, with the defining file it describes and its entries. */
  readonly files: ReadonlyMap<string, { readonly definingFile: string; readonly names: ReadonlyMap<string, { readonly typeOnly: boolean }> }>;
}

/** The API view of `entry`'s source area, or `undefined` when that area has no view. */
export async function readApiView(projectRoot: string, entry: ModuleEntry, area: SourceArea): Promise<ApiViewSnapshot | undefined> {
  const path = [entry.dir, area, '.ramify'].filter(Boolean).join('/');
  const directory = join(projectRoot, path);
  let meta: { schema: string; module: string; area: string; revision: string; coverage?: number; detailsUnavailable?: number; truncated?: number };
  try {
    meta = JSON.parse(await readFile(join(directory, '_meta.json'), 'utf8')) as typeof meta;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  if (meta.schema !== 'ramify.api-view/1' || meta.module !== entry.module ||
      meta.area !== (area === 'src' ? 'ordinary' : 'tests') || typeof meta.revision !== 'string' || !meta.revision ||
      [meta.coverage, meta.detailsUnavailable, meta.truncated].some(value => value !== undefined && (!Number.isInteger(value) || value < 0))) {
    throw new Error(`${path}/_meta.json is not a valid ramify.api-view/1 document for ${entry.module} ${area}`);
  }
  const files = new Map<string, { definingFile: string; names: Map<string, { typeOnly: boolean }> }>();
  for (const category of ['external', 'children']) {
    const base = join(directory, category);
    for (const file of await listFiles(base)) {
      if (!file.endsWith('.md')) continue;
      const names = new Map<string, { typeOnly: boolean }>();
      for (const line of (await readFile(file, 'utf8')).split('\n')) {
        const heading = /^## `([^`]+)`(.*)$/.exec(line);
        if (heading) names.set(heading[1]!, { typeOnly: heading[2]!.includes('[type-only]') });
      }
      files.set(toPosix(relative(projectRoot, file)), { definingFile: toPosix(relative(base, file)).replace(/\.md$/, ''), names });
    }
  }
  return { module: meta.module, area, path, revision: meta.revision, coverage: typeof meta.coverage === 'number' && meta.coverage > 0 ? meta.coverage : null, files };
}

/** Where `record` appears in `view`, or `undefined` when the view does not list it. */
export function findInView(view: ApiViewSnapshot, record: SymbolRecord): { readonly path: string; readonly typeOnly: boolean } | undefined {
  for (const [path, file] of view.files) {
    if (file.definingFile !== record.file) continue;
    const entry = file.names.get(record.name);
    if (entry) return { path, typeOnly: entry.typeOnly };
  }
  return undefined;
}

async function listFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}
