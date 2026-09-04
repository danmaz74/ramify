/**
 * The first-person view from inside one module: what an engineer or an agent
 * working in it holds, and nothing else.
 *
 * Three cards, stacked so that vertical position carries direction the way
 * the tree does: what reaches the module from above on top; the module itself
 * in the middle - its own files, and the interface it exposes, upward to its
 * parent and downward to its descendants; what its sub-modules expose to it
 * below. Every direction the model has is a column, drawn even when empty, so
 * the same picture reads the same for any module. A signpost names where we
 * are, and the whole tree sits underneath, small, with the path to the focus
 * marked and everything not available dimmed.
 *
 * The cards are read off the evaluator through {@link focusContext}; the
 * files are the definition's own, since the model knows no files.
 *
 * Pure and browser-compatible: no I/O, no DOM.
 */

import type { Box } from './geometry.js';
import { buildTree, type ModuleDeclaration } from './model-access.js';
import {
  TREE_LAYOUT,
  focusContext,
  layoutTreeDiagram,
  rowHeight,
  rowWidth,
  type TreeDiagramLayout,
  type TreeFocus,
  type TreeNodeLayout,
  type TreeNoteLayout,
  type TreeRow,
} from './tree-diagram.js';

export interface FocusDiagramDefinition {
  /** Stable identifier; also the element-id stem. */
  readonly id: string;
  readonly declaration: ModuleDeclaration;
  readonly focus: TreeFocus;
  /** The `<svg>`'s accessible name. */
  readonly ariaLabel: string;
  /** Cards stacked as bands (default), or side by side. */
  readonly arrangement?: 'bands' | 'columns';
  /** Standing notes drawn under the map. */
  readonly notes?: readonly string[];
}

export type FocusCardId = 'above' | 'module' | 'below';

export interface FocusColumnLayout {
  readonly rows: readonly TreeRow[];
  /** Left edge and width, in diagram coordinates. */
  readonly x: number;
  readonly width: number;
}

export interface FocusCardLayout {
  readonly id: FocusCardId;
  readonly title: string;
  readonly subtitle: string;
  readonly box: Box;
  /** Side by side inside the card: files | exposed up | exposed down, or one per sub-module. */
  readonly columns: readonly FocusColumnLayout[];
}

export interface FocusMapLayout {
  /** The whole tree, laid out bare with the roles cast. */
  readonly tree: TreeDiagramLayout;
  readonly scale: number;
  /** Where the scaled tree's origin lands. */
  readonly x: number;
  readonly y: number;
  readonly caption: string;
  readonly captionY: number;
  /** The focus's box in the map, in map coordinates. */
  readonly focusNode: TreeNodeLayout;
}

export interface FocusDiagramLayout {
  readonly definition: FocusDiagramDefinition;
  readonly viewBox: Box;
  /** Bold, before the breadcrumb: the name of this kind of picture. */
  readonly kicker: string;
  readonly breadcrumb: string;
  /** Regular weight, before the bold module name: "Working in". */
  readonly titlePrefix: string;
  readonly title: string;
  readonly cards: readonly FocusCardLayout[];
  readonly map: FocusMapLayout;
  readonly notes: readonly TreeNoteLayout[];
}

export const FOCUS_LAYOUT = {
  margin: 12,
  breadcrumbFontSize: 11,
  titleFontSize: 20,
  /** Height of the signpost: breadcrumb over the big name. */
  signpostHeight: 54,
  cardTitleHeight: 22,
  cardSubtitleHeight: 14,
  cardPadding: 8,
  cardGap: 10,
  /** Between two columns inside a card. */
  columnGap: 12,
  cardMinWidth: 220,
  cardTitleFontSize: 12.5,
  cardSubtitleFontSize: 10,
  mapScale: 0.55,
  mapGap: 22,
  mapCaptionHeight: 16,
  mapCaptionFontSize: 10.5,
} as const;

const F = FOCUS_LAYOUT;
const T = TREE_LAYOUT;

interface CardContent {
  readonly id: FocusCardId;
  readonly title: string;
  readonly subtitle: string;
  readonly columns: readonly (readonly TreeRow[])[];
}

const NOTHING: TreeRow = { kind: 'title', text: '(nothing)' };

function orNothing(rows: readonly TreeRow[]): TreeRow[] {
  return rows.length === 0 ? [NOTHING] : [...rows];
}

function cardContents(definition: FocusDiagramDefinition): CardContent[] {
  const tree = buildTree(definition.declaration);
  const context = focusContext(tree, definition.focus.moduleId);
  const name = definition.focus.moduleId;

  // From above: what ancestors exposed to their descendants, and so to us.
  const received: TreeRow[] = context.fromAbove.map((arrival) => ({
    kind: 'received',
    symbol: arrival.symbol,
    from: arrival.from,
    chain: arrival.chain,
  }));

  // The module itself: its files, then its interface in each direction.
  const files: TreeRow[] = definition.focus.files.map((file) => ({ kind: 'file', text: file }));
  const upward: TreeRow[] = context.owedToParent.map((symbol) => ({
    kind: 'exposed',
    symbol,
    channel: 'toParent',
  }));
  const downward: TreeRow[] = context.owedToDescendants.map((symbol) => ({
    kind: 'exposed',
    symbol,
    channel: 'toDescendants',
  }));
  const self: TreeRow[][] = [[{ kind: 'title', text: 'files' }, ...orNothing(files)]];
  if (context.parent !== null) {
    self.push([{ kind: 'title', text: `exposed to ${context.parent}` }, ...orNothing(upward)]);
  }
  self.push([{ kind: 'title', text: 'exposed to descendants' }, ...orNothing(downward)]);

  // From below: what each sub-module exposed to its parent, which is us.
  const below: TreeRow[][] =
    context.fromChildren.length === 0
      ? [[{ kind: 'title', text: '(no sub-modules)' }]]
      : context.fromChildren.map((entry): TreeRow[] => [
          { kind: 'group', text: entry.child },
          ...orNothing(
            entry.symbols.map(
              (arrival): TreeRow => ({
                kind: 'exposed',
                symbol: arrival.symbol,
                channel: 'toParent',
              }),
            ),
          ),
        ]);

  const upTo = context.parent === null ? '' : `, up to ${context.parent}`;
  return [
    {
      id: 'above',
      title: 'From above',
      subtitle: `what ${name} receives from its ancestors`,
      columns: [[{ kind: 'title', text: 'received' }, ...orNothing(received)]],
    },
    {
      id: 'module',
      title: name,
      subtitle: `its own files, and the interface it exposes${upTo} and down to its sub-modules`,
      columns: self,
    },
    {
      id: 'below',
      title: 'From sub-modules',
      subtitle: `what they expose to ${name}; their own insides stay hidden`,
      columns: below,
    },
  ];
}

function columnHeight(rows: readonly TreeRow[]): number {
  return rows.reduce((sum, row) => sum + rowHeight(row), 0);
}

function cardHeight(card: CardContent): number {
  return (
    F.cardTitleHeight +
    F.cardSubtitleHeight +
    Math.max(0, ...card.columns.map(columnHeight)) +
    F.cardPadding
  );
}

function columnWidth(rows: readonly TreeRow[]): number {
  return Math.max(0, ...rows.map(rowWidth)) + 2 * F.cardPadding;
}

/** The width a card needs: its columns side by side, or its titles. */
function cardContentWidth(card: CardContent): number {
  const subtitleWidth = card.subtitle.length * T.rowCharWidth * 0.92 + 2 * F.cardPadding;
  const titleWidth = card.title.length * T.nameCharWidth + 2 * F.cardPadding;
  const columnsWidth =
    card.columns.reduce((sum, rows) => sum + columnWidth(rows), 0) +
    F.columnGap * Math.max(0, card.columns.length - 1);
  return Math.max(titleWidth, subtitleWidth, columnsWidth);
}

/** Columns share the card's width in proportion to what each needs. */
function placeColumns(card: CardContent, box: Box): FocusColumnLayout[] {
  const needs = card.columns.map(columnWidth);
  const needed = needs.reduce((sum, width) => sum + width, 0);
  const gaps = F.columnGap * Math.max(0, card.columns.length - 1);
  const spare = Math.max(0, box.width - needed - gaps);
  let x = box.x;
  return card.columns.map((rows, index) => {
    const need = needs[index] ?? 0;
    const width = Math.round(need + (needed === 0 ? 0 : (spare * need) / needed));
    const column = { rows, x, width };
    x += width + F.columnGap;
    return column;
  });
}

export function layoutFocusDiagram(definition: FocusDiagramDefinition): FocusDiagramLayout {
  const contents = cardContents(definition);
  const arrangement = definition.arrangement ?? 'bands';

  const map = layoutTreeDiagram({
    id: `${definition.id}-map`,
    declaration: definition.declaration,
    ariaLabel: '',
    focus: definition.focus,
    focusRows: false,
  });
  const mapWidth = Math.ceil(map.viewBox.width * F.mapScale);
  const mapHeight = Math.ceil(map.viewBox.height * F.mapScale);

  const cardsTop = F.margin + F.signpostHeight;
  const cards: FocusCardLayout[] = [];
  let cardsBottom: number = cardsTop;
  let contentRight: number = F.margin;

  if (arrangement === 'bands') {
    const width = Math.ceil(
      Math.max(F.cardMinWidth, mapWidth, ...contents.map(cardContentWidth)),
    );
    let y = cardsTop;
    for (const card of contents) {
      const height = cardHeight(card);
      const box = { x: F.margin, y, width, height };
      cards.push({ id: card.id, title: card.title, subtitle: card.subtitle, box, columns: placeColumns(card, box) });
      y += height + F.cardGap;
    }
    cardsBottom = y - F.cardGap;
    contentRight = F.margin + width;
  } else {
    const height = Math.max(...contents.map(cardHeight));
    let x = F.margin;
    for (const card of contents) {
      const width = Math.ceil(Math.max(F.cardMinWidth, cardContentWidth(card)));
      const box = { x, y: cardsTop, width, height };
      cards.push({ id: card.id, title: card.title, subtitle: card.subtitle, box, columns: placeColumns(card, box) });
      x += width + F.cardGap;
    }
    cardsBottom = cardsTop + height;
    contentRight = Math.max(x - F.cardGap, F.margin + mapWidth);
  }

  const captionY = cardsBottom + F.mapGap;
  const mapY = captionY + F.mapCaptionHeight;
  const focusNode = map.nodes.find((node) => node.role === 'focus');
  if (focusNode === undefined) {
    throw new Error(`Focus diagram '${definition.id}': focus module not in the map.`);
  }

  const noteTexts = definition.notes ?? [];
  const notesTop = mapY + mapHeight + (noteTexts.length > 0 ? T.notesGap : 0);
  const notes = noteTexts.map((text, index) => ({
    text,
    y: notesTop + index * T.noteLineHeight + T.noteLineHeight / 2,
  }));

  const breadcrumb = buildTree(definition.declaration);
  const path = focusContext(breadcrumb, definition.focus.moduleId).path;

  // Text lines under the cards must fit too: the caption and the notes are
  // measured with the same over-estimate the rows use, so nothing is clipped.
  const caption = 'The whole tree, at a distance. Dimmed: exists, but not available here.';
  const textWidth = (text: string): number => text.length * T.rowCharWidth * 0.85;
  const textRight = F.margin + Math.max(textWidth(caption), ...noteTexts.map(textWidth));

  return {
    definition,
    viewBox: {
      x: 0,
      y: 0,
      width: Math.ceil(Math.max(contentRight, F.margin + mapWidth, textRight)) + F.margin,
      height: notesTop + noteTexts.length * T.noteLineHeight + F.margin,
    },
    kicker: 'Focused view',
    breadcrumb: path.join(' › '),
    titlePrefix: 'Working in',
    title: definition.focus.moduleId,
    cards,
    map: {
      tree: map,
      scale: F.mapScale,
      x: F.margin,
      y: mapY,
      caption,
      captionY: captionY + F.mapCaptionHeight / 2,
      focusNode,
    },
    notes,
  };
}

/** The map's focus box in diagram coordinates, for the marker drawn over it. */
export function mapBoxToDiagram(map: FocusMapLayout, box: Box): Box {
  return {
    x: map.x + box.x * map.scale,
    y: map.y + box.y * map.scale,
    width: box.width * map.scale,
    height: box.height * map.scale,
  };
}
