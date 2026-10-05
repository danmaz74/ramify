import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { API } from 'typescript/unstable/sync';
import { afterEach, expect, it } from 'vitest';
import { createDescriptionSet, describeFiles, assembleCatalog, type DescriptionSet, type DescriptionUpdate } from '../descriptions.js';
import { createSourceAnalysis } from '../source-analysis.js';
import type { CatalogExport, FileDescription } from '../interfaces/source.js';
import { acquire, areasFor, drop, fixture, put, sourceLimits } from './fixtures.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function start(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await fixture(files);
  roots.push(root);
  return root;
}

/** Describe over a real compiler snapshot of the fixture's current disk state.
 * Each state opens its own snapshot; only the plain descriptions carry over. */
async function describe(root: string, set: DescriptionSet, files?: readonly string[]): Promise<DescriptionUpdate> {
  const view = await acquire(root);
  const inputs = { inventory: view.inventory, areas: areasFor(view), limits: sourceLimits };
  const configuration = join(root, 'tsconfig.json');
  const api = new API({ cwd: root });
  let snapshot: ReturnType<API['updateSnapshot']> | undefined;
  try {
    snapshot = api.updateSnapshot({ openProjects: [configuration] });
    const project = snapshot.getProject(configuration);
    if (!project) throw new Error('The compiler could not create the fixture project');
    const host = { resourceWitness: '', fileExists: existsSync,
      realpath: (path: string) => existsSync(path) ? realpathSync(path) : path,
      directoryExists: (path: string) => existsSync(path) && statSync(path).isDirectory(), readFile: (path: string) => {
      try { return readFileSync(path, 'utf8'); }
      catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null; throw error; }
    } };
    return set.describe(project, inputs, host, new Map<CatalogExport, boolean>(),
      files ?? inputs.inventory.files.map(file => file.path));
  } finally { snapshot?.dispose(); api.close(); }
}

function description(update: DescriptionUpdate, path: string): FileDescription {
  const found = update.descriptions.find(entry => entry.file === path);
  if (!found) throw new Error(`No description of ${path} among ${update.descriptions.map(entry => entry.file).join(', ')}`);
  return found;
}
function names(description: FileDescription): readonly string[] {
  return description.exports.exports.map(entry => entry.name);
}
/** The same disk state described in one whole pass, as the comparison. */
async function whole(root: string): Promise<DescriptionSet> {
  const set = createDescriptionSet();
  await describe(root, set);
  return set;
}

const chain = {
  'src/api.ts': 'export const value = 1;\n',
  'src/mid.ts': 'export { value as passed } from "./api.js";\n',
  'src/top.ts': 'export { passed } from "./mid.js";\n',
  'src/hub.ts': 'export * as api from "./api.js";\n',
  'src/index.ts': 'export * from "./api.js";\n',
  'src/probe.ts': 'export const own = 1;\nexport type { Absent } from "./absent.js";\n',
};

it('records the files, probes and namespaces each description read', async () => {
  const root = await start(chain);
  const set = createDescriptionSet();
  const update = await describe(root, set);
  expect(update.delta.recomputed).toEqual([
    'src/api.ts', 'src/hub.ts', 'src/index.ts', 'src/mid.ts', 'src/probe.ts', 'src/top.ts',
  ]);
  expect(update.delta.moved).toEqual([]);
  expect(update.delta.changed).toEqual(update.delta.recomputed);
  expect(description(update, 'src/mid.ts').dependencies.files).toEqual(['src/api.ts']);
  expect(description(update, 'src/top.ts').dependencies.files).toEqual(['src/mid.ts']);
  expect(description(update, 'src/hub.ts').dependencies.files).toEqual(['src/api.ts']);
  expect(description(update, 'src/index.ts').dependencies.files).toEqual(['src/api.ts']);
  expect(description(update, 'src/api.ts').dependencies).toEqual({ files: [], resources: [], shims: [], absent: [] });
  expect(description(update, 'src/probe.ts').dependencies.absent.some(path => path.includes('absent'))).toBe(true);
  expect(description(update, 'src/api.ts').originals.map(original => original.id.binding)).toEqual(['value']);
  expect(description(update, 'src/mid.ts').originals).toEqual([]);
  expect(assembleCatalog(set.all())).toEqual((await whole(root)).catalog());
}, 60_000);

it('recomputes every description a changed one can reach and nothing else', async () => {
  const root = await start(chain);
  const set = createDescriptionSet();
  await describe(root, set);
  await put(root, 'src/api.ts', 'export const value = 1;\nexport const extra = 2;\n');
  const update = await describe(root, set, ['src/api.ts']);
  // api's own dependents are reached; top depends on mid, whose description is
  // unchanged by value, so the chain stops there.
  expect(update.delta.recomputed).toEqual(['src/api.ts', 'src/hub.ts', 'src/index.ts', 'src/mid.ts']);
  expect(update.delta.changed).toEqual(['src/api.ts', 'src/hub.ts', 'src/index.ts']);
  expect(update.delta.moved).toEqual([]);
  expect(names(description(update, 'src/index.ts'))).toContain('extra');
  expect(description(update, 'src/hub.ts').exports.exports[0].namespace?.map(entry => entry.name)).toContain('extra');
  expect(update.delta.changedOriginals.map(id => id.binding)).toEqual(['extra']);
  expect(update.delta.removedOriginals).toEqual([]);
  expect(assembleCatalog(set.all())).toEqual((await whole(root)).catalog());
}, 60_000);

it('separates a declaration move from a change by value', async () => {
  const root = await start(chain);
  const set = createDescriptionSet();
  await describe(root, set);
  await put(root, 'src/api.ts', '// One line of documentation.\nexport const value = 1;\n');
  const update = await describe(root, set, ['src/api.ts']);
  expect(update.delta.moved).toEqual(['src/api.ts']);
  expect(update.delta.changed).toEqual([]);
  expect(update.delta.changedOriginals.map(id => id.binding)).toEqual(['value']);
  expect(description(update, 'src/api.ts').originals[0].declarations[0].line).toBe(2);
  expect(assembleCatalog(set.all())).toEqual((await whole(root)).catalog());
}, 60_000);

it('propagates ambiguity and incompleteness to a fixed point and settles when it is removed', async () => {
  const root = await start({
    'src/left.ts': 'export const clash = "left";\n',
    'src/right.ts': 'export const clash = "right";\n',
    'src/barrel.ts': 'export * from "./left.js";\nexport * from "./right.js";\n',
    'src/reader.ts': 'export { clash } from "./barrel.js";\n',
  });
  const set = createDescriptionSet();
  const first = await describe(root, set);
  expect(description(first, 'src/barrel.ts').exports.state).toBe('ambiguous');
  expect(description(first, 'src/reader.ts').exports.state).toBe('ambiguous');
  expect(description(first, 'src/reader.ts').coverage.map(issue => issue.code)).toEqual(['ambiguous-original']);
  await put(root, 'src/barrel.ts', 'export * from "./left.js";\n');
  const second = await describe(root, set, ['src/barrel.ts']);
  expect(second.delta.recomputed).toEqual(['src/barrel.ts', 'src/reader.ts']);
  expect(description(second, 'src/barrel.ts').exports.state).toBe('complete');
  expect(description(second, 'src/reader.ts').exports.state).toBe('complete');
  expect(description(second, 'src/reader.ts').coverage).toEqual([]);
  expect(description(second, 'src/reader.ts').exports.exports[0].original?.file).toBe('left.ts');
  expect(assembleCatalog(set.all())).toEqual((await whole(root)).catalog());
}, 60_000);

it('reports removed originals and re-reads the descriptions that depended on a deleted file', async () => {
  const root = await start(chain);
  const set = createDescriptionSet();
  await describe(root, set);
  await put(root, 'src/mid.ts', 'export const unrelated = 3;\n');
  const update = await describe(root, set, ['src/mid.ts']);
  expect(update.delta.recomputed).toEqual(['src/mid.ts', 'src/top.ts']);
  expect(update.delta.removedOriginals.map(id => id.binding)).toEqual([]);
  expect(update.delta.changedOriginals.map(id => id.binding)).toEqual(['unrelated']);
  expect(description(update, 'src/top.ts').exports.exports[0].original).toBeNull();
  expect(description(update, 'src/top.ts').exports.state).toBe('incomplete');
  expect(assembleCatalog(set.all())).toEqual((await whole(root)).catalog());
}, 60_000);

it('assembles the exposed descriptions of a whole project into its catalog', async () => {
  const root = await start(chain);
  const view = await acquire(root);
  const inputs = { view, inventory: view.inventory, areas: areasFor(view), limits: sourceLimits };
  const analysis = await createSourceAnalysis(inputs);
  try {
    const descriptions = await describeFiles(inputs, view.inventory.files.map(file => file.path));
    expect(assembleCatalog(descriptions)).toEqual(await analysis.catalog());
    expect(descriptions.map(description => description.file).sort()).toEqual(view.inventory.files.map(file => file.path).sort());
    await expect(describeFiles(inputs, ['src/outside.ts'])).rejects.toMatchObject({ code: 'unavailable' });
  } finally { await analysis.dispose(); await view.dispose(); }
}, 90_000);

it('recomputes a resource description when the shim that described it changed', async () => {
  const root = await start({
    'src/resources.d.ts': 'declare module "*.module.css" {\n  const classes: { readonly [key: string]: string };\n  export default classes;\n}\n',
    'src/theme.module.css': '.root { color: red; }\n',
    'src/view.ts': 'export { default as theme } from "./theme.module.css";\n',
    'src/unrelated.ts': 'export const plain = 1;\n',
  });
  const set = createDescriptionSet();
  const first = await describe(root, set);
  expect(description(first, 'src/theme.module.css').dependencies.shims).toEqual(['src/resources.d.ts']);
  expect(description(first, 'src/theme.module.css').dependencies.files).toEqual(['src/view.ts']);
  await put(root, 'src/resources.d.ts', ['declare module "*.module.css" {',
    '  const classes: { readonly [key: string]: string };',
    '  export const helper: string;', '  export default classes;', '}', ''].join('\n'));
  const update = await describe(root, set, ['src/resources.d.ts']);
  // The shim, the resource it describes and the file forwarding that resource
  // are read again; a file that describes no resource is not.
  expect(update.delta.recomputed).toEqual(['src/resources.d.ts', 'src/theme.module.css', 'src/view.ts']);
  expect(update.delta.changed).toContain('src/theme.module.css');
  expect(names(description(update, 'src/theme.module.css'))).toEqual(['default', 'helper']);
  expect(assembleCatalog(set.all())).toEqual((await whole(root)).catalog());
}, 60_000);

it('reads again every description that embeds a namespace of a deleted module', async () => {
  const root = await start({
    'src/leaf.ts': 'export const leafValue = 1;\n',
    'src/holder.ts': "import * as ns from './leaf.js';\nexport { ns };\n",
    'src/relay.ts': "export { ns } from './holder.js';\n",
    'src/top.ts': "export { ns } from './relay.js';\n",
  });
  const set = createDescriptionSet();
  const base = await describe(root, set);
  // Each description embeds the leaf module's namespace, so each depends on it.
  for (const file of ['src/holder.ts', 'src/relay.ts', 'src/top.ts']) {
    expect(description(base, file).dependencies.files).toContain('src/leaf.ts');
  }
  await drop(root, 'src/leaf.ts');
  const update = await describe(root, set, ['src/leaf.ts']);
  expect(update.delta.recomputed).toEqual(['src/holder.ts', 'src/relay.ts', 'src/top.ts']);
  expect(update.delta.removedOriginals.map(id => id.binding)).toEqual(['leafValue']);
  expect(assembleCatalog(set.all())).toEqual((await whole(root)).catalog());
}, 60_000);

it('reads a module description again when the source augmenting it changed', async () => {
  const root = await start({
    'src/merged.ts': 'export interface Merged { readonly a: number }\n',
    'src/augment.ts': ["import './merged.js';",
      "declare module './merged.js' { export interface Extra { readonly b: number } }",
      'export const own = 1;', ''].join('\n'),
    'src/unrelated.ts': 'export const plain = 1;\n',
  });
  const set = createDescriptionSet();
  const base = await describe(root, set);
  expect(names(description(base, 'src/merged.ts'))).toEqual(['Extra', 'Merged']);
  // The augmenting file's own description says nothing about the module it
  // augments, so its content identity is the edge that reaches that module.
  expect(description(base, 'src/merged.ts').dependencies.files).toEqual(['src/augment.ts']);
  await put(root, 'src/augment.ts', ["import './merged.js';",
    "declare module './merged.js' { export interface Extra { readonly b: number } export interface Added { readonly c: number } }",
    'export const own = 1;', ''].join('\n'));
  const update = await describe(root, set, ['src/augment.ts']);
  expect(update.delta.recomputed).toEqual(['src/augment.ts', 'src/merged.ts']);
  expect(names(description(update, 'src/merged.ts'))).toEqual(['Added', 'Extra', 'Merged']);
  expect(assembleCatalog(set.all())).toEqual((await whole(root)).catalog());
}, 60_000);

it('reports a file whose coverage notes only moved as moved, not changed', async () => {
  const root = await start(chain);
  const set = createDescriptionSet();
  const base = await describe(root, set);
  expect(description(base, 'src/probe.ts').coverage.length).toBeGreaterThan(0);
  await put(root, 'src/probe.ts', `// One line of documentation.\n${chain['src/probe.ts']}`);
  const update = await describe(root, set, ['src/probe.ts']);
  expect([update.delta.moved, update.delta.changed]).toEqual([['src/probe.ts'], []]);
  expect(description(update, 'src/probe.ts').coverage[0].location.line).toBeGreaterThan(1);
  expect(assembleCatalog(set.all())).toEqual((await whole(root)).catalog());
}, 60_000);
