import { measureBounds } from './bounds.js';
import type { LayoutGraphInput, LayoutNode, LayoutOptions, LayoutResult } from './interfaces/layout.js';

/** Arrange measured sibling panels, sharing the cross-axis extent.
 * A single parent supplies the available extent for proportional child columns.
 */
export function placeFocus(input: LayoutGraphInput, options: LayoutOptions): LayoutResult {
  const roots = input.nodes.filter(node => node.parent === null).sort((a, b) => a.order - b.order);
  const root = roots[0];
  const children = root === undefined ? [] : input.nodes.filter(node => node.parent === root.key).sort((a, b) => a.order - b.order);
  const nodes: LayoutNode[] = [];
  if (roots.length === 1 && root !== undefined && children.length > 0) {
    nodes.push({ key: root.key, box: { x: options.padding, y: options.padding, width: root.width, height: root.height } });
    const needed = children.reduce((sum, child) => sum + child.width, 0);
    const gaps = options.gapX * Math.max(0, children.length - 1);
    const spare = Math.max(0, root.width - needed - gaps);
    let x = options.padding;
    for (const child of children) {
      const width = Math.round(child.width + (needed === 0 ? 0 : spare * child.width / needed));
      nodes.push({ key: child.key, box: { x, y: options.padding, width, height: child.height } });
      x += width + options.gapX;
    }
  } else {
    const vertical = options.orientation === 'vertical';
    const width = Math.max(0, ...roots.map(node => node.width));
    const height = Math.max(0, ...roots.map(node => node.height));
    let cursor = options.padding;
    for (const node of roots) {
      const box = { x: vertical ? options.padding : cursor, y: vertical ? cursor : options.padding,
        width: vertical ? width : node.width, height: vertical ? node.height : height };
      nodes.push({ key: node.key, box });
      cursor += vertical ? box.height + options.gapY : box.width + options.gapX;
    }
  }
  return { nodes, edges: [], bounds: measureBounds(nodes.map(node => node.box)) };
}
