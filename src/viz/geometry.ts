/**
 * Layout constants and small geometric helpers.
 *
 * The numbers are §3.9's layout budget, adjusted where §4.4's density findings
 * said they had to be. They are hard-coded for this one example universe on
 * purpose: the plan scopes out a generic layout engine ("the renderer may
 * hard-code this example's geometry"). What is *not* hard-coded is any
 * position - every coordinate in the diagram is computed from the declaration.
 *
 * Pure: numbers and strings only.
 */

/** A point in diagram space. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An axis-aligned box, `x`/`y` at its top-left corner. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const LAYOUT = {
  /** Page margin around the whole drawing. */
  margin: 26,

  node: {
    /** §3.9: minimum node width. */
    minWidth: 150,
    /**
     * §3.9 budgets 8 px per character of the widest content line. 7 px here:
     * still a comfortable over-estimate for the 12 px system sans the rows are
     * drawn in, and it keeps the canvas inside the §3.9 width budget once the
     * derived `holds` compartments are counted.
     */
    charWidth: 7,
    paddingX: 11,
    paddingBottom: 9,
    /** §3.9: 22 px header - 24 here, so the "app root" badge is not cramped. */
    headerHeight: 24,
    /** §3.9: 18 px per symbol row. */
    rowHeight: 18,
    /** Compartment title strip (`owns`, `holds`, `what-if`). */
    compartmentTitleHeight: 16,
    /** The dashed what-if note wraps to several short lines. */
    whatIfLineHeight: 13,
    cornerRadius: 5,

    /** Width of one glyph of a row's marker column: `▲▼` is two glyphs wide. */
    markerGlyphWidth: 10,
    /**
     * Advance width of a row's 12 px symbol name - a deliberate upper bound.
     * The annotations that follow a name are placed from this estimate, and a
     * generous gap reads as a column while a negative one reads as a typo, so
     * the number is chosen to over-shoot the widest realistic name rather than
     * to average them.
     */
    nameCharWidth: 7.5,
    /**
     * Advance width of the 9.5 px muted annotations a row carries after its
     * name - the exposure-tag chip, and the binding note. Generous on purpose:
     * ``, `✓` and `·` are wider than the letters around them, and a row's
     * width budget must over-reserve rather than let two labels touch.
     */
    annotationCharWidth: 5.9,
    /** Gap before each annotation that follows a row's name. */
    annotationGap: 6,

    /** Inset of a declared context's dashed box from its node's edges. */
    contextInset: 6,
    /** Air above and below a context box's two lines. */
    contextPadding: 6,
    /** Line height inside a context box. */
    contextLineHeight: 13,
    /** Advance width of a context box's 10.5 px label and caption. */
    contextCharWidth: 5.9,
  },

  /**
   * §3.9: level spacing ≥ 96 px. 112 here, because grant-origin chips are
   * allowed to wrap to two lines (§4.4 finding 3) and the up-hop chips share
   * the same gutter.
   */
  levelGap: 112,
  /** Where the horizontal run of a tree edge sits inside the gutter. */
  busFraction: 0.52,

  /**
   * §3.9: horizontal gap between sibling boxes ≥ 48 px, driven by the four-lane
   * worst case. 92 px here: the four-lane ribbon is 28 px, and the rest is the
   * gutter the origin chips need.
   */
  siblingGap: 92,
  /** Between subtrees of different parents. */
  branchGap: 118,
  /** Enforced clearance between any two boxes on the same level. */
  minLevelClearance: 84,

  lane: {
    /** §3.9: lane offset 7 px from the edge, 7 px step between stacked lanes. */
    offset: 7,
    step: 7,
    strokeWidth: 1.6,
    dotRadius: 3.2,
    chipFontSize: 9.5,
    chipCharWidth: 5.3,
    /** Grant-origin chips wrap to at most two lines (§4.4 finding 3). */
    chipMaxLines: 2,
  },

  edge: {
    /** §4.4 finding 6: the tree edge must be visibly lighter than every lane. */
    strokeWidth: 1,
  },

  chord: {
    /** Distance from the deepest node box to the first chord row. */
    topGap: 44,
    /**
     * §3.9 budgets 6 rows at 16 px. 22 px here: each denial carries its reason
     * inline along the arc (§4.2), and 16 px rows put those labels on top of
     * each other.
     */
    rowHeight: 22,
    strokeWidth: 1.25,
    /** Denied arcs stop short of the owner by this much, and never connect. */
    gap: 13,
    stopBarHalfWidth: 7,
    badgeRadius: 8,
    labelFontSize: 9.5,
    labelCharWidth: 5.3,
    /** Horizontal spread between two chords leaving the same node. */
    endpointSpread: 11,
    /** Halo width, so a crossing chord visibly passes *under* another. */
    haloWidth: 5,
  },

  legend: {
    topGap: 30,
    columnGap: 20,
    titleHeight: 19,
    rowHeight: 16,
    glyphWidth: 50,
    fontSize: 10.5,
    charWidth: 5.3,
    noteFontSize: 10,
  },

  title: {
    fontSize: 14,
    height: 26,
  },

  /**
   * The traced-contracts panel at the top left: the diagram's selection
   * control, promoted out of the legend. A caption row, then one row per
   * traced contract - `swatch symbol - role` - stacked vertically. The band's
   * height depends only on how many contracts a diagram traces, never on the
   * selection, so selecting never reflows the tree.
   */
  header: {
    captionHeight: 27,
    // Integer, deliberately: a fractional pitch lands consecutive rows on
    // alternating half-pixels, so every other swatch rasterizes visibly
    // off-centre from its neighbour.
    rowHeight: 26,
    fontSize: 18,
    charWidth: 9.9,
    captionFontSize: 18,
    /** Length of a row's colored swatch line. */
    swatchWidth: 39,
    /** Gap between a row's swatch and its text. */
    swatchGap: 10.5,
    /**
     * How far above the row's text anchor the swatch sits. Text is
     * middle-anchored, so 0 = the anchor itself; a small lift reads as
     * centred on the name. Tune this one number to move every swatch.
     */
    swatchLift: 1.5,
    /** Air between the panel's last row and the tree. */
    bottomGap: 21,
    /** Space reserved after the caption for the live play/stop toggle. */
    toggleWidth: 84,
  },
} as const;

/** Height of the traced-contracts band above the tree; zero when nothing is traced. */
export function headerBandHeight(tracedCount: number): number {
  if (tracedCount === 0) {
    return 0;
  }
  return LAYOUT.header.captionHeight + tracedCount * LAYOUT.header.rowHeight + LAYOUT.header.bottomGap;
}

/** Round to a stable number of decimals so emitted SVG is byte-identical run to run. */
export function r(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** A polyline path, rounded for deterministic output. */
export function polyline(points: readonly Point[]): string {
  if (points.length === 0) {
    return '';
  }
  const [first, ...rest] = points as [Point, ...Point[]];
  return `M${r(first.x)},${r(first.y)}${rest.map((point) => `L${r(point.x)},${r(point.y)}`).join('')}`;
}

/** Approximate rendered width of a line of text at the given per-character width. */
export function textWidth(text: string, charWidth: number): number {
  return text.length * charWidth;
}

/**
 * x of a row's symbol name, relative to its node box's left edge.
 *
 * The name clears the marker column per glyph, because `▲▼` is two glyphs wide
 * and `▲` is one; a marker-less `granted` row keeps the one-glyph column so
 * that every name in a compartment starts at the same x.
 */
export function rowLabelDx(marker: string | undefined): number {
  return LAYOUT.node.paddingX + (marker?.length ?? 1) * LAYOUT.node.markerGlyphWidth + 2;
}

/**
 * Greedy word wrap to at most `maxChars` per line and at most `maxLines` lines.
 * A word longer than the limit gets its own line rather than being broken.
 */
export function wrapText(text: string, maxChars: number, maxLines = Number.POSITIVE_INFINITY): string[] {
  const words = text.split(/\s+/u).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length <= maxChars || current.length === 0) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  if (lines.length <= maxLines) {
    return lines;
  }
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1] ?? ''}…`;
  return kept;
}
