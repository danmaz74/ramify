/**
 * The whole diagram, composed and validated.
 *
 * Order matters: content and positions first, then propagation (which needs
 * positions), then chords (which need the tree's extent), then the legend
 * (which needs the chords' extent). The last step before anything is handed to
 * a renderer is `validateDiagram` — the picture proves itself against the
 * evaluator, or nothing is drawn.
 *
 * Pure and framework-free. The output is plain serializable geometry.
 */

import { createDiagramContext, type DiagramDefinition } from './diagram-definition.js';
import { shopDiagram } from './diagrams/shop.js';
import { LAYOUT, textWidth, type Point } from './geometry.js';
import { layoutChords, type ChordsLayout } from './layout-chords.js';
import { layoutLegend, type LegendLayout } from './layout-legend.js';
import { layoutPropagation, type PropagationLayout } from './layout-lanes.js';
import { layoutTree, type TreeGeometry } from './layout-nodes.js';
import { validateDiagram } from './validate.js';

export interface DiagramLayout {
  /** The diagram this geometry belongs to. A layout is self-describing. */
  readonly definition: DiagramDefinition;
  readonly tree: TreeGeometry;
  readonly propagation: PropagationLayout;
  readonly chords: ChordsLayout;
  readonly legend: LegendLayout;
  readonly title: { readonly text: string; readonly at: Point };
  /** `x y width height` for the `<svg>`, computed from real content extents. */
  readonly viewBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function emptyBounds(): Bounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

function include(bounds: Bounds, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

/** Build, validate and measure a diagram. */
export function buildDiagramLayout(definition: DiagramDefinition = shopDiagram): DiagramLayout {
  const context = createDiagramContext(definition);
  const treeGeometry = layoutTree(context);
  const propagation = layoutPropagation(context, treeGeometry);
  const chords = layoutChords(context, treeGeometry);
  const legend = layoutLegend(
    definition,
    treeGeometry.left,
    treeGeometry.right - treeGeometry.left,
    chords.bottom + 10,
  );

  validateDiagram(context.tree, treeGeometry.nodes, propagation, [...chords.all]);

  const bounds = emptyBounds();
  for (const node of treeGeometry.nodes) {
    include(bounds, node.box.x, node.box.y);
    include(bounds, node.box.x + node.box.width, node.box.y + node.box.height);
  }
  for (const chip of propagation.chips) {
    const width = Math.max(...chip.lines.map((linetext) => textWidth(linetext, LAYOUT.lane.chipCharWidth)));
    include(bounds, chip.anchor === 'end' ? chip.x - width : chip.x, chip.y - 6);
    include(bounds, chip.anchor === 'end' ? chip.x : chip.x + width, chip.y + chip.lines.length * 11);
  }
  for (const dot of propagation.dots) {
    include(bounds, dot.at.x - 4, dot.at.y - 4);
    include(bounds, dot.at.x + 4, dot.at.y + 4);
  }
  for (const chord of chords.all) {
    include(bounds, chord.badge.at.x, chord.badge.at.y + LAYOUT.chord.badgeRadius);
    if (chord.label !== undefined) {
      const width = textWidth(chord.label.text, LAYOUT.chord.labelCharWidth);
      include(bounds, chord.label.anchor === 'end' ? chord.label.at.x - width : chord.label.at.x, chord.label.at.y);
      include(bounds, chord.label.anchor === 'end' ? chord.label.at.x : chord.label.at.x + width, chord.label.at.y);
    }
  }
  include(bounds, chords.top, chords.bottom);
  for (const group of legend.groups) {
    include(bounds, group.box.x, group.box.y);
    include(bounds, group.box.x + group.box.width, group.box.y + group.box.height);
  }
  for (const note of [...legend.notes, ...legend.footnote]) {
    include(bounds, note.at.x, note.at.y - 6);
    include(bounds, note.at.x + textWidth(note.text, LAYOUT.legend.charWidth), note.at.y + 6);
  }
  const title = {
    text: definition.title,
    at: { x: treeGeometry.left, y: LAYOUT.margin + LAYOUT.title.fontSize / 2 },
  };
  include(bounds, title.at.x, title.at.y - LAYOUT.title.fontSize / 2);
  include(bounds, title.at.x + textWidth(title.text, 7.2), title.at.y);

  const pad = LAYOUT.margin;
  const viewBox = {
    x: Math.floor(bounds.minX - pad),
    y: Math.floor(bounds.minY - pad),
    width: Math.ceil(bounds.maxX - bounds.minX + 2 * pad),
    height: Math.ceil(bounds.maxY - bounds.minY + 2 * pad),
  };

  return { definition, tree: treeGeometry, propagation, chords, legend, title, viewBox };
}

const cache = new Map<DiagramDefinition, DiagramLayout>();

/**
 * A diagram's layout, built once per definition. Validation therefore runs at
 * first use — a diagram that contradicts the model fails loudly the first time
 * anything asks for it, not in a reader's browser.
 */
export function diagramLayout(definition: DiagramDefinition = shopDiagram): DiagramLayout {
  const existing = cache.get(definition);
  if (existing !== undefined) {
    return existing;
  }
  const built = buildDiagramLayout(definition);
  cache.set(definition, built);
  return built;
}

/** The core-model (shop) diagram. */
export function coreModelLayout(): DiagramLayout {
  return diagramLayout(shopDiagram);
}
