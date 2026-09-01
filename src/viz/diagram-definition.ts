/**
 * What a diagram *is*: one module declaration plus every editorial choice that
 * turns it into a picture.
 *
 * The pipeline below this file — node content, lanes, chords, legend,
 * validation, the React view — reads a {@link DiagramDefinition} and nothing
 * else. No layout module knows which universe it is drawing, so a second
 * example costs a definition file rather than a fork of the renderer.
 *
 * Nothing declared here changes what is *true*: every ✓ and ✗ a definition
 * claims is re-derived from the evaluator by `./validate.ts` before a single
 * element is drawn. These are editorial choices — which symbols are traced and
 * in what color, which questions get an explicit chord, and the words on the
 * legend.
 *
 * Pure and browser-compatible: no I/O, no Node built-ins, no side effects.
 */

import {
  buildTree,
  type DenialReason,
  type ModuleDeclaration,
  type ModuleId,
  type ModuleTree,
  type SymbolName,
} from './model-access.js';

/**
 * A color role. Every stroke and fill in the diagram resolves to one of these,
 * and each has a light/dark pair in `./theme.ts`.
 *
 * The three `traced*` roles are *slots*, not symbols: a diagram's traced
 * symbols claim one each, so the palette is a property of the renderer and the
 * casting is a property of the diagram.
 */
export type ColorKey =
  | 'bg'
  | 'panel'
  | 'boxStroke'
  | 'separator'
  | 'text'
  | 'muted'
  | 'edge'
  | 'neutral'
  | 'traced1'
  | 'traced2'
  | 'traced3'
  | 'traced4'
  | 'denial';

/** The color slots a traced symbol may claim. At most four per diagram. */
export type TracedColorKey = 'traced1' | 'traced2' | 'traced3' | 'traced4';

/**
 * A traced symbol: given its own color slot and its own `<g>` layer.
 *
 * The series convention is to trace *every exposure path* — each one gets its
 * own color and its own selectable layer, because following the path is the
 * whole point of the picture. A symbol exposed nowhere has no path to trace
 * and stays gray; that absence is itself the statement.
 */
export interface TracedSymbol {
  readonly symbol: SymbolName;
  readonly owner: ModuleId;
  readonly color: TracedColorKey;
  /** One line for the legend chip. */
  readonly role: string;
}

/**
 * A drawn import chord — a question about one specific module and one specific
 * symbol, answered across open canvas rather than along the tree.
 *
 * The drawing policy: every denial worth drawing gets a chord, because a
 * refusal has no flow to ride; allowed imports are read off the propagation
 * flow instead, save for the rare permission that surprises.
 */
export interface ChordSpec {
  /** Stable id, also the element id: `chord-A1`. */
  readonly id: string;
  readonly importer: ModuleId;
  readonly owner: ModuleId;
  readonly symbol: SymbolName;
  readonly verdict: 'allowed' | 'denied';
  /** Short label drawn along the arc. Empty where the badge speaks for itself. */
  readonly reason: string;
  /**
   * For denials: the evaluator's reason code, cross-checked at build time. A
   * chord whose prose and whose evaluator verdict disagree is a bug in the
   * diagram, not a nuance.
   */
  readonly expectDenial?: DenialReason;
}

/**
 * One statement of the diagram's access policy, read off the decision dots.
 *
 * A statement may cover several dots (three sibling up-hops read as one
 * sentence), but every dot the layout produces must belong to exactly one
 * statement — that partition is what "count the dots and you have counted the
 * decisions" actually means, and `layout.test.ts` checks it.
 */
export interface DecisionPolicy {
  readonly id: string;
  readonly text: string;
  /** The modules whose decisions this statement covers. */
  readonly deciders: readonly ModuleId[];
  readonly channel: 'toDescendants' | 'toParent';
}

/** A legend row: a glyph sample plus one line of prose. */
export interface LegendEntry {
  readonly id: string;
  readonly glyph:
    | { readonly kind: 'marker'; readonly text: string; readonly muted?: boolean }
    /** A sample struck name, drawn exactly as a visible-not-available row is. */
    | { readonly kind: 'struck'; readonly text: string }
    | { readonly kind: 'compartment'; readonly text: string }
    | { readonly kind: 'up-hop' }
    | { readonly kind: 'grant' }
    /** The arrival a proper ancestor's grant produces: a row with no marker. */
    | { readonly kind: 'granted' }
    | { readonly kind: 'dot' }
    | { readonly kind: 'arrowhead' }
    | { readonly kind: 'chord-allowed' }
    | { readonly kind: 'chord-denied' }
    | { readonly kind: 'traced'; readonly symbol: SymbolName };
  readonly text: string;
  /** Set on traced chips: clicking the row selects that symbol. */
  readonly selects?: SymbolName;
}

export interface LegendGroup {
  readonly id: string;
  readonly title: string;
  readonly entries: readonly LegendEntry[];
}

/**
 * A dashed in-node note. Explicitly hypothetical: whatever it names is not a
 * declared module and never becomes a node.
 */
export interface WhatIfNote {
  readonly moduleId: ModuleId;
  readonly title: string;
  /** Wrapped to whatever width the node's declared content already needed. */
  readonly text: string;
}

/**
 * What a node box lists beneath the symbols it owns.
 *
 * Both channels of the model make a symbol available in a module without that
 * module owning it, and a diagram may show either one or both:
 *
 * - a direct child exposing to its parent — always shown, with the child named;
 * - a proper ancestor exposing to its descendants — shown only when
 *   `includeAncestorGrants`, with the granting ancestor named.
 *
 * A diagram teaching the two channels separately wants the first alone; one
 * teaching *reach* wants both, so that every module's box lists everything
 * available in it.
 */
export interface NodeContentOptions {
  /** Title of the compartment listing symbols exposed to this module. */
  readonly receivedCompartmentTitle: string;
  /** Also list symbols a proper ancestor granted, as `granted` rows. */
  readonly includeAncestorGrants: boolean;
}

/** One complete diagram: a universe, and everything the picture says about it. */
export interface DiagramDefinition {
  /** Stable identifier, used in error messages and by the static emitter. */
  readonly id: string;
  readonly declaration: ModuleDeclaration;
  /**
   * Title drawn above the tree. Omit it when the page around the diagram
   * already carries the heading — the picture then starts at the tree.
   */
  readonly title?: string;
  /** The `<svg>`'s accessible name. */
  readonly ariaLabel: string;
  readonly tracedSymbols: readonly TracedSymbol[];
  readonly chordSpecs: readonly ChordSpec[];
  readonly decisionPolicies: readonly DecisionPolicy[];
  readonly legendGroups: readonly LegendGroup[];
  /** Standing notes under the legend. */
  readonly legendNotes: readonly string[];
  /** Pre-wrapped lines shown between the chord rows and the legend. */
  readonly footnote: readonly string[];
  readonly whatIfNote?: WhatIfNote;
  readonly nodeContent: NodeContentOptions;
}

/**
 * The layer a symbol belongs to. Traced symbols get a layer of their own
 * (`data-symbol="ProductId"`); everything else shares the neutral bundle, so
 * selecting a traced symbol can dim exactly one thing.
 */
export const NEUTRAL_LAYER = 'neutral';

/**
 * A definition with the cheap derivations every layout module needs: the
 * validated tree, the canonical module ordering, and the traced-symbol
 * lookups.
 *
 * Ordering is the declaration's own pre-order, so every list the pipeline
 * produces is stable across runs without sorting anything.
 */
export interface DiagramContext {
  readonly definition: DiagramDefinition;
  readonly tree: ModuleTree;
  /** Every module in declaration (pre-order) order. */
  readonly moduleOrder: readonly ModuleId[];
  /** The depth of every module, root = 0. */
  readonly moduleDepth: ReadonlyMap<ModuleId, number>;
  /** The traced entry for a symbol, or `undefined` if it rides the neutral bundle. */
  readonly tracedSymbolFor: (owner: ModuleId, symbol: SymbolName) => TracedSymbol | undefined;
  /** The color a symbol's propagation is drawn in: its traced hue, or neutral slate. */
  readonly symbolColor: (owner: ModuleId, symbol: SymbolName) => ColorKey;
  readonly layerFor: (owner: ModuleId, symbol: SymbolName) => string;
}

/** Validate a definition's declaration and index everything derived from it. */
export function createDiagramContext(definition: DiagramDefinition): DiagramContext {
  const tree = buildTree(definition.declaration);
  const tracedByKey = new Map(
    definition.tracedSymbols.map((traced) => [`${traced.owner}::${traced.symbol}`, traced]),
  );
  const tracedSymbolFor = (owner: ModuleId, symbol: SymbolName): TracedSymbol | undefined =>
    tracedByKey.get(`${owner}::${symbol}`);

  return {
    definition,
    tree,
    moduleOrder: collectModuleOrder(definition.declaration),
    moduleDepth: collectDepths(definition.declaration),
    tracedSymbolFor,
    symbolColor: (owner, symbol) => tracedSymbolFor(owner, symbol)?.color ?? 'neutral',
    layerFor: (owner, symbol) => tracedSymbolFor(owner, symbol)?.symbol ?? NEUTRAL_LAYER,
  };
}

function collectModuleOrder(declaration: ModuleDeclaration): ModuleId[] {
  const ids: ModuleId[] = [declaration.id];
  for (const child of declaration.children ?? []) {
    ids.push(...collectModuleOrder(child));
  }
  return ids;
}

function collectDepths(declaration: ModuleDeclaration): Map<ModuleId, number> {
  const depths = new Map<ModuleId, number>();
  const visit = (node: ModuleDeclaration, depth: number): void => {
    depths.set(node.id, depth);
    for (const child of node.children ?? []) {
      visit(child, depth + 1);
    }
  };
  visit(declaration, 0);
  return depths;
}
