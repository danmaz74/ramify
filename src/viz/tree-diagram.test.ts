import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { shopTreeDiagram } from './diagrams/shop-tree.js';
import {
  TREE_LAYOUT,
  layoutTreeDiagram,
  type TreeDiagramDefinition,
  type TreeNodeLayout,
  type TreeRow,
} from './tree-diagram.js';
import { TreeDiagramSvg } from './TreeDiagram.js';

/** The tree with `payment` in focus and the context spelled out in the boxes. */
const shopTreeFocusDiagram: TreeDiagramDefinition = {
  ...shopTreeDiagram,
  id: 'shop-tree-payment',
  focus: { moduleId: 'payment', files: ['charge.ts', 'refund.ts', 'types.ts'] },
  notes: ['▲ exposed to the parent.   Dimmed: not available in payment.'],
};

function byId(nodes: readonly TreeNodeLayout[]): Map<string, TreeNodeLayout> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function overlap(a: TreeNodeLayout, b: TreeNodeLayout): boolean {
  return (
    a.box.x < b.box.x + b.box.width &&
    b.box.x < a.box.x + a.box.width &&
    a.box.y < b.box.y + b.box.height &&
    b.box.y < a.box.y + a.box.height
  );
}

const centerX = (node: TreeNodeLayout): number => node.box.x + node.box.width / 2;

const PARENT: Readonly<Record<string, string>> = {
  catalog: 'shop',
  search: 'catalog',
  indexing: 'search',
  ranking: 'search',
  inventory: 'catalog',
  checkout: 'shop',
  cart: 'checkout',
  payment: 'checkout',
  cards: 'payment',
  fraudCheck: 'payment',
  shipping: 'checkout',
  routing: 'shipping',
  accounts: 'shop',
  auth: 'accounts',
  profiles: 'accounts',
  platform: 'shop',
  db: 'platform',
  http: 'platform',
  logging: 'platform',
};

describe('the tree layout', () => {
  const layout = layoutTreeDiagram(shopTreeDiagram);
  const nodes = byId(layout.nodes);

  it('draws every module once, in declaration order', () => {
    expect(layout.nodes.map((node) => node.id)).toEqual([
      'shop',
      'catalog',
      'search',
      'indexing',
      'ranking',
      'inventory',
      'checkout',
      'cart',
      'payment',
      'cards',
      'fraudCheck',
      'shipping',
      'routing',
      'accounts',
      'auth',
      'profiles',
      'platform',
      'db',
      'http',
      'logging',
    ]);
  });

  it('puts every child one level below its parent, and levels at one height each', () => {
    const topsByDepth = new Map<number, number>();
    for (const node of layout.nodes) {
      const top = topsByDepth.get(node.depth);
      if (top === undefined) {
        topsByDepth.set(node.depth, node.box.y);
      } else {
        expect(node.box.y, node.id).toBe(top);
      }
    }
    for (const [child, parent] of Object.entries(PARENT)) {
      const inner = nodes.get(child) as TreeNodeLayout;
      const outer = nodes.get(parent) as TreeNodeLayout;
      expect(inner.depth).toBe(outer.depth + 1);
      expect(inner.box.y).toBeGreaterThanOrEqual(outer.box.y + outer.box.height + TREE_LAYOUT.levelGap);
    }
  });

  it('centers each parent between its first and last child', () => {
    const childrenOf = new Map<string, TreeNodeLayout[]>();
    for (const [child, parent] of Object.entries(PARENT)) {
      const list = childrenOf.get(parent) ?? [];
      list.push(nodes.get(child) as TreeNodeLayout);
      childrenOf.set(parent, list);
    }
    for (const [parent, children] of childrenOf) {
      const first = children[0] as TreeNodeLayout;
      const last = children[children.length - 1] as TreeNodeLayout;
      const midpoint = (centerX(first) + centerX(last)) / 2;
      expect(
        Math.abs(centerX(nodes.get(parent) as TreeNodeLayout) - midpoint),
        parent,
      ).toBeLessThanOrEqual(0.5);
    }
  });

  it('never overlaps two boxes', () => {
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a !== b) {
          expect(overlap(a, b), `${a.id} / ${b.id}`).toBe(false);
        }
      }
    }
  });

  it('connects every parent to every child, elbow between the levels', () => {
    expect(layout.edges).toHaveLength(Object.keys(PARENT).length);
    for (const edge of layout.edges) {
      expect(PARENT[edge.child]).toBe(edge.parent);
      const parent = nodes.get(edge.parent) as TreeNodeLayout;
      const child = nodes.get(edge.child) as TreeNodeLayout;
      expect(edge.d).toBe(
        `M${centerX(parent)} ${parent.box.y + parent.box.height}V${child.box.y - TREE_LAYOUT.levelGap / 2}H${centerX(child)}V${child.box.y}`,
      );
      expect(edge.role).toBe('plain');
    }
  });

  it('fits the viewBox with integer boxes', () => {
    for (const entry of layout.nodes) {
      const { x, y, width, height } = entry.box;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(layout.viewBox.width);
      expect(y + height).toBeLessThanOrEqual(layout.viewBox.height);
      for (const value of [x, y, width, height]) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('draws no rows and no roles without a focus', () => {
    expect(layout.nodes.every((entry) => entry.rows.length === 0 && entry.role === 'plain')).toBe(
      true,
    );
  });
});

describe('the focus on payment', () => {
  const layout = layoutTreeDiagram(shopTreeFocusDiagram);
  const nodes = byId(layout.nodes);
  const rowsOf = (id: string): readonly TreeRow[] => (nodes.get(id) as TreeNodeLayout).rows;

  it('casts every module by its relation to the focus', () => {
    const roles = Object.fromEntries(layout.nodes.map((entry) => [entry.id, entry.role]));
    expect(roles['payment']).toBe('focus');
    expect(roles['cards']).toBe('child');
    expect(roles['fraudCheck']).toBe('child');
    expect(roles['checkout']).toBe('ancestor');
    expect(roles['shop']).toBe('ancestor');
    for (const outside of ['cart', 'shipping', 'routing', 'catalog', 'search', 'db', 'http']) {
      expect(roles[outside], outside).toBe('outside');
    }
    // Logger's route: not available in payment, but where the symbol came from.
    expect(roles['platform']).toBe('source');
    expect(roles['logging']).toBe('source');
  });

  it('lists what payment owes upward, what it receives from above, and its files', () => {
    expect(rowsOf('payment')).toEqual([
      { kind: 'title', text: 'exposes to checkout' },
      { kind: 'exposed', symbol: 'chargeOrder', channel: 'toParent' },
      { kind: 'exposed', symbol: 'refundOrder', channel: 'toParent' },
      { kind: 'title', text: 'receives from above' },
      {
        kind: 'received',
        symbol: 'OrderTotal',
        from: 'checkout',
        chain: [{ module: 'checkout', channel: 'toDescendants' }],
      },
      {
        kind: 'received',
        symbol: 'Logger',
        from: 'shop',
        chain: [
          { module: 'logging', channel: 'toParent' },
          { module: 'platform', channel: 'toParent' },
          { module: 'shop', channel: 'toDescendants' },
        ],
      },
      { kind: 'title', text: 'files' },
      { kind: 'file', text: 'charge.ts' },
      { kind: 'file', text: 'refund.ts' },
      { kind: 'file', text: 'types.ts' },
    ]);
  });

  it('draws each child as the interface it exposes to payment', () => {
    expect(rowsOf('cards')).toEqual([
      { kind: 'exposed', symbol: 'tokenizeCard', channel: 'toParent' },
      { kind: 'exposed', symbol: 'chargeCard', channel: 'toParent' },
    ]);
    expect(rowsOf('fraudCheck')).toEqual([
      { kind: 'exposed', symbol: 'assessRisk', channel: 'toParent' },
    ]);
  });

  it('accents the edges of the focus context and dims the edges into outsiders', () => {
    const roleOf = (parent: string, child: string): string | undefined =>
      layout.edges.find((edge) => edge.parent === parent && edge.child === child)?.role;
    expect(roleOf('checkout', 'payment')).toBe('focus');
    expect(roleOf('payment', 'cards')).toBe('focus');
    expect(roleOf('payment', 'fraudCheck')).toBe('focus');
    expect(roleOf('shop', 'checkout')).toBe('focus');
    expect(roleOf('checkout', 'cart')).toBe('outside');
    expect(roleOf('shop', 'platform')).toBe('source');
    expect(roleOf('platform', 'logging')).toBe('source');
    expect(roleOf('platform', 'db')).toBe('outside');
  });

  it('gives nothing to ancestors and outsiders', () => {
    for (const id of ['shop', 'checkout', 'cart', 'platform', 'logging', 'db']) {
      expect(rowsOf(id), id).toEqual([]);
    }
  });

  it('places the note under the tree', () => {
    expect(layout.notes).toHaveLength(1);
    const bottom = Math.max(...layout.nodes.map((node) => node.box.y + node.box.height));
    expect(layout.notes[0]?.y).toBeGreaterThan(bottom);
    expect(layout.notes[0]?.y).toBeLessThan(layout.viewBox.height);
  });
});

describe('the tree SVGs', () => {
  const emitted = (definition: TreeDiagramDefinition): string =>
    `${renderToStaticMarkup(createElement(TreeDiagramSvg, { definition, standalone: true }))}\n`;

  it('is what the pipeline renders for the shop tree', async () => {
    await expect(emitted(shopTreeDiagram)).toMatchFileSnapshot(
      '../../site/static/diagrams/shop-tree.svg',
    );
  });

  it('dims exactly the outside modules and the edges into them', () => {
    const markup = emitted(shopTreeFocusDiagram);
    // 20 modules, minus the focus, its two children, its two ancestors and the
    // two on Logger's route - and the edge into each of those 13 outsiders.
    expect(markup.match(/rmf-dim-soft"/gu)?.length).toBe(26);
    expect(markup).toContain('data-module="payment" data-role="focus"');
  });

  it('keeps every box bare when focusRows is off, roles still cast', () => {
    const layout = layoutTreeDiagram({ ...shopTreeFocusDiagram, focusRows: false });
    expect(layout.nodes.every((node) => node.rows.length === 0)).toBe(true);
    expect(layout.nodes.map((node) => node.id)).toHaveLength(20);
    expect(layout.nodes.find((node) => node.id === 'payment')?.role).toBe('focus');
    expect(layout.nodes.find((node) => node.id === 'cart')?.role).toBe('outside');
  });
});
