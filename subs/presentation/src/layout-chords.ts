/**
 * Import chords (§3.6): curved arcs between two arbitrary modules that answer
 * "may this specific module import that specific symbol?".
 *
 * Chords are deliberately unlike propagation lanes in every respect - curved
 * rather than straight, crossing open canvas rather than hugging edges,
 * thinner, and ending in a badge rather than a chevron - because they answer a
 * different kind of question. Propagation shows what the rules *did*; a chord
 * interrogates one pair.
 *
 * Drawing policy: every denial gets a chord (a refusal has no flow to ride),
 * and exactly one allowed import does - A1, the permission that surprises.
 * A diagram draws the chords it declares and no others: an allowed import a
 * reader has to go looking for is answered by the propagation flow, which
 * animates on selection, not by a fan of arcs across the canvas.
 *
 * `d3-shape` is used here as a math library: a line generator with a
 * Catmull-Rom curve, which passes through the row's mid-point exactly, so the
 * badge sits on the arc rather than near it.
 */

import type { ChordSpec, ColorKey, DiagramContext } from './diagram-definition.js';
import { LAYOUT, textWidth, placeChords, polyline, type Point } from '../subs/layout/src/index.js';
import { placementGraph, type NodeLayout, type TreeGeometry } from './layout-nodes.js';
import type { ImportReason, ModuleId, SymbolName } from './model-access.js';

export interface ChordLayout {
  readonly id: string;
  readonly importer: ModuleId;
  readonly owner: ModuleId;
  readonly symbol: SymbolName;
  readonly verdict: 'allowed' | 'denied';
  readonly reason: string;
  readonly color: ColorKey;
  readonly layer: string;
  readonly row: number;
  readonly d: string;
  readonly badge: { readonly at: Point; readonly text: '✓' | '✗' };
  readonly label?: {
    readonly at: Point;
    readonly anchor: 'start' | 'end';
    readonly text: string;
    /** Knock-out plate: the reason must never be struck through by an arc. */
    readonly plate: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  };
  /** Denials only: the arc stops here and visibly fails to connect. */
  readonly stopBar?: { readonly at: Point; readonly halfWidth: number };
  readonly head: 'arrow' | 'none';
  readonly headAt: Point;
  readonly expectDenial?: ImportReason;
}

export interface ChordsLayout {
  /** Every chord the diagram draws, one row each. */
  readonly all: readonly ChordLayout[];
  readonly top: number;
  readonly bottom: number;
  readonly rowCount: number;
}

interface ChordInput {
  readonly id: string;
  readonly importer: ModuleId;
  readonly owner: ModuleId;
  readonly symbol: SymbolName;
  readonly verdict: 'allowed' | 'denied';
  readonly reason: string;
  readonly expectDenial?: ImportReason;
}

function buildChords(
  context: DiagramContext,
  inputs: readonly ChordInput[],
  geometry: TreeGeometry,
  rowTop: number,
): ChordLayout[] {
  const nodeOf = (id: ModuleId): NodeLayout => {
    const node = geometry.nodeById.get(id);
    if (node === undefined) {
      throw new Error(`No layout for module "${id}".`);
    }
    return node;
  };

  const byId = new Map(inputs.map(input => [input.id, input]));
  const stable = [...inputs].sort((a, b) => a.id.localeCompare(b.id));
  const placed = placeChords({ ...placementGraph(context, geometry), edges: stable.map((input, order) => ({
    key: input.id, from: input.importer, to: input.owner,
    lane: input.verdict === 'denied' ? LAYOUT.chord.gap : 0, order,
  })) }, { gapX: LAYOUT.siblingGap, gapY: LAYOUT.levelGap, padding: LAYOUT.margin, orientation: 'vertical' });
  const shiftY = geometry.top - LAYOUT.margin;
  return placed.edges.map((edge, row) => {
    const input = byId.get(edge.key) as ChordInput;
    const owner = nodeOf(input.owner);
    const points = edge.points.map(point => ({ x: point.x, y: point.y + shiftY }));
    const first = points[0];
    const last = points[points.length - 1];
    if (first === undefined || last === undefined) throw new Error('Empty chord placement.');
    const rowY = rowTop + row * LAYOUT.chord.rowHeight;
    const x1 = first.x;
    const x2 = last.x;
    const y2 = last.y;
    const ownerBottom = owner.box.y + owner.box.height;
    const denied = input.verdict === 'denied';
    const midX = (x1 + x2) / 2;

    const color: ColorKey = denied ? 'denial' : context.symbolColor(input.owner, input.symbol);
    const labelWidth = textWidth(input.reason, LAYOUT.chord.labelCharWidth);
    const labelFitsRight = midX + LAYOUT.chord.badgeRadius + 8 + labelWidth < geometry.right + 40;

    return {
      id: `chord-${input.id}`,
      importer: input.importer,
      owner: input.owner,
      symbol: input.symbol,
      verdict: input.verdict,
      reason: input.reason,
      color,
      layer: context.layerFor(input.owner, input.symbol),
      row,
      d: polyline(points),
      badge: { at: { x: midX, y: rowY }, text: denied ? '✗' : '✓' },
      ...(input.reason.length === 0
        ? {}
        : {
            label: labelLayout(
              midX + (labelFitsRight ? 1 : -1) * (LAYOUT.chord.badgeRadius + 7),
              rowY,
              labelFitsRight ? 'start' : 'end',
              input.reason,
              labelWidth,
            ),
          }),
      ...(denied
        ? { stopBar: { at: { x: x2, y: ownerBottom + 2 }, halfWidth: LAYOUT.chord.stopBarHalfWidth } }
        : {}),
      head: denied ? ('none' as const) : ('arrow' as const),
      headAt: { x: x2, y: y2 },
      ...(input.expectDenial === undefined ? {} : { expectDenial: input.expectDenial }),
    };
  });
}

function labelLayout(
  x: number,
  y: number,
  anchor: 'start' | 'end',
  text: string,
  width: number,
): NonNullable<ChordLayout['label']> {
  return {
    at: { x, y },
    anchor,
    text,
    plate: { x: (anchor === 'start' ? x : x - width) - 3, y: y - 6.5, width: width + 6, height: 13 },
  };
}

function fromSpec(spec: ChordSpec): ChordInput {
  return {
    id: spec.id,
    importer: spec.importer,
    owner: spec.owner,
    symbol: spec.symbol,
    verdict: spec.verdict,
    reason: spec.reason,
    ...(spec.expectDenial === undefined ? {} : { expectDenial: spec.expectDenial }),
  };
}

/**
 * Lay out the chords a diagram declares.
 *
 * The band is sized to those chords and nothing else: no rows are held in
 * reserve, so a diagram that asks one question spends one row on it - and a
 * diagram that draws none has no band at all.
 */
export function layoutChords(context: DiagramContext, geometry: TreeGeometry): ChordsLayout {
  const rowTop = geometry.bottom + LAYOUT.chord.topGap;
  const all = buildChords(context, context.definition.chordSpecs.map(fromSpec), geometry, rowTop);
  if (all.length === 0) {
    return { all, top: geometry.bottom, bottom: geometry.bottom, rowCount: 0 };
  }
  const rowCount = Math.max(1, ...all.map((chord) => chord.row + 1));
  return {
    all,
    top: rowTop,
    bottom: rowTop + (rowCount - 1) * LAYOUT.chord.rowHeight + 18,
    rowCount,
  };
}
