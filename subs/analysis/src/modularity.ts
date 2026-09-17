import type {
  Metric,
  MetricCoverage,
  ModularityInput,
  ModularityOutcome,
  ModularityProvenance,
  ModularityReport,
  ModularityView,
  OwnerMetrics,
} from './interfaces/modularity.js';
import type { SourceAccess } from '../subs/typescript/src/interfaces/source.js';
import { viewDependencyDiagram } from './dependency-diagram.js';
import { boundaryChanges, resolveOwnership } from './modularity-candidate.js';
import {
  byteOrder,
  completeReport,
  CoverageFacts,
  declaredOwnership,
  loadVariants,
  metricCoverage,
  OriginalFacts,
  OwnershipTree,
  resolveOccurrence,
  sorted,
  viewFacts,
  type CompleteReport,
  type Occurrence,
  type OwnershipResolver,
  type ViewFacts,
} from './modularity-context.js';
import { boundaryMetrics, cycleComponents, edgeGroups, edgeMetrics, stabilityMetrics, viewSummary } from './modularity-graph.js';
import { behaviorByOwner, behaviorTotal, connectedness, contextSize, exposedOriginals, interfaceUse } from './modularity-owner.js';

/**
 * Pure projection of one completed analysis report into the modularity report
 * of docs/architecture/modularity-report.spec.md. It reads only the report:
 * no filesystem, compiler, session or daemon state.
 */
export function projectModularity(input: ModularityInput): ModularityOutcome {
  const { report } = input;
  if (!completeReport(report)) {
    return { status: 'unavailable', reason: 'analysis-incomplete',
      message: 'The analysis report is not a completed analysis with its registry, snapshot, catalog and model' };
  }
  const resolved = resolveOwnership(report, input.ownership);
  if (resolved.status === 'invalid') return { status: 'invalid-ownership', issues: resolved.issues };
  const projected = project(input.revision, report, resolved.ownership, input.limits.maxBoundaryChanges);
  const bytes = Buffer.byteLength(JSON.stringify(projected), 'utf8');
  if (bytes > input.limits.maxReportBytes) {
    return { status: 'unavailable', reason: 'resource-limit',
      message: `The modularity report needs ${bytes} bytes, above the limit of ${input.limits.maxReportBytes}` };
  }
  return { status: 'projected', report: projected };
}

function project(revision: string, report: CompleteReport, ownership: OwnershipResolver, maxBoundaryChanges: number): ModularityReport {
  const coverage = new CoverageFacts(report);
  const originals = new OriginalFacts(report);
  const tree = new OwnershipTree(ownership);
  const occurrences = report.snapshot.accesses.map(access => resolveOccurrence(access, ownership, originals));
  const facts = (['production', 'test'] as const).map(filter => viewFacts(report, filter, ownership, occurrences));
  const views = facts.map(view => projectView(report, view, ownership, tree, coverage, originals));
  const collected = views.flatMap(viewCoverage);
  const partial = collected.length > 0 || report.outcome.coverage === 'partial';
  const detail: MetricCoverage = {
    limitIds: sorted(collected.flatMap(item => item.limitIds)),
    unattributedAccesses: views.reduce((sum, view) => sum + (metricCoverage(view.summary.all)?.unattributedAccesses ?? 0), 0),
    unknownDependencies: views.reduce((sum, view) => sum + (metricCoverage(view.behavior)?.unknownDependencies ?? 0), 0),
  };
  return {
    schemaVersion: 'ramify.modularity/2',
    provenance: provenance(revision, report, ownership),
    coverage: { state: partial ? 'partial' : 'complete', detail },
    modules: ownership.modules,
    views,
    boundaryChanges: ownership.mode === 'declared' ? null : boundaryChanges(facts,
      declaredOccurrences(report, originals), maxBoundaryChanges),
  };
}

function declaredOccurrences(report: CompleteReport, originals: OriginalFacts): ReadonlyMap<SourceAccess, Occurrence> {
  const declared = declaredOwnership(report);
  return new Map(report.snapshot.accesses.map(access => [access, resolveOccurrence(access, declared, originals)]));
}

function provenance(revision: string, report: CompleteReport, ownership: OwnershipResolver): ModularityProvenance {
  return {
    revision,
    analysisSchema: report.schemaVersion,
    inputId: report.inputId,
    registryId: report.registry.id,
    check: report.outcome.check,
    analysisCoverage: report.outcome.coverage,
    capabilities: report.capabilities.filter(item => item.requested && item.executed)
      .map(item => item.capability).sort(byteOrder),
    omittedScopes: sorted((report.scope ?? report.snapshot.inventory.scope).independentScopes),
    ownership: ownership.mode,
    candidateId: ownership.candidateId,
  };
}

function projectView(report: CompleteReport, view: ViewFacts, ownership: OwnershipResolver, tree: OwnershipTree,
  coverage: CoverageFacts, originals: OriginalFacts): ModularityView {
  const { filter } = view;
  const edges = edgeGroups(view);
  const exposed = ownership.declaredExposure ? exposedOriginals(report, view, ownership, originals) : new Map();
  const behavior = behaviorByOwner(report, view, coverage, ownership, originals);
  const listed = tree.ids.filter(id => [...tree.subtree(id)].some(member => view.filesByOwner.has(member)));
  const owners = listed.map((owner): OwnerMetrics => {
    const exact = new Set([owner]);
    const subtree = tree.subtree(owner);
    return {
      owner,
      exact: boundaryMetrics(view, exact, coverage),
      subtree: boundaryMetrics(view, subtree, coverage),
      stability: stabilityMetrics(view, edges, owner, coverage),
      interfaceUse: interfaceUse(view, owner, exposed.get(owner) ?? [], coverage, ownership),
      behavior: typeof behavior === 'string' ? { state: 'unavailable', reason: behavior }
        : behavior.owners.get(owner) ?? behaviorTotal({ owners: new Map(), failure: behavior.failure }, coverage),
      connectedness: connectedness(report, view, owner, exposed.get(owner) ?? [], coverage, ownership),
      context: {
        exact: contextSize(report, view, exact, exposed, coverage, ownership),
        subtree: contextSize(report, view, subtree, exposed, coverage, ownership),
      },
    };
  });
  const summary = viewSummary(view, edges, coverage);
  const behaviorMetric = behaviorTotal(behavior, coverage);
  return {
    filter,
    summary,
    behavior: behaviorMetric,
    owners,
    edges: edgeMetrics(edges, tree, coverage),
    // Cycle scope equals the view summary's `all` scope.
    cycles: withCoverage(summary.all, cycleComponents(edges)),
    // The same facts `projectDependencyDiagram` returns for the production view.
    dependencyDiagram: viewDependencyDiagram(report, view, ownership, originals, behaviorMetric),
  };
}

function withCoverage<T>(scope: Metric<unknown>, value: T): Metric<T> {
  const partial = metricCoverage(scope);
  return partial ? { state: 'partial', observed: value, coverage: partial } : { state: 'measured', value };
}

/** Coverage of every partial metric in a view. */
function viewCoverage(view: ModularityView): MetricCoverage[] {
  const metrics: Metric<unknown>[] = [
    ...loadVariants.map(variant => view.summary[variant]), view.behavior, view.cycles, view.dependencyDiagram,
    ...view.edges.flatMap(edge => loadVariants.map(variant => edge.breadth[variant])),
    ...view.owners.flatMap(owner => [
      ...loadVariants.flatMap(variant => [owner.exact[variant], owner.subtree[variant], owner.stability[variant]]),
      owner.interfaceUse, owner.behavior, owner.connectedness, owner.context.exact, owner.context.subtree,
    ]),
  ];
  return metrics.map(metricCoverage).filter((item): item is MetricCoverage => item !== null);
}
