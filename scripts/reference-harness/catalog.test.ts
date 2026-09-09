import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CatalogExport, CatalogOriginal, FileExports, ProjectInventory, SourceCatalog } from '../../subs/analysis/src/validation-entry.js';
import { parseDescription } from '../../subs/analysis/subs/descriptions/src/parse.js';
import { createDefaultTagRegistry, deriveSourceAreas } from '../../subs/analysis/subs/model/src/index.js';
import type { OriginalId } from '../../subs/analysis/subs/model/src/index.js';
import { readProject } from '../../subs/analysis/subs/project/src/read-project.js';
import { createSourceAnalysis } from '../../subs/analysis/subs/typescript/src/source-analysis.js';
import type { SourceAnalysis } from '../../subs/analysis/subs/typescript/src/interfaces/source.js';

function file(catalog: SourceCatalog, path: string): FileExports {
  const found = catalog.files.find(entry => entry.file === path);
  if (!found) throw new Error(`Catalog has no file ${path}`);
  return found;
}

function exported(catalog: SourceCatalog, path: string, name: string): CatalogExport {
  const found = file(catalog, path).exports.find(entry => entry.name === name);
  if (!found) throw new Error(`Catalog has no export ${name} in ${path}`);
  return found;
}

function original(catalog: SourceCatalog, id: OriginalId): CatalogOriginal {
  const found = catalog.originals.find(entry => entry.id.kind === id.kind && entry.id.owner === id.owner
    && entry.id.file === id.file && entry.id.binding === id.binding);
  if (!found) throw new Error(`Catalog has no original ${JSON.stringify(id)}`);
  return found;
}

function code(file: string, binding: string, owner: string): OriginalId {
  return { kind: 'code', owner, file, binding };
}

function resource(file: string, binding: string, owner: string): OriginalId {
  return { kind: 'resource', owner, file, binding };
}

// Independent expected declarations from the reference contract map, including
// its deliberately unexposed exports. These are not derived from the compiler,
// the module descriptions, or the adapter being tested.
const expectedFiles = [
  ['', 'interfaces/protocol.ts', [], ['InvocationContext', 'ProtocolFacilities', 'McpToolContribution', 'ToolInvocation', 'ToolInputSchema', 'ToolResult']],
  ['', 'assembly.ts', ['assembleSystem'], ['AppRouter', 'AssembledSystem']],
  ['', 'protocol.ts', ['createFacilities', 'createMcpServer'], []],
  ['', 'server.ts', ['startApiServer'], ['ApiServer', 'ApiServerOptions']],
  ['', 'tests/setup.ts', ['createTestSystem'], ['McpSession', 'TestSystem']],
  ['workspace/contracts', 'interfaces/vocabulary.ts', [
    'recordIdSchema', 'revisionSchema', 'revisionChainSchema', 'revisionScopeSchema',
    'findingSchema', 'inspectionReportSchema', 'reviewStatusSchema', 'observationSchema',
  ], ['RecordId', 'Revision', 'RevisionChain', 'RevisionScope', 'Finding', 'InspectionReport', 'ReviewStatus', 'Observation', 'ObservationCallback']],
  ['workspace/catalog/core', 'catalog.ts', ['getRecord', 'inspect'], ['CatalogSummary']],
  ['workspace/catalog/core', 'records.ts', ['listRecords', 'findRecord'], ['CatalogRecord']],
  ['workspace/catalog/core', 'history.ts', ['resolvePredecessors'], ['PredecessorResolution']],
  ['workspace/catalog/core', 'tests/fixture.ts', ['makeCatalogFixture'], ['CatalogFixtureRecord']],
  ['workspace/catalog', 'router.ts', ['createCatalogRouter'], []],
  ['workspace/catalog', 'mcp.ts', ['createCatalogTools'], []],
  ['workspace/catalog/ui', 'catalog-card.tsx', ['CatalogCard'], []],
  ['workspace/reviews/validation', 'validate.ts', ['validateRevisionChain'], []],
  ['workspace/reviews/core/tasks', 'inspection-task.ts', ['runInspectionTask', 'collectObservations'], ['InspectionTaskInput', 'InspectionTaskResult']],
  ['workspace/reviews/core/tasks', 'result.ts', ['summarizeTaskResult'], ['TaskSummary']],
  ['workspace/reviews/core/controller', 'controller.ts', ['tick'], []],
  ['workspace/reviews/core', 'interfaces/port.ts', [], ['InspectionPort']],
  ['workspace/reviews/core', 'runtime.ts', ['createReviewRuntime'], ['ReviewOutcome', 'ReviewRuntime']],
  ['workspace/reviews', 'router.ts', ['createReviewsRouter'], []],
  ['workspace/reviews', 'mcp.ts', ['createReviewsTools'], []],
  ['workspace/reviews', 'session.ts', ['createSessionTable'], ['SessionBinding', 'SessionBindingRequest', 'SessionTable']],
  ['workspace/reviews/ui', 'review-panel.tsx', ['ReviewPanel', 'loadReview'], []],
  ['workspace/reviews/ui/pure-ui', 'review-result.tsx', ['ReviewResult'], ['ReviewResultProps']],
  ['workspace/reviews/ui/pure-ui', 'format.ts', ['formatFinding'], []],
  ['workspace/shared-ui', 'status-badge.tsx', ['StatusBadge'], ['StatusBadgeProps']],
  ['workspace', 'client.ts', ['createClient'], []],
  ['workspace', 'app.tsx', ['App', 'Shell', 'loadShell'], []],
] as const;

function sourcePath(owner: string, source: string): string {
  const directory = owner ? owner.split('/').map(name => `subs/${name}`).join('/') + '/' : '';
  return `${directory}src/${source}`;
}
function ownerId(owner: string): string { return owner ? `collection-review/${owner}` : 'collection-review'; }

describe('unchanged Collection Review catalog', () => {
  let inventory: ProjectInventory;
  let catalog: SourceCatalog;
  beforeAll(async () => {
    const root = fileURLToPath(new URL('../../examples/collection-review/', import.meta.url));
    const acquired = await readProject({
      request: { cwd: root, root, scope: 'whole-project', configuration: 'discover' }, parse: parseDescription,
      limits: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
        maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2,
        maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
    });
    if (acquired.status !== 'acquired') throw new Error(JSON.stringify(acquired));
    inventory = acquired.view.inventory;
    let source: SourceAnalysis | undefined;
    try {
      const registry = createDefaultTagRegistry();
      const areas = inventory.modules.flatMap(module => {
        const ordinary = module.areas.find(area => area.kind === 'ordinary');
        if (!ordinary) throw new Error(`No ordinary area for ${module.id}`);
        const result = deriveSourceAreas(registry, module.id, ordinary.root, module.headerTags);
        if (result.status !== 'valid') throw new Error(JSON.stringify(result.issues));
        return result.value;
      });
      source = await createSourceAnalysis({ view: acquired.view, inventory, areas, limits: {
        maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000,
        maxForwardingDepth: 256, deadlineMs: 90_000,
      } });
      catalog = await source.catalog();
    } finally {
      try { await source?.dispose(); }
      finally { await acquired.view.dispose(); }
    }
  }, 90_000);

  it.each(expectedFiles)('retains contract-map originals for %s src/%s', (owner, source, values, types) => {
    const path = sourcePath(owner, source);
    expect(file(catalog, path).state).toBe('complete');
    for (const [bindings, hasValue, hasType] of [[values, true, false], [types, false, true]] as const) {
      for (const binding of bindings) {
        const identity = code(source, binding, ownerId(owner));
        expect(exported(catalog, path, binding).original).toEqual(identity);
        const fact = original(catalog, identity);
        expect(fact).toMatchObject({ hasValue, hasType, origin: {
          file: path, area: { owner: ownerId(owner), kind: source.startsWith('tests/') ? 'tests' : 'ordinary' },
        } });
        expect(fact.declarations).toContainEqual(expect.objectContaining({ file: path, line: expect.any(Number), column: expect.any(Number) }));
      }
    }
  });

  it('preserves the root AppRouter original behind its internal protocol forwarding alias', () => {
    const identity = code('assembly.ts', 'AppRouter', 'collection-review');
    expect(exported(catalog, 'src/interfaces/protocol.ts', 'AppRouter').original).toEqual(identity);
    expect(exported(catalog, 'src/assembly.ts', 'AppRouter').original).toEqual(identity);
    expect(catalog.originals.filter(entry => entry.id.owner === 'collection-review' && entry.id.binding === 'AppRouter')).toHaveLength(1);
    expect(original(catalog, identity)).toMatchObject({ hasValue: false, hasType: true,
      origin: { file: 'src/assembly.ts', area: { owner: 'collection-review', profile: ['dispatch'] } } });
  });

  it('keeps both CSS module originals with the same effective Vite declaration', () => {
    const cardFile = sourcePath('workspace/catalog/ui', 'catalog-card.module.css');
    const resultFile = sourcePath('workspace/reviews/ui/pure-ui', 'review-result.module.css');
    expect(exported(catalog, cardFile, 'default').original)
      .toEqual(resource('catalog-card.module.css', 'default', ownerId('workspace/catalog/ui')));
    expect(exported(catalog, resultFile, 'default').original)
      .toEqual(resource('review-result.module.css', 'default', ownerId('workspace/reviews/ui/pure-ui')));
    expect(file(catalog, cardFile).descriptionFiles).toEqual(file(catalog, resultFile).descriptionFiles);
    expect(file(catalog, cardFile).descriptionFiles.some(path => path.endsWith('vite/client.d.ts'))).toBe(true);
  });

  it('covers every owned file and keeps the standalone testing owner ordinary area', () => {
    expect(inventory.modules).toHaveLength(15);
    expect(catalog.files.map(entry => entry.file).sort()).toEqual(inventory.files.map(entry => entry.path).sort());
    const testingOwner = 'collection-review/integration-tests';
    const world = catalog.originals.find(entry => entry.id.owner === testingOwner && entry.id.binding === 'CollectionReviewWorld');
    expect(world).toMatchObject({ origin: { area: { owner: testingOwner, kind: 'ordinary', profile: ['dispatch', 'testing'] } } });
  });
});
