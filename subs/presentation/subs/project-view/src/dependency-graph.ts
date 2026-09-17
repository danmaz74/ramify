import type { ModuleId, OriginalId } from '../../../../analysis/subs/model/src/interfaces/model.js';
import type {
  DependencyDepthMode,
  DependencyGraphCount,
  DependencyGraphEdge,
  DependencyGraphImportedCount,
  DependencyGraphModel,
  DependencyGraphOriginalEdge,
  DependencyGraphState,
  DependencySettings,
} from './interfaces/dependency-view.js';
import type { ProjectExplorerModel } from './interfaces/project-view.js';
import type { ModuleTreeIndex } from './module-tree.js';

export const defaultDependencySettings: DependencySettings = Object.freeze({
  showNonBehavioral: false,
  depthMode: 'level',
  showOutsideScope: true,
});

export const idleDependencyGraph: DependencyGraphState = Object.freeze({
  data: null,
  phase: 'idle',
  reason: null,
  isStale: false,
});

/** The region the graph shows. */
export interface DependencyScope {
  /** The module whose own source the frame represents; null when there is none. */
  readonly frameModule: ModuleId | null;
  /** The scope's children before the class filter: its candidate nodes. */
  readonly nodes: readonly ModuleId[];
  /** The depth of `nodes`; an outside end maps to depth `depth - 1`. */
  readonly depth: number;
}

/** Where one end of an exact edge lands at a scope. */
export type ScopeEnd =
  | { readonly kind: 'node'; readonly module: ModuleId; readonly inScope: boolean }
  | { readonly kind: 'frame' };

/** One link drawn at the current scope, rolled up to that scope's nodes. */
export interface ActiveDependencyEdge {
  /** Scoped for a rolled-up link, the model's own edge ID in `exact` mode. */
  readonly id: string;
  readonly depthMode: DependencyDepthMode;
  /** The consuming node at this scope. */
  readonly consumer: ModuleId;
  /** The providing node at this scope. */
  readonly provider: ModuleId;
  /** Distinct behavioral `(consumer module, original)` pairs between the two subtrees. */
  readonly behavioral: number;
  /** Distinct non-behavioral pairs, drawn or not. */
  readonly nonBehavioral: number;
  /** The classified count the current setting displays. */
  readonly displayed: number;
  /** Behavioral when any behavioral pair supports the link; non-behavioral otherwise. Colour shows it. */
  readonly emphasis: 'behavioral' | 'non-behavioral';
  /** Denied, then limited, then allowed over all contributing evidence; settings never change it. */
  readonly status: 'allowed' | 'limited' | 'denied';
  /** One end is outside the scope's subtree; false when the scope covers the project. */
  readonly leavesScope: boolean;
  readonly coverageIds: readonly string[];
  /** The exact edges rolled into this link; exactly one in `exact` mode. */
  readonly sources: readonly DependencyGraphOriginalEdge[];
}

export const minimumLinkWidth = 1.5;
export const maximumLinkWidth = 6;

/** The identity of one original, as the view keys its evidence rows. */
export function originalIdentity(original: OriginalId): string {
  return JSON.stringify([original.kind, original.owner, original.file, original.binding]);
}

/**
 * The scope's frame and candidate nodes: the children of `scopeModuleId`; otherwise the root
 * module's children when exactly one top-level module has children; otherwise the top-level
 * modules. Independent of the class filter and of the settings.
 */
export function dependencyScope(model: ProjectExplorerModel, scopeModuleId: ModuleId | null): DependencyScope {
  const modulesById = new Map(model.modules.map((module) => [module.id, module]));
  const present = (ids: readonly ModuleId[]): ModuleId[] => ids.filter((id) => modulesById.has(id));
  if (scopeModuleId !== null && modulesById.has(scopeModuleId)) {
    return {
      frameModule: scopeModuleId,
      nodes: model.modules.filter((module) => module.parent === scopeModuleId).map((module) => module.id),
      depth: parentDepth(modulesById, scopeModuleId) + 1,
    };
  }
  const topLevel = model.modules.filter((module) => module.parent === null);
  const root = modulesById.get(model.rootModuleId);
  if (topLevel.length === 1 && root && root.children.length > 0) {
    return { frameModule: root.id, nodes: present(root.children), depth: parentDepth(modulesById, root.id) + 1 };
  }
  return {
    frameModule: null,
    nodes: topLevel.map((module) => module.id),
    depth: topLevel.length > 0 ? parentDepth(modulesById, topLevel[0]!.id) : 0,
  };
}

/**
 * Where an exact module lands at this scope. In `level` mode an end inside the scope becomes the
 * node containing it, the scope module's own source becomes the frame, and any other end becomes
 * its ancestor at depth `scope.depth - 1`, or itself when it is already at most that deep. In
 * `exact` mode every end is its own module and there is no frame.
 */
export function scopeEnd(module: ModuleId, scope: DependencyScope,
  depthMode: DependencyDepthMode, tree: ModuleTreeIndex): ScopeEnd {
  if (depthMode === 'exact') {
    const inScope = scope.frameModule === null || containedBy(tree, module, scope.frameModule);
    return { kind: 'node', module, inScope };
  }
  for (const node of scope.nodes) {
    if (containedBy(tree, module, node)) return { kind: 'node', module: node, inScope: true };
  }
  if (scope.frameModule !== null && module === scope.frameModule) return { kind: 'frame' };
  const outside = scope.depth - 1;
  return { kind: 'node', inScope: false,
    module: treeDepth(tree, module) <= outside ? module : ancestorAtDepth(tree, module, outside) };
}

/** True when every module maps to a node or the frame: nothing can leave. */
export function scopeCoversProject(scope: DependencyScope,
  modules: readonly ModuleId[], tree: ModuleTreeIndex): boolean {
  return modules.every((id) => (scope.frameModule !== null && containedBy(tree, id, scope.frameModule))
    || scope.nodes.some((node) => containedBy(tree, id, node)));
}

/**
 * The links of one scope, read from `originalOwnerEdges` only. An edge with a frame end or with
 * both ends on one node is internal at this scope and is drawn nowhere; an edge with no end among
 * the displayed nodes is dropped. The remaining edges group by their ordered node pair, and each
 * group's counts are its distinct `(exact consumer module, original)` pairs, never a sum.
 */
export function scopeDependencyLinks(input: {
  readonly model: DependencyGraphModel;
  readonly scope: DependencyScope;
  /** The class-filtered nodes actually drawn at this scope. */
  readonly displayed: ReadonlySet<ModuleId>;
  readonly tree: ModuleTreeIndex;
  readonly settings: DependencySettings;
}): ActiveDependencyEdge[] {
  const { model, scope, displayed, tree, settings } = input;
  const covers = scopeCoversProject(scope, [...tree.modulesById.keys()], tree);
  const groups = new Map<string, { consumer: ModuleId; provider: ModuleId; leavesScope: boolean;
    sources: DependencyGraphOriginalEdge[] }>();
  for (const edge of model.originalOwnerEdges) {
    const consumer = scopeEnd(edge.consumer, scope, settings.depthMode, tree);
    const provider = scopeEnd(edge.provider, scope, settings.depthMode, tree);
    if (consumer.kind === 'frame' || provider.kind === 'frame') continue;
    if (consumer.module === provider.module) continue;
    if (!displayed.has(consumer.module) && !displayed.has(provider.module)) continue;
    const key = JSON.stringify([consumer.module, provider.module]);
    const group = groups.get(key)
      ?? { consumer: consumer.module, provider: provider.module, leavesScope: false, sources: [] };
    group.leavesScope = group.leavesScope || (!covers && (!consumer.inScope || !provider.inScope));
    group.sources.push(edge);
    groups.set(key, group);
  }
  const result: ActiveDependencyEdge[] = [];
  for (const group of groups.values()) {
    if (group.leavesScope && !settings.showOutsideScope) continue;
    const sources = [...group.sources].sort((left, right) =>
      byteOrder(left.consumer, right.consumer) || byteOrder(left.provider, right.provider));
    const { behavioral, nonBehavioral } = countPairs(sources);
    const displayedCount = behavioral + (settings.showNonBehavioral ? nonBehavioral : 0);
    if (displayedCount === 0) continue;
    result.push({
      id: settings.depthMode === 'exact'
        ? sources[0]!.id
        : `scoped-link/1:level:${scope.frameModule ?? '-'}:${JSON.stringify([group.consumer, group.provider])}`,
      depthMode: settings.depthMode,
      consumer: group.consumer,
      provider: group.provider,
      behavioral,
      nonBehavioral,
      displayed: displayedCount,
      emphasis: behavioral > 0 ? 'behavioral' : 'non-behavioral',
      status: edgeStatus(sources),
      leavesScope: group.leavesScope,
      coverageIds: [...new Set(sources.flatMap((edge) => edge.evidence.flatMap((item) => item.coverageIds)))].sort(),
      sources,
    });
  }
  return result.sort((left, right) =>
    byteOrder(left.consumer, right.consumer) || byteOrder(left.provider, right.provider));
}

/** Distinct `(consumer module, original)` pairs, settled behavioral when any of their rows is. */
function countPairs(sources: readonly DependencyGraphOriginalEdge[]): DependencyGraphCount {
  const pairs = new Map<string, boolean>();
  for (const edge of sources) {
    for (const item of edge.evidence) {
      const key = JSON.stringify([edge.consumer, originalIdentity(item.original)]);
      pairs.set(key, (pairs.get(key) ?? false) || item.classification === 'behavioral');
    }
  }
  let behavioral = 0;
  let nonBehavioral = 0;
  for (const settled of pairs.values()) {
    if (settled) behavioral += 1;
    else nonBehavioral += 1;
  }
  return { behavioral, nonBehavioral };
}

export interface SubtreeDependencyCounts {
  readonly uses: DependencyGraphCount;
  readonly ownedUsedByOthers: DependencyGraphCount;
  readonly usedThrough: DependencyGraphImportedCount;
}

/** The measured totals of a module and all of its descendants. */
export function subtreeDependencyCounts(model: DependencyGraphModel,
  module: ModuleId, tree: ModuleTreeIndex): SubtreeDependencyCounts {
  const rows = model.modules.filter((row) => containedBy(tree, row.id, module));
  const add = (select: (row: DependencyGraphModel['modules'][number]) => number): number =>
    rows.reduce((sum, row) => sum + select(row), 0);
  return {
    uses: { behavioral: add((row) => row.uses.behavioral), nonBehavioral: add((row) => row.uses.nonBehavioral) },
    ownedUsedByOthers: { behavioral: add((row) => row.ownedUsedByOthers.behavioral),
      nonBehavioral: add((row) => row.ownedUsedByOthers.nonBehavioral) },
    usedThrough: { behavioralUsedOriginals: add((row) => row.usedThrough.behavioralUsedOriginals),
      nonBehavioralUsedOriginals: add((row) => row.usedThrough.nonBehavioralUsedOriginals) },
  };
}

/** The distinct pairs the given links carry. */
export function scopeLinkCounts(links: readonly ActiveDependencyEdge[]): DependencyGraphCount {
  return {
    behavioral: links.reduce((sum, link) => sum + link.behavioral, 0),
    nonBehavioral: links.reduce((sum, link) => sum + link.nonBehavioral, 0),
  };
}

/** Status precedence denied, limited, allowed over the per-original status of the edges' evidence. */
export function edgeStatus(edges: readonly DependencyGraphEdge[]): ActiveDependencyEdge['status'] {
  const evidence = edges.flatMap((edge) => edge.evidence);
  if (evidence.some((item) => item.status === 'denied')) return 'denied';
  if (evidence.some((item) => item.status === 'limited')) return 'limited';
  return 'allowed';
}

/** A bounded logarithmic width over the displayed classified count. */
export function linkWidth(displayed: number): number {
  const count = Math.max(1, displayed);
  return Math.min(maximumLinkWidth, minimumLinkWidth + Math.log2(count) * 1.1);
}

function byteOrder(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The module itself or one of its descendants. */
function containedBy(tree: ModuleTreeIndex, id: ModuleId, ancestor: ModuleId): boolean {
  let current: ModuleId | null = id;
  const visited = new Set<ModuleId>();
  while (current !== null && !visited.has(current)) {
    if (current === ancestor) return true;
    visited.add(current);
    current = tree.modulesById.get(current)?.parent ?? null;
  }
  return false;
}

function treeDepth(tree: ModuleTreeIndex, id: ModuleId): number {
  const known = tree.depth.get(id);
  if (known !== undefined) return known;
  let depth = 0;
  let current = tree.modulesById.get(id);
  const visited = new Set<ModuleId>();
  while (current?.parent != null && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = tree.modulesById.get(current.parent);
  }
  return depth;
}

function ancestorAtDepth(tree: ModuleTreeIndex, id: ModuleId, depth: number): ModuleId {
  let current = id;
  const visited = new Set<ModuleId>();
  while (treeDepth(tree, current) > depth && !visited.has(current)) {
    visited.add(current);
    const parent = tree.modulesById.get(current)?.parent ?? null;
    if (parent === null || !tree.modulesById.has(parent)) return current;
    current = parent;
  }
  return current;
}

function parentDepth(modulesById: ReadonlyMap<ModuleId, { readonly id: ModuleId;
  readonly parent: ModuleId | null }>, id: ModuleId): number {
  let depth = 0;
  let current = modulesById.get(id);
  const visited = new Set<ModuleId>();
  while (current?.parent != null && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = modulesById.get(current.parent);
  }
  return depth;
}
