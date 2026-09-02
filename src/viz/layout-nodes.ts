/**
 * Node content and tidy-tree positions.
 *
 * Two jobs, in this order:
 *
 * 1. **Content.** Every row of every node box is *derived* from the
 *    declaration through the evaluator - including the whole received
 *    compartment and its provenance, which is exactly what
 *    `explainAvailability(...).via` reports. Nothing about receiving is
 *    declared anywhere, and that is the point: `CartApi` is available in
 *    `checkout` as a consequence of `cart`'s decision, not of any decision
 *    `checkout` made. Which of the two arrival channels a diagram lists is the
 *    one editorial choice here (`nodeContent.includeAncestorExposures`).
 *
 *    Structure asks the *visibility* question, never the availability one:
 *    a box lists what the exposure chain put within the module's reach, and a
 *    tag restricts who may take it rather than where it arrives. The tags then
 *    enter as content of their own - the chip a tagged symbol wears on every
 *    row, the strike on a visible-not-available arrival, and
 *    the declared importer contexts drawn inside the node that declares them.
 * 2. **Position.** `d3-hierarchy`'s tidy tree, with a separation function that
 *    already knows each box's width, followed by a relaxation pass that
 *    guarantees the §3.9 clearance at every level (d3 compares sub-tree
 *    contours only where both subtrees reach the same depth, which is one
 *    level too few once a shallow leaf like `shipping` sits beside a deep
 *    branch).
 *
 * Pure and framework-free: `d3-hierarchy` is used as a math library, no DOM.
 */

import { hierarchy, tree as d3Tree, type HierarchyNode } from 'd3-hierarchy';

import type { ColorKey, DiagramContext, TracedSymbol } from './diagram-definition.js';
import { LAYOUT, headerBandHeight, rowLabelDx, wrapText, type Box } from './geometry.js';
import {
  moduleTagsOf,
  explainAvailability,
  symbolTagsOf,
  mayImport,
  requireModuleRecord,
  type ContextName,
  type Tag,
  type ModuleTag,
  type SymbolTag,
  type ModuleDeclaration,
  type ModuleId,
  type ModuleTree,
  type SymbolName,
} from './model-access.js';

/** The exposure markers of §3.2. */
export type ExposureMarker = '▲' | '▼' | '▲▼' | '·';

/**
 * Why a symbol appears in a node box.
 *
 * - `owns` - a file belonging to the module exports it.
 * - `fromChild` - received: a direct child exposed it to its parent.
 * - `fromAncestor` - received: a proper ancestor exposed it to its descendants.
 *
 * The three are exactly the clauses of the rule, so a row's kind is checkable
 * against `explainImport(...).clause` and `./validate.ts` checks it.
 */
export type RowKind = 'owns' | 'fromChild' | 'fromAncestor';

/**
 * A muted label a row carries after its symbol name.
 *
 * - `tags` - the tags the symbol's owner declared, each behind the glyph of
 *   its rule (`⇥ testing`). The chip travels with the symbol, so it is
 *   drawn on the owner's row and on every arrival alike.
 */
export interface RowAnnotation {
  readonly kind: 'tags';
  readonly text: string;
  /** x of the annotation's start, relative to the node box's left edge. */
  readonly dx: number;
}

/**
 * A declared importer context, drawn inside the module that declares it: a
 * named context over some of its files, or the whole module classified at once.
 *
 * A context classifies importing code, so what it says about a diagram is which
 * of the traced symbols its files may actually import - {@link imports}, the
 * set that lights up when one of them is selected.
 */
export interface DrawnContext {
  readonly module: ModuleId;
  /** The declared context's name; absent when the whole module is the context. */
  readonly name?: ContextName;
  /** As drawn: `integration-tests` for a named context, `browser` for a module. */
  readonly label: string;
  /** The context tags in force for these files, most specific first. */
  readonly tags: readonly ModuleTag[];
  /** The line under the label: `testing module`. */
  readonly caption: string;
  /**
   * The traced symbols these files may value-import, owned elsewhere - the
   * arrivals a selection lights up here. Derived through `mayImport` with this
   * context as the importer, so a tag that refuses the import keeps the box
   * dark.
   */
  readonly imports: readonly SymbolName[];
}

/** One symbol line inside a node box. */
export interface SymbolRow {
  readonly id: string;
  readonly kind: RowKind;
  /** Slug of the compartment the row is drawn in - the element-id stem. */
  readonly compartment: string;
  readonly symbol: SymbolName;
  /** The module that owns the symbol - for an arrival row, never this node. */
  readonly owner: ModuleId;
  /**
   * Absent on `fromAncestor` rows: a module can only re-expose what it owns or
   * what a direct child exposed to it, so a symbol received from an ancestor
   * carries no onward decision for this module to make.
   */
  readonly marker?: ExposureMarker;
  /** Gray: the symbol stops here. Nothing gray ever has an arrow attached. */
  readonly gray: boolean;
  /** The module named by the provenance: the providing child, or the exposing ancestor. */
  readonly from?: ModuleId;
  /** The provenance text as drawn (`from cart`). */
  readonly provenance?: string;
  readonly layer: string;
  readonly color: ColorKey;
  /** y of the row's centre, relative to the node box's top. */
  readonly y: number;
  /** The exposure tags the symbol carries. Omitted for the default channel. */
  readonly tags?: readonly SymbolTag[];
  /** Muted labels after the name: the tag chip. */
  readonly annotations?: readonly RowAnnotation[];
  /**
   * Whether a file of this module's own context may *value-import* the symbol.
   *
   * Availability put the row here; this says whether the tags let this module
   * take it. False rows are drawn exactly like the others - absence is not the
   * statement here, the chip is - but they never blink when the symbol is
   * selected, which is what "production compartments stay dark" means.
   */
  readonly importable: boolean;
  /**
   * Visible here, not available: this module's files may not import the
   * symbol, so the name is drawn struck through. The strike tells the
   * availability (value-import) story.
   */
  readonly struck: boolean;
  /**
   * The evaluator's type-import verdict. On a struck row that is still
   * type-available, the name is followed by an unstruck `∗` - the one mark
   * the type story leaves in the main diagrams; the footnote it points at is
   * the page's type-imports section. Available rows are always
   * type-available (the glossary's invariant), so the mark never appears on
   * an unstruck row.
   */
  readonly typeAvailable: boolean;
}

export type Compartment =
  | {
      readonly kind: 'owns' | 'received';
      readonly id: string;
      /** Element-id and `data-compartment` stem, slugified from the title. */
      readonly slug: string;
      readonly title: string;
      readonly rows: readonly SymbolRow[];
      /** Shown instead of rows when a module has nothing at all to list. */
      readonly placeholder?: string;
      readonly y: number;
      readonly height: number;
    }
  | {
      readonly kind: 'what-if';
      readonly id: string;
      readonly slug: string;
      readonly title: string;
      readonly lines: readonly string[];
      readonly y: number;
      readonly height: number;
    }
  | {
      /** A named importer context: a dashed sub-box over part of the module. */
      readonly kind: 'context';
      readonly id: string;
      readonly slug: string;
      readonly title: string;
      readonly context: DrawnContext;
      readonly y: number;
      readonly height: number;
    };

export interface NodeLayout {
  readonly id: ModuleId;
  readonly depth: number;
  readonly isRoot: boolean;
  /** `app root` on the root node only. */
  readonly badge?: string;
  readonly box: Box;
  readonly compartments: readonly Compartment[];
  readonly rows: readonly SymbolRow[];
  /**
   * Set when the module itself is a declared importer context: the dashed
   * treatment then frames the whole node, because a context can be a subtree of
   * a module's files or an entire module.
   */
  readonly moduleContext?: DrawnContext;
}

export interface LevelGeometry {
  readonly depth: number;
  readonly top: number;
  readonly bottom: number;
  /**
   * y of the horizontal run shared by every edge from this level to the next,
   * or `null` for the deepest level.
   */
  readonly busY: number | null;
}

export interface TreeGeometry {
  readonly nodes: readonly NodeLayout[];
  readonly nodeById: ReadonlyMap<ModuleId, NodeLayout>;
  readonly levels: readonly LevelGeometry[];
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const PLACEHOLDER = '(nothing owned)';
const APP_ROOT_BADGE = 'app root';

interface NodeContent {
  readonly id: ModuleId;
  readonly depth: number;
  readonly isRoot: boolean;
  readonly badge?: string;
  readonly width: number;
  readonly height: number;
  readonly compartments: readonly Compartment[];
  readonly rows: readonly SymbolRow[];
  readonly moduleContext?: DrawnContext;
}

/**
 * The provenance a row states, in the words the box draws: the module the
 * symbol was received from, whether a direct child or a proper ancestor.
 */
export function provenanceText(from: ModuleId): string {
  return `from ${from}`;
}

/** Compartment titles double as element-id stems, so they are slugified. */
function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

/**
 * The symbols available in a module that it does not own, with the direct child
 * that exposed each to it - read straight off the evaluator's child-exposure
 * explanation. An availability question, so no tag is consulted: an arrival is
 * an arrival whether or not the importing files may take it.
 */
export function derivedChildExposures(
  tree: ModuleTree,
  moduleId: ModuleId,
  symbols: readonly { readonly owner: ModuleId; readonly name: SymbolName }[],
): { readonly owner: ModuleId; readonly name: SymbolName; readonly from: ModuleId }[] {
  return arrivals(tree, moduleId, symbols, 'child-exposure');
}

/**
 * The symbols a proper ancestor exposed to its descendants, as they arrive in
 * a module, with the exposing ancestor - the evaluator's `ancestor-exposure`
 * clause, and the second way a symbol becomes available somewhere its owner
 * never named.
 */
export function derivedDescendantExposures(
  tree: ModuleTree,
  moduleId: ModuleId,
  symbols: readonly { readonly owner: ModuleId; readonly name: SymbolName }[],
): { readonly owner: ModuleId; readonly name: SymbolName; readonly from: ModuleId }[] {
  return arrivals(tree, moduleId, symbols, 'ancestor-exposure');
}

function arrivals(
  tree: ModuleTree,
  moduleId: ModuleId,
  symbols: readonly { readonly owner: ModuleId; readonly name: SymbolName }[],
  clause: 'child-exposure' | 'ancestor-exposure',
): { owner: ModuleId; name: SymbolName; from: ModuleId }[] {
  const found: { owner: ModuleId; name: SymbolName; from: ModuleId }[] = [];
  for (const ref of symbols) {
    if (ref.owner === moduleId) {
      continue;
    }
    const decision = explainAvailability(tree, moduleId, ref.owner, ref.name);
    if (decision.allowed && decision.clause === clause && decision.via !== null) {
      found.push({ owner: ref.owner, name: ref.name, from: decision.via });
    }
  }
  return found;
}

/** Does `moduleId` expose a symbol available in it to its own descendants? */
export function reExposesToDescendants(
  tree: ModuleTree,
  moduleId: ModuleId,
  owner: ModuleId,
  symbol: SymbolName,
): boolean {
  return descendantsOf(tree, moduleId).some((descendant) => {
    const decision = explainAvailability(tree, descendant, owner, symbol);
    return decision.allowed && decision.clause === 'ancestor-exposure' && decision.via === moduleId;
  });
}

/** Does `moduleId` expose a symbol available in it to its parent? */
export function reExposesToParent(
  tree: ModuleTree,
  moduleId: ModuleId,
  owner: ModuleId,
  symbol: SymbolName,
): boolean {
  const parent = requireModuleRecord(tree, moduleId).parent;
  if (parent === null) {
    return false;
  }
  const decision = explainAvailability(tree, parent, owner, symbol);
  return decision.allowed && decision.clause === 'child-exposure' && decision.via === moduleId;
}

/** Every strict descendant of a module, pre-order. */
export function descendantsOf(tree: ModuleTree, moduleId: ModuleId): ModuleId[] {
  const out: ModuleId[] = [];
  const visit = (id: ModuleId): void => {
    for (const child of requireModuleRecord(tree, id).children) {
      out.push(child);
      visit(child);
    }
  };
  visit(moduleId);
  return out;
}

function markerFor(toParent: boolean, toDescendants: boolean): ExposureMarker {
  if (toParent && toDescendants) {
    return '▲▼';
  }
  if (toParent) {
    return '▲';
  }
  if (toDescendants) {
    return '▼';
  }
  return '·';
}

/**
 * A row's width in characters: marker column, symbol, any annotations, and the
 * provenance. Arrival names render italic, which stays within the shared
 * per-character estimate - only the slant differs, not the advance width.
 *
 * The annotations are measured in their own smaller font and converted into
 * this budget's character unit, rounded up: a row must be *wider* than its ink,
 * because the provenance is drawn against the box's right edge and a chip that
 * ran into it would be worse than no chip.
 */
function rowChars(row: {
  kind?: string;
  marker?: string;
  symbol: string;
  provenance?: string;
  annotations?: readonly RowAnnotation[];
  struck?: boolean;
  typeAvailable?: boolean;
}): number {
  const star = row.struck === true && row.typeAvailable === true ? 1 : 0;
  const annotations = (row.annotations ?? []).reduce(
    (total, annotation) =>
      total + LAYOUT.node.annotationGap + annotation.text.length * LAYOUT.node.annotationCharWidth,
    0,
  );
  // The budget models a name at `charWidth`, and annotations are placed from
  // the wider `nameCharWidth`; the difference is added back here so that a row
  // carrying annotations is measured exactly where they are drawn.
  const extra =
    annotations === 0
      ? 0
      : Math.ceil(
          (annotations +
            row.symbol.length * (LAYOUT.node.nameCharWidth - LAYOUT.node.charWidth)) /
            LAYOUT.node.charWidth,
        );
  const left = (row.marker ?? ' ').length + 1 + row.symbol.length + star + extra;
  return row.provenance === undefined ? left : left + 3 + row.provenance.length;
}

/** A row before layout has placed it. */
type DraftRow = Omit<SymbolRow, 'id' | 'compartment' | 'layer' | 'color' | 'y'>;

/**
 * The glyph of the availability rule each tag carries - a mirror-arrow pair
 * drawing the direction of the rule's demand:
 *
 * - `⇥` - required module tag: the demand travels out with the symbol and is
 *   checked where it lands - available only in modules carrying the same tag.
 *   Carried by `testing`.
 * - `⇤` - required symbol tag: the demand faces inward at the module's door
 *   and is checked on everything arriving - the module value-imports only
 *   symbols carrying the same tag. Carried by `browser`.
 *
 * (An earlier pair drew miniatures of the part that must match - `▢` the
 * module box, `▭` the symbol pill - but the two outlines were barely
 * distinguishable at chip size.)
 *
 * A tag is not just a name - it always carries its availability rule - so the
 * glyph accompanies the tag wherever the diagram mentions it.
 */
export const TAG_GLYPHS: Readonly<Record<Tag, string>> = {
  testing: '⇥',
  browser: '⇤',
};

/** A tag as the diagram always writes it: rule glyph, then name. */
export function tagWithGlyph(tag: Tag): string {
  return `${TAG_GLYPHS[tag]} ${tag}`;
}

/**
 * The chip a tagged symbol wears. Each tag is written with the glyph of the
 * rule it carries; the pill the chip sits on is the delimiter, so no bracket
 * notation is needed. Empty tags, no chip.
 */
export function tagChipText(tags: readonly SymbolTag[]): string | undefined {
  return tags.length === 0 ? undefined : tags.map(tagWithGlyph).join(' · ');
}

/** Place a row's annotations after its name (and any `*`), left to right. */
function placeAnnotations(
  marker: string | undefined,
  nameChars: number,
  texts: readonly { readonly kind: RowAnnotation['kind']; readonly text: string }[],
): RowAnnotation[] {
  let dx = rowLabelDx(marker) + nameChars * LAYOUT.node.nameCharWidth;
  return texts.map(({ kind, text }) => {
    dx += LAYOUT.node.annotationGap;
    const placed: RowAnnotation = { kind, text, dx };
    dx += text.length * LAYOUT.node.annotationCharWidth;
    return placed;
  });
}

/**
 * Everything the tags say about one drawn row: the chip its symbol carries and
 * whether this module's own files may take it.
 *
 * The diagrams tell the availability story - the value-import story. A symbol
 * that is only type-available draws exactly like one that is not available at
 * all: type-availability is a separate concern, explained in prose, never a
 * row affordance.
 */
function tagFacts(
  tree: ModuleTree,
  moduleId: ModuleId,
  row: { readonly marker?: string; readonly symbol: SymbolName; readonly owner: ModuleId },
): Pick<SymbolRow, 'tags' | 'annotations' | 'importable' | 'struck' | 'typeAvailable'> {
  const tags = symbolTagsOf(tree, row.owner, row.symbol);
  const importable = mayImport(tree, { module: moduleId, binding: 'value' }, row.owner, row.symbol);
  const typeAvailable = mayImport(
    tree,
    { module: moduleId, binding: 'type' },
    row.owner,
    row.symbol,
  );
  const starred = !importable && typeAvailable;

  const chip = tagChipText(tags);
  const annotations = placeAnnotations(row.marker, row.symbol.length + (starred ? 1 : 0), [
    ...(chip === undefined ? [] : [{ kind: 'tags' as const, text: chip }]),
  ]);

  return {
    ...(tags.length === 0 ? {} : { tags }),
    ...(annotations.length === 0 ? {} : { annotations }),
    importable,
    struck: !importable,
    typeAvailable,
  };
}

/**
 * The importer contexts drawn inside one module: each context it declares, and
 * - when its own files are classified - the module itself.
 *
 * The tags of a whole-module context are the *effective* ones, so a submodule of
 * a browser module states the classification it inherited rather than pretending
 * to be unclassified.
 */
function drawnContexts(
  tree: ModuleTree,
  moduleId: ModuleId,
  traced: readonly TracedSymbol[],
): { readonly named: DrawnContext[]; readonly module?: DrawnContext } {
  const importsOf = (context?: ContextName): SymbolName[] =>
    traced
      .filter(
        (entry) =>
          entry.owner !== moduleId &&
          mayImport(
            tree,
            { module: moduleId, ...(context === undefined ? {} : { context }), binding: 'value' },
            entry.owner,
            entry.symbol,
          ),
      )
      .map((entry) => entry.symbol);

  const caption = (tags: readonly ModuleTag[], scope: 'context' | 'module'): string =>
    tags.length === 0 ? scope : `${tags.join(' · ')} ${scope}`;

  const named = (requireModuleRecord(tree, moduleId).contexts ?? []).map((declared): DrawnContext => {
    const tags = moduleTagsOf(tree, moduleId, declared.name);
    return {
      module: moduleId,
      name: declared.name,
      label: declared.name,
      tags,
      caption: caption(tags, 'context'),
      imports: importsOf(declared.name),
    };
  });

  const moduleTags = moduleTagsOf(tree, moduleId);
  const module =
    moduleTags.length === 0
      ? undefined
      : {
          // A tag always travels with its rule, so the label writes each tag
          // behind its rule's glyph; the caption states the scope in plain
          // words.
          module: moduleId,
          label: moduleTags.map(tagWithGlyph).join(' · '),
          tags: moduleTags,
          caption: caption(moduleTags, 'module'),
          imports: importsOf(),
        };

  return { named, ...(module === undefined ? {} : { module }) };
}

/** Build every node's content and measure it. Positions come later. */
function buildContent(context: DiagramContext): Map<ModuleId, NodeContent> {
  const { tree, moduleOrder, moduleDepth, definition } = context;
  const { nodeContent, whatIfNote } = definition;
  const receivedSlug = slugify(nodeContent.receivedCompartmentTitle);

  const allRefs = moduleOrder.flatMap((id) =>
    requireModuleRecord(tree, id).owns.map((owned) => ({ owner: id, name: owned.symbol })),
  );

  const contents = new Map<ModuleId, NodeContent>();

  for (const id of moduleOrder) {
    const record = requireModuleRecord(tree, id);
    const depth = moduleDepth.get(id) ?? 0;
    const isRoot = id === tree.root;

    const ownsRows = record.owns.map((owned): DraftRow => {
      // No separate "exported" flag exists: an owned symbol with neither
      // channel set is gray, meaning it goes no further than its owner.
      const marker = markerFor(owned.exposeToParent === true, owned.exposeToDescendants === true);
      return {
        kind: 'owns',
        symbol: owned.symbol,
        owner: id,
        marker,
        gray: marker === '·',
        ...tagFacts(tree, id, { marker, symbol: owned.symbol, owner: id }),
      };
    });

    const fromChildRows = derivedChildExposures(tree, id, allRefs).map((arrival): DraftRow => {
      const marker = markerFor(
        reExposesToParent(tree, id, arrival.owner, arrival.name),
        reExposesToDescendants(tree, id, arrival.owner, arrival.name),
      );
      return {
        kind: 'fromChild',
        symbol: arrival.name,
        owner: arrival.owner,
        marker,
        gray: marker === '·',
        from: arrival.from,
        provenance: provenanceText(arrival.from),
        ...tagFacts(tree, id, { marker, symbol: arrival.name, owner: arrival.owner }),
      };
    });

    // A symbol received from an ancestor arrives with no decision for this
    // module to make: re-exposing it is a no-op, so the row carries no marker
    // and is never gray - gray means *stops here*, and nothing stopped.
    const fromAncestorRows = nodeContent.includeAncestorExposures
      ? derivedDescendantExposures(tree, id, allRefs).map(
          (arrival): DraftRow => ({
            kind: 'fromAncestor',
            symbol: arrival.name,
            owner: arrival.owner,
            gray: false,
            from: arrival.from,
            provenance: provenanceText(arrival.from),
            ...tagFacts(tree, id, { symbol: arrival.name, owner: arrival.owner }),
          }),
        )
      : [];

    // §4.4 finding 7: `▼ PaymentApi` above `· CartApi` is the most informative
    // element in the picture. Gray rows sink to the bottom of a compartment so
    // that "this one travelled, this one stopped" reads as a contrast.
    const sortRows = (rows: readonly DraftRow[]): DraftRow[] => [
      ...rows.filter((row) => !row.gray),
      ...rows.filter((row) => row.gray),
    ];

    const owns = sortRows(ownsRows);
    // Arrivals from an ancestor sort last: they are the passive half of the
    // compartment, and nothing about them was decided here.
    const received = [...sortRows(fromChildRows), ...fromAncestorRows];

    // §3.2: an absent contract is a statement. A module with neither
    // compartment says so; one with arrivals to list needs no empty box.
    const showPlaceholder = owns.length === 0 && received.length === 0;

    const contexts = drawnContexts(tree, id, definition.tracedSymbols);

    // The header carries the module's name, the root badge, and - when the
    // module itself is a context - the tag label that says so.
    const headerChars = [
      id,
      ...(isRoot ? [APP_ROOT_BADGE] : []),
      ...(contexts.module === undefined ? [] : [contexts.module.label]),
    ].join('   ').length;
    // A named context's box has two lines of its own, drawn inside its own
    // inset: measured in that font, then converted into the row budget. A
    // whole-module context adds nothing here - its label rides the header.
    const contextChars = contexts.named.map((context) =>
      Math.ceil(
        (2 * LAYOUT.node.contextInset +
          Math.max(context.label.length, context.caption.length) * LAYOUT.node.contextCharWidth) /
          LAYOUT.node.charWidth,
      ),
    );
    const contentChars = [
      headerChars,
      ...(showPlaceholder ? [PLACEHOLDER.length] : []),
      ...[...owns, ...received].map((row) => rowChars(row)),
      ...contextChars,
    ];
    const width = Math.max(
      LAYOUT.node.minWidth,
      2 * LAYOUT.node.paddingX + LAYOUT.node.charWidth * Math.max(...contentChars),
    );

    const compartments: Compartment[] = [];
    const finishedRows: SymbolRow[] = [];
    let y = LAYOUT.node.headerHeight;

    const addSymbolCompartment = (
      kind: 'owns' | 'received',
      slug: string,
      title: string,
      rows: readonly DraftRow[],
      placeholder?: string,
    ): void => {
      const bodyRows = placeholder === undefined ? rows.length : 1;
      const height = LAYOUT.node.compartmentTitleHeight + bodyRows * LAYOUT.node.rowHeight;
      const laidOut: SymbolRow[] = rows.map((row, index) => ({
        ...row,
        id: `node-${id}-${slug}-${row.symbol}`,
        compartment: slug,
        layer: context.layerFor(row.owner, row.symbol),
        color: context.symbolColor(row.owner, row.symbol),
        y:
          y +
          LAYOUT.node.compartmentTitleHeight +
          index * LAYOUT.node.rowHeight +
          LAYOUT.node.rowHeight / 2,
      }));
      compartments.push({
        kind,
        id: `node-${id}-compartment-${slug}`,
        slug,
        title,
        rows: laidOut,
        ...(placeholder === undefined ? {} : { placeholder }),
        y,
        height,
      });
      finishedRows.push(...laidOut);
      y += height;
    };

    if (owns.length > 0) {
      addSymbolCompartment('owns', 'owns', 'owns', owns);
    } else if (showPlaceholder) {
      addSymbolCompartment('owns', 'owns', 'owns', [], PLACEHOLDER);
    }
    if (received.length > 0) {
      addSymbolCompartment('received', receivedSlug, nodeContent.receivedCompartmentTitle, received);
    }

    // A declared context is part of the node's content, not an overlay: it
    // takes its own band at the bottom of the box, and the box grew for it.
    for (const context of contexts.named) {
      const height =
        2 * LAYOUT.node.contextPadding + 2 * LAYOUT.node.contextLineHeight;
      compartments.push({
        kind: 'context',
        id: `node-${id}-compartment-context-${context.name ?? ''}`,
        slug: `context-${context.name ?? ''}`,
        title: context.label,
        context,
        y,
        height,
      });
      y += height;
    }

    if (whatIfNote !== undefined && id === whatIfNote.moduleId) {
      const maxChars = Math.floor((width - 2 * LAYOUT.node.paddingX) / LAYOUT.lane.chipCharWidth);
      const lines = wrapText(whatIfNote.text, maxChars);
      const height =
        LAYOUT.node.compartmentTitleHeight + lines.length * LAYOUT.node.whatIfLineHeight;
      compartments.push({
        kind: 'what-if',
        id: `node-${id}-compartment-what-if`,
        slug: 'what-if',
        title: whatIfNote.title,
        lines,
        y,
        height,
      });
      y += height;
    }

    contents.set(id, {
      id,
      depth,
      isRoot,
      ...(isRoot ? { badge: APP_ROOT_BADGE } : {}),
      width,
      height: y + LAYOUT.node.paddingBottom,
      compartments,
      rows: finishedRows,
      ...(contexts.module === undefined ? {} : { moduleContext: contexts.module }),
    });
  }

  return contents;
}

/** Tidy-tree x positions, then a clearance-enforcing relaxation. */
function positionNodes(
  context: DiagramContext,
  contents: ReadonlyMap<ModuleId, NodeContent>,
): Map<ModuleId, number> {
  const root = hierarchy<ModuleDeclaration>(
    context.definition.declaration,
    (node) => node.children as ModuleDeclaration[] | undefined,
  );

  const halfWidth = (node: HierarchyNode<ModuleDeclaration>): number =>
    (contents.get(node.data.id)?.width ?? LAYOUT.node.minWidth) / 2;

  const laidOut = d3Tree<ModuleDeclaration>()
    .nodeSize([1, 1])
    .separation(
      (a, b) =>
        halfWidth(a) +
        halfWidth(b) +
        (a.parent === b.parent ? LAYOUT.siblingGap : LAYOUT.branchGap),
    )(root);

  const x = new Map<ModuleId, number>();
  for (const node of laidOut.descendants()) {
    x.set(node.data.id, node.x);
  }

  const childrenOf = new Map<ModuleId, ModuleId[]>();
  for (const node of laidOut.descendants()) {
    childrenOf.set(node.data.id, (node.children ?? []).map((child) => child.data.id));
  }
  const byDepth = new Map<number, ModuleId[]>();
  for (const node of laidOut.descendants()) {
    const list = byDepth.get(node.depth) ?? [];
    list.push(node.data.id);
    byDepth.set(node.depth, list);
  }

  const shiftSubtree = (id: ModuleId, delta: number): void => {
    x.set(id, (x.get(id) ?? 0) + delta);
    for (const child of childrenOf.get(id) ?? []) {
      shiftSubtree(child, delta);
    }
  };

  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  for (let pass = 0; pass < 6; pass += 1) {
    // Push apart anything that would collide, subtree by subtree.
    for (const depth of depths) {
      const row = [...(byDepth.get(depth) ?? [])].sort(
        (a, b) => (x.get(a) ?? 0) - (x.get(b) ?? 0),
      );
      for (let index = 1; index < row.length; index += 1) {
        const previous = row[index - 1] as ModuleId;
        const current = row[index] as ModuleId;
        const previousRight =
          (x.get(previous) ?? 0) + (contents.get(previous)?.width ?? 0) / 2;
        const currentLeft = (x.get(current) ?? 0) - (contents.get(current)?.width ?? 0) / 2;
        const overlap = previousRight + LAYOUT.minLevelClearance - currentLeft;
        if (overlap > 0) {
          shiftSubtree(current, overlap);
        }
      }
    }
    // Re-centre every parent over the span of its children.
    for (const depth of [...depths].reverse()) {
      for (const id of byDepth.get(depth) ?? []) {
        const children = childrenOf.get(id) ?? [];
        if (children.length === 0) {
          continue;
        }
        const xs = children.map((child) => x.get(child) ?? 0);
        x.set(id, (Math.min(...xs) + Math.max(...xs)) / 2);
      }
    }
  }

  return x;
}

/** Content, measurement and placement for every node of a diagram's universe. */
export function layoutTree(context: DiagramContext): TreeGeometry {
  const contents = buildContent(context);
  const centers = positionNodes(context, contents);

  const maxDepth = Math.max(...[...contents.values()].map((content) => content.depth));
  const levelHeights: number[] = [];
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    levelHeights[depth] = Math.max(
      ...[...contents.values()].filter((content) => content.depth === depth).map((c) => c.height),
    );
  }

  const levels: LevelGeometry[] = [];
  let top =
    LAYOUT.margin +
    (context.definition.title === undefined ? 0 : LAYOUT.title.height) +
    headerBandHeight(context.definition.tracedSymbols.length);
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const bottom = top + (levelHeights[depth] ?? 0);
    levels.push({
      depth,
      top,
      bottom,
      busY: depth === maxDepth ? null : bottom + LAYOUT.levelGap * LAYOUT.busFraction,
    });
    top = bottom + LAYOUT.levelGap;
  }

  const minLeft = Math.min(
    ...[...contents.values()].map((content) => (centers.get(content.id) ?? 0) - content.width / 2),
  );
  const shift = LAYOUT.margin - minLeft;

  const nodes: NodeLayout[] = context.moduleOrder.map((id) => {
    const content = contents.get(id) as NodeContent;
    const level = levels[content.depth] as LevelGeometry;
    return {
      id,
      depth: content.depth,
      isRoot: content.isRoot,
      ...(content.badge === undefined ? {} : { badge: content.badge }),
      box: {
        x: (centers.get(id) ?? 0) + shift - content.width / 2,
        y: level.top,
        width: content.width,
        height: content.height,
      },
      compartments: content.compartments,
      rows: content.rows,
      ...(content.moduleContext === undefined ? {} : { moduleContext: content.moduleContext }),
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return {
    nodes,
    nodeById,
    levels,
    left: Math.min(...nodes.map((node) => node.box.x)),
    right: Math.max(...nodes.map((node) => node.box.x + node.box.width)),
    top: Math.min(...nodes.map((node) => node.box.y)),
    bottom: Math.max(...nodes.map((node) => node.box.y + node.box.height)),
  };
}

/** Centre of a node box's bottom edge - where propagation and chords attach. */
export function bottomCenter(node: NodeLayout): { x: number; y: number } {
  return { x: node.box.x + node.box.width / 2, y: node.box.y + node.box.height };
}

/** Centre of a node box's top edge. */
export function topCenter(node: NodeLayout): { x: number; y: number } {
  return { x: node.box.x + node.box.width / 2, y: node.box.y };
}
