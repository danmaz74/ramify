import { placeNodes } from './node-placement.js';
import { LAYOUT } from './geometry.js';
import type { LayoutGraphInput, LayoutOptions, LayoutResult } from './interfaces/layout.js';

/** Parallel ribbons on the measured hierarchy. Lane zero is the base connector;
 * positive and negative one-based lanes occupy opposite sides of it.
 */
export function placeLanes(input: LayoutGraphInput, options: LayoutOptions): LayoutResult {
  if (options.orientation === 'horizontal') {
    const placed = placeLanes({ nodes: input.nodes.map(node => ({ ...node, width: node.height, height: node.width })), edges: input.edges },
      { ...options, orientation: 'vertical', gapX: options.gapY, gapY: options.gapX });
    return { nodes: placed.nodes.map(node => ({ key: node.key, box: { x: node.box.y, y: node.box.x, width: node.box.height, height: node.box.width } })),
      edges: placed.edges.map(edge => ({ key: edge.key, points: edge.points.map(point => ({ x: point.y, y: point.x })) })),
      bounds: { x: placed.bounds.y, y: placed.bounds.x, width: placed.bounds.height, height: placed.bounds.width } };
  }
  const placed = placeNodes(input, options);
  const boxes = new Map(placed.nodes.map(node => [node.key, node.box]));
  const edges = input.edges.map(edge => {
    const parent = boxes.get(edge.from);
    const child = boxes.get(edge.to);
    if (parent === undefined || child === undefined) throw new Error(`Unknown endpoint for edge "${edge.key}".`);
    const offset = edge.lane === 0 ? 0 : Math.sign(edge.lane) * (LAYOUT.lane.offset + (Math.abs(edge.lane) - 1) * LAYOUT.lane.step);
    const busY = Math.max(...placed.nodes.filter(node => node.box.y === parent.y).map(node => node.box.y + node.box.height)) + options.gapY * LAYOUT.busFraction;
    const from = { x: parent.x + parent.width / 2 + offset, y: parent.y + parent.height };
    const to = { x: child.x + child.width / 2 + offset, y: child.y };
    return { key: edge.key, points: [from, { x: from.x, y: busY + offset }, { x: to.x, y: busY + offset }, to] };
  });
  return { ...placed, edges };
}
