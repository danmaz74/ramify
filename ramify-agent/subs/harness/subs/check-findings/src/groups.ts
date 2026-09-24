import type { CheckFindingGroup, CheckFindingId, CheckFindingRelation } from './interfaces/check-findings.js';
import { compareIds } from './identity.js';

/*
 * Same-issue groups, derived from relation assessments. The latest
 * assessment of a pair is its current relation, so a later `distinct`
 * separates a pair an earlier `same-issue` joined. A group's canonical ID is
 * its earliest member. Grouping never merges histories or obligations: every
 * member keeps its own reports, decisions and verification.
 */

function pairKey(relation: CheckFindingRelation): string {
  const ids = [relation.from.checkFinding, relation.to.checkFinding].sort(compareIds);
  return ids.join('|');
}

/** The current relation of each assessed pair, in the order each was last assessed. */
export function currentRelations(relations: readonly CheckFindingRelation[]): CheckFindingRelation[] {
  const latest = new Map<string, CheckFindingRelation>();
  for (const relation of relations) {
    const key = pairKey(relation);
    latest.delete(key);
    latest.set(key, relation);
  }
  return [...latest.values()];
}

/** Every same-issue group of two or more members, ordered by canonical ID. */
export function sameIssueGroups(relations: readonly CheckFindingRelation[]): CheckFindingGroup[] {
  const parent = new Map<CheckFindingId, CheckFindingId>();
  const root = (id: CheckFindingId): CheckFindingId => {
    let current = id;
    for (let next = parent.get(current); next !== undefined && next !== current; next = parent.get(current)) current = next;
    return current;
  };
  for (const relation of currentRelations(relations)) {
    if (relation.relation !== 'same-issue') continue;
    for (const id of [relation.from.checkFinding, relation.to.checkFinding]) if (!parent.has(id)) parent.set(id, id);
    const [a, b] = [root(relation.from.checkFinding), root(relation.to.checkFinding)];
    if (a === b) continue;
    // The earlier ID stays the root, so the root is the canonical member.
    if (compareIds(a, b) < 0) parent.set(b, a);
    else parent.set(a, b);
  }
  const members = new Map<CheckFindingId, CheckFindingId[]>();
  for (const id of parent.keys()) {
    const canonical = root(id);
    members.set(canonical, [...(members.get(canonical) ?? []), id]);
  }
  return [...members.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([canonical, ids]) => ({ canonical, members: ids.sort(compareIds) }))
    .sort((a, b) => compareIds(a.canonical, b.canonical));
}
