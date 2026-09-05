/**
 * Visibility follows ownership and exposure. Availability adds the importing
 * module's tag restrictions for value imports; type imports retain coupling
 * restrictions only. All files belonging to a module have the same verdict.
 * See docs/model/cross-module-importability.principles.md and its glossary.
 */

import {
  MODULE_TAGS,
  SYMBOL_TAGS,
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
  type ExposureDeclaration,
  type ModuleId,
  type ModuleTree,
  type SymbolName,
  type SymbolRef,
} from './tree.js';

/** Why a symbol is available - which sentence of the rule answered. */
export type ImportClause =
  /** The module owns the symbol; no boundary is crossed. */
  | 'same-module'
  /** A direct child of the module exposed the symbol to its parent. */
  | 'child-exposure'
  /** A proper ancestor exposed the symbol to its descendants. */
  | 'ancestor-exposure';

/**
 * Why an import is not allowed.
 *
 * The first three reasons are the tree's: the symbol never became visible in
 * the importing module. The last two are the tags': the symbol is visible,
 * and a cross-requirement of the import is unmet. Which side stated the
 * requirement is the whole difference between them, and `requires` has a
 * direction - so the two reasons name it.
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
   * A symbol tag requires a tag the importing module does not carry.
   */
  | 'symbol-tag-requires-module-tag'
  /**
   * A module tag requires a symbol tag that is absent, for a value import.
   */
  | 'module-tag-requires-symbol-tag';

/** The cross-requirement that was not met, in the direction that states it. */
export interface UnmetTagRequirement {
  /** The tag stating the requirement: on the exposed symbol, or on the module. */
  readonly tag: SymbolTag | ModuleTag;
  /** The tag it requires on the other side of the import. */
  readonly requires: SymbolTag | ModuleTag;
}

export interface ImportAllowed {
  readonly allowed: true;
  readonly clause: ImportClause;
  /**
   * The module whose decision made the symbol available: the direct child that
   * exposed to its parent, or the proper ancestor that exposed to its
   * descendants. `null` for a module's own symbols, where nobody had to decide
   * anything.
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

/** The owning module of an importing file and its import form (value by default). */
export interface ImporterDescriptor {
  readonly module: ModuleId;
  readonly binding?: ImportBinding;
}

/** A bare module id denotes a value import from any file belonging to it. */
export type Importer = ModuleId | ImporterDescriptor;

type Channel = keyof ExposureDeclaration;

interface ResolvedImporter {
  readonly module: ModuleId;
  readonly binding: ImportBinding;
}

/** An unmet cross-requirement together with the reason code that names it. */
interface UnmetRequirementFinding extends UnmetTagRequirement {
  readonly reason: DenialReason;
}

/** Is the symbol owned here or received through exposure, regardless of tags? */
export function isVisible(
  tree: ModuleTree,
  moduleId: ModuleId,
  ownerModule: ModuleId,
  symbol: SymbolName,
): boolean {
  return explainVisibility(tree, moduleId, ownerModule, symbol).allowed;
}

/**
 * {@link isVisible} with its reasoning: which clause of the visibility rule
 * put the symbol within the module's reach and whose decision that was, or the
 * reason nothing did.
 *
 * The clauses are tried in the rule's own order, so a symbol several of them
 * would allow is attributed to the earliest - ownership first, even when an
 * ancestor's exposure to its descendants also reaches the module.
 *
 * Throws if either module id is unknown; a typo in a declaration is an error,
 * not an answer.
 */
export function explainVisibility(
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
      return { allowed: true, clause: 'ancestor-exposure', via: ancestor };
    }
  }

  return { allowed: false, reason: 'no-exposure-chain' };
}

/** May any file belonging to this module import the symbol as a value? */
export function isAvailable(
  tree: ModuleTree,
  moduleId: ModuleId,
  ownerModule: ModuleId,
  symbol: SymbolName,
): boolean {
  return explainAvailability(tree, moduleId, ownerModule, symbol).allowed;
}

/** Value availability with the exposure or tag decision that explains it. */
export function explainAvailability(
  tree: ModuleTree,
  moduleId: ModuleId,
  ownerModule: ModuleId,
  symbol: SymbolName,
): ImportDecision {
  return explainImport(tree, moduleId, ownerModule, symbol);
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
 * which module's decision made it so, or the reason the import is not allowed -
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
 * Throws if either module id is unknown.
 */
export function explainImport(
  tree: ModuleTree,
  importer: Importer,
  ownerModule: ModuleId,
  symbol: SymbolName,
): ImportDecision {
  const { module: consumerModule, binding } = resolveImporter(importer);

  // Resolve the importing module before deciding the import.
  const moduleTags = moduleTagsOf(tree, consumerModule);

  const ceiling = explainVisibility(tree, consumerModule, ownerModule, symbol);
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
    return { module: importer, binding: 'value' };
  }
  return {
    module: importer.module,
    binding: importer.binding ?? 'value',
  };
}

/**
 * The first cross-requirement of the import that is unmet, or `undefined` when
 * every tag involved is satisfied.
 *
 * Both directions are checked, in the order the specification introduces them:
 * what each tag of the exposed symbol requires of the importing module, then
 * what each tag of the module requires of the symbol. The scope of each check
 * is intrinsic to the rule kind: a required-module-tag rule polices coupling
 * and is in force for both import forms, while a required-symbol-tag rule
 * polices the module's runtime and is not in force for a type-only import,
 * which is erased before any runtime exists.
 */
function firstUnmetRequirement(
  tags: readonly SymbolTag[],
  moduleTags: readonly ModuleTag[],
  binding: ImportBinding,
): UnmetRequirementFinding | undefined {
  for (const tag of tags) {
    const definition = SYMBOL_TAGS[tag];
    for (const required of definition.requires) {
      if (!moduleTags.includes(required)) {
        return { reason: 'symbol-tag-requires-module-tag', tag, requires: required };
      }
    }
  }

  // A required-symbol-tag rule never reaches a type-only import.
  if (binding === 'value') {
    for (const moduleTag of moduleTags) {
      const definition = MODULE_TAGS[moduleTag];
      for (const required of definition.requires) {
        if (!tags.includes(required)) {
          return { reason: 'module-tag-requires-symbol-tag', tag: moduleTag, requires: required };
        }
      }
    }
  }

  return undefined;
}

/**
 * Whether `moduleId` owns `ref`, or received it from a direct child that
 * exposed it to its parent.
 *
 * A module may expose any symbol visible in it, so this is narrower than
 * visibility - it omits symbols an ancestor exposed to its descendants.
 * Nothing is lost by the omission: re-exposing a symbol received from an
 * ancestor is always redundant. Its own subtree already lies inside that
 * ancestor's subtree, every module on the path up to that ancestor does too,
 * and reaching any higher needs that ancestor's own expose-to-parent decision,
 * which no module below it can make on its behalf.
 */
function ownedOrReceived(tree: ModuleTree, moduleId: ModuleId, ref: SymbolRef): boolean {
  if (ref.owner === moduleId) {
    return ownedSymbol(tree, moduleId, ref.name) !== undefined;
  }
  return providingChildren(tree, moduleId, ref).length > 0;
}

/**
 * The direct children of `moduleId` that exposed `ref` to their parent - the
 * children from which `moduleId` received the symbol.
 */
function providingChildren(tree: ModuleTree, moduleId: ModuleId, ref: SymbolRef): ModuleId[] {
  return requireModule(tree, moduleId).children.filter(
    (child) => ownedOrReceived(tree, child, ref) && exposes(tree, child, ref, 'exposeToParent'),
  );
}

/**
 * Whether `moduleId` exposes `ref` through the given channel - as the symbol's
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
