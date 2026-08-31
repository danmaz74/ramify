/**
 * Diagram 1 — the core tree model, drawn on a small online shop.
 *
 * This is the complete declaration of `docs/site/diagram1-spec.md` §1.1–§1.2
 * (eight modules, eight symbols, and the exposure decision each owner made)
 * together with the editorial data of §3.6–§3.8 and §5: which symbols are
 * traced and in what color, which questions get an explicit chord, and the
 * words on the legend.
 *
 * Everything the diagram draws beyond the declaration is *derived* from it by
 * the evaluator — including the `holds` compartments, which need no
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
 * shop                      (application root — an ordinary module)
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
  // `catalog` exposed `ProductId` upward; `shop` sends it back down into the
  // whole application. The router never becomes the owner.
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
 * §3.7's criterion — *a symbol is traced iff its reach was decided by a module
 * other than its owner* — picks exactly these three. `CartApi` is traced even
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
    role: 'held, not routed: the ribbon stops',
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
    reason: "grant covers checkout's subtree",
    expectDenial: 'no-exposure-chain',
  },
  {
    id: 'D4',
    importer: 'payment',
    owner: 'cart',
    symbol: 'CartApi',
    verdict: 'denied',
    reason: 'held by checkout, not re-exposed',
    expectDenial: 'no-exposure-chain',
  },
  {
    id: 'D1',
    importer: 'checkout',
    owner: 'catalog',
    symbol: 'SkuRules',
    verdict: 'denied',
    reason: "grant covers catalog's subtree",
    expectDenial: 'no-exposure-chain',
  },
];

/**
 * The uniform-grant footnote (§1.5), anchored to chord A1. It is the only
 * allowed import the diagram draws, because it is the only one whose answer
 * surprises people.
 */
export const uniformGrantFootnote: readonly string[] = [
  'A1 — search may import ProductId. catalog exposed it only to its parent, so catalog gave',
  'its own children nothing; shop sent it back down into every branch, including the branch it',
  'came up through. A descendant grant is uniform: no backflow exclusion, no provenance carried.',
];

/**
 * The what-if annotation (X4, kept at §5.1): a dashed in-node note on
 * `shipping`, the only witness for subdivision invariance. It is explicitly
 * hypothetical — `rates` and `labels` are not declared modules and never
 * become nodes.
 */
export const whatIfNote: WhatIfNote = {
  moduleId: 'shipping',
  title: 'what-if',
  text: 'split into rates + labels: both keep exactly these imports — grants address subtrees, not shapes',
};

/**
 * The five statements of §4.1: the entire access policy of the application,
 * read off the decision dots.
 *
 * The spec's own numbering groups the three bottom-row up-hops into a single
 * statement, so these five sentences partition more than five dots.
 */
export const decisionPolicies: readonly DecisionPolicy[] = [
  {
    id: 'P1',
    text: 'shop grants Money, formatDate, ProductId to its subtree.',
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
    text: 'catalog grants SkuRules to its subtree.',
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
    text: 'checkout grants PaymentApi to its subtree.',
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
        id: 'owns-holds',
        glyph: { kind: 'compartment', text: 'owns / holds' },
        text: 'owned here / received from a child',
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
  // The traced contracts themselves live in the header strip above the tree
  // (rendered from `tracedSymbols`), not in the legend.
];

/** The two standing notes under the legend (§3.8, group 4). */
export const legendNotes: readonly string[] = [
  'A symbol is traced — its own color, its own layer — iff its reach was decided by a module other than its owner.',
  'Files inside one module import each other freely; those imports are not drawn.',
  'There is no sibling channel and no root privilege. Every arrow here is either one edge long, or covers one whole subtree.',
];

/** Title drawn above the tree. */
export const diagramTitle = 'The core tree model — who may import what, and who decided';

/**
 * The shop diagram.
 *
 * Its second compartment is titled `holds` and lists only what a direct child
 * exposed upward: this diagram teaches the two channels one at a time, and the
 * `owns`/`holds` split is what makes "the root never becomes the owner"
 * visible. The compartment's name is a pending decision of its own, recorded
 * in `docs/model/glossary.md`.
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
  footnote: uniformGrantFootnote,
  whatIfNote,
  nodeContent: { receivedCompartmentTitle: 'holds', includeAncestorGrants: false },
};

const context = createDiagramContext(shopDiagram);

/** The validated, indexed universe. */
export const shopTree: ModuleTree = context.tree;

/** Every module in declaration (pre-order) order. */
export const moduleOrder: readonly ModuleId[] = context.moduleOrder;

/** The depth of every module, root = 0. */
export const moduleDepth: ReadonlyMap<ModuleId, number> = context.moduleDepth;
