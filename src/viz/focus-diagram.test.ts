import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { shopFocusDiagram, shopTreeDeclaration } from './diagrams/shop-tree.js';
import { FOCUS_LAYOUT, layoutFocusDiagram, type FocusCardLayout } from './focus-diagram.js';
import { FocusDiagramSvg } from './FocusDiagram.js';
import { buildTree } from './model-access.js';
import { chainText, focusContext } from './tree-diagram.js';

describe('the focus context', () => {
  const context = focusContext(buildTree(shopTreeDeclaration), 'payment');

  it('walks the path from the root and names the parent', () => {
    expect(context.path).toEqual(['shop', 'checkout', 'payment']);
    expect(context.parent).toBe('checkout');
    expect(context.children).toEqual(['cards', 'fraudCheck']);
  });

  it('reads the arrivals off the evaluator, with provenance', () => {
    expect(context.fromAbove).toEqual([
      {
        symbol: 'OrderTotal',
        owner: 'checkout',
        from: 'checkout',
        chain: [{ module: 'checkout', channel: 'toDescendants' }],
      },
      {
        symbol: 'Logger',
        owner: 'logging',
        from: 'shop',
        chain: [
          { module: 'logging', channel: 'toParent' },
          { module: 'platform', channel: 'toParent' },
          { module: 'shop', channel: 'toDescendants' },
        ],
      },
    ]);
    const hop = (module: string): { module: string; channel: 'toParent' } => ({ module, channel: 'toParent' });
    expect(context.fromChildren).toEqual([
      {
        child: 'cards',
        symbols: [
          { symbol: 'tokenizeCard', owner: 'cards', from: 'cards', chain: [hop('cards')] },
          { symbol: 'chargeCard', owner: 'cards', from: 'cards', chain: [hop('cards')] },
        ],
      },
      {
        child: 'fraudCheck',
        symbols: [
          { symbol: 'assessRisk', owner: 'fraudCheck', from: 'fraudCheck', chain: [hop('fraudCheck')] },
        ],
      },
    ]);
    expect(chainText(context.fromAbove[1]?.chain ?? [])).toBe('logging ▲ platform ▲ shop ▼');
    expect(context.owedToParent).toEqual(['chargeOrder', 'refundOrder']);
    expect(context.owedToDescendants).toEqual([]);
  });
});

describe('the focus diagram', () => {
  const layout = layoutFocusDiagram(shopFocusDiagram);
  const card = (id: FocusCardLayout['id']): FocusCardLayout =>
    layout.cards.find((entry) => entry.id === id) as FocusCardLayout;

  it('signposts where we are', () => {
    expect(layout.kicker).toBe('Focused view');
    expect(layout.breadcrumb).toBe('shop › checkout › payment');
    expect(layout.titlePrefix).toBe('Working in');
    expect(layout.title).toBe('payment');
  });

  it('stacks the three cards as bands of one width: above, the module, below', () => {
    expect(layout.cards.map((entry) => entry.id)).toEqual(['above', 'module', 'below']);
    const widths = new Set(layout.cards.map((entry) => entry.box.width));
    expect(widths.size).toBe(1);
    for (let index = 1; index < layout.cards.length; index += 1) {
      const previous = layout.cards[index - 1] as FocusCardLayout;
      const current = layout.cards[index] as FocusCardLayout;
      expect(current.box.y).toBe(previous.box.y + previous.box.height + FOCUS_LAYOUT.cardGap);
    }
  });

  it('fills the cards from the context, one column per direction', () => {
    expect(card('above').columns.map((column) => column.rows)).toEqual([
      [
        { kind: 'title', text: 'received' },
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
      ],
    ]);
    expect(card('module').title).toBe('payment');
    expect(card('module').columns.map((column) => column.rows)).toEqual([
      [
        { kind: 'title', text: 'files' },
        { kind: 'file', text: 'charge.ts' },
        { kind: 'file', text: 'refund.ts' },
        { kind: 'file', text: 'types.ts' },
      ],
      [
        { kind: 'title', text: 'exposed to checkout' },
        { kind: 'exposed', symbol: 'chargeOrder', channel: 'toParent' },
        { kind: 'exposed', symbol: 'refundOrder', channel: 'toParent' },
      ],
      // The direction exists even when this module uses nothing of it.
      [
        { kind: 'title', text: 'exposed to descendants' },
        { kind: 'title', text: '(nothing)' },
      ],
    ]);
    expect(card('below').columns.map((column) => column.rows)).toEqual([
      [
        { kind: 'group', text: 'cards' },
        { kind: 'exposed', symbol: 'tokenizeCard', channel: 'toParent' },
        { kind: 'exposed', symbol: 'chargeCard', channel: 'toParent' },
      ],
      [
        { kind: 'group', text: 'fraudCheck' },
        { kind: 'exposed', symbol: 'assessRisk', channel: 'toParent' },
      ],
    ]);
  });

  it('shows a downward exposure in the module card when there is one', () => {
    const withDownward = layoutFocusDiagram({
      ...shopFocusDiagram,
      focus: { moduleId: 'checkout', files: ['order.ts'] },
    });
    const module = withDownward.cards.find((entry) => entry.id === 'module') as FocusCardLayout;
    expect(module.columns[2]?.rows).toEqual([
      { kind: 'title', text: 'exposed to descendants' },
      { kind: 'exposed', symbol: 'OrderTotal', channel: 'toDescendants' },
    ]);
    expect(module.columns[1]?.rows).toEqual([
      { kind: 'title', text: 'exposed to shop' },
      { kind: 'title', text: '(nothing)' },
    ]);
  });

  it('drops the parent column for the root, and says so when there are no sub-modules', () => {
    const root = layoutFocusDiagram({ ...shopFocusDiagram, focus: { moduleId: 'shop', files: [] } });
    const module = root.cards.find((entry) => entry.id === 'module') as FocusCardLayout;
    expect(module.columns.map((column) => column.rows[0]?.kind === 'title' && column.rows[0].text)).toEqual([
      'files',
      'exposed to descendants',
    ]);
    const leaf = layoutFocusDiagram({ ...shopFocusDiagram, focus: { moduleId: 'cards', files: [] } });
    const below = leaf.cards.find((entry) => entry.id === 'below') as FocusCardLayout;
    expect(below.columns).toHaveLength(1);
    expect(below.columns[0]?.rows).toEqual([{ kind: 'title', text: '(no sub-modules)' }]);
  });

  it('keeps every column inside its card, side by side', () => {
    for (const entry of layout.cards) {
      let previousRight = entry.box.x;
      for (const column of entry.columns) {
        expect(column.x).toBeGreaterThanOrEqual(previousRight);
        expect(column.x + column.width).toBeLessThanOrEqual(entry.box.x + entry.box.width + 1);
        previousRight = column.x + column.width;
      }
    }
  });

  it('draws the whole tree as a bare map under the cards, focus marked', () => {
    const last = layout.cards[layout.cards.length - 1] as FocusCardLayout;
    expect(layout.map.y).toBeGreaterThan(last.box.y + last.box.height);
    expect(layout.map.tree.nodes).toHaveLength(20);
    expect(layout.map.tree.nodes.every((node) => node.rows.length === 0)).toBe(true);
    expect(layout.map.focusNode.id).toBe('payment');
    expect(layout.map.scale).toBe(FOCUS_LAYOUT.mapScale);
  });

  it("marks Logger's route on the map: logging and platform dashed, their edges too", () => {
    const roleOf = (id: string): string | undefined =>
      layout.map.tree.nodes.find((node) => node.id === id)?.role;
    expect(roleOf('logging')).toBe('source');
    expect(roleOf('platform')).toBe('source');
    expect(roleOf('db')).toBe('outside');
    const edgeRole = (parent: string, child: string): string | undefined =>
      layout.map.tree.edges.find((edge) => edge.parent === parent && edge.child === child)?.role;
    expect(edgeRole('platform', 'logging')).toBe('source');
    expect(edgeRole('shop', 'platform')).toBe('source');
    expect(edgeRole('platform', 'db')).toBe('outside');
    expect(edgeRole('shop', 'checkout')).toBe('focus');
  });

  it('fits everything in the viewBox, text lines included', () => {
    const right = Math.max(
      ...layout.cards.map((entry) => entry.box.x + entry.box.width),
      layout.map.x + layout.map.tree.viewBox.width * layout.map.scale,
    );
    expect(right).toBeLessThanOrEqual(layout.viewBox.width);
    const textRight = (text: string): number => FOCUS_LAYOUT.margin + text.length * 5.5;
    expect(textRight(layout.map.caption)).toBeLessThanOrEqual(layout.viewBox.width);
    for (const note of layout.notes) {
      expect(textRight(note.text)).toBeLessThanOrEqual(layout.viewBox.width);
    }
    for (const note of layout.notes) {
      expect(note.y).toBeLessThan(layout.viewBox.height);
    }
  });

  it('lays the cards side by side when asked', () => {
    const columns = layoutFocusDiagram({ ...shopFocusDiagram, arrangement: 'columns' });
    const tops = new Set(columns.cards.map((entry) => entry.box.y));
    expect(tops.size).toBe(1);
    const heights = new Set(columns.cards.map((entry) => entry.box.height));
    expect(heights.size).toBe(1);
  });
});

describe('the checked-in focus SVG', () => {
  it('is what the pipeline renders', async () => {
    const markup = `${renderToStaticMarkup(
      createElement(FocusDiagramSvg, { definition: shopFocusDiagram, standalone: true }),
    )}\n`;
    await expect(markup).toMatchFileSnapshot('../../site/static/diagrams/shop-focus-payment.svg');
    expect(markup).toContain('data-kind="you-are-here"');
    expect(markup).toContain('Focused view');
    expect(markup).toContain('Working in');
    expect(markup.match(/data-kind="card"/gu)?.length).toBe(3);
    expect(markup.match(/stroke-dasharray="4 3"/gu)?.length).toBe(4);
  });
});
