import type {
  BoundaryBreadth,
  BoundaryMetrics,
  CycleComponent,
  CycleStep,
  EdgeBreadth,
  EdgeMetrics,
  LoadVariants,
  Metric,
  StabilityDirection,
  StabilityMetrics,
  ViewCounts,
} from './interfaces/modularity.js';
import type { ModuleId } from '../subs/model/src/interfaces/model.js';
import {
  byteOrder,
  crossOwner,
  inVariant,
  push,
  ratio,
  sequenceOrder,
  sorted,
  variants,
  type CoverageFacts,
  type LoadVariant,
  type Occurrence,
  type OwnershipTree,
  type ViewFacts,
} from './modularity-context.js';

/** Sections 1, 2, 5 and 6 of the modularity report specification. */

class Breadth {
  occurrences = 0;
  private readonly symbols = new Set<string>();
  private readonly consumerFiles = new Set<string>();
  private readonly providerFiles = new Set<string>();
  private readonly pairs = new Set<string>();
  private readonly modules = new Set<ModuleId>();

  add(occurrence: Occurrence, module?: ModuleId): void {
    this.occurrences++;
    for (const symbol of occurrence.symbols) this.symbols.add(symbol);
    this.consumerFiles.add(occurrence.importer);
    this.providerFiles.add(occurrence.target!);
    this.pairs.add(`${occurrence.importer}\u0000${occurrence.target!}`);
    if (module !== undefined) this.modules.add(module);
  }
  edge(): EdgeBreadth {
    return { occurrences: this.occurrences, selectedSymbols: this.symbols.size, consumerFiles: this.consumerFiles.size,
      providerFiles: this.providerFiles.size, filePairs: this.pairs.size };
  }
  boundary(): BoundaryBreadth {
    return { ...this.edge(), modules: this.modules.size };
  }
  files(): Set<string> {
    return new Set([...this.consumerFiles, ...this.providerFiles]);
  }
  symbolCount(): number {
    return this.symbols.size;
  }
}

export interface EdgeGroup {
  readonly consumer: ModuleId;
  readonly provider: ModuleId;
  /** Cross-owner application occurrences of the edge in the view. */
  readonly occurrences: readonly Occurrence[];
  readonly runtime: number;
  readonly typeOnly: number;
}

/** Edges of the view ordered by consumer, then provider. */
export function edgeGroups(view: ViewFacts): readonly EdgeGroup[] {
  const groups = new Map<string, Occurrence[]>();
  for (const occurrence of view.occurrences) {
    if (crossOwner(occurrence)) push(groups, JSON.stringify([occurrence.consumer, occurrence.provider]), occurrence);
  }
  return [...groups.values()].map(occurrences => {
    const runtime = occurrences.filter(occurrence => occurrence.runtime).length;
    return { consumer: occurrences[0]!.consumer, provider: occurrences[0]!.provider!, occurrences,
      runtime, typeOnly: occurrences.length - runtime };
  }).sort((left, right) => byteOrder(left.consumer, right.consumer) || byteOrder(left.provider, right.provider));
}
const hasVariant = (edge: EdgeGroup, variant: LoadVariant): boolean =>
  variant === 'all' ? edge.occurrences.length > 0 : variant === 'runtime' ? edge.runtime > 0 : edge.typeOnly > 0;

export function viewSummary(view: ViewFacts, edges: readonly EdgeGroup[], coverage: CoverageFacts): LoadVariants<Metric<ViewCounts>> {
  const files = [...view.filesByOwner.values()].flat();
  return variants(variant => {
    const scope = coverage.scope().files(files);
    let application = 0, same = 0, external = 0, outside = 0, unresolved = 0;
    for (const occurrence of view.occurrences) {
      if (!inVariant(occurrence, variant)) continue;
      scope.occurrence(occurrence, true);
      if (occurrence.kind === 'application') {
        application++;
        if (occurrence.provider === occurrence.consumer) same++;
      } else if (occurrence.kind === 'external') external++;
      else if (occurrence.kind === 'outside-project') outside++;
      // Unresolved, and the not yet produced nested-tree and excluded targets.
      else unresolved++;
    }
    return scope.metric({
      owners: view.filesByOwner.size,
      sourceFiles: files.length,
      applicationOccurrences: application,
      sameOwnerOccurrences: same,
      crossOwnerOccurrences: application - same,
      edges: edges.filter(edge => hasVariant(edge, variant)).length,
      externalOccurrences: external,
      outsideModuleOccurrences: outside,
      unresolvedOccurrences: unresolved,
      exactLocality: ratio(same, application),
    });
  });
}

/** Boundary locality and breadth of the owner set `members` (an exact owner or a subtree). */
export function boundaryMetrics(view: ViewFacts, members: ReadonlySet<ModuleId>, coverage: CoverageFacts): LoadVariants<Metric<BoundaryMetrics>> {
  const files = [...members].flatMap(member => view.filesByOwner.get(member) ?? []);
  return variants(variant => {
    const scope = coverage.scope().files(files);
    const outgoing = new Breadth();
    const incoming = new Breadth();
    let internal = 0;
    for (const occurrence of view.occurrences) {
      if (!inVariant(occurrence, variant)) continue;
      const consumerIn = members.has(occurrence.consumer);
      const providerIn = occurrence.provider !== null && members.has(occurrence.provider);
      if (!consumerIn && !providerIn) continue;
      scope.occurrence(occurrence, consumerIn);
      if (occurrence.kind !== 'application') continue;
      if (consumerIn && providerIn) internal++;
      else if (consumerIn) outgoing.add(occurrence, occurrence.provider!);
      else incoming.add(occurrence, occurrence.consumer);
    }
    return scope.metric({
      internalOccurrences: internal,
      outgoing: outgoing.boundary(),
      incoming: incoming.boundary(),
      locality: ratio(internal, internal + outgoing.occurrences),
    });
  });
}

export interface StabilityCounts { readonly afferent: number; readonly efferent: number }

export function stabilityCounts(edges: readonly EdgeGroup[], owner: ModuleId, variant: LoadVariant): StabilityCounts {
  const consumers = new Set<ModuleId>();
  const providers = new Set<ModuleId>();
  for (const edge of edges) {
    if (!hasVariant(edge, variant)) continue;
    if (edge.provider === owner) consumers.add(edge.consumer);
    if (edge.consumer === owner) providers.add(edge.provider);
  }
  return { afferent: consumers.size, efferent: providers.size };
}

export function stabilityMetrics(view: ViewFacts, edges: readonly EdgeGroup[], owner: ModuleId,
  coverage: CoverageFacts): LoadVariants<Metric<StabilityMetrics>> {
  const files = view.filesByOwner.get(owner) ?? [];
  return variants(variant => {
    const scope = coverage.scope().files(files);
    for (const occurrence of view.occurrences) {
      if (inVariant(occurrence, variant) && (occurrence.consumer === owner || occurrence.provider === owner)) {
        scope.occurrence(occurrence, occurrence.consumer === owner);
      }
    }
    const { afferent, efferent } = stabilityCounts(edges, owner, variant);
    return scope.metric({ afferent, efferent, instability: ratio(efferent, afferent + efferent) });
  });
}

function direction(provider: StabilityCounts, consumer: StabilityCounts): StabilityDirection {
  const providerTotal = provider.afferent + provider.efferent;
  const consumerTotal = consumer.afferent + consumer.efferent;
  if (providerTotal === 0 || consumerTotal === 0) return 'undefined';
  const left = provider.efferent * consumerTotal;
  const right = consumer.efferent * providerTotal;
  return left < right ? 'toward-stable' : left === right ? 'level' : 'toward-volatile';
}

export function edgeMetrics(edges: readonly EdgeGroup[], tree: OwnershipTree, coverage: CoverageFacts): EdgeMetrics[] {
  return edges.map(edge => ({
    consumer: edge.consumer,
    provider: edge.provider,
    relation: tree.relation(edge.consumer, edge.provider),
    breadth: variants(variant => {
      const breadth = new Breadth();
      const scope = coverage.scope();
      for (const occurrence of edge.occurrences) {
        if (!inVariant(occurrence, variant)) continue;
        breadth.add(occurrence);
        scope.occurrence(occurrence, true);
      }
      return scope.files(sorted(breadth.files())).metric(breadth.edge());
    }),
    direction: variants(variant => hasVariant(edge, variant)
      ? direction(stabilityCounts(edges, edge.provider, variant), stabilityCounts(edges, edge.consumer, variant))
      : 'undefined'),
  }));
}

type Graph = ReadonlyMap<ModuleId, readonly ModuleId[]>;

function graphOf(edges: readonly EdgeGroup[], include: (edge: EdgeGroup) => boolean): Graph {
  const graph = new Map<ModuleId, ModuleId[]>();
  for (const edge of edges) if (include(edge)) push(graph, edge.consumer, edge.provider);
  for (const providers of graph.values()) providers.sort(byteOrder);
  return graph;
}

/** Nontrivial strongly connected components, each member list in byte order. */
function components(graph: Graph): ModuleId[][] {
  const vertices = sorted([...graph.keys(), ...[...graph.values()].flat()]);
  const index = new Map<ModuleId, number>();
  const low = new Map<ModuleId, number>();
  const stack: ModuleId[] = [];
  const onStack = new Set<ModuleId>();
  const result: ModuleId[][] = [];
  let counter = 0;
  const connect = (vertex: ModuleId): void => {
    index.set(vertex, counter);
    low.set(vertex, counter++);
    stack.push(vertex);
    onStack.add(vertex);
    for (const next of graph.get(vertex) ?? []) {
      if (!index.has(next)) {
        connect(next);
        low.set(vertex, Math.min(low.get(vertex)!, low.get(next)!));
      } else if (onStack.has(next)) low.set(vertex, Math.min(low.get(vertex)!, index.get(next)!));
    }
    if (low.get(vertex) !== index.get(vertex)) return;
    const members: ModuleId[] = [];
    let member: ModuleId;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      members.push(member);
    } while (member !== vertex);
    if (members.length > 1) result.push(members.sort(byteOrder));
  };
  for (const vertex of vertices) if (!index.has(vertex)) connect(vertex);
  return result;
}

/** One first shortest cycle through each member, rotated, deduplicated and ordered. */
function witnesses(graph: Graph, members: readonly ModuleId[], edges: ReadonlyMap<string, EdgeGroup>): CycleStep[][] {
  const inside = new Set(members);
  const cycles = new Map<string, ModuleId[]>();
  for (const start of members) {
    const previous = new Map<ModuleId, ModuleId>();
    const queue: ModuleId[] = [start];
    let found: ModuleId[] | null = null;
    for (let head = 0; head < queue.length && !found; head++) {
      const vertex = queue[head]!;
      for (const next of graph.get(vertex) ?? []) {
        if (!inside.has(next)) continue;
        if (next === start) {
          const path: ModuleId[] = [];
          for (let current: ModuleId | undefined = vertex; current !== undefined; current = previous.get(current)) path.unshift(current);
          found = path;
          break;
        }
        if (!previous.has(next)) {
          previous.set(next, vertex);
          queue.push(next);
        }
      }
    }
    if (!found) continue;
    const least = found.reduce((best, member, position) => byteOrder(member, found![best]!) < 0 ? position : best, 0);
    const rotated = [...found.slice(least), ...found.slice(0, least)];
    cycles.set(JSON.stringify(rotated), rotated);
  }
  return [...cycles.values()]
    .sort((left, right) => left.length - right.length || sequenceOrder(left, right))
    .map(cycle => cycle.map((consumer, position) => {
      const provider = cycle[(position + 1) % cycle.length]!;
      const edge = edges.get(JSON.stringify([consumer, provider]));
      return { consumer, provider, runtimeOccurrences: edge?.runtime ?? 0, typeOnlyOccurrences: edge?.typeOnly ?? 0 };
    }));
}

/** Runtime and type-only cycle components; coverage is the view's `all` summary coverage. */
export function cycleComponents(edges: readonly EdgeGroup[]): CycleComponent[] {
  const byPair = new Map(edges.map(edge => [JSON.stringify([edge.consumer, edge.provider]), edge]));
  const runtimeGraph = graphOf(edges, edge => edge.runtime > 0);
  const allGraph = graphOf(edges, () => true);
  const runtime = components(runtimeGraph);
  const runtimeKeys = new Set(runtime.map(members => JSON.stringify(members)));
  const typeOnly = components(allGraph).filter(members => !runtimeKeys.has(JSON.stringify(members)));
  const describe = (kind: CycleComponent['kind'], members: ModuleId[], graph: Graph): CycleComponent => {
    const inside = new Set(members);
    const breadth = new Breadth();
    let runtimeOccurrences = 0;
    for (const edge of edges) {
      if (!inside.has(edge.consumer) || !inside.has(edge.provider)) continue;
      for (const occurrence of edge.occurrences) breadth.add(occurrence);
      runtimeOccurrences += edge.runtime;
    }
    return {
      kind,
      members,
      occurrences: breadth.occurrences,
      runtimeOccurrences,
      files: breadth.files().size,
      selectedSymbols: breadth.symbolCount(),
      witnesses: witnesses(graph, members, byPair),
      runtimeComponents: kind === 'runtime' ? [] : runtime.filter(inner => inner.every(member => inside.has(member)))
        .sort(sequenceOrder),
    };
  };
  return [
    ...runtime.sort(sequenceOrder).map(members => describe('runtime', members, runtimeGraph)),
    ...typeOnly.sort(sequenceOrder).map(members => describe('type-only', members, allGraph)),
  ];
}
