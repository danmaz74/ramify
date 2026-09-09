import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDescription } from '../../subs/analysis/subs/descriptions/src/parse.js';
import { readProject } from '../../subs/analysis/subs/project/src/read-project.js';
import type { SourceCatalog } from '../../subs/analysis/subs/typescript/src/interfaces/source.js';
import { analyzeView, code, exported, file, original, resource } from '../../subs/analysis/subs/typescript/src/tests/fixtures.js';

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
  let result: Awaited<ReturnType<typeof analyzeView>>;
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
    result = await analyzeView(acquired.view);
    catalog = result.catalog;
  }, 90_000);
  afterAll(async () => { await result?.dispose(); });

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
    expect(result.view.inventory.modules).toHaveLength(15);
    expect(catalog.files.map(entry => entry.file).sort()).toEqual(result.view.inventory.files.map(entry => entry.path).sort());
    const testingOwner = 'collection-review/integration-tests';
    const world = catalog.originals.find(entry => entry.id.owner === testingOwner && entry.id.binding === 'CollectionReviewWorld');
    expect(world).toMatchObject({ origin: { area: { owner: testingOwner, kind: 'ordinary', profile: ['dispatch', 'testing'] } } });
  });
});
