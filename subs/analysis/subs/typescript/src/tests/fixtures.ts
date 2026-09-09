import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { createDefaultTagRegistry } from '../../../model/src/registry.js';
import { deriveSourceAreas } from '../../../model/src/profiles.js';
import type { OriginalId, SourceArea } from '../../../model/src/interfaces/model.js';
import type { CapturedInput, InventoryModule, ProjectInputView, ProjectInventory } from '../../../project/src/interfaces/project.js';
import { createSourceAnalysis } from '../source-analysis.js';
import type { CatalogExport, CatalogOriginal, FileExports, SourceAnalysis, SourceCatalog, SourceWorkLimits } from '../interfaces/source.js';

export const sourceLimits: SourceWorkLimits = {
  maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000,
  maxForwardingDepth: 256, deadlineMs: 90_000,
};
export const configuration = {
  compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], strict: true, resolveJsonModule: true, allowArbitraryExtensions: true,
    paths: { '@fixture/*': ['./src/*'] },
  },
  include: ['src', 'subs'],
};

interface FixtureOwner { readonly name: string; readonly directory: string; readonly tags: readonly string[] }
const rootOwner: FixtureOwner = { name: 'fixture', directory: '', tags: ['browser'] };
export const childOwner: FixtureOwner = { name: 'child', directory: 'subs/child', tags: ['ui'] };
const definitions = new Map<string, { files: Readonly<Record<string, string>>; owners: readonly FixtureOwner[] }>();

export async function put(root: string, file: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, file)), { recursive: true });
  await writeFile(join(root, file), content);
  const definition = definitions.get(root);
  if (definition) definitions.set(root, { ...definition, files: { ...definition.files, [file]: content } });
}

export async function fixture(files: Readonly<Record<string, string>>, children: readonly FixtureOwner[] = []): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-source-catalog-'));
  try {
    const contents = {
      'module.ramify': 'ramify 1\nmodule fixture tagged [browser]\n',
      'README.md': 'A real source catalog fixture.\n',
      'package.json': '{"type":"module"}\n',
      'tsconfig.json': JSON.stringify(configuration),
      ...files,
    };
    for (const [file, content] of Object.entries(contents)) await put(root, file, content);
    definitions.set(root, { files: contents, owners: [rootOwner, ...children] });
    return root;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export function areasFor(view: ProjectInputView): readonly SourceArea[] {
  const registry = createDefaultTagRegistry();
  return view.inventory.modules.flatMap(module => {
    const ordinary = module.areas.find(area => area.kind === 'ordinary');
    if (!ordinary) throw new Error(`No ordinary area for ${module.id}`);
    const result = deriveSourceAreas(registry, module.id, ordinary.root, module.headerTags);
    if (result.status !== 'valid') throw new Error(JSON.stringify(result.issues));
    return result.value;
  });
}

/**
 * A supplied-view test double, not a second acquisition implementation. Owners
 * and file membership come from the fixture's explicit records. Fixture bytes
 * are immutable; compiler libraries outside it use memoized first disk reads.
 * Real acquisition/parser/compiler composition is tested by the independent
 * reference harness, where those analysis-only runtime contracts are exposed.
 */
export async function acquire(root: string): Promise<ProjectInputView> {
  const definition = definitions.get(root);
  if (!definition) throw new Error(`No explicit fixture definition for ${root}`);
  const files = new Map(Object.entries(definition.files).map(([path, content]) => [resolve(root, path), content]));
  const directories = new Map<string, Set<string>>([[root, new Set()]]);
  for (const path of files.keys()) {
    let child = path;
    while (child !== root) {
      const parent = dirname(child);
      const entries = directories.get(parent) ?? new Set<string>();
      entries.add(child); directories.set(parent, entries); child = parent;
    }
  }
  const span = { start: 9, end: 23, line: 2, column: 1 };
  const modules: InventoryModule[] = definition.owners.map(owner => {
    const sourceRoot = owner.directory ? `${owner.directory}/src` : 'src';
    const id = owner.directory ? `fixture/${owner.name}` : 'fixture';
    const description = owner.directory ? `${owner.directory}/module.ramify` : 'module.ramify';
    return { id, name: owner.name, parent: owner.directory ? 'fixture' : null,
      directory: owner.directory, headerTags: owner.tags,
      areas: (['ordinary', 'tests'] as const).map(kind => {
        const areaRoot = kind === 'tests' ? `${sourceRoot}/tests` : sourceRoot;
        return { owner: id, kind, root: areaRoot, present: directories.has(resolve(root, areaRoot)) };
      }),
      description: { status: 'valid', document: { file: description, version: 1,
        module: { name: owner.name, tags: owner.tags, span }, tokens: [], statements: [] } },
      purpose: { state: 'missing-file', readme: owner.directory ? `${owner.directory}/README.md` : 'README.md' },
    };
  });
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
  const inventory: ProjectInventory = {
    scope: { root, selection: 'given', invokedFrom: root, configuration: join(root, 'tsconfig.json'),
      walkedAreas: modules.flatMap(module => module.areas.map(area => area.root)), independentScopes: [] },
    modules, references: [], outsideModuleFiles: [], warnings: [],
    files: [...files].flatMap(([path, content]) => {
      const local = relative(root, path);
      const owner = modules.find(module => local.startsWith(`${module.areas[0]!.root}/`));
      if (!owner) return [];
      return [{ path: local, owner: owner.id, area: local.startsWith(`${owner.areas[1]!.root}/`) ? 'tests' as const : 'ordinary' as const,
        kind: /\.(?:[cm]?[jt]sx?)$/.test(local) ? 'source' as const : 'resource' as const,
        sha256: sha256(content), bytes: Buffer.byteLength(content) }];
    }).sort((a, b) => a.path.localeCompare(b.path)),
  };
  const inputs: CapturedInput[] = [...files].map(([path, content]) => ({
    path: relative(root, path), role: path.endsWith('.json') ? 'configuration' : 'source',
    sha256: sha256(content), bytes: Buffer.byteLength(content),
  }));
  let disposed = false;
  const memo = new Map<string, Promise<unknown>>();
  const memoized = <T>(method: string, path: string, read: () => Promise<T>): Promise<T> => {
    if (disposed) return Promise.reject(new Error('Fixture input view is disposed'));
    const key = `${method}:${path}`;
    if (!memo.has(key)) memo.set(key, read());
    return memo.get(key) as Promise<T>;
  };
  const local = (path: string) => path === root || path.startsWith(`${root}/`);
  const missing = <T>(fallback: T) => (error: unknown): T => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return fallback;
    throw error;
  };
  return {
    inventory, inputs,
    readFile(path) { const absolute = resolve(root, path); return memoized('readFile', absolute, async () => local(absolute)
      ? files.get(absolute) : readFile(absolute, 'utf8').catch(missing(undefined))); },
    fileExists(path) { const absolute = resolve(root, path); return memoized('fileExists', absolute, async () => local(absolute)
      ? files.has(absolute) : stat(absolute).then(value => value.isFile()).catch(missing(false))); },
    directoryExists(path) { const absolute = resolve(root, path); return memoized('directoryExists', absolute, async () => local(absolute)
      ? directories.has(absolute) : stat(absolute).then(value => value.isDirectory()).catch(missing(false))); },
    readDirectory(path) { const absolute = resolve(root, path); return memoized('readDirectory', absolute, async () => local(absolute)
      ? [...(directories.get(absolute) ?? [])].sort() : readdir(absolute).then(entries => entries.map(name => join(absolute, name)).sort()).catch(missing([]))); },
    realPath(path) { const absolute = resolve(root, path); return memoized('realPath', absolute, async () => local(absolute)
      ? files.has(absolute) || directories.has(absolute) ? absolute : undefined : realpath(absolute).catch(missing(undefined))); },
    async seal() { if (disposed) throw new Error('Fixture input view is disposed'); return { status: 'coherent', inputs }; },
    async dispose() { disposed = true; files.clear(); directories.clear(); memo.clear(); definitions.delete(root); },
  };
}

export async function analyze(root: string): Promise<{
  readonly view: ProjectInputView; readonly source: SourceAnalysis;
  readonly catalog: SourceCatalog; dispose(): Promise<void>;
}> {
  const view = await acquire(root);
  return analyzeView(view);
}

export async function analyzeView(view: ProjectInputView): ReturnType<typeof analyze> {
  let source: SourceAnalysis | undefined;
  try {
    source = await createSourceAnalysis({ view, inventory: view.inventory, areas: areasFor(view), limits: sourceLimits });
    const catalog = await source.catalog();
    const opened = source;
    return { view, source, catalog, async dispose() { await opened.dispose(); await view.dispose(); } };
  } catch (error) {
    await source?.dispose();
    await view.dispose();
    throw error;
  }
}

export async function withCatalog(files: Readonly<Record<string, string>>,
  check: (result: Awaited<ReturnType<typeof analyze>>, root: string) => Promise<void> | void): Promise<void> {
  const root = await fixture(files);
  let result: Awaited<ReturnType<typeof analyze>> | undefined;
  try { result = await analyze(root); await check(result, root); }
  finally { await result?.dispose(); await rm(root, { recursive: true, force: true }); }
}

export function file(catalog: SourceCatalog, path: string): FileExports {
  const found = catalog.files.find(entry => entry.file === path);
  if (!found) throw new Error(`Catalog has no file ${path}`);
  return found;
}
export function exported(catalog: SourceCatalog, path: string, name: string): CatalogExport {
  const found = file(catalog, path).exports.find(entry => entry.name === name);
  if (!found) throw new Error(`Catalog has no export ${name} in ${path}`);
  return found;
}
export function original(catalog: SourceCatalog, id: OriginalId | null): CatalogOriginal {
  const found = catalog.originals.find(entry => id && entry.id.kind === id.kind
    && entry.id.owner === id.owner && entry.id.file === id.file && entry.id.binding === id.binding);
  if (!found) throw new Error(`Catalog has no original ${JSON.stringify(id)}`);
  return found;
}

export function code(file: string, binding: string, owner = 'fixture'): OriginalId {
  return { kind: 'code', owner, file, binding };
}
export function resource(file: string, binding = 'default', owner = 'fixture'): OriginalId {
  return { kind: 'resource', owner, file, binding };
}
