// Markdown rendering of a materialized `ModularityDocument`
// (docs/architecture/modularity-report.spec.md, "Materialized baseline").
//
// Every value comes from the document. Tables keep units visible, label
// partial and unavailable metrics, and ranked tables order by exactly one named
// measure, descending, ties by id. Structural positions are read from the
// ownership tree and the production edges; they explain a ranking and never
// combine measures into a score.

import type {
  BoundaryChanges,
  BoundaryMetrics,
  ChangeAffinityReport,
  CycleComponent,
  DependencyDiagramFacts,
  EdgeMetrics,
  LoadVariants,
  Metric,
  ModularityDocument,
  ModularityEvaluation,
  ModularityView,
  OwnerMetrics,
  Ratio,
  StabilityDirection,
  ViewCounts,
} from 'ramify.ts/analysis';
import { utf8Order } from './git-history.js';

const rankedRows = 10;
type Variant = keyof LoadVariants<unknown>;
const variantLabel: Record<Variant, string> = { all: 'all loads', runtime: 'runtime', typeOnly: 'type-only' };

const code = (value: string): string => `\`${value.replace(/`/g, "'")}\``;
const integer = (value: number): string => value.toLocaleString('en-US');
const percent = (ratio: Ratio): string => ratio.value === null ? 'undefined' : `${(ratio.value * 100).toFixed(1)}%`;
const fraction = (ratio: Ratio): string => `${integer(ratio.numerator)}/${integer(ratio.denominator)} (${percent(ratio)})`;
const bytes = (value: number): string => value >= 1024 ? `${(value / 1024).toFixed(1)} KiB` : `${value} B`;

function valueOf<T>(metric: Metric<T>): T | null {
  return metric.state === 'measured' ? metric.value : metric.state === 'partial' ? metric.observed : null;
}
/** Formats a metric; partial values are lower bounds and say so, unavailable values name their reason. */
function cell<T>(metric: Metric<T>, format: (value: T) => string): string {
  if (metric.state === 'measured') return format(metric.value);
  if (metric.state === 'partial') return `${format(metric.observed)} (partial, lower bound)`;
  return `unavailable (${metric.reason})`;
}
function table(headers: readonly string[], rows: readonly (readonly string[])[], alignRight: readonly number[] = []): string {
  if (!rows.length) return '_None._\n';
  const align = headers.map((_, index) => alignRight.includes(index) ? '---:' : '---');
  const line = (cells: readonly string[]) => `| ${cells.map(text => text.replace(/\|/g, '\\|')).join(' | ')} |`;
  return [line(headers), line(align), ...rows.map(line)].join('\n') + '\n';
}
const numeric = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, index) => from + index);

interface Tree {
  readonly parents: ReadonlyMap<string, string | null>;
  isAncestor(ancestor: string, id: string): boolean;
  relation(first: string, second: string): string;
}
function treeOf(evaluation: ModularityEvaluation): Tree {
  const parents = new Map(evaluation.modularity.modules.map(module => [module.id, module.parent]));
  const isAncestor = (ancestor: string, id: string) => {
    for (let current = parents.get(id) ?? null; current !== null; current = parents.get(current) ?? null) {
      if (current === ancestor) return true;
    }
    return false;
  };
  const relation = (first: string, second: string) => parents.get(second) === first ? 'parent and child'
    : parents.get(first) === second ? 'child and parent'
    : isAncestor(first, second) ? 'ancestor and descendant' : isAncestor(second, first) ? 'descendant and ancestor'
    : parents.get(first) === parents.get(second) ? 'siblings' : 'unrelated';
  return { parents, isAncestor, relation };
}

/** A structural position read from the tree and production edges; not a declared role. */
function position(view: ModularityView, tree: Tree, owner: string): string {
  const outgoing = view.edges.filter(edge => edge.consumer === owner);
  const incoming = view.edges.filter(edge => edge.provider === owner);
  const occurrences = (edges: readonly EdgeMetrics[]) => edges.reduce((sum, edge) => sum + (valueOf(edge.breadth.all)?.occurrences ?? 0), 0);
  const total = occurrences(outgoing);
  const toDescendants = occurrences(outgoing.filter(edge => edge.relation === 'child' || edge.relation === 'descendant'));
  const hasChildren = [...tree.parents.values()].includes(owner);
  if (tree.parents.get(owner) === null) return `composition root (${integer(toDescendants)} of ${integer(total)} outgoing occurrences reach its descendants)`;
  if (!outgoing.length) return `provider (no outgoing dependency; ${incoming.length} consumer owners)`;
  if (hasChildren && toDescendants * 2 >= total) return `composition parent (${integer(toDescendants)} of ${integer(total)} outgoing occurrences reach its descendants)`;
  if (!incoming.length) return `leaf consumer (no repository owner depends on it; ${outgoing.length} provider owners)`;
  return `connected owner (${outgoing.length} provider and ${incoming.length} consumer owners)`;
}

function edgeReading(edge: EdgeMetrics, tree: Tree): string {
  const runtime = valueOf(edge.breadth.runtime)?.occurrences ?? 0;
  const typeOnly = valueOf(edge.breadth.typeOnly)?.occurrences ?? 0;
  const loads = runtime === 0 ? 'type-only' : typeOnly === 0 ? 'runtime only' : `${integer(runtime)} runtime, ${integer(typeOnly)} type-only`;
  switch (edge.relation) {
    case 'child':
    case 'descendant':
      return `composition: the consumer uses its ${edge.relation}'s exposed contract (${loads})`;
    case 'parent':
    case 'ancestor':
      return runtime === 0
        ? `contract received from its ${edge.relation}, type-only: consistent with vocabulary owned by the ${edge.relation} (dependency inversion); review ownership, not direction`
        : `contract received from its ${edge.relation} with runtime loads (${loads}); review whether the behavior belongs to the ${edge.relation}`;
    default:
      return tree.parents.get(edge.consumer) === tree.parents.get(edge.provider)
        ? `sibling owners (${loads}); review which owner the contract belongs to`
        : `unrelated owners (${loads}); review which owner the contract belongs to`;
  }
}

export function renderMarkdown(document: ModularityDocument, context: { readonly title: string }): string {
  const candidates = document.candidates;
  const out = [[`# ${context.title}`,
    'Generated by `scripts/probes/modularity/baseline.ts` from one `ModularityDocument`; the JSON beside this file is authoritative.',
    'Measures follow [the modularity report specification](../../../../docs/architecture/modularity-report.spec.md).',
    'No value below is a score, and no measure declares a module good or bad.\n',
    table(['Fact', 'Value'], [
      ['Repository commit', code(document.repository.commit)],
      ['Worktree clean', String(document.repository.clean)],
      ['Candidates in this document', candidates.length ? candidates.map(candidate => code(candidate.modularity.provenance.candidateId ?? '')).join(', ') : 'none'],
    ])].join('\n')];
  if (!candidates.length) {
    out.push(renderEvaluation(document.declared));
  } else {
    out.push(renderComparison(document));
    // Each evaluation renders one heading level below its own section.
    const nested = (text: string) => text.replace(/^#/gm, '##');
    out.push('## Declared ownership', nested(renderEvaluation(document.declared)));
    for (const candidate of candidates) {
      out.push(`## Candidate ${code(candidate.modularity.provenance.candidateId ?? '')}`, nested(renderEvaluation(candidate)));
    }
  }
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** The sections of one evaluation, headed from level 2. */
function renderEvaluation(evaluation: ModularityEvaluation): string {
  const { modularity } = evaluation;
  const tree = treeOf(evaluation);
  const views = modularity.views;
  const production = views.find(view => view.filter === 'production')!;
  const out: string[] = [];
  const section = (heading: string, ...parts: string[]) => out.push(`${heading}\n\n${parts.join('\n')}`);

  // 1. Summary and coverage.
  const provenance = modularity.provenance;
  section('## Summary and coverage',
    table(['Fact', 'Value'], [
      ['Analysis revision', code(provenance.revision)],
      ['Check outcome', provenance.check],
      ['Analysis coverage', provenance.analysisCoverage],
      ['Modularity coverage', modularity.coverage.state],
      ['Coverage limit ids', modularity.coverage.detail.limitIds.length ? modularity.coverage.detail.limitIds.map(code).join(', ') : 'none'],
      ['Unattributed accesses', integer(modularity.coverage.detail.unattributedAccesses)],
      ['Unknown behavioral dependencies', integer(modularity.coverage.detail.unknownDependencies)],
      ['Capabilities', provenance.capabilities.map(code).join(', ')],
      ['Omitted declared nested trees (absent from repository measures)', provenance.omittedScopes.map(code).join(', ') || 'none'],
      ['Ownership', provenance.ownership],
      ['Candidate id', provenance.candidateId === null ? 'none' : code(provenance.candidateId)],
      ['Modules in the tree', integer(modularity.modules.length)],
    ]));
  if (modularity.boundaryChanges) out.push(renderBoundaryChanges(modularity.boundaryChanges));
  section('## View summaries',
    'Production and test views are never summed. Locality is same-owner application occurrences over application occurrences.\n',
    table(['View', 'Loads', 'Owners', 'Source files', 'Application', 'Same-owner', 'Cross-owner', 'Edges', 'External', 'Outside module', 'Unresolved', 'Exact locality'],
      views.flatMap(view => (['all', 'runtime', 'typeOnly'] as const).map(variant => {
        const metric = view.summary[variant];
        const show = (format: (value: ViewCounts) => string) => cell(metric, format);
        return [view.filter, variantLabel[variant], show(v => integer(v.owners)), show(v => integer(v.sourceFiles)),
          show(v => integer(v.applicationOccurrences)), show(v => integer(v.sameOwnerOccurrences)), show(v => integer(v.crossOwnerOccurrences)),
          show(v => integer(v.edges)), show(v => integer(v.externalOccurrences)), show(v => integer(v.outsideModuleOccurrences)),
          show(v => integer(v.unresolvedOccurrences)), show(v => fraction(v.exactLocality))];
      })), numeric(2, 11)));

  // 2. Exact-owner and subtree tables.
  const boundaryRows = (view: ModularityView, scope: 'exact' | 'subtree') => view.owners.map(owner => {
    const all = owner[scope].all;
    return [code(owner.owner), cell(all, v => integer(v.internalOccurrences)), cell(all, v => integer(v.outgoing.occurrences)),
      cell(all, v => integer(v.incoming.occurrences)), cell(all, v => integer(v.outgoing.modules)), cell(all, v => integer(v.incoming.modules)),
      cell(all, (v: BoundaryMetrics) => fraction(v.locality)), cell(owner[scope].runtime, v => fraction(v.locality)),
      cell(owner[scope].typeOnly, v => fraction(v.locality))];
  });
  const boundaryHeaders = ['Owner', 'Internal', 'Outgoing', 'Incoming', 'Provider owners', 'Consumer owners', 'Locality (all)', 'Locality (runtime)', 'Locality (type-only)'];
  for (const view of views) {
    section(`## Exact-owner boundaries: ${view.filter}`,
      'Locality = internal / (internal + outgoing); incoming occurrences never enter the denominator. Counts are all loads.\n',
      table(boundaryHeaders, boundaryRows(view, 'exact'), numeric(1, 8)),
      `### Stability: ${view.filter}\n`,
      'Ca counts distinct consumer owners, Ce distinct provider owners; instability = Ce / (Ca + Ce).\n',
      table(['Owner', 'Ca (all)', 'Ce (all)', 'Instability (all)', 'Instability (runtime)', 'Instability (type-only)'],
        view.owners.map(owner => [code(owner.owner), cell(owner.stability.all, v => integer(v.afferent)), cell(owner.stability.all, v => integer(v.efferent)),
          cell(owner.stability.all, v => fraction(v.instability)), cell(owner.stability.runtime, v => fraction(v.instability)),
          cell(owner.stability.typeOnly, v => fraction(v.instability))]), numeric(1, 5)));
    section(`## Subtree boundaries: ${view.filter}`,
      'A subtree is a module and all its descendants; internal occurrences have both owners inside it.\n',
      table(boundaryHeaders, boundaryRows(view, 'subtree'), numeric(1, 8)));
  }

  // 3. Runtime and type-only edge and cycle tables.
  const edgeRows = (view: ModularityView, variant: 'runtime' | 'typeOnly') => view.edges
    .filter(edge => (valueOf(edge.breadth[variant])?.occurrences ?? 0) > 0)
    .map(edge => {
      const metric = edge.breadth[variant];
      return [code(edge.consumer), code(edge.provider), edge.relation, cell(metric, v => integer(v.occurrences)),
        cell(metric, v => integer(v.selectedSymbols)), cell(metric, v => integer(v.consumerFiles)), cell(metric, v => integer(v.providerFiles)),
        cell(metric, v => integer(v.filePairs)), directionText(edge.direction[variant])];
    });
  const edgeHeaders = ['Consumer', 'Provider', 'Provider relation', 'Occurrences', 'Selected symbols', 'Consumer files', 'Provider files', 'File pairs', 'Stability direction'];
  for (const view of views) {
    section(`## Edges: ${view.filter}`,
      'Each table lists edges with at least one occurrence of that load kind, with breadth over those occurrences only.\n',
      `### Runtime edges: ${view.filter}\n`, table(edgeHeaders, edgeRows(view, 'runtime'), numeric(3, 7)),
      `### Type-only edges: ${view.filter}\n`, table(edgeHeaders, edgeRows(view, 'typeOnly'), numeric(3, 7)));
    const components = valueOf(view.cycles);
    const label = view.cycles.state === 'measured' ? '' : view.cycles.state === 'partial' ? ' (partial, lower bound)' : ` (unavailable: ${view.cycles.reason})`;
    section(`## Cycles: ${view.filter}${label}`,
      'Runtime components come from runtime edges; a type-only component is a component of all edges that is not a runtime component.\n',
      table(['Kind', 'Members', 'Occurrences', 'Runtime occurrences', 'Files', 'Selected symbols', 'Shortest witnesses', 'Runtime components inside'],
        (components ?? []).map(component => [component.kind, component.members.map(code).join(', '), integer(component.occurrences),
          integer(component.runtimeOccurrences), integer(component.files), integer(component.selectedSymbols),
          component.witnesses.map(witness => [...witness.map(step => code(step.consumer)), code(witness[0]!.consumer)].join(' → ')
            + ` (${witness.map(step => `${step.runtimeOccurrences}r/${step.typeOnlyOccurrences}t`).join(', ')})`).join('; '),
          component.runtimeComponents.map(members => members.map(code).join(', ')).join('; ') || 'none']), numeric(2, 5)));
  }

  // 4. Behavioral and non-behavioral dependency counts.
  section('## Behavioral dependency estimate',
    'One symbol dependency is a distinct (consumer owner, original) pair owned by another module. Unknown and unused dependencies count toward neither number.\n',
    ...views.map(view => `### ${view.filter}\n\n` + table(['Consumer owner', 'Behavioral', 'Non-behavioral', 'Coverage'],
      [...view.owners.map(owner => [code(owner.owner), cell(owner.behavior, v => integer(v.behavioralDependencies)),
        cell(owner.behavior, v => integer(v.nonBehavioralDependencies)), coverageText(owner.behavior)]),
      ['**Total**', cell(view.behavior, v => integer(v.behavioralDependencies)), cell(view.behavior, v => integer(v.nonBehavioralDependencies)),
        coverageText(view.behavior)]], [1, 2])));

  // 4b. Dependency-diagram facts behind both endpoint projections.
  section('## Dependency diagram facts',
    'Boundary facts are distinct (consumer, imported module, original) triples; original-owner links regroup them by (consumer, original) with the precedence behavioral, unknown, non-behavioral.'
      + ' Unknown facts add no count, and imported-module links omit consumer-owned import targets.\n',
    table(['View', 'Coverage', 'Modules', 'Headline behavioral', 'Headline non-behavioral', 'Boundary facts (behavioral/non-behavioral/unknown)',
      'Imported-module links (behavioral/any known)', 'Original-owner links (behavioral/any known)', 'Denied/limited facts', 'Encoded bytes'],
    views.map(view => {
      const diagram = valueOf(view.dependencyDiagram);
      if (!diagram) return [view.filter, coverageText(view.dependencyDiagram), ...Array<string>(8).fill('unavailable')];
      const by = (classification: string) => diagram.boundaries.filter(fact => fact.classification === classification).length;
      const imported = diagramLinks(diagram, 'imported-module');
      const owners = diagramLinks(diagram, 'original-owner');
      const linkCount = (links: readonly DiagramLink[]) => `${links.filter(link => link.behavioral > 0).length}/${links.length}`;
      return [view.filter, coverageText(view.dependencyDiagram), integer(diagram.modules.length),
        integer(diagram.headline.behavioralDependencies), integer(diagram.headline.nonBehavioralDependencies),
        `${by('behavioral')}/${by('non-behavioral')}/${by('unknown')}`, linkCount(imported), linkCount(owners),
        `${diagram.boundaries.filter(fact => fact.status === 'denied').length}/${diagram.boundaries.filter(fact => fact.status === 'limited').length}`,
        integer(Buffer.byteLength(JSON.stringify(diagram), 'utf8'))];
    }), numeric(2, 9)));
  const productionDiagram = valueOf(production.dependencyDiagram);
  if (productionDiagram) {
    for (const projection of ['imported-module', 'original-owner'] as const) {
      section(`### Production ${projection} links`,
        `Counts are ${projection === 'imported-module' ? 'used originals via the boundary' : 'distinct (consumer, original) dependencies'}; status precedence is denied, limited, allowed.\n`,
        table(['Consumer', projection === 'imported-module' ? 'Imported module' : 'Original owner', 'Behavioral', 'Non-behavioral', 'Status'],
          diagramLinks(productionDiagram, projection).map(link => [code(link.consumer), code(link.provider), integer(link.behavioral),
            integer(link.nonBehavioral), link.status]), [2, 3]));
    }
  }

  // 5. Contract breadth and repository interface use.
  for (const view of views) {
    section(`## Contract breadth: ${view.filter}`,
      'Exact-owner boundary breadth over all loads. Selected symbols are distinct (original, exported name) pairs.\n',
      table(['Owner', 'Out: occurrences', 'Out: symbols', 'Out: consumer files', 'Out: provider files', 'Out: file pairs',
        'In: occurrences', 'In: symbols', 'In: consumer files', 'In: provider files', 'In: file pairs'],
      view.owners.map(owner => {
        const metric = owner.exact.all;
        return [code(owner.owner), ...(['outgoing', 'incoming'] as const).flatMap(side => [
          cell(metric, v => integer(v[side].occurrences)), cell(metric, v => integer(v[side].selectedSymbols)),
          cell(metric, v => integer(v[side].consumerFiles)), cell(metric, v => integer(v[side].providerFiles)),
          cell(metric, v => integer(v[side].filePairs))])];
      }), numeric(1, 10)));
  }
  const useRow = (owner: OwnerMetrics, destination: string, capability: string) =>
    cell(owner.interfaceUse, v => {
      const row = v.rows.find(item => item.destination === destination && item.capability === capability)!;
      return fraction(row.repositoryInterfaceUse);
    });
  section('## Repository interface use',
    'Selected exposed owned originals / exposed owned originals, by exposure destination and capability. This is repository-local use, not unused API:',
    `omitted declared nested trees (${provenance.omittedScopes.map(code).join(', ') || 'none'}) and external package consumers are absent.\n`,
    ...views.map(view => `### ${view.filter}\n\n` + table(['Owner', 'Parent: value', 'Parent: type-only', 'Descendants: value', 'Descendants: type-only', 'Any destination: any capability'],
      view.owners.map(owner => [code(owner.owner), useRow(owner, 'parent', 'value'), useRow(owner, 'parent', 'type-only'),
        useRow(owner, 'descendants', 'value'), useRow(owner, 'descendants', 'type-only'), useRow(owner, 'any', 'any')]), numeric(1, 5))));

  // 6. Connectedness and context size.
  section('## Internal connectedness: production',
    'Undirected same-owner file graph over production files. Entry files, shims and public interfaces can be legitimate isolates.\n',
    table(['Owner', 'Files', 'Components', 'Largest component', 'Coverage', 'Isolates'],
      production.owners.map(owner => [code(owner.owner), cell(owner.connectedness, v => integer(v.files)),
        cell(owner.connectedness, v => integer(v.components)), cell(owner.connectedness, v => integer(v.largestComponentFiles)),
        cell(owner.connectedness, v => fraction(v.largestComponentCoverage)),
        cell(owner.connectedness, v => v.isolates.map(isolate => `${code(isolate.path)} (${[
          isolate.declarationFile ? 'declaration' : null, isolate.interfaceFile ? 'interface' : null,
          `exposed ${isolate.exposedOriginals ?? 'n/a'}`, `in ${isolate.incomingOccurrences}`, `out ${isolate.outgoingOccurrences}`,
        ].filter(Boolean).join(', ')})`).join('; ') || 'none')]), numeric(1, 4)));
  for (const view of views) {
    section(`## Context size: ${view.filter}`,
      'Owned source files and bytes, resources of the same classification, revision-bound module documentation, defined and exposed originals, and accesses from the counted files. Documentation is independent of the source filter.\n',
      table(['Owner', 'Scope', 'Source files', 'Source bytes', 'Resources', 'Resource bytes', 'Documentation files', 'Documentation bytes',
        'Originals', 'Exposed originals', 'Access occurrences'],
        view.owners.flatMap(owner => (['exact', 'subtree'] as const).map(scope => {
          const metric = owner.context[scope];
          const documentation = (field: 'files' | 'bytes') => cell(metric, value => 'state' in value.documentation
            ? `unavailable (${value.documentation.reason})`
            : field === 'files' ? integer(value.documentation.files) : bytes(value.documentation.bytes));
          return [code(owner.owner), scope, cell(metric, v => integer(v.sourceFiles)), cell(metric, v => bytes(v.sourceBytes)),
            cell(metric, v => integer(v.resourceFiles)), cell(metric, v => bytes(v.resourceBytes)), documentation('files'), documentation('bytes'),
            cell(metric, v => integer(v.originals)),
            cell(metric, v => v.exposedOriginals === null ? 'n/a' : integer(v.exposedOriginals)), cell(metric, v => integer(v.accessOccurrences))];
        })), numeric(2, 10)));
  }

  // 7. Change affinity.
  if (evaluation.changeAffinity) out.push(renderAffinity(evaluation.changeAffinity, tree));

  // 8. Ranked evidence.
  out.push(renderRanked(evaluation, production, tree));
  return out.join('\n\n');
}

function directionText(direction: StabilityDirection): string {
  return direction === 'undefined' ? 'undefined' : direction.replace(/-/g, ' ');
}
interface DiagramLink {
  readonly consumer: string;
  readonly provider: string;
  readonly behavioral: number;
  readonly nonBehavioral: number;
  readonly status: 'allowed' | 'limited' | 'denied';
}
/** Known links of one endpoint projection, by consumer then provider; unknown units and self-links are omitted. */
function diagramLinks(diagram: DependencyDiagramFacts, projection: 'imported-module' | 'original-owner'): DiagramLink[] {
  const rank = { allowed: 0, limited: 1, denied: 2 } as const;
  const order = ['behavioral', 'unknown', 'non-behavioral'];
  const units = new Map<string, { consumer: string; provider: string; classification: string; status: DiagramLink['status'] }>();
  for (const fact of diagram.boundaries) {
    const provider = projection === 'imported-module' ? fact.importedModule : fact.originalOwner;
    if (provider === fact.consumer) continue;
    const key = JSON.stringify([fact.consumer, provider, fact.original.kind, fact.originalFiles, fact.original.binding]);
    const unit = units.get(key) ?? { consumer: fact.consumer, provider, classification: fact.classification, status: fact.status };
    if (order.indexOf(fact.classification) < order.indexOf(unit.classification)) unit.classification = fact.classification;
    if (rank[fact.status] > rank[unit.status]) unit.status = fact.status;
    units.set(key, unit);
  }
  const links = new Map<string, { consumer: string; provider: string; behavioral: number; nonBehavioral: number; status: DiagramLink['status'] }>();
  for (const unit of units.values()) {
    if (unit.classification === 'unknown') continue;
    const key = JSON.stringify([unit.consumer, unit.provider]);
    const link = links.get(key) ?? { consumer: unit.consumer, provider: unit.provider, behavioral: 0, nonBehavioral: 0, status: 'allowed' };
    if (unit.classification === 'behavioral') link.behavioral++;
    else link.nonBehavioral++;
    if (rank[unit.status] > rank[link.status]) link.status = unit.status;
    links.set(key, link);
  }
  return [...links.values()].sort((left, right) => utf8Order(left.consumer, right.consumer) || utf8Order(left.provider, right.provider));
}

function coverageText(metric: Metric<unknown>): string {
  if (metric.state === 'measured') return 'measured';
  if (metric.state === 'unavailable') return `unavailable (${metric.reason})`;
  const { coverage } = metric;
  return `partial: ${coverage.unknownDependencies} unknown, ${coverage.unattributedAccesses} unattributed, ${coverage.limitIds.length} limits`;
}

function renderAffinity(affinity: ChangeAffinityReport, tree: Tree): string {
  const { history, thresholds, commits } = affinity;
  return [
    '## Change affinity',
    `Repository-history evidence with its own provenance, over the ${affinity.filter} subset under ${affinity.ownership} ownership.`
      + ' Affinity is the Jaccard ratio shared / commits changing either owner. Insufficient samples keep their raw counts and are not design signals.\n',
    table(['Fact', 'Value'], [
      ['History head', code(history.head)], ['Range', code(history.range)], ['First parent only', String(history.firstParent)],
      ['Merges', history.merges], ['Project directory', code(history.projectDirectory)],
      ['Minimum owner commits', integer(thresholds.minOwnerCommits)], ['Minimum shared commits', integer(thresholds.minSharedCommits)],
      ['Maximum owners per commit', thresholds.maxOwnersPerCommit === null ? 'disabled' : integer(thresholds.maxOwnersPerCommit)],
      ['Explicitly excluded commits', thresholds.excludedCommits.map(code).join(', ') || 'none'],
      ['Examined commits', integer(commits.examined)], ['Sampled commits (at least one owner)', integer(commits.sampled)],
      ['Excluded as broad', integer(commits.excludedBroad)], ['Excluded explicitly', integer(commits.excludedExplicit)],
      ['Distinct unmapped paths in retained commits', integer(affinity.unmappedPaths)],
    ]),
    '### Owner change counts\n',
    table(['Owner', 'Sampled commits', 'Sufficient'], affinity.owners.map(owner => [code(owner.owner), integer(owner.commits), owner.sufficient ? 'yes' : 'no']), [1]),
    '### Owner pairs with a shared commit\n',
    table(['First', 'Second', 'Relation', 'Shared', 'Affinity', 'Sufficient'],
      affinity.pairs.map(pair => [code(pair.first), code(pair.second), tree.relation(pair.first, pair.second), integer(pair.shared),
        fraction(pair.affinity), pair.sufficient ? 'yes' : 'no (insufficient sample)']), [3, 4]),
  ].join('\n\n');
}

interface Ranked { readonly id: string; readonly measure: number; readonly cells: readonly string[] }
function ranked(title: string, measure: string, reading: string, headers: readonly string[], rows: readonly Ranked[]): string {
  const ordered = [...rows].filter(row => row.measure > 0)
    .sort((left, right) => right.measure - left.measure || utf8Order(left.id, right.id)).slice(0, rankedRows);
  return `### ${title}\n\nOrdered by ${measure}, descending, ties by id; at most ${rankedRows} rows with a nonzero measure. ${reading}\n\n`
    + table(headers, ordered.map(row => row.cells), [1]);
}

function renderRanked(evaluation: ModularityEvaluation, view: ModularityView, tree: Tree): string {
  const parts = ['## Ranked evidence',
    'Production view. Each table ranks by one named measure; the reading column states the owner\'s structural position or the edge\'s relation, read from the tree and edges rather than from a declared role. Rankings prompt review; none is a score.'];
  const label = (metric: Metric<unknown>) => metric.state === 'partial' ? ' (partial, lower bound)' : '';

  parts.push(ranked('Outgoing cross-owner occurrences', 'exact-owner outgoing occurrences (all loads)',
    'A composition parent\'s fan-out to its descendants is expected; compare its subtree locality.',
    ['Owner', 'Outgoing occurrences', 'Exact locality', 'Subtree locality', 'Reading'],
    view.owners.map(owner => {
      const exact = valueOf(owner.exact.all);
      const subtree = valueOf(owner.subtree.all);
      return { id: owner.owner, measure: exact?.outgoing.occurrences ?? 0, cells: [code(owner.owner),
        `${integer(exact?.outgoing.occurrences ?? 0)}${label(owner.exact.all)}`, exact ? fraction(exact.locality) : 'unavailable',
        subtree ? fraction(subtree.locality) : 'unavailable', position(view, tree, owner.owner)] };
    })));

  parts.push(ranked('Edge contract breadth', 'distinct selected symbols of the edge (all loads)',
    'Broad parent-to-child contracts are composition; broad unrelated or upward contracts deserve ownership review.',
    ['Edge', 'Selected symbols', 'Occurrences', 'File pairs', 'Reading'],
    view.edges.map(edge => {
      const all = valueOf(edge.breadth.all);
      return { id: `${edge.consumer}\0${edge.provider}`, measure: all?.selectedSymbols ?? 0, cells: [`${code(edge.consumer)} → ${code(edge.provider)}`,
        `${integer(all?.selectedSymbols ?? 0)}${label(edge.breadth.all)}`, integer(all?.occurrences ?? 0), integer(all?.filePairs ?? 0), edgeReading(edge, tree)] };
    })));

  parts.push(ranked('Edges toward less stable providers', 'edge occurrences (all loads) among edges whose all-loads direction is toward volatile',
    'The report flags nothing: a stable consumer depending on a more volatile provider matters only when it conflicts with the intended role.',
    ['Edge', 'Occurrences', 'Runtime direction', 'Reading'],
    view.edges.filter(edge => edge.direction.all === 'toward-volatile').map(edge => {
      const all = valueOf(edge.breadth.all);
      return { id: `${edge.consumer}\0${edge.provider}`, measure: all?.occurrences ?? 0, cells: [`${code(edge.consumer)} → ${code(edge.provider)}`,
        `${integer(all?.occurrences ?? 0)}${label(edge.breadth.all)}`, directionText(edge.direction.runtime), edgeReading(edge, tree)] };
    })));

  parts.push(ranked('Behavioral dependencies', 'behavioral dependencies of the consumer owner',
    'Behavioral dependencies use behavior-capable symbols of other owners; a composition owner is expected to have many.',
    ['Owner', 'Behavioral', 'Non-behavioral', 'Reading'],
    view.owners.map(owner => {
      const value = valueOf(owner.behavior);
      return { id: owner.owner, measure: value?.behavioralDependencies ?? 0, cells: [code(owner.owner),
        `${integer(value?.behavioralDependencies ?? 0)}${label(owner.behavior)}`, integer(value?.nonBehavioralDependencies ?? 0), position(view, tree, owner.owner)] };
    })));

  parts.push(ranked('Exposed originals without repository selection', 'exposed owned originals not selected by another owner (any destination and capability)',
    `Candidates for manual contract review, not deletion: omitted declared nested trees (${evaluation.modularity.provenance.omittedScopes.map(code).join(', ') || 'none'}) and package consumers are absent.`,
    ['Owner', 'Unselected exposed originals', 'Repository interface use', 'Reading'],
    view.owners.map(owner => {
      const any = valueOf(owner.interfaceUse)?.rows.find(row => row.destination === 'any' && row.capability === 'any');
      return { id: owner.owner, measure: any ? any.exposedOriginals - any.selectedOriginals : 0, cells: [code(owner.owner),
        `${integer(any ? any.exposedOriginals - any.selectedOriginals : 0)}${label(owner.interfaceUse)}`, any ? fraction(any.repositoryInterfaceUse) : 'unavailable',
        position(view, tree, owner.owner)] };
    })));

  parts.push(ranked('Subtree context size', 'subtree source bytes',
    'The source an agent may need to read to work across the subtree; large exact size inside a small subtree share suggests a split to review.',
    ['Owner', 'Subtree source bytes', 'Subtree files', 'Exact source bytes', 'Reading'],
    view.owners.map(owner => {
      const subtree = valueOf(owner.context.subtree);
      const exact = valueOf(owner.context.exact);
      return { id: owner.owner, measure: subtree?.sourceBytes ?? 0, cells: [code(owner.owner),
        `${bytes(subtree?.sourceBytes ?? 0)}${label(owner.context.subtree)}`, integer(subtree?.sourceFiles ?? 0), bytes(exact?.sourceBytes ?? 0),
        position(view, tree, owner.owner)] };
    })));

  parts.push(ranked('Files outside the largest connected component', 'production files outside the largest same-owner component',
    'Declaration shims, entry files and interfaces are legitimate isolates; other disconnected files may belong to another owner.',
    ['Owner', 'Files outside', 'Isolates', 'Reading'],
    view.owners.map(owner => {
      const value = valueOf(owner.connectedness);
      return { id: owner.owner, measure: value ? value.files - value.largestComponentFiles : 0, cells: [code(owner.owner),
        `${integer(value ? value.files - value.largestComponentFiles : 0)}${label(owner.connectedness)}`,
        value?.isolates.map(isolate => `${code(isolate.path)}${isolate.declarationFile ? ' (declaration)' : isolate.interfaceFile ? ' (interface)' : ''}`).join('; ') || 'none',
        position(view, tree, owner.owner)] };
    })));

  const affinity = evaluation.changeAffinity;
  if (affinity) {
    parts.push(ranked('Change affinity among sufficient pairs', 'Jaccard change affinity',
      'Parent and child owners change together while being built; affinity alone does not argue for a merge. Insufficient pairs are excluded here and listed above.',
      ['Pair', 'Affinity', 'Shared commits', 'Relation'],
      affinity.pairs.filter(pair => pair.sufficient).map(pair => ({ id: `${pair.first}\0${pair.second}`, measure: pair.affinity.value ?? 0,
        cells: [`${code(pair.first)}, ${code(pair.second)}`, fraction(pair.affinity), integer(pair.shared), tree.relation(pair.first, pair.second)] }))));
  }
  return parts.join('\n\n');
}

const boundaryChangeRows = 50;

function renderBoundaryChanges(changes: BoundaryChanges): string {
  const kinds = (['became-cross-owner', 'became-same-owner', 'changed-owners'] as const)
    .map(kind => `${kind} ${integer(changes.changes.filter(change => change.change === kind).length)}`).join(', ');
  const shown = changes.changes.slice(0, boundaryChangeRows);
  return [
    '## Boundary changes',
    `Application occurrences whose (consumer, provider) differs from declared ownership, in both source filters, ordered by access id: ${integer(changes.total)} in total`
      + `${changes.truncated ? `; the report lists only the first ${integer(changes.changes.length)} (truncated)` : ''}.`
      + ` Listed by kind: ${kinds}${changes.truncated ? ' (listed changes only)' : ''}.`
      + (shown.length < changes.changes.length ? ` The table shows the first ${boundaryChangeRows}; the JSON lists the rest.` : '') + '\n',
    table(['Access', 'Filter', 'Loads', 'Importer', 'Target', 'Declared', 'Candidate', 'Change'], shown.map(change => [
      code(change.accessId), change.filter, change.runtimeLoad ? 'runtime' : 'type-only', code(change.importer), code(change.target),
      `${code(change.declared.consumer)} → ${code(change.declared.provider)}`, `${code(change.candidate.consumer)} → ${code(change.candidate.provider)}`,
      change.change])),
  ].join('\n\n');
}

type Preferred = 'higher' | 'lower' | null;
type Verdict = 'improves' | 'worsens' | 'unchanged' | 'differs' | 'not comparable';
interface Reading { readonly value: number | null; readonly text: string; readonly partial: boolean }
interface ComparedMeasure {
  readonly name: string;
  readonly preferred: Preferred;
  read(evaluation: ModularityEvaluation): Reading;
}

const unavailableReading = (metric: Metric<unknown>): Reading =>
  ({ value: null, text: metric.state === 'unavailable' ? `unavailable (${metric.reason})` : 'unavailable', partial: false });
function countOf<T>(metric: Metric<T>, pick: (value: T) => number): Reading {
  const value = valueOf(metric);
  if (value === null) return unavailableReading(metric);
  const count = pick(value);
  return { value: count, text: integer(count), partial: metric.state === 'partial' };
}
function ratioOf<T>(metric: Metric<T>, pick: (value: T) => Ratio): Reading {
  const value = valueOf(metric);
  if (value === null) return unavailableReading(metric);
  const picked = pick(value);
  return { value: picked.value, text: fraction(picked), partial: metric.state === 'partial' };
}
function verdict(preferred: Preferred, declared: Reading, candidate: Reading): Verdict {
  if (declared.value === null || candidate.value === null) return 'not comparable';
  if (declared.value === candidate.value) return 'unchanged';
  if (preferred === null) return 'differs';
  return (candidate.value > declared.value) === (preferred === 'higher') ? 'improves' : 'worsens';
}
const readingCell = (reading: Reading): string => `${reading.text}${reading.partial ? ' (partial, lower bound)' : ''}`;
const productionOf = (evaluation: ModularityEvaluation) => evaluation.modularity.views.find(view => view.filter === 'production')!;
const testOf = (evaluation: ModularityEvaluation) => evaluation.modularity.views.find(view => view.filter === 'test')!;
const cyclesOf = (kind: 'runtime' | 'type-only', pick: (members: number) => number) =>
  (metric: Metric<readonly CycleComponent[]>) => countOf(metric, components =>
    components.filter(component => component.kind === kind).reduce((sum, component) => sum + pick(component.members.length), 0));

const comparedMeasures: readonly ComparedMeasure[] = [
  { name: 'Production exact locality (all loads)', preferred: 'higher', read: item => ratioOf(productionOf(item).summary.all, v => v.exactLocality) },
  { name: 'Production exact locality (runtime)', preferred: 'higher', read: item => ratioOf(productionOf(item).summary.runtime, v => v.exactLocality) },
  { name: 'Production cross-owner occurrences (all loads)', preferred: 'lower', read: item => countOf(productionOf(item).summary.all, v => v.crossOwnerOccurrences) },
  { name: 'Production cross-owner occurrences (runtime)', preferred: 'lower', read: item => countOf(productionOf(item).summary.runtime, v => v.crossOwnerOccurrences) },
  { name: 'Production edges (all loads)', preferred: 'lower', read: item => countOf(productionOf(item).summary.all, v => v.edges) },
  { name: 'Production edges (runtime)', preferred: 'lower', read: item => countOf(productionOf(item).summary.runtime, v => v.edges) },
  { name: 'Production owners with source files', preferred: null, read: item => countOf(productionOf(item).summary.all, v => v.owners) },
  { name: 'Production runtime cycle components', preferred: 'lower', read: item => cyclesOf('runtime', () => 1)(productionOf(item).cycles) },
  { name: 'Owners in production runtime cycle components', preferred: 'lower', read: item => cyclesOf('runtime', size => size)(productionOf(item).cycles) },
  { name: 'Production type-only cycle components', preferred: 'lower', read: item => cyclesOf('type-only', () => 1)(productionOf(item).cycles) },
  { name: 'Owners in production type-only cycle components', preferred: 'lower', read: item => cyclesOf('type-only', size => size)(productionOf(item).cycles) },
  { name: 'Production behavioral dependencies', preferred: 'lower', read: item => countOf(productionOf(item).behavior, v => v.behavioralDependencies) },
  { name: 'Production non-behavioral dependencies', preferred: 'lower', read: item => countOf(productionOf(item).behavior, v => v.nonBehavioralDependencies) },
  { name: 'Test exact locality (all loads)', preferred: 'higher', read: item => ratioOf(testOf(item).summary.all, v => v.exactLocality) },
  { name: 'Test cross-owner occurrences (all loads)', preferred: 'lower', read: item => countOf(testOf(item).summary.all, v => v.crossOwnerOccurrences) },
  { name: 'Sufficient change-affinity pairs', preferred: null, read: item => item.changeAffinity
    ? { value: item.changeAffinity.pairs.filter(pair => pair.sufficient).length,
      text: integer(item.changeAffinity.pairs.filter(pair => pair.sufficient).length), partial: false }
    : { value: null, text: 'no history', partial: false } },
];

interface OwnerMeasure { readonly name: string; readonly preferred: Preferred; read(owner: OwnerMetrics): Reading }
const ownerMeasures: readonly OwnerMeasure[] = [
  { name: 'exact locality (all loads)', preferred: 'higher', read: owner => ratioOf(owner.exact.all, v => v.locality) },
  { name: 'outgoing occurrences', preferred: 'lower', read: owner => countOf(owner.exact.all, v => v.outgoing.occurrences) },
  { name: 'provider owners', preferred: 'lower', read: owner => countOf(owner.exact.all, v => v.outgoing.modules) },
  { name: 'outgoing selected symbols', preferred: 'lower', read: owner => countOf(owner.exact.all, v => v.outgoing.selectedSymbols) },
  { name: 'outgoing file pairs', preferred: 'lower', read: owner => countOf(owner.exact.all, v => v.outgoing.filePairs) },
  { name: 'incoming selected symbols (contract surface)', preferred: 'lower', read: owner => countOf(owner.exact.all, v => v.incoming.selectedSymbols) },
  { name: 'consumer owners', preferred: null, read: owner => countOf(owner.exact.all, v => v.incoming.modules) },
  { name: 'exact source bytes', preferred: null, read: owner => countOf(owner.context.exact, v => v.sourceBytes) },
];

/** Owners whose production files differ, that exist under only one ownership, or that a listed boundary change names. */
function changedOwners(declared: ModularityEvaluation, candidate: ModularityEvaluation): string[] {
  const before = new Map(productionOf(declared).owners.map(owner => [owner.owner, owner]));
  const after = new Map(productionOf(candidate).owners.map(owner => [owner.owner, owner]));
  const size = (owner: OwnerMetrics | undefined) => {
    const value = owner ? valueOf(owner.context.exact) : null;
    return value ? JSON.stringify([value.sourceFiles, value.sourceBytes, value.resourceFiles, value.resourceBytes]) : null;
  };
  const changed = new Set<string>();
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (!before.has(id) || !after.has(id) || size(before.get(id)) !== size(after.get(id))) changed.add(id);
  }
  for (const change of candidate.modularity.boundaryChanges?.changes ?? []) {
    if (change.filter !== 'production') continue;
    for (const id of [change.declared.consumer, change.declared.provider, change.candidate.consumer, change.candidate.provider]) changed.add(id);
  }
  return [...changed].sort(utf8Order);
}

function renderComparison(document: ModularityDocument): string {
  const { declared, candidates } = document;
  const id = (candidate: ModularityEvaluation) => code(candidate.modularity.provenance.candidateId ?? '');
  const parts = ['## Comparison: declared and candidate ownership',
    'Every evaluation derives from the same analysis report and history. Each row is one measure; measures are never combined, and no candidate is ranked.'
      + ' A verdict compares one candidate with declared ownership in the direction the decision rule of the'
      + ' [project modularity analysis](../../../../docs/analysis/2026-09-17-project-modularity-analysis.md#decision-rule) prefers:'
      + ' `improves`, `worsens` or `unchanged`; `differs` marks a measure without a preferred direction and `not comparable` an unavailable value.'
      + ' Partial values are lower bounds, so their verdicts are provisional. Repository interface use and exposed originals are unavailable under candidate ownership;'
      + ' compare contract breadth instead.\n'];
  const verdicts = new Map<ModularityEvaluation, Map<Verdict, string[]>>(candidates.map(candidate => [candidate, new Map()]));
  const rows = comparedMeasures.map(measure => {
    const base = measure.read(declared);
    return [measure.name, measure.preferred ?? 'none', readingCell(base), ...candidates.map(candidate => {
      const reading = measure.read(candidate);
      const result = verdict(measure.preferred, base, reading);
      const list = verdicts.get(candidate)!;
      list.set(result, [...(list.get(result) ?? []), measure.name]);
      return `${readingCell(reading)} (${result}${base.partial || reading.partial ? ', provisional' : ''})`;
    })];
  });
  rows.push(['Boundary changes (both filters)', 'none', 'not applicable', ...candidates.map(candidate => {
    const changes = candidate.modularity.boundaryChanges;
    return changes ? `${integer(changes.total)}${changes.truncated ? ` (listed ${integer(changes.changes.length)}, truncated)` : ''}` : 'not applicable';
  })]);
  parts.push(table(['Measure', 'Preferred', 'Declared', ...candidates.map(id)], rows));

  for (const candidate of candidates) {
    const list = verdicts.get(candidate)!;
    const names = (kind: Verdict) => (list.get(kind) ?? []).join('; ') || 'none';
    parts.push(`### Tradeoffs of candidate ${id(candidate)}`,
      'Improvements and regressions are both retained for review; they are not netted against each other.\n',
      table(['Verdict', 'Measures'], [['improves', names('improves')], ['worsens', names('worsens')], ['unchanged', names('unchanged')],
        ['differs (no preferred direction)', names('differs')], ['not comparable', names('not comparable')]]));

    const before = new Map(productionOf(declared).owners.map(owner => [owner.owner, owner]));
    const after = new Map(productionOf(candidate).owners.map(owner => [owner.owner, owner]));
    const ownerRows = changedOwners(declared, candidate).flatMap(owner => ownerMeasures.map(measure => {
      const base = before.has(owner) ? measure.read(before.get(owner)!) : { value: null, text: 'absent', partial: false };
      const reading = after.has(owner) ? measure.read(after.get(owner)!) : { value: null, text: 'absent', partial: false };
      const result = verdict(measure.preferred, base, reading);
      return [code(owner), measure.name, readingCell(base), readingCell(reading), `${result}${base.partial || reading.partial ? ' (provisional)' : ''}`];
    }));
    parts.push(`### Changed owners of candidate ${id(candidate)}: production boundary breadth`,
      'Exact-owner boundaries over all loads for owners whose production files differ, that exist under only one ownership, or that a listed production boundary change names.'
        + ' A split or merge moves occurrences between owners, so read these rows with the project measures above.\n',
      table(['Owner', 'Measure', 'Declared', 'Candidate', 'Verdict'], ownerRows, [2, 3]));
  }
  return parts.join('\n\n');
}
