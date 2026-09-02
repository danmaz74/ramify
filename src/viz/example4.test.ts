import { describe, expect, it } from 'vitest';

import { createDiagramContext } from './diagram-definition.js';
import { example4Diagram } from './diagrams/example4.js';
import { buildDiagramLayout } from './layout.js';
import type { DrawnContext } from './layout-nodes.js';
import { moduleTagsOf, isAvailable, mayImport } from './model-access.js';

const example4 = buildDiagramLayout(example4Diagram);
const { tree } = createDiagramContext(example4Diagram);

const uiValue = { module: 'ui', binding: 'value' } as const;
const uiType = { module: 'ui', binding: 'type' } as const;

/**
 * Example 4 (`./diagrams/example4.ts`): four modules, two symbols with
 * identical exposures, one of them tagged `browser`, and one browser module.
 * The diagram file is normative for everything asserted here.
 */
describe('example 4 - a promise about the closure', () => {
  const rowsOf = (id: string): string[] =>
    (example4.tree.nodeById.get(id)?.rows ?? []).map(
      (row) =>
        `${row.marker ?? '_'} ${row.symbol}` +
        `${(row.annotations ?? []).map((annotation) => ` ${annotation.text}`).join('')}` +
        `${row.provenance === undefined ? '' : `   ${row.provenance}`}`,
    );

  const contextsOf = (id: string): DrawnContext[] => {
    const node = example4.tree.nodeById.get(id);
    const named = (node?.compartments ?? []).flatMap((compartment) =>
      compartment.kind === 'context' ? [compartment.context] : [],
    );
    return node?.moduleContext === undefined ? named : [...named, node.moduleContext];
  };

  it('draws the declared tree, and only the declared tree', () => {
    expect(example4.tree.nodes.map((node) => node.id)).toEqual(['app', 'shared', 'ui', 'server']);
    expect(example4.tree.nodeById.get('app')?.badge).toBe('app root');
  });

  it('makes availability uniform, so the tag is the only variable', () => {
    for (const consumer of ['app', 'shared', 'ui', 'server']) {
      for (const symbol of ['formatMoney', 'queryDb']) {
        expect(isAvailable(tree, consumer, 'shared', symbol)).toBe(true);
      }
    }
    expect(rowsOf('server')).toEqual([
      '_ formatMoney ⇤ browser   from app',
      '_ queryDb   from app',
    ]);
  });

  it('wears the chip on the owner’s row and on every arrival', () => {
    expect(rowsOf('shared')).toEqual(['▲ formatMoney ⇤ browser', '▲ queryDb']);
    expect(rowsOf('app')).toEqual([
      '▼ formatMoney ⇤ browser   from shared',
      '▼ queryDb   from shared',
    ]);
    for (const id of ['app', 'shared', 'ui', 'server']) {
      const tagged = (example4.tree.nodeById.get(id)?.rows ?? []).find(
        (row) => row.symbol === 'formatMoney',
      );
      expect(tagged?.tags).toEqual(['browser']);
    }
  });

  it('reproduces the verdict table through the evaluator', () => {
    // | server                | ✓ | ✓ |
    expect(mayImport(tree, 'server', 'shared', 'formatMoney')).toBe(true);
    expect(mayImport(tree, 'server', 'shared', 'queryDb')).toBe(true);
    // | ui (value import)     | ✓ | ✗ - a browser module value-imports only browser symbols |
    expect(mayImport(tree, uiValue, 'shared', 'formatMoney')).toBe(true);
    expect(mayImport(tree, uiValue, 'shared', 'queryDb')).toBe(false);
    // | ui (type-only import) | ✓ | ✓ - erased at runtime |
    expect(mayImport(tree, uiType, 'shared', 'formatMoney')).toBe(true);
    expect(mayImport(tree, uiType, 'shared', 'queryDb')).toBe(true);
  });

  it('classifies a whole module: the dashed box fills its node', () => {
    expect(contextsOf('shared')).toEqual([]);
    expect(contextsOf('server')).toEqual([]);
    expect(contextsOf('app')).toEqual([]);

    const ui = example4.tree.nodeById.get('ui');
    expect(ui?.moduleContext?.name).toBeUndefined();
    expect(ui?.moduleContext?.label).toBe('⇤ browser');
    expect(ui?.moduleContext?.tags).toEqual(['browser']);
    expect(ui?.moduleContext?.caption).toBe('browser module');
    expect(moduleTagsOf(tree, 'ui')).toEqual(['browser']);
    // No compartment of its own: the module *is* the context, so nothing was
    // added to the box's content for it.
    expect((ui?.compartments ?? []).map((compartment) => compartment.kind)).toEqual(['received']);
  });

  it('strikes queryDb in ui, with the type-available asterisk', () => {
    expect(rowsOf('ui')).toEqual([
      '_ formatMoney ⇤ browser   from app',
      '_ queryDb   from app',
    ]);

    // The strike is the value-import verdict, exactly; the unstruck `*` after
    // the struck name is the one mark the type story leaves in the picture.
    const struckRows = example4.tree.nodes.flatMap((node) =>
      node.rows.filter((row) => row.struck).map((row) => `${node.id}/${row.symbol}`),
    );
    expect(struckRows).toEqual(['ui/queryDb']);
    const struck = (example4.tree.nodeById.get('ui')?.rows ?? []).find(
      (row) => row.symbol === 'queryDb',
    );
    expect(struck?.typeAvailable).toBe(true);
    expect(mayImport(tree, uiValue, 'shared', 'queryDb')).toBe(false);
    expect(mayImport(tree, uiType, 'shared', 'queryDb')).toBe(true);

    // Every other row is available, hence type-available, hence unmarked.
    for (const node of example4.tree.nodes) {
      for (const row of node.rows) {
        expect(row.typeAvailable).toBe(true);
      }
    }
  });

  it('blinks only the arrivals that may really import the selection', () => {
    const blinkingFor = (symbol: string): string[] => [
      ...example4.tree.nodes.flatMap((node) =>
        node.rows
          .filter((row) => row.symbol === symbol && row.kind !== 'owns' && row.importable)
          .map((row) => `${node.id}/${row.symbol}`),
      ),
      ...example4.tree.nodes.flatMap((node) =>
        contextsOf(node.id)
          .filter((context) => context.imports.includes(symbol))
          .map((context) => `${node.id}/${context.name ?? 'module'}`),
      ),
    ];

    // Selecting queryDb: server blinks, ui stays dark - the mirror image of
    // example 3's selection story.
    expect(blinkingFor('queryDb')).toEqual(['app/queryDb', 'server/queryDb']);
    // Selecting formatMoney: both blink, and the ui box lights up with its row.
    expect(blinkingFor('formatMoney')).toEqual([
      'app/formatMoney',
      'ui/formatMoney',
      'server/formatMoney',
      'ui/module',
    ]);
    expect(example4.tree.nodeById.get('ui')?.moduleContext?.imports).toEqual(['formatMoney']);
  });

  it('draws four decision dots, partitioned by the two policy statements', () => {
    expect(example4Diagram.decisionPolicies).toHaveLength(2);
    expect(example4.propagation.dots).toHaveLength(4);

    const byPolicy = new Map<string, string[]>();
    for (const dot of example4.propagation.dots) {
      byPolicy.set(dot.policyId, [...(byPolicy.get(dot.policyId) ?? []), dot.decider]);
    }
    expect([...byPolicy.keys()].sort()).toEqual(['P1', 'P2']);
    expect(byPolicy.get('P1')).toEqual(['shared', 'shared']);
    expect(byPolicy.get('P2')).toEqual(['app', 'app']);
    // Three arrivals per exposure to descendants, one per hop up: the exposure
    // reaches the whole subtree, providing branch included.
    expect(example4.propagation.lanes).toHaveLength(8);
  });

  it('draws nothing across the tree, and is deterministic', () => {
    expect(example4.chords.all).toHaveLength(0);
    expect(example4Diagram.footnote).toEqual([]);
    expect(JSON.stringify(buildDiagramLayout(example4Diagram))).toBe(
      JSON.stringify(buildDiagramLayout(example4Diagram)),
    );
  });
});
