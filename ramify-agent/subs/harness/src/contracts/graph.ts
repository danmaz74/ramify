/*
 * The dependency graph the harness checks when it commits a requirement.
 *
 * Its nodes are capabilities, never modules and never changes. A requirement
 * adds the edge from the capability its consumer is implementing to the
 * capability of its obligation. It is ordinary for change 1 in module A to
 * need change 2 in module B, which needs change 3 in module A: those are
 * three capabilities and three work items, and a new provider obligation
 * starts a work item of its own even in a module that already has one
 * yielded. Only a capability that transitively depends on itself is a cycle,
 * and no module identity enters the check.
 */

/** One edge: the consumer's capability depends on the provider's. */
export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly requirement: string;
  readonly workItem: string;
}

/** A capability that transitively depends on itself, with what forms it. */
export interface DependencyCycle {
  /** The capabilities of the cycle, rotated so the same cycle reads the same way. */
  readonly members: readonly string[];
  readonly requirements: readonly string[];
  readonly workItems: readonly string[];
}

/**
 * The cycle the new edge closes, or null when it closes none. The search
 * starts at the new edge's head and looks for a path back to its tail, so
 * the cycle returned is the one this registration created.
 */
export function cycleClosedBy(edges: readonly DependencyEdge[], added: DependencyEdge): DependencyCycle | null {
  if (added.from === added.to) return normalize([added]);

  const outgoing = new Map<string, DependencyEdge[]>();
  for (const edge of [...edges, added]) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  }

  const seen = new Set<string>([added.to]);
  const path: DependencyEdge[] = [added];

  const walk = (node: string): DependencyEdge[] | null => {
    for (const edge of outgoing.get(node) ?? []) {
      if (edge.to === added.from) return [...path, edge];
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      path.push(edge);
      const found = walk(edge.to);
      if (found !== null) return found;
      path.pop();
    }
    return null;
  };

  const found = walk(added.to);
  return found === null ? null : normalize(found);
}

/**
 * The same cycle written the same way: the members rotated to start at the
 * capability that sorts first, so that "the same cycle detected again" is a
 * comparison of two strings and not of two orders.
 */
export function normalize(edges: readonly DependencyEdge[]): DependencyCycle {
  const members = edges.map(edge => edge.from);
  let start = 0;
  for (const [index, member] of members.entries()) {
    if (member < members[start]!) start = index;
  }
  const rotated = [...members.slice(start), ...members.slice(0, start)];
  const rotatedEdges = [...edges.slice(start), ...edges.slice(0, start)];
  return {
    members: rotated,
    requirements: rotatedEdges.map(edge => edge.requirement),
    workItems: [...new Set(rotatedEdges.map(edge => edge.workItem))],
  };
}

/** The identity of one cycle: its members in their normalized order. */
export function cycleIdentity(cycle: DependencyCycle): string {
  return cycle.members.join(' → ');
}
