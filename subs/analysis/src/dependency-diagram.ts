import type { AccessResult } from './interfaces/analysis.js';
import type {
  DependencyBoundaryFact,
  DependencyDiagramFacts,
  DependencyDiagramInput,
  DependencyDiagramOutcome,
} from './interfaces/dependency-diagram.js';
import type { BehavioralDependencyMetrics, Metric } from './interfaces/modularity.js';
import type { ImportReason, ModuleId, OriginalId } from '../subs/model/src/interfaces/model.js';
import type { BehaviorClassification } from '../subs/typescript/src/interfaces/dependency-behavior.js';
import { resolveOwnership } from './modularity-candidate.js';
import {
  byteOrder,
  completeReport,
  CoverageFacts,
  metricCoverage,
  metricValue,
  OriginalFacts,
  resolveOccurrence,
  sorted,
  viewFacts,
  type CompleteReport,
  type OwnershipResolver,
  type ViewFacts,
} from './modularity-context.js';
import { behaviorByOwner, behaviorTotal } from './modularity-owner.js';

/**
 * Dependency-diagram facts of docs/architecture/modularity-report.spec.md: the
 * imported-boundary facts behind both diagram projections, derived from the
 * per-access behavior facts with the same ownership, filter and coverage as the
 * `behavior` metric. Pure: it reads only the report.
 */

/** Production-view facts of one completed analysis; `projectModularity` embeds the same facts per view. */
export function projectDependencyDiagram(input: DependencyDiagramInput): DependencyDiagramOutcome {
  const { report } = input;
  if (!completeReport(report)) return { status: 'refused', reason: 'analysis-incomplete' };
  const resolved = resolveOwnership(report, input.ownership);
  if (resolved.status === 'invalid') {
    throw new TypeError(`The candidate ownership is invalid: ${resolved.issues.map(issue => `${issue.code} ${JSON.stringify(issue.subject)}`).join(', ')}`);
  }
  const { ownership } = resolved;
  const coverage = new CoverageFacts(report);
  const originals = new OriginalFacts(report);
  const occurrences = report.snapshot.accesses.map(access => resolveOccurrence(access, ownership, originals));
  const view = viewFacts(report, 'production', ownership, occurrences);
  const total = behaviorTotal(behaviorByOwner(report, view, coverage, ownership, originals), coverage);
  const metric = viewDependencyDiagram(report, view, ownership, originals, total);
  if (metric.state === 'unavailable') {
    return { status: 'refused', reason: metric.reason === 'not-requested' ? 'not-requested' : 'capability-failed' };
  }
  const diagram = metricValue(metric)!;
  const bytes = Buffer.byteLength(JSON.stringify(diagram), 'utf8');
  if (bytes > input.limits.maxResultBytes) {
    return { status: 'refused', reason: 'resource-limit', observedBytes: bytes, maximumBytes: input.limits.maxResultBytes };
  }
  return { status: 'projected', diagram };
}

const precedence: readonly BehaviorClassification[] = ['behavioral', 'unknown', 'non-behavioral', 'unused'];
const strongest = (classifications: ReadonlySet<BehaviorClassification>): BehaviorClassification =>
  precedence.find(candidate => classifications.has(candidate))!;
const statusRank = { allowed: 0, limited: 1, denied: 2 } as const;
type Status = keyof typeof statusRank;

interface BoundaryDraft {
  readonly consumer: ModuleId;
  readonly importedModule: ModuleId;
  readonly originalOwner: ModuleId;
  readonly original: OriginalId;
  readonly identity: string;
  readonly definingFile: string;
  readonly classifications: Set<BehaviorClassification>;
  readonly consumerFiles: Set<string>;
  readonly importedFiles: Set<string>;
  readonly accessIds: Set<string>;
  readonly limitIds: Set<string>;
  readonly reasons: Set<ImportReason>;
  status: Status;
}

/**
 * The facts of one view. `total` is the view's `behavior` metric: the diagram
 * shares its availability and coverage, and its regrouped boundaries must equal
 * its counts.
 */
export function viewDependencyDiagram(report: CompleteReport, view: ViewFacts, ownership: OwnershipResolver,
  originals: OriginalFacts, total: Metric<BehavioralDependencyMetrics>): Metric<DependencyDiagramFacts> {
  if (total.state === 'unavailable') return total;
  const accesses = new Map(report.snapshot.accesses.map(access => [access.id, access]));
  const results = new Map(report.snapshot.results.map(result => [result.accessId, result]));
  const drafts = new Map<string, BoundaryDraft>();
  for (const fact of report.snapshot.dependencyBehavior?.facts ?? []) {
    if (!view.sources.has(fact.consumer.file)) continue;
    const consumer = ownership.ownerOf(fact.consumer.file) ?? fact.consumer.area.owner;
    const definingFile = originals.definingFile(fact.original);
    const originalOwner = ownership.ownerOf(definingFile) ?? fact.original.owner;
    if (originalOwner === consumer) continue;
    const identity = originals.identity(fact.original);
    for (const path of fact.accesses) {
      // An unused path supports no boundary: it adds no files, accesses or status to a used one.
      if (path.classification === 'unused') continue;
      const access = accesses.get(path.accessId);
      if (access?.target.kind !== 'application') {
        throw new Error(`Behavior access fact ${path.accessId} names no application access of the report`);
      }
      const target = access.target.origin;
      const importedModule = ownership.ownerOf(target.file) ?? target.area.owner;
      const key = JSON.stringify([consumer, importedModule, identity]);
      let draft = drafts.get(key);
      if (!draft) {
        draft = { consumer, importedModule, originalOwner, original: { ...fact.original }, identity, definingFile,
          classifications: new Set(), consumerFiles: new Set(), importedFiles: new Set(), accessIds: new Set(),
          limitIds: new Set(), reasons: new Set(), status: 'allowed' };
        drafts.set(key, draft);
      }
      draft.classifications.add(path.classification);
      draft.consumerFiles.add(fact.consumer.file);
      draft.importedFiles.add(target.file);
      draft.accessIds.add(path.accessId);
      for (const id of path.limitIds) draft.limitIds.add(id);
      const decided = accessStatus(results.get(path.accessId), identity, originals);
      for (const reason of decided.reasons) draft.reasons.add(reason);
      if (statusRank[decided.status] > statusRank[draft.status]) draft.status = decided.status;
    }
  }

  const boundaries: DependencyBoundaryFact[] = [];
  for (const draft of [...drafts.values()].sort((left, right) => byteOrder(left.consumer, right.consumer)
    || byteOrder(left.importedModule, right.importedModule) || byteOrder(left.identity, right.identity))) {
    const classification = strongest(draft.classifications) as DependencyBoundaryFact['classification'];
    boundaries.push({
      consumer: draft.consumer,
      importedModule: draft.importedModule,
      originalOwner: draft.originalOwner,
      original: draft.original,
      classification,
      consumerFiles: sorted(draft.consumerFiles),
      importedFiles: sorted(draft.importedFiles),
      originalFiles: [draft.definingFile],
      accessIds: sorted(draft.accessIds),
      status: draft.status,
      reasons: sorted(draft.reasons) as ImportReason[],
      limitIds: classification === 'unknown' ? sorted(draft.limitIds) : [],
    });
  }

  const value = metricValue(total)!;
  const partial = metricCoverage(total);
  const headline = headlineOf(boundaries, originals);
  if (headline.behavioral !== value.behavioralDependencies || headline.nonBehavioral !== value.nonBehavioralDependencies
    || headline.unknown !== (partial?.unknownDependencies ?? 0)) {
    throw new Error(`Dependency diagram boundaries (${JSON.stringify(headline)}) differ from the behavior metric (${JSON.stringify(total)})`);
  }
  const diagram = deepFreeze<DependencyDiagramFacts>({
    inputId: report.inputId,
    modules: ownership.modules.map(module => module.id),
    headline: { behavioralDependencies: value.behavioralDependencies, nonBehavioralDependencies: value.nonBehavioralDependencies },
    boundaries,
    coverage: {
      state: partial ? 'partial' : 'complete',
      unknownDependencies: partial?.unknownDependencies ?? 0,
      limitIds: [...partial?.limitIds ?? []],
    },
  });
  return partial ? { state: 'partial', observed: diagram, coverage: partial } : { state: 'measured', value: diagram };
}

/** The decisions of one contributing access for this original only. */
function accessStatus(result: AccessResult | undefined, identity: string, originals: OriginalFacts):
  { readonly status: Status; readonly reasons: readonly ImportReason[] } {
  const decisions = result?.decisions.filter(decision => decision.original !== null
    && originals.identity(decision.original.id) === identity) ?? [];
  const reasons = decisions.map(decision => decision.reason);
  if (decisions.some(decision => decision.status === 'denied')) return { status: 'denied', reasons };
  const limited = !result || !decisions.length || result.coverage.length > 0
    || result.outcome === 'unverifiable' || result.outcome === 'mixed';
  return { status: limited ? 'limited' : 'allowed', reasons };
}

/** Boundaries regrouped by `(consumer, original)` with the fixed precedence. */
function headlineOf(boundaries: readonly DependencyBoundaryFact[], originals: OriginalFacts) {
  const units = new Map<string, Set<BehaviorClassification>>();
  for (const boundary of boundaries) {
    const key = JSON.stringify([boundary.consumer, originals.identity(boundary.original)]);
    const classifications = units.get(key) ?? new Set();
    classifications.add(boundary.classification);
    units.set(key, classifications);
  }
  let behavioral = 0, nonBehavioral = 0, unknown = 0;
  for (const classifications of units.values()) {
    const classification = strongest(classifications);
    if (classification === 'behavioral') behavioral++;
    else if (classification === 'non-behavioral') nonBehavioral++;
    else unknown++;
  }
  return { behavioral, nonBehavioral, unknown };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
