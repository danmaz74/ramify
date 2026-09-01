/**
 * Example 4 — "A promise about the closure (browser)".
 *
 * The universe, the verdicts and the lessons come from
 * `docs/model/illustrative-examples.md`, which is normative for this diagram:
 * four modules, two symbols, one browser module. The tree is as trivial as
 * example 3's, and for the same reason — visibility is uniform by
 * construction, so the tag is the only variable.
 *
 * The other availability rule: example 3's `testing` carries the
 * required-module-tag rule (`⇥`), and `browser` carries the required-symbol-tag
 * rule (`⇤`) — a browser module may value-import only symbols carrying the
 * same tag. Type-only imports pass freely, because a type is erased before any
 * runtime exists — which is the one row affordance this diagram adds, written
 * on `queryDb`'s arrival in `ui` in words rather than in a new glyph.
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
 * app                      grants everything it receives to its subtree
 * ├── shared               owns formatMoney (tagged browser), queryDb
 * │                        (both exposed to parent)
 * ├── ui                   browser module: carries the ⇤ browser tag
 * └── server               plain module
 * ```
 *
 * `ui` is a whole module tagged `browser`, so its dashed box fills its node —
 * the same shape as example 3's testing module. `shared` never splits — the
 * browser line is drawn per symbol, not per file or module.
 */
export const example4Declaration: ModuleDeclaration = {
  id: 'app',
  reExposes: [
    { symbol: 'formatMoney', from: 'shared', exposeToDescendants: true },
    { symbol: 'queryDb', from: 'shared', exposeToDescendants: true },
  ],
  children: [
    {
      id: 'shared',
      // `browser` is a falsifiable promise about the symbol's entire
      // transitive runtime closure. Importability consults only the declared
      // tag; verification walks the closure separately, and a false claim is
      // reported at the owner.
      owns: [
        { symbol: 'formatMoney', exposeToParent: true, tags: ['browser'] },
        { symbol: 'queryDb', exposeToParent: true },
      ],
    },
    { id: 'ui', moduleTags: ['browser'] },
    { id: 'server' },
  ],
};

/**
 * Every exposure path is traced. The slots repeat example 3's casting — indigo
 * for the untagged symbol, magenta for the tagged one — so a reader moving from
 * one picture to the other sees the requirement change direction rather than
 * the colors.
 */
export const example4TracedSymbols: readonly TracedSymbol[] = [
  {
    symbol: 'queryDb',
    owner: 'shared',
    color: 'traced1',
    role: 'untagged: the browser module may import it as a type, not as a value',
  },
  {
    symbol: 'formatMoney',
    owner: 'shared',
    color: 'traced2',
    role: 'tagged browser: the promise the browser module asks for',
  },
];

/** Two statements, four dots — the same shape as example 3, one level wider. */
export const example4DecisionPolicies: readonly DecisionPolicy[] = [
  {
    id: 'P1',
    text: 'shared exposes formatMoney and queryDb to its parent.',
    deciders: ['shared'],
    channel: 'toParent',
  },
  {
    id: 'P2',
    text: 'app grants everything it receives to its descendants.',
    deciders: ['app'],
    channel: 'toDescendants',
  },
];

/** The lessons of the doc, in the glossary's vocabulary. */
export const example4LegendNotes: readonly string[] = [
  'The mirrored rule: here the importing module carries the tag, and the rule asks the symbol for the same one.',
  'The browser line is drawn per symbol, not per file or module: shared never splits to keep browser-safe and Node-only code apart.',
  'Type-only imports pass freely — a type is erased before any runtime exists — so ui may import queryDb as a type and not as a value.',
  'The tag is a promise, not a proof: importability consults the declared browser, and a false claim is reported at the owner, never at the importer.',
];

export const example4Diagram: DiagramDefinition = {
  id: 'example4',
  declaration: example4Declaration,
  // No drawn title: the page's own heading introduces the example.
  ariaLabel:
    'Example 4: the required-symbol-tag rule — ui is a browser module, so it may value-import only the browser-tagged formatMoney, while the untagged queryDb reaches it as a type-only import and reaches the plain module server either way',
  tracedSymbols: example4TracedSymbols,
  // Nothing is drawn across the tree: imports that are not allowed are read
  // from absence, and selecting a symbol makes that absence visible.
  chordSpecs: [],
  decisionPolicies: example4DecisionPolicies,
  legendGroups: seriesTagLegendGroups,
  legendNotes: example4LegendNotes,
  footnote: [],
  nodeContent: seriesNodeContent,
};
