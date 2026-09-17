import type {
  BehavioralDependencyMetrics,
  Connectedness,
  ContextSize,
  InterfaceCapability,
  InterfaceDestination,
  InterfaceUse,
  IsolatedFile,
  Metric,
  MetricUnavailableReason,
} from './interfaces/modularity.js';
import type { Destination, ModuleId } from '../subs/model/src/interfaces/model.js';
import type { DependencyBehaviorFact } from '../subs/typescript/src/interfaces/dependency-behavior.js';
import {
  byteOrder,
  crossOwner,
  metricCoverage,
  metricValue,
  push,
  ratio,
  sorted,
  type CompleteReport,
  type CoverageFacts,
  type OriginalFacts,
  type OwnershipResolver,
  type ViewFacts,
} from './modularity-context.js';

/** Sections 3, 4, 7 and 9 of the modularity report specification. */

interface ExposedOriginal {
  readonly identity: string;
  readonly file: string;
  readonly destinations: ReadonlySet<Destination>;
  readonly capability: 'value' | 'type-only';
}

/** Exposed owned originals of each owner in one view: effective exposures declared by the owner of a subset file. */
export function exposedOriginals(report: CompleteReport, view: ViewFacts, ownership: OwnershipResolver,
  originals: OriginalFacts): ReadonlyMap<ModuleId, readonly ExposedOriginal[]> {
  const found = new Map<string, { owner: ModuleId; file: string; destinations: Set<Destination> }>();
  for (const exposure of report.snapshot.model.exposures) {
    if (!exposure.effective) continue;
    const file = originals.definingFile(exposure.original);
    if (!view.sources.has(file) || ownership.ownerOf(file) !== exposure.module) continue;
    const identity = originals.identity(exposure.original);
    const entry = found.get(identity) ?? { owner: exposure.module, file, destinations: new Set<Destination>() };
    for (const destination of exposure.destinations) entry.destinations.add(destination);
    found.set(identity, entry);
  }
  const byOwner = new Map<ModuleId, ExposedOriginal[]>();
  for (const [identity, entry] of found) {
    push(byOwner, entry.owner, { identity, file: entry.file, destinations: entry.destinations,
      capability: originals.catalog.get(identity)?.hasValue ? 'value' : 'type-only' });
  }
  return byOwner;
}

const destinations: readonly InterfaceDestination[] = ['parent', 'descendants', 'any'];
const capabilities: readonly InterfaceCapability[] = ['value', 'type-only', 'any'];

export function interfaceUse(view: ViewFacts, owner: ModuleId, exposed: readonly ExposedOriginal[],
  coverage: CoverageFacts, ownership: OwnershipResolver): Metric<InterfaceUse> {
  if (!ownership.declaredExposure) return { state: 'unavailable', reason: 'candidate-exposure' };
  const scope = coverage.scope().files(view.filesByOwner.get(owner) ?? []);
  const selected = new Set<string>();
  for (const occurrence of view.occurrences) {
    if (occurrence.consumer === owner) continue;
    scope.occurrence(occurrence, false);
    for (const original of occurrence.originals) selected.add(original);
  }
  const rows = destinations.flatMap(destination => capabilities.map(capability => {
    const matching = exposed.filter(original => (destination === 'any' || original.destinations.has(destination))
      && (capability === 'any' || original.capability === capability));
    const used = matching.filter(original => selected.has(original.identity)).length;
    return { destination, capability, exposedOriginals: matching.length, selectedOriginals: used,
      repositoryInterfaceUse: ratio(used, matching.length) };
  }));
  return scope.metric({ rows });
}

const declarationFile = (path: string): boolean => /\.d\.[cm]?ts$/.test(path);

export function connectedness(report: CompleteReport, view: ViewFacts, owner: ModuleId, exposed: readonly ExposedOriginal[],
  coverage: CoverageFacts, ownership: OwnershipResolver): Metric<Connectedness> {
  if (view.filter !== 'production') return { state: 'unavailable', reason: 'not-defined' };
  const files = view.filesByOwner.get(owner) ?? [];
  const vertices = new Set(files);
  const parent = new Map(files.map(file => [file, file]));
  const find = (file: string): string => {
    let root = file;
    while (parent.get(root) !== root) root = parent.get(root)!;
    for (let current = file; current !== root;) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const scope = coverage.scope().files(files);
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const occurrence of view.occurrences) {
    if (vertices.has(occurrence.importer)) scope.occurrence(occurrence, true);
    if (occurrence.kind !== 'application') continue;
    if (crossOwner(occurrence)) {
      if (vertices.has(occurrence.importer)) outgoing.set(occurrence.importer, (outgoing.get(occurrence.importer) ?? 0) + 1);
      if (vertices.has(occurrence.target!)) incoming.set(occurrence.target!, (incoming.get(occurrence.target!) ?? 0) + 1);
    } else if (vertices.has(occurrence.importer) && vertices.has(occurrence.target!)) {
      const left = find(occurrence.importer);
      const right = find(occurrence.target!);
      if (left !== right) parent.set(byteOrder(left, right) < 0 ? right : left, byteOrder(left, right) < 0 ? left : right);
    }
  }
  const sizes = new Map<string, number>();
  for (const file of files) sizes.set(find(file), (sizes.get(find(file)) ?? 0) + 1);
  const exposedByFile = new Map<string, number>();
  for (const original of exposed) exposedByFile.set(original.file, (exposedByFile.get(original.file) ?? 0) + 1);
  const isolates: IsolatedFile[] = files.filter(file => sizes.get(find(file)) === 1).map(path => {
    const declared = view.sources.get(path)!;
    const root = report.snapshot.areas.find(candidate => candidate.owner === declared.owner && candidate.kind === declared.area)?.root;
    return {
      path,
      declarationFile: declarationFile(path),
      interfaceFile: root !== undefined && path.startsWith(`${root}/interfaces/`),
      exposedOriginals: ownership.declaredExposure ? exposedByFile.get(path) ?? 0 : null,
      incomingOccurrences: incoming.get(path) ?? 0,
      outgoingOccurrences: outgoing.get(path) ?? 0,
    };
  });
  const largest = Math.max(0, ...sizes.values());
  return scope.metric({
    files: files.length,
    components: sizes.size,
    largestComponentFiles: largest,
    largestComponentCoverage: ratio(largest, files.length),
    isolates,
  });
}

export function contextSize(report: CompleteReport, view: ViewFacts, members: ReadonlySet<ModuleId>,
  exposed: ReadonlyMap<ModuleId, readonly ExposedOriginal[]>, coverage: CoverageFacts,
  ownership: OwnershipResolver): Metric<ContextSize> {
  const owners = [...members];
  const sources = owners.flatMap(owner => view.filesByOwner.get(owner) ?? []);
  const resources = owners.flatMap(owner => view.resourcesByOwner.get(owner) ?? []);
  const counted = new Set([...sources, ...resources.map(resource => resource.path)]);
  const scope = coverage.scope().files(counted);
  let accessOccurrences = 0;
  for (const occurrence of view.occurrences) {
    if (!counted.has(occurrence.importer)) continue;
    accessOccurrences++;
    scope.occurrence(occurrence, true);
  }
  return scope.metric({
    sourceFiles: sources.length,
    sourceBytes: sources.reduce((sum, path) => sum + view.sources.get(path)!.bytes, 0),
    resourceFiles: resources.length,
    resourceBytes: resources.reduce((sum, resource) => sum + resource.bytes, 0),
    originals: report.snapshot.catalog.originals.filter(original => counted.has(original.origin.file)).length,
    exposedOriginals: ownership.declaredExposure
      ? owners.reduce((sum, owner) => sum + (exposed.get(owner)?.length ?? 0), 0) : null,
    accessOccurrences,
  });
}

const precedence = ['behavioral', 'unknown', 'non-behavioral', 'unused'] as const;

/** Behavioral availability of the analysis, or null when facts are present. */
export function behaviorUnavailable(report: CompleteReport): MetricUnavailableReason | null {
  if (!report.request.capabilities.includes('dependency-behavior')) return 'not-requested';
  return report.snapshot.dependencyBehavior ? null : 'capability-failed';
}

export interface ViewBehavior {
  readonly owners: ReadonlyMap<ModuleId, Metric<BehavioralDependencyMetrics>>;
  /** Limit ids of a failed classification; null when it completed. */
  readonly failure: readonly string[] | null;
}

export function behaviorByOwner(report: CompleteReport, view: ViewFacts, coverage: CoverageFacts,
  ownership: OwnershipResolver, originals: OriginalFacts): ViewBehavior | MetricUnavailableReason {
  const unavailable = behaviorUnavailable(report);
  if (unavailable) return unavailable;
  const facts = report.snapshot.dependencyBehavior!;
  const groups = new Map<ModuleId, Map<string, DependencyBehaviorFact[]>>();
  for (const fact of facts.facts) {
    if (!view.sources.has(fact.consumer.file)) continue;
    const consumer = ownership.ownerOf(fact.consumer.file) ?? fact.consumer.area.owner;
    const provider = ownership.ownerOf(originals.definingFile(fact.original)) ?? fact.original.owner;
    if (provider === consumer) continue;
    const byOriginal = groups.get(consumer) ?? new Map<string, DependencyBehaviorFact[]>();
    push(byOriginal, originals.identity(fact.original), fact);
    groups.set(consumer, byOriginal);
  }
  const failed = facts.status === 'failed';
  const failureIds = failed ? facts.limits.map(limit => limit.id) : [];
  const result = new Map<ModuleId, Metric<BehavioralDependencyMetrics>>();
  for (const owner of [...view.filesByOwner.keys()].sort(byteOrder)) {
    const files = view.filesByOwner.get(owner)!;
    const inFiles = new Set(files);
    const scope = coverage.scope().files(files).behavior(failureIds, false, failed);
    for (const occurrence of view.occurrences) if (inFiles.has(occurrence.importer)) scope.occurrence(occurrence, true);
    let behavioral = 0, nonBehavioral = 0;
    for (const group of groups.get(owner)?.values() ?? []) {
      const classification = precedence.find(candidate => group.some(fact => fact.classification === candidate))!;
      if (classification === 'behavioral') behavioral++;
      else if (classification === 'non-behavioral') nonBehavioral++;
      scope.behavior(sorted(group.flatMap(fact => fact.limitIds)), classification === 'unknown');
    }
    result.set(owner, scope.metric({ behavioralDependencies: behavioral, nonBehavioralDependencies: nonBehavioral }));
  }
  return { owners: result, failure: failed ? failureIds : null };
}

/** The view total: the sum over owners, with their coverage merged. */
export function behaviorTotal(behavior: ViewBehavior | MetricUnavailableReason,
  coverage: CoverageFacts): Metric<BehavioralDependencyMetrics> {
  if (typeof behavior === 'string') return { state: 'unavailable', reason: behavior };
  const scope = coverage.scope();
  if (behavior.failure) scope.behavior(behavior.failure, false, true);
  let behavioral = 0, nonBehavioral = 0;
  for (const metric of behavior.owners.values()) {
    const value = metricValue(metric)!;
    behavioral += value.behavioralDependencies;
    nonBehavioral += value.nonBehavioralDependencies;
    scope.merge(metricCoverage(metric));
  }
  return scope.metric({ behavioralDependencies: behavioral, nonBehavioralDependencies: nonBehavioral });
}
