/**
 * The tag vocabulary: tags, their availability rules and import bindings.
 *
 * Implements the parameter schema of
 * `docs/model/cross-module-importability-rules.md`
 * §"Contextual rules", in the vocabulary of `docs/model/glossary.md`: a tag is
 * not just a name — when a tag is defined, it is associated with its
 * availability rule, and it always carries it. The same tag names are assigned
 * to symbols (by their owner, immutably) and to modules (in the module
 * definition), and the **tag based availability rules** decide which
 * combinations make an exposed symbol available:
 *
 * - **Required symbol tag** — if the module has the tag, the only symbols
 *   visible from exposure that are available in it are those carrying the same
 *   tag.
 * - **Required module tag** — if the symbol has the tag, it is only available
 *   from exposure in modules carrying the same tag.
 *
 * When several rules apply to the same symbol and module, all of them must be
 * satisfied. Tags are therefore purely restrictive: nothing in this file ever
 * makes an import legal; it can only add a condition to one the tree rules
 * already allow. The conjunction itself lives in `./availability.ts`.
 *
 * **Built-ins only.** The parameter schema is general, but the model ships with
 * exactly the two tags below and no way to declare more. A project-configurable
 * access-rule language would turn effective project law into per-repository
 * policy; the complexity cap outweighs the flexibility. Project-declared tags
 * remain possible as inert classification for search and documentation — they
 * carry no importability semantics and so do not appear here.
 *
 * This module is pure and browser-compatible: no I/O, no Node built-ins, no
 * side effects, and no dependency on the rest of the model.
 */

/**
 * How an importing file binds a symbol.
 *
 * The one term the contextual rules add to the core vocabulary, and they add it
 * for one reason: a type import is erased before any runtime exists, so
 * platform requirements exempt it while testing requirements do not.
 */
export type ImportBinding = 'value' | 'type';

/**
 * A tag: one name, assignable to symbols and to modules, carrying its
 * availability rule wherever it goes.
 *
 * - `testing` — on a symbol: the exposure is test support (fakes, in-memory
 *   stores, reset hooks) available only in testing modules. On a module: the
 *   files are tests.
 * - `browser` — on a symbol: a promise that its entire transitive runtime
 *   closure is browser-safe, the owner's private files included. On a module:
 *   the files run in a browser, so they may value-import only `browser`
 *   symbols.
 */
export type Tag = 'testing' | 'browser';

/** A tag in symbol position: assigned by the owner, immutable, travels with the symbol. */
export type SymbolTag = Tag;

/**
 * A tag in module position: declared in the module definition, classifying the
 * module's files. Classification never depends on a file's name: it is always
 * declared.
 */
export type ModuleTag = Tag;

/**
 * Which import bindings an availability rule applies to.
 *
 * `value-imports` exempts type-only imports, which are erased at runtime; `all`
 * covers both bindings.
 */
export type RequirementScope = 'all' | 'value-imports';

/**
 * What a tag means in symbol position.
 *
 * The `verify` parameter of the specification's schema is deliberately absent.
 * It attaches an externally checked proof obligation to a tag's factual claim —
 * for `browser`, that the symbol's runtime closure really is browser-safe — and
 * verification is not an importability rule: the importability decision
 * consults only the declared tag, and a false claim is the owner's error,
 * reported at the owner. This evaluator therefore records nothing about it.
 */
export interface SymbolTagDefinition {
  /**
   * The tag's required-module-tag rule: module tags the importing files must
   * carry. Empty when the tag carries no rule in symbol position.
   */
  readonly requires: readonly ModuleTag[];
  /** Whether the rule covers every binding or only value imports. */
  readonly appliesTo: RequirementScope;
  /**
   * Whether the tag may be combined with the default contract channel. An
   * exclusive tag removes the symbol from the default contract: it is real
   * contract or it is this tag's business, never ambiguously both.
   */
  readonly exclusive: boolean;
}

/** What a tag means in module position. */
export interface ModuleTagDefinition {
  /**
   * The tag's required-symbol-tag rule: symbol tags the imported symbol must
   * carry. Empty when the tag carries no rule in module position — the mirror
   * image of {@link SymbolTagDefinition}.
   */
  readonly requires: readonly SymbolTag[];
  /** Whether the rule covers every binding or only value imports. */
  readonly appliesTo: RequirementScope;
  /**
   * The symbol tag that symbols exposed from a module carrying this tag get
   * unless their owner declares a tag set. This is what makes everything a
   * testing module exposes implicitly `testing`: test infrastructure can never
   * enter a production ceiling.
   */
  readonly symbolsDefaultTo?: SymbolTag;
}

/**
 * Every tag in symbol position, with its parameters.
 *
 * `testing` carries a required-module-tag rule covering every binding: a type
 * import of a test fake is still test-only coupling. `browser` carries no rule
 * in symbol position — it is a claim about the symbol, which the tag's module
 * position consumes from the other direction.
 */
export const SYMBOL_TAGS: Readonly<Record<SymbolTag, SymbolTagDefinition>> = {
  testing: { requires: ['testing'], appliesTo: 'all', exclusive: true },
  browser: { requires: [], appliesTo: 'all', exclusive: false },
};

/**
 * Every tag in module position, with its parameters.
 *
 * `browser` carries a required-symbol-tag rule on value imports: a browser
 * module may value-import only `browser` symbols, among those the tree rules
 * already allow; type-only imports pass freely. `testing` carries no rule in
 * module position — it is the side the symbol-position rule requires — and
 * defaults the module's own symbols to `testing`.
 */
export const MODULE_TAGS: Readonly<Record<ModuleTag, ModuleTagDefinition>> = {
  testing: { requires: [], appliesTo: 'all', symbolsDefaultTo: 'testing' },
  browser: { requires: ['browser'], appliesTo: 'value-imports' },
};

/** Whether a rule of the given scope is in force for the given binding. */
export function appliesToBinding(scope: RequirementScope, binding: ImportBinding): boolean {
  return scope === 'all' || binding === 'value';
}

/**
 * The symbol tag that symbols exposed from files carrying these module tags
 * default to, if any.
 *
 * The first module tag that names a default wins. With the built-in tags only
 * one ever does, so the order is not observable; the rule is stated anyway so
 * that the answer never depends on how a declaration happens to be written.
 */
export function defaultSymbolTag(moduleTags: readonly ModuleTag[]): SymbolTag | undefined {
  for (const moduleTag of moduleTags) {
    const fallback = MODULE_TAGS[moduleTag].symbolsDefaultTo;
    if (fallback !== undefined) {
      return fallback;
    }
  }
  return undefined;
}
