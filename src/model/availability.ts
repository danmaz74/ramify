/**
 * Availability, and the file-level importability rule built on it.
 *
 * Implements exactly the rule specified in
 * `docs/model/cross-module-importability-rules.md`, in the vocabulary of
 * `docs/model/glossary.md`, and nothing more — no importer contexts, no
 * exposure tags, no file-level distinctions.
 *
 * > A file may import a symbol iff that symbol is **available** in the file's
 * > module.
 * >
 * > A symbol is available in a module if the module owns it, or if some other
 * > module exposed it there: a direct child exposing to its parent, or a
 * > proper ancestor exposing to its descendants.
 *
 * Those two sentences are the whole model. {@link isAvailable} asks the
 * module-level question and {@link mayImport} the file-level one; they are the
 * same predicate, because the first sentence says so.
 *
 * This module is pure and browser-compatible: no I/O, no Node built-ins, no
 * side effects.
 */

import {
  ancestorsOf,
  ownedSymbol,
  requireModule,
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

/** Why a symbol is not available. */
export type DenialReason =
  /** The named owner declares no symbol by that name. */
  | 'symbol-not-owned'
  /**
   * The owner exposes the symbol through neither channel, so it never leaves
   * the module that owns it. There is no implicit public surface.
   */
  | 'never-exposed'
  /** Exposed by its owner, but no chain of exposures reaches this module. */
  | 'no-exposure-chain';

export interface ImportAllowed {
  readonly allowed: true;
  readonly clause: ImportClause;
  /**
   * The module whose decision made the symbol available: the direct child that
   * exposed to its parent, or the granting ancestor. `null` for a module's own
   * symbols, where nobody had to decide anything.
   */
  readonly via: ModuleId | null;
}

export interface ImportDenied {
  readonly allowed: false;
  readonly reason: DenialReason;
}

export type ImportDecision = ImportAllowed | ImportDenied;

type Channel = keyof ExposureDeclaration;

/**
 * Is `symbol`, owned by `ownerModule`, available in `moduleId`?
 *
 * The module-level twin of {@link mayImport}: available in a module means
 * every file belonging to that module may import it, so the two questions have
 * one answer.
 */
export function isAvailable(
  tree: ModuleTree,
  moduleId: ModuleId,
  ownerModule: ModuleId,
  symbol: SymbolName,
): boolean {
  return explainImport(tree, moduleId, ownerModule, symbol).allowed;
}

/**
 * May a file belonging to `consumerModule` import `symbol`, owned by
 * `ownerModule`?
 *
 * The model's one question. See {@link explainImport} for which part of the
 * rule answered it, and whose decision that was.
 */
export function mayImport(
  tree: ModuleTree,
  consumerModule: ModuleId,
  ownerModule: ModuleId,
  symbol: SymbolName,
): boolean {
  return explainImport(tree, consumerModule, ownerModule, symbol).allowed;
}

/**
 * {@link mayImport} with its reasoning: how the symbol became available and
 * which module's decision made it so, or the reason it is not.
 *
 * The cases are tried in the rule's own order, so a symbol several of them
 * would allow is attributed to the earliest — ownership first, even when an
 * ancestor grant also reaches the module.
 *
 * Throws if either module id is unknown; a typo in a declaration is an error,
 * not a denial.
 */
export function explainImport(
  tree: ModuleTree,
  consumerModule: ModuleId,
  ownerModule: ModuleId,
  symbol: SymbolName,
): ImportDecision {
  const consumer = requireModule(tree, consumerModule);
  requireModule(tree, ownerModule);

  const owned = ownedSymbol(tree, ownerModule, symbol);
  if (owned === undefined) {
    // The rule is stated about a symbol owned by a module. If that module owns
    // no such symbol there is nothing to import, for anybody.
    return { allowed: false, reason: 'symbol-not-owned' };
  }

  // A module's own symbols are available in it: a file belonging to the owner
  // imports them freely, and no boundary is crossed.
  if (consumerModule === ownerModule) {
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
  for (const ancestor of ancestorsOf(tree, consumerModule)) {
    if (ownedOrReceived(tree, ancestor, ref) && exposes(tree, ancestor, ref, 'exposeToDescendants')) {
      return { allowed: true, clause: 'ancestor-grant', via: ancestor };
    }
  }

  return { allowed: false, reason: 'no-exposure-chain' };
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
