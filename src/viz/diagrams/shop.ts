/**
 * Diagram 1 - the core tree model, drawn on a small online shop.
 *
 * This is the complete declaration of the retired first diagram's universe
 * (eight modules, eight symbols, and the exposure decision each owner made)
 * together with its editorial data: which symbols are traced and in what
 * color, which questions get an explicit chord, and the words on the legend.
 * The diagram is kept as a fixture; the site teaches from the example series
 * (`./series.ts`, `./example1.ts` to `./example4.ts`).
 *
 * Everything the diagram draws beyond the declaration is *derived* from it by
 * the evaluator - including the `receives` compartments, which need no
 * declaration at all: `CartApi` is available in `checkout` purely as a
 * consequence of `cart` exposing it to its parent.
 *
 * Pure and browser-compatible: no I/O, no Node built-ins, no side effects.
 */

import {
  createDiagramContext,
  type ChordSpec,
  type DecisionPolicy,
  type DiagramDefinition,
  type LegendGroup,
  type TracedSymbol,
  type WhatIfNote,
} from '../diagram-definition.js';
import type { ModuleDeclaration, ModuleId, ModuleTree } from '../model-access.js';

/**
 * A small online shop. Three levels, eight modules, one leaf branch.
 *
 * ```text
 * shop                      (application root - an ordinary module)
 * ├── catalog
 * │   ├── search
 * │   └── inventory
 * ├── checkout
 * │   ├── cart
 * │   └── payment
 * └── shipping
 * ```
 */
export const shopDeclaration: ModuleDeclaration = {
  id: 'shop',
  owns: [
    { symbol: 'Money', exposeToDescendants: true },
    { symbol: 'formatDate', exposeToDescendants: true },
  ],
  // `catalog` exposed `ProductId` to its parent; `shop` sends it back down into
  // the whole application. The re-exposing module never becomes the owner.
  reExposes: [{ symbol: 'ProductId', from: 'catalog', exposeToDescendants: true }],
  children: [
    {
      id: 'catalog',
      owns: [
        { symbol: 'ProductId', exposeToParent: true },
        { symbol: 'SkuRules', exposeToDescendants: true },
      ],
      // `reserveStock` becomes available in `catalog` and stops there:
      // `catalog` exposes it no further.
      children: [
        { id: 'search' },
        { id: 'inventory', owns: [{ symbol: 'reserveStock', exposeToParent: true }] },
      ],
    },
    {
      id: 'checkout',
      // `checkout` has both `PaymentApi` and `CartApi` available and treats
      // them differently: exposing is a separate decision from receiving.
      reExposes: [{ symbol: 'PaymentApi', from: 'payment', exposeToDescendants: true }],
      children: [
        { id: 'cart', owns: [{ symbol: 'CartApi', exposeToParent: true }] },
        {
          id: 'payment',
          owns: [
            { symbol: 'PaymentApi', exposeToParent: true },
            // Owned, exposed through neither channel: available in `payment`
            // and nowhere else.
            { symbol: 'retryQueue' },
          ],
        },
      ],
    },
    // `shipping` owns nothing and exports nothing: a branch that only receives.
    { id: 'shipping' },
  ],
};

/**
 * §3.7's criterion - *a symbol is traced iff its reach was decided by a module
 * other than its owner* - picks exactly these three. `CartApi` is traced even
 * though its chain stops at the first hop: the colored ribbon halting dead at
 * `checkout`, beside `PaymentApi`'s ribbon continuing down, is the lesson
 * (§5.2).
 */
export const tracedSymbols: readonly TracedSymbol[] = [
  {
    symbol: 'ProductId',
    owner: 'catalog',
    color: 'traced1',
    role: 'owner → root → everywhere',
  },
  {
    symbol: 'PaymentApi',
    owner: 'payment',
    color: 'traced2',
    role: 'owner → parent → that subtree',
  },
  {
    symbol: 'CartApi',
    owner: 'cart',
    color: 'traced3',
    role: 'received, not re-exposed: the ribbon stops',
  },
];

/** The six chords of §3.6, in spec-table order. Row assignment is computed by span. */
export const chordSpecs: readonly ChordSpec[] = [
  {
    id: 'A1',
    importer: 'search',
    owner: 'catalog',
    symbol: 'ProductId',
    verdict: 'allowed',
    reason: 'shop sent it back down into every branch',
  },
  {
    id: 'D5',
    importer: 'checkout',
    owner: 'payment',
    symbol: 'retryQueue',
    verdict: 'denied',
    reason: 'never exposed',
    expectDenial: 'never-exposed',
  },
  {
    id: 'D2',
    importer: 'search',
    owner: 'inventory',
    symbol: 'reserveStock',
    verdict: 'denied',
    reason: 'exposed to the parent only',
    expectDenial: 'no-exposure-chain',
  },
  {
    id: 'D3',
    importer: 'shipping',
    owner: 'payment',
    symbol: 'PaymentApi',
    verdict: 'denied',
    reason: "exposed to checkout's subtree only",
    expectDenial: 'no-exposure-chain',
  },
  {
    id: 'D4',
    importer: 'payment',
    owner: 'cart',
    symbol: 'CartApi',
    verdict: 'denied',
    reason: 'received by checkout, not re-exposed',
    expectDenial: 'no-exposure-chain',
  },
  {
    id: 'D1',
    importer: 'checkout',
    owner: 'catalog',
    symbol: 'SkuRules',
    verdict: 'denied',
    reason: "exposed to catalog's subtree only",
    expectDenial: 'no-exposure-chain',
  },
];

/**
 * The uniform-exposure footnote (§1.5), anchored to chord A1. It is the only
 * allowed import the diagram draws, because it is the only one whose answer
 * surprises people.
 */
export const uniformExposureFootnote: readonly string[] = [
  'A1 - search may import ProductId. catalog exposed it only to its parent, so catalog gave',
  'its own children nothing; shop sent it back down into every branch, including the branch it',
  'came up through. Exposure to descendants is uniform: no backflow exclusion, no provenance carried.',
];

/**
 * The what-if annotation (X4, kept at §5.1): a dashed in-node note on
 * `shipping`, the only witness for subdivision invariance. It is explicitly
 * hypothetical - `rates` and `labels` are not declared modules and never
 * become nodes.
 */
export const whatIfNote: WhatIfNote = {
  moduleId: 'shipping',
  title: 'what-if',
  text: 'split into rates + labels: both keep exactly these imports - exposures address subtrees, not shapes',
};

/**
 * The five statements of §4.1: the entire access policy of the application,
 * read off the decision dots.
 *
 * The spec's own numbering groups the three bottom-row exposures to the parent into a single
 * statement, so these five sentences partition more than five dots.
 */
export const decisionPolicies: readonly DecisionPolicy[] = [
  {
    id: 'P1',
    text: 'shop exposes Money, formatDate, ProductId to its descendants.',
    deciders: ['shop'],
    channel: 'toDescendants',
  },
  {
    id: 'P2',
    text: 'catalog exposes ProductId to its parent.',
    deciders: ['catalog'],
    channel: 'toParent',
  },
  {
    id: 'P3',
    text: 'catalog exposes SkuRules to its descendants.',
    deciders: ['catalog'],
    channel: 'toDescendants',
  },
  {
    id: 'P4',
    text: 'inventory, cart and payment each expose one symbol to their parent.',
    deciders: ['inventory', 'cart', 'payment'],
    channel: 'toParent',
  },
  {
    id: 'P5',
    text: 'checkout exposes PaymentApi to its descendants.',
    deciders: ['checkout'],
    channel: 'toDescendants',
  },
];

export const legendGroups: readonly LegendGroup[] = [
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
        id: 'owns-receives',
        glyph: { kind: 'compartment', text: 'owns / receives' },
        text: 'owned here / received from a child',
      },
    ],
  },
  {
    id: 'edges',
    title: 'Along the edges',
    entries: [
      { id: 'to-parent', glyph: { kind: 'to-parent' }, text: 'to parent: one edge, one decision' },
      {
        id: 'flow-to-descendants',
        glyph: { kind: 'to-descendants' },
        text: 'flow to descendants: one decision, a subtree',
      },
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
  // The traced symbols themselves live in the header strip above the tree
  // (rendered from `tracedSymbols`), not in the legend.
];

/** The two standing notes under the legend (§3.8, group 4). */
export const legendNotes: readonly string[] = [
  'A symbol is traced - its own color, its own layer - iff its reach was decided by a module other than its owner.',
  'Files inside one module import each other freely; those imports are not drawn.',
  'There is no sibling channel and no root privilege. Every arrow here is either one edge long, or covers one whole subtree.',
];

/** Title drawn above the tree. */
export const diagramTitle = 'The core tree model - who may import what, and who decided';

/**
 * The shop diagram.
 *
 * Its second compartment is titled `receives` and lists only what a direct
 * child exposed to its parent: this diagram teaches the two channels one at a
 * time, and the `owns`/`receives` split is what makes "the root never becomes
 * the owner" visible.
 */
export const shopDiagram: DiagramDefinition = {
  id: 'shop',
  declaration: shopDeclaration,
  title: diagramTitle,
  ariaLabel: 'The ramify core tree model: ownership, the two exposure channels, and availability',
  tracedSymbols,
  chordSpecs,
  decisionPolicies,
  legendGroups,
  legendNotes,
  footnote: uniformExposureFootnote,
  whatIfNote,
  nodeContent: { receivedCompartmentTitle: 'receives', includeAncestorExposures: false },
};

const context = createDiagramContext(shopDiagram);

/** The validated, indexed universe. */
export const shopTree: ModuleTree = context.tree;

/** Every module in declaration (pre-order) order. */
export const moduleOrder: readonly ModuleId[] = context.moduleOrder;

/** The depth of every module, root = 0. */
export const moduleDepth: ReadonlyMap<ModuleId, number> = context.moduleDepth;
