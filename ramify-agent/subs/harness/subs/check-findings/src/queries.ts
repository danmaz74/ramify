import {
  checkFindingQueryLimits, checkFindingQuerySchema, checkFindingViewVersion,
  type CheckFindingAwaiting, type CheckFindingCounts, type CheckFindingEntry, type CheckFindingGroup,
  type CheckFindingId, type CheckFindingMaterialChoice, type CheckFindingProducer, type CheckFindingQuery,
  type CheckFindingQueryInput, type CheckFindingReason, type CheckFindingSelection, type CheckFindingStanding,
  type CheckFindingState, type CheckFindingSummary,
} from './interfaces/check-findings.js';
import { compareIds, sameOwner } from './identity.js';
import { currentRelations, sameIssueGroups } from './groups.js';

/*
 * Queries: bounded lists and one CheckFinding's detail, derived from the
 * replayed state alone. `attention` selects what a decision boundary must
 * consider: every open CheckFinding and every deferred one whose revisit the
 * harness found due. This module never evaluates a revisit condition or a
 * run phase; the caller supplies the due IDs.
 */

/** Selects a bounded list or one CheckFinding's detail. */
export function selectCheckFindings(state: CheckFindingState, input: CheckFindingQueryInput): CheckFindingSelection {
  const parsed = checkFindingQuerySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, rejection: { code: 'invalid-query', message: parsed.error.issues.map(issue => `${issue.path.join('.') || '(query)'}: ${issue.message}`).join('; ') } };
  }
  const query = parsed.data;
  const groups = sameIssueGroups(state.relations);
  if (query.kind === 'detail') return detail(state, groups, query.checkFinding);
  return list(state, groups, query);
}

function list(state: CheckFindingState, groups: readonly CheckFindingGroup[], query: Extract<CheckFindingQuery, { kind: 'list' }>): CheckFindingSelection {
  const unknown = query.due.find(id => !state.findings.has(id));
  if (unknown !== undefined) return { ok: false, rejection: { code: 'unknown-check-finding', message: `due names ${unknown}, which is no CheckFinding` } };
  const due = new Set(query.due);
  const owned = [...state.findings.values()]
    .filter(entry => query.owner === null || sameOwner(entry.owner, query.owner))
    .sort((a, b) => compareIds(a.id, b.id));
  const selected = owned.filter(entry => {
    if (query.select === 'attention') return attentionOf(entry, due) !== null;
    return query.standings === null || query.standings.includes(entry.standing);
  });
  const after = query.after;
  const remaining = after === null ? selected : selected.filter(entry => compareIds(entry.id, after) > 0);
  const page = remaining.slice(0, query.limit);
  const last = page.at(-1);
  return {
    ok: true,
    view: {
      kind: 'list',
      view: checkFindingViewVersion,
      applied: state.applied,
      total: selected.length,
      shown: page.length,
      next: remaining.length > page.length && last !== undefined ? last.id : null,
      counts: countsOf(owned),
      items: page.map(entry => summaryOf(entry, groups, due)),
    },
  };
}

function detail(state: CheckFindingState, groups: readonly CheckFindingGroup[], id: CheckFindingId): CheckFindingSelection {
  const entry = state.findings.get(id);
  if (entry === undefined) return { ok: false, rejection: { code: 'unknown-check-finding', message: `${id} is no CheckFinding` } };
  const bound = checkFindingQueryLimits.detailHistory;
  return {
    ok: true,
    view: {
      kind: 'detail',
      view: checkFindingViewVersion,
      applied: state.applied,
      summary: summaryOf(entry, groups, new Set()),
      reports: { total: entry.reports.length, items: entry.reports.slice(-bound) },
      decisions: { total: entry.decisions.length, items: entry.decisions.slice(-bound) },
      relations: currentRelations(state.relations).filter(relation => relation.from.checkFinding === id || relation.to.checkFinding === id),
    },
  };
}

function attentionOf(entry: CheckFindingEntry, due: ReadonlySet<CheckFindingId>): 'open' | 'due' | null {
  if (entry.standing === 'open') return 'open';
  if (entry.standing === 'deferred' && due.has(entry.id)) return 'due';
  return null;
}

/** What an open CheckFinding waits for: a user, a witness for a check, a repair, or an assessment. */
function awaitingOf(entry: CheckFindingEntry): CheckFindingAwaiting | null {
  if (entry.standing !== 'open') return null;
  if (entry.pendingUserDecision !== null) return 'user-decision';
  if (entry.reason === 'repair-planned') return 'repair';
  if (entry.reason === 'repair-claimed' || entry.reason === 'obligation-revised') return entry.verification.kind === 'check' ? 'witness' : 'assessment';
  return 'assessment';
}

function summaryOf(entry: CheckFindingEntry, groups: readonly CheckFindingGroup[], due: ReadonlySet<CheckFindingId>): CheckFindingSummary {
  const [first] = entry.reports;
  const latest = entry.reports.at(-1);
  if (first === undefined || latest === undefined) throw new Error(`${entry.id} holds no report`);
  const producers = [...new Set(entry.reports.map(report => report.producer))] as CheckFindingProducer[];
  return {
    id: entry.id,
    revision: entry.revision,
    owner: entry.owner,
    standing: entry.standing,
    reason: entry.reason,
    awaiting: awaitingOf(entry),
    attention: attentionOf(entry, due),
    verification: entry.verification,
    producers,
    title: first.observation.summary,
    latestSource: latest.source,
    reports: entry.reports.length,
    decisions: entry.decisions.length,
    group: groups.find(group => group.members.includes(entry.id)) ?? null,
    pendingUserDecision: entry.pendingUserDecision,
    repair: entry.repair,
    materialChoice: materialChoiceOf(entry),
  };
}

/** The latest decision reported as a material choice since the CheckFinding was last reopened. */
function materialChoiceOf(entry: CheckFindingEntry): CheckFindingMaterialChoice | null {
  for (const decision of [...entry.decisions].reverse()) {
    if (decision.decision.action === 'reopen') return null;
    if (decision.communication.mode === 'report') {
      const { choice, uncertainty, reason } = decision.communication;
      return { decision: decision.id, action: decision.decision.action, choice, uncertainty, reason };
    }
  }
  return null;
}

function countsOf(entries: readonly CheckFindingEntry[]): CheckFindingCounts {
  const standings: Record<CheckFindingStanding, number> = { open: 0, deferred: 0, closed: 0 };
  const reasons: Partial<Record<CheckFindingReason, number>> = {};
  for (const entry of entries) {
    standings[entry.standing] += 1;
    reasons[entry.reason] = (reasons[entry.reason] ?? 0) + 1;
  }
  return { total: entries.length, standings, reasons };
}
