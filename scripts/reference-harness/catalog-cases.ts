import { symlink } from 'node:fs/promises';
import { join } from 'node:path';

import type { CatalogOriginal, FileExports, ProjectInventory, SourceCatalog } from '../../subs/analysis/src/validation-entry.js';
import { parseDescription } from '../../subs/analysis/subs/descriptions/src/parse.js';
import { assignOriginalTags, createDefaultTagRegistry, deriveSourceAreas, originalKey } from '../../subs/analysis/subs/model/src/index.js';
import type { ModelResult, OriginalId, SourceArea } from '../../subs/analysis/subs/model/src/index.js';
import { readProject } from '../../subs/analysis/subs/project/src/read-project.js';
import type { AcquisitionLimits } from '../../subs/analysis/subs/project/src/interfaces/project.js';
import { createSourceAnalysis } from '../../subs/analysis/subs/typescript/src/source-analysis.js';
import type { SourceAnalysis, SourceWorkLimits } from '../../subs/analysis/subs/typescript/src/interfaces/source.js';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { repositoryRoot } from './plan.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';
import { recordObservation } from './observations.js';

const acquisitionLimits: AcquisitionLimits = {
  attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
  maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
  maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000,
};
const sourceLimits: SourceWorkLimits = {
  maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000,
  maxForwardingDepth: 256, deadlineMs: 90_000,
};
const registry = createDefaultTagRegistry();
const referenceRoot = join(repositoryRoot, 'examples/collection-review');
const card = {
  file: 'subs/workspace/subs/catalog/subs/ui/src/catalog-card.module.css',
  owner: 'collection-review/workspace/catalog/ui', bindingFile: 'catalog-card.module.css',
};
const resultStyle = {
  file: 'subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.module.css',
  owner: 'collection-review/workspace/reviews/ui/pure-ui', bindingFile: 'review-result.module.css',
};
const aliasFile = 'subs/workspace/subs/catalog/subs/ui/src/styles-alias.ts';

function valid<T>(result: ModelResult<T>): T {
  if (result.status !== 'valid') throw new Error(JSON.stringify(result.issues));
  return result.value;
}

function sourceAreas(inventory: ProjectInventory): readonly SourceArea[] {
  return inventory.modules.flatMap(module => valid(deriveSourceAreas(registry, module.id,
    module.areas.find(area => area.kind === 'ordinary')!.root, module.headerTags)));
}

/** Each baseline and changed fixture uses a fresh captured view and compiler lifetime. */
async function catalogued(context: ProjectContext, check: (catalog: SourceCatalog, inventory: ProjectInventory) => void): Promise<void> {
  const acquired = await readProject({
    request: { cwd: context.root, root: context.root, scope: 'whole-project', configuration: 'discover' },
    parse: parseDescription, limits: acquisitionLimits,
  });
  context.assertions.equal('project acquired', acquired.status, 'acquired');
  if (acquired.status !== 'acquired') throw new Error(JSON.stringify(acquired));
  let source: SourceAnalysis | undefined;
  try {
    source = await createSourceAnalysis({ view: acquired.view, inventory: acquired.view.inventory,
      areas: sourceAreas(acquired.view.inventory), limits: sourceLimits });
    const catalog = await source.catalog();
    recordObservation('catalog', { scope: acquired.view.inventory.scope, warnings: acquired.view.inventory.warnings,
      files: catalog.files.length, originals: catalog.originals.length, coverage: catalog.coverage });
    check(catalog, acquired.view.inventory);
    context.assertions.equal('catalog includes every owned file', catalog.files.map(file => file.file).sort(),
      acquired.view.inventory.files.map(file => file.path).sort());
    context.assertions.equal('captured compiler inputs coherent', (await acquired.view.seal()).status, 'coherent');
  } finally {
    try { await source?.dispose(); }
    finally { await acquired.view.dispose(); }
  }
}

function fileExports(assertions: Assertions, catalog: SourceCatalog, file: string): FileExports {
  const found = catalog.files.find(entry => entry.file === file);
  assertions.ok(`${file}: catalogued`, found);
  if (!found) throw new Error(`No export description for ${file}`);
  assertions.equal(`${file}: export enumeration complete`, found.state, 'complete');
  assertions.equal(`${file}: no export issues`, found.issueIds, []);
  return found;
}

function resource(assertions: Assertions, catalog: SourceCatalog,
  expected: { file: string; owner: string; bindingFile: string }, tags: readonly string[]): {
    exports: FileExports; original: CatalogOriginal;
  } {
  const exports = fileExports(assertions, catalog, expected.file);
  const id: OriginalId = { kind: 'resource', owner: expected.owner, file: expected.bindingFile, binding: 'default' };
  assertions.equal(`${expected.file}: default identity`, exports.exports.find(entry => entry.name === 'default')?.original, id);
  const originals = catalog.originals.filter(entry => originalKey(entry.id) === originalKey(id));
  assertions.equal(`${expected.file}: one canonical original`, originals.length, 1);
  const original = originals[0]!;
  const root = expected.file.slice(0, -expected.bindingFile.length - 1);
  assertions.equal(`${expected.file}: defining resource and source area`, original.origin, {
    file: expected.file, area: { owner: expected.owner, kind: 'ordinary', root,
      profile: tags.length ? ['browser', 'ui'] : [] },
  });
  assertions.equal(`${expected.file}: runtime value exists`, original.hasValue, true);
  assertions.equal(`${expected.file}: default tags from defining area`,
    valid(assignOriginalTags(registry, original.origin.area, [])).tags, tags);
  assertions.ok(`${expected.file}: declaration evidence retained`, original.declarations.length > 0);
  return { exports, original };
}

function referenceResources(assertions: Assertions, catalog: SourceCatalog, inventory: ProjectInventory): void {
  assertions.equal('reference declared owners', inventory.modules.length, 15);
  assertions.equal('reference configuration warnings', inventory.warnings.map(warning => [warning.entry, warning.count]),
    [['vite.config.ts', 1], ['vitest.config.ts', 1]]);
  const first = resource(assertions, catalog, card, ['ui']);
  const second = resource(assertions, catalog, resultStyle, ['ui']);
  assertions.equal('catalog card effective names', first.exports.exports.map(entry => entry.name), ['default']);
  assertions.equal('review result effective names', second.exports.exports.map(entry => entry.name), ['default']);
  assertions.ok('two resources retain distinct identities', originalKey(first.original.id) !== originalKey(second.original.id));
  const sharedDescriptions = first.exports.descriptionFiles.filter(file => second.exports.descriptionFiles.includes(file));
  assertions.ok('both descriptions use shared installed Vite shim', sharedDescriptions.some(file => file.endsWith('/vite/client.d.ts')));
  assertions.ok('resource identities never use a declaration shim', catalog.originals
    .filter(original => original.id.kind === 'resource')
    .every(original => !original.id.file.endsWith('.d.ts') && !original.origin.file.includes('node_modules')));
}

function fixtureBaseline(assertions: Assertions, catalog: SourceCatalog, inventory: ProjectInventory): void {
  assertions.equal('fixture owner identities', inventory.modules.map(module => module.id),
    ['fixture', 'fixture/consumer', 'fixture/provider']);
  assertions.equal('fixture warnings', inventory.warnings, []);
  const api = fileExports(assertions, catalog, 'subs/provider/src/interfaces/api.ts');
  assertions.equal('complete public and private fixture exports', api.exports.map(entry => entry.name).sort(),
    ['Merged', 'PrivateType', 'Runtime', 'Type', 'default', 'privateValue', 'value']);
  assertions.ok('all fixture exports preserve provider ownership', api.exports.every(entry => entry.original?.owner === 'fixture/provider'));
}

const referenceFixture: Extract<InstanceHandler, { kind: 'project' }>['fixture'] = { kind: 'copy', sourceRoot: referenceRoot };
// The runner's own tests may put their copies outside the example's ancestry.
// Reuse exactly the example dependencies there too; never copy or alter them.
const prepareReference: Extract<InstanceHandler, { kind: 'project' }>['prepare'] =
  ({ root }) => symlink(join(referenceRoot, 'node_modules'), join(root, 'node_modules'));
const referenceBaseline: Extract<InstanceHandler, { kind: 'project' }>['baseline'] = context =>
  catalogued(context, (catalog, inventory) => {
    context.assertions.equal('unchanged reference file count', inventory.files.length, 59);
    referenceResources(context.assertions, catalog, inventory);
  });

export const catalogHandlers: ReadonlyMap<string, InstanceHandler> = new Map<string, InstanceHandler>([
  ['I1-23:two-css-resources', {
    kind: 'project', fixture: referenceFixture, prepare: prepareReference, baseline: referenceBaseline,
    mutate: async () => {}, run: referenceBaseline,
  }],
  ['I1-23:resource-alias', {
    kind: 'project', fixture: referenceFixture, prepare: prepareReference, baseline: referenceBaseline,
    mutate: ({ root }) => put(root, aliasFile, "export { default as cardStyles } from './catalog-card.module.css';\n"),
    run: context => catalogued(context, (catalog, inventory) => {
      referenceResources(context.assertions, catalog, inventory);
      context.assertions.equal('one added forwarding file', inventory.files.length, 60);
      const alias = fileExports(context.assertions, catalog, aliasFile);
      context.assertions.equal('forwarding alias preserves resource default', alias.exports.map(entry => [entry.name, entry.original]),
        [['cardStyles', { kind: 'resource', owner: card.owner, file: card.bindingFile, binding: 'default' }]]);
      context.assertions.ok('alias file creates no new original', !catalog.originals.some(original => original.origin.file === aliasFile));
    }),
  }],
  ['I1-23:json-binding', {
    kind: 'project', fixture: { kind: 'create', create: createProjectFixture },
    baseline: context => catalogued(context, (catalog, inventory) => fixtureBaseline(context.assertions, catalog, inventory)),
    mutate: async ({ root }) => {
      await put(root, 'subs/provider/src/data.json', '{ "count": 1 }\n');
      await put(root, 'subs/provider/src/json.ts', "import data from './data.json'; void data.count;\n");
    },
    run: context => catalogued(context, (catalog, inventory) => {
      fixtureBaseline(context.assertions, catalog, inventory);
      context.assertions.equal('JSON inventoried as provider resource', inventory.files
        .filter(file => file.path === 'subs/provider/src/data.json').map(file => [file.owner, file.area, file.kind]),
      [['fixture/provider', 'ordinary', 'resource']]);
      const json = resource(context.assertions, catalog,
        { file: 'subs/provider/src/data.json', owner: 'fixture/provider', bindingFile: 'data.json' }, []);
      context.assertions.ok('effective JSON exports all belong to JSON resource', json.exports.exports.every(entry =>
        entry.original?.kind === 'resource' && entry.original.owner === 'fixture/provider' && entry.original.file === 'data.json'));
      context.assertions.ok('JSON description requires no declaration file', !json.exports.descriptionFiles.some(file => file.endsWith('.d.ts')));
      context.assertions.equal('JSON import file has no manufactured exports', fileExports(context.assertions, catalog, 'subs/provider/src/json.ts').exports, []);
    }),
  }],
]);
