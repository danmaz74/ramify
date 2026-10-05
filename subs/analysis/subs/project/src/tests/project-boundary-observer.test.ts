import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { observeProject, observedEnumerations } from '../observer.js';
import { readProject } from '../read-project.js';
import type { CapturedInput, InventoryUpdate, ProjectInventory, ProjectObserver, ProjectReadOptions } from '../interfaces/project.js';
import { declaration, limits, marker, put } from './fixtures.js';

// PB1-21, PB1-22, PB1-23 and PB1-24 at the iteration 12 boundary: what the
// Project observer records and reads for each kind of change. Expectations
// follow the project-boundary contracts ("Transport, observation and
// projections") and the module description specification, independently of
// the implementation: a declaration or child-module change, a missing
// owned-ignored root and a manifest in the walked tree are structural;
// auxiliary source changes membership in place; byte edits of excluded or
// inert files change no input, read nothing and update nothing; an invalid
// boundary never replaces the last valid inventory. Retained sessions, watch
// registration and fresh-batch findings qualify in iterations 13 and 16.
// The topology is the written one of fixtures.md, reduced to what an observer
// distinguishes. The header and nested-tree parser is this owner's local double.

let work: string, app: string;
const observers: ProjectObserver[] = [];
const normal = '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src","subs/*/src","scripts","tools"],"exclude":["src/tmp","subs/*/src/tmp"]}\n';
const root = (...declarations: string[]): string =>
  ['ramify 1', 'root module app tagged [dispatch]', 'owned-ignored "fixture-project"', 'external "external-project"', ...declarations, ''].join('\n');
const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

beforeEach(async () => {
  work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-boundary-observer-')));
  app = join(work, 'app');
  await put(app, 'module.ramify', root());
  await put(app, 'tsconfig.json', normal);
  await put(app, 'package.json', '{"type":"module"}\n');
  await put(app, 'README.md', '# App\n\nThe written topology.\n');
  await put(app, 'notes/design.md', 'inert root-owned prose\n');
  await put(app, 'scripts/check.ts', "import { api } from '../subs/a/src/api.js';\nvoid api;\n");
  await put(app, 'src/main.ts', 'export const main = 1;\n');
  await put(app, 'src/tmp/throwaway.test.ts', 'export {};\n');
  await put(app, 'tools/tmp/helper.ts', 'export const helper = 1;\n');
  for (const directory of ['fixture-project', 'subs/a/fixtures/sample']) {
    await put(app, `${directory}/module.ramify`, 'ramify 1\nroot module sample\n');
    await put(app, `${directory}/package.json`, '{"type":"module"}\n');
    await put(app, `${directory}/src/world.ts`, 'export const world = 1;\n');
  }
  await put(app, 'external-project/file.ts', 'export const file = 1;\n');
  await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\nowned-ignored "fixtures/sample"\n');
  await put(app, 'subs/a/src/api.ts', 'export function api(): number { return 1; }\n');
  await put(app, 'subs/a/src/tmp/throwaway.ts', 'export {};\n');
  await put(app, 'subs/a/scripts/report.ts', "import { api } from '../src/api.js';\nvoid api;\n");
  await put(app, 'subs/a/docs/guide.md', 'inert a-owned prose\n');
  await put(app, 'subs/a/subs/grand/module.ramify', 'ramify 1\nmodule grand\n');
  await put(app, 'subs/b/module.ramify', 'ramify 1\nmodule b\n');
  await put(app, 'subs/b/src/consumer.ts', "import { api } from '../../a/src/api.js';\nvoid api;\n");
});
afterEach(async () => {
  for (const observer of observers.splice(0)) await observer.dispose();
  await rm(work, { recursive: true, force: true });
});

const request = () => ({ cwd: app, root: app, scope: 'whole-project' as const, configuration: 'discover' as const });
async function observe(changes: Partial<ProjectReadOptions> = {}): Promise<ProjectObserver> {
  const result = await observeProject({ request: request(), parse: declaration, marker, limits, registry: 'registry/1:test', ...changes });
  expect(result.status, JSON.stringify(result.status === 'observing' ? {} : result)).toBe('observing');
  if (result.status !== 'observing') throw new Error('Expected an observing project');
  observers.push(result.observer);
  return result.observer;
}
/** A fresh acquisition of the same disk state: its inventory and captured inputs. */
async function batch(): Promise<{ inventory: ProjectInventory; inputs: readonly CapturedInput[] }> {
  const result = await readProject({ request: request(), parse: declaration, marker, limits, registry: 'registry/1:test' });
  if (result.status !== 'acquired') throw new Error(`Expected an acquired project: ${JSON.stringify(result)}`);
  try { return { inventory: result.view.inventory, inputs: [...result.view.inputs] }; }
  finally { await result.view.dispose(); }
}
/** Paths whose bytes some stage read: the content observations. */
const contentReads = (inputs: readonly CapturedInput[]): string[] => inputs.filter(input => input.bytes > 0).map(input => input.path);
const beneath = (inputs: readonly CapturedInput[], directory: string): CapturedInput[] =>
  inputs.filter(input => input.path.startsWith(`${directory}/`));
function expectKind<K extends InventoryUpdate['kind']>(update: InventoryUpdate, kind: K): Extract<InventoryUpdate, { kind: K }> {
  expect(update.kind, JSON.stringify(update)).toBe(kind);
  if (update.kind !== kind) throw new Error(`Expected a ${kind} update`);
  return update as Extract<InventoryUpdate, { kind: K }>;
}
const auxiliary = (inventory: ProjectInventory) => inventory.files.filter(file => file.placement === 'auxiliary')
  .map(file => [file.path, file.owner, file.area, file.kind]);

describe('PB1-23 at the observer: excluded and inert byte edits', () => {
  const unanalyzed = ['fixture-project/src/world.ts', 'external-project/file.ts', 'subs/a/fixtures/sample/src/world.ts',
    'src/tmp/throwaway.test.ts', 'subs/a/src/tmp/throwaway.ts', 'notes/design.md', 'subs/a/docs/guide.md'];

  it('changes no input, reads nothing and updates nothing for byte edits in declared trees, scratch directories and inert files', async () => {
    const observer = await observe();
    const inputs = observer.inputs, inputId = observer.inputId, inventory = observer.inventory;
    const reads = contentReads(inputs), enumerations = observedEnumerations(observer);
    // Boundary-root evidence is observed; nothing beneath a declared tree is, and
    // nothing beneath a scratch directory is read (the compiler's listing may
    // still record the kinds of its entries, as the next test shows).
    for (const directory of ['fixture-project', 'external-project', 'subs/a/fixtures/sample']) {
      expect(inputs.some(input => input.path === directory && input.role === 'directory')).toBe(true);
      expect(beneath(inputs, directory)).toEqual([]);
    }
    for (const directory of ['src/tmp', 'subs/a/src/tmp']) expect(beneath(inputs, directory).filter(input => input.bytes > 0)).toEqual([]);

    // Each edit changes the size and the modification time, not only the bytes.
    for (const path of unanalyzed) await put(app, path, `${await readFile(join(app, path), 'utf8')}// edited, longer\n`);
    expect(await observer.apply(unanalyzed.map(path => ({ path, kind: 'changed' as const })))).toEqual({ kind: 'unchanged' });
    expect(observer.inventory).toBe(inventory);
    expect(observer.inputs).toEqual(inputs);
    expect(observer.inputId).toBe(inputId);
    expect(contentReads(observer.inputs)).toEqual(reads);
    expect(observedEnumerations(observer)).toBe(enumerations);
    // The sweep agrees: nothing it observed moved, so nothing is reported.
    expect(await observer.reobserve()).toEqual([]);
    // A fresh acquisition of the edited tree records the same inputs.
    expect((await batch()).inputs).toEqual(inputs);
  });

  it('keeps the listing a configuration makes of a declared tree and a scratch directory, without any byte becoming an input (8B deviation 1)', async () => {
    await put(app, 'tsconfig.json', '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src","fixture-project"]}\n');
    const observer = await observe();
    expect(observer.inventory.warnings.map(warning => [warning.code, warning.path, warning.count])).toEqual([
      ['compiler-selected-owned-ignored', 'fixture-project', 1], ['compiler-selected-scratch', 'src/tmp', 1]]);
    const inputs = observer.inputs;
    // The selection depends on membership and kind, so the listed entries are observed, unread.
    for (const path of ['fixture-project/src/world.ts', 'src/tmp/throwaway.test.ts']) {
      expect(inputs.find(input => input.path === path)).toMatchObject({ role: 'dependency', bytes: 0 });
    }
    expect([...beneath(inputs, 'fixture-project'), ...beneath(inputs, 'src/tmp')].filter(input => input.bytes > 0)).toEqual([]);

    await put(app, 'fixture-project/src/world.ts', 'export const world = "edited";\n');
    await put(app, 'src/tmp/throwaway.test.ts', 'export const edited = true;\n');
    expect(await observer.apply([{ path: 'fixture-project/src/world.ts', kind: 'changed' }, { path: 'src/tmp/throwaway.test.ts', kind: 'changed' }]))
      .toEqual({ kind: 'unchanged' });
    expect(observer.inputs).toEqual(inputs);
    expect(await observer.reobserve()).toEqual([]);

    // A membership change there can change the selection and its warnings: acquisition decides.
    await unlink(join(app, 'src/tmp/throwaway.test.ts'));
    const removed = expectKind(await observer.apply([{ path: 'src/tmp/throwaway.test.ts', kind: 'deleted' }]), 'structural');
    expect(removed.inventory.warnings.map(warning => [warning.code, warning.path, warning.count]))
      .toEqual([['compiler-selected-owned-ignored', 'fixture-project', 1]]);
    // A new file in a listed directory, named only by its own event, is seen through that listing.
    await put(app, 'fixture-project/src/second.ts', 'export {};\n');
    const added = expectKind(await observer.apply([{ path: 'fixture-project/src/second.ts', kind: 'created' }]), 'structural');
    expect(added.inventory.warnings).toEqual([expect.objectContaining({ code: 'compiler-selected-owned-ignored', path: 'fixture-project',
      files: ['fixture-project/src/second.ts', 'fixture-project/src/world.ts'], count: 2 })]);
    expect(contentReads(observer.inputs).filter(path => path.startsWith('fixture-project/'))).toEqual([]);
  });

  it('keeps an excluded file an input when a stage read its bytes through a link', async () => {
    await symlink(join(app, 'fixture-project/src'), join(app, 'links'));
    const observer = await observe();
    const linked = join(app, 'links/world.ts'), real = join(app, 'fixture-project/src/world.ts');
    const bytes = await readFile(linked);
    // A compiler read of the linked spelling and its realpath probe of the physical file.
    observer.sink.file(linked, sha256(bytes), bytes.length, 'dependency');
    observer.sink.probe(real, 'realPath');
    expect(await observer.apply([])).toEqual({ kind: 'unchanged' });
    await put(app, 'fixture-project/src/world.ts', 'export const world = 2;\n');
    expect(expectKind(await observer.apply([{ path: real, kind: 'changed' }]), 'local').changed).toEqual(['fixture-project/src/world.ts']);
  });
});

describe('PB1-21 at the observer: boundary and child declaration changes', () => {
  it('retires a newly declared tree from the inventory and inputs, and brings it back through fresh capture when the declaration goes', async () => {
    await put(app, 'vendor/lib.ts', 'export const lib = 1;\n');
    await put(app, 'vendor/notes.md', 'inert\n');
    const observer = await observe();
    expect(observer.inventory.files.find(file => file.path === 'vendor/lib.ts')).toMatchObject({ owner: 'app', placement: 'auxiliary' });

    await put(app, 'module.ramify', root('owned-ignored "vendor"'));
    const declared = expectKind(await observer.apply([{ path: 'module.ramify', kind: 'changed' }]), 'structural');
    expect(declared.inventory.files.some(file => file.path.startsWith('vendor/'))).toBe(false);
    expect(declared.inventory.scope.ownership.exclusions).toContainEqual({ kind: 'owned-ignored', directory: 'vendor', owner: 'app' });
    expect(beneath(observer.inputs, 'vendor')).toEqual([]);
    expect(observer.inputs.some(input => input.path === 'vendor' && input.role === 'directory')).toBe(true);

    // Edited while excluded: nothing is observed, so nothing changes.
    await put(app, 'vendor/lib.ts', 'export const lib = 2; // while excluded\n');
    expect(await observer.apply([{ path: 'vendor/lib.ts', kind: 'changed' }])).toEqual({ kind: 'unchanged' });

    await put(app, 'module.ramify', root());
    const reopened = expectKind(await observer.apply([{ path: 'module.ramify', kind: 'changed' }]), 'structural');
    const current = await readFile(join(app, 'vendor/lib.ts'));
    expect(reopened.inventory.files.find(file => file.path === 'vendor/lib.ts'))
      .toEqual({ path: 'vendor/lib.ts', owner: 'app', area: 'ordinary', kind: 'source', placement: 'auxiliary', sha256: sha256(current), bytes: current.length });
    expect(observer.inputs.find(input => input.path === 'vendor/lib.ts')).toEqual({ path: 'vendor/lib.ts', role: 'source', sha256: sha256(current), bytes: current.length });
    const fresh = await batch();
    expect([observer.inventory.files, observer.inputs]).toEqual([fresh.inventory.files, fresh.inputs]);
  });

  it('rebuilds when a declaration changes kind or directory', async () => {
    const observer = await observe();
    await put(app, 'module.ramify', root().replace('owned-ignored "fixture-project"', 'external "fixture-project"'));
    const kind = expectKind(await observer.apply([{ path: 'module.ramify', kind: 'changed' }]), 'structural');
    expect(kind.inventory.scope.ownership.exclusions.filter(exclusion => exclusion.directory === 'fixture-project'))
      .toEqual([{ kind: 'external', directory: 'fixture-project', owner: null }]);
    await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\nowned-ignored "fixtures"\n');
    const moved = expectKind(await observer.apply([{ path: 'subs/a/module.ramify', kind: 'changed' }]), 'structural');
    expect(moved.inventory.scope.ownership.exclusions.filter(exclusion => exclusion.owner === 'app/a' && exclusion.kind === 'owned-ignored'))
      .toEqual([{ kind: 'owned-ignored', directory: 'subs/a/fixtures', owner: 'app/a' }]);
  });

  it('invalidates the model when an owned-ignored root or a directory above it disappears, keeping the last valid inventory', async () => {
    await put(app, 'module.ramify', root('owned-ignored "data/cache"'));
    await put(app, 'data/cache/blob.bin', 'cached\n');
    const observer = await observe();
    const inventory = observer.inventory;
    // One event names only the removed parent directory.
    await rm(join(app, 'data'), { recursive: true });
    expect(await observer.apply([{ path: 'data', kind: 'deleted' }]))
      .toMatchObject({ kind: 'invalid', issues: [{ code: 'missing-owned-ignored', path: 'module.ramify' }] });
    expect(observer.inventory).toBe(inventory);
    await rm(join(app, 'fixture-project'), { recursive: true });
    expect(await observer.apply([{ path: 'fixture-project', kind: 'deleted' }]))
      .toMatchObject({ kind: 'invalid', issues: expect.arrayContaining([expect.objectContaining({ code: 'missing-owned-ignored' })]) });
    expect(observer.inventory).toBe(inventory);
  });

  it('rebuilds when a child module appears or a module directory disappears', async () => {
    const observer = await observe();
    await put(app, 'subs/c/module.ramify', 'ramify 1\nmodule c\n');
    await put(app, 'subs/c/src/c.ts', 'export const c = 1;\n');
    const added = expectKind(await observer.apply([{ path: 'subs/c', kind: 'created' }]), 'structural');
    expect(added.inventory.modules.map(module => module.id)).toEqual(['app', 'app/a', 'app/a/grand', 'app/b', 'app/c']);
    await rm(join(app, 'subs/a/subs/grand'), { recursive: true });
    const removed = expectKind(await observer.apply([{ path: 'subs/a/subs/grand', kind: 'deleted' }]), 'structural');
    expect(removed.inventory.modules.map(module => module.id)).toEqual(['app', 'app/a', 'app/b', 'app/c']);
  });

  it('treats a package manifest appearing in the walked tree as a layout change', async () => {
    const observer = await observe();
    const inventory = observer.inventory;
    await put(app, 'notes/package.json', '{}\n');
    expect(await observer.apply([{ path: 'notes/package.json', kind: 'created' }]))
      .toMatchObject({ kind: 'invalid', issues: [{ code: 'undeclared-project-boundary', path: 'notes/package.json' }] });
    expect(observer.inventory).toBe(inventory);
    await rm(join(app, 'notes/package.json'));
    await put(app, 'subs/a/src/vendor/package.json', '{}\n');
    expect(await observer.apply([{ path: 'subs/a/src/vendor/package.json', kind: 'created' }]))
      .toMatchObject({ kind: 'invalid', issues: [{ code: 'undeclared-project-boundary', path: 'subs/a/src/vendor/package.json' }] });
  });

  it('rebuilds when a source area directory disappears with its files', async () => {
    await put(app, 'subs/b/src/nested/extra.ts', 'export const extra = 1;\n');
    const observer = await observe();
    await rm(join(app, 'subs/b/src/nested'), { recursive: true });
    const removed = expectKind(await observer.apply([{ path: 'subs/b/src/nested', kind: 'deleted' }]), 'structural');
    expect(removed.inventory.files.map(file => file.path).filter(path => path.startsWith('subs/b/'))).toEqual(['subs/b/src/consumer.ts']);
  });
});

describe('PB1-22 at the observer: auxiliary membership', () => {
  it('updates edits, additions and deletions of auxiliary source in place, as a fresh acquisition records them', async () => {
    const observer = await observe();
    expect(auxiliary(observer.inventory)).toEqual([
      ['scripts/check.ts', 'app', 'ordinary', 'source'], ['subs/a/scripts/report.ts', 'app/a', 'ordinary', 'source'],
      ['tools/tmp/helper.ts', 'app', 'ordinary', 'source']]);
    const same = async () => {
      const fresh = await batch();
      expect([observer.inventory.files, observer.inputs]).toEqual([fresh.inventory.files, fresh.inputs]);
    };

    await put(app, 'scripts/check.ts', "import { api } from '../subs/a/src/api.js';\nexport const checked = api();\n");
    expect(expectKind(await observer.apply([{ path: 'scripts/check.ts', kind: 'changed' }]), 'local'))
      .toMatchObject({ changed: ['scripts/check.ts'], created: [], deleted: [] });
    await same();

    await put(app, 'scripts/extra.ts', 'export const extra = 1;\n');
    await put(app, 'subs/a/scripts/more.ts', 'export const more = 1;\n');
    await put(app, 'subs/loose.ts', 'export const loose = 1;\n');
    const created = expectKind(await observer.apply(['scripts/extra.ts', 'subs/a/scripts/more.ts', 'subs/loose.ts']
      .map(path => ({ path, kind: 'created' as const }))), 'local');
    expect([created.created, created.deleted, created.changed]).toEqual([['scripts/extra.ts', 'subs/a/scripts/more.ts', 'subs/loose.ts'], [], []]);
    const extra = await readFile(join(app, 'scripts/extra.ts'));
    expect(created.inventory.files.find(file => file.path === 'scripts/extra.ts'))
      .toEqual({ path: 'scripts/extra.ts', owner: 'app', area: 'ordinary', kind: 'source', placement: 'auxiliary', sha256: sha256(extra), bytes: extra.length });
    expect(auxiliary(created.inventory).map(([path, owner]) => [path, owner])).toEqual([['scripts/check.ts', 'app'], ['scripts/extra.ts', 'app'],
      ['subs/a/scripts/more.ts', 'app/a'], ['subs/a/scripts/report.ts', 'app/a'], ['subs/loose.ts', 'app'], ['tools/tmp/helper.ts', 'app']]);
    await same();

    await unlink(join(app, 'scripts/extra.ts'));
    const deleted = expectKind(await observer.apply([{ path: 'scripts/extra.ts', kind: 'deleted' }]), 'local');
    expect([deleted.created, deleted.deleted]).toEqual([[], ['scripts/extra.ts']]);
    expect(observer.inputs.some(input => input.path === 'scripts/extra.ts')).toBe(false);
    await same();

    // Inert files and JavaScript the configuration does not admit are neither inventoried nor observed.
    await put(app, 'scripts/notes.md', 'notes\n');
    await put(app, 'scripts/run.mjs', 'export {};\n');
    const inputs = observer.inputs;
    expect(await observer.apply([{ path: 'scripts/notes.md', kind: 'created' }, { path: 'scripts/run.mjs', kind: 'created' }]))
      .toEqual({ kind: 'unchanged' });
    expect(observer.inputs).toEqual(inputs);
  });

  it('recomputes a directory created with auxiliary source already inside, from the directory event or one file event', async () => {
    const observer = await observe();
    await put(app, 'tools/deep/a.ts', 'export const a = 1;\n');
    await put(app, 'tools/deep/b.ts', 'export const b = 1;\n');
    const fromDirectory = expectKind(await observer.apply([{ path: 'tools/deep', kind: 'created' }]), 'structural');
    expect(auxiliary(fromDirectory.inventory).map(([path]) => path)).toEqual(['scripts/check.ts', 'subs/a/scripts/report.ts', 'tools/deep/a.ts', 'tools/deep/b.ts', 'tools/tmp/helper.ts']);

    await put(app, 'tools/other/x.ts', 'export const x = 1;\n');
    await put(app, 'tools/other/y.ts', 'export const y = 1;\n');
    const fromFile = expectKind(await observer.apply([{ path: 'tools/other/x.ts', kind: 'created' }]), 'structural');
    expect(auxiliary(fromFile.inventory).map(([path]) => path)).toContain('tools/other/y.ts');
  });

  it('recomputes auxiliary source the sweep finds only through a changed listing', async () => {
    await put(app, 'misc/readme.txt', 'inert\n');
    const observer = await observe();
    await put(app, 'misc/hidden.ts', 'export const hidden = 1;\n');
    const changes = await observer.reobserve();
    expect(changes).toEqual([{ path: join(app, 'misc'), kind: 'changed' }]);
    const update = expectKind(await observer.apply(changes), 'structural');
    expect(update.inventory.files.find(file => file.path === 'misc/hidden.ts')).toMatchObject({ owner: 'app', placement: 'auxiliary' });
    expect(await observer.reobserve()).toEqual([]);
  });

  it('recomputes when a directory holding auxiliary source disappears', async () => {
    const observer = await observe();
    await rm(join(app, 'subs/a/scripts'), { recursive: true });
    const removed = expectKind(await observer.apply([{ path: 'subs/a/scripts', kind: 'deleted' }]), 'structural');
    expect(auxiliary(removed.inventory).map(([path]) => path)).toEqual(['scripts/check.ts', 'tools/tmp/helper.ts']);
  });
});

describe('PB1-24 at the observer: invalid boundaries and cancellation', () => {
  it('reports an overlapping declaration as invalid without adopting a partial inventory, then recovers', async () => {
    const observer = await observe();
    const inventory = observer.inventory;
    await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\nowned-ignored "fixtures/sample"\nexternal "fixtures"\n');
    expect(await observer.apply([{ path: 'subs/a/module.ramify', kind: 'changed' }]))
      .toMatchObject({ kind: 'invalid', issues: expect.arrayContaining([expect.objectContaining({ code: 'overlapping-nested-tree', path: 'subs/a/module.ramify' })]) });
    expect(observer.inventory).toBe(inventory);
    // Restored, the description matches the last valid inventory again: a local description update.
    await put(app, 'subs/a/module.ramify', 'ramify 1\nmodule a\nowned-ignored "fixtures/sample"\n');
    expect(expectKind(await observer.apply([{ path: 'subs/a/module.ramify', kind: 'changed' }]), 'local').descriptions).toEqual(['subs/a/module.ramify']);
  });

  it('rejects a cancelled structural update and keeps observing the last inventory', async () => {
    const observer = await observe();
    const inventory = observer.inventory;
    await put(app, 'module.ramify', root('owned-ignored "notes"'));
    const controller = new AbortController();
    controller.abort();
    await expect(observer.apply([{ path: 'module.ramify', kind: 'changed' }], controller.signal)).rejects.toThrow();
    expect(observer.inventory).toBe(inventory);
    const update = expectKind(await observer.apply([{ path: 'module.ramify', kind: 'changed' }]), 'structural');
    expect(update.inventory.scope.ownership.exclusions).toContainEqual({ kind: 'owned-ignored', directory: 'notes', owner: 'app' });
  });

  it('reports an exceeded byte bound while rebuilding as incomplete, never as a valid partial model', async () => {
    const observer = await observe({ limits: { ...limits, maxApplicationBytes: 600 } });
    const inventory = observer.inventory;
    await mkdir(join(app, 'tools/large'), { recursive: true });
    await put(app, 'tools/large/big.ts', `export const big = '${'x'.repeat(1000)}';\n`);
    expect(await observer.apply([{ path: 'tools/large', kind: 'created' }]))
      .toMatchObject({ kind: 'incomplete', issues: [expect.objectContaining({ code: 'resource-limit' })] });
    expect(observer.inventory).toBe(inventory);
  });
});
