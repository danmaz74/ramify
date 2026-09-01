import { describe, expect, it } from 'vitest';

import { createDiagramContext } from './diagram-definition.js';
import { example1Diagram } from './diagrams/example1.js';
import { example1aDiagram } from './diagrams/example1a.js';
import { example1bDiagram } from './diagrams/example1b.js';
import { buildDiagramLayout } from './layout.js';
import { mayImport, type ModuleDeclaration } from './model-access.js';

/**
 * Stages A and B exist so the site can build Example 1 up progressively, and
 * the build-up only works if each stage is recognizable as a *region* of the
 * full diagram: same subtrees, same decisions, same traced colors. This file
 * pins that consistency, so an edit to the finale cannot silently orphan a
 * stage.
 */

const subtreeOf = (declaration: ModuleDeclaration, id: string): ModuleDeclaration | undefined => {
  if (declaration.id === id) return declaration;
  for (const child of declaration.children ?? []) {
    const found = subtreeOf(child, id);
    if (found !== undefined) return found;
  }
  return undefined;
};

describe('the build-up stages are regions of the full example 1', () => {
  it('stage A: the shipping subtree is the full diagram’s, under an empty root', () => {
    expect(subtreeOf(example1aDiagram.declaration, 'shipping')).toEqual(
      subtreeOf(example1Diagram.declaration, 'shipping'),
    );
    const root = example1aDiagram.declaration;
    expect(root.id).toBe('app');
    expect(root.owns ?? []).toEqual([]);
    expect(root.reExposes ?? []).toEqual([]);
  });

  it('stage B: the invoicing subtree is the full diagram’s, under a root that decides nothing', () => {
    expect(subtreeOf(example1bDiagram.declaration, 'invoicing')).toEqual(
      subtreeOf(example1Diagram.declaration, 'invoicing'),
    );
    const root = example1bDiagram.declaration;
    expect(root.owns ?? []).toEqual([]);
    expect(root.reExposes ?? []).toEqual([]);
    expect((root.children ?? []).map((child) => child.id)).toEqual(['invoicing']);
  });

  it('every shared symbol keeps its color slot across the stages', () => {
    const fullBySymbol = new Map(
      example1Diagram.tracedSymbols.map((traced) => [traced.symbol, traced]),
    );
    for (const stage of [example1aDiagram, example1bDiagram]) {
      for (const traced of stage.tracedSymbols) {
        const full = fullBySymbol.get(traced.symbol);
        expect(full, `${traced.symbol} is traced in the full diagram`).toBeDefined();
        expect(traced.color).toBe(full?.color);
        expect(traced.owner).toBe(full?.owner);
      }
    }
  });

  it('stage A: two dots, and neither symbol reaches the root', () => {
    const layout = buildDiagramLayout(example1aDiagram);
    expect(layout.propagation.dots).toHaveLength(2);
    const tree = createDiagramContext(example1aDiagram).tree;
    expect(mayImport(tree, 'shipping', 'routingOptimization', 'optimizeRoute')).toBe(true);
    expect(mayImport(tree, 'routingOptimization', 'shipping', 'ShipmentPlan')).toBe(true);
    expect(mayImport(tree, 'app', 'routingOptimization', 'optimizeRoute')).toBe(false);
    expect(mayImport(tree, 'app', 'shipping', 'ShipmentPlan')).toBe(false);
  });

  it('stage B: two dots, the chain reaches the provider’s siblings, and the root gets nothing', () => {
    const layout = buildDiagramLayout(example1bDiagram);
    expect(layout.propagation.dots).toHaveLength(2);
    const tree = createDiagramContext(example1bDiagram).tree;
    for (const consumer of ['invoiceComputation', 'invoicePDF']) {
      expect(mayImport(tree, consumer, 'invoicingLibrary', 'InvoiceModel')).toBe(true);
    }
    expect(mayImport(tree, 'app', 'invoicingLibrary', 'InvoiceModel')).toBe(false);
  });

  it('lays both stages out deterministically', () => {
    for (const stage of [example1aDiagram, example1bDiagram]) {
      expect(JSON.stringify(buildDiagramLayout(stage))).toBe(
        JSON.stringify(buildDiagramLayout(stage)),
      );
    }
  });
});
