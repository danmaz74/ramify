import { hierarchy, tree as d3Tree, type HierarchyNode } from 'd3-hierarchy';
import { LAYOUT } from './geometry.js';
import { measureBounds } from './bounds.js';
import type { LayoutGraphInput, LayoutNodeInput, LayoutNode, LayoutOptions, LayoutResult } from './interfaces/layout.js';

/** Tidy-tree x positions, then a clearance-enforcing relaxation. */
function positionNodes(
  input: LayoutGraphInput,
  options: LayoutOptions,
  contents: ReadonlyMap<string, LayoutNodeInput>,
): Map<string, number> {
  const rootInput = input.nodes.find(node => node.parent === null);
  if (rootInput === undefined) throw new Error('A layout tree needs a root.');
  const root = hierarchy<LayoutNodeInput>(rootInput, node =>
    input.nodes.filter(child => child.parent === node.key).sort((a, b) => a.order - b.order));

  const halfWidth = (node: HierarchyNode<LayoutNodeInput>): number =>
    (contents.get(node.data.key)?.width ?? LAYOUT.node.minWidth) / 2;

  const laidOut = d3Tree<LayoutNodeInput>()
    .nodeSize([1, 1])
    .separation(
      (a, b) =>
        halfWidth(a) +
        halfWidth(b) +
        (a.parent === b.parent ? options.gapX : options.gapX + (LAYOUT.branchGap - LAYOUT.siblingGap)),
    )(root);

  const x = new Map<string, number>();
  for (const node of laidOut.descendants()) {
    x.set(node.data.key, node.x);
  }

  const childrenOf = new Map<string, string[]>();
  for (const node of laidOut.descendants()) {
    childrenOf.set(node.data.key, (node.children ?? []).map((child) => child.data.key));
  }
  const byDepth = new Map<number, string[]>();
  for (const node of laidOut.descendants()) {
    const list = byDepth.get(node.depth) ?? [];
    list.push(node.data.key);
    byDepth.set(node.depth, list);
  }

  const shiftSubtree = (id: string, delta: number): void => {
    x.set(id, (x.get(id) ?? 0) + delta);
    for (const child of childrenOf.get(id) ?? []) {
      shiftSubtree(child, delta);
    }
  };

  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  for (let pass = 0; pass < 6; pass += 1) {
    // Push apart anything that would collide, subtree by subtree.
    for (const depth of depths) {
      const row = [...(byDepth.get(depth) ?? [])].sort(
        (a, b) => (x.get(a) ?? 0) - (x.get(b) ?? 0),
      );
      for (let index = 1; index < row.length; index += 1) {
        const previous = row[index - 1] as string;
        const current = row[index] as string;
        const previousRight =
          (x.get(previous) ?? 0) + (contents.get(previous)?.width ?? 0) / 2;
        const currentLeft = (x.get(current) ?? 0) - (contents.get(current)?.width ?? 0) / 2;
        const overlap = previousRight + Math.max(0, options.gapX - (LAYOUT.siblingGap - LAYOUT.minLevelClearance)) - currentLeft;
        if (overlap > 0) {
          shiftSubtree(current, overlap);
        }
      }
    }
    // Re-centre every parent over the span of its children.
    for (const depth of [...depths].reverse()) {
      for (const id of byDepth.get(depth) ?? []) {
        const children = childrenOf.get(id) ?? [];
        if (children.length === 0) {
          continue;
        }
        const xs = children.map((child) => x.get(child) ?? 0);
        x.set(id, (Math.min(...xs) + Math.max(...xs)) / 2);
      }
    }
  }

  return x;
}

/** Tidy-tree placement from measured boxes; parent keys and order determine the hierarchy. */
export function placeNodes(input: LayoutGraphInput, options: LayoutOptions): LayoutResult {
  if (input.nodes.length === 0) return { nodes: [], edges: [], bounds: measureBounds([]) };
  if (options.orientation === 'horizontal') {
    const transposed = placeNodes({
      nodes: input.nodes.map(node => ({ ...node, width: node.height, height: node.width })),
      edges: input.edges,
    }, { ...options, gapX: options.gapY, gapY: options.gapX, orientation: 'vertical' });
    const nodes = transposed.nodes.map(node => ({ key: node.key, box: {
      x: node.box.y, y: node.box.x, width: node.box.height, height: node.box.width,
    } }));
    return { nodes, edges: [], bounds: measureBounds(nodes.map(node => node.box)) };
  }
  const contents = new Map(input.nodes.map(node => [node.key, node]));
  const centers = positionNodes(input, options, contents);
  const depths = new Map<string, number>();
  const depthOf = (key: string): number => {
    const cached = depths.get(key);
    if (cached !== undefined) return cached;
    const node = contents.get(key);
    if (node === undefined) throw new Error(`Unknown layout node "${key}".`);
    const depth = node.parent === null ? 0 : depthOf(node.parent) + 1;
    depths.set(key, depth);
    return depth;
  };
  const heights: number[] = [];
  for (const node of input.nodes) {
    const depth = depthOf(node.key);
    heights[depth] = Math.max(heights[depth] ?? 0, node.height);
  }
  const tops: number[] = [];
  let top = options.padding;
  for (const height of heights) { tops.push(top); top += height + options.gapY; }
  const minLeft = Math.min(...input.nodes.map(node => (centers.get(node.key) ?? 0) - node.width / 2));
  const nodes: LayoutNode[] = input.nodes.map(node => ({ key: node.key, box: {
    x: (centers.get(node.key) ?? 0) + options.padding - minLeft - node.width / 2,
    y: tops[depthOf(node.key)] ?? options.padding,
    width: node.width, height: node.height,
  } }));
  return { nodes, edges: [], bounds: measureBounds(nodes.map(node => node.box)) };
}
