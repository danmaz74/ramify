import type { ExecutionLink, ExecutionNode } from '../../harness/src/interfaces/protocol/execution-map.js';

export const runBandKey = 'run-band';
export interface ExecutionPlacement { readonly key: string; readonly parent: string | null; readonly x: number; readonly y: number; readonly depth: number }
export interface ExecutionLayout { readonly placements: readonly ExecutionPlacement[]; readonly references: readonly ExecutionLink[]; readonly hidden: ReadonlySet<string>; readonly hiddenCount: ReadonlyMap<string, number> }

/** Choose one presentation parent. Every other causal relation stays a reference edge. */
export function executionLayout(nodes: readonly ExecutionNode[], links: readonly ExecutionLink[], collapsed: ReadonlySet<string>): ExecutionLayout {
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
  let row = 0;
  const visit = (key: string, depth: number, ancestorCollapsed = false): number => {
    const concealed = ancestorCollapsed || collapsed.has(key);
    const descendants = children.get(key) ?? [];
    const start = row;
    if (key !== runBandKey && ancestorCollapsed) hidden.add(key);
    if (!concealed) {
      if (key !== runBandKey) row++;
      for (const child of descendants) visit(child, depth + 1);
    } else {
      const stack = [...descendants];
      let count = 0;
      while (stack.length) { const child = stack.pop()!; hidden.add(child); count++; stack.push(...(children.get(child) ?? [])); }
      hiddenCount.set(key, count);
      if (key !== runBandKey && !ancestorCollapsed) row++;
    }
    if (key !== runBandKey && !ancestorCollapsed) placements.push({ key, parent: parents.get(key) ?? null,
      x: depth * 310, y: start * 128, depth });
    return row;
  };
  // The run band starts the canvas. Entry roots follow in source order.
  placements.push({ key: runBandKey, parent: null, x: 0, y: 0, depth: 0 });
  row = 1;
  for (const child of children.get(runBandKey) ?? []) visit(child, 1);
  return { placements, references: links.filter(link => !primaryLinks.has(link.id)), hidden, hiddenCount };
}
