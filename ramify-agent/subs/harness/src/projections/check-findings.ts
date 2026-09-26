import { selectCheckFindings } from '../../subs/check-findings/src/queries.js';
import type {
  CheckFindingActor, CheckFindingDecision, CheckFindingEntry, CheckFindingReport, CheckFindingState,
  CheckFindingSummary,
} from '../../subs/check-findings/src/interfaces/check-findings.js';
import { replayCheckFindingState } from '../check-findings/state.js';
import {
  checkFindingDetailSchema, checkFindingListResponseSchema, checkFindingModuleCountsSchema, checkFindingProtocolVersion,
  checkFindingWireLimits, reviewListResponseSchema,
  type CheckFindingActorView, type CheckFindingAttemptLink, type CheckFindingCountsView, type CheckFindingDecisionView,
  type CheckFindingDetail, type CheckFindingListResponse, type CheckFindingModuleCounts, type CheckFindingRepairLink,
  type CheckFindingReportView, type CheckFindingSelect, type CheckFindingSettlement, type CheckFindingSummaryView,
  type PendingUserDecision, type PlanDeviationView, type ReviewCoverageView, type ReviewListResponse, type ReviewRequestView,
  type UnresolvedReasonView, type UserCheckFindingCommandKind,
} from '../interfaces/protocol/check-findings.js';
import { reviewAttemptSchema, reviewRequestSchema, type ReviewAttempt, type ReviewRequest } from '../reviews/records.js';
import { reviewCoverage, reviewStateOf } from '../reviews/state.js';
import { terminalRunEvents, type RunEvent } from '../run/log.js';
import { ProjectionError, type RunView } from './inputs.js';
import { planDeviationSchema, type PlanDeviation } from '../deviations/records.js';
import { currentDeviationDecision } from '../deviations/readiness-decision.js';
import { nonfunctionalDeviationSchema } from '../run/nonfunctional-records.js';

type DeviationRecord = PlanDeviation | ReturnType<typeof nonfunctionalDeviationSchema.parse>;

/*
 * The CheckFinding protocol's projections (appendix §8), pure over one
 * committed run view. The CheckFinding state is replayed from the log's
 * carriers exactly as the harness replays it; the child's own selection
 * orders it by risk, credibility and recency. Review coverage comes from the
 * review events, so a run whose policy requested no reviews reads as
 * unavailable, never as clean.
 *
 * Nothing here decides anything: the commands a person may send are the
 * ones the harness would accept for a user now, which the command path
 * checks again under the run's lock.
 */

/** A list query, as the HTTP adapter parsed it. */
export interface CheckFindingListQuery {
  readonly workItem: string | null;
  readonly module: string | null;
  readonly select: CheckFindingSelect;
  readonly order: 'attention' | 'id';
  readonly after: string | null;
  readonly limit: number;
}

/** What every projection here reads once per query. */
interface Basis {
  readonly view: RunView;
  readonly version: number;
  readonly state: CheckFindingState;
  readonly ended: boolean;
  /** The unresolved reason `work-item-completed` named, by CheckFinding. */
  readonly unresolved: ReadonlyMap<string, UnresolvedReasonView>;
  readonly completed: ReadonlySet<string>;
  readonly reviews: ReviewRecords;
  /** Every review request as the log derives it, in the order recorded. */
  readonly requests: ReturnType<typeof reviewStateOf>;
  /** Every plan deviation the log committed, by the CheckFinding that records it. */
  readonly deviations: ReadonlyMap<string, DeviationRecord>;
}

interface ReviewRecords {
  readonly requests: ReadonlyMap<string, ReviewRequest>;
  readonly attempts: ReadonlyMap<string, ReviewAttempt>;
  /** Whether every review record the log committed satisfies its schema. */
  readonly readable: boolean;
}

/** The version a query was read at: the run's last committed sequence. */
export function runVersionOf(view: RunView): number {
  return view.entries.at(-1)?.sequence ?? 0;
}

function basisOf(view: RunView): Basis {
  const unresolved = new Map<string, UnresolvedReasonView>();
  const completed = new Set<string>();
  for (const event of view.events) {
    if (event.type !== 'work-item-completed') continue;
    completed.add(event.data.workItem);
    for (const entry of event.data.unresolved ?? []) unresolved.set(entry.checkFinding, entry.reason);
  }
  return {
    view,
    version: runVersionOf(view),
    state: replayCheckFindingState(view.entries),
    ended: view.events.some(event => (terminalRunEvents as readonly string[]).includes(event.type)),
    unresolved,
    completed,
    reviews: reviewRecordsOf(view),
    requests: reviewStateOf(view.events),
    deviations: deviationsOf(view),
  };
}

function deviationsOf(view: RunView): Map<string, DeviationRecord> {
  const deviations = new Map<string, DeviationRecord>();
  for (const line of view.entries) {
    for (const record of line.transaction.records) {
      const schema = (record.body as { schema?: unknown } | null)?.schema;
      if (schema === 'ramify-agent.plan-deviation/1') {
        const parsed = planDeviationSchema.safeParse(record.body);
        if (parsed.success) deviations.set(parsed.data.checkFinding, parsed.data);
      } else if (schema === 'ramify-agent.nonfunctional-deviation/1'
        && line.transaction.event.type === 'nonfunctional-deviation-recorded') {
        const parsed = nonfunctionalDeviationSchema.safeParse(record.body);
        if (parsed.success && parsed.data.id === line.transaction.event.data.deviation
          && parsed.data.origin.nfr === line.transaction.event.data.nfr
          && parsed.data.origin.assessment === line.transaction.event.data.assessment
          && parsed.data.checkFinding === line.transaction.event.data.checkFinding) {
          deviations.set(parsed.data.checkFinding, parsed.data);
        }
      }
    }
  }
  return deviations;
}

function reviewRecordsOf(view: RunView): ReviewRecords {
  const requests = new Map<string, ReviewRequest>();
  const attempts = new Map<string, ReviewAttempt>();
  let readable = true;
  for (const line of view.entries) {
    for (const record of line.transaction.records) {
      const declared = (record.body as { schema?: unknown } | null)?.schema;
      if (declared === 'ramify-agent.review-request/1') {
        const parsed = reviewRequestSchema.safeParse(record.body);
        if (parsed.success) requests.set(parsed.data.id, parsed.data);
        else readable = false;
      } else if (declared === 'ramify-agent.review-attempt/1') {
        const parsed = reviewAttemptSchema.safeParse(record.body);
        if (parsed.success) attempts.set(parsed.data.id, parsed.data);
        else readable = false;
      }
    }
  }
  return { requests, attempts, readable };
}

function coverageOf(basis: Basis, workItem: string | null): ReviewCoverageView {
  const coverage = reviewCoverage(basis.view.record.policy, basis.view.events, workItem ?? undefined);
  if (coverage.state === 'available' && !basis.reviews.readable) return { state: 'unavailable', reason: 'records-unreadable' };
  return coverage;
}

/** Every CheckFinding summary the child selects for this owner and module, in the query's order. */
function ordered(basis: Basis, query: Pick<CheckFindingListQuery, 'workItem' | 'module' | 'order'>): CheckFindingSummary[] {
  const all: CheckFindingSummary[] = [];
  let after: string | null = null;
  for (;;) {
    const selected = selectCheckFindings(basis.state, {
      kind: 'list',
      owner: query.workItem === null ? null : { kind: 'work-item', workItem: query.workItem },
      module: query.module,
      select: 'all',
      order: query.order,
      after,
      limit: checkFindingWireLimits.maxLimit,
    });
    if (!selected.ok || selected.view.kind !== 'list') {
      throw new ProjectionError('unreadable', `The run's CheckFindings could not be selected: ${selected.ok ? 'not a list' : selected.rejection.message}`);
    }
    all.push(...selected.view.items);
    if (selected.view.next === null) return all;
    after = selected.view.next;
  }
}

/** A bounded, ordered page of a run's CheckFindings. */
export function checkFindingListOf(view: RunView, query: CheckFindingListQuery): CheckFindingListResponse {
  const basis = basisOf(view);
  const all = ordered(basis, query);
  if (query.after !== null && !all.some(summary => summary.id === query.after)) {
    throw new ProjectionError('invalid-request', `"after" names ${query.after}, which is not a CheckFinding of this selection's owner and module`);
  }
  const summaries = all.map(summary => summaryView(basis, summary));
  const selected = summaries.filter(summary => selects(query.select, summary));
  const start = query.after === null ? 0 : all.findIndex(summary => summary.id === query.after) + 1;
  // The cursor is a position in the order: the page continues after it even when it has left the selection.
  const remaining = selected.filter(summary => all.findIndex(entry => entry.id === summary.id) >= start);
  const page = remaining.slice(0, query.limit);
  return checkFindingListResponseSchema.parse({
    protocol: checkFindingProtocolVersion,
    runId: view.record.jobId,
    version: basis.version,
    coverage: coverageOf(basis, query.workItem),
    query: { workItem: query.workItem, module: query.module, select: query.select, order: query.order },
    total: selected.length,
    shown: page.length,
    next: remaining.length > page.length ? page.at(-1)!.id : null,
    counts: countsOf(summaries),
    items: page,
  });
}

function selects(select: CheckFindingSelect, summary: CheckFindingSummaryView): boolean {
  if (select === 'all') return true;
  if (summary.standing === 'open') return true;
  return select === 'reported' && summary.materialChoice !== null;
}

function countsOf(summaries: readonly CheckFindingSummaryView[]): CheckFindingCountsView {
  const standing = (value: string) => summaries.filter(summary => summary.standing === value).length;
  const reason = (...values: string[]) => summaries.filter(summary => values.includes(summary.reason)).length;
  return {
    total: summaries.length,
    open: standing('open'),
    deferred: standing('deferred'),
    closed: standing('closed'),
    fixed: reason('fixed-by-check', 'fixed-by-assessment'),
    waived: reason('waived'),
    superseded: reason('superseded'),
    unresolved: summaries.filter(summary => summary.unresolved !== null).length,
    awaitingUser: summaries.filter(summary => summary.pendingUserDecision !== null).length,
  };
}

/** Every module a CheckFinding concerns, with its unsettled CheckFindings. */
export function checkFindingModulesOf(view: RunView): CheckFindingModuleCounts {
  const basis = basisOf(view);
  const rows = new Map<string, { open: number; deferred: number; unresolved: number; highestOpenRisk: 'high' | 'medium' | 'low' | null; pendingUserDecisions: number }>();
  const rank = { high: 0, medium: 1, low: 2 } as const;
  for (const summary of ordered(basis, { workItem: null, module: null, order: 'id' }).map(entry => summaryView(basis, entry))) {
    for (const module of summary.modules) {
      const row = rows.get(module) ?? { open: 0, deferred: 0, unresolved: 0, highestOpenRisk: null, pendingUserDecisions: 0 };
      if (summary.standing === 'open') {
        row.open += 1;
        if (row.highestOpenRisk === null || rank[summary.risk] < rank[row.highestOpenRisk]) row.highestOpenRisk = summary.risk;
      }
      if (summary.standing === 'deferred') row.deferred += 1;
      if (summary.unresolved !== null) row.unresolved += 1;
      if (summary.pendingUserDecision !== null) row.pendingUserDecisions += 1;
      rows.set(module, row);
    }
  }
  return checkFindingModuleCountsSchema.parse({
    protocol: checkFindingProtocolVersion,
    runId: view.record.jobId,
    version: basis.version,
    coverage: coverageOf(basis, null),
    modules: [...rows.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([module, row]) => ({ module, ...row })),
  });
}

/** One CheckFinding with its bounded history, its relations and what it links to. */
export function checkFindingDetailOf(view: RunView, checkFinding: string): CheckFindingDetail {
  const basis = basisOf(view);
  const selected = selectCheckFindings(basis.state, { kind: 'detail', checkFinding });
  if (!selected.ok || selected.view.kind !== 'detail') throw new ProjectionError('not-found', `No CheckFinding ${checkFinding} in run ${view.record.jobId}`);
  const detail = selected.view;
  const entry = basis.state.findings.get(detail.summary.id)!;
  return checkFindingDetailSchema.parse({
    protocol: checkFindingProtocolVersion,
    runId: view.record.jobId,
    version: basis.version,
    summary: summaryView(basis, detail.summary),
    reports: { total: detail.reports.total, items: detail.reports.items.map(reportView) },
    decisions: { total: detail.decisions.total, items: detail.decisions.items.map(decisionView) },
    relations: detail.relations.map(relation => ({
      id: relation.id, from: relation.from, to: relation.to, relation: relation.relation,
      by: actorView(relation.actor), shared: relation.shared, rationale: relation.rationale,
    })),
    attempts: attemptLinks(basis, entry),
    repairs: repairLinks(basis, entry),
  });
}

/** A bounded page of a run's review requests, of one work item when named, in the order they were recorded. */
export function reviewListOf(view: RunView, query: { readonly workItem: string | null; readonly after: string | null; readonly limit: number }): ReviewListResponse {
  const basis = basisOf(view);
  const all = [...basis.requests.values()].filter(request => query.workItem === null || request.workItem === query.workItem);
  const start = query.after === null ? 0 : all.findIndex(request => request.id === query.after) + 1;
  if (query.after !== null && start === 0) throw new ProjectionError('invalid-request', `"after" names ${query.after}, which is not a review request of this selection`);
  const page = all.slice(start, start + query.limit);
  const requests: ReviewRequestView[] = page.map(request => {
    const record = basis.reviews.requests.get(request.id);
    const settling = request.attempts.find(attempt => attempt.id === request.settledBy);
    return {
      id: request.id,
      workItem: request.workItem,
      iteration: request.iteration,
      kind: request.kind,
      gate: request.gate,
      base: record?.base ?? null,
      candidate: request.candidate,
      recordedAt: request.recordedAt,
      result: settling?.finished?.result ?? null,
      settledBy: request.settledBy,
      attempts: request.attempts.map(attempt => {
        const body = basis.reviews.attempts.get(attempt.id);
        const result = body?.result;
        return {
          id: attempt.id,
          state: attempt.finished !== null ? 'finished' : attempt.started !== null ? 'running' : 'queued',
          invocation: body?.invocation ?? attempt.started?.invocation ?? null,
          session: body?.session ?? attempt.started?.session ?? null,
          requestedStart: body?.requestedStart ?? null,
          actualStart: body?.actualStart ?? null,
          result: attempt.finished?.result ?? null,
          reason: attempt.finished?.reason ?? null,
          detail: result?.result === 'not-verified' ? result.detail : null,
          inspected: result === undefined || result.result === 'not-verified' ? 0 : result.inspected.length,
          missing: result?.result === 'partial' ? result.missing.length : 0,
          concerns: result === undefined || result.result === 'not-verified' ? 0 : result.concerns,
          settles: attempt.finished?.settles ?? false,
          checkFindings: body?.checkFindings ?? [],
        };
      }),
    };
  });
  return reviewListResponseSchema.parse({
    protocol: checkFindingProtocolVersion,
    runId: view.record.jobId,
    version: basis.version,
    coverage: coverageOf(basis, query.workItem),
    workItem: query.workItem,
    total: all.length,
    shown: requests.length,
    next: start + page.length < all.length ? page.at(-1)!.id : null,
    requests,
  });
}

// Summaries.

function summaryView(basis: Basis, summary: CheckFindingSummary): CheckFindingSummaryView {
  const entry = basis.state.findings.get(summary.id)!;
  const workItem = summary.owner.kind === 'work-item' ? summary.owner.workItem : null;
  const unresolved = unresolvedOf(basis, summary, workItem);
  const pending = pendingOf(entry);
  const settlement = settlementOf(entry);
  const verification = summary.verification;
  const required = verification.kind === 'check' && verification.required;
  return {
    id: summary.id,
    revision: summary.revision,
    workItem,
    standing: summary.standing,
    reason: summary.reason,
    awaiting: summary.awaiting,
    verification: verification.kind,
    obligation: verification.kind === 'check' ? `${verification.obligation.subject}@${verification.obligation.revision}` : null,
    required,
    risk: summary.risk,
    credibility: summary.credibility,
    modules: [...summary.modules],
    unresolved,
    latestReview: unresolved !== null && summary.risk !== 'low' && (unresolved === 'raised-after-last-round' || firstInLatestReview(basis, entry, workItem)),
    settlement,
    pendingUserDecision: pending,
    materialChoice: summary.materialChoice === null ? null : {
      decision: summary.materialChoice.decision,
      action: summary.materialChoice.action,
      choice: summary.materialChoice.choice,
      uncertainty: summary.materialChoice.uncertainty,
      reason: summary.materialChoice.reason,
    },
    repair: summary.repair,
    producers: [...summary.producers],
    title: summary.title,
    reports: summary.reports,
    decisions: summary.decisions,
    group: summary.group === null ? null : { canonical: summary.group.canonical, members: [...summary.group.members] },
    userCommands: userCommandsOf(basis, summary, required, settlement),
    planDeviation: deviationView(basis, entry),
  };
}

/** The plan deviation a CheckFinding records, with the person's rejection where they answered one. */
function deviationView(basis: Basis, entry: CheckFindingEntry): PlanDeviationView | null {
  const deviation = basis.deviations.get(entry.id);
  if (deviation === undefined) return null;
  const current = currentDeviationDecision(entry);
  const rejected = current?.standing === 'rejected' ? current.followUp : null;
  if ('origin' in deviation) return {
    id: deviation.id,
    origin: deviation.origin,
    element: { id: deviation.element.id, document: deviation.element.document, text: deviation.element.text },
    sourcePath: entry.reports[0]?.source.kind === 'document'
      ? entry.reports[0].source.id.replace(/@sha256:[0-9a-f]{64}$/u, '') : null,
    evidence: [...deviation.evidence],
    proposedAlternative: deviation.proposedAlternative,
    uncertainty: deviation.uncertainty,
    followUp: rejected,
  };
  return {
    id: deviation.id,
    origin: { kind: 'work-item-conflict', request: deviation.request, workItem: deviation.workItem,
      architectInvocation: deviation.invocation },
    request: deviation.request,
    workItems: [...deviation.workItems],
    plan: deviation.plan.path,
    amends: deviation.amends.map(element => ({ id: element.id, path: element.path, text: element.text })),
    instead: deviation.instead,
    why: deviation.why,
    rejected: deviation.rejected.map(entry => ({ ...entry })),
    loss: deviation.loss,
    scenarios: deviation.scenarios.map(scenario => ({ scenario: scenario.scenario, file: scenario.file, before: [...scenario.before], after: [...scenario.after] })),
    held: deviation.held,
    followUp: rejected,
  };
}

/**
 * Why an open signal of a completed work item was left open: the reason its
 * `work-item-completed` named, or, for one opened or reopened after that
 * completion's basis, `raised-after-last-round`.
 */
function unresolvedOf(basis: Basis, summary: CheckFindingSummary, workItem: string | null): UnresolvedReasonView | null {
  if (summary.standing !== 'open' || workItem === null || !basis.completed.has(workItem)) return null;
  return basis.unresolved.get(summary.id) ?? 'raised-after-last-round';
}

/** Whether a CheckFinding's first report came from a review of its work item's latest reviewed iteration. */
function firstInLatestReview(basis: Basis, entry: CheckFindingEntry, workItem: string | null): boolean {
  if (workItem === null) return false;
  const first = entry.reports[0];
  if (first === undefined || !first.producer.startsWith('review:')) return false;
  const requests = basis.requests;
  const latest = [...requests.values()].filter(request => request.workItem === workItem).at(-1);
  const own = requests.get(requestOf(first.attempt));
  return latest !== undefined && own !== undefined && own.iteration === latest.iteration;
}

/** A review attempt's request: `rq-0001` of `rq-0001.a01`. */
function requestOf(attempt: string): string {
  const at = attempt.lastIndexOf('.a');
  return at < 0 ? attempt : attempt.slice(0, at);
}

function pendingOf(entry: CheckFindingEntry): PendingUserDecision | null {
  if (entry.pendingUserDecision === null) return null;
  const request = entry.decisions.find(decision => decision.id === entry.pendingUserDecision);
  if (request === undefined || request.decision.action !== 'request-user-decision') return null;
  return {
    request: request.id,
    by: actorView(request.actor),
    rationale: request.rationale,
    conflicts: request.decision.conflicts.map(conflict => ({ ...conflict })),
    options: request.decision.options.map(option => ({ ...option })),
  };
}

/** How a closed or deferred CheckFinding was settled, from the decision that settled it. */
function settlementOf(entry: CheckFindingEntry): CheckFindingSettlement | null {
  if (entry.standing === 'open' || entry.settledBy === null) return null;
  const decision = entry.decisions.find(candidate => candidate.id === entry.settledBy);
  if (decision === undefined) return null;
  const by = actorView(decision.actor);
  const action = decision.decision;
  switch (action.action) {
    case 'fix-by-check':
      return { kind: 'fixed-by-check', decision: decision.id, by, witness: witnessView(action.witness) };
    case 'fix-by-assessment':
      return { kind: 'fixed-by-assessment', decision: decision.id, by, rationale: decision.rationale };
    case 'supersede':
      return { kind: 'superseded', decision: decision.id, by, replacement: action.replacement };
    case 'waive':
      return { kind: 'waived', decision: decision.id, by, reason: decision.rationale, acceptedRisk: action.acceptedRisk, uncertainty: action.uncertainty };
    case 'defer':
      return { kind: 'deferred', decision: decision.id, by, reason: decision.rationale, revisit: action.revisit.kind === 'condition' ? action.revisit.condition : `follow-up ${action.revisit.ref}` };
    default:
      return null;
  }
}

/**
 * The commands a user may send now, as the command path would accept them:
 * none once the run has ended, except about a plan deviation, whose pending
 * request a waiver answers too; an answer to a pending request; a waiver of
 * an open or deferred signal that is no required check and awaits no
 * answer; a revocation of a waiver, whoever made it.
 */
function userCommandsOf(basis: Basis, summary: CheckFindingSummary, required: boolean, settlement: CheckFindingSettlement | null): UserCheckFindingCommandKind[] {
  const deviation = basis.deviations.has(summary.id);
  if (basis.ended && !deviation) return [];
  if (summary.pendingUserDecision !== null) return deviation ? ['respond', 'waive'] : ['respond'];
  if (summary.reason === 'waived' && settlement?.kind === 'waived') return ['revoke'];
  if (!required && (summary.standing === 'open' || summary.standing === 'deferred')) return ['waive'];
  return [];
}

// Detail.

function reportView(report: CheckFindingReport): CheckFindingReportView {
  return {
    id: report.id,
    producer: report.producer,
    attempt: report.attempt,
    source: { ...report.source },
    observation: {
      kind: report.observation.kind,
      summary: report.observation.summary,
      locations: report.observation.locations.map(location => ({ ...location })),
      evidence: report.observation.evidence.map(evidence => ({ kind: evidence.kind, ref: evidence.ref })),
    },
    judgment: report.judgment === null ? null : {
      by: actorView(report.judgment.actor),
      consequence: report.judgment.consequence,
      rationale: report.judgment.rationale,
      uncertainty: report.judgment.uncertainty,
      remedy: report.judgment.remedy,
      risk: report.judgment.risk,
      ground: report.judgment.ground?.ref ?? null,
    },
    credibility: report.credibility,
    modules: [...report.modules],
  };
}

function decisionView(decision: CheckFindingDecision): CheckFindingDecisionView {
  const authority = (value: { readonly kind: string; readonly ref: string }) => `${value.kind} ${value.ref}`;
  const obligation = (value: { readonly subject: string; readonly revision: number }) => `${value.subject}@${value.revision}`;
  const action = decision.decision;
  let view: CheckFindingDecisionView['action'];
  switch (action.action) {
    case 'plan-repair': view = { action: 'plan-repair', repair: { ...action.repair } }; break;
    case 'claim-repair': view = { action: 'claim-repair', candidate: { ...action.candidate }, change: action.change }; break;
    case 'fix-by-check': view = { action: 'fix-by-check', witness: witnessView(action.witness) }; break;
    case 'fix-by-assessment': view = { action: 'fix-by-assessment', reassessed: [...action.reassessed] }; break;
    case 'supersede': view = { action: 'supersede', reassessed: [...action.reassessed], replacement: action.replacement }; break;
    case 'waive': view = { action: 'waive', authority: authority(action.authority), acceptedRisk: action.acceptedRisk, uncertainty: action.uncertainty }; break;
    case 'revoke-waiver': view = { action: 'revoke-waiver', reason: action.reason }; break;
    case 'defer':
      view = { action: 'defer', authority: authority(action.authority), revisit: action.revisit.kind === 'condition' ? action.revisit.condition : `follow-up ${action.revisit.ref}` };
      break;
    case 'request-user-decision':
      view = { action: 'request-user-decision', authority: authority(action.authority), conflicts: action.conflicts.map(c => ({ ...c })), options: action.options.map(o => ({ ...o })) };
      break;
    case 'answer-user-decision': view = { action: 'answer-user-decision', request: action.request, option: action.option }; break;
    case 'reopen': view = { action: 'reopen', cause: action.cause.kind === 'report' ? `report ${action.cause.report}` : 'decision' }; break;
    case 'revise-obligation':
      view = { action: 'revise-obligation', authority: authority(action.authority), from: obligation(action.from), to: obligation(action.to) };
      break;
  }
  return {
    id: decision.id,
    considered: decision.considered,
    by: actorView(decision.actor),
    rationale: decision.rationale,
    risk: decision.risk ?? null,
    materialChoice: decision.communication.mode === 'report'
      ? { choice: decision.communication.choice, uncertainty: decision.communication.uncertainty, reason: decision.communication.reason }
      : null,
    action: view,
  };
}

function witnessView(witness: Extract<CheckFindingDecision['decision'], { action: 'fix-by-check' }>['witness']) {
  return {
    producer: witness.producer,
    attempt: witness.attempt,
    obligation: `${witness.obligation.subject}@${witness.obligation.revision}`,
    source: { ...witness.source },
    coverage: witness.coverage,
    outcome: witness.outcome,
  };
}

function actorView(actor: CheckFindingActor): CheckFindingActorView {
  return { ...actor };
}

/** Where each report came from: its review attempt and request, or its gate, with the candidate it judged. */
function attemptLinks(basis: Basis, entry: CheckFindingEntry): CheckFindingAttemptLink[] {
  return entry.reports.map(report => {
    if (report.producer.startsWith('review:')) {
      const attempt = basis.reviews.attempts.get(report.attempt);
      const request = basis.reviews.requests.get(attempt?.request ?? requestOf(report.attempt));
      return {
        report: report.id, kind: 'review', attempt: report.attempt,
        request: request?.id ?? null, iteration: request?.key.iteration ?? null, gate: request?.gate ?? null,
        session: attempt?.session ?? null, invocation: attempt?.invocation ?? null,
        candidate: { base: request?.base ?? null, commit: request?.key.candidate ?? null, tree: request?.tree ?? (report.source.kind === 'tree' ? report.source.id : null) },
      };
    }
    const gate = basis.view.gates.get(report.attempt)?.body;
    return {
      report: report.id, kind: gate === undefined ? 'other' : 'gate', attempt: report.attempt,
      request: null, iteration: gate?.subject.iteration ?? null, gate: gate?.id ?? null,
      session: null, invocation: null,
      candidate: { base: null, commit: gate?.audited ?? gate?.commit ?? null, tree: report.source.kind === 'tree' ? report.source.id : null },
    };
  });
}

/**
 * Every correction planned or claimed for a CheckFinding: the reconciliation
 * whose intent it resolves, the iteration assigned for it, and that
 * iteration's sessions.
 */
function repairLinks(basis: Basis, entry: CheckFindingEntry): CheckFindingRepairLink[] {
  const events = basis.view.events;
  const assigned = (predicate: (event: Extract<RunEvent, { type: 'iteration-assigned' }>) => boolean) =>
    events.find((event): event is Extract<RunEvent, { type: 'iteration-assigned' }> => event.type === 'iteration-assigned' && predicate(event));
  const sessions = (iteration: string | null) => iteration === null ? [] : events
    .filter((event): event is Extract<RunEvent, { type: 'invocation-started' }> => event.type === 'invocation-started' && event.data.work.iteration === iteration)
    .map(event => ({ session: event.data.session, invocation: event.data.invocation, role: event.data.role }));
  const links: CheckFindingRepairLink[] = [];
  for (const decision of entry.decisions) {
    const action = decision.decision;
    if (action.action === 'plan-repair') {
      const iteration = action.repair.kind === 'intent'
        ? assigned(event => event.data.corrects === action.repair.ref)?.data.iteration ?? null
        : action.repair.ref;
      links.push({ decision: decision.id, reconciliation: action.repair.kind === 'intent' ? action.repair.ref : null, iteration, sessions: sessions(iteration) });
    } else if (action.action === 'claim-repair') {
      links.push({ decision: decision.id, reconciliation: assigned(event => event.data.iteration === action.change)?.data.corrects ?? null, iteration: action.change, sessions: sessions(action.change) });
    }
  }
  return links;
}
