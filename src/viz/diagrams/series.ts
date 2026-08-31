/**
 * Conventions shared by every diagram of the illustrative-examples series
 * (`docs/model/illustrative-examples.md` § Diagram conventions).
 *
 * A series diagram states only what is unique to its universe; everything a
 * reader learns once — the two exposure markers, the "exposed to it"
 * compartment listing both channels — is declared here, once. The shop
 * diagram (`./shop.ts`) predates the series and deliberately keeps its own
 * older conventions, so it does not import this file.
 *
 * Pure and browser-compatible: no I/O, no Node built-ins, no side effects.
 */

import type { LegendGroup, NodeContentOptions } from '../diagram-definition.js';

/**
 * The series legend: only conventions the picture cannot state in its own
 * words — the two exposure markers. Everything else is written out on the
 * diagram itself (compartment titles, `from`/`granted by` provenance), and
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
 * Series node boxes teach *availability*: the second compartment lists both
 * channels — what a direct child exposed upward and what a proper ancestor
 * granted downward — so every box answers "what is available here?" on its
 * own.
 */
export const seriesNodeContent: NodeContentOptions = {
  receivedCompartmentTitle: 'exposed to it',
  includeAncestorGrants: true,
};
