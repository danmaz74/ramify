/**
 * Conventions shared by every diagram of the illustrative-examples series
 * (`docs/model/illustrative-examples.md` § Diagram conventions).
 *
 * A series diagram states only what is unique to its universe; everything a
 * reader learns once - the two exposure markers, the `receives` compartment
 * listing both channels - is declared here, once. The shop
 * diagram (`./shop.ts`) predates the series and deliberately keeps its own
 * older conventions, so it does not import this file.
 *
 * Pure and browser-compatible: no I/O, no Node built-ins, no side effects.
 */

import type { LegendGroup, NodeContentOptions } from '../diagram-definition.js';

/**
 * The series legend: only conventions the picture cannot state in its own
 * words - the two exposure markers. Everything else is written out on the
 * diagram itself (compartment titles, `from` provenance), and
 * the lanes explain themselves at full size: an arrow with a dot at its
 * origin and arrowheads at its arrivals.
 */
export const seriesLegendGroups: readonly LegendGroup[] = [
  {
    id: 'node',
    title: 'Node',
    entries: [
      { id: 'to-parent', glyph: { kind: 'marker', text: '▲' }, text: 'exposed to parent' },
      { id: 'to-descendants', glyph: { kind: 'marker', text: '▼' }, text: 'exposed to descendants' },
    ],
  },
];

/**
 * The legend of the tag examples: the series rows plus the three affordances
 * only a tag universe draws - the two rule glyphs and the struck name. The
 * glyphs are a mirror-arrow pair drawing the direction of each rule's demand
 * (`⇥` rides out with the symbol, `⇤` faces in at the module's door), so the
 * legend row is the one place the arrows are decoded.
 */
export const seriesTagLegendGroups: readonly LegendGroup[] = [
  ...seriesLegendGroups,
  {
    id: 'tags',
    title: 'Tags',
    entries: [
      {
        id: 'required-module-tag',
        glyph: { kind: 'marker', text: '⇥' },
        text: 'rule: available only in modules carrying the same tag',
      },
      {
        id: 'required-symbol-tag',
        glyph: { kind: 'marker', text: '⇤' },
        text: 'rule: only symbols carrying the same tag are available in the module',
      },
      {
        id: 'struck-name',
        glyph: { kind: 'struck', text: 'name' },
        text: 'visible here, not available',
      },
    ],
  },
];

/**
 * Series node boxes teach *visibility*: the `receives` compartment lists both
 * channels - what a direct child exposed to its parent and what a proper
 * ancestor exposed to its descendants - so every box answers "what is visible
 * here?" on its own.
 */
export const seriesNodeContent: NodeContentOptions = {
  receivedCompartmentTitle: 'receives',
  includeAncestorExposures: true,
};
