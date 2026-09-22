import { isWithin, type ModuleTree, type ViewIdentity } from '../interfaces/protocol/evidence.js';
import {
  runQueryLimits,
  type InitialAssociation, type ModuleCapabilities, type ModuleCapabilityComparisonResponse, type ModuleCapabilityRow,
} from '../interfaces/protocol/runs.js';
import type { ModuleProposal } from '../run/records.js';
import type { RunView } from './inputs.js';
import { capabilityProgressOf } from './progress.js';

/*
 * Which capabilities the initial analysis associated with each module, and
 * which are verified at their current owner now. It is a pure function of
 * one committed run view, one current module tree and the coverage limits
 * the analysis submission recorded; the query adapter reads all three.
 *
 * - The initial layer is revision 1: every entry assignment's owner, every
 *   revision-1 hypothesis's suggested owner and involved modules. Later
 *   revisions and placement decisions never rewrite it, and anticipated
 *   consumers are not associations.
 * - The implemented layer is the complete capability progress: only a
 *   registered, currently `completed` capability is implemented, at its
 *   current owner. A reopened capability is `working`, and a forecast never
 *   completes.
 * - Identical slugs are one capability (`exact-capability-slug/1`).
 * - Where a module is drawn is decided here and nowhere else, and so is
 *   every statement of coverage. An unknown is a gap, never a zero.
 */

/** What the analysis submission recorded about its own coverage, or why it cannot be read. */
export type AnalysisCoverageLimits =
  | { readonly limits: readonly string[] }
  | { readonly unreadable: string };

interface Association {
  readonly capability: string;
  readonly module: string;
  readonly association: InitialAssociation;
}

/** The comparison of one run at its committed version over one current tree. */
export function moduleCapabilityComparisonOf(
  view: RunView,
  tree: ModuleTree,
  analysisLimits: AnalysisCoverageLimits,
): ModuleCapabilityComparisonResponse {
  const runVersion = view.entries.at(-1)?.sequence ?? 0;
  const base = { identityPolicy: 'exact-capability-slug/1' as const, runVersion, tree };
  const assignments = view.entryAssignments;
  if (assignments === null) {
    const accepted = view.events.some(event => event.type === 'analysis-accepted');
    return {
      ...base,
      initialView: null,
      modules: [],
      coverage: {
        state: 'unavailable',
        reason: accepted
          ? 'The initial analysis was accepted, but its entry assignments cannot be read from the run.'
          : 'The initial analysis is pending: there is nothing to compare yet.',
      },
    };
  }

  // The initial layer: revision 1 only, in assignment order, then hypothesis
  // record order.
  const associations: Association[] = [];
  const order: string[] = [];
  const discover = (capability: string) => {
    if (!order.includes(capability)) order.push(capability);
  };
  const proposals = new Map<string, ModuleProposal[]>();
  const proposing = new Map<string, string[]>();
  for (const entry of assignments.entries) {
    discover(entry.capability);
    associations.push({ capability: entry.capability, module: entry.owner, association: { role: 'entry-owner', hypothesis: null } });
    if (entry.proposed !== undefined) {
      proposals.set(entry.owner, [...(proposals.get(entry.owner) ?? []), entry.proposed]);
      proposing.set(entry.owner, [...(proposing.get(entry.owner) ?? []), entry.capability]);
    }
  }
  for (const { body: hypothesis } of view.hypothesisRevisions) {
    if (hypothesis.revision !== 1) continue;
    discover(hypothesis.capability);
    const made = { role: 'suggested-owner' as const, hypothesis: hypothesis.id };
    associations.push({ capability: hypothesis.capability, module: hypothesis.suggestedOwner, association: made });
    for (const module of hypothesis.involvedModules) {
      associations.push({ capability: hypothesis.capability, module, association: { role: 'involved', hypothesis: hypothesis.id } });
    }
  }

  // The implemented layer, from the complete progress before any response slice.
  const implemented = new Map<string, { module: string; reason: string; evidence: string[] }>();
  for (const row of capabilityProgressOf(view)) {
    if (row.tentative || row.state !== 'completed') continue;
    discover(row.capability);
    implemented.set(row.capability, { module: row.owner, reason: row.reason, evidence: [...row.evidence] });
  }

  // Each capability's rows, one per module, each association once.
  const rowsOf = new Map<string, Map<string, ModuleCapabilityRow>>();
  const rowFor = (capability: string, module: string): ModuleCapabilityRow => {
    const byModule = rowsOf.get(capability) ?? new Map<string, ModuleCapabilityRow>();
    rowsOf.set(capability, byModule);
    const existing = byModule.get(module);
    if (existing !== undefined) return existing;
    const row: ModuleCapabilityRow = { capability, initial: [], implementedHere: null };
    byModule.set(module, row);
    return row;
  };
  for (const { capability, module, association } of associations) {
    const row = rowFor(capability, module);
    if (!row.initial.some(known => known.role === association.role && known.hypothesis === association.hypothesis)) row.initial.push(association);
  }
  for (const [capability, here] of implemented) {
    rowFor(capability, here.module).implementedHere = { reason: here.reason, evidence: here.evidence };
  }

  // The bounds: capabilities in capability order, each kept with all of its
  // rows or dropped with every capability after it.
  const gaps: string[] = [];
  let kept = 0;
  let rows = 0;
  for (const capability of order) {
    const count = rowsOf.get(capability)?.size ?? 0;
    const bound = kept + 1 > runQueryLimits.capabilities
      ? `capabilities (${runQueryLimits.capabilities})`
      : rows + count > runQueryLimits.moduleCapabilityRows ? `moduleCapabilityRows (${runQueryLimits.moduleCapabilityRows})` : null;
    if (bound !== null) {
      gaps.push(`The ${bound} bound returned ${kept} of ${order.length} capabilities and ${rows} of ${[...rowsOf.values()].reduce((sum, byModule) => sum + byModule.size, 0)} rows; omitted capabilities are not shown, and knownImplemented is a lower bound because capabilities first discovered during the run come last and are dropped first.`);
      break;
    }
    kept += 1;
    rows += count;
  }
  const retained = order.slice(0, kept);
  const retainedSet = new Set(retained);

  // Recorded coverage limits: the view the analysis worked from, and the
  // analysis submission's own statement.
  for (const limit of viewLimits(assignments.view)) gaps.push(`The architect view the initial analysis worked from reports: ${limit}`);
  if ('unreadable' in analysisLimits) gaps.push(`The initial analysis's own coverage limits cannot be read: ${analysisLimits.unreadable}`);
  else for (const limit of analysisLimits.limits) gaps.push(`The initial analysis reports: ${limit}`);

  // Where each module is drawn.
  const declared = tree.status === 'available' ? tree.modules.map(entry => entry.module) : [];
  const declaredSet = new Set(declared);
  const agreed = new Map<string, ModuleProposal>();
  const conflicting = new Set<string>();
  for (const [module, list] of proposals) {
    const [first, ...rest] = list;
    if (first !== undefined && rest.every(other => sameProposal(first, other))) agreed.set(module, first);
    else conflicting.add(module);
  }

  const referenced = new Set<string>();
  for (const capability of retained) for (const module of rowsOf.get(capability)?.keys() ?? []) referenced.add(module);
  for (const [module, capabilities] of proposing) if (capabilities.some(capability => retainedSet.has(capability))) referenced.add(module);

  const placedAsProposed = new Map<string, boolean>();
  const proposable = (module: string, visiting: Set<string>): boolean => {
    if (tree.status !== 'available' || declaredSet.has(module)) return false;
    const known = placedAsProposed.get(module);
    if (known !== undefined) return known;
    const proposal = agreed.get(module);
    let placed = false;
    if (proposal !== undefined && !visiting.has(module)) {
      visiting.add(module);
      placed = declaredSet.has(proposal.parent) || proposable(proposal.parent, visiting);
      visiting.delete(module);
    }
    placedAsProposed.set(module, placed);
    return placed;
  };
  const proposed = new Set<string>();
  const addProposed = (module: string) => {
    if (proposed.has(module)) return;
    proposed.add(module);
    const parent = agreed.get(module)!.parent;
    if (!declaredSet.has(parent)) addProposed(parent);
  };
  for (const module of referenced) if (proposable(module, new Set())) addProposed(module);

  const unplaced = [...referenced].filter(module => !declaredSet.has(module) && !proposed.has(module)).sort(byName);
  if (tree.status === 'unavailable') {
    gaps.push(`The current module tree is unavailable, so no module is placed: ${tree.message}`);
  } else {
    for (const module of unplaced) {
      gaps.push(conflicting.has(module)
        ? `Module ${module} is absent from the current tree, and the entries that propose it disagree, so it has no provisional place.`
        : agreed.has(module)
          ? `Module ${module} is absent from the current tree, and its proposed parent ${agreed.get(module)!.parent} is not placed.`
          : `Module ${module} is absent from the current tree and has no recorded proposed parent.`);
    }
  }
  for (const module of [...conflicting].filter(module => referenced.has(module) && declaredSet.has(module)).sort(byName)) {
    gaps.push(`Module ${module} is declared, but the entries that proposed it disagree, so what was proposed at start is not stated.`);
  }

  // Module order: the tree's, each proposed module after its parent's
  // subtree in name order, then the unplaced in name order.
  const ordered = [...declared];
  const depth = (module: string) => module.split('/').length;
  for (const module of [...proposed].sort((a, b) => depth(a) - depth(b) || byName(a, b))) {
    const parent = agreed.get(module)!.parent;
    let after = ordered.indexOf(parent);
    for (let index = after + 1; index < ordered.length; index += 1) if (isWithin(ordered[index]!, parent)) after = index;
    ordered.splice(after + 1, 0, module);
  }
  ordered.push(...unplaced);

  const modules: ModuleCapabilities[] = ordered.map(module => {
    const proposal = agreed.get(module);
    return {
      module,
      placement: declaredSet.has(module) ? 'declared' : proposed.has(module) ? 'proposed' : 'unplaced',
      proposedAtStart: proposal === undefined ? null : { parent: proposal.parent, purpose: proposal.purpose, tags: [...proposal.tags] },
      capabilities: retained.flatMap(capability => {
        const row = rowsOf.get(capability)?.get(module);
        return row === undefined ? [] : [row];
      }),
    };
  });

  const implementedCount = retained.filter(capability => implemented.has(capability)).length;
  return {
    ...base,
    initialView: assignments.view,
    modules,
    coverage: gaps.length === 0
      ? { state: 'complete', capabilities: retained.length, implemented: implementedCount }
      : {
          state: 'partial',
          knownCapabilities: retained.length,
          knownImplemented: implementedCount,
          totalCapabilities: kept < order.length ? order.length : null,
          gaps,
        },
  };
}

function viewLimits(view: ViewIdentity): readonly string[] {
  return view.status === 'materialized' ? view.coverageLimits : [];
}

function sameProposal(a: ModuleProposal, b: ModuleProposal): boolean {
  return a.parent === b.parent && a.directory === b.directory && a.purpose === b.purpose
    && a.tags.length === b.tags.length && a.tags.every((tag, index) => tag === b.tags[index]);
}

function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
