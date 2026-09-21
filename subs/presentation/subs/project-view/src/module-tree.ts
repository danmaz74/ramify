import type { Point } from '../../layout/src/interfaces/layout.js';
import { placeTree } from '../../layout/src/tree-placement.js';
import type { ExplorerModule } from './interfaces/project-view.js';

export const TREE_NODE_WIDTH = 184;
export const TREE_NODE_HEIGHT = 64;
/** Key of the unselectable node that parents several parentless modules. */
export const PROJECT_NODE_ID = '\u0000project';

/** The hierarchy fields a tree node needs; explorer modules and canvas nodes both have them. */
export interface HierarchyNode {
  readonly id: string;
  readonly name: string;
  readonly parent: string | null;
  readonly children: readonly string[];
}

/** The hierarchy shape that visibility and layout read. */
export interface HierarchyShape {
  /** The laid-out root: the single parentless node, or `PROJECT_NODE_ID`. */
  readonly rootId: string;
  readonly topLevel: readonly string[];
  readonly children: ReadonlyMap<string, readonly string[]>;
}

export interface HierarchyIndex<Item extends HierarchyNode> extends HierarchyShape {
  readonly nodesById: ReadonlyMap<string, Item>;
  readonly depth: ReadonlyMap<string, number>;
  /** Number of nodes below each node, excluding itself. */
  readonly descendants: ReadonlyMap<string, number>;
  readonly maxDepth: number;
}

export interface ModuleTreeIndex {
  readonly modulesById: ReadonlyMap<string, ExplorerModule>;
  /** The laid-out root: the single parentless module, or `PROJECT_NODE_ID`. */
  readonly rootId: string;
  readonly topLevel: readonly string[];
  readonly children: ReadonlyMap<string, readonly string[]>;
  readonly depth: ReadonlyMap<string, number>;
  /** Number of modules below each module, excluding itself. */
  readonly descendants: ReadonlyMap<string, number>;
  readonly maxDepth: number;
}

export interface NodeSize {
  readonly width: number;
  readonly height: number;
}

export interface PlacedTreeNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlacedTreeEdge {
  readonly id: string;
  readonly parent: string;
  readonly child: string;
  readonly points: readonly Point[];
}

export interface ModuleTreeLayout {
  readonly nodes: readonly PlacedTreeNode[];
  readonly edges: readonly PlacedTreeEdge[];
}

const fixedSize: NodeSize = { width: TREE_NODE_WIDTH, height: TREE_NODE_HEIGHT };

/** Orders children by name, and ignores child IDs missing from the nodes. */
export function indexHierarchy<Item extends HierarchyNode>(items: readonly Item[], rootNodeId?: string): HierarchyIndex<Item> {
  const nodesById = new Map(items.map(item => [item.id, item]));
  const byName = (left: string, right: string) => {
    const a = nodesById.get(left)!;
    const b = nodesById.get(right)!;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  const children = new Map<string, readonly string[]>();
  for (const item of items) {
    children.set(item.id, item.children.filter(id => nodesById.get(id)?.parent === item.id).sort(byName));
  }
  const parentless = items.filter(item => item.parent === null || !nodesById.has(item.parent))
    .map(item => item.id).sort(byName);
  const topLevel = rootNodeId && parentless.length === 1 && parentless[0] === rootNodeId
    ? [rootNodeId] : parentless;
  const rootId = topLevel.length === 1 ? topLevel[0]! : PROJECT_NODE_ID;
  const depth = new Map<string, number>();
  const descendants = new Map<string, number>();
  let maxDepth = 0;
  const visit = (id: string, level: number): number => {
    depth.set(id, level);
    maxDepth = Math.max(maxDepth, level);
    const count = (children.get(id) ?? []).reduce((sum, child) => sum + 1 + visit(child, level + 1), 0);
    descendants.set(id, count);
    return count;
  };
  for (const id of topLevel) visit(id, 0);
  return { nodesById, rootId, topLevel, children, depth, descendants, maxDepth };
}

/** Orders children by name, and ignores child IDs missing from the model. */
export function indexModuleTree(modules: readonly ExplorerModule[], rootModuleId?: string): ModuleTreeIndex {
  const { nodesById, ...rest } = indexHierarchy(modules, rootModuleId);
  return { modulesById: nodesById, ...rest };
}

/** Nodes shown under a collapsed set, in pre-order. */
export function visibleModuleIds(index: HierarchyShape, collapsed: ReadonlySet<string>): string[] {
  const result: string[] = [];
  const visit = (id: string) => {
    result.push(id);
    if (!collapsed.has(id)) for (const child of index.children.get(id) ?? []) visit(child);
  };
  for (const id of index.topLevel) visit(id);
  return result;
}

/** Ancestors of a node, root first, excluding the node. */
export function hierarchyAncestors(nodesById: ReadonlyMap<string, HierarchyNode>, id: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>([id]);
  let parent = nodesById.get(id)?.parent ?? null;
  while (parent !== null && nodesById.has(parent) && !seen.has(parent)) {
    result.unshift(parent);
    seen.add(parent);
    parent = nodesById.get(parent)!.parent;
  }
  return result;
}

/** Ancestors of a module, root first, excluding the module. */
export function ancestorsOf(index: ModuleTreeIndex, id: string): string[] {
  return hierarchyAncestors(index.modulesById, id);
}

/** Modules with children at or below a depth; collapsing them shows the tree down to that depth. */
export function collapsibleAtDepth(index: ModuleTreeIndex, depth: number): Set<string> {
  const result = new Set<string>();
  for (const [id, level] of index.depth) {
    if (level >= depth && (index.children.get(id)?.length ?? 0) > 0) result.add(id);
  }
  return result;
}

/**
 * Places the visible nodes top-down, each with the size `sizeOf` supplies; the synthetic project
 * node and nodes without a supplied size use the fixed 184 by 64 size.
 */
export function layoutModuleTree(index: HierarchyShape, collapsed: ReadonlySet<string>,
  sizeOf: (id: string) => NodeSize = () => fixedSize): ModuleTreeLayout {
  const visible = visibleModuleIds(index, collapsed);
  if (visible.length === 0) return { nodes: [], edges: [] };
  const synthetic = index.rootId === PROJECT_NODE_ID;
  const order = new Map<string, number>();
  const parents = new Map<string, string>();
  for (const id of index.topLevel) order.set(id, order.size);
  for (const [parent, list] of index.children) list.forEach((id, position) => {
    order.set(id, position);
    parents.set(id, parent);
  });
  const parentOf = (id: string): string | null => parents.get(id) ?? (synthetic ? PROJECT_NODE_ID : null);
  const nodes = visible.map(id => {
    const size = sizeOf(id);
    return { key: id, parent: parentOf(id), width: size.width, height: size.height, order: order.get(id) ?? 0 };
  });
  if (synthetic) nodes.unshift({ key: PROJECT_NODE_ID, parent: null, width: TREE_NODE_WIDTH, height: TREE_NODE_HEIGHT, order: 0 });
  const edges = nodes.filter(node => node.parent !== null)
    .map((node, position) => ({ key: `${node.parent}\u0000${node.key}`, from: node.parent!, to: node.key, lane: 0, order: position }));
  const edgesByKey = new Map(edges.map(edge => [edge.key, edge]));
  const placed = placeTree({ nodes, edges }, { gapX: 24, gapY: 56, padding: 24, orientation: 'vertical' });
  return {
    nodes: placed.nodes.map(node => ({ id: node.key, x: node.box.x, y: node.box.y,
      width: node.box.width, height: node.box.height })),
    edges: placed.edges.map(edge => {
      const source = edgesByKey.get(edge.key)!;
      return { id: edge.key, parent: source.from, child: source.to, points: edge.points };
    }),
  };
}
