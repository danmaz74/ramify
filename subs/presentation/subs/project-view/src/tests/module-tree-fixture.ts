import type {
  ExplorerEdge,
  ExplorerExport,
  ExplorerModule,
  ProjectExplorerModel,
} from '../interfaces/project-view.js';

/**
 * `tree-fixture`: a root, three levels, a module with 12 children, denied accesses,
 * coverage notes, a missing README and IDs containing `/`.
 */
export function createTreeFixture(): ProjectExplorerModel {
  const modules: ExplorerModule[] = [
    treeModule('app', null, ['app/core', 'app/ui'], { tags: ['dispatch'], ownedFiles: 3 }),
    treeModule('app/core', 'app', ['app/core/model', 'app/core/store'], { ownedFiles: 4,
      exports: [treeExport('app/core', 'Engine', ['parent']), treeExport('app/core', 'Helper', ['descendants']),
        treeExport('app/core', 'Internal', [])] }),
    treeModule('app/core/model', 'app/core', [], { ownedFiles: 2 }),
    treeModule('app/core/store', 'app/core', [], { ownedFiles: 1, missingReadme: true }),
    treeModule('app/ui', 'app', Array.from({ length: 12 }, (_, index) => `app/ui/widget${String(index).padStart(2, '0')}`),
      { tags: ['browser', 'ui'], ownedFiles: 5, denied: 2 }),
    ...Array.from({ length: 12 }, (_, index) => treeModule(`app/ui/widget${String(index).padStart(2, '0')}`, 'app/ui', [],
      { tags: ['browser', 'ui'], ownedFiles: 1 })),
  ];
  const edges: ExplorerEdge[] = [
    treeEdge('app/ui', 'app/core', 'denied', 3),
    treeEdge('app/core/store', 'app/core/model', 'allowed', 1),
  ];
  return {
    revision: 'revision-tree',
    rootModuleId: 'app',
    state: 'partial',
    registry: { id: 'registry', definitions: [], isDefault: true },
    modules,
    edges,
    coverage: [{
      limit: { id: 'limit-1', code: 'unresolved-original', message: 'An original could not be resolved.',
        location: { file: 'subs/core/src/engine.ts', start: 40, end: 52, line: 3, column: 1 }, related: [] },
      moduleIds: ['app/core'],
      edgeIds: [],
    }],
    summary: { owners: modules.length, ownedFiles: 28, edges: edges.length, accessOccurrences: 4,
      selectedSymbols: 2, deniedAccesses: 2, limitedAccesses: 0, coverageNotes: 1 },
  };
}

function treeModule(id: string, parent: string | null, children: string[], options: {
  readonly tags?: string[]; readonly ownedFiles: number; readonly denied?: number;
  readonly missingReadme?: boolean; readonly exports?: ExplorerExport[];
}): ExplorerModule {
  const name = id.split('/').pop()!;
  const tags = options.tags ?? [];
  const directory = id === 'app' ? '.' : `subs/${id.split('/').slice(1).join('/subs/')}`;
  return {
    id,
    name,
    directory,
    parent,
    children,
    tags,
    presentationClass: tags.length ? tags.join('+') : 'untagged',
    purpose: options.missingReadme
      ? { state: 'missing-file', readme: `${directory}/README.md` }
      : { state: 'present', readme: `${directory}/README.md`, paragraph: `The ${name} module.` },
    files: [
      { path: `${directory}/src/index.ts`, area: 'ordinary', kind: 'source' },
      ...(options.ownedFiles > 1 ? [{ path: `${directory}/src/tests/index.test.ts`, area: 'tests' as const, kind: 'source' as const }] : []),
      ...(options.ownedFiles > 2 ? [{ path: `${directory}/src/data.json`, area: 'ordinary' as const, kind: 'resource' as const }] : []),
    ],
    exports: options.exports ?? [],
    metrics: {
      ownedFiles: options.ownedFiles,
      subtreeFiles: options.ownedFiles,
      dependencies: 0,
      dependents: 0,
      accessOccurrences: 0,
      selectedSymbols: 0,
      deniedAccesses: options.denied ?? 0,
      limitedAccesses: 0,
      approximateIcs: 0,
    },
  };
}

function treeExport(owner: string, name: string, destinations: ('parent' | 'descendants')[]): ExplorerExport {
  return {
    id: `export:${owner}:${name}`,
    name,
    aliases: [name],
    original: null,
    file: `src/${name}.ts`,
    locations: [],
    capability: 'value',
    tags: [],
    forwarded: name === 'Helper',
    exposures: destinations.length ? [{ module: owner, names: [name], destinations, provider: null,
      effective: true, evidence: [] }] : [],
    signature: { state: 'unavailable', reason: 'missing-original' },
  };
}

function treeEdge(consumer: string, provider: string, status: ExplorerEdge['status'], accessCount: number): ExplorerEdge {
  return {
    id: `${consumer}->${provider}`,
    consumer,
    provider,
    consumerFiles: [],
    providerFiles: [],
    accessCount,
    symbolCount: accessCount,
    accesses: [],
    status,
    reasons: [],
    coverageIds: [],
  };
}
