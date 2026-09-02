/**
 * Example 1, stage A - the `shipping` fragment.
 *
 * The first of two build-up stages the site uses to teach Example 1
 * (`./example1.ts`) progressively: the smallest structure that exhibits the
 * entire mechanism. One parent-child edge carries both channels -
 * `routingOptimization` exposes `optimizeRoute` to its parent, `shipping`
 * exposes `ShipmentPlan` to its descendants - and the empty root
 * above them is the witness that both symbols stop: closed by default is
 * drawn, not asserted.
 *
 * The fragment must stay recognizable as a region of the full Example 1
 * diagram: `example1-stages.test.ts` asserts its `shipping` subtree and its
 * traced colors match `./example1.ts` exactly.
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
 * app                            (root - owns nothing, decides nothing)
 * └── shipping                   owns ShipmentPlan
 *     └── routingOptimization    owns optimizeRoute
 * ```
 */
export const example1aDeclaration: ModuleDeclaration = {
  id: 'app',
  children: [
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
 * Colors are the full diagram's: the symbols keep the slots they hold in
 * `./example1.ts`, so the stage is recognizable as a region of the finale.
 */
export const example1aTracedSymbols: readonly TracedSymbol[] = [
  // Shorter roles than the finale's: this strip is only as wide as the
  // three-box tree, and the full-length lines clip against its edge.
  {
    symbol: 'optimizeRoute',
    owner: 'routingOptimization',
    color: 'traced3',
    role: 'to its parent, then stops',
  },
  {
    symbol: 'ShipmentPlan',
    owner: 'shipping',
    color: 'traced4',
    role: 'to its descendants only',
  },
];

/** Two decisions, two dots - the entire access policy of the fragment. */
export const example1aDecisionPolicies: readonly DecisionPolicy[] = [
  {
    id: 'P1',
    text: 'routingOptimization exposes optimizeRoute to its parent.',
    deciders: ['routingOptimization'],
    channel: 'toParent',
  },
  {
    id: 'P2',
    text: 'shipping exposes ShipmentPlan to its descendants.',
    deciders: ['shipping'],
    channel: 'toDescendants',
  },
];

export const example1aLegendGroups = seriesLegendGroups;

export const example1aLegendNotes: readonly string[] = [
  'Neither symbol reaches app: reach ends where decisions end.',
  'Files inside one module import each other freely; those imports are not drawn.',
];

export const example1aDiagram: DiagramDefinition = {
  id: 'example1a',
  declaration: example1aDeclaration,
  ariaLabel:
    'Example 1, stage A: routingOptimization exposes optimizeRoute to its parent and shipping exposes ShipmentPlan to its descendants; neither symbol reaches the empty root',
  tracedSymbols: example1aTracedSymbols,
  chordSpecs: [],
  decisionPolicies: example1aDecisionPolicies,
  legendGroups: example1aLegendGroups,
  legendNotes: example1aLegendNotes,
  footnote: [],
  nodeContent: seriesNodeContent,
};
