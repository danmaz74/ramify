/**
 * Example 1 — "One decision, three reaches".
 *
 * The universe, the decisions and the drawn denial come from
 * `docs/model/illustrative-examples.md`, which is normative for this diagram:
 * nine modules, three symbols, six decisions. Three leaf modules make the
 * identical decision — expose a symbol to their parent — and end up with three
 * different reaches, because the reach was decided above them.
 *
 * Where diagram 1 (`./shop.ts`) teaches the two exposure channels one at a
 * time, this one teaches *reach*. Its second compartment is therefore titled
 * `exposed to it` and lists both channels: what a direct child exposed upward,
 * and what a proper ancestor granted downward. Every box then answers "what is
 * available here?" on its own, and the three reaches can be read box by box.
 *
 * Pure and browser-compatible: no I/O, no Node built-ins, no side effects.
 */

import type {
  ChordSpec,
  DecisionPolicy,
  DiagramDefinition,
  LegendGroup,
  TracedSymbol,
} from '../diagram-definition.js';
import type { ModuleDeclaration } from '../model-access.js';

/**
 * ```text
 * app                            (root — owns nothing, and routes anyway)
 * ├── globalLibrary
 * │   └── moneyUtils             owns computeTotal
 * ├── invoicing
 * │   ├── invoicingLibrary       owns InvoiceModel
 * │   ├── invoiceComputation
 * │   └── invoicePDF
 * └── shipping
 *     └── routingOptimization    owns optimizeRoute
 * ```
 *
 * Two consumers under `invoicing` are deliberate: a grant needs at least two
 * arrivals to read as a grant rather than a private handoff.
 */
export const example1Declaration: ModuleDeclaration = {
  id: 'app',
  // The root owns no code and still carries the application's vocabulary:
  // `globalLibrary` passed `computeTotal` up, and `app` sends it back down
  // into every branch. Routing never transfers ownership.
  reExposes: [{ symbol: 'computeTotal', from: 'globalLibrary', exposeToDescendants: true }],
  children: [
    {
      id: 'globalLibrary',
      reExposes: [{ symbol: 'computeTotal', from: 'moneyUtils', exposeToParent: true }],
      children: [{ id: 'moneyUtils', owns: [{ symbol: 'computeTotal', exposeToParent: true }] }],
    },
    {
      id: 'invoicing',
      // The same mechanism as `app`'s, one level down: a "domain library" and a
      // "global library" differ only in altitude.
      reExposes: [{ symbol: 'InvoiceModel', from: 'invoicingLibrary', exposeToDescendants: true }],
      children: [
        { id: 'invoicingLibrary', owns: [{ symbol: 'InvoiceModel', exposeToParent: true }] },
        { id: 'invoiceComputation' },
        { id: 'invoicePDF' },
      ],
    },
    // `shipping` composes `optimizeRoute` and exposes it no further: the
    // degenerate case of the same spectrum, and the contrast that makes the
    // absence of a sibling channel visible.
    {
      id: 'shipping',
      children: [
        { id: 'routingOptimization', owns: [{ symbol: 'optimizeRoute', exposeToParent: true }] },
      ],
    },
  ],
};

/**
 * All three symbols qualify: every one of them had its reach decided by a
 * module other than its owner. That is the whole subject of the diagram, so
 * every symbol is traced and the neutral bundle stays empty.
 */
export const example1TracedSymbols: readonly TracedSymbol[] = [
  {
    symbol: 'computeTotal',
    owner: 'moneyUtils',
    color: 'traced1',
    role: 'owner → parent → root → everywhere',
  },
  {
    symbol: 'InvoiceModel',
    owner: 'invoicingLibrary',
    color: 'traced2',
    role: 'owner → parent → that subtree',
  },
  {
    symbol: 'optimizeRoute',
    owner: 'routingOptimization',
    color: 'traced3',
    role: 'exposed up, composed, stopped: parent only',
  },
];

/**
 * One drawn denial, per the doc's policy for a static diagram.
 *
 * `invoicing` ✗ `optimizeRoute` — the other half of the lesson — is left to
 * the interactive view: selecting `optimizeRoute` reveals exactly how far it
 * got, and the empty canvas beyond `shipping` is the answer.
 */
export const example1ChordSpecs: readonly ChordSpec[] = [
  {
    id: 'D1',
    importer: 'shipping',
    owner: 'invoicingLibrary',
    symbol: 'InvoiceModel',
    verdict: 'denied',
    reason: "grant covers invoicing's subtree",
    expectDenial: 'no-exposure-chain',
  },
];

/** Six decisions, six dots — nine modules and one theme. */
export const example1DecisionPolicies: readonly DecisionPolicy[] = [
  {
    id: 'P1',
    text: 'moneyUtils exposes computeTotal to its parent.',
    deciders: ['moneyUtils'],
    channel: 'toParent',
  },
  {
    id: 'P2',
    text: 'globalLibrary exposes computeTotal to its parent.',
    deciders: ['globalLibrary'],
    channel: 'toParent',
  },
  {
    id: 'P3',
    text: 'app exposes computeTotal to its descendants — which is every module.',
    deciders: ['app'],
    channel: 'toDescendants',
  },
  {
    id: 'P4',
    text: 'invoicingLibrary exposes InvoiceModel to its parent.',
    deciders: ['invoicingLibrary'],
    channel: 'toParent',
  },
  {
    id: 'P5',
    text: 'invoicing exposes InvoiceModel to its descendants.',
    deciders: ['invoicing'],
    channel: 'toDescendants',
  },
  {
    id: 'P6',
    text: 'routingOptimization exposes optimizeRoute to its parent.',
    deciders: ['routingOptimization'],
    channel: 'toParent',
  },
];

export const example1LegendGroups: readonly LegendGroup[] = [
  {
    id: 'node',
    title: 'Node',
    entries: [
      { id: 'to-parent', glyph: { kind: 'marker', text: '▲' }, text: 'exposed to parent' },
      { id: 'to-descendants', glyph: { kind: 'marker', text: '▼' }, text: 'exposed to descendants' },
      {
        id: 'gray',
        glyph: { kind: 'marker', text: '·', muted: true },
        text: 'goes no further; nothing gray moves',
      },
      {
        id: 'granted',
        glyph: { kind: 'granted' },
        text: 'no marker: exposed to it by a proper ancestor',
      },
      {
        id: 'owns-exposed',
        glyph: { kind: 'compartment', text: 'owns / exposed to it' },
        text: 'owned here / exposed to this module',
      },
    ],
  },
  {
    id: 'edges',
    title: 'Along the edges',
    entries: [
      { id: 'up-hop', glyph: { kind: 'up-hop' }, text: 'up-hop: one edge, one decision' },
      { id: 'grant', glyph: { kind: 'grant' }, text: 'grant flow: one decision, a subtree' },
      { id: 'dot', glyph: { kind: 'dot' }, text: 'filled dot = somebody decided here' },
      { id: 'head', glyph: { kind: 'arrowhead' }, text: 'arrowhead = this module may import it' },
    ],
  },
  {
    id: 'across',
    title: 'Across the tree',
    entries: [
      { id: 'allowed', glyph: { kind: 'chord-allowed' }, text: '✓ allowed import' },
      { id: 'denied', glyph: { kind: 'chord-denied' }, text: '✗ denied import, with its reason' },
    ],
  },
  {
    id: 'traced',
    title: 'Traced contracts',
    entries: example1TracedSymbols.map((traced) => ({
      id: `traced-${traced.symbol}`,
      glyph: { kind: 'traced', symbol: traced.symbol } as const,
      text: `${traced.symbol} — ${traced.role}`,
      selects: traced.symbol,
    })),
  },
];

/** The lessons of the doc, in the glossary's vocabulary. */
export const example1LegendNotes: readonly string[] = [
  'The three owners made the same decision; the three reaches were decided entirely above them.',
  'There is no sibling channel: exposing a symbol to the parent gives siblings nothing.',
  'Files inside one module import each other freely; those imports are not drawn.',
];

/** The drawn denial, spelled out under the chord row it belongs to. */
export const example1Footnote: readonly string[] = [
  'D1 — shipping may not import InvoiceModel. invoicing exposed it to its descendants, and that',
  'reaches its own subtree and nothing else; invoicing exposed it to no parent, so no sibling sees it.',
];

export const example1Title =
  'One decision, three reaches — where the chain above turns downward decides how far a symbol goes';

export const example1Diagram: DiagramDefinition = {
  id: 'example1',
  declaration: example1Declaration,
  title: example1Title,
  ariaLabel:
    'Example 1: three modules expose a symbol to their parent, and the decisions above them produce three different reaches',
  tracedSymbols: example1TracedSymbols,
  chordSpecs: example1ChordSpecs,
  decisionPolicies: example1DecisionPolicies,
  legendGroups: example1LegendGroups,
  legendNotes: example1LegendNotes,
  footnote: example1Footnote,
  nodeContent: { receivedCompartmentTitle: 'exposed to it', includeAncestorGrants: true },
};
