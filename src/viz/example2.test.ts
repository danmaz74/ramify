import { describe, expect, it } from 'vitest';

import { createDiagramContext } from './diagram-definition.js';
import { example2Diagram } from './diagrams/example2.js';
import { buildDiagramLayout } from './layout.js';
import { mayImport } from './model-access.js';

const example2 = buildDiagramLayout(example2Diagram);

/**
 * Example 2 of `docs/model/illustrative-examples.md`: five modules, two
 * symbols, three decisions - one owner exposing one symbol through both
 * channels at once. The doc is normative for everything asserted here.
 */
describe('example 2 - both channels at once', () => {
  const rowsOf = (id: string): string[] =>
    (example2.tree.nodeById.get(id)?.rows ?? []).map(
      (row) =>
        `${row.marker ?? '_'} ${row.symbol}${row.provenance === undefined ? '' : `   ${row.provenance}`}`,
    );

  it('draws the doc’s tree, and only the doc’s tree', () => {
    expect(example2.tree.nodes.map((node) => node.id)).toEqual([
      'app',
      'pricing',
      'discounts',
      'taxes',
      'checkout',
    ]);
    expect(example2.tree.nodeById.get('app')?.badge).toBe('app root');
  });

  it('shows the first ▲▼ of the series: both channels on one owned row', () => {
    expect(rowsOf('pricing')).toEqual(['▲▼ PriceModel']);
    const row = (example2.tree.nodeById.get('pricing')?.rows ?? [])[0];
    expect(row?.kind).toBe('owns');
    expect(row?.gray).toBe(false);
  });

  it('reaches the subtree and the parent, and the reach stops there', () => {
    for (const id of ['discounts', 'taxes']) {
      expect(rowsOf(id)).toEqual(['_ PriceModel   granted by pricing']);
    }
    // `app` composes both symbols and stops them: gray rows, no dots of its own.
    expect(rowsOf('app')).toEqual([
      '· PriceModel   from pricing',
      '· submitOrder   from checkout',
    ]);
    expect(example2.propagation.dots.filter((dot) => dot.decider === 'app')).toHaveLength(0);
  });

  it('does not allow the sibling: crossing was never the owner’s decision', () => {
    const tree = createDiagramContext(example2Diagram).tree;
    expect(mayImport(tree, 'discounts', 'pricing', 'PriceModel')).toBe(true);
    expect(mayImport(tree, 'app', 'pricing', 'PriceModel')).toBe(true);
    expect(mayImport(tree, 'checkout', 'pricing', 'PriceModel')).toBe(false);
    // The mirror: pricing's consumers never see the sibling's symbol either.
    expect(mayImport(tree, 'discounts', 'checkout', 'submitOrder')).toBe(false);
  });

  it('draws exactly three decision dots, partitioned by the three policy statements', () => {
    expect(example2Diagram.decisionPolicies).toHaveLength(3);
    expect(example2.propagation.dots).toHaveLength(3);

    const byPolicy = new Map<string, string[]>();
    for (const dot of example2.propagation.dots) {
      byPolicy.set(dot.policyId, [...(byPolicy.get(dot.policyId) ?? []), dot.decider]);
    }
    expect([...byPolicy.keys()].sort()).toEqual(['P1', 'P2', 'P3']);
    expect(byPolicy.get('P1')).toEqual(['pricing']);
    expect(byPolicy.get('P2')).toEqual(['pricing']);
    expect(byPolicy.get('P3')).toEqual(['checkout']);
    // Five modules, three decisions: complexity is measured in decisions, not boxes.
    expect(example2.tree.nodes).toHaveLength(5);
  });

  it('sends both of PriceModel’s flows from the same owner', () => {
    const lanes = example2.propagation.lanes.filter((lane) => lane.layer === 'PriceModel');
    const kinds = new Set(lanes.map((lane) => lane.kind));
    expect(kinds).toEqual(new Set(['up-hop', 'grant']));
    const decisions = example2.propagation.decisions.filter(
      (decision) => decision.layer === 'PriceModel',
    );
    expect(new Set(decisions.map((decision) => decision.decider))).toEqual(new Set(['pricing']));
    // One arrival per module the symbol reaches: app, discounts, taxes.
    expect(lanes.map((lane) => lane.reaches).sort()).toEqual(['app', 'discounts', 'taxes']);
  });

  it('draws nothing across the tree, and is deterministic', () => {
    expect(example2.chords.all).toHaveLength(0);
    expect(JSON.stringify(buildDiagramLayout(example2Diagram))).toBe(
      JSON.stringify(buildDiagramLayout(example2Diagram)),
    );
  });
});
