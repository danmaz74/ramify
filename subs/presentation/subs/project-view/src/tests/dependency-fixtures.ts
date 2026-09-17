import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DependencyGraphEvidence,
  DependencyGraphImportedCount,
  DependencyGraphImportedEdge,
  DependencyGraphModel,
  DependencyGraphOriginalEdge,
} from '../interfaces/dependency-view.js';
import type { ExplorerFile, ExplorerModule, ProjectExplorerModel } from '../interfaces/project-view.js';

// Paths, not URL objects: the jsdom environment replaces the global URL class.
const testsDirectory = dirname(fileURLToPath(import.meta.url));

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/**
 * `reference`: the ready `dependencyView` and matching `projectView` results that iteration 5
 * recorded from a real daemon and explorer server on Collection Review.
 */
export function collectionReview(): { readonly project: ProjectExplorerModel; readonly dependencies: DependencyGraphModel } {
  const directory = join(testsDirectory, '../../../../../../scripts/probes/results/dependency-view');
  const dependency = readJson<{ status: string; revision: { revision: string }; view: DependencyGraphModel }>(
    join(directory, 'collection-review-dependency-view.json'));
  const project = readJson<{ status: string; revision: { revision: string }; view: ProjectExplorerModel }>(
    join(directory, 'collection-review-project-view.json'));
  if (dependency.status !== 'ready' || project.status !== 'ready'
    || dependency.revision.revision !== project.revision.revision) {
    throw new Error('The recorded Collection Review results are not one ready revision');
  }
  return { project: project.view, dependencies: dependency.view };
}

/**
 * Serialized outputs of the server's real dependency mapping (guarded by service-api's
 * dependency-model test): `forwarding` has projection divergence, a self-barrel, denied and
 * limited evidence and partial coverage; `bothBoundaries` uses one original through two
 * imported modules; `zero` is a measured zero.
 */
export function mappedDependencyModels(): {
  readonly forwarding: DependencyGraphModel;
  readonly bothBoundaries: DependencyGraphModel;
  readonly zero: DependencyGraphModel;
} {
  return readJson(join(testsDirectory, 'fixtures/dependency-models.json'));
}

/** The project structure matching the mapped models: `app` with `a`, `b` (child `b/core`), `c` and `idle`. */
export function forwardingProject(revision = 'rev/1:00000000-0000-4000-8000-000000000000:3'): ProjectExplorerModel {
  const modules: ExplorerModule[] = [
    projectModule('app', null, ['app/a', 'app/b', 'app/c', 'app/idle'], [], 1),
    projectModule('app/a', 'app', [], ['ui'], 2),
    projectModule('app/b', 'app', ['app/b/core'], [], 4),
    projectModule('app/b/core', 'app/b', [], [], 9),
    projectModule('app/c', 'app', [], ['ui'], 3),
    projectModule('app/idle', 'app', [], [], 1),
  ];
  return {
    revision,
    rootModuleId: 'app',
    state: 'complete',
    registry: { id: 'registry', definitions: [], isDefault: true },
    modules,
    // One occurrence edge that has no behavioral dependency; it must never be drawn.
    edges: [{
      id: '4:occurrence:idle->c', consumer: 'app/idle', provider: 'app/c', consumerFiles: ['subs/idle/src/use.ts'],
      providerFiles: ['subs/c/src/index.ts'], accessCount: 3, symbolCount: 1, accesses: [], status: 'allowed',
      reasons: ['exposed'], coverageIds: [],
    }],
    coverage: [],
    summary: { owners: modules.length, ownedFiles: 20, edges: 1, accessOccurrences: 3, selectedSymbols: 1,
      deniedAccesses: 0, limitedAccesses: 0, coverageNotes: 0 },
  };
}

function projectModule(id: string, parent: string | null, children: string[], tags: string[],
  sourceFiles: number): ExplorerModule {
  const directory = id === 'app' ? '.' : `subs/${id.split('/').slice(1).join('/subs/')}`;
  const files: ExplorerFile[] = [
    ...Array.from({ length: sourceFiles }, (_, index) => ({ path: `${directory}/src/f${index}.ts`,
      area: 'ordinary' as const, kind: 'source' as const })),
    { path: `${directory}/src/data.json`, area: 'ordinary', kind: 'resource' },
  ];
  return {
    id, name: id.split('/').pop()!, directory, parent, children, tags,
    presentationClass: tags.length > 0 ? tags.join('+') : 'untagged',
    purpose: { state: 'present', readme: `${directory}/README.md`, paragraph: `${id} purpose.` },
    files, exports: [],
    metrics: { ownedFiles: files.length, subtreeFiles: files.length, dependencies: 0, dependents: 0,
      accessOccurrences: id === 'app/idle' ? 3 : 0, selectedSymbols: 0, deniedAccesses: 0, limitedAccesses: 0,
      approximateIcs: id === 'app/idle' ? 1 : 0 },
  };
}

// Independent unit calculations from evidence rows, never from the model's count fields.

type Classification = DependencyGraphEvidence['classification'];
export interface UnitCount { behavioral: number; nonBehavioral: number }

const originalIdentity = (item: DependencyGraphEvidence) => JSON.stringify(item.original);

function tally(classes: Iterable<Classification>): UnitCount {
  const count = { behavioral: 0, nonBehavioral: 0 };
  for (const item of classes) {
    if (item === 'behavioral') count.behavioral += 1;
    else count.nonBehavioral += 1;
  }
  return count;
}

/** Imported-module units: each evidence row is one `(consumer, imported module, original)` fact. */
export function expectedImportedEdges(model: DependencyGraphModel): Map<string, UnitCount & { consumer: string; provider: string }> {
  return new Map(model.importedModuleEdges.map((edge) => [edge.id, {
    consumer: edge.consumer,
    provider: edge.provider,
    ...tally(edge.evidence.map((item) => item.classification)),
  }]));
}

/** `(consumer, original)` units settled behavioral when any supporting row is behavioral. */
function settledUnits(model: DependencyGraphModel): { consumer: string; owner: string; classification: Classification }[] {
  const units = new Map<string, { consumer: string; owner: string; classes: Set<Classification> }>();
  for (const edge of model.originalOwnerEdges) {
    for (const item of edge.evidence) {
      const key = JSON.stringify([edge.consumer, originalIdentity(item)]);
      const unit = units.get(key) ?? { consumer: edge.consumer, owner: item.originalOwner, classes: new Set() };
      unit.classes.add(item.classification);
      units.set(key, unit);
    }
  }
  return [...units.values()].map((unit) => ({ consumer: unit.consumer, owner: unit.owner,
    classification: unit.classes.has('behavioral') ? 'behavioral' : 'non-behavioral' }));
}

export function expectedOwnerEdges(model: DependencyGraphModel): Map<string, UnitCount & { consumer: string; provider: string }> {
  const units = settledUnits(model);
  return new Map(model.originalOwnerEdges.map((edge) => [edge.id, {
    consumer: edge.consumer,
    provider: edge.provider,
    ...tally(units.filter((unit) => unit.consumer === edge.consumer && unit.owner === edge.provider)
      .map((unit) => unit.classification)),
  }]));
}

export function expectedProject(model: DependencyGraphModel): UnitCount {
  return tally(settledUnits(model).map((unit) => unit.classification));
}

export function expectedModule(model: DependencyGraphModel, id: string): {
  uses: UnitCount; usedThrough: UnitCount; ownedUsedByOthers: UnitCount;
} {
  const units = settledUnits(model);
  return {
    uses: tally(units.filter((unit) => unit.consumer === id).map((unit) => unit.classification)),
    usedThrough: tally(model.importedModuleEdges.filter((edge) => edge.provider === id)
      .flatMap((edge) => edge.evidence.map((item) => item.classification))),
    ownedUsedByOthers: tally(units.filter((unit) => unit.owner === id).map((unit) => unit.classification)),
  };
}

// `nested-levels`: a presentation-owned structure and hand-written model of the served C5 shape.
// It is valid for pure and component rows only; it never stands in for a served model.

/** `app` with `a` (children `left` and `right`), `b` (child `core`), `c` and `idle`. */
export function nestedLevelsProject(revision = 'rev/1:00000000-0000-4000-8000-000000000000:8'): ProjectExplorerModel {
  const modules: ExplorerModule[] = [
    projectModule('app', null, ['app/a', 'app/b', 'app/c', 'app/idle'], [], 1),
    projectModule('app/a', 'app', ['app/a/left', 'app/a/right'], ['ui'], 2),
    projectModule('app/a/left', 'app/a', [], ['ui'], 3),
    projectModule('app/a/right', 'app/a', [], [], 4),
    projectModule('app/b', 'app', ['app/b/core'], [], 5),
    projectModule('app/b/core', 'app/b', [], [], 6),
    projectModule('app/c', 'app', [], ['ui'], 7),
    projectModule('app/idle', 'app', [], [], 8),
  ];
  return {
    revision,
    rootModuleId: 'app',
    state: 'complete',
    registry: { id: 'registry', definitions: [], isDefault: true },
    modules,
    edges: [],
    coverage: [{
      limit: { id: 'limit-nested-1', code: 'unresolved-original', message: 'One nested original is unresolved.',
        location: { file: 'subs/a/subs/left/src/f0.ts', start: 0, end: 1, line: 2, column: 1 }, related: [] },
      moduleIds: ['app/a/left'],
      edgeIds: [],
    }],
    summary: { owners: modules.length, ownedFiles: 44, edges: 0, accessOccurrences: 0, selectedSymbols: 0,
      deniedAccesses: 1, limitedAccesses: 1, coverageNotes: 1 },
  };
}

/** One authored evidence row of `nested-levels`: original owner, importer and classification. */
type NestedRow = readonly [binding: string, classification: Classification,
  status: DependencyGraphEvidence['status'], importedModule: string];

const nestedEdges: readonly { readonly consumer: string; readonly provider: string;
  readonly rows: readonly NestedRow[] }[] = [
  { consumer: 'app/a/left', provider: 'app/b/core',
    rows: [['alpha', 'behavioral', 'allowed', 'app/b'], ['beta', 'non-behavioral', 'limited', 'app/b/core']] },
  { consumer: 'app/a/right', provider: 'app/b', rows: [['gamma', 'behavioral', 'allowed', 'app/b']] },
  { consumer: 'app/a/left', provider: 'app/b', rows: [['delta', 'non-behavioral', 'denied', 'app/b']] },
  { consumer: 'app/a', provider: 'app/a/left', rows: [['eps', 'behavioral', 'allowed', 'app/a/left']] },
  { consumer: 'app/c', provider: 'app', rows: [['zeta', 'non-behavioral', 'allowed', 'app']] },
  { consumer: 'app/a/left', provider: 'app/c', rows: [['eta', 'behavioral', 'allowed', 'app/c']] },
  { consumer: 'app', provider: 'app/a/right', rows: [['theta', 'behavioral', 'allowed', 'app/a/right']] },
  { consumer: 'app/a/left', provider: 'app/a/right', rows: [['iota', 'behavioral', 'allowed', 'app/a/right']] },
];

/**
 * Its dependency model. Every clause of the C8 mapping has a case: the scope module's own source
 * (`app/a -> app/a/left` and `app -> app/a/right`), a grandchild of another module
 * (`app/a/left -> app/b/core`), a module shallower than the scope (`app/a/left -> app/c`) and a
 * link with no displayed end inside `app/a` (`app/c -> app`).
 */
export function nestedLevelsDependencies(): DependencyGraphModel {
  const originalOwnerEdges: DependencyGraphOriginalEdge[] = nestedEdges.map((edge) => {
    const evidence = edge.rows.map((row) => nestedRow(edge.consumer, edge.provider, row));
    return {
      id: `dependency-edge/1:original-owner:nested:${edge.consumer}->${edge.provider}`,
      projection: 'original-owner',
      consumer: edge.consumer,
      provider: edge.provider,
      counts: tally(evidence.map((item) => item.classification)),
      importedThrough: groupCounts(evidence, (item) => item.importedModule)
        .map(([module, counts]) => ({ module, counts })),
      evidence,
    };
  });
  // The imported-boundary collection of the same rows; a self-barrel row has no imported edge.
  const boundaries = new Map<string, { consumer: string; provider: string; evidence: DependencyGraphEvidence[] }>();
  for (const edge of nestedEdges) {
    for (const row of edge.rows) {
      const item = nestedRow(edge.consumer, edge.provider, row);
      if (item.importedModule === edge.consumer) continue;
      const key = `${edge.consumer}|${item.importedModule}`;
      const found = boundaries.get(key)
        ?? { consumer: edge.consumer, provider: item.importedModule, evidence: [] };
      found.evidence.push(item);
      boundaries.set(key, found);
    }
  }
  const importedModuleEdges: DependencyGraphImportedEdge[] = [...boundaries.values()].map((edge) => ({
    id: `dependency-edge/1:imported-module:nested:${edge.consumer}->${edge.provider}`,
    projection: 'imported-module',
    consumer: edge.consumer,
    provider: edge.provider,
    counts: importedTally(edge.evidence),
    originalOwners: groupCounts(edge.evidence, (item) => item.originalOwner)
      .map(([owner, counts]) => ({ owner, counts })),
    evidence: edge.evidence,
  }));
  const base: DependencyGraphModel = {
    schemaVersion: 'ramify.explorer-dependencies/1',
    inputId: 'input/1:nested-levels',
    state: 'complete',
    project: { behavioral: 0, nonBehavioral: 0 },
    modules: [],
    importedModuleEdges,
    originalOwnerEdges,
    coverage: { unknownDependencies: 0, limitIds: [] },
  };
  // The rows and the project total are the model's own units, counted from its evidence.
  return {
    ...base,
    project: expectedProject(base),
    modules: nestedLevelsProject().modules.map((module) => {
      const row = expectedModule(base, module.id);
      return {
        id: module.id,
        uses: row.uses,
        ownedUsedByOthers: row.ownedUsedByOthers,
        usedThrough: { behavioralUsedOriginals: row.usedThrough.behavioral,
          nonBehavioralUsedOriginals: row.usedThrough.nonBehavioral },
      };
    }),
  };
}

function nestedRow(consumer: string, owner: string, row: NestedRow): DependencyGraphEvidence {
  const [binding, classification, status, importedModule] = row;
  const file = (id: string) => `${id === 'app' ? '.' : `subs/${id.split('/').slice(1).join('/subs/')}`}/src/f0.ts`;
  return {
    original: { kind: 'code', owner, file: file(owner), binding },
    originalOwner: owner,
    importedModule,
    classification,
    consumerFiles: [file(consumer)],
    importedFiles: [file(importedModule)],
    originalFiles: [file(owner)],
    accessIds: [`access:${consumer}:${binding}`],
    status,
    reasons: status === 'denied' ? ['not-visible'] : ['exposed'],
    coverageIds: status === 'limited' ? ['limit-nested-1'] : [],
  };
}

function importedTally(evidence: readonly DependencyGraphEvidence[]): DependencyGraphImportedCount {
  const counts = tally(evidence.map((item) => item.classification));
  return { behavioralUsedOriginals: counts.behavioral, nonBehavioralUsedOriginals: counts.nonBehavioral };
}

function groupCounts(evidence: readonly DependencyGraphEvidence[],
  select: (item: DependencyGraphEvidence) => string): [string, DependencyGraphImportedCount][] {
  const keys = [...new Set(evidence.map(select))];
  return keys.map((key) => [key, importedTally(evidence.filter((item) => select(item) === key))]);
}

// An independent scope mapping: it reads the project structure and the evidence rows only.

export interface ExpectedScope {
  readonly frameModule: string | null;
  readonly nodes: readonly string[];
  readonly depth: number;
  readonly ownSourceNode: string | null;
}

/** The own-source node's ID, calculated independently of the view. */
export const expectedOwnSourceNodeId = (module: string): string => `own-source/1:${module}`;

export interface ExpectedScopeLink {
  /** The link's ID at this scope, spelled independently of the view. */
  readonly id: string;
  readonly consumer: string;
  readonly provider: string;
  readonly behavioral: number;
  readonly nonBehavioral: number;
  readonly status: DependencyGraphEvidence['status'];
  readonly leavesScope: boolean;
  readonly sources: readonly string[];
}

export function expectedScope(project: ProjectExplorerModel, scopeModuleId: string | null,
  showOwnSourceNode = false): ExpectedScope {
  const byId = new Map(project.modules.map((module) => [module.id, module]));
  if (scopeModuleId !== null) {
    return { frameModule: scopeModuleId, depth: expectedDepth(project, scopeModuleId) + 1,
      nodes: project.modules.filter((module) => module.parent === scopeModuleId).map((module) => module.id),
      ownSourceNode: showOwnSourceNode ? scopeModuleId : null };
  }
  const topLevel = project.modules.filter((module) => module.parent === null);
  const root = byId.get(project.rootModuleId);
  if (topLevel.length === 1 && root && root.children.length > 0) {
    return { frameModule: root.id, nodes: [...root.children], depth: expectedDepth(project, root.id) + 1,
      ownSourceNode: null };
  }
  return { frameModule: null, nodes: topLevel.map((module) => module.id), depth: 0, ownSourceNode: null };
}

/** Ancestors of a module, root first. */
export function expectedAncestors(project: ProjectExplorerModel, id: string): string[] {
  const byId = new Map(project.modules.map((module) => [module.id, module]));
  const result: string[] = [];
  let parent = byId.get(id)?.parent ?? null;
  while (parent !== null) {
    result.unshift(parent);
    parent = byId.get(parent)?.parent ?? null;
  }
  return result;
}

export function expectedDepth(project: ProjectExplorerModel, id: string): number {
  return expectedAncestors(project, id).length;
}

export type ExpectedEnd = { readonly kind: 'frame' }
  | { readonly kind: 'own-source'; readonly module: string }
  | { readonly kind: 'node'; readonly module: string; readonly inScope: boolean };

/** Where one exact module lands, calculated from the project structure alone. */
export function expectedEnd(project: ProjectExplorerModel, scope: ExpectedScope, module: string,
  depthMode: 'level' | 'exact' = 'level'): ExpectedEnd {
  const under = (id: string, ancestor: string): boolean => id === ancestor
    || expectedAncestors(project, id).includes(ancestor);
  if (depthMode === 'exact') {
    return { kind: 'node', module, inScope: scope.frameModule === null || under(module, scope.frameModule) };
  }
  for (const node of scope.nodes) if (under(module, node)) return { kind: 'node', module: node, inScope: true };
  if (scope.frameModule !== null && module === scope.frameModule) {
    return scope.ownSourceNode !== null ? { kind: 'own-source', module } : { kind: 'frame' };
  }
  const outside = scope.depth - 1;
  if (expectedDepth(project, module) <= outside) return { kind: 'node', module, inScope: false };
  const chain = [...expectedAncestors(project, module), module];
  return { kind: 'node', module: chain[outside] ?? chain[0]!, inScope: false };
}

export function expectedCoversProject(project: ProjectExplorerModel, scope: ExpectedScope): boolean {
  const under = (id: string, ancestor: string): boolean => id === ancestor
    || expectedAncestors(project, id).includes(ancestor);
  return project.modules.every((module) =>
    (scope.frameModule !== null && under(module.id, scope.frameModule))
    || scope.nodes.some((node) => under(module.id, node)));
}

/**
 * The links one scope draws, calculated independently: the ends map from the project structure,
 * and each group's counts are its distinct `(exact consumer module, original)` pairs, settled
 * behavioral when any of its evidence rows is behavioral.
 */
export function expectedScopeLinks(input: {
  readonly project: ProjectExplorerModel;
  readonly dependencies: DependencyGraphModel;
  readonly scopeModuleId?: string | null;
  readonly depthMode?: 'level' | 'exact';
  /** Defaults to every candidate node of the scope. */
  readonly displayed?: readonly string[];
  readonly showNonBehavioral?: boolean;
  readonly showOutsideScope?: boolean;
  readonly showOwnSourceNode?: boolean;
}): ExpectedScopeLink[] {
  const { project, dependencies } = input;
  const depthMode = input.depthMode ?? 'level';
  const showNonBehavioral = input.showNonBehavioral ?? false;
  const scope = expectedScope(project, input.scopeModuleId ?? null,
    depthMode === 'level' && (input.showOwnSourceNode ?? false));
  const displayed = new Set(input.displayed ?? scope.nodes);
  const covers = expectedCoversProject(project, scope);
  const groups = new Map<string, { consumer: string; provider: string; leavesScope: boolean;
    sources: DependencyGraphOriginalEdge[] }>();
  // An own-source end takes the own-source node's ID, is drawn and is always in scope.
  const nodeIdOf = (end: Exclude<ExpectedEnd, { kind: 'frame' }>) =>
    end.kind === 'own-source' ? expectedOwnSourceNodeId(end.module) : end.module;
  for (const edge of dependencies.originalOwnerEdges) {
    const consumer = expectedEnd(project, scope, edge.consumer, depthMode);
    const provider = expectedEnd(project, scope, edge.provider, depthMode);
    if (consumer.kind === 'frame' || provider.kind === 'frame') continue;
    const consumerNode = nodeIdOf(consumer);
    const providerNode = nodeIdOf(provider);
    if (consumerNode === providerNode) continue;
    if (consumer.kind !== 'own-source' && provider.kind !== 'own-source'
      && !displayed.has(consumerNode) && !displayed.has(providerNode)) continue;
    const key = `${consumerNode}|${providerNode}`;
    const group = groups.get(key)
      ?? { consumer: consumerNode, provider: providerNode, leavesScope: false, sources: [] };
    group.leavesScope = group.leavesScope || (!covers
      && ((consumer.kind === 'node' && !consumer.inScope) || (provider.kind === 'node' && !provider.inScope)));
    group.sources.push(edge);
    groups.set(key, group);
  }
  const byPair = (left: { consumer: string; provider: string }, right: { consumer: string; provider: string }) =>
    left.consumer < right.consumer ? -1 : left.consumer > right.consumer ? 1
      : left.provider < right.provider ? -1 : left.provider > right.provider ? 1 : 0;
  const result: ExpectedScopeLink[] = [];
  for (const group of groups.values()) {
    if (group.leavesScope && input.showOutsideScope === false) continue;
    const pairs = new Map<string, boolean>();
    for (const edge of group.sources) {
      for (const item of edge.evidence) {
        const key = JSON.stringify([edge.consumer, originalIdentity(item)]);
        pairs.set(key, (pairs.get(key) ?? false) || item.classification === 'behavioral');
      }
    }
    const counts = tally([...pairs.values()]
      .map((settled): Classification => settled ? 'behavioral' : 'non-behavioral'));
    if (counts.behavioral + (showNonBehavioral ? counts.nonBehavioral : 0) === 0) continue;
    const sources = [...group.sources].sort(byPair);
    const rows = sources.flatMap((edge) => edge.evidence.map((item) => item.status));
    result.push({
      id: depthMode === 'exact' ? sources[0]!.id
        : `scoped-link/1:level:${scope.frameModule ?? '-'}:${JSON.stringify([group.consumer, group.provider])}`,
      consumer: group.consumer, provider: group.provider, ...counts,
      status: rows.includes('denied') ? 'denied' : rows.includes('limited') ? 'limited' : 'allowed',
      leavesScope: group.leavesScope,
      sources: sources.map((edge) => edge.id) });
  }
  return result.sort(byPair);
}
