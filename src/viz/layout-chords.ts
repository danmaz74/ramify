/**
 * Import chords (§3.6): curved arcs between two arbitrary modules that answer
 * "may this specific module import that specific symbol?".
 *
 * Chords are deliberately unlike propagation lanes in every respect — curved
 * rather than straight, crossing open canvas rather than hugging edges,
 * thinner, and ending in a badge rather than a chevron — because they answer a
 * different kind of question. Propagation shows what the rules *did*; a chord
 * interrogates one pair.
 *
 * Drawing policy: every denial gets a chord (a refusal has no flow to ride),
 * and exactly one allowed import does — A1, the permission that surprises.
 * A diagram draws the chords it declares and no others: an allowed import a
 * reader has to go looking for is answered by the propagation flow, which
 * animates on selection, not by a fan of arcs across the canvas.
 *
 * `d3-shape` is used here as a math library: a line generator with a
 * Catmull-Rom curve, which passes through the row's mid-point exactly, so the
 * badge sits on the arc rather than near it.
 */

import { curveCatmullRom, line as d3Line } from 'd3-shape';

import type { ChordSpec, ColorKey, DiagramContext } from './diagram-definition.js';
import { LAYOUT, textWidth, type Point } from './geometry.js';
import type { NodeLayout, TreeGeometry } from './layout-nodes.js';
import type { DenialReason, ModuleId, SymbolName } from './model-access.js';

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
  readonly expectDenial?: DenialReason;
}

export interface ChordsLayout {
  /** Every chord the diagram draws, one row each. */
  readonly all: readonly ChordLayout[];
  readonly top: number;
  readonly bottom: number;
  readonly rowCount: number;
}

type Interval = readonly [number, number];

function freeIntervals(boxes: readonly NodeLayout[], lo: number, hi: number, pad: number): Interval[] {
  const blocked = boxes
    .map((node): Interval => [node.box.x - pad, node.box.x + node.box.width + pad])
    .sort((a, b) => a[0] - b[0]);
  const free: Interval[] = [];
  let cursor = lo;
  for (const [start, end] of blocked) {
    if (start > cursor) {
      free.push([cursor, Math.min(start, hi)]);
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < hi) {
    free.push([cursor, hi]);
  }
  return free.filter(([start, end]) => end - start > 4);
}

function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [aStart, aEnd] of a) {
    for (const [bStart, bEnd] of b) {
      const start = Math.max(aStart, bStart);
      const end = Math.min(aEnd, bEnd);
      if (end - start > 4) {
        out.push([start, end]);
      }
    }
  }
  return out;
}

/**
 * The x a node's chords drop through: as close to the node's centre as
 * possible while clearing every box on every level below it, so that no chord
 * is ever drawn over a node box (§3.6, routing).
 */
export function corridorX(geometry: TreeGeometry, node: NodeLayout): number {
  const center = node.box.x + node.box.width / 2;
  const below = geometry.nodes.filter((other) => other.depth > node.depth);
  if (below.length === 0) {
    return center;
  }
  const lo = geometry.left - 40;
  const hi = geometry.right + 40;
  const depths = [...new Set(below.map((other) => other.depth))].sort((a, b) => a - b);
  let candidates: Interval[] = [[lo, hi]];
  for (const depth of depths) {
    candidates = intersect(
      candidates,
      freeIntervals(below.filter((other) => other.depth === depth), lo, hi, 14),
    );
  }
  if (candidates.length === 0) {
    return center;
  }
  const clamp = ([start, end]: Interval): number => Math.min(Math.max(center, start), end);
  const best = candidates.reduce((chosen, candidate) =>
    Math.abs(clamp(candidate) - center) < Math.abs(clamp(chosen) - center) ? candidate : chosen,
  );
  return clamp(best);
}

const curve = d3Line<Point>()
  .x((point) => point.x)
  .y((point) => point.y)
  .curve(curveCatmullRom.alpha(0.5));

function round(path: string): string {
  return path.replace(/-?\d+\.\d+/gu, (match) => String(Math.round(Number(match) * 100) / 100));
}

interface ChordInput {
  readonly id: string;
  readonly importer: ModuleId;
  readonly owner: ModuleId;
  readonly symbol: SymbolName;
  readonly verdict: 'allowed' | 'denied';
  readonly reason: string;
  readonly expectDenial?: DenialReason;
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

  // Shortest span nearest the tree.
  const ordered = [...inputs].sort((a, b) => {
    const spanA = Math.abs(corridorX(geometry, nodeOf(a.importer)) - corridorX(geometry, nodeOf(a.owner)));
    const spanB = Math.abs(corridorX(geometry, nodeOf(b.importer)) - corridorX(geometry, nodeOf(b.owner)));
    return spanA - spanB || a.id.localeCompare(b.id);
  });

  // Two chords leaving the same node get separate attachment points.
  const attachments = new Map<string, number>();
  const perNode = new Map<ModuleId, string[]>();
  for (const input of ordered) {
    for (const moduleId of [input.importer, input.owner]) {
      const list = perNode.get(moduleId) ?? [];
      list.push(`${input.id}:${moduleId === input.importer ? 'importer' : 'owner'}`);
      perNode.set(moduleId, list);
    }
  }
  for (const [moduleId, keys] of perNode) {
    const base = corridorX(geometry, nodeOf(moduleId));
    keys.forEach((key, index) => {
      attachments.set(key, base + (index - (keys.length - 1) / 2) * LAYOUT.chord.endpointSpread);
    });
  }

  return ordered.map((input, row) => {
    const importer = nodeOf(input.importer);
    const owner = nodeOf(input.owner);
    const rowY = rowTop + row * LAYOUT.chord.rowHeight;
    const x1 = attachments.get(`${input.id}:importer`) ?? corridorX(geometry, importer);
    const x2 = attachments.get(`${input.id}:owner`) ?? corridorX(geometry, owner);
    const y1 = importer.box.y + importer.box.height;
    const ownerBottom = owner.box.y + owner.box.height;
    const denied = input.verdict === 'denied';
    const y2 = denied ? ownerBottom + LAYOUT.chord.gap : ownerBottom;
    const midX = (x1 + x2) / 2;

    const points: Point[] = [
      { x: x1, y: y1 },
      { x: x1, y: rowY - 12 },
      { x: midX, y: rowY },
      { x: x2, y: rowY - 12 },
      { x: x2, y: y2 },
    ];
    const d = curve(points);
    if (d === null) {
      throw new Error(`Could not build the arc for chord "${input.id}".`);
    }

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
      d: round(d),
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
 * reserve, so a diagram that asks one question spends one row on it.
 */
export function layoutChords(context: DiagramContext, geometry: TreeGeometry): ChordsLayout {
  const rowTop = geometry.bottom + LAYOUT.chord.topGap;
  const all = buildChords(context, context.definition.chordSpecs.map(fromSpec), geometry, rowTop);
  const rowCount = Math.max(1, ...all.map((chord) => chord.row + 1));
  return {
    all,
    top: rowTop,
    bottom: rowTop + (rowCount - 1) * LAYOUT.chord.rowHeight + 18,
    rowCount,
  };
}
