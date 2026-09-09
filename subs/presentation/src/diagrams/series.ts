/**
 * Conventions shared by every diagram of the example series (`./example1.ts`
 * to `./example4.ts`, plus the Example 1 build-up stages). This comment is
 * the series' only statement of them: each diagram file states just what is
 * unique to its universe, and the two legend and node-content values below
 * declare once what a reader learns once. The shop diagram (`./shop.ts`)
 * predates the series and deliberately keeps its own older conventions, so
 * it does not import this file.
 *
 * Naming: top-level modules describe their role (`globalLibrary`) or imply a
 * plausible one (`invoicing`, `shipping`); symbols are self-explanatory
 * (`computeTotal`, `InvoiceModel`); `PascalCase` = types, `camelCase` =
 * values.
 *
 * - Node boxes show two compartments, `owns` and `receives`, the latter
 *   naming the module each arrival came from (`from <child>` for a child's
 *   exposure to its parent, `from <ancestor>` for an ancestor's exposure to
 *   its descendants; the tree shows which is which). Visibility is the union
 *   of the two, read box by box - and with no tags declared, what is visible
 *   is exactly what is available.
 * - Imports that are not allowed are not drawn: absence is the statement,
 *   and selecting a symbol makes the absence visible.
 * - Every exposure path is traced - its own color, its own selectable layer.
 *   A symbol exposed nowhere has no path to trace; it stays gray.
 * - Selecting a traced symbol: the other layers dim, the symbol's lanes turn
 *   dashed and animate in the direction the exposure flows, and its rows in
 *   every `receives` compartment blink. Nothing is overlaid: reach is read
 *   off the moving mechanism and the blinking arrivals. Pure CSS, with a
 *   `prefers-reduced-motion` fallback (static dashes, steady highlight).
 * - An exposure to descendants needs at least two arrivals to read as one
 *   rather than as a private handoff, so every module that exposes to its
 *   descendants has at least two consumers below it.
 * - Tag examples keep the tree trivial: visibility is uniform by
 *   construction, nothing examples 1 and 2 already taught is re-shown, and
 *   the tag is the only variable.
 * - A tag is written behind the glyph of the availability rule it carries,
 *   everywhere the diagram mentions it. The glyphs are a mirror-arrow pair
 *   drawing the direction of the rule's demand: `⇥` is the required-module-tag
 *   rule (the demand rides out with the symbol and is checked where it
 *   lands), `⇤` the required-symbol-tag rule (the demand faces in at the
 *   module's door and is checked on everything arriving). The chip on a
 *   tagged symbol's row reads `⇥ testing` and sits on a filled pill that
 *   travels with the symbol to every arrival; a tagged module's dashed box
 *   fills its node and is labeled `⇤ browser`.
 * - Visible but not available is struck through: when a module's files may
 *   not import an arrival, the row is still drawn - the exposure chain really
 *   does put the symbol there - with its name struck. The diagrams tell the
 *   availability (value-import) story; the type story leaves exactly one
 *   mark: a struck name followed by an unstruck `∗` is still type-available,
 *   a bare struck name is blocked in both import forms.
 * - Selecting a tagged symbol blinks only the arrivals where it is
 *   available; a tag-refused arrival is also dimmed, not merely un-pulsed,
 *   so the refusal survives `prefers-reduced-motion`.
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
