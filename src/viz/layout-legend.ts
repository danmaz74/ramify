/**
 * Legend layout (§3.8) and the uniform-exposure footnote (§1.5).
 *
 * Four short groups, flowed left to right across the available width and
 * wrapping to a second band when they no longer fit, then the two standing
 * notes. The traced-contract chips are the diagram's selection control: each
 * carries the symbol it selects.
 *
 * Pure: positions only. The glyph samples themselves are drawn by the view.
 */

import type { DiagramDefinition, LegendEntry } from './diagram-definition.js';
import { LAYOUT, textWidth, type Box, type Point } from './geometry.js';

export interface LegendEntryLayout {
  readonly entry: LegendEntry;
  /** Centre of the glyph sample's cell. */
  readonly glyphAt: Point;
  readonly glyphWidth: number;
  readonly textAt: Point;
  /** Hit area, so a chip is comfortable to click. */
  readonly hitBox: Box;
}

export interface LegendGroupLayout {
  readonly id: string;
  readonly title: string;
  readonly titleAt: Point;
  readonly entries: readonly LegendEntryLayout[];
  readonly box: Box;
}

export interface LegendLayout {
  readonly groups: readonly LegendGroupLayout[];
  readonly notes: readonly { readonly text: string; readonly at: Point }[];
  readonly footnote: readonly { readonly text: string; readonly at: Point }[];
  readonly top: number;
  readonly bottom: number;
}

function groupWidth(title: string, entries: readonly LegendEntry[]): number {
  const textWidths = entries.map((entry) => textWidth(entry.text, LAYOUT.legend.charWidth));
  return Math.max(
    textWidth(title, LAYOUT.legend.charWidth) + 4,
    LAYOUT.legend.glyphWidth + Math.max(0, ...textWidths) + 8,
  );
}

/**
 * @param definition the diagram whose legend groups, notes and footnote to lay out
 * @param left  left edge of the content column
 * @param width available width before wrapping to a new band
 * @param top   first free y under the chord rows
 */
export function layoutLegend(
  definition: DiagramDefinition,
  left: number,
  width: number,
  top: number,
): LegendLayout {
  const { legendGroups, legendNotes, footnote: footnoteLines } = definition;
  const footnote = footnoteLines.map((text, index) => ({
    text,
    at: { x: left, y: top + 6 + index * 13 },
  }));
  const footnoteBottom = top + 6 + footnoteLines.length * 13;

  const bandTop = footnoteBottom + LAYOUT.legend.topGap;
  const groups: LegendGroupLayout[] = [];
  let cursorX = left;
  let cursorY = bandTop;
  let bandHeight = 0;

  for (const group of legendGroups) {
    const boxWidth = groupWidth(group.title, group.entries);
    if (cursorX > left && cursorX + boxWidth > left + width) {
      cursorX = left;
      cursorY += bandHeight + 12;
      bandHeight = 0;
    }
    const height = LAYOUT.legend.titleHeight + group.entries.length * LAYOUT.legend.rowHeight;
    const entries = group.entries.map((entry, index) => {
      const rowY = cursorY + LAYOUT.legend.titleHeight + index * LAYOUT.legend.rowHeight + LAYOUT.legend.rowHeight / 2;
      return {
        entry,
        glyphAt: { x: cursorX + LAYOUT.legend.glyphWidth / 2, y: rowY },
        glyphWidth: LAYOUT.legend.glyphWidth,
        textAt: { x: cursorX + LAYOUT.legend.glyphWidth, y: rowY },
        hitBox: {
          x: cursorX,
          y: rowY - LAYOUT.legend.rowHeight / 2,
          width: boxWidth,
          height: LAYOUT.legend.rowHeight,
        },
      };
    });
    groups.push({
      id: group.id,
      title: group.title,
      titleAt: { x: cursorX, y: cursorY + LAYOUT.legend.titleHeight / 2 },
      entries,
      box: { x: cursorX, y: cursorY, width: boxWidth, height },
    });
    bandHeight = Math.max(bandHeight, height);
    cursorX += boxWidth + LAYOUT.legend.columnGap;
  }

  const notesTop = cursorY + bandHeight + 16;
  const notes = legendNotes.map((text, index) => ({
    text,
    at: { x: left, y: notesTop + index * 15 },
  }));

  return {
    groups,
    notes,
    footnote,
    top,
    bottom: notesTop + legendNotes.length * 15,
  };
}
