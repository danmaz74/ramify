import { describe, expect, it } from 'vitest';

import { createDiagramContext } from './diagram-definition.js';
import { example3Diagram } from './diagrams/example3.js';
import { buildDiagramLayout } from './layout.js';
import type { DrawnContext } from './layout-nodes.js';
import { moduleTagsOf, symbolTagsOf, isAvailable, mayImport } from './model-access.js';

const example3 = buildDiagramLayout(example3Diagram);
const { tree } = createDiagramContext(example3Diagram);

/** The test module - the importer the doc's second row is about. */
const integrationTests = 'integration-tests';

/**
 * Example 3 of `docs/model/illustrative-examples.md`: four modules, two
 * symbols with identical exposures, one of them tagged `testing`. The
 * doc is normative for everything asserted here.
 */
describe('example 3 - the tag is the entire difference', () => {
  const rowsOf = (id: string): string[] =>
    (example3.tree.nodeById.get(id)?.rows ?? []).map(
      (row) =>
        `${row.marker ?? '_'} ${row.symbol}` +
        `${(row.annotations ?? []).map((annotation) => ` ${annotation.text}`).join('')}` +
        `${row.provenance === undefined ? '' : `   ${row.provenance}`}`,
    );

  const contextsOf = (id: string): DrawnContext[] => {
    const node = example3.tree.nodeById.get(id);
    const named = (node?.compartments ?? []).flatMap((compartment) =>
      compartment.kind === 'context' ? [compartment.context] : [],
    );
    return node?.moduleContext === undefined ? named : [...named, node.moduleContext];
  };

  it('draws the doc’s tree, and only the doc’s tree', () => {
    expect(example3.tree.nodes.map((node) => node.id)).toEqual([
      'app',
      'orders',
      'billing',
      'integration-tests',
    ]);
    expect(example3.tree.nodeById.get('app')?.badge).toBe('app root');
  });

  it('makes availability uniform, so the tag is the only variable', () => {
    for (const consumer of ['app', 'orders', 'billing', 'integration-tests']) {
      for (const symbol of ['OrderService', 'resetOrderStore']) {
        expect(isAvailable(tree, consumer, 'orders', symbol)).toBe(true);
      }
    }
    // Same chain, same rows, same provenance - twice.
    expect(rowsOf('billing')).toEqual([
      '_ OrderService   from app',
      '_ resetOrderStore ⇥ testing   from app',
    ]);
  });

  it('wears the chip on the owner’s row and on every arrival', () => {
    expect(rowsOf('orders')).toEqual(['▲ OrderService', '▲ resetOrderStore ⇥ testing']);
    expect(rowsOf('app')).toEqual([
      '▼ OrderService   from orders',
      '▼ resetOrderStore ⇥ testing   from orders',
    ]);

    // …the test module's arrivals included.
    expect(rowsOf('integration-tests')).toEqual([
      '_ OrderService   from app',
      '_ resetOrderStore ⇥ testing   from app',
    ]);

    // The chip is the owner's declaration, drawn wherever the symbol arrives.
    for (const id of ['app', 'orders', 'billing', 'integration-tests']) {
      const tagged = (example3.tree.nodeById.get(id)?.rows ?? []).filter(
        (row) => row.symbol === 'resetOrderStore',
      );
      expect(tagged).toHaveLength(1);
      expect(tagged[0]?.tags).toEqual(['testing']);
      expect(tagged[0]?.annotations?.map((annotation) => annotation.kind)).toEqual(['tags']);
      const untagged = (example3.tree.nodeById.get(id)?.rows ?? []).filter(
        (row) => row.symbol === 'OrderService',
      );
      expect(untagged[0]?.tags).toBeUndefined();
      expect(untagged[0]?.annotations).toBeUndefined();
    }
    expect(symbolTagsOf(tree, 'orders', 'resetOrderStore')).toEqual(['testing']);
    expect(symbolTagsOf(tree, 'orders', 'OrderService')).toEqual([]);
  });

  it('reproduces the doc’s verdict table through the evaluator', () => {
    // | billing (production)  | ✓ | ✗ - available only in testing modules |
    expect(mayImport(tree, 'billing', 'orders', 'OrderService')).toBe(true);
    expect(mayImport(tree, 'billing', 'orders', 'resetOrderStore')).toBe(false);
    // | integration-tests (test module) | ✓ | ✓ |
    expect(mayImport(tree, integrationTests, 'orders', 'OrderService')).toBe(true);
    expect(mayImport(tree, integrationTests, 'orders', 'resetOrderStore')).toBe(true);
    // The refusal is the tag's, not the tree's.
    expect(mayImport(tree, 'billing', 'orders', 'resetOrderStore')).toBe(false);
    expect(isAvailable(tree, 'billing', 'orders', 'resetOrderStore')).toBe(true);
  });

  it('classifies the whole test module as the context', () => {
    expect(contextsOf('orders')).toEqual([]);
    expect(contextsOf('billing')).toEqual([]);
    // `app` declares nothing: the tests are their own module now, and the
    // classification lives on that module, not inside its parent.
    const compartments = example3.tree.nodeById.get('app')?.compartments ?? [];
    expect(compartments.map((compartment) => compartment.kind)).toEqual(['received']);

    const node = example3.tree.nodeById.get('integration-tests');
    expect(node?.moduleContext?.name).toBeUndefined();
    expect(node?.moduleContext?.label).toBe('⇥ testing');
    expect(node?.moduleContext?.tags).toEqual(['testing']);
    expect(node?.moduleContext?.caption).toBe('testing module');
    expect(moduleTagsOf(tree, 'integration-tests')).toEqual(['testing']);
    // The verdict table again, read off the drawn box this time.
    expect(node?.moduleContext?.imports).toEqual(['OrderService', 'resetOrderStore']);
  });

  it('blinks only the arrivals that may really import the selection', () => {
    // Selecting resetOrderStore: the test module blinks, billing stays dark -
    // and so does app's own row, for exactly the same reason.
    const blinkingFor = (symbol: string): string[] => [
      ...example3.tree.nodes.flatMap((node) =>
        node.rows
          .filter((row) => row.symbol === symbol && row.kind !== 'owns' && row.importable)
          .map((row) => `${node.id}/${row.symbol}`),
      ),
      ...example3.tree.nodes.flatMap((node) =>
        contextsOf(node.id)
          .filter((context) => context.imports.includes(symbol))
          .map((context) => `${node.id}/${context.name ?? 'module'}`),
      ),
    ];

    expect(blinkingFor('resetOrderStore')).toEqual([
      'integration-tests/resetOrderStore',
      'integration-tests/module',
    ]);
    expect(blinkingFor('OrderService')).toEqual([
      'app/OrderService',
      'billing/OrderService',
      'integration-tests/OrderService',
      'integration-tests/module',
    ]);

    // The dark rows are drawn all the same: absence is not the statement here,
    // the chip is.
    const billing = example3.tree.nodeById.get('billing')?.rows ?? [];
    expect(billing.map((row) => `${row.symbol}:${String(row.importable)}`)).toEqual([
      'OrderService:true',
      'resetOrderStore:false',
    ]);

    // …and struck: the testing rule covers both import forms, so the row is
    // visible-not-available outright, everywhere but the testing module - and
    // never wears the type-available asterisk.
    const struckRows = example3.tree.nodes.flatMap((node) =>
      node.rows.filter((row) => row.struck).map((row) => `${node.id}/${row.symbol}`),
    );
    expect(struckRows).toEqual(['app/resetOrderStore', 'billing/resetOrderStore']);
    for (const node of example3.tree.nodes) {
      for (const row of node.rows) {
        expect(row.struck && row.typeAvailable).toBe(false);
      }
    }
  });

  it('annotates no binding: a testing requirement exempts none', () => {
    for (const node of example3.tree.nodes) {
      for (const row of node.rows) {
        expect((row.annotations ?? []).map((annotation) => annotation.kind)).not.toContain(
          'binding',
        );
        expect(mayImport(tree, { module: node.id, binding: 'type' }, row.owner, row.symbol)).toBe(
          row.importable,
        );
      }
    }
  });

  it('draws four decision dots, partitioned by the two policy statements', () => {
    expect(example3Diagram.decisionPolicies).toHaveLength(2);
    expect(example3.propagation.dots).toHaveLength(4);

    const byPolicy = new Map<string, string[]>();
    for (const dot of example3.propagation.dots) {
      byPolicy.set(dot.policyId, [...(byPolicy.get(dot.policyId) ?? []), dot.decider]);
    }
    expect([...byPolicy.keys()].sort()).toEqual(['P1', 'P2']);
    expect(byPolicy.get('P1')).toEqual(['orders', 'orders']);
    expect(byPolicy.get('P2')).toEqual(['app', 'app']);
  });

  it('draws nothing across the tree, and is deterministic', () => {
    expect(example3.chords.all).toHaveLength(0);
    expect(example3Diagram.footnote).toEqual([]);
    expect(JSON.stringify(buildDiagramLayout(example3Diagram))).toBe(
      JSON.stringify(buildDiagramLayout(example3Diagram)),
    );
  });
});
