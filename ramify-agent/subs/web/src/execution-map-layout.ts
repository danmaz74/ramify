import type { ExecutionLink, ExecutionNode } from '../../harness/src/interfaces/protocol/execution-map.js';

export const runBandKey = 'run-band';
/** A card's width in pixels (styles.css `.execution-card`); columns are `columnWidth` apart, so cards of different columns never meet. */
export const cardWidth = 244;
export const columnWidth = 310;
/** The vertical space kept between two cards of the stack. */
export const cardGap = 24;
/** A card's height before the canvas has measured it; the measured height replaces it. */
export const estimatedCardHeight = 104;
export interface ExecutionPlacement { readonly key: string; readonly parent: string | null; readonly x: number; readonly y: number; readonly depth: number }
export interface ExecutionLayout { readonly placements: readonly ExecutionPlacement[]; readonly references: readonly ExecutionLink[]; readonly hidden: ReadonlySet<string>; readonly hiddenCount: ReadonlyMap<string, number> }
export type CardPosition = { readonly x: number; readonly y: number };

/**
 * Choose one presentation parent. Every other causal relation stays a reference edge.
 * Cards stack one per row, each row as tall as its card (`heightOf`) plus `cardGap`.
 */
export function executionLayout(nodes: readonly ExecutionNode[], links: readonly ExecutionLink[], collapsed: ReadonlySet<string>,
  heightOf: (key: string) => number = () => estimatedCardHeight): ExecutionLayout {
  const byKey = new Map(nodes.map(node => [node.key, node]));
  const parents = new Map<string, string>();
  const primaryLinks = new Set<string>();
  const ordered = [...nodes].sort((a, b) => (a.sourceRefs[0]?.sequence ?? Infinity) - (b.sourceRefs[0]?.sequence ?? Infinity) || a.key.localeCompare(b.key));
  const assign = (child: string, parent: string, linkId?: string) => {
    if (!byKey.has(child) || (parent !== runBandKey && !byKey.has(parent)) || child === parent || parents.has(child)) return;
    let cursor: string | undefined = parent;
    while (cursor && cursor !== runBandKey) { if (cursor === child) return; cursor = parents.get(cursor); }
    parents.set(child, parent);
    if (linkId) primaryLinks.add(linkId);
  };
  // Explicit typed membership takes precedence over presentation heuristics.
  for (const node of ordered) {
    if (node.kind === 'scenario' && node.entry) assign(node.key, node.entry);
    if (node.kind === 'requirement') assign(node.key, node.consumer);
    if (node.kind === 'iteration') assign(node.key, node.workItem);
  }
  for (const link of links) {
    if (link.from.coverage === 'unresolved' || link.to.coverage === 'unresolved') continue;
    const a = link.from.key, b = link.to.key;
    if (link.kind === 'started-for' || link.kind === 'tracks-scenario' || link.kind === 'assigned-iteration') assign(b, a, link.id);
    if (link.kind === 'session-for' || link.kind === 'gate-for') assign(a, b, link.id);
    if (link.kind === 'requested-by' || link.kind === 'established-by') assign(a, b, link.id);
    if (link.kind === 'proposed-by') assign(a, b, link.id);
  }
  for (const node of ordered) {
    if (node.kind === 'session' && node.workItem) assign(node.key, node.workItem);
    if (node.kind === 'gate' && node.subject.workItem) assign(node.key, node.subject.iteration && byKey.has(`iteration:${node.subject.iteration}`)
      ? `iteration:${node.subject.iteration}` : `work-item:${node.subject.workItem}`);
    if (!parents.has(node.key)) assign(node.key, runBandKey);
  }
  for (const link of links) {
    if (link.from.coverage === 'unresolved' || link.to.coverage === 'unresolved') continue;
    const a = link.from.key, b = link.to.key;
    if ((parents.get(b) === a && ['started-for', 'tracks-scenario', 'assigned-iteration'].includes(link.kind)) ||
        (parents.get(a) === b && ['session-for', 'gate-for', 'requested-by', 'established-by', 'proposed-by'].includes(link.kind))) {
      primaryLinks.add(link.id);
    }
  }
  const children = new Map<string, string[]>();
  for (const [child, parent] of parents) children.set(parent, [...(children.get(parent) ?? []), child]);
  const order = (key: string) => byKey.get(key)?.sourceRefs[0]?.sequence ?? Infinity;
  for (const list of children.values()) list.sort((a, b) => {
    const an = byKey.get(a), bn = byKey.get(b);
    if (an?.kind === 'iteration' && bn?.kind === 'iteration') return an.ordinal - bn.ordinal;
    return order(a) - order(b) || a.localeCompare(b);
  });
  const hidden = new Set<string>();
  const hiddenCount = new Map<string, number>();
  const placements: ExecutionPlacement[] = [];
  let cursor = 0;
  const visit = (key: string, depth: number, ancestorCollapsed = false) => {
    const concealed = ancestorCollapsed || collapsed.has(key);
    const descendants = children.get(key) ?? [];
    const y = cursor;
    if (key !== runBandKey && ancestorCollapsed) hidden.add(key);
    if (key !== runBandKey && !ancestorCollapsed) cursor += heightOf(key) + cardGap;
    if (!concealed) {
      for (const child of descendants) visit(child, depth + 1);
    } else {
      const stack = [...descendants];
      let count = 0;
      while (stack.length) { const child = stack.pop()!; hidden.add(child); count++; stack.push(...(children.get(child) ?? [])); }
      hiddenCount.set(key, count);
    }
    if (key !== runBandKey && !ancestorCollapsed) placements.push({ key, parent: parents.get(key) ?? null,
      x: depth * columnWidth, y, depth });
  };
  // The run band starts the canvas. Entry roots follow in source order.
  placements.push({ key: runBandKey, parent: null, x: 0, y: 0, depth: 0 });
  cursor = heightOf(runBandKey) + cardGap;
  for (const child of children.get(runBandKey) ?? []) visit(child, 1);
  return { placements, references: links.filter(link => !primaryLinks.has(link.id)), hidden, hiddenCount };
}

/**
 * Where each placed card is drawn. A card keeps its `kept` position across version updates; a card without one
 * takes its layout position, or the first free place below it in its column. A kept card moves only when a card
 * above it in its column has grown into it, and then just below that card. No two cards of a column meet.
 */
export function settlePositions(placements: readonly ExecutionPlacement[], kept: ReadonlyMap<string, CardPosition>,
  heightOf: (key: string) => number): Map<string, CardPosition> {
  const settled: { key: string; x: number; y: number; bottom: number }[] = [];
  const sameColumn = (x: number, other: { x: number }) => Math.abs(other.x - x) < cardWidth;
  const order = new Map(placements.map((p, index) => [p.key, index]));
  const keptCards = placements.filter(p => kept.has(p.key)).map(p => ({ key: p.key, ...kept.get(p.key)! }))
    .sort((a, b) => a.y - b.y || order.get(a.key)! - order.get(b.key)!);
  for (const card of keptCards) {
    const y = Math.max(card.y, ...settled.filter(other => sameColumn(card.x, other)).map(other => other.bottom + cardGap));
    settled.push({ key: card.key, x: card.x, y, bottom: y + heightOf(card.key) });
  }
  for (const p of placements) if (!kept.has(p.key)) {
    const height = heightOf(p.key);
    let y = p.y;
    for (let meets = true; meets;) {
      const blocking = settled.filter(other => sameColumn(p.x, other) && other.y < y + height + cardGap && y < other.bottom + cardGap);
      meets = blocking.length > 0;
      if (meets) y = Math.max(...blocking.map(other => other.bottom + cardGap));
    }
    settled.push({ key: p.key, x: p.x, y, bottom: y + height });
  }
  return new Map(settled.map(card => [card.key, { x: card.x, y: card.y }]));
}
