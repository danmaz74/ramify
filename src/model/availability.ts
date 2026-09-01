/**
 * Availability, and the file-level importability rule built on it.
 *
 * Implements the rule specified in
 * `docs/model/cross-module-importability-rules.md`, in the vocabulary of
 * `docs/model/glossary.md`. The rule has two conjuncts, and this file keeps
 * them apart.
 *
 * The tree conjunct — the ceiling:
 *
 * > A file may import a symbol iff that symbol is **available** in the file's
 * > module.
 * >
 * > A symbol is available in a module if the module owns it, or if some other
 * > module exposed it there: a direct child exposing to its parent, or a
 * > proper ancestor exposing to its descendants.
 *
 * The contextual conjunct — the tags:
 *
 * > A file may import a symbol iff the tree rules allow it AND every
 * > cross-requirement of every tag involved — on the exposed symbol and on the
 * > importer's context — is satisfied.
 *
 * {@link isAvailable} and {@link explainAvailability} answer the first,
 * module-level question: what the exposure structure puts within a module's
 * reach. {@link mayImport} and {@link explainImport} answer the complete
 * question, for one importing file, described by its module, the importer
 * context it sits in and the binding it uses.
 *
 * **Availability is tag-free, and importability is not.** A tag restricts
 * *importing*, per context; it changes nobody's availability, and it is
 * consulted only after the tree rules have already said yes — which is how the
 * model's promise that tags never grant is kept structurally rather than
 * argued. In a universe that declares no tag the two questions coincide, as the
 * glossary's definition says; where tags are declared, availability is the
 * ceiling and importability is what a particular context may take from it.
 *
 * This module is pure and browser-compatible: no I/O, no Node built-ins, no
 * side effects.
 */

import {
  MODULE_TAGS,
  SYMBOL_TAGS,
  appliesToBinding,
  type ModuleTag,
  type SymbolTag,
  type ImportBinding,
} from './tags.js';
import {
  ancestorsOf,
  moduleTagsOf,
  symbolTagsOf,
  ownedSymbol,
  requireModule,
  type ContextName,
  type ExposureDeclaration,
  type ModuleId,
  type ModuleTree,
  type SymbolName,
  type SymbolRef,
} from './tree.js';

/** Why a symbol is available — which sentence of the rule answered. */
export type ImportClause =
  /** The module owns the symbol; no boundary is crossed. */
  | 'same-module'
  /** A direct child of the module exposed the symbol to its parent. */
  | 'child-exposure'
  /** A proper ancestor exposed the symbol to its descendants. */
  | 'ancestor-grant';

/**
 * Why an import is not allowed.
 *
 * The first three reasons are the tree's: the symbol never became available in
 * the importing module. The last two are the tags': the symbol is available,
 * and a cross-requirement of the import is unmet. Which side stated the
 * requirement is the whole difference between them, and `requires` has a
 * direction — so the two reasons name it.
 */
export type DenialReason =
  /** The named owner declares no symbol by that name. */
  | 'symbol-not-owned'
  /**
   * The owner exposes the symbol through neither channel, so it never leaves
   * the module that owns it. There is no implicit public surface.
   */
  | 'never-exposed'
  /** Exposed by its owner, but no chain of exposures reaches this module. */
  | 'no-exposure-chain'
  /**
   * An exposure tag of the symbol requires a context tag the importing file's
   * context does not carry — `testing` outside a test context.
   */
  | 'symbol-tag-requires-module-tag'
  /**
   * A context tag of the importing file requires an exposure tag the symbol
   * does not carry — a browser context value-importing an untagged symbol.
   */
  | 'module-tag-requires-symbol-tag';

/** The cross-requirement that was not met, in the direction that states it. */
export interface UnmetTagRequirement {
  /** The tag stating the requirement: on the exposed symbol, or on the context. */
  readonly tag: SymbolTag | ModuleTag;
  /** The tag it requires on the other side of the import. */
  readonly requires: SymbolTag | ModuleTag;
}

export interface ImportAllowed {
  readonly allowed: true;
  readonly clause: ImportClause;
  /**
   * The module whose decision made the symbol available: the direct child that
   * exposed to its parent, or the granting ancestor. `null` for a module's own
   * symbols, where nobody had to decide anything.
   */
  readonly via: ModuleId | null;
  /**
   * The exposure tags the symbol carries, when it carries any: the import meets
   * every one of their cross-requirements. Absent for the default contract
   * channel.
   */
  readonly tags?: readonly SymbolTag[];
}

export interface ImportDenied {
  readonly allowed: false;
  readonly reason: DenialReason;
  /** Which cross-requirement was unmet. Present for the two tag reasons only. */
  readonly unmet?: UnmetTagRequirement;
}

export type ImportDecision = ImportAllowed | ImportDenied;

/**
 * Where an importing file sits, and how it binds what it imports — everything
 * about the importer the complete rule reads.
 *
 * `context` names an importer context the module declares; omit it for the
 * module's own files. `binding` defaults to `value`, the binding subject to
 * every requirement: the type-only exemption is claimed, never assumed.
 */
export interface ImporterDescriptor {
  readonly module: ModuleId;
  readonly context?: ContextName;
  readonly binding?: ImportBinding;
}

/**
 * An importing file. A bare module id is shorthand for a value import from a
 * file in that module's own context — the reading every importer had before
 * contexts and bindings existed.
 */
export type Importer = ModuleId | ImporterDescriptor;

type Channel = keyof ExposureDeclaration;

interface ResolvedImporter {
  readonly module: ModuleId;
  readonly context: ContextName | undefined;
  readonly binding: ImportBinding;
}

/** An unmet cross-requirement together with the reason code that names it. */
interface UnmetRequirementFinding extends UnmetTagRequirement {
  readonly reason: DenialReason;
}

/**
 * Is `symbol`, owned by `ownerModule`, available in `moduleId`?
 *
 * The module-level question: what the exposure structure puts within the
 * module's reach. Availability is a property of a module, so it is asked of a
 * module — no context, no binding — and it is tag-free: a tag restricts who may
 * import a symbol, not where the symbol arrives.
 *
 * In a universe that declares no tag, availability and importability are one
 * predicate, as the glossary says. Where a tag is involved, this is the
 * ceiling: {@link mayImport} answers what a particular importing file may
 * actually take from it, and is never more permissive.
 */
export function isAvailable(
  tree: ModuleTree,
  moduleId: ModuleId,
  ownerModule: ModuleId,
  symbol: SymbolName,
): boolean {
  return explainAvailability(tree, moduleId, ownerModule, symbol).allowed;
}

/**
 * {@link isAvailable} with its reasoning: which clause of the availability rule
 * put the symbol within the module's reach and whose decision that was, or the
 * reason nothing did.
 *
 * The clauses are tried in the rule's own order, so a symbol several of them
 * would allow is attributed to the earliest — ownership first, even when an
 * ancestor grant also reaches the module.
 *
 * Throws if either module id is unknown; a typo in a declaration is an error,
 * not an answer.
 */
export function explainAvailability(
  tree: ModuleTree,
  moduleId: ModuleId,
  ownerModule: ModuleId,
  symbol: SymbolName,
): ImportDecision {
  const consumer = requireModule(tree, moduleId);
  requireModule(tree, ownerModule);

  const owned = ownedSymbol(tree, ownerModule, symbol);
  if (owned === undefined) {
    // The rule is stated about a symbol owned by a module. If that module owns
    // no such symbol there is nothing to import, for anybody.
    return { allowed: false, reason: 'symbol-not-owned' };
  }

  // A module's own symbols are available in it: a file belonging to the owner
  // imports them freely, and no boundary is crossed.
  if (moduleId === ownerModule) {
    return { allowed: true, clause: 'same-module', via: null };
  }

  if (owned.exposeToParent !== true && owned.exposeToDescendants !== true) {
    // The owner opened neither channel, so the symbol is available nowhere
    // else, whatever any other module declares. Reported separately only to
    // name the reason precisely.
    return { allowed: false, reason: 'never-exposed' };
  }

  const ref: SymbolRef = { owner: ownerModule, name: symbol };

  // A direct child exposed the symbol to the consumer.
  for (const child of consumer.children) {
    if (ownedOrReceived(tree, child, ref) && exposes(tree, child, ref, 'exposeToParent')) {
      return { allowed: true, clause: 'child-exposure', via: child };
    }
  }

  // A proper ancestor exposed the symbol to its descendants. Ancestors are
  // tried nearest first, so `via` names the closest module that could have
  // refused.
  for (const ancestor of ancestorsOf(tree, moduleId)) {
    if (ownedOrReceived(tree, ancestor, ref) && exposes(tree, ancestor, ref, 'exposeToDescendants')) {
      return { allowed: true, clause: 'ancestor-grant', via: ancestor };
    }
  }

  return { allowed: false, reason: 'no-exposure-chain' };
}

/**
 * May `importer` import `symbol`, owned by `ownerModule`?
 *
 * The model's one question, complete: the tree rules and every tag
 * cross-requirement. See {@link explainImport} for which part of the rule
 * answered it.
 */
export function mayImport(
  tree: ModuleTree,
  importer: Importer,
  ownerModule: ModuleId,
  symbol: SymbolName,
): boolean {
  return explainImport(tree, importer, ownerModule, symbol).allowed;
}

/**
 * {@link mayImport} with its reasoning: how the symbol became available and
 * which module's decision made it so, or the reason the import is not allowed —
 * a tree reason, or the tag cross-requirement that was unmet.
 *
 * The two conjuncts are evaluated in the rule's own order. The tree rules go
 * first, and an import they refuse is refused for their reason: no tag is ever
 * consulted, so no tag can ever make an import legal that the structure alone
 * would refuse.
 *
 * Same-owner imports are outside the model. A file importing a symbol its own
 * module owns crosses no boundary, and whether the owner keeps its platform or
 * test code apart internally is the owner's business.
 *
 * Throws if either module id is unknown, or if the importer names a context its
 * module does not declare; a typo in a declaration is an error, not an answer.
 */
export function explainImport(
  tree: ModuleTree,
  importer: Importer,
  ownerModule: ModuleId,
  symbol: SymbolName,
): ImportDecision {
  const { module: consumerModule, context, binding } = resolveImporter(importer);

  // Resolved before anything is decided: an unknown module or an undeclared
  // context name must fail loudly whatever the answer would have been.
  const moduleTags = moduleTagsOf(tree, consumerModule, context);

  const ceiling = explainAvailability(tree, consumerModule, ownerModule, symbol);
  if (!ceiling.allowed || consumerModule === ownerModule) {
    return ceiling;
  }

  const tags = symbolTagsOf(tree, ownerModule, symbol);
  const unmet = firstUnmetRequirement(tags, moduleTags, binding);
  if (unmet !== undefined) {
    return {
      allowed: false,
      reason: unmet.reason,
      unmet: { tag: unmet.tag, requires: unmet.requires },
    };
  }

  return tags.length === 0 ? ceiling : { ...ceiling, tags };
}

/** An importer in full, filling in the defaults a bare module id leaves out. */
function resolveImporter(importer: Importer): ResolvedImporter {
  if (typeof importer === 'string') {
    return { module: importer, context: undefined, binding: 'value' };
  }
  return {
    module: importer.module,
    context: importer.context,
    binding: importer.binding ?? 'value',
  };
}

/**
 * The first cross-requirement of the import that is unmet, or `undefined` when
 * every tag involved is satisfied.
 *
 * Both directions are checked, in the order the specification introduces them:
 * what each tag of the exposed symbol requires of the importing context, then
 * what each tag of the context requires of the symbol. A requirement scoped to
 * value imports is simply not in force for a type-only import, which is erased
 * before any runtime exists.
 */
function firstUnmetRequirement(
  tags: readonly SymbolTag[],
  moduleTags: readonly ModuleTag[],
  binding: ImportBinding,
): UnmetRequirementFinding | undefined {
  for (const tag of tags) {
    const definition = SYMBOL_TAGS[tag];
    if (!appliesToBinding(definition.appliesTo, binding)) {
      continue;
    }
    for (const required of definition.requires) {
      if (!moduleTags.includes(required)) {
        return { reason: 'symbol-tag-requires-module-tag', tag, requires: required };
      }
    }
  }

  for (const contextTag of moduleTags) {
    const definition = MODULE_TAGS[contextTag];
    if (!appliesToBinding(definition.appliesTo, binding)) {
      continue;
    }
    for (const required of definition.requires) {
      if (!tags.includes(required)) {
        return { reason: 'module-tag-requires-symbol-tag', tag: contextTag, requires: required };
      }
    }
  }

  return undefined;
}

/**
 * Whether `moduleId` owns `ref`, or received it from a direct child that
 * exposed it upward.
 *
 * A module may expose any symbol available in it, so this is narrower than
 * availability — it omits symbols an ancestor granted. Nothing is lost by the
 * omission: re-exposing a symbol received from an ancestor is always
 * redundant. Its own subtree already lies inside the granting ancestor's
 * subtree, every module on the path upward to that ancestor does too, and
 * reaching any higher needs the granter's own expose-to-parent decision, which
 * no module below it can make on its behalf.
 */
function ownedOrReceived(tree: ModuleTree, moduleId: ModuleId, ref: SymbolRef): boolean {
  if (ref.owner === moduleId) {
    return ownedSymbol(tree, moduleId, ref.name) !== undefined;
  }
  return providingChildren(tree, moduleId, ref).length > 0;
}

/**
 * The direct children of `moduleId` that exposed `ref` to their parent — the
 * children from which `moduleId` received the symbol.
 */
function providingChildren(tree: ModuleTree, moduleId: ModuleId, ref: SymbolRef): ModuleId[] {
  return requireModule(tree, moduleId).children.filter(
    (child) => ownedOrReceived(tree, child, ref) && exposes(tree, child, ref, 'exposeToParent'),
  );
}

/**
 * Whether `moduleId` exposes `ref` through the given channel — as the symbol's
 * owner, or by exposing a symbol a child passed up to it.
 *
 * An exposure of a symbol the module never received is inert rather than
 * illegal: it changes no module's availability, which is exactly what the
 * redundancy argument above predicts. (An exposure declaration matches by
 * symbol name and providing child; in the rare case where one child passes up
 * two same-named symbols owned by different modules, one declaration exposes
 * both.)
 */
function exposes(
  tree: ModuleTree,
  moduleId: ModuleId,
  ref: SymbolRef,
  channel: Channel,
): boolean {
  if (ref.owner === moduleId) {
    const owned = ownedSymbol(tree, moduleId, ref.name);
    return owned !== undefined && owned[channel] === true;
  }

  const providers = providingChildren(tree, moduleId, ref);
  if (providers.length === 0) {
    return false;
  }
  return requireModule(tree, moduleId).reExposes.some(
    (reExposure) =>
      reExposure.symbol === ref.name &&
      reExposure[channel] === true &&
      providers.includes(reExposure.from),
  );
}
