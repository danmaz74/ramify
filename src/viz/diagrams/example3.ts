/**
 * Example 3 - "The tag is the entire difference (testing)".
 *
 * This file is the universe's normative statement: four modules, two
 * symbols, one testing module. Everything is exposed to the
 * parent and re-exposed to its descendants, so both symbols are visible in
 * every box - and then one symbol is tagged `testing` and its availability
 * rule decides where it is actually available.
 *
 * The lesson is the required-module-tag rule (`⇥`): a symbol tagged `testing`
 * is available only in modules carrying the same tag. Visibility is uniform
 * here by construction, so the tag is the only variable in the picture. The
 * struck name in `billing` states it statically - visible there, not
 * available - and selecting `resetOrderStore` shows it in motion: the testing
 * module blinks and `billing` stays dark.
 *
 * Nothing about the tags is declared to the renderer. The chip, the context box
 * and the blink sets are all derived from this declaration through the
 * evaluator, and `../validate.ts` re-derives every one of them before a single
 * element is drawn.
 *
 * Pure and browser-compatible: no I/O, no Node built-ins, no side effects.
 */

import type {
  DecisionPolicy,
  DiagramDefinition,
  TracedSymbol,
} from '../diagram-definition.js';
import type { ModuleDeclaration } from '../model-access.js';
import { seriesNodeContent, seriesTagLegendGroups } from './series.js';

/**
 * ```text
 * app                      exposes everything it receives to its descendants
 * ├── orders               owns OrderService, resetOrderStore (tagged testing)
 * │                        (both exposed to parent)
 * ├── billing              production consumer
 * └── integration-tests    testing module: carries the ⇥ testing tag
 * ```
 *
 * The tree is deliberately trivial: two hops, no interesting reach, nothing
 * examples 1 and 2 already taught. The integration tests are their own module,
 * a child of `app` - the lowest common ancestor whose composition they
 * exercise, per the specification's recommendation - and the whole module is
 * tagged `testing`, so the dashed box fills its node.
 *
 * Verdicts (visibility is identical in every column; only the tag differs):
 *
 * | Importer | `OrderService` | `resetOrderStore` (tagged `⇥ testing`) |
 * | --- | --- | --- |
 * | `billing` (production) | ✓ | ✗ - available only in testing modules |
 * | `integration-tests` (testing module) | ✓ | ✓ |
 */
export const example3Declaration: ModuleDeclaration = {
  id: 'app',
  // Exposing received test support to every descendant is safe at any breadth:
  // the availability rule travels with the symbol and withholds it from
  // untagged modules everywhere the exposure reaches.
  reExposes: [
    { symbol: 'OrderService', from: 'orders', exposeToDescendants: true },
    { symbol: 'resetOrderStore', from: 'orders', exposeToDescendants: true },
  ],
  children: [
    {
      id: 'orders',
      // Two identical exposures. The tag on the second is the entire
      // difference between them, and test support is curated symbol by symbol:
      // tests never receive blanket private access.
      owns: [
        { symbol: 'OrderService', exposeToParent: true },
        { symbol: 'resetOrderStore', exposeToParent: true, tags: ['testing'] },
      ],
    },
    { id: 'billing' },
    { id: 'integration-tests', moduleTags: ['testing'] },
  ],
};

/**
 * Every exposure path is traced - the series convention. The two symbols travel
 * the identical chain, so the slots are chosen for contrast rather than for
 * meaning: indigo for the ordinary contract, magenta for the one wearing a tag.
 */
export const example3TracedSymbols: readonly TracedSymbol[] = [
  {
    symbol: 'OrderService',
    owner: 'orders',
    color: 'traced1',
    role: 'the default contract: every module the exposure reaches may import it',
  },
  {
    symbol: 'resetOrderStore',
    owner: 'orders',
    color: 'traced2',
    role: 'same chain, tagged testing: available only in testing modules',
  },
];

/** Two statements, four dots - one exposure decision each way, per symbol. */
export const example3DecisionPolicies: readonly DecisionPolicy[] = [
  {
    id: 'P1',
    text: 'orders exposes OrderService and resetOrderStore to its parent.',
    deciders: ['orders'],
    channel: 'toParent',
  },
  {
    id: 'P2',
    text: 'app exposes everything it receives to its descendants.',
    deciders: ['app'],
    channel: 'toDescendants',
  },
];

/** The lessons the diagram teaches, in the glossary's vocabulary. */
export const example3LegendNotes: readonly string[] = [
  'Both symbols are visible everywhere; the ⇥ testing chip alone decides where the tagged one is available.',
  'Tags never expose: the testing module imports nothing the tree did not re-expose to it - it sees OrderService because the chain reaches it.',
  'Test support is curated symbol by symbol, and a symbol is real contract or test support, never both.',
  'Exposing to descendants is safe at any subtree width: the availability rule travels with the symbol, so it is not available in untagged modules anywhere the exposure reaches.',
];

export const example3Diagram: DiagramDefinition = {
  id: 'example3',
  declaration: example3Declaration,
  // No drawn title: the page's own heading introduces the example.
  ariaLabel:
    'Example 3: two symbols with identical exposures, one of them tagged testing - an exposed symbol is available in a module only if every availability rule of its tags is satisfied, so both are available in the testing module integration-tests while in the production module billing the tagged one is visible but not available, its name struck through',
  tracedSymbols: example3TracedSymbols,
  // Nothing is drawn across the tree: imports that are not allowed are read
  // from absence, and selecting a symbol makes that absence visible.
  chordSpecs: [],
  decisionPolicies: example3DecisionPolicies,
  legendGroups: seriesTagLegendGroups,
  legendNotes: example3LegendNotes,
  footnote: [],
  nodeContent: seriesNodeContent,
};
