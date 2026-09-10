import { describe, expect, it } from 'vitest';
import {
  LAYOUT, measureBounds, placeNodes, placeTree, placeFocus, placeLanes, placeChords, placeLegend,
  type LayoutGraphInput, type LayoutOptions,
} from '../index.js';

// Opaque keys and measured boxes exercise the placement boundary without a model,
// a presentation fixture, or UI classifications.
const graph: LayoutGraphInput = {
  nodes: [
    { key: 'a', parent: null, width: 174, height: 90, order: 0 },
    { key: 'b', parent: 'a', width: 270, height: 124, order: 1 },
    { key: 'c', parent: 'b', width: 160, height: 64, order: 2 },
    { key: 'd', parent: 'b', width: 310, height: 104, order: 3 },
    { key: 'e', parent: 'a', width: 150, height: 78, order: 4 },
    { key: 'f', parent: 'e', width: 230, height: 64, order: 5 },
    { key: 'g', parent: 'a', width: 330, height: 60, order: 6 },
  ],
  edges: [
    { key: 'ab', from: 'a', to: 'b', lane: 0, order: 0 },
    { key: 'ag', from: 'a', to: 'g', lane: 0, order: 1 },
    { key: 'bd', from: 'b', to: 'd', lane: 0, order: 2 },
  ],
};
const options: LayoutOptions = { gapX: LAYOUT.siblingGap, gapY: LAYOUT.levelGap, padding: LAYOUT.margin, orientation: 'vertical' };

describe('neutral placement', () => {
  it('keeps unequal boxes and deep branches apart on every level', () => {
    const placed = placeNodes(graph, options);
    expect(placed.nodes.map(node => node.key)).toEqual(graph.nodes.map(node => node.key));
    for (const y of new Set(placed.nodes.map(node => node.box.y))) {
      const row = placed.nodes.filter(node => node.box.y === y).sort((a, b) => a.box.x - b.box.x);
      for (let index = 1; index < row.length; index += 1) {
        const previous = row[index - 1]!.box;
        expect(row[index]!.box.x - previous.x - previous.width).toBeGreaterThanOrEqual(48);
      }
    }
    expect(placed.bounds).toEqual(measureBounds(placed.nodes.map(node => node.box)));
    expect(placeNodes(graph, options)).toEqual(placed);
  });

  it('places signed lane offsets parallel to every base connector within the four-lane budget', () => {
    const placed = placeLanes({ nodes: graph.nodes, edges: graph.edges.flatMap(edge => [
      edge, ...[-1, 1, 2, 3].map(lane => ({ ...edge, key: `${edge.key}:${lane}`, lane })),
    ]) }, options);
    for (const edge of graph.edges) {
      const base = placed.edges.find(candidate => candidate.key === edge.key)!.points;
      for (const lane of [-1, 1, 2, 3]) {
        const points = placed.edges.find(candidate => candidate.key === `${edge.key}:${lane}`)!.points;
        expect(points).toHaveLength(4);
        const offset = Math.sign(lane) * Math.abs(lane) * 7;
        for (let index = 0; index < points.length; index += 1) {
          expect(points[index]!.x - base[index]!.x).toBe(offset);
          expect(Math.abs(points[index]!.y - base[index]!.y)).toBeLessThanOrEqual(28);
        }
        expect(points[0]!.y).toBe(base[0]!.y);
        expect(points.at(-1)!.y).toBe(base.at(-1)!.y);
      }
    }
  });

  it('keeps compact parents centered and aligns connector elbows across a level', () => {
    const placed = placeTree(graph, { ...options, gapX: 8, gapY: 34, padding: 12 });
    const byKey = new Map(placed.nodes.map(node => [node.key, node.box]));
    const a = byKey.get('a')!;
    const b = byKey.get('b')!;
    const g = byKey.get('g')!;
    expect(Math.abs(a.x + a.width / 2 - (b.x + b.width / 2 + g.x + g.width / 2) / 2)).toBeLessThanOrEqual(0.5);
    expect(placed.edges[0]!.points[1]!.y).toBe(placed.edges[1]!.points[1]!.y);
    expect(placed.edges[0]!.points[0]).toEqual({ x: a.x + a.width / 2, y: a.y + a.height });
  });

  it('assigns shortest chords first, preserves endpoint clearance and includes smooth curve knots', () => {
    const placed = placeChords({ nodes: graph.nodes, edges: [
      { key: 'wide', from: 'c', to: 'g', lane: 13, order: 0 },
      { key: 'short', from: 'c', to: 'd', lane: 0, order: 1 },
    ] }, options);
    expect(placed.edges.map(edge => edge.key)).toEqual(['short', 'wide']);
    const byKey = new Map(placed.nodes.map(node => [node.key, node.box]));
    const short = placed.edges[0]!.points;
    const wide = placed.edges[1]!.points;
    expect(short.length).toBeGreaterThan(100);
    expect(short.at(-1)!.y).toBe(byKey.get('d')!.y + byKey.get('d')!.height);
    expect(wide.at(-1)!.y).toBe(byKey.get('g')!.y + byKey.get('g')!.height + 13);
    const bandTop = placed.bounds.y + placed.bounds.height + LAYOUT.chord.topGap;
    expect(short.some(point => point.y === bandTop)).toBe(true);
    expect(wide.some(point => point.y === bandTop + LAYOUT.chord.rowHeight)).toBe(true);
  });

  it('wraps legends against measured width while retaining input order', () => {
    const placed = placeLegend({ items: [
      { key: 'first', width: 100, height: 20 }, { key: 'second', width: 80, height: 40 },
      { key: 'third', width: 50, height: 15 },
    ], maxWidth: 200 }, { ...options, padding: 0, gapX: 20, gapY: 12, orientation: 'horizontal' });
    expect(placed.items.map(item => item.box)).toEqual([
      { x: 0, y: 0, width: 100, height: 20 }, { x: 120, y: 0, width: 80, height: 40 },
      { x: 0, y: 52, width: 50, height: 15 },
    ]);
    expect(placed.bounds).toEqual({ x: 0, y: 0, width: 200, height: 67 });
  });

  it('shares panel dimensions and distributes spare column width proportionally', () => {
    const placed = placeFocus({ nodes: [
      { key: 'small', parent: null, width: 100, height: 20, order: 0 },
      { key: 'large', parent: null, width: 200, height: 50, order: 1 },
    ], edges: [] }, { ...options, padding: 12, gapY: 10 });
    expect(placed.nodes.map(node => node.box)).toEqual([
      { x: 12, y: 12, width: 200, height: 20 }, { x: 12, y: 42, width: 200, height: 50 },
    ]);
    const columns = placeFocus({ nodes: [
      { key: 'panel', parent: null, width: 310, height: 40, order: 0 },
      { key: 'left', parent: 'panel', width: 100, height: 40, order: 1 },
      { key: 'right', parent: 'panel', width: 50, height: 40, order: 2 },
    ], edges: [] }, { ...options, padding: 0, gapX: 10, orientation: 'horizontal' });
    expect(columns.nodes.slice(1).map(node => node.box.width)).toEqual([200, 100]);
    expect(columns.nodes[2]!.box.x).toBe(210);
  });

  it('preserves dimensions and attachment points when the graph is rotated', () => {
    const rotatedInput = { nodes: graph.nodes.map(node => ({ ...node, width: node.height, height: node.width })), edges: graph.edges };
    for (const operation of [placeNodes, placeTree, placeLanes, placeChords]) {
      const vertical = operation(graph, options);
      const horizontal = operation(rotatedInput, { ...options, orientation: 'horizontal', gapX: options.gapY, gapY: options.gapX });
      expect(horizontal.nodes.map(node => node.box)).toEqual(vertical.nodes.map(node => ({
        x: node.box.y, y: node.box.x, width: node.box.height, height: node.box.width,
      })));
      expect(horizontal.edges.map(edge => edge.points)).toEqual(vertical.edges.map(edge => edge.points.map(point => ({ x: point.y, y: point.x }))));
    }
  });

  it('unions negative and zero extents and handles empty inputs', () => {
    expect(measureBounds([{ x: -10, y: 4, width: 5, height: 8 }, { x: 3, y: -2, width: 0, height: 0 }]))
      .toEqual({ x: -10, y: -2, width: 13, height: 14 });
    for (const operation of [placeNodes, placeTree, placeFocus, placeLanes, placeChords]) {
      expect(operation({ nodes: [], edges: [] }, options)).toEqual({ nodes: [], edges: [], bounds: { x: 0, y: 0, width: 0, height: 0 } });
    }
  });
});
