import type {
  CheckFindingApplied, CheckFindingDecision, CheckFindingEntry, CheckFindingEvent, CheckFindingReplay,
  CheckFindingReport, CheckFindingState,
} from './interfaces/check-findings.js';
import { checkFindingId, decisionId, ingestionKey, relationId, reportId, scopedIssueKey } from './identity.js';

/*
 * Replay: the state accepted events derive. Each event is checked only for
 * what makes the history consistent (its IDs are the next ones, its revision
 * follows, what it names exists); whether a decision was allowed was settled
 * when it was decided, and the log holds only what was accepted. Standing,
 * reason, pending request and planned repair are derived here and nowhere
 * else, so a rebuilt projection and a live one cannot differ.
 */

/** The state before any event. */
export function emptyCheckFindingState(): CheckFindingState {
  return {
    applied: 0,
    findings: new Map(),
    ingested: new Map(),
    relations: [],
    counters: { findings: 0, reports: 0, decisions: 0, relations: 0 },
  };
}

function conflict(message: string): CheckFindingApplied {
  return { ok: false, rejection: { code: 'replay-conflict', message } };
}

/** Applies one accepted event. The given state is never changed. */
export function applyCheckFindingEvent(state: CheckFindingState, event: CheckFindingEvent): CheckFindingApplied {
  switch (event.type) {
    case 'check-finding-opened': {
      const { checkFinding, report } = event.data;
      const expected = checkFindingId(state.counters.findings + 1);
      if (checkFinding !== expected) return conflict(`check-finding-opened allocates ${checkFinding}, but the next CheckFinding is ${expected}`);
      const reportCheck = checkReport(state, report);
      if (reportCheck !== null) return conflict(reportCheck);
      const entry: CheckFindingEntry = {
        id: checkFinding,
        revision: 1,
        owner: report.owner,
        verification: report.verification,
        standing: 'open',
        reason: 'new',
        reports: [report],
        decisions: [],
        issueKeys: report.issueKey === null ? [] : [scopedIssueKey(report.owner, report.verification, report.issueKey)],
        pendingUserDecision: null,
        repair: null,
        settledBy: null,
      };
      return {
        ok: true,
        state: {
          ...withReport(state, entry, report),
          counters: { ...state.counters, findings: state.counters.findings + 1, reports: state.counters.reports + 1 },
        },
      };
    }
    case 'check-finding-reported': {
      const { checkFinding, revision, report } = event.data;
      const entry = state.findings.get(checkFinding);
      if (entry === undefined) return conflict(`check-finding-reported names ${checkFinding}, which is no CheckFinding`);
      if (revision !== entry.revision + 1) return conflict(`check-finding-reported moves ${checkFinding} to revision ${revision}, but it is at ${entry.revision}`);
      const reportCheck = checkReport(state, report);
      if (reportCheck !== null) return conflict(reportCheck);
      const scoped = report.issueKey === null ? null : scopedIssueKey(entry.owner, entry.verification, report.issueKey);
      if (scoped === null || !entry.issueKeys.includes(scoped)) {
        return conflict(`check-finding-reported attaches ${report.id} to ${checkFinding}, whose issue keys do not include the report's`);
      }
      const next: CheckFindingEntry = { ...entry, revision, reports: [...entry.reports, report] };
      return {
        ok: true,
        state: { ...withReport(state, next, report), counters: { ...state.counters, reports: state.counters.reports + 1 } },
      };
    }
    case 'check-finding-decided': {
      const { checkFinding, revision, decision } = event.data;
      const entry = state.findings.get(checkFinding);
      if (entry === undefined) return conflict(`check-finding-decided names ${checkFinding}, which is no CheckFinding`);
      if (revision !== entry.revision + 1 || decision.considered !== entry.revision) {
        return conflict(`check-finding-decided moves ${checkFinding} from ${decision.considered} to ${revision}, but it is at ${entry.revision}`);
      }
      const expected = decisionId(state.counters.decisions + 1);
      if (decision.id !== expected) return conflict(`check-finding-decided allocates ${decision.id}, but the next decision is ${expected}`);
      const findings = new Map(state.findings);
      findings.set(checkFinding, decided({ ...entry, revision, decisions: [...entry.decisions, decision] }, decision));
      return {
        ok: true,
        state: { ...state, applied: state.applied + 1, findings, counters: { ...state.counters, decisions: state.counters.decisions + 1 } },
      };
    }
    case 'check-finding-related': {
      const { relation } = event.data;
      const expected = relationId(state.counters.relations + 1);
      if (relation.id !== expected) return conflict(`check-finding-related allocates ${relation.id}, but the next relation is ${expected}`);
      for (const side of [relation.from, relation.to]) {
        if (!state.findings.has(side.checkFinding)) return conflict(`check-finding-related names ${side.checkFinding}, which is no CheckFinding`);
      }
      return {
        ok: true,
        state: {
          ...state,
          applied: state.applied + 1,
          relations: [...state.relations, relation],
          counters: { ...state.counters, relations: state.counters.relations + 1 },
        },
      };
    }
  }
}

/** Replays a sequence of accepted events from the empty state; the first it cannot accept ends it. */
export function replayCheckFindingEvents(events: readonly CheckFindingEvent[], from: CheckFindingState = emptyCheckFindingState()): CheckFindingReplay {
  let state = from;
  for (const [index, event] of events.entries()) {
    const applied = applyCheckFindingEvent(state, event);
    if (!applied.ok) return { ok: false, rejection: applied.rejection, event: index };
    state = applied.state;
  }
  return { ok: true, state };
}

/** Why a report cannot be the next one, or null. */
function checkReport(state: CheckFindingState, report: CheckFindingReport): string | null {
  const expected = reportId(state.counters.reports + 1);
  if (report.id !== expected) return `the event allocates report ${report.id}, but the next report is ${expected}`;
  if (state.ingested.has(ingestionKey(report))) return `report ${report.id} repeats an ingestion key already accepted`;
  return null;
}

function withReport(state: CheckFindingState, entry: CheckFindingEntry, report: CheckFindingReport): CheckFindingState {
  const findings = new Map(state.findings);
  findings.set(entry.id, entry);
  const ingested = new Map(state.ingested);
  ingested.set(ingestionKey(report), { checkFinding: entry.id, report: report.id, contentHash: report.contentHash });
  return { ...state, applied: state.applied + 1, findings, ingested };
}

/** The entry after one decision: its standing, reason, pending request, repair and verification. */
function decided(entry: CheckFindingEntry, decision: CheckFindingDecision): CheckFindingEntry {
  const action = decision.decision;
  const settled = { settledBy: decision.id } as const;
  switch (action.action) {
    case 'plan-repair':
      return { ...entry, standing: 'open', reason: 'repair-planned', repair: action.repair };
    case 'claim-repair':
      return { ...entry, standing: 'open', reason: 'repair-claimed' };
    case 'verify-by-check':
      return { ...entry, ...settled, standing: 'closed', reason: 'verified-by-check' };
    case 'verify-by-assessment':
      return { ...entry, ...settled, standing: 'closed', reason: 'verified-by-assessment' };
    case 'supersede':
      return { ...entry, ...settled, standing: 'closed', reason: 'superseded' };
    case 'accept':
      return { ...entry, ...settled, standing: 'closed', reason: 'accepted' };
    case 'defer':
      return { ...entry, ...settled, standing: 'deferred', reason: 'deferred' };
    case 'request-user-decision':
      return { ...entry, standing: 'open', reason: 'awaiting-user-decision', pendingUserDecision: decision.id };
    case 'answer-user-decision':
      return { ...entry, standing: 'open', reason: 'user-decision-answered', pendingUserDecision: null };
    case 'reopen':
      return { ...entry, standing: 'open', reason: 'reopened', repair: null, settledBy: null };
    case 'revise-obligation': {
      if (entry.verification.kind !== 'check') return entry;
      const verification = { ...entry.verification, obligation: action.to };
      // A later report of the revised obligation attaches here, under the
      // keys its reports carried; the keys of the old obligation remain.
      const revised = entry.reports.flatMap(report => (report.issueKey === null ? [] : [scopedIssueKey(entry.owner, verification, report.issueKey)]));
      const issueKeys = [...entry.issueKeys, ...revised.filter((key, index) => !entry.issueKeys.includes(key) && revised.indexOf(key) === index)];
      return { ...entry, standing: 'open', reason: 'obligation-revised', verification, issueKeys };
    }
  }
}
