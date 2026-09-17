import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DependencyGraphEvidence,
  DependencyGraphModel,
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
