import { measureBounds } from './bounds.js';
import type { LayoutGraphInput, LayoutNodeInput, LayoutNode, LayoutEdge, LayoutOptions, LayoutResult } from './interfaces/layout.js';

interface Sized {
  readonly input: LayoutNodeInput;
  readonly depth: number;
  readonly children: readonly Sized[];
  readonly span: number;
}

/** Compact subtree spans, centered parents and aligned levels from measured dimensions. */
export function placeTree(input: LayoutGraphInput, options: LayoutOptions): LayoutResult {
  if (input.nodes.length === 0) return { nodes: [], edges: [], bounds: measureBounds([]) };
  if (options.orientation === 'horizontal') {
    const placed = placeTree({ nodes: input.nodes.map(node => ({ ...node, width: node.height, height: node.width })), edges: input.edges },
      { ...options, orientation: 'vertical', gapX: options.gapY, gapY: options.gapX });
    const nodes = placed.nodes.map(node => ({ key: node.key, box: { x: node.box.y, y: node.box.x, width: node.box.height, height: node.box.width } }));
    return { nodes, edges: placed.edges.map(edge => ({ key: edge.key, points: edge.points.map(point => ({ x: point.y, y: point.x })) })), bounds: measureBounds(nodes.map(node => node.box)) };
  }
  const size = (node: LayoutNodeInput, depth: number): Sized => {
    const children = input.nodes.filter(child => child.parent === node.key).sort((a, b) => a.order - b.order).map(child => size(child, depth + 1));
    const childSpan = children.reduce((sum, child) => sum + child.span, 0) + options.gapX * Math.max(0, children.length - 1);
    return { input: node, depth, children, span: Math.max(node.width, childSpan) };
  };
  const rootInput = input.nodes.find(node => node.parent === null);
  if (rootInput === undefined) throw new Error('A layout tree needs a root.');
  const root = size(rootInput, 0);
  const tallest: number[] = [];
  const measure = (node: Sized): void => {
    tallest[node.depth] = Math.max(tallest[node.depth] ?? 0, node.input.height);
    node.children.forEach(measure);
  };
  measure(root);
  const tops: number[] = [];
  let y = options.padding;
  for (const height of tallest) { tops.push(y); y += height + options.gapY; }
  const xs = new Map<string, number>();
  const position = (node: Sized, left: number): void => {
    const childrenSpan = node.children.reduce((sum, child) => sum + child.span, 0) + options.gapX * Math.max(0, node.children.length - 1);
    let cx = left + (node.span - childrenSpan) / 2;
    for (const child of node.children) { position(child, cx); cx += child.span + options.gapX; }
    const first = node.children[0];
    const last = node.children[node.children.length - 1];
    if (first === undefined || last === undefined) {
      xs.set(node.input.key, Math.round(left + (node.span - node.input.width) / 2));
    } else {
      const firstCenter = (xs.get(first.input.key) ?? 0) + first.input.width / 2;
      const lastCenter = (xs.get(last.input.key) ?? 0) + last.input.width / 2;
      const centered = (firstCenter + lastCenter) / 2 - node.input.width / 2;
      xs.set(node.input.key, Math.round(Math.min(Math.max(centered, left), left + node.span - node.input.width)));
    }
  };
  position(root, options.padding);
  const nodes: LayoutNode[] = [];
  const visit = (node: Sized): void => {
    nodes.push({ key: node.input.key, box: { x: xs.get(node.input.key) ?? options.padding, y: tops[node.depth] ?? options.padding, width: node.input.width, height: node.input.height } });
    node.children.forEach(visit);
  };
  visit(root);
  const byKey = new Map(nodes.map(node => [node.key, node.box]));
  const edges: LayoutEdge[] = input.edges.map(edge => {
    const parent = byKey.get(edge.from);
    const child = byKey.get(edge.to);
    if (parent === undefined || child === undefined) throw new Error(`Unknown endpoint for edge "${edge.key}".`);
    const elbow = child.y - options.gapY / 2;
    return { key: edge.key, points: [
      { x: parent.x + parent.width / 2, y: parent.y + parent.height },
      { x: parent.x + parent.width / 2, y: elbow },
      { x: child.x + child.width / 2, y: elbow },
      { x: child.x + child.width / 2, y: child.y },
    ] };
  });
  return { nodes, edges, bounds: { x: options.padding, y: options.padding, width: root.span, height: measureBounds(nodes.map(node => node.box)).height } };
}
