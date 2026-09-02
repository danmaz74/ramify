/**
 * Example 2 - "Both channels at once".
 *
 * The universe and the decisions come from
 * `docs/model/illustrative-examples.md`, which is normative for this diagram:
 * five modules, two symbols, three decisions. One owner exposes one symbol
 * through both channels - to its parent and to its descendants - and the
 * `▲▼` marker makes its first appearance in the series.
 *
 * The lesson is the ceiling: both channels at once buy exactly the owner's
 * subtree plus its parent, and nothing more. `checkout`, the sibling that
 * would most plausibly want `PriceModel`, is not allowed - crossing to a
 * sibling was never the owner's decision to make, and `app` made none.
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
 * app
 * ├── pricing              owns PriceModel
 * │   ├── discounts
 * │   └── taxes
 * └── checkout             owns submitOrder
 * ```
 *
 * Two consumers under `pricing` are deliberate: an exposure to descendants
 * needs at least two arrivals to read as one rather than as a private handoff.
 * `submitOrder` is furniture, not a lesson - a known specimen from Example 1
 * (exposed to the parent, composed, stopped) that keeps `checkout` a real module and
 * gives `app` two stopped rows side by side.
 */
export const example2Declaration: ModuleDeclaration = {
  id: 'app',
  children: [
    {
      id: 'pricing',
      // Both channels at once: two independent one-hop decisions on one
      // owned symbol. Everything the diagram teaches hangs on this line.
      owns: [{ symbol: 'PriceModel', exposeToParent: true, exposeToDescendants: true }],
      children: [{ id: 'discounts' }, { id: 'taxes' }],
    },
    {
      id: 'checkout',
      owns: [{ symbol: 'submitOrder', exposeToParent: true }],
    },
  ],
};

/**
 * Every exposure path is traced - the series convention. `submitOrder`
 * wears slot 3, the same hue as Example 1's `optimizeRoute`: it plays the
 * identical role (exposed to the parent, composed, stopped), and the repeated color
 * lets a reader who followed Example 1 recognize the specimen at a glance.
 */
export const example2TracedSymbols: readonly TracedSymbol[] = [
  {
    symbol: 'PriceModel',
    owner: 'pricing',
    color: 'traced1',
    role: 'both channels at once: parent + own subtree, nothing more',
  },
  {
    symbol: 'submitOrder',
    owner: 'checkout',
    color: 'traced3',
    role: 'exposed to the parent, composed, stopped: parent only',
  },
];

/** Three decisions, three dots - five modules and one theme. */
export const example2DecisionPolicies: readonly DecisionPolicy[] = [
  {
    id: 'P1',
    text: 'pricing exposes PriceModel to its descendants.',
    deciders: ['pricing'],
    channel: 'toDescendants',
  },
  {
    id: 'P2',
    text: 'pricing exposes PriceModel to its parent.',
    deciders: ['pricing'],
    channel: 'toParent',
  },
  {
    id: 'P3',
    text: 'checkout exposes submitOrder to its parent.',
    deciders: ['checkout'],
    channel: 'toParent',
  },
];

/** The lessons of the doc, in the glossary's vocabulary. */
export const example2LegendNotes: readonly string[] = [
  '▲▼ is not a third channel: two independent one-hop decisions sharing a row.',
  "Both channels at once buy exactly the owner's subtree plus its parent - the most any owner can reach alone.",
  'Reach ends where decisions end: app made none, and both symbols stop there.',
];

export const example2Diagram: DiagramDefinition = {
  id: 'example2',
  declaration: example2Declaration,
  ariaLabel:
    'Example 2: pricing exposes PriceModel through both channels at once - to its parent and to its descendants - and still reaches only its own subtree plus its parent; its sibling checkout is not allowed to import it',
  tracedSymbols: example2TracedSymbols,
  // Nothing is drawn across the tree: non-allowed imports are read from
  // absence, and selecting a symbol makes that absence visible.
  chordSpecs: [],
  decisionPolicies: example2DecisionPolicies,
  legendGroups: seriesLegendGroups,
  legendNotes: example2LegendNotes,
  footnote: [],
  nodeContent: seriesNodeContent,
};
