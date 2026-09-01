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
 * It also carries the declared classifications the contextual rules read: the
 * **exposure tags** an owned symbol's exposure may wear, and the **importer
 * contexts** a module declares over its files. Their meaning is in `./tags.js`;
 * the rule they take part in is in `./availability.ts`.
 *
 * This module is pure and browser-compatible: no I/O, no Node built-ins, no
 * side effects. It contains no availability logic — that lives in
 * `./availability.ts`.
 */

import {
  SYMBOL_TAGS,
  defaultSymbolTag,
  type ModuleTag,
  type SymbolTag,
} from './tags.js';

/** Identifier of a declared module. Unique across the tree. */
export type ModuleId = string;

/** Name of a symbol, unique only within its owning module. */
export type SymbolName = string;

/** Name of an importer context, unique only within the module declaring it. */
export type ContextName = string;

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
  /**
   * The exposure tags this symbol's exposure carries. Omitted — or empty — is
   * the default contract channel.
   *
   * Tags are declared once, by the owner, and travel with the symbol through
   * every channel and every re-exposure: they restrict who may import the
   * symbol wherever the exposure chain takes it. That is why only this
   * declaration — never a {@link ReExposureDeclaration} — can carry them.
   *
   * More than one is meaningful: a browser-safe test fake is
   * `['testing', 'browser']`, and satisfies a browser test context on both
   * counts. Exclusivity constrains the combination with the *default contract
   * channel*, not with another tag.
   *
   * An owner that declares nothing here may still expose tagged symbols: a
   * module classified as a test context tags everything it exposes implicitly.
   * See {@link symbolTagsOf}, which answers the question for both cases.
   */
  readonly tags?: readonly SymbolTag[];
}

/**
 * A named importer context: a subtree of the declaring module's own files,
 * classified by context tags.
 *
 * A context classifies importing code only. It owns no symbols — ownership is
 * per module — so a context never changes what its module exposes; it changes
 * what the files inside it may import.
 *
 * A context with no tags is representable and inert: it classifies its files as
 * nothing in particular, which is what they already were.
 */
export interface ImporterContextDeclaration {
  readonly name: ContextName;
  readonly tags: readonly ModuleTag[];
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
  /**
   * Context tags classifying this module's files — and, because a module is
   * declared about its whole subtree, its submodules' files too.
   *
   * This is how a whole module is classified: `moduleTags: ['browser']` states
   * that its code runs in a browser, and `moduleTags: ['testing']` declares a
   * **test module**, whose files are a test context and whose exposures are all
   * implicitly `testing`.
   *
   * The classification reaches the subtree so that subdivision stays invariant:
   * splitting a browser module into submodules must not quietly release them
   * from the platform requirement their parent declared. A submodule adds tags;
   * it can never drop an ancestor's.
   */
  readonly moduleTags?: readonly ModuleTag[];
  /**
   * Importer contexts declared over subtrees of this module's own files — a
   * co-located test tree, a feature-test tree — each with its own tags on top
   * of {@link moduleTags}.
   */
  readonly contexts?: readonly ImporterContextDeclaration[];
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
  /**
   * As declared, omitted when the module declares no classification. Read them
   * through {@link moduleTagsOf}, which adds the tags this module inherits
   * from its ancestors.
   */
  readonly moduleTags?: readonly ModuleTag[];
  /** As declared, omitted when the module declares no importer context. */
  readonly contexts?: readonly ImporterContextDeclaration[];
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
 * duplicate symbol names inside one module, duplicate re-exposures,
 * re-exposures whose `from` is not a direct child of the declaring module,
 * duplicate importer context names, and exposure tags that break an exclusive
 * tag's hold on the module's exposures.
 *
 * Declarations that are merely *inert* do not throw: exposing to a parent at
 * the root (the root has no parent), re-exposing a symbol the module does not
 * hold, or declaring an importer context with no tags. They are representable
 * and simply grant nothing.
 */
export function buildTree(root: ModuleDeclaration): ModuleTree {
  const modules = new Map<ModuleId, ModuleRecord>();

  const visit = (
    declaration: ModuleDeclaration,
    parent: ModuleId | null,
    inheritedModuleTags: readonly ModuleTag[],
  ): void => {
    const { id } = declaration;
    if (id.length === 0) {
      throw new Error('Module declaration is missing an id.');
    }
    if (modules.has(id)) {
      throw new Error(`Duplicate module id "${id}".`);
    }

    const moduleTags = [...inheritedModuleTags, ...(declaration.moduleTags ?? [])];
    const implicitTag = defaultSymbolTag(moduleTags);

    const owns = declaration.owns ?? [];
    const seenSymbols = new Set<SymbolName>();
    for (const owned of owns) {
      if (seenSymbols.has(owned.symbol)) {
        throw new Error(`Module "${id}" declares the symbol "${owned.symbol}" twice.`);
      }
      seenSymbols.add(owned.symbol);
      if (
        implicitTag !== undefined &&
        SYMBOL_TAGS[implicitTag].exclusive &&
        owned.tags !== undefined &&
        !owned.tags.includes(implicitTag)
      ) {
        // The module's classification tags everything it exposes, and that tag
        // is exclusive with the default contract channel. Declaring tags puts
        // the symbol back in that channel unless the implied tag is among them
        // — which is exactly what exclusivity forbids. Adding tags is fine;
        // dropping this one is not.
        throw new Error(
          `Module "${id}" is classified as a context whose exposures are implicitly ` +
            `"${implicitTag}", which is exclusive; its symbol "${owned.symbol}" ` +
            `may not drop that tag by declaring [${owned.tags.join(', ')}].`,
        );
      }
    }

    const contexts = declaration.contexts ?? [];
    const seenContexts = new Set<ContextName>();
    for (const context of contexts) {
      if (context.name.length === 0) {
        throw new Error(`Module "${id}" declares an importer context without a name.`);
      }
      if (seenContexts.has(context.name)) {
        throw new Error(`Module "${id}" declares the importer context "${context.name}" twice.`);
      }
      seenContexts.add(context.name);
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

    modules.set(id, {
      id,
      parent,
      children: childIds,
      owns,
      reExposes,
      moduleTags: declaration.moduleTags,
      contexts: declaration.contexts,
    });

    for (const child of children) {
      visit(child, id, moduleTags);
    }
  };

  visit(root, null, []);
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
 * The context tags classifying the files of one importer context: those an
 * importer context named by `context` declares, plus those the module and every
 * one of its ancestors declare about their subtrees.
 *
 * Omit `context` for the module's own files — the context every file belonging
 * to the module is in unless a declared context covers it.
 *
 * Tags accumulate from the file outward and are never dropped: a module may add
 * a classification to its subtree, never release one. Duplicates are collapsed,
 * so the result names each tag once, most specific first.
 *
 * Throws if the module declares no context by that name; a typo in a
 * declaration is an error, not an answer.
 */
export function moduleTagsOf(
  tree: ModuleTree,
  moduleId: ModuleId,
  context?: ContextName,
): readonly ModuleTag[] {
  const tags: ModuleTag[] = [];
  const add = (tag: ModuleTag): void => {
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  };

  if (context !== undefined) {
    for (const tag of requireImporterContext(tree, moduleId, context).tags) {
      add(tag);
    }
  }
  for (const id of [moduleId, ...ancestorsOf(tree, moduleId)]) {
    for (const tag of requireModule(tree, id).moduleTags ?? []) {
      add(tag);
    }
  }
  return tags;
}

/** The importer context `name` declared by `moduleId`, failing loudly if it declares none. */
export function requireImporterContext(
  tree: ModuleTree,
  moduleId: ModuleId,
  name: ContextName,
): ImporterContextDeclaration {
  const declared = (requireModule(tree, moduleId).contexts ?? []).find(
    (context) => context.name === name,
  );
  if (declared === undefined) {
    throw new Error(`Module "${moduleId}" declares no importer context "${name}".`);
  }
  return declared;
}

/**
 * The exposure tags `symbol` carries. Empty for the default contract channel,
 * and for a symbol `owner` does not own.
 *
 * The owner's own declaration wins; with none, the tags come from the owner's
 * classification, because symbols exposed from a context default to that
 * context's exposure tag. This is the whole of "everything a declared test
 * module exposes is implicitly `testing`" — and it holds for every symbol
 * such a module can expose, since a module can only pass on symbols owned
 * inside its own subtree, which its classification reaches too.
 *
 * The question is asked of the **owner**, never of a module that routes the
 * symbol onward: a re-exposure carries no tags and so can neither add, strip
 * nor change any. Re-tagging a real contract as test support is exactly what
 * exclusivity forbids, and no declaration can spell it.
 */
export function symbolTagsOf(
  tree: ModuleTree,
  owner: ModuleId,
  symbol: SymbolName,
): readonly SymbolTag[] {
  const owned = ownedSymbol(tree, owner, symbol);
  if (owned === undefined) {
    return [];
  }
  if (owned.tags !== undefined) {
    return owned.tags;
  }
  const implicitTag = defaultSymbolTag(moduleTagsOf(tree, owner));
  return implicitTag === undefined ? [] : [implicitTag];
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
