import type { AnalysisReport } from './interfaces/analysis.js';
import type {
  Metric,
  MetricCoverage,
  ModularityInput,
  ModularityOutcome,
  ModularityProvenance,
  ModularityReport,
  ModularityView,
  OwnerMetrics,
  SourceFilter,
} from './interfaces/modularity.js';
import {
  byteOrder,
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
  if (input.ownership !== undefined) {
    throw new Error('Candidate ownership is not implemented; the projection supports declared ownership only');
  }
  const projected = project(input.revision, report, declaredOwnership(report));
  const bytes = Buffer.byteLength(JSON.stringify(projected), 'utf8');
  if (bytes > input.limits.maxReportBytes) {
    return { status: 'unavailable', reason: 'resource-limit',
      message: `The modularity report needs ${bytes} bytes, above the limit of ${input.limits.maxReportBytes}` };
  }
  return { status: 'projected', report: projected };
}

function completeReport(report: AnalysisReport): report is CompleteReport {
  return report.outcome.execution === 'completed' && report.inputId !== null && report.registry !== null
    && report.snapshot !== null && report.snapshot.catalog !== null && report.snapshot.model !== null;
}

function project(revision: string, report: CompleteReport, ownership: OwnershipResolver): ModularityReport {
  const coverage = new CoverageFacts(report);
  const originals = new OriginalFacts(report);
  const tree = new OwnershipTree(ownership);
  const occurrences = report.snapshot.accesses.map(access => resolveOccurrence(access, ownership, originals));
  const views = (['production', 'test'] as const)
    .map(filter => projectView(report, filter, ownership, tree, occurrences, coverage, originals));
  const collected = views.flatMap(viewCoverage);
  const partial = collected.length > 0 || report.outcome.coverage === 'partial';
  const detail: MetricCoverage = {
    limitIds: sorted(collected.flatMap(item => item.limitIds)),
    unattributedAccesses: views.reduce((sum, view) => sum + (metricCoverage(view.summary.all)?.unattributedAccesses ?? 0), 0),
    unknownDependencies: views.reduce((sum, view) => sum + (metricCoverage(view.behavior)?.unknownDependencies ?? 0), 0),
  };
  return {
    schemaVersion: 'ramify.modularity/1',
    provenance: provenance(revision, report, ownership),
    coverage: { state: partial ? 'partial' : 'complete', detail },
    modules: ownership.modules,
    views,
    boundaryChanges: null,
  };
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

function projectView(report: CompleteReport, filter: SourceFilter, ownership: OwnershipResolver, tree: OwnershipTree,
  occurrences: readonly Occurrence[], coverage: CoverageFacts, originals: OriginalFacts): ModularityView {
  const view = viewFacts(report, filter, ownership, occurrences);
  const edges = edgeGroups(view);
  const exposed = exposedOriginals(report, view, ownership, originals);
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
  return {
    filter,
    summary,
    behavior: behaviorTotal(behavior, coverage),
    owners,
    edges: edgeMetrics(edges, tree, coverage),
    // Cycle scope equals the view summary's `all` scope.
    cycles: withCoverage(summary.all, cycleComponents(edges)),
  };
}

function withCoverage<T>(scope: Metric<unknown>, value: T): Metric<T> {
  const partial = metricCoverage(scope);
  return partial ? { state: 'partial', observed: value, coverage: partial } : { state: 'measured', value };
}

/** Coverage of every partial metric in a view. */
function viewCoverage(view: ModularityView): MetricCoverage[] {
  const metrics: Metric<unknown>[] = [
    ...loadVariants.map(variant => view.summary[variant]), view.behavior, view.cycles,
    ...view.edges.flatMap(edge => loadVariants.map(variant => edge.breadth[variant])),
    ...view.owners.flatMap(owner => [
      ...loadVariants.flatMap(variant => [owner.exact[variant], owner.subtree[variant], owner.stability[variant]]),
      owner.interfaceUse, owner.behavior, owner.connectedness, owner.context.exact, owner.context.subtree,
    ]),
  ];
  return metrics.map(metricCoverage).filter((item): item is MetricCoverage => item !== null);
}
