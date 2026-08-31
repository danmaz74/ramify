/**
 * The declared ownership tree.
 *
 * Implements the structural half of the model specified in
 * `docs/model/cross-module-importability-rules.md`, in the vocabulary of
 * `docs/model/glossary.md`:
 *
 * - "A module exists only by declaration. Declared modules form a tree with one
 *   explicit application root; every other module has exactly one parent."
 * - A file belonging to a module exports symbols; the module therefore **owns**
 *   them, and they are available in it.
 * - A module makes a symbol available beyond itself through exactly two
 *   channels: **expose to parent** and **expose to descendants**. Both channels
 *   apply equally to symbols the module owns and to symbols exposed to it.
 *
 * This module is pure and browser-compatible: no I/O, no Node built-ins, no
 * side effects. It contains no availability logic — that lives in
 * `./availability.ts`.
 */

/** Identifier of a declared module. Unique across the tree. */
export type ModuleId = string;

/** Name of a symbol, unique only within its owning module. */
export type SymbolName = string;

/**
 * Identity of a symbol. Symbol names are not globally unique, so a symbol is
 * always identified by the pair (owning module, name).
 */
export interface SymbolRef {
  readonly owner: ModuleId;
  readonly name: SymbolName;
}

/**
 * The two exposure channels. Both default to `false` — the model is closed by
 * default, so a symbol travels only where a decision sent it.
 */
export interface ExposureDeclaration {
  /** The direct parent may import the symbol, and may re-expose it further. */
  readonly exposeToParent?: boolean;
  /** Every module in this module's subtree may import the symbol. */
  readonly exposeToDescendants?: boolean;
}

/**
 * A symbol owned by the declaring module, with the owner's exposure decision.
 *
 * Ownership needs no separate "exported" flag: a module owns a symbol because
 * a file belonging to it exports that symbol. An owned symbol with neither
 * channel set is simply available nowhere else — its owner uses it, and no
 * other module can ever reach it. There is no implicit public surface.
 */
export interface OwnedSymbolDeclaration extends ExposureDeclaration {
  readonly symbol: SymbolName;
}

/**
 * A module exposing a symbol that was exposed to it by a direct child.
 *
 * "Re-expose" is informal shorthand, not a separate mechanism: exposing a
 * symbol received from a child uses the same two channels as exposing an owned
 * one.
 *
 * `from` names the direct child that exposed the symbol upward. Naming the
 * child (rather than the possibly distant owner) keeps every decision local:
 * no declaration ever names a module outside the decider's immediate family.
 *
 * An exposure of a symbol the module never received is inert.
 */
export interface ReExposureDeclaration extends ExposureDeclaration {
  readonly symbol: SymbolName;
  readonly from: ModuleId;
}

/**
 * A module and its subtree, written as a nested literal. The declaration passed
 * to {@link buildTree} is the application root.
 */
export interface ModuleDeclaration {
  readonly id: ModuleId;
  /** Symbols this module owns. Omit for a module that owns nothing. */
  readonly owns?: readonly OwnedSymbolDeclaration[];
  /** Symbols received from a direct child that this module passes on. */
  readonly reExposes?: readonly ReExposureDeclaration[];
  readonly children?: readonly ModuleDeclaration[];
}

/** One module of an indexed tree, with its structural position resolved. */
export interface ModuleRecord {
  readonly id: ModuleId;
  /** `null` for the application root only. */
  readonly parent: ModuleId | null;
  readonly children: readonly ModuleId[];
  readonly owns: readonly OwnedSymbolDeclaration[];
  readonly reExposes: readonly ReExposureDeclaration[];
}

/** A validated, indexed ownership tree. Build one with {@link buildTree}. */
export interface ModuleTree {
  readonly root: ModuleId;
  readonly modules: ReadonlyMap<ModuleId, ModuleRecord>;
}

/**
 * Validate a declaration and index it for evaluation.
 *
 * Throws on declarations that cannot mean anything: duplicate module ids,
 * duplicate symbol names inside one module, duplicate re-exposures, and
 * re-exposures whose `from` is not a direct child of the declaring module.
 *
 * Declarations that are merely *inert* do not throw: exposing to a parent at
 * the root (the root has no parent), or re-exposing a symbol the module does
 * not hold. They are representable and simply grant nothing.
 */
export function buildTree(root: ModuleDeclaration): ModuleTree {
  const modules = new Map<ModuleId, ModuleRecord>();

  const visit = (declaration: ModuleDeclaration, parent: ModuleId | null): void => {
    const { id } = declaration;
    if (id.length === 0) {
      throw new Error('Module declaration is missing an id.');
    }
    if (modules.has(id)) {
      throw new Error(`Duplicate module id "${id}".`);
    }

    const owns = declaration.owns ?? [];
    const seenSymbols = new Set<SymbolName>();
    for (const owned of owns) {
      if (seenSymbols.has(owned.symbol)) {
        throw new Error(`Module "${id}" declares the symbol "${owned.symbol}" twice.`);
      }
      seenSymbols.add(owned.symbol);
    }

    const children = declaration.children ?? [];
    const childIds = children.map((child) => child.id);
    const reExposes = declaration.reExposes ?? [];
    const seenReExposures = new Set<string>();
    for (const reExposure of reExposes) {
      if (!childIds.includes(reExposure.from)) {
        throw new Error(
          `Module "${id}" re-exposes "${reExposure.symbol}" from "${reExposure.from}", ` +
            'which is not one of its direct children.',
        );
      }
      const key = `${reExposure.from}::${reExposure.symbol}`;
      if (seenReExposures.has(key)) {
        throw new Error(
          `Module "${id}" declares the re-exposure of "${reExposure.symbol}" ` +
            `from "${reExposure.from}" twice.`,
        );
      }
      seenReExposures.add(key);
    }

    modules.set(id, { id, parent, children: childIds, owns, reExposes });

    for (const child of children) {
      visit(child, id);
    }
  };

  visit(root, null);
  return { root: root.id, modules };
}

/** Look up a module, failing loudly on an unknown id (a declaration typo). */
export function requireModule(tree: ModuleTree, id: ModuleId): ModuleRecord {
  const record = tree.modules.get(id);
  if (record === undefined) {
    throw new Error(`Unknown module "${id}".`);
  }
  return record;
}

/** The owned-symbol declaration for `name` at `owner`, if that module owns it. */
export function ownedSymbol(
  tree: ModuleTree,
  owner: ModuleId,
  name: SymbolName,
): OwnedSymbolDeclaration | undefined {
  return requireModule(tree, owner).owns.find((owned) => owned.symbol === name);
}

/**
 * The proper ancestors of a module, nearest first. The root has none, and a
 * module is never its own ancestor.
 */
export function ancestorsOf(tree: ModuleTree, id: ModuleId): ModuleId[] {
  const ancestors: ModuleId[] = [];
  let current = requireModule(tree, id).parent;
  while (current !== null) {
    ancestors.push(current);
    current = requireModule(tree, current).parent;
  }
  return ancestors;
}

/**
 * Every symbol declared anywhere in the tree, in declaration order (pre-order
 * by module). Includes symbols their owner exposes nowhere: they are declared,
 * they are simply available in no module but their owner.
 */
export function allSymbols(tree: ModuleTree): SymbolRef[] {
  const symbols: SymbolRef[] = [];
  const visit = (id: ModuleId): void => {
    const record = requireModule(tree, id);
    for (const owned of record.owns) {
      symbols.push({ owner: id, name: owned.symbol });
    }
    for (const child of record.children) {
      visit(child);
    }
  };
  visit(tree.root);
  return symbols;
}
