/**
 * Example 1, stage B - the `invoicing` domain alone.
 *
 * The second build-up stage the site uses to teach Example 1
 * (`docs/model/illustrative-examples.md`) progressively, and the stage that
 * introduces the second big idea: a **chain** of decisions.
 * `invoicingLibrary` exposes `InvoiceModel` up, `invoicing` grants it down,
 * and the provider's siblings receive it - the first `granted by` row of
 * the build-up and the first domain library. The empty root is again the
 * witness of the boundary: `invoicing` exposed the symbol downward only,
 * so it never reaches `app`. The other domain is deliberately absent -
 * each stage carries one theme, and the cross-domain denials belong to the
 * full diagram.
 *
 * The stage must stay recognizable as a region of the full Example 1
 * diagram: `example1-stages.test.ts` asserts its `invoicing` subtree and
 * its traced colors match `./example1.ts` exactly.
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
 * └── invoicing
 *     ├── invoicingLibrary       owns InvoiceModel
 *     ├── invoiceComputation
 *     └── invoicePDF
 * ```
 */
export const example1bDeclaration: ModuleDeclaration = {
  id: 'app',
  children: [
    {
      id: 'invoicing',
      reExposes: [{ symbol: 'InvoiceModel', from: 'invoicingLibrary', exposeToDescendants: true }],
      children: [
        { id: 'invoicingLibrary', owns: [{ symbol: 'InvoiceModel', exposeToParent: true }] },
        { id: 'invoiceComputation' },
        { id: 'invoicePDF' },
      ],
    },
  ],
};

/**
 * The symbol keeps the color slot it holds in `./example1.ts`, so the stage
 * is recognizable as a region of the finale (`traced1` stays reserved for
 * `computeTotal`, `traced3`/`traced4` for the shipping pair).
 */
export const example1bTracedSymbols: readonly TracedSymbol[] = [
  {
    symbol: 'InvoiceModel',
    owner: 'invoicingLibrary',
    color: 'traced2',
    role: 'owner → parent → that subtree',
  },
];

/** Two decisions, two dots - and one new theme: the chain. */
export const example1bDecisionPolicies: readonly DecisionPolicy[] = [
  {
    id: 'P1',
    text: 'invoicingLibrary exposes InvoiceModel to its parent.',
    deciders: ['invoicingLibrary'],
    channel: 'toParent',
  },
  {
    id: 'P2',
    text: 'invoicing exposes InvoiceModel to its descendants.',
    deciders: ['invoicing'],
    channel: 'toDescendants',
  },
];

export const example1bLegendGroups = seriesLegendGroups;

export const example1bLegendNotes: readonly string[] = [
  'InvoiceModel travels a chain of two decisions: up to invoicing, then down to its subtree.',
  'invoicing exposed it downward only, so it never reaches app.',
  'Files inside one module import each other freely; those imports are not drawn.',
];

export const example1bDiagram: DiagramDefinition = {
  id: 'example1b',
  declaration: example1bDeclaration,
  ariaLabel:
    'Example 1, stage B: invoicingLibrary exposes InvoiceModel to its parent and invoicing grants it to its subtree; the symbol reaches the provider’s siblings and never reaches the empty root',
  tracedSymbols: example1bTracedSymbols,
  chordSpecs: [],
  decisionPolicies: example1bDecisionPolicies,
  legendGroups: example1bLegendGroups,
  legendNotes: example1bLegendNotes,
  footnote: [],
  nodeContent: seriesNodeContent,
};
