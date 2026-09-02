/**
 * Example 4 - "A promise about the closure (browser)".
 *
 * The universe, the verdicts and the lessons come from
 * `docs/model/illustrative-examples.md`, which is normative for this diagram:
 * four modules, two symbols, one browser module. The tree is as trivial as
 * example 3's, and for the same reason - visibility is uniform by
 * construction, so the tag is the only variable.
 *
 * The other availability rule: example 3's `testing` carries the
 * required-module-tag rule (`⇥`), and `browser` carries the required-symbol-tag
 * rule (`⇤`) - a browser module may value-import only symbols carrying the
 * same tag. So `queryDb` is struck in `ui`: visible there, not available -
 * with one unstruck `∗` after the name, because `queryDb` remains
 * *type-available* there (a type is erased before any runtime exists). The
 * asterisk is a footnote mark: the footnote is the page's type-imports
 * section.
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
 * Example 4's legend is the series tag legend plus the one row only this
 * diagram needs: the unstruck `*` on a struck-but-type-available name. It
 * stays out of the shared legend because example 3 draws no asterisk - the
 * testing rule blocks both import forms - and an unused legend row is noise.
 */
const example4LegendGroups = seriesTagLegendGroups.map((group) =>
  group.id === 'tags'
    ? {
        ...group,
        entries: [
          ...group.entries,
          {
            id: 'type-available',
            glyph: { kind: 'struck', text: 'name', suffix: '∗' },
            text: 'not available, still type-available',
          } as const,
        ],
      }
    : group,
);

/**
 * ```text
 * app                      exposes everything it receives to its descendants
 * ├── shared               owns formatMoney (tagged browser), queryDb
 * │                        (both exposed to parent)
 * ├── ui                   browser module: carries the ⇤ browser tag
 * └── server               plain module
 * ```
 *
 * `ui` is a whole module tagged `browser`, so its dashed box fills its node -
 * the same shape as example 3's testing module. `shared` never splits - the
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
 * Every exposure path is traced. The slots repeat example 3's casting - indigo
 * for the untagged symbol, magenta for the tagged one - so a reader moving from
 * one picture to the other sees the requirement change direction rather than
 * the colors.
 */
export const example4TracedSymbols: readonly TracedSymbol[] = [
  {
    symbol: 'queryDb',
    owner: 'shared',
    color: 'traced1',
    role: 'untagged: visible in the browser module, not available there',
  },
  {
    symbol: 'formatMoney',
    owner: 'shared',
    color: 'traced2',
    role: 'tagged browser: the promise the browser module asks for',
  },
];

/** Two statements, four dots - the same shape as example 3, one level wider. */
export const example4DecisionPolicies: readonly DecisionPolicy[] = [
  {
    id: 'P1',
    text: 'shared exposes formatMoney and queryDb to its parent.',
    deciders: ['shared'],
    channel: 'toParent',
  },
  {
    id: 'P2',
    text: 'app exposes everything it receives to its descendants.',
    deciders: ['app'],
    channel: 'toDescendants',
  },
];

/** The lessons of the doc, in the glossary's vocabulary. */
export const example4LegendNotes: readonly string[] = [
  'The mirrored rule: here the importing module carries the tag, and the rule asks the symbol for the same one.',
  'The browser line is drawn per symbol, not per file or module: shared never splits to keep browser-safe and Node-only code apart.',
  'Selecting queryDb: server blinks and ui stays dark - its struck row and the strike say the same thing.',
  'The tag is a promise, not a proof: importability consults the declared browser, and a false claim is reported at the owner, never at the importer.',
];

export const example4Diagram: DiagramDefinition = {
  id: 'example4',
  declaration: example4Declaration,
  // No drawn title: the page's own heading introduces the example.
  ariaLabel:
    'Example 4: the required-symbol-tag rule - ui is a browser module, so only the browser-tagged formatMoney is available in it; the untagged queryDb is visible in ui with its name struck through, and available in the plain module server',
  tracedSymbols: example4TracedSymbols,
  // Nothing is drawn across the tree: imports that are not allowed are read
  // from absence, and selecting a symbol makes that absence visible.
  chordSpecs: [],
  decisionPolicies: example4DecisionPolicies,
  legendGroups: example4LegendGroups,
  legendNotes: example4LegendNotes,
  footnote: [],
  nodeContent: seriesNodeContent,
};
