import { describe, expect, it } from 'vitest';

import { createDiagramContext } from './diagram-definition.js';
import { example1Diagram } from './diagrams/example1.js';
import { example2Diagram } from './diagrams/example2.js';
import { example3Diagram } from './diagrams/example3.js';
import { example4Diagram } from './diagrams/example4.js';
import { shopDiagram, chordSpecs, decisionPolicies, shopTree } from './diagrams/shop.js';
import { LAYOUT, rowLabelDx, type Point } from './geometry.js';
import { buildDiagramLayout } from './layout.js';
import { descendantsOf } from './layout-nodes.js';
import { mayImport } from './model-access.js';

const layout = buildDiagramLayout();
const example1 = buildDiagramLayout(example1Diagram);

/** Parse an `M x,y L x,y …` polyline back into points. */
function points(d: string): Point[] {
  return [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/gu)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

const edgeKey = (parent: string, child: string): string => `${parent}->${child}`;

describe('node boxes', () => {
  it('gives every module a box and never lets two on a level collide', () => {
    expect(layout.tree.nodes.map((node) => node.id)).toEqual([
      'shop',
      'catalog',
      'search',
      'inventory',
      'checkout',
      'cart',
      'payment',
      'shipping',
    ]);

    for (const depth of [0, 1, 2]) {
      const row = layout.tree.nodes
        .filter((node) => node.depth === depth)
        .sort((a, b) => a.box.x - b.box.x);
      for (let index = 1; index < row.length; index += 1) {
        const previous = row[index - 1]!;
        const current = row[index]!;
        const gap = current.box.x - (previous.box.x + previous.box.width);
        // §3.9: sibling gap ≥ 48 px, driven by the four-lane worst case.
        expect(gap).toBeGreaterThanOrEqual(48);
      }
    }
  });

  it('derives the receives compartments, with the providing child, from the model alone', () => {
    const receivesOf = (id: string): string[] =>
      (layout.tree.nodeById.get(id)?.rows ?? [])
        .filter((row) => row.kind === 'fromChild')
        .map((row) => `${String(row.marker)} ${row.symbol} from ${String(row.from)}`);

    // Nothing about receiving is declared: `checkout` receives `CartApi` purely
    // because `cart` exposed it to its parent, and the gray marker is the
    // consequence of `checkout` passing it nowhere.
    expect(receivesOf('checkout')).toEqual(['▼ PaymentApi from payment', '· CartApi from cart']);
    expect(receivesOf('shop')).toEqual(['▼ ProductId from catalog']);
    expect(receivesOf('catalog')).toEqual(['· reserveStock from inventory']);
    expect(receivesOf('payment')).toEqual([]);
  });

  it('shows an absent contract as a statement, not an empty compartment', () => {
    for (const id of ['search', 'shipping']) {
      const compartments = layout.tree.nodeById.get(id)?.compartments ?? [];
      const owns = compartments.find((compartment) => compartment.kind === 'owns');
      expect(owns && 'placeholder' in owns ? owns.placeholder : undefined).toBe('(nothing owned)');
    }
    // `checkout` owns nothing but receives two symbols: the receives
    // compartment is the statement, so no empty `owns` strip is drawn.
    const checkout = layout.tree.nodeById.get('checkout');
    expect(checkout?.compartments.map((compartment) => compartment.slug)).toEqual(['receives']);
    expect(checkout?.compartments.map((compartment) => compartment.title)).toEqual(['receives']);
  });

  /**
   * A row is a line of several labels - marker, name, chip, binding note,
   * provenance - and the ones in the middle are new. Every diagram of the
   * series is checked, because the width budget that keeps them apart is
   * shared: a row must be wider than its own ink, whatever it carries.
   */
  it('never lets a row’s labels touch, in any diagram', () => {
    const provenanceCharWidth = 5.6;
    for (const definition of [
      shopDiagram,
      example1Diagram,
      example2Diagram,
      example3Diagram,
      example4Diagram,
    ]) {
      for (const node of buildDiagramLayout(definition).tree.nodes) {
        for (const row of node.rows) {
          const nameEnd = rowLabelDx(row.marker) + row.symbol.length * LAYOUT.node.nameCharWidth;
          let cursor = nameEnd;
          for (const annotation of row.annotations ?? []) {
            // Placed after everything before it, with air in between.
            expect(annotation.dx).toBeGreaterThanOrEqual(cursor);
            cursor = annotation.dx + annotation.text.length * LAYOUT.node.annotationCharWidth;
          }
          // The provenance is drawn against the box's right edge; the row's
          // content must stop before it starts.
          const provenanceStart =
            node.box.width -
            LAYOUT.node.paddingX -
            (row.provenance ?? '').length * provenanceCharWidth;
          expect(cursor).toBeLessThanOrEqual(provenanceStart);
          expect(cursor).toBeLessThanOrEqual(node.box.width - LAYOUT.node.paddingX);
        }
      }
    }
  });

  it('keeps the what-if note inside shipping and hypothetical', () => {
    const shipping = layout.tree.nodeById.get('shipping');
    const whatIf = shipping?.compartments.find((compartment) => compartment.kind === 'what-if');
    expect(whatIf).toBeDefined();
    expect(whatIf && 'lines' in whatIf ? whatIf.lines.join(' ') : '').toContain('rates');
    // `rates` and `labels` never become nodes.
    expect(layout.tree.nodes.map((node) => node.id)).not.toContain('rates');
  });
});

describe('propagation lanes', () => {
  it('bundles symbols carried by one decision into one lane', () => {
    const shopDescendantExposures = layout.propagation.decisions.filter(
      (decision) => decision.decider === 'shop' && decision.kind === 'to-descendants',
    );
    // Money and formatDate ride one lane; ProductId is traced, so it gets its own.
    expect(shopDescendantExposures.map((decision) => decision.chipText)).toEqual(['Money · formatDate', 'ProductId']);
  });

  it('runs every lane parallel to its tree edge, within the offset budget', () => {
    const budget = LAYOUT.lane.offset + 3 * LAYOUT.lane.step;
    const edgeById = new Map(layout.propagation.edges.map((edge) => [edgeKey(edge.parent, edge.child), edge]));

    for (const lane of layout.propagation.lanes) {
      const edge = edgeById.get(edgeKey(lane.parent, lane.child));
      expect(edge).toBeDefined();
      const base = points(edge!.d);
      const laid = lane.kind === 'to-parent' ? points(lane.d).reverse() : points(lane.d);
      expect(laid).toHaveLength(base.length);
      for (let index = 0; index < base.length; index += 1) {
        expect(Math.abs(laid[index]!.x - base[index]!.x)).toBeLessThanOrEqual(budget);
        expect(Math.abs(laid[index]!.y - base[index]!.y)).toBeLessThanOrEqual(budget);
      }
      // Left/right assignment is absolute: exposures to the parent left, flows to descendants right.
      expect(lane.kind === 'to-descendants' ? lane.offset > 0 : lane.offset < 0).toBe(true);
      expect(Math.abs(lane.offset)).toBeLessThanOrEqual(budget);
    }
  });

  it('respects the four-lane ceiling, and hits it exactly where the spec says', () => {
    const perEdge = new Map<string, number>();
    for (const lane of layout.propagation.lanes) {
      const key = edgeKey(lane.parent, lane.child);
      perEdge.set(key, (perEdge.get(key) ?? 0) + 1);
    }
    for (const count of perEdge.values()) {
      expect(count).toBeLessThanOrEqual(4);
    }
    // §4.4 finding 1 names `catalog->inventory` and `checkout->payment` as the
    // four-lane edges. `checkout->cart` is a third: it carries the same three
    // to-descendants lanes plus `CartApi`'s exposure to the parent. The ceiling of four is still
    // met - the spec's count of *which* edges reach it was one short.
    const worst = [...perEdge.entries()].filter(([, count]) => count === 4).map(([key]) => key);
    expect(worst.sort()).toEqual(['catalog->inventory', 'checkout->cart', 'checkout->payment']);
  });

  it('stacks lanes shallowest-origin-nearest and keeps a symbol at a stable distance', () => {
    const laneOffsets = (edge: string): { decision: string; offset: number }[] =>
      layout.propagation.lanes
        .filter((lane) => edgeKey(lane.parent, lane.child) === edge && lane.kind === 'to-descendants')
        .map((lane) => ({ decision: lane.decisionId, offset: lane.offset }))
        .sort((a, b) => a.offset - b.offset);

    expect(laneOffsets('catalog->inventory')).toEqual([
      { decision: 'to-descendants-shop-neutral', offset: 7 },
      { decision: 'to-descendants-shop-ProductId', offset: 14 },
      { decision: 'to-descendants-catalog-neutral', offset: 21 },
    ]);
    // The same ribbon keeps its distance from the trunk further down the tree.
    expect(laneOffsets('catalog->search')).toEqual(laneOffsets('catalog->inventory'));
  });

  /**
   * The flow animation marches dashes toward the end of each path, so "the way
   * the exposure travels" is only correct if every lane is *drawn* from its
   * origin to its head. Both diagrams are checked, because a new diagram must
   * not be able to introduce a lane drawn against its own flow.
   */
  it('draws every lane in the direction its exposure travels', () => {
    for (const diagram of [layout, example1]) {
      for (const lane of diagram.propagation.lanes) {
        const path = points(lane.d);
        const last = path[path.length - 1]!;
        expect(last.x).toBeCloseTo(lane.headAt.x, 6);
        expect(last.y).toBeCloseTo(lane.headAt.y, 6);
        // The head lands on the module that may therefore import it, and a
        // flow to descendants travels down while an exposure to the parent travels up.
        const first = path[0]!;
        expect(lane.kind === 'to-descendants' ? last.y > first.y : last.y < first.y).toBe(true);
      }
    }
  });

  it('lands exactly one chevron on every node an exposure to descendants reaches', () => {
    for (const decision of layout.propagation.decisions.filter((entry) => entry.kind === 'to-descendants')) {
      const reached = layout.propagation.lanes
        .filter((lane) => lane.decisionId === decision.id)
        .map((lane) => {
          expect(lane.head).toBe('chevron');
          return lane.reaches;
        });
      const expected = descendantsOf(shopTree, decision.decider);
      expect([...reached].sort()).toEqual([...expected].sort());
      expect(new Set(reached).size).toBe(reached.length);
    }
    // §3.5: two dots, seven arrivals for ProductId's journey down from the root.
    const shopProductId = layout.propagation.lanes.filter(
      (lane) => lane.decisionId === 'to-descendants-shop-ProductId',
    );
    expect(shopProductId).toHaveLength(7);
  });

  it('lands one arrowhead on the parent for every exposure to the parent, and nothing further', () => {
    for (const decision of layout.propagation.decisions.filter((entry) => entry.kind === 'to-parent')) {
      const lanes = layout.propagation.lanes.filter((lane) => lane.decisionId === decision.id);
      expect(lanes).toHaveLength(1);
      expect(lanes[0]!.head).toBe('arrow');
      expect(lanes[0]!.reaches).toBe(shopTree.modules.get(decision.decider)?.parent);
    }
    // CartApi's ribbon stops dead at checkout: one hop, and no arrow 2.
    expect(
      layout.propagation.decisions.filter((decision) => decision.layer === 'CartApi'),
    ).toHaveLength(1);
  });
});

describe('decision dots', () => {
  it('draws one dot per decision, never one per hop reached', () => {
    expect(layout.propagation.dots).toHaveLength(layout.propagation.decisions.length);
    expect(new Set(layout.propagation.dots.map((dot) => dot.decisionId)).size).toBe(
      layout.propagation.dots.length,
    );
  });

  /**
   * §4.1 reads the picture as five statements - "the entire access policy of
   * the application". The three bottom-row exposures to the parent are one of those statements
   * and three separate dots, so the checkable invariant is the partition: every
   * dot belongs to exactly one statement, and no statement is unwitnessed.
   */
  it('partitions into exactly the five policy statements of §4.1', () => {
    expect(decisionPolicies).toHaveLength(5);
    const byPolicy = new Map<string, string[]>();
    for (const dot of layout.propagation.dots) {
      byPolicy.set(dot.policyId, [...(byPolicy.get(dot.policyId) ?? []), dot.decider]);
    }
    expect([...byPolicy.keys()].sort()).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
    expect(byPolicy.get('P1')).toEqual(['shop', 'shop']);
    expect(byPolicy.get('P2')).toEqual(['catalog']);
    expect(byPolicy.get('P3')).toEqual(['catalog']);
    expect(byPolicy.get('P4')?.sort()).toEqual(['cart', 'inventory', 'payment']);
    expect(byPolicy.get('P5')).toEqual(['checkout']);
    expect(layout.propagation.dots).toHaveLength(8);
  });

  it('puts nothing gray in motion', () => {
    // Gray means *stops here*, and "here" is a module: `CartApi` is gray in
    // `checkout`'s receives compartment while travelling out of `cart`.
    const moving = new Set(
      layout.propagation.decisions.flatMap((decision) =>
        decision.symbols.map((ref) => `${decision.decider}::${ref.owner}::${ref.name}`),
      ),
    );
    for (const node of layout.tree.nodes) {
      for (const row of node.rows) {
        expect(moving.has(`${node.id}::${row.owner}::${row.symbol}`)).toBe(!row.gray);
      }
    }
  });
});

describe('import chords', () => {
  it('draws exactly the six chords of the §3.6 table', () => {
    expect(layout.chords.all.map((chord) => chord.id).sort()).toEqual([
      'chord-A1',
      'chord-D1',
      'chord-D2',
      'chord-D3',
      'chord-D4',
      'chord-D5',
    ]);

    const drawn = new Map(
      layout.chords.all.map((chord) => [
        chord.id,
        `${chord.importer} → ${chord.symbol} @ ${chord.owner} (${chord.verdict})`,
      ]),
    );
    expect(drawn.get('chord-A1')).toBe('search → ProductId @ catalog (allowed)');
    expect(drawn.get('chord-D5')).toBe('checkout → retryQueue @ payment (denied)');
    expect(drawn.get('chord-D2')).toBe('search → reserveStock @ inventory (denied)');
    expect(drawn.get('chord-D3')).toBe('shipping → PaymentApi @ payment (denied)');
    expect(drawn.get('chord-D4')).toBe('payment → CartApi @ cart (denied)');
    expect(drawn.get('chord-D1')).toBe('checkout → SkuRules @ catalog (denied)');

    // The spec's table is the source: same set, same verdicts.
    expect(layout.chords.all.map((chord) => chord.id).sort()).toEqual(
      chordSpecs.map((spec) => `chord-${spec.id}`).sort(),
    );
    expect(layout.chords.all.filter((chord) => chord.verdict === 'allowed')).toHaveLength(1);
  });

  it('routes shortest span nearest the tree, one row each, below every node box', () => {
    const rows = [...layout.chords.all].sort((a, b) => a.row - b.row);
    expect(rows.map((chord) => chord.row)).toEqual([0, 1, 2, 3, 4, 5]);
    let previousSpan = -1;
    for (const chord of rows) {
      const importer = layout.tree.nodeById.get(chord.importer)!;
      const owner = layout.tree.nodeById.get(chord.owner)!;
      const span = Math.abs(
        importer.box.x + importer.box.width / 2 - (owner.box.x + owner.box.width / 2),
      );
      expect(span).toBeGreaterThan(previousSpan - 200);
      previousSpan = span;
      for (const point of points(chord.d)) {
        expect(point.y).toBeGreaterThanOrEqual(importer.box.y);
      }
    }
    expect(layout.chords.top).toBeGreaterThan(layout.tree.bottom);
  });

  it('gives denials a stop-bar and a gap, and the one allowed chord an arrowhead', () => {
    for (const chord of layout.chords.all) {
      if (chord.verdict === 'denied') {
        expect(chord.stopBar).toBeDefined();
        expect(chord.head).toBe('none');
        const owner = layout.tree.nodeById.get(chord.owner)!;
        // The arc visibly fails to connect.
        expect(chord.headAt.y).toBeGreaterThan(owner.box.y + owner.box.height);
      } else {
        expect(chord.stopBar).toBeUndefined();
        expect(chord.head).toBe('arrow');
      }
    }
  });

  it('spends exactly one row per drawn chord, and reserves none', () => {
    // The band is the declared chords and nothing else: an allowed import a
    // reader has to go looking for is answered by the animated flow, not by a
    // row held empty against a possible selection.
    expect(layout.chords.rowCount).toBe(layout.chords.all.length);
    expect(layout.chords.rowCount).toBe(6);
    expect(layout.chords.bottom - layout.chords.top).toBe(5 * LAYOUT.chord.rowHeight + 18);
  });
});

describe('canvas', () => {
  it('stays legible: real extents, nothing clipped, nothing shrunk', () => {
    expect(layout.viewBox.width).toBeGreaterThan(900);
    expect(layout.viewBox.height).toBeGreaterThan(600);
    for (const node of layout.tree.nodes) {
      expect(node.box.x).toBeGreaterThanOrEqual(layout.viewBox.x);
      expect(node.box.x + node.box.width).toBeLessThanOrEqual(layout.viewBox.x + layout.viewBox.width);
      expect(node.box.width).toBeGreaterThanOrEqual(LAYOUT.node.minWidth);
    }
    expect(layout.legend.bottom).toBeLessThanOrEqual(layout.viewBox.y + layout.viewBox.height);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildDiagramLayout())).toBe(JSON.stringify(buildDiagramLayout()));
  });

  it('is deterministic for every checked-in diagram', () => {
    expect(JSON.stringify(buildDiagramLayout(example1Diagram))).toBe(
      JSON.stringify(buildDiagramLayout(example1Diagram)),
    );
  });
});

/**
 * Example 1 of `docs/model/illustrative-examples.md`: nine modules, four
 * symbols, seven decisions, three different reaches - plus one symbol exposed
 * only to its descendants. The doc is normative for everything asserted here.
 */
describe('example 1 - one decision, three reaches', () => {
  const rowsOf = (id: string): string[] =>
    (example1.tree.nodeById.get(id)?.rows ?? []).map(
      (row) =>
        `${row.marker ?? '_'} ${row.symbol}${row.provenance === undefined ? '' : `   ${row.provenance}`}`,
    );

  it('draws the doc’s tree, and only the doc’s tree', () => {
    expect(example1.tree.nodes.map((node) => node.id)).toEqual([
      'app',
      'globalLibrary',
      'moneyUtils',
      'invoicing',
      'invoicingLibrary',
      'invoiceComputation',
      'invoicePDF',
      'shipping',
      'routingOptimization',
    ]);
    expect(example1.tree.nodeById.get('app')?.badge).toBe('app root');
  });

  it('titles the second compartment “receives” and lists both channels', () => {
    const compartments = (id: string): string[] =>
      (example1.tree.nodeById.get(id)?.compartments ?? []).map((compartment) => compartment.title);
    expect(compartments('invoicingLibrary')).toEqual(['owns', 'receives']);
    expect(compartments('invoiceComputation')).toEqual(['receives']);
  });

  it('gives the root a contract without owning anything, and no placeholder', () => {
    // `app` owns no code and still carries the application's vocabulary.
    expect(rowsOf('app')).toEqual(['▼ computeTotal   from globalLibrary']);
    const compartments = example1.tree.nodeById.get('app')?.compartments ?? [];
    expect(compartments.map((compartment) => compartment.slug)).toEqual(['receives']);
    expect(
      compartments.some((compartment) => 'placeholder' in compartment && compartment.placeholder !== undefined),
    ).toBe(false);
  });

  it('draws the three reaches as three different rows', () => {
    // Owner: the same decision in all three cases.
    expect(rowsOf('moneyUtils')).toEqual(['▲ computeTotal']);
    expect(rowsOf('invoicingLibrary')).toEqual([
      '▲ InvoiceModel',
      '_ computeTotal   from app',
    ]);
    expect(rowsOf('routingOptimization')).toEqual([
      '▲ optimizeRoute',
      '_ computeTotal   from app',
      '_ ShipmentPlan   from shipping',
    ]);
    // Above them: passed on, turned downward, or stopped.
    expect(rowsOf('globalLibrary')).toEqual(['▲ computeTotal   from moneyUtils']);
    expect(rowsOf('invoicing')).toEqual([
      '▼ InvoiceModel   from invoicingLibrary',
      '_ computeTotal   from app',
    ]);
    expect(rowsOf('shipping')).toEqual([
      '▼ ShipmentPlan',
      '· optimizeRoute   from routingOptimization',
      '_ computeTotal   from app',
    ]);
    // `shipping` composed the symbol and stopped it: gray, and nothing gray moves.
    const stopped = (example1.tree.nodeById.get('shipping')?.rows ?? []).find(
      (row) => row.symbol === 'optimizeRoute',
    );
    expect(stopped?.gray).toBe(true);
    expect(stopped?.kind).toBe('fromChild');
  });

  it('gives an exposure’s two arrivals fromAncestor rows, never gray ones', () => {
    for (const id of ['invoiceComputation', 'invoicePDF']) {
      expect(rowsOf(id)).toEqual([
        '_ computeTotal   from app',
        '_ InvoiceModel   from invoicing',
      ]);
      const rows = example1.tree.nodeById.get(id)?.rows ?? [];
      expect(rows.map((row) => row.kind)).toEqual(['fromAncestor', 'fromAncestor']);
      expect(rows.every((row) => row.marker === undefined && !row.gray)).toBe(true);
      // Traced color, so reach can be read box by box.
      expect(rows.map((row) => row.color)).toEqual(['traced1', 'traced2']);
    }
  });

  it('draws exactly seven decision dots, partitioned by the seven policy statements', () => {
    expect(example1Diagram.decisionPolicies).toHaveLength(7);
    expect(example1.propagation.dots).toHaveLength(7);
    expect(example1.propagation.dots).toHaveLength(example1.propagation.decisions.length);

    const byPolicy = new Map<string, string[]>();
    for (const dot of example1.propagation.dots) {
      byPolicy.set(dot.policyId, [...(byPolicy.get(dot.policyId) ?? []), dot.decider]);
    }
    expect([...byPolicy.keys()].sort()).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']);
    expect(byPolicy.get('P1')).toEqual(['moneyUtils']);
    expect(byPolicy.get('P2')).toEqual(['globalLibrary']);
    expect(byPolicy.get('P3')).toEqual(['app']);
    expect(byPolicy.get('P4')).toEqual(['invoicingLibrary']);
    expect(byPolicy.get('P5')).toEqual(['invoicing']);
    expect(byPolicy.get('P6')).toEqual(['routingOptimization']);
    expect(byPolicy.get('P7')).toEqual(['shipping']);
    // Nine modules, seven decisions: complexity is measured in decisions, not boxes.
    expect(example1.tree.nodes).toHaveLength(9);
  });

  it('shows the reach of each symbol as arrivals, not as labels', () => {
    const reached = (decisionId: string): string[] =>
      example1.propagation.lanes
        .filter((lane) => lane.decisionId === decisionId)
        .map((lane) => lane.reaches)
        .sort();
    // Application-wide: every module below the root.
    expect(reached('to-descendants-app-computeTotal')).toHaveLength(8);
    // Domain-wide: the `invoicing` subtree, and nothing outside it.
    expect(reached('to-descendants-invoicing-InvoiceModel')).toEqual([
      'invoiceComputation',
      'invoicePDF',
      'invoicingLibrary',
    ]);
    // Parent-only: one hop and no second arrow.
    expect(
      example1.propagation.decisions.filter((decision) => decision.layer === 'optimizeRoute'),
    ).toHaveLength(1);
  });

  it('exposes ShipmentPlan to descendants only: descendants allowed, the parent not', () => {
    const tree = createDiagramContext(example1Diagram).tree;
    expect(mayImport(tree, 'routingOptimization', 'shipping', 'ShipmentPlan')).toBe(true);
    // The parent is not allowed while descendants are: an exposure to descendants
    // never leaves the subtree, root included.
    expect(mayImport(tree, 'app', 'shipping', 'ShipmentPlan')).toBe(false);
    expect(mayImport(tree, 'invoicing', 'shipping', 'ShipmentPlan')).toBe(false);
    // One decision, one lane, one arrival.
    const arrivals = example1.propagation.lanes
      .filter((lane) => lane.decisionId === 'to-descendants-shipping-ShipmentPlan')
      .map((lane) => lane.reaches);
    expect(arrivals).toEqual(['routingOptimization']);
  });

  it('draws nothing across the tree: non-allowed imports are read from absence', () => {
    expect(example1.chords.all).toHaveLength(0);
  });

  it('collapses the chord band entirely when no chords are declared', () => {
    expect(example1.chords.rowCount).toBe(0);
    expect(example1.chords.bottom - example1.chords.top).toBe(0);
    expect(example1.chords.bottom).toBe(example1.tree.bottom);
    // The legend follows the tree directly: no empty band in between.
    expect(example1.legend.top).toBe(example1.tree.bottom + 10);
  });
});
