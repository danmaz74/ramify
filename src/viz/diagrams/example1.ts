/**
 * Example 1 - "One decision, three reaches".
 *
 * The universe and the decisions come from
 * `docs/model/illustrative-examples.md`, which is normative for this diagram:
 * nine modules, four symbols, seven decisions. Three leaf modules make the
 * identical decision - expose a symbol to their parent - and end up with three
 * different reaches, because the reach was decided above them. A fourth symbol
 * goes the other way - its owner exposes it to its descendants - and shows the
 * asymmetry: an exposure to descendants is complete in one decision and can
 * never leave the subtree.
 *
 * Where diagram 1 (`./shop.ts`) teaches the two exposure channels one at a
 * time, this one teaches *reach*. Its `receives` compartment therefore lists
 * both channels: what a direct child exposed to its parent, and what a proper
 * ancestor exposed to its descendants. Every box then answers "what is
 * available here?" on its own, and the three reaches can be read box by box.
 *
 * Pure and browser-compatible: no I/O, no Node built-ins, no side effects.
 */

import type {
  DecisionPolicy,
  DiagramDefinition,
  TracedSymbol,
} from '../diagram-definition.js';
import type { ModuleDeclaration } from '../model-access.js';
import { seriesLegendGroups, seriesNodeContent } from './series.js';

/**
 * ```text
 * app                            (root - owns nothing, and re-exposes anyway)
 * ├── globalLibrary
 * │   └── moneyUtils             owns computeTotal
 * ├── invoicing
 * │   ├── invoicingLibrary       owns InvoiceModel
 * │   ├── invoiceComputation
 * │   └── invoicePDF
 * └── shipping                   owns ShipmentPlan
 *     └── routingOptimization    owns optimizeRoute
 * ```
 *
 * Two consumers under `invoicing` are deliberate: an exposure to descendants
 * needs at least two arrivals to read as one rather than as a private handoff.
 */
export const example1Declaration: ModuleDeclaration = {
  id: 'app',
  // The root owns no code and still carries the application's vocabulary:
  // `globalLibrary` passed `computeTotal` up, and `app` sends it back down
  // into every branch. Re-exposing never transfers ownership.
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
    // absence of a sibling channel visible. Its own `ShipmentPlan` goes the
    // other way - down to its descendants and nowhere else, so the edge to
    // `routingOptimization` carries a type flowing down and a function
    // flowing up, each its own decision.
    {
      id: 'shipping',
      owns: [{ symbol: 'ShipmentPlan', exposeToDescendants: true }],
      children: [
        { id: 'routingOptimization', owns: [{ symbol: 'optimizeRoute', exposeToParent: true }] },
      ],
    },
  ],
};

/**
 * Every exposure path is traced - the series convention: each path gets its
 * own color and its own selectable layer, and the neutral bundle stays empty.
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
    role: 'exposed to the parent, composed, stopped: parent only',
  },
  {
    symbol: 'ShipmentPlan',
    owner: 'shipping',
    color: 'traced4',
    role: 'owner → descendants: never leaves the subtree',
  },
];

/** Seven decisions, seven dots - nine modules and one theme. */
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
    text: 'app exposes computeTotal to its descendants - which is every module.',
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
  {
    id: 'P7',
    text: 'shipping exposes ShipmentPlan to its descendants.',
    deciders: ['shipping'],
    channel: 'toDescendants',
  },
];

// The legend and node-content conventions are the series', declared once in
// `./series.js`. The traced contracts live in the header strip above the
// tree (rendered from `tracedSymbols`), not in the legend: one selector, and
// it sits where the eyes are.
export const example1LegendGroups = seriesLegendGroups;

/** The lessons of the doc, in the glossary's vocabulary. */
export const example1LegendNotes: readonly string[] = [
  'The three owners that exposed to their parent made the same decision; the three reaches were decided entirely above them.',
  'Exposing to descendants is final and bounded: one decision, whole subtree, no way out. Exposing to the parent cedes onward exposure.',
  'There is no sibling channel: exposing a symbol to the parent gives siblings nothing.',
  'Files inside one module import each other freely; those imports are not drawn.',
];

export const example1Diagram: DiagramDefinition = {
  id: 'example1',
  declaration: example1Declaration,
  // No drawn title: the page's own heading introduces the example, so the
  // picture starts at the tree.
  ariaLabel:
    'Example 1: three modules expose a symbol to their parent, and the decisions above them produce three different reaches; a fourth symbol is exposed only to descendants and never leaves its subtree',
  tracedSymbols: example1TracedSymbols,
  // Nothing is drawn across the tree: non-allowed imports are read from
  // absence, and selecting a symbol makes that absence visible.
  chordSpecs: [],
  decisionPolicies: example1DecisionPolicies,
  legendGroups: example1LegendGroups,
  legendNotes: example1LegendNotes,
  footnote: [],
  nodeContent: seriesNodeContent,
};
