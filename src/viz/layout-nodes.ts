/**
 * Node content and tidy-tree positions.
 *
 * Two jobs, in this order:
 *
 * 1. **Content.** Every row of every node box is *derived* from the
 *    declaration through the evaluator — including the whole received
 *    compartment and its provenance, which is exactly what
 *    `explainImport(...).via` reports. Nothing about receiving is declared
 *    anywhere, and that is the point: `CartApi` is available in `checkout` as
 *    a consequence of `cart`'s decision, not of any decision `checkout` made.
 *    Which of the two arrival channels a diagram lists is the one editorial
 *    choice here (`nodeContent.includeAncestorGrants`).
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

import type { ColorKey, DiagramContext } from './diagram-definition.js';
import { LAYOUT, wrapText, type Box } from './geometry.js';
import {
  explainImport,
  requireModuleRecord,
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
 * - `owns` — a file belonging to the module exports it.
 * - `received` — a direct child exposed it to its parent.
 * - `granted` — a proper ancestor exposed it to its descendants.
 *
 * The three are exactly the clauses of the rule, so a row's kind is checkable
 * against `explainImport(...).clause` and `./validate.ts` checks it.
 */
export type RowKind = 'owns' | 'received' | 'granted';

/** One symbol line inside a node box. */
export interface SymbolRow {
  readonly id: string;
  readonly kind: RowKind;
  /** Slug of the compartment the row is drawn in — the element-id stem. */
  readonly compartment: string;
  readonly symbol: SymbolName;
  /** The module that owns the symbol — for an arrival row, never this node. */
  readonly owner: ModuleId;
  /**
   * Absent on `granted` rows: a module can only re-expose what it owns or was
   * exposed to it by a child, so an ancestor-granted symbol carries no onward
   * decision for this module to make.
   */
  readonly marker?: ExposureMarker;
  /** Gray: the symbol stops here. Nothing gray ever has an arrow attached. */
  readonly gray: boolean;
  /** The module named by the provenance: the providing child, or the granter. */
  readonly from?: ModuleId;
  /** The provenance text as drawn (`from cart`, `granted by app`). */
  readonly provenance?: string;
  readonly layer: string;
  readonly color: ColorKey;
  /** y of the row's centre, relative to the node box's top. */
  readonly y: number;
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
}

/** The provenance a row states, in the words the box draws. */
export function provenanceText(kind: RowKind, from: ModuleId): string {
  return kind === 'granted' ? `granted by ${from}` : `from ${from}`;
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
 * that exposed each to it — read straight off the evaluator's child-exposure
 * explanation.
 */
export function derivedHoldings(
  tree: ModuleTree,
  moduleId: ModuleId,
  symbols: readonly { readonly owner: ModuleId; readonly name: SymbolName }[],
): { readonly owner: ModuleId; readonly name: SymbolName; readonly from: ModuleId }[] {
  return arrivals(tree, moduleId, symbols, 'child-exposure');
}

/**
 * The symbols a proper ancestor granted to a module, with the granting
 * ancestor — the evaluator's `ancestor-grant` clause, and the second way a
 * symbol becomes available somewhere its owner never named.
 */
export function derivedGrants(
  tree: ModuleTree,
  moduleId: ModuleId,
  symbols: readonly { readonly owner: ModuleId; readonly name: SymbolName }[],
): { readonly owner: ModuleId; readonly name: SymbolName; readonly from: ModuleId }[] {
  return arrivals(tree, moduleId, symbols, 'ancestor-grant');
}

function arrivals(
  tree: ModuleTree,
  moduleId: ModuleId,
  symbols: readonly { readonly owner: ModuleId; readonly name: SymbolName }[],
  clause: 'child-exposure' | 'ancestor-grant',
): { owner: ModuleId; name: SymbolName; from: ModuleId }[] {
  const found: { owner: ModuleId; name: SymbolName; from: ModuleId }[] = [];
  for (const ref of symbols) {
    if (ref.owner === moduleId) {
      continue;
    }
    const decision = explainImport(tree, moduleId, ref.owner, ref.name);
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
    const decision = explainImport(tree, descendant, owner, symbol);
    return decision.allowed && decision.clause === 'ancestor-grant' && decision.via === moduleId;
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
  const decision = explainImport(tree, parent, owner, symbol);
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

/** A row's width in characters: marker column, symbol, and the provenance. */
function rowChars(row: { marker?: string; symbol: string; provenance?: string }): number {
  const left = `${row.marker ?? ' '} ${row.symbol}`;
  return row.provenance === undefined ? left.length : `${left}   ${row.provenance}`.length;
}

/** A row before layout has placed it. */
type DraftRow = Omit<SymbolRow, 'id' | 'compartment' | 'layer' | 'color' | 'y'>;

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
      return { kind: 'owns', symbol: owned.symbol, owner: id, marker, gray: marker === '·' };
    });

    const receivedRows = derivedHoldings(tree, id, allRefs).map((held): DraftRow => {
      const marker = markerFor(
        reExposesToParent(tree, id, held.owner, held.name),
        reExposesToDescendants(tree, id, held.owner, held.name),
      );
      return {
        kind: 'received',
        symbol: held.name,
        owner: held.owner,
        marker,
        gray: marker === '·',
        from: held.from,
        provenance: provenanceText('received', held.from),
      };
    });

    // An ancestor-granted symbol arrives with no decision for this module to
    // make: re-exposing it is a no-op, so the row carries no marker and is
    // never gray — gray means *stops here*, and nothing stopped.
    const grantedRows = nodeContent.includeAncestorGrants
      ? derivedGrants(tree, id, allRefs).map(
          (granted): DraftRow => ({
            kind: 'granted',
            symbol: granted.name,
            owner: granted.owner,
            gray: false,
            from: granted.from,
            provenance: provenanceText('granted', granted.from),
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
    const received = [...sortRows(receivedRows), ...grantedRows];

    // §3.2: an absent contract is a statement. A module with neither
    // compartment says so; one with arrivals to list needs no empty box.
    const showPlaceholder = owns.length === 0 && received.length === 0;

    const headerChars = isRoot ? `${id}   ${APP_ROOT_BADGE}`.length : id.length;
    const contentChars = [
      headerChars,
      ...(showPlaceholder ? [PLACEHOLDER.length] : []),
      ...[...owns, ...received].map((row) => rowChars(row)),
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
  let top = LAYOUT.margin + LAYOUT.title.height;
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

/** Centre of a node box's bottom edge — where propagation and chords attach. */
export function bottomCenter(node: NodeLayout): { x: number; y: number } {
  return { x: node.box.x + node.box.width / 2, y: node.box.y + node.box.height };
}

/** Centre of a node box's top edge. */
export function topCenter(node: NodeLayout): { x: number; y: number } {
  return { x: node.box.x + node.box.width / 2, y: node.box.y };
}
