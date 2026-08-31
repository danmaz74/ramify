import { describe, expect, it } from 'vitest';

import { createDiagramContext } from './diagram-definition.js';
import { example1Diagram } from './diagrams/example1.js';
import { shopDiagram, shopTree } from './diagrams/shop.js';
import { buildDiagramLayout } from './layout.js';
import type { ChordLayout } from './layout-chords.js';
import { layoutPropagation } from './layout-lanes.js';
import { layoutTree, type NodeLayout, type SymbolRow } from './layout-nodes.js';
import {
  DiagramModelMismatch,
  validateChords,
  validateGrayRows,
  validateLandings,
  validateNodeRows,
} from './validate.js';

const shopContext = createDiagramContext(shopDiagram);
const example1Context = createDiagramContext(example1Diagram);
const layout = buildDiagramLayout();

/** A chord with the given claim, borrowing an existing one's geometry. */
function chordClaiming(overrides: Partial<ChordLayout>): ChordLayout {
  const template = layout.chords.all[0] as ChordLayout;
  return { ...template, ...overrides };
}

/** Rebuild one diagram's nodes with a single row rewritten. */
function nodesWithRow(
  context: typeof shopContext,
  moduleId: string,
  rewrite: (row: SymbolRow) => SymbolRow,
): NodeLayout[] {
  return layoutTree(context).nodes.map((node) =>
    node.id === moduleId ? { ...node, rows: node.rows.map(rewrite) } : node,
  );
}

describe('the diagram checks itself against the evaluator', () => {
  it('builds the real diagram without complaint', () => {
    expect(() => buildDiagramLayout()).not.toThrow();
  });

  it('builds every checked-in diagram without complaint', () => {
    for (const definition of [shopDiagram, example1Diagram]) {
      expect(() => buildDiagramLayout(definition)).not.toThrow();
    }
  });

  it('refuses a ✓ the model denies', () => {
    const illegal = chordClaiming({
      id: 'chord-BOGUS',
      importer: 'shipping',
      owner: 'payment',
      symbol: 'PaymentApi',
      verdict: 'allowed',
      expectDenial: undefined,
    });
    expect(() => validateChords(shopTree, [illegal])).toThrow(DiagramModelMismatch);
    expect(() => validateChords(shopTree, [illegal])).toThrow(/the model denies it/u);
  });

  it('refuses a ✗ the model allows', () => {
    const illegal = chordClaiming({
      id: 'chord-BOGUS',
      importer: 'cart',
      owner: 'payment',
      symbol: 'PaymentApi',
      verdict: 'denied',
      expectDenial: undefined,
    });
    expect(() => validateChords(shopTree, [illegal])).toThrow(/the model allows it/u);
  });

  it('refuses a denial whose stated reason is not the model’s reason', () => {
    // D5 is denied because `payment` exposes `retryQueue` nowhere at all, not
    // because some exposure chain merely failed to reach `checkout`.
    const mislabelled = chordClaiming({
      id: 'chord-BOGUS',
      importer: 'checkout',
      owner: 'payment',
      symbol: 'retryQueue',
      verdict: 'denied',
      reason: 'exposed to the parent only',
      expectDenial: 'no-exposure-chain',
    });
    expect(() => validateChords(shopTree, [mislabelled])).toThrow(/because of "never-exposed"/u);
  });

  it('accepts every chord the diagram actually draws, base and revealed', () => {
    expect(() => validateChords(shopTree, [...layout.chords.all])).not.toThrow();
  });

  it('refuses an arrowhead landing where the model denies the import', () => {
    const geometry = layoutTree(shopContext);
    const propagation = layoutPropagation(shopContext, geometry);
    const tampered = {
      ...propagation,
      lanes: propagation.lanes.map((lane) =>
        // `search` may not import `reserveStock`; claim the up-hop landed there.
        lane.decisionId === 'up-hop-inventory-neutral' ? { ...lane, reaches: 'search' } : lane,
      ),
    };
    expect(() => validateLandings(shopTree, tampered)).toThrow(/the model denies that import/u);
  });

  it('refuses a symbol drawn as stopping while a lane still carries it', () => {
    const geometry = layoutTree(shopContext);
    const propagation = layoutPropagation(shopContext, geometry);
    const nodes: NodeLayout[] = geometry.nodes.map((node) =>
      node.id === 'catalog'
        ? {
            ...node,
            rows: node.rows.map(
              (row): SymbolRow =>
                row.symbol === 'ProductId' ? { ...row, marker: '·', gray: true } : row,
            ),
          }
        : node,
    );
    expect(() => validateGrayRows(nodes, propagation)).toThrow(/draws ProductId as gray/u);
  });

  it('refuses a symbol drawn as exposed that no lane carries', () => {
    const geometry = layoutTree(shopContext);
    const propagation = layoutPropagation(shopContext, geometry);
    const nodes: NodeLayout[] = geometry.nodes.map((node) =>
      node.id === 'payment'
        ? {
            ...node,
            rows: node.rows.map(
              (row): SymbolRow =>
                row.symbol === 'retryQueue' ? { ...row, marker: '▲', gray: false } : row,
            ),
          }
        : node,
    );
    expect(() => validateGrayRows(nodes, propagation)).toThrow(/marks retryQueue as exposed/u);
  });
});

describe('node rows are checked row by row', () => {
  it('accepts every row both checked-in diagrams draw', () => {
    for (const context of [shopContext, example1Context]) {
      expect(() => validateNodeRows(context.tree, layoutTree(context).nodes)).not.toThrow();
    }
  });

  it('refuses a granted row that names the wrong ancestor', () => {
    // `computeTotal` reaches `invoiceComputation` because `app` granted it —
    // `invoicing` never had it to grant.
    const nodes = nodesWithRow(example1Context, 'invoiceComputation', (row) =>
      row.kind === 'granted' && row.symbol === 'computeTotal' ? { ...row, from: 'invoicing' } : row,
    );
    expect(() => validateNodeRows(example1Context.tree, nodes)).toThrow(DiagramModelMismatch);
    expect(() => validateNodeRows(example1Context.tree, nodes)).toThrow(
      /credits computeTotal to "invoicing", but the evaluator credits "app"/u,
    );
  });

  it('refuses an arrival drawn under the wrong clause', () => {
    // `optimizeRoute` is in `shipping` because its child exposed it upward, not
    // because anybody granted it downward.
    const nodes = nodesWithRow(example1Context, 'shipping', (row) =>
      row.symbol === 'optimizeRoute' ? { ...row, kind: 'granted' as const } : row,
    );
    expect(() => validateNodeRows(example1Context.tree, nodes)).toThrow(
      /draws optimizeRoute as a "granted" row \(ancestor-grant\), but the evaluator allows it by "child-exposure"/u,
    );
  });

  it('refuses a row for a symbol that is not available at all', () => {
    // No sibling channel: `invoicing` never sees `optimizeRoute`.
    const nodes = nodesWithRow(example1Context, 'invoicing', (row) =>
      row.symbol === 'InvoiceModel'
        ? { ...row, symbol: 'optimizeRoute', owner: 'routingOptimization' }
        : row,
    );
    expect(() => validateNodeRows(example1Context.tree, nodes)).toThrow(
      /the model denies that import \("no-exposure-chain"\)/u,
    );
  });

  it('leaves granted rows out of the gray check: they are arrivals, not stops', () => {
    // Nothing leaves `invoiceComputation`, and its two granted rows are not
    // gray. Only a `granted` exemption makes that consistent.
    const geometry = layoutTree(example1Context);
    const propagation = layoutPropagation(example1Context, geometry);
    const granted = (geometry.nodeById.get('invoiceComputation')?.rows ?? []).filter(
      (row) => row.kind === 'granted',
    );
    expect(granted).toHaveLength(2);
    expect(granted.every((row) => !row.gray)).toBe(true);
    expect(() => validateGrayRows(geometry.nodes, propagation)).not.toThrow();
  });
});
