/**
 * The classic view of a module tree: one box per module, root at the top,
 * children in a row beneath their parent, elbow connectors between them -
 * sized and placed from the declaration alone.
 *
 * Where `ModelDiagram` teaches the rules - exposure channels, reach, denials -
 * this view teaches *structure*: a level of the tree is a row of the picture.
 * With a {@link TreeFocus} the same picture shows the working context of one
 * module: its own files, the interfaces its children expose to it, the
 * symbols handed down from above, and - dimmed - everything that is not
 * available in it.
 *
 * What the focus view claims is read off the evaluator, never off the
 * definition: every received row comes from `diagramVisibility`, so a row is
 * drawn only where the model says the symbol is available.
 *
 * Pure and browser-compatible: no I/O, no DOM.
 */

import { placeTree, type Box, type LayoutGraphInput } from '../subs/layout/src/index.js';
import { derivedChildExposures, derivedDescendantExposures } from './layout-nodes.js';
import {
  buildDiagramModel,
  moduleView,
  moduleViews,
  diagramRoot,
  type ModelInput,
  type ModuleId,
  type DiagramModuleView,
  type Model,
  type SymbolName,
} from './model-access.js';

/** The module whose working context the picture shows. */
export interface TreeFocus {
  readonly moduleId: ModuleId;
  /**
   * The focus module's own files, listed in its box. Editorial: the model
   * knows modules and symbols, not files, so these are the diagram's to name.
   */
  readonly files: readonly string[];
}

export interface TreeDiagramDefinition {
  /** Stable identifier; also the element-id stem. */
  readonly id: string;
  readonly declaration: ModelInput;
  /** The `<svg>`'s accessible name. */
  readonly ariaLabel: string;
  readonly focus?: TreeFocus;
  /**
   * With a focus: also list the context in the boxes (the focus's rows, the
   * children collapsed to what they expose). `false` keeps every box bare and
   * only casts the roles - the tree as a map with the path to the focus marked.
   */
  readonly focusRows?: boolean;
  /** Standing notes drawn under the tree. */
  readonly notes?: readonly string[];
}

/**
 * How a node relates to the focus: the focus itself, one of its direct
 * children (drawn as the interface it exposes upward, its own subtree
 * hidden), an ancestor (the path from the root down to the focus), a source
 * (a module on the route a received symbol travelled, drawn dashed), or
 * outside (not available in the focus, drawn dimmed). Without a focus every
 * node is `plain`.
 */
export type TreeBoxRole = 'plain' | 'focus' | 'child' | 'ancestor' | 'source' | 'outside';

/** One decision on a symbol's route: a module, and the channel it exposed through. */
export interface ChainHop {
  readonly module: ModuleId;
  readonly channel: 'toParent' | 'toDescendants';
}

export type TreeRow =
  | { readonly kind: 'title'; readonly text: string }
  /** A bold sub-heading inside a box or card: a sub-module's name over its rows. */
  | { readonly kind: 'group'; readonly text: string }
  | {
      readonly kind: 'exposed';
      readonly symbol: SymbolName;
      readonly channel: 'toParent' | 'toDescendants';
    }
  | {
      readonly kind: 'received';
      readonly symbol: SymbolName;
      /** The module whose decision delivered it here. */
      readonly from: ModuleId;
      /** The whole route, owner first, `from` last. */
      readonly chain: readonly ChainHop[];
    }
  | { readonly kind: 'file'; readonly text: string };

export interface TreeNodeLayout {
  readonly id: ModuleId;
  readonly depth: number;
  readonly role: TreeBoxRole;
  readonly box: Box;
  readonly rows: readonly TreeRow[];
}

/** An elbow connector from a parent's bottom edge to a child's top edge. */
export interface TreeConnectorLayout {
  readonly parent: ModuleId;
  readonly child: ModuleId;
  /** SVG path data. */
  readonly d: string;
  /**
   * `focus`: an edge of the focus context; `source`: a hop on a received
   * symbol's route, drawn dashed; `outside`: an edge into a dimmed node.
   */
  readonly role: 'plain' | 'focus' | 'source' | 'outside';
}

export interface TreeNoteLayout {
  readonly text: string;
  readonly y: number;
}

export interface TreeDiagramLayout {
  readonly definition: TreeDiagramDefinition;
  readonly viewBox: Box;
  /** Pre-order of the declaration. */
  readonly nodes: readonly TreeNodeLayout[];
  readonly edges: readonly TreeConnectorLayout[];
  readonly notes: readonly TreeNoteLayout[];
}

export const TREE_LAYOUT = {
  margin: 12,
  /** Height of the name strip at the top of every box. */
  header: 22,
  padding: 8,
  /** Space between sibling subtrees. */
  gap: 8,
  /** Vertical space between one level's tallest box and the next level. */
  levelGap: 34,
  /** Air between a box's rows and its bottom edge. */
  rowsFoot: 6,
  /** Bottom padding of a box with no rows: a name strip and little else. */
  leafFoot: 4,
  minWidth: 56,
  rowHeight: 16,
  titleRowHeight: 15,
  nameFontSize: 12.5,
  rowFontSize: 11,
  titleFontSize: 10,
  fileFontSize: 10.5,
  noteFontSize: 10.5,
  noteLineHeight: 15,
  notesGap: 10,
  /** Deliberate over-estimates of advance width, so nothing is cramped. */
  nameCharWidth: 7.6,
  rowCharWidth: 6.4,
  fileCharWidth: 6.4,
  cornerRadius: 5,
} as const;

const L = TREE_LAYOUT;

export function rowHeight(row: TreeRow): number {
  return row.kind === 'title' ? L.titleRowHeight : L.rowHeight;
}

export function rowWidth(row: TreeRow): number {
  switch (row.kind) {
    case 'title':
      return row.text.length * L.rowCharWidth;
    case 'group':
      return row.text.length * L.nameCharWidth;
    case 'exposed':
      return (row.symbol.length + 2) * L.rowCharWidth;
    case 'received':
      // `name`, an 8 px gap, then the route in the smaller title size.
      return row.symbol.length * L.rowCharWidth + 8 + chainText(row.chain).length * L.rowCharWidth * 0.9;
    case 'file':
      return row.text.length * L.fileCharWidth;
  }
}

export function rowsHeight(rows: readonly TreeRow[]): number {
  return rows.reduce((sum, row) => sum + rowHeight(row), 0);
}

interface Sized {
  readonly id: ModuleId;
  readonly depth: number;
  readonly role: TreeBoxRole;
  readonly rows: readonly TreeRow[];
  readonly children: readonly Sized[];
  /** The box's own size. */
  readonly width: number;
  readonly height: number;
}

interface Casting {
  readonly tree: Model;
  readonly roleOf: (id: ModuleId) => TreeBoxRole;
  readonly rowsFor: (id: ModuleId, role: TreeBoxRole) => readonly TreeRow[];
  /** Hide the subtrees of the focus's children. */
  readonly collapseChildren?: boolean;
  /** Parent→child edges on a received symbol's route, as `parent>child`. */
  readonly routeEdges: ReadonlySet<string>;
}

function exposedTo(record: DiagramModuleView, channel: 'toParent' | 'toDescendants'): SymbolName[] {
  const key = channel === 'toParent' ? 'exposeToParent' : 'exposeToDescendants';
  return [
    ...record.owns.filter((owned) => owned[key] === true).map((owned) => owned.symbol),
    ...record.reExposes.filter((entry) => entry[key] === true).map((entry) => entry.symbol),
  ];
}

/** One arrival in the focus: a symbol available there that it does not own. */
export interface FocusArrival {
  readonly symbol: SymbolName;
  readonly owner: ModuleId;
  /** The module whose decision delivered it: the exposing child or ancestor. */
  readonly from: ModuleId;
  /** Every decision on the way, owner first, `from` last. */
  readonly chain: readonly ChainHop[];
}

/** The route as text: `logging ▲ platform ▲ shop ▼`. */
export function chainText(chain: readonly ChainHop[]): string {
  return chain.map((hop) => `${hop.module} ${hop.channel === 'toParent' ? '▲' : '▼'}`).join(' ');
}

/**
 * The route a symbol took from its owner to the module whose decision
 * delivered it: every module from the owner up to `from` exposed it to its
 * parent, and `from` itself exposed it through `lastChannel`. When the owner
 * is not below `from` (a re-exposure of something that arrived from above),
 * the route is just that last decision.
 */
function routeOf(
  tree: Model,
  owner: ModuleId,
  from: ModuleId,
  lastChannel: ChainHop['channel'],
): ChainHop[] {
  const hops: ChainHop[] = [];
  for (let current: ModuleId | null = owner; current !== null; ) {
    if (current === from) {
      hops.push({ module: from, channel: lastChannel });
      return hops;
    }
    hops.push({ module: current, channel: 'toParent' });
    current = moduleView(tree, current).parent;
  }
  return [{ module: from, channel: lastChannel }];
}

/**
 * Everything the focus module's working context consists of, read off the
 * evaluator: the path down to it, what it owes upward and downward, what each
 * child exposes to it, and what arrives from above with its provenance.
 */
export interface FocusContext {
  readonly moduleId: ModuleId;
  /** Root first, focus last. */
  readonly path: readonly ModuleId[];
  readonly parent: ModuleId | null;
  readonly children: readonly ModuleId[];
  readonly owedToParent: readonly SymbolName[];
  readonly owedToDescendants: readonly SymbolName[];
  /** In child order; a child that exposes nothing has an empty list. */
  readonly fromChildren: readonly { readonly child: ModuleId; readonly symbols: readonly FocusArrival[] }[];
  readonly fromAbove: readonly FocusArrival[];
}

export function focusContext(tree: Model, moduleId: ModuleId): FocusContext {
  const record = moduleView(tree, moduleId);
  const path: ModuleId[] = [moduleId];
  for (let parent = record.parent; parent !== null; ) {
    path.unshift(parent);
    parent = moduleView(tree, parent).parent;
  }

  const allRefs = moduleViews(tree).flatMap((entry) =>
    entry.owns.map((owned) => ({ owner: entry.id, name: owned.symbol })),
  );
  const toArrival =
    (lastChannel: ChainHop['channel']) =>
    (entry: { owner: ModuleId; name: SymbolName; from: ModuleId }): FocusArrival => ({
      symbol: entry.name,
      owner: entry.owner,
      from: entry.from,
      chain: routeOf(tree, entry.owner, entry.from, lastChannel),
    });
  const fromChildrenFlat = derivedChildExposures(tree, moduleId, allRefs).map(toArrival('toParent'));

  return {
    moduleId,
    path,
    parent: record.parent,
    children: record.children,
    owedToParent: exposedTo(record, 'toParent'),
    owedToDescendants: exposedTo(record, 'toDescendants'),
    fromChildren: record.children.map((child) => ({
      child,
      symbols: fromChildrenFlat.filter((arrival) => arrival.from === child),
    })),
    fromAbove: derivedDescendantExposures(tree, moduleId, allRefs).map(toArrival('toDescendants')),
  };
}

/** The parent→child edges that lie on a received symbol's route, as `parent>child`. */
export function routeEdges(context: FocusContext): ReadonlySet<string> {
  const edges = new Set<string>();
  for (const arrival of context.fromAbove) {
    for (let index = 0; index + 1 < arrival.chain.length; index += 1) {
      const lower = arrival.chain[index];
      const upper = arrival.chain[index + 1];
      if (lower !== undefined && upper !== undefined) {
        edges.add(`${upper.module}>${lower.module}`);
      }
    }
  }
  return edges;
}

function casting(tree: Model, definition: TreeDiagramDefinition): Casting {
  const { focus } = definition;
  if (focus === undefined) {
    return { tree, roleOf: () => 'plain', rowsFor: () => [], routeEdges: new Set() };
  }

  const context = focusContext(tree, focus.moduleId);
  const ancestors = new Set(context.path.slice(0, -1));
  const children = new Set(context.children);
  const sources = new Set(
    context.fromAbove.flatMap((arrival) => arrival.chain.map((hop) => hop.module)),
  );
  const roleOf = (id: ModuleId): TreeBoxRole =>
    id === focus.moduleId
      ? 'focus'
      : children.has(id)
        ? 'child'
        : ancestors.has(id)
          ? 'ancestor'
          : sources.has(id)
            ? 'source'
            : 'outside';
  const edges = routeEdges(context);

  if (definition.focusRows === false) {
    return { tree, roleOf, rowsFor: () => [], routeEdges: edges };
  }

  const focusRows = (): TreeRow[] => {
    const rows: TreeRow[] = [];
    if (context.parent !== null && context.owedToParent.length > 0) {
      rows.push({ kind: 'title', text: `exposes to ${context.parent}` });
      for (const symbol of context.owedToParent) {
        rows.push({ kind: 'exposed', symbol, channel: 'toParent' });
      }
    }
    if (context.owedToDescendants.length > 0) {
      rows.push({ kind: 'title', text: 'exposes to descendants' });
      for (const symbol of context.owedToDescendants) {
        rows.push({ kind: 'exposed', symbol, channel: 'toDescendants' });
      }
    }
    if (context.fromAbove.length > 0) {
      rows.push({ kind: 'title', text: 'receives from above' });
      for (const arrival of context.fromAbove) {
        rows.push({
          kind: 'received',
          symbol: arrival.symbol,
          from: arrival.from,
          chain: arrival.chain,
        });
      }
    }
    if (focus.files.length > 0) {
      rows.push({ kind: 'title', text: 'files' });
      for (const file of focus.files) {
        rows.push({ kind: 'file', text: file });
      }
    }
    return rows;
  };

  // A child is drawn as the interface it exposes to the focus - the ▲ rows
  // say so on their own, and the note under the tree spells the glyph out.
  const childRows = (id: ModuleId): TreeRow[] =>
    (context.fromChildren.find((entry) => entry.child === id)?.symbols ?? []).map(
      (arrival): TreeRow => ({ kind: 'exposed', symbol: arrival.symbol, channel: 'toParent' }),
    );

  return {
    tree,
    roleOf,
    rowsFor: (id, role) => (role === 'focus' ? focusRows() : role === 'child' ? childRows(id) : []),
    collapseChildren: true,
    routeEdges: edges,
  };
}

function size(record: DiagramModuleView, depth: number, cast: Casting): Sized {
  const role = cast.roleOf(record.id);
  const rows = cast.rowsFor(record.id, role);
  // With rows, a focus child is drawn as the interface it exposes upward; its
  // own subtree is exactly what working in the focus does not require.
  const children =
    role === 'child' && cast.collapseChildren
      ? []
      : record.children.map((child) => size(moduleView(cast.tree, child), depth + 1, cast));

  const nameWidth = record.id.length * L.nameCharWidth + 2 * L.padding;
  const rowsWidth = Math.max(0, ...rows.map(rowWidth)) + 2 * L.padding;
  const width = Math.ceil(Math.max(L.minWidth, nameWidth, rowsWidth));
  const height =
    L.header + (rows.length > 0 ? rowsHeight(rows) + L.rowsFoot : L.leafFoot);
  return { id: record.id, depth, role, rows, children, width, height };
}

function edgeRole(
  parent: ModuleId,
  child: Sized,
  onRoute: ReadonlySet<string>,
): TreeConnectorLayout['role'] {
  if (child.role === 'plain') {
    return 'plain';
  }
  if (onRoute.has(`${parent}>${child.id}`)) {
    return 'source';
  }
  return child.role === 'outside' || child.role === 'source' ? 'outside' : 'focus';
}

/** Lay out a tree diagram: sizes bottom-up, positions top-down. */
export function layoutTreeDiagram(definition: TreeDiagramDefinition): TreeDiagramLayout {
  const tree = buildDiagramModel(definition.declaration);
  const cast = casting(tree, definition);
  const root = size(moduleView(tree, diagramRoot(tree)), 0, cast);
  const prepared: Sized[] = [];
  const parents = new Map<string, string | null>();
  const visit = (node: Sized, parent: string | null): void => {
    prepared.push(node);
    parents.set(node.id, parent);
    node.children.forEach(child => visit(child, node.id));
  };
  visit(root, null);
  const graph: LayoutGraphInput = {
    nodes: prepared.map((node, order) => ({ key: node.id, parent: parents.get(node.id) ?? null,
      width: node.width, height: node.height, order })),
    edges: prepared.filter(node => parents.get(node.id) !== null).map((node, order) => ({
      key: `${parents.get(node.id)!}>${node.id}`, from: parents.get(node.id)!, to: node.id, lane: 0, order,
    })),
  };
  const placed = placeTree(graph, { gapX: L.gap, gapY: L.levelGap, padding: L.margin, orientation: 'vertical' });
  const byKey = new Map(prepared.map(node => [node.id, node]));
  const nodes: TreeNodeLayout[] = placed.nodes.map(node => {
    const content = byKey.get(node.key) as Sized;
    return { id: content.id, depth: content.depth, role: content.role, rows: content.rows, box: node.box };
  });
  const edgeInputs = new Map(graph.edges.map(edge => [edge.key, edge]));
  const edges: TreeConnectorLayout[] = placed.edges.map(edge => {
    const input = edgeInputs.get(edge.key)!;
    const [from, elbow, across, to] = edge.points;
    if (from === undefined || elbow === undefined || across === undefined || to === undefined) throw new Error('Incomplete tree connector.');
    return { parent: input.from, child: input.to,
      d: `M${from.x} ${from.y}V${elbow.y}H${across.x}V${to.y}`,
      role: edgeRole(input.from, byKey.get(input.to) as Sized, cast.routeEdges) };
  });

  const treeBottom = Math.max(...nodes.map((node) => node.box.y + node.box.height));
  const noteTexts = definition.notes ?? [];
  const notesTop = treeBottom + (noteTexts.length > 0 ? L.notesGap : 0);
  const notes = noteTexts.map((text, index) => ({
    text,
    y: notesTop + index * L.noteLineHeight + L.noteLineHeight / 2,
  }));

  return {
    definition,
    viewBox: {
      x: 0,
      y: 0,
      width: placed.bounds.width + 2 * L.margin,
      height: notesTop + noteTexts.length * L.noteLineHeight + L.margin,
    },
    nodes,
    edges,
    notes,
  };
}
