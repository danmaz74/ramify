import { createHash } from 'node:crypto';
import type { DependencyBoundaryFact } from '../../analysis/src/interfaces/dependency-diagram.js';
import type { ModuleId } from '../../analysis/subs/model/src/interfaces/model.js';
import type {
  ExplorerDependencyCount,
  ExplorerDependencyEvidence,
  ExplorerDependencyModel,
  ExplorerDependencyModelInput,
  ExplorerDependencyModelOutcome,
  ExplorerDependencyModule,
  ExplorerImportedCount,
  ExplorerImportedDependencyEdge,
  ExplorerOriginalDependencyEdge,
} from './interfaces/explorer-dependencies.js';

/** The encoded size limit of one browser dependency model. */
export const maximumDependencyViewBytes = 16 * 1024 * 1024;

type KnownFact = DependencyBoundaryFact & { readonly classification: 'behavioral' | 'non-behavioral' };

const utf8Order = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));
const identityOf = (fact: DependencyBoundaryFact): string =>
  JSON.stringify([fact.original.kind, fact.original.owner, fact.original.file, fact.original.binding]);
const known = (fact: DependencyBoundaryFact): fact is KnownFact => fact.classification !== 'unknown';

/** `dependency-edge/1:<projection>:<sha256(JSON([consumer, provider]))>` with the full hex digest. */
export function dependencyEdgeId(projection: 'imported-module' | 'original-owner', consumer: ModuleId, provider: ModuleId): string {
  return `dependency-edge/1:${projection}:${createHash('sha256').update(JSON.stringify([consumer, provider])).digest('hex')}`;
}

interface Dependency {
  readonly consumer: ModuleId;
  readonly originalOwner: ModuleId;
  readonly facts: DependencyBoundaryFact[];
}

class Counter {
  behavioral = 0;
  nonBehavioral = 0;
  add(classification: 'behavioral' | 'non-behavioral'): void {
    if (classification === 'behavioral') this.behavioral++; else this.nonBehavioral++;
  }
  dependency(): ExplorerDependencyCount { return { behavioral: this.behavioral, nonBehavioral: this.nonBehavioral }; }
  imported(): ExplorerImportedCount {
    return { behavioralUsedOriginals: this.behavioral, nonBehavioralUsedOriginals: this.nonBehavioral };
  }
}

function counterIn(map: Map<string, Counter>, key: string): Counter {
  let counter = map.get(key);
  if (!counter) map.set(key, counter = new Counter());
  return counter;
}

function evidenceOf(fact: KnownFact): ExplorerDependencyEvidence {
  return {
    original: { ...fact.original },
    originalOwner: fact.originalOwner,
    importedModule: fact.importedModule,
    classification: fact.classification,
    consumerFiles: [...fact.consumerFiles],
    importedFiles: [...fact.importedFiles],
    originalFiles: [...fact.originalFiles],
    accessIds: [...fact.accessIds],
    status: fact.status,
    reasons: [...fact.reasons],
    coverageIds: [...fact.limitIds],
  };
}

const evidenceOrder = (left: KnownFact, right: KnownFact): number =>
  utf8Order(identityOf(left), identityOf(right)) || utf8Order(left.importedModule, right.importedModule);
const edgeKey = (consumer: ModuleId, provider: ModuleId): string => JSON.stringify([consumer, provider]);
const edgeOrder = (left: { consumer: string; provider: string }, right: { consumer: string; provider: string }): number =>
  utf8Order(left.consumer, right.consumer) || utf8Order(left.provider, right.provider);

function refused(reason: 'identity-mismatch' | 'inconsistent-counts' | 'resource-limit', message: string): ExplorerDependencyModelOutcome {
  return { status: 'refused', reason, message };
}

/**
 * Contract C5: map one ready daemon diagram to the browser model. Pure and
 * without analysis runtime code: every status, reason, file and limit ID is
 * copied from the diagram's boundary facts; only counts and groupings are formed.
 */
export function createExplorerDependencyModel(input: ExplorerDependencyModelInput): ExplorerDependencyModelOutcome {
  const { revision, diagram, maxBytes } = input;
  if (revision.fingerprints.inputId !== diagram.inputId) {
    return refused('identity-mismatch',
      `Dependency diagram input ${diagram.inputId} does not match revision input ${revision.fingerprints.inputId}`);
  }
  const moduleIds = [...new Set(diagram.modules)].sort(utf8Order);
  const modules = new Set(moduleIds);

  // Headline and original-owner units: one per (consumer, original), settled by precedence.
  const dependencies = new Map<string, Dependency>();
  for (const fact of diagram.boundaries) {
    for (const id of [fact.consumer, fact.importedModule, fact.originalOwner]) {
      if (!modules.has(id)) return refused('inconsistent-counts', `Dependency boundary names unknown module ${id}`);
    }
    if (fact.consumer === fact.originalOwner) {
      return refused('inconsistent-counts', `Dependency boundary of ${fact.consumer} names an original it owns`);
    }
    const key = JSON.stringify([fact.consumer, identityOf(fact)]);
    let dependency = dependencies.get(key);
    if (!dependency) dependencies.set(key, dependency = { consumer: fact.consumer, originalOwner: fact.originalOwner, facts: [] });
    if (dependency.originalOwner !== fact.originalOwner) {
      return refused('inconsistent-counts', `Dependency boundaries of ${fact.consumer} disagree on an original's owner`);
    }
    dependency.facts.push(fact);
  }

  const project = new Counter();
  const uses = new Map<string, Counter>(), ownedUsedByOthers = new Map<string, Counter>(), usedThrough = new Map<string, Counter>();
  const originalEdges = new Map<string, { consumer: ModuleId; provider: ModuleId; counts: Counter;
    importedThrough: Map<string, Counter>; evidence: KnownFact[] }>();
  for (const dependency of dependencies.values()) {
    const classes = new Set(dependency.facts.map(fact => fact.classification));
    const settled = classes.has('behavioral') ? 'behavioral' : classes.has('unknown') ? 'unknown' : 'non-behavioral';
    if (settled === 'unknown') continue;
    project.add(settled);
    counterIn(uses, dependency.consumer).add(settled);
    counterIn(ownedUsedByOthers, dependency.originalOwner).add(settled);
    const key = edgeKey(dependency.consumer, dependency.originalOwner);
    let edge = originalEdges.get(key);
    if (!edge) {
      originalEdges.set(key, edge = { consumer: dependency.consumer, provider: dependency.originalOwner, counts: new Counter(),
        importedThrough: new Map(), evidence: [] });
    }
    edge.counts.add(settled);
    for (const fact of dependency.facts.filter(known)) {
      counterIn(edge.importedThrough, fact.importedModule).add(fact.classification);
      edge.evidence.push(fact);
    }
  }
  if (project.behavioral !== diagram.headline.behavioralDependencies
    || project.nonBehavioral !== diagram.headline.nonBehavioralDependencies) {
    return refused('inconsistent-counts', `Dependency boundaries aggregate to ${project.behavioral} behavioral and `
      + `${project.nonBehavioral} non-behavioral dependencies; the diagram headline is `
      + `${diagram.headline.behavioralDependencies} and ${diagram.headline.nonBehavioralDependencies}`);
  }

  // Imported-module units: one known boundary fact per (consumer, imported module, original); no self-loop.
  const importedEdges = new Map<string, { consumer: ModuleId; provider: ModuleId; counts: Counter;
    originalOwners: Map<string, Counter>; evidence: KnownFact[] }>();
  for (const fact of diagram.boundaries) {
    if (!known(fact) || fact.consumer === fact.importedModule) continue;
    const key = edgeKey(fact.consumer, fact.importedModule);
    let edge = importedEdges.get(key);
    if (!edge) {
      importedEdges.set(key, edge = { consumer: fact.consumer, provider: fact.importedModule, counts: new Counter(),
        originalOwners: new Map(), evidence: [] });
    }
    edge.counts.add(fact.classification);
    counterIn(edge.originalOwners, fact.originalOwner).add(fact.classification);
    counterIn(usedThrough, fact.importedModule).add(fact.classification);
    edge.evidence.push(fact);
  }

  const breakdown = (counters: Map<string, Counter>) => [...counters.entries()].sort(([left], [right]) => utf8Order(left, right));
  const model: ExplorerDependencyModel = {
    schemaVersion: 'ramify.explorer-dependencies/1',
    inputId: diagram.inputId,
    state: diagram.coverage.state,
    project: project.dependency(),
    modules: moduleIds.map((id): ExplorerDependencyModule => ({
      id,
      uses: (uses.get(id) ?? new Counter()).dependency(),
      usedThrough: (usedThrough.get(id) ?? new Counter()).imported(),
      ownedUsedByOthers: (ownedUsedByOthers.get(id) ?? new Counter()).dependency(),
    })),
    importedModuleEdges: [...importedEdges.values()].sort(edgeOrder).map((edge): ExplorerImportedDependencyEdge => ({
      id: dependencyEdgeId('imported-module', edge.consumer, edge.provider),
      projection: 'imported-module',
      consumer: edge.consumer,
      provider: edge.provider,
      counts: edge.counts.imported(),
      originalOwners: breakdown(edge.originalOwners).map(([owner, counts]) => ({ owner, counts: counts.imported() })),
      evidence: edge.evidence.sort(evidenceOrder).map(evidenceOf),
    })),
    originalOwnerEdges: [...originalEdges.values()].sort(edgeOrder).map((edge): ExplorerOriginalDependencyEdge => ({
      id: dependencyEdgeId('original-owner', edge.consumer, edge.provider),
      projection: 'original-owner',
      consumer: edge.consumer,
      provider: edge.provider,
      counts: edge.counts.dependency(),
      importedThrough: breakdown(edge.importedThrough).map(([module, counts]) => ({ module, counts: counts.imported() })),
      evidence: edge.evidence.sort(evidenceOrder).map(evidenceOf),
    })),
    coverage: { unknownDependencies: diagram.coverage.unknownDependencies, limitIds: [...diagram.coverage.limitIds] },
  };
  const encodedBytes = Buffer.byteLength(JSON.stringify(model), 'utf8');
  if (encodedBytes > maxBytes) {
    return refused('resource-limit', `Dependency view of ${encodedBytes} bytes exceeds the ${maxBytes}-byte limit`);
  }
  return { status: 'mapped', model, encodedBytes };
}
