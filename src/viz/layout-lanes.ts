/**
 * Propagation lanes: the exposure decisions, drawn as ribbons running parallel
 * to the tree edges (§3.4–§3.5).
 *
 * The hard constraint of the plan is that no propagation arrow floats across
 * the canvas. Every lane here is a parallel offset of one tree edge, so a
 * symbol's legality is a path a reader can follow with a finger, hop by hop,
 * without ever leaving the tree.
 *
 * What is derived, not declared:
 *
 * - **which decisions exist** — a module grants to its descendants iff some
 *   descendant's `explainImport` says `ancestor-grant via <module>`, and
 *   exposes to its parent iff the parent's says `child-exposure via <module>`.
 *   Reach is a consequence, so it is read out of the evaluator rather than out
 *   of the declaration;
 * - **which nodes a grant reaches** — every strict descendant, one chevron each;
 * - **lane stacking** — shallowest origin nearest the edge, so a symbol's lane
 *   keeps a stable distance from the trunk all the way down its subtree.
 *
 * Pure and framework-free.
 */

import type { ColorKey, DiagramContext } from './diagram-definition.js';
import { LAYOUT, polyline, wrapText, type Point } from './geometry.js';
import {
  bottomCenter,
  descendantsOf,
  reExposesToDescendants,
  reExposesToParent,
  topCenter,
  type NodeLayout,
  type TreeGeometry,
} from './layout-nodes.js';
import {
  requireModuleRecord,
  type ModuleId,
  type ModuleTree,
  type SymbolRef,
} from './model-access.js';

/** One local decision: a module opening one channel for one bundle of symbols. */
export interface PropagationDecision {
  readonly id: string;
  readonly kind: 'grant' | 'up-hop';
  /** The module that decided. The only module with standing to decide this. */
  readonly decider: ModuleId;
  readonly deciderDepth: number;
  readonly symbols: readonly SymbolRef[];
  readonly layer: string;
  readonly color: ColorKey;
  /** `Money · formatDate` — a lane is a decision, not a symbol. */
  readonly chipText: string;
  /** Which of the diagram's policy statements this decision belongs to. */
  readonly policyId: string;
  /** Stable tie-break for lane stacking within one origin depth. */
  readonly order: number;
}

/** One tree edge. */
export interface TreeEdgeLayout {
  readonly id: string;
  readonly parent: ModuleId;
  readonly child: ModuleId;
  readonly d: string;
  readonly busY: number;
}

/** One lane, running along exactly one tree edge. */
export interface LanePath {
  readonly id: string;
  readonly decisionId: string;
  readonly kind: 'grant' | 'up-hop';
  readonly layer: string;
  readonly color: ColorKey;
  readonly parent: ModuleId;
  readonly child: ModuleId;
  /** Signed distance from the edge: negative left (up-hops), positive right (grants). */
  readonly offset: number;
  readonly d: string;
  /** `chevron` where a grant flow meets a reached node; `arrow` where an up-hop lands. */
  readonly head: 'chevron' | 'arrow';
  readonly headAt: Point;
  /** The module the head lands on — the module that may therefore import it. */
  readonly reaches: ModuleId;
  readonly symbols: readonly SymbolRef[];
}

/** A filled dot: somebody decided, once, here. */
export interface DecisionDot {
  readonly id: string;
  readonly decisionId: string;
  readonly layer: string;
  readonly color: ColorKey;
  readonly at: Point;
  readonly decider: ModuleId;
  readonly kind: 'grant' | 'up-hop';
  readonly policyId: string;
}

/** A text chip naming the symbols a lane carries. Color is never the only carrier. */
export interface LaneChip {
  readonly id: string;
  readonly decisionId: string;
  readonly layer: string;
  readonly color: ColorKey;
  readonly lines: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'end';
  readonly at: ModuleId;
}

export interface PropagationLayout {
  readonly decisions: readonly PropagationDecision[];
  readonly edges: readonly TreeEdgeLayout[];
  readonly lanes: readonly LanePath[];
  readonly dots: readonly DecisionDot[];
  readonly chips: readonly LaneChip[];
}

/** Every declared symbol, pre-order by module — the canonical iteration order. */
export function allSymbolRefs(context: DiagramContext): SymbolRef[] {
  return context.moduleOrder.flatMap((id) =>
    requireModuleRecord(context.tree, id).owns.map((owned) => ({ owner: id, name: owned.symbol })),
  );
}

function isAncestorOrSelf(tree: ModuleTree, ancestor: ModuleId, node: ModuleId): boolean {
  if (ancestor === node) {
    return true;
  }
  return descendantsOf(tree, ancestor).includes(node);
}

function policyFor(context: DiagramContext, decider: ModuleId, kind: 'grant' | 'up-hop'): string {
  const { decisionPolicies } = context.definition;
  const channel = kind === 'grant' ? 'toDescendants' : 'toParent';
  const matches = decisionPolicies.filter(
    (policy) => policy.channel === channel && policy.deciders.includes(decider),
  );
  if (matches.length !== 1) {
    throw new Error(
      `The decision by "${decider}" (${kind}) matches ${String(matches.length)} of the ` +
        `${String(decisionPolicies.length)} policy statements of diagram "${context.definition.id}"; ` +
        'it must match exactly one.',
    );
  }
  return (matches[0] as { id: string }).id;
}

/**
 * Enumerate the exposure decisions of the universe.
 *
 * Symbols opened by the same decision with the same reach share one lane and
 * one dot (§3.4 bundling) — except traced symbols, which always get a lane of
 * their own so that a `<g>` layer can isolate them.
 */
export function enumerateDecisions(context: DiagramContext): PropagationDecision[] {
  const { tree, moduleOrder, moduleDepth } = context;
  const refs = allSymbolRefs(context);
  const decisions: PropagationDecision[] = [];
  let order = 0;

  const emit = (kind: 'grant' | 'up-hop', decider: ModuleId, carried: readonly SymbolRef[]): void => {
    if (carried.length === 0) {
      return;
    }
    const bundles = new Map<string, SymbolRef[]>();
    for (const ref of carried) {
      const layer = context.layerFor(ref.owner, ref.name);
      const bundle = bundles.get(layer) ?? [];
      bundle.push(ref);
      bundles.set(layer, bundle);
    }
    for (const [layer, bundle] of bundles) {
      const first = bundle[0] as SymbolRef;
      decisions.push({
        id: `${kind}-${decider}-${layer}`,
        kind,
        decider,
        deciderDepth: moduleDepth.get(decider) ?? 0,
        symbols: bundle,
        layer,
        color: context.symbolColor(first.owner, first.name),
        chipText: bundle.map((ref) => ref.name).join(' · '),
        policyId: policyFor(context, decider, kind),
        order: order++,
      });
    }
  };

  for (const moduleId of moduleOrder) {
    emit(
      'grant',
      moduleId,
      refs.filter((ref) => reExposesToDescendants(tree, moduleId, ref.owner, ref.name)),
    );
    emit(
      'up-hop',
      moduleId,
      refs.filter((ref) => reExposesToParent(tree, moduleId, ref.owner, ref.name)),
    );
  }

  return decisions;
}

interface EdgeKey {
  readonly parent: ModuleId;
  readonly child: ModuleId;
}

function treeEdges(context: DiagramContext): EdgeKey[] {
  return context.moduleOrder.flatMap((parent) =>
    requireModuleRecord(context.tree, parent).children.map((child) => ({ parent, child })),
  );
}

/**
 * Signed lane offsets on one edge.
 *
 * Grants sit right of the edge, up-hops left — an absolute assignment, so
 * direction stays readable even where a chip is clipped. Within a side, lanes
 * are ordered by the depth of their origin: shallowest nearest the edge.
 */
function laneOffsets(
  tree: ModuleTree,
  edge: EdgeKey,
  decisions: readonly PropagationDecision[],
): Map<string, number> {
  const grants = decisions
    .filter((decision) => decision.kind === 'grant' && isAncestorOrSelf(tree, decision.decider, edge.parent))
    .sort((a, b) => a.deciderDepth - b.deciderDepth || a.order - b.order);
  const ups = decisions
    .filter((decision) => decision.kind === 'up-hop' && decision.decider === edge.child)
    .sort((a, b) => a.order - b.order);

  const offsets = new Map<string, number>();
  grants.forEach((decision, index) => {
    offsets.set(decision.id, LAYOUT.lane.offset + index * LAYOUT.lane.step);
  });
  ups.forEach((decision, index) => {
    offsets.set(decision.id, -(LAYOUT.lane.offset + index * LAYOUT.lane.step));
  });
  return offsets;
}

/** The base tree-edge polyline: down out of the parent, across the bus, down into the child. */
function edgePoints(parent: NodeLayout, child: NodeLayout, busY: number, offset: number): Point[] {
  const from = bottomCenter(parent);
  const to = topCenter(child);
  return [
    { x: from.x + offset, y: from.y },
    { x: from.x + offset, y: busY + offset },
    { x: to.x + offset, y: busY + offset },
    { x: to.x + offset, y: to.y },
  ];
}

/**
 * Choose the side of a lane on which a chip has more room, measured against the
 * neighbouring boxes on the chip's own level (§4.4 finding 3: place the chip on
 * the side away from the nearest sibling box).
 */
function chipSide(geometry: TreeGeometry, node: NodeLayout, x: number): 'start' | 'end' {
  const sameLevel = geometry.nodes.filter((other) => other.depth === node.depth && other.id !== node.id);
  const leftLimit = Math.max(
    geometry.left - 60,
    ...sameLevel.filter((other) => other.box.x + other.box.width <= x).map((other) => other.box.x + other.box.width),
  );
  const rightLimit = Math.min(
    geometry.right + 60,
    ...sameLevel.filter((other) => other.box.x >= x).map((other) => other.box.x),
  );
  return x - leftLimit >= rightLimit - x ? 'end' : 'start';
}

/** Lay out every lane, dot and chip of the universe. */
export function layoutPropagation(
  context: DiagramContext,
  geometry: TreeGeometry,
): PropagationLayout {
  const { tree } = context;
  const decisions = enumerateDecisions(context);
  const edges = treeEdges(context);
  const offsetsByEdge = new Map<string, Map<string, number>>();
  for (const edge of edges) {
    offsetsByEdge.set(`${edge.parent}->${edge.child}`, laneOffsets(tree, edge, decisions));
  }

  const nodeOf = (id: ModuleId): NodeLayout => {
    const node = geometry.nodeById.get(id);
    if (node === undefined) {
      throw new Error(`No layout for module "${id}".`);
    }
    return node;
  };
  const busOf = (depth: number): number => {
    const busY = geometry.levels[depth]?.busY;
    if (busY === null || busY === undefined) {
      throw new Error(`Level ${String(depth)} has no bus line.`);
    }
    return busY;
  };

  const edgeLayouts: TreeEdgeLayout[] = edges.map((edge) => {
    const parent = nodeOf(edge.parent);
    const child = nodeOf(edge.child);
    const busY = busOf(parent.depth);
    return {
      id: `edge-${edge.parent}-${edge.child}`,
      parent: edge.parent,
      child: edge.child,
      d: polyline(edgePoints(parent, child, busY, 0)),
      busY,
    };
  });

  const lanes: LanePath[] = [];
  for (const edge of edges) {
    const parent = nodeOf(edge.parent);
    const child = nodeOf(edge.child);
    const busY = busOf(parent.depth);
    const offsets = offsetsByEdge.get(`${edge.parent}->${edge.child}`) as Map<string, number>;

    for (const decision of decisions) {
      const offset = offsets.get(decision.id);
      if (offset === undefined) {
        continue;
      }
      const points = edgePoints(parent, child, busY, offset);
      if (decision.kind === 'grant') {
        lanes.push({
          id: `lane-${decision.id}-${edge.parent}-${edge.child}`,
          decisionId: decision.id,
          kind: 'grant',
          layer: decision.layer,
          color: decision.color,
          parent: edge.parent,
          child: edge.child,
          offset,
          d: polyline(points),
          head: 'chevron',
          headAt: points[points.length - 1] as Point,
          reaches: edge.child,
          symbols: decision.symbols,
        });
      } else {
        const reversed = [...points].reverse();
        lanes.push({
          id: `lane-${decision.id}-${edge.child}-${edge.parent}`,
          decisionId: decision.id,
          kind: 'up-hop',
          layer: decision.layer,
          color: decision.color,
          parent: edge.parent,
          child: edge.child,
          offset,
          d: polyline(reversed),
          head: 'arrow',
          headAt: reversed[reversed.length - 1] as Point,
          reaches: edge.parent,
          symbols: decision.symbols,
        });
      }
    }
  }

  // One dot per decision, never one per hop reached.
  const dots: DecisionDot[] = decisions.map((decision) => {
    const decider = nodeOf(decision.decider);
    if (decision.kind === 'grant') {
      const firstChild = requireModuleRecord(tree, decision.decider).children[0];
      if (firstChild === undefined) {
        throw new Error(`Module "${decision.decider}" grants to descendants but has no children.`);
      }
      const offset =
        offsetsByEdge.get(`${decision.decider}->${firstChild}`)?.get(decision.id) ?? LAYOUT.lane.offset;
      const from = bottomCenter(decider);
      return {
        id: `dot-${decision.id}`,
        decisionId: decision.id,
        layer: decision.layer,
        color: decision.color,
        at: { x: from.x + offset, y: from.y },
        decider: decision.decider,
        kind: 'grant',
        policyId: decision.policyId,
      };
    }
    const parent = requireModuleRecord(tree, decision.decider).parent;
    if (parent === null) {
      throw new Error(`Module "${decision.decider}" exposes to a parent it does not have.`);
    }
    const offset =
      offsetsByEdge.get(`${parent}->${decision.decider}`)?.get(decision.id) ?? -LAYOUT.lane.offset;
    const to = topCenter(decider);
    return {
      id: `dot-${decision.id}`,
      decisionId: decision.id,
      layer: decision.layer,
      color: decision.color,
      at: { x: to.x + offset, y: to.y },
      decider: decision.decider,
      kind: 'up-hop',
      policyId: decision.policyId,
    };
  });

  // A chip at each lane's origin and at each branch point (§3.4).
  const chips: LaneChip[] = [];
  const stackAt = new Map<string, number>();

  /**
   * The span the whole lane ribbon occupies where it meets a node, so a chip
   * can be placed clear of it. Chips are the diagram's redundancy against
   * color; a chip struck through by the lane it names is worse than no chip.
   */
  const ribbonSpan = (edges: readonly string[]): { min: number; max: number } => {
    const offsets = edges.flatMap((key) => [...(offsetsByEdge.get(key)?.values() ?? [])]);
    return { min: Math.min(0, ...offsets), max: Math.max(0, ...offsets) };
  };
  const CHIP_CLEARANCE = 8;

  for (const decision of decisions) {
    if (decision.kind === 'up-hop') {
      const child = nodeOf(decision.decider);
      const parent = requireModuleRecord(tree, decision.decider).parent as ModuleId;
      const span = ribbonSpan([`${parent}->${decision.decider}`]);
      const at = topCenter(child);
      chips.push({
        id: `chip-${decision.id}-${decision.decider}`,
        decisionId: decision.id,
        layer: decision.layer,
        color: decision.color,
        lines: [decision.chipText],
        x: at.x + span.min - CHIP_CLEARANCE,
        y: at.y - 11,
        anchor: 'end',
        at: decision.decider,
      });
      continue;
    }

    const branchPoints = [decision.decider, ...descendantsOf(tree, decision.decider)].filter(
      (id) => requireModuleRecord(tree, id).children.length >= 2,
    );
    for (const branch of branchPoints) {
      const node = nodeOf(branch);
      const childEdges = requireModuleRecord(tree, branch).children.map((child) => `${branch}->${child}`);
      const firstChild = requireModuleRecord(tree, branch).children[0] as ModuleId;
      if (offsetsByEdge.get(`${branch}->${firstChild}`)?.get(decision.id) === undefined) {
        continue;
      }
      const from = bottomCenter(node);
      const anchor = chipSide(geometry, node, from.x);
      // Every lane leaving this node converges on its bottom edge, so the chip
      // clears the whole ribbon, not just its own lane.
      const span = ribbonSpan(childEdges);
      const x = from.x + (anchor === 'end' ? span.min - CHIP_CLEARANCE : span.max + CHIP_CLEARANCE);
      const sameLevel = geometry.nodes.filter((other) => other.depth === node.depth && other.id !== node.id);
      const room =
        anchor === 'end'
          ? x -
            Math.max(
              geometry.left - 60,
              ...sameLevel
                .filter((other) => other.box.x + other.box.width <= x)
                .map((other) => other.box.x + other.box.width),
            )
          : Math.min(
              geometry.right + 60,
              ...sameLevel.filter((other) => other.box.x >= x).map((other) => other.box.x),
            ) - x;
      const maxChars = Math.max(6, Math.floor((room - 10) / LAYOUT.lane.chipCharWidth));
      const lines = wrapText(decision.chipText, maxChars, LAYOUT.lane.chipMaxLines);
      const stackKey = branch;
      const used = stackAt.get(stackKey) ?? 0;
      chips.push({
        id: `chip-${decision.id}-${branch}`,
        decisionId: decision.id,
        layer: decision.layer,
        color: decision.color,
        lines,
        x,
        y: from.y + 11 + used,
        anchor,
        at: branch,
      });
      stackAt.set(stackKey, used + lines.length * 11 + 3);
    }
  }

  return { decisions, edges: edgeLayouts, lanes, dots, chips };
}

