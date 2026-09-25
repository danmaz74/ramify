import { z } from 'zod';
import { jobIdSchema, planIdSchema } from './ids.js';
import { commandIdSchema, jobVersionSchema } from './jobs.js';

/*
 * The CheckFinding protocol (Plan 12 appendix §8): what a client reads of a
 * run's review coverage, its CheckFindings and their history, and the three
 * commands a person sends about them. It redefines the projection it serves
 * and never names the harness's internal CheckFinding types, so a browser
 * receives only what crosses the wire.
 *
 * Every answer names the run version it was read at and the coverage of the
 * run's reviews. A run whose policy requested no reviews, such as one begun
 * before reviews existed, has unavailable coverage, never a clean one. A
 * CheckFinding's standing, a required gate's verdict and review coverage are
 * separate fields: nothing here turns one into another.
 *
 * The commands answer a pending user decision, waive a signal and revoke a
 * waiver. Each names the CheckFinding's revision it was decided against, so
 * it never applies silently to a later change. There is no command that
 * marks a CheckFinding resolved. A plan deviation is the one CheckFinding
 * that accepts them after its run has ended.
 */

export const checkFindingProtocolVersion = 'check-findings/1';

/** The bounds of every list and detail. */
export const checkFindingWireLimits = { defaultLimit: 50, maxLimit: 100, detailHistory: 200 } as const;

const text = z.string().min(1);
const count = z.int().nonnegative();
const version = z.int().nonnegative();

/** A CheckFinding's ID, `cf-0001`. */
export const checkFindingWireIdSchema = z.string().regex(/^cf-\d{4,}$/);
/** A CheckFinding decision's ID, `cfd-0001`. */
export const checkFindingDecisionWireIdSchema = z.string().regex(/^cfd-\d{4,}$/);

/**
 * How much of the run's review scope was covered: per request, the result
 * that settled it, or pending. `unavailable` is never clean: the run
 * requested no reviews, or its review records could not be read.
 */
export const reviewCoverageSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('available'),
    requested: count,
    complete: count,
    partial: count,
    notVerified: count,
    pending: count,
  }).strict(),
  z.object({ state: z.literal('unavailable'), reason: z.enum(['no-review-policy', 'records-unreadable']) }).strict(),
]);
export type ReviewCoverageView = z.infer<typeof reviewCoverageSchema>;

/** The harm if a signal is real. It orders attention and never asks a person anything by itself. */
export const checkFindingRiskViewSchema = z.enum(['high', 'medium', 'low']);
export type CheckFindingRiskView = z.infer<typeof checkFindingRiskViewSchema>;

/** How credible a signal is, from the provenance of what grounds it, most credible first. */
export const checkFindingCredibilityViewSchema = z.enum(['objective-reproduced', 'objective', 'human-reviewed', 'agent-generated', 'ungrounded']);
export type CheckFindingCredibilityView = z.infer<typeof checkFindingCredibilityViewSchema>;

export const checkFindingStandingViewSchema = z.enum(['open', 'deferred', 'closed']);
export type CheckFindingStandingView = z.infer<typeof checkFindingStandingViewSchema>;

/** Why a CheckFinding stands where it does. Closed is never "resolved": its reason says how. */
export const checkFindingReasonViewSchema = z.enum([
  'new', 'repair-planned', 'repair-claimed', 'awaiting-user-decision', 'user-decision-answered',
  'reopened', 'waiver-revoked', 'obligation-revised', 'deferred', 'fixed-by-check', 'fixed-by-assessment', 'superseded', 'waived',
]);
export type CheckFindingReasonView = z.infer<typeof checkFindingReasonViewSchema>;

export const checkFindingAwaitingViewSchema = z.enum(['assessment', 'repair', 'witness', 'user-decision']);

/**
 * Why a signal of a completed work item was left open: its correction rounds
 * were spent, it was below the last round's floor, or it was raised after
 * the last round's basis.
 */
export const unresolvedReasonViewSchema = z.enum(['rounds-exhausted', 'below-floor', 'raised-after-last-round']);
export type UnresolvedReasonView = z.infer<typeof unresolvedReasonViewSchema>;

/** Who made a judgment or a decision, as the harness bound it. */
export const checkFindingActorViewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agent'), role: text, invocation: text }).strict(),
  z.object({ kind: z.literal('user'), name: text }).strict(),
  z.object({ kind: z.literal('harness'), reason: text }).strict(),
]);
export type CheckFindingActorView = z.infer<typeof checkFindingActorViewSchema>;

/** An immutable source a report or decision names: a tree, a file, a document or an artifact. */
export const checkFindingSourceViewSchema = z.object({ kind: z.enum(['tree', 'file', 'document', 'artifact']), id: text }).strict();

/** A trusted check result that closed a factual CheckFinding: which run of which obligation, on which source. */
export const checkFindingWitnessViewSchema = z.object({
  producer: text,
  /** The gate attempt that ran it. */
  attempt: text,
  obligation: text,
  source: checkFindingSourceViewSchema,
  coverage: z.enum(['complete', 'partial', 'not-run']),
  outcome: z.enum(['passed', 'failed', 'inconclusive']),
}).strict();

/**
 * How a settled CheckFinding was settled, by whom: fixed by a trusted check
 * on the accepted candidate, fixed by a fresh assessment, superseded by a
 * fresh judgment, waived with the risk accepted, or deferred with its
 * revisit. Null while it is open.
 */
export const checkFindingSettlementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed-by-check'), decision: checkFindingDecisionWireIdSchema, by: checkFindingActorViewSchema, witness: checkFindingWitnessViewSchema }).strict(),
  z.object({ kind: z.literal('fixed-by-assessment'), decision: checkFindingDecisionWireIdSchema, by: checkFindingActorViewSchema, rationale: text }).strict(),
  z.object({ kind: z.literal('superseded'), decision: checkFindingDecisionWireIdSchema, by: checkFindingActorViewSchema, replacement: text }).strict(),
  z.object({
    kind: z.literal('waived'), decision: checkFindingDecisionWireIdSchema, by: checkFindingActorViewSchema, reason: text,
    acceptedRisk: checkFindingRiskViewSchema, uncertainty: text,
  }).strict(),
  z.object({ kind: z.literal('deferred'), decision: checkFindingDecisionWireIdSchema, by: checkFindingActorViewSchema, reason: text, revisit: text }).strict(),
]);
export type CheckFindingSettlement = z.infer<typeof checkFindingSettlementSchema>;

/** The exact text a decision request cites as conflicting, with its document and revision. */
export const checkFindingConflictViewSchema = z.object({ text, document: text, revision: text }).strict();
/** One option of a decision request and its consequence. */
export const checkFindingOptionViewSchema = z.object({ id: text, summary: text, consequence: text }).strict();

/**
 * A request for a person's decision: the system could not responsibly choose
 * among outcomes under existing authority. It names the conflicting text and
 * the options with their consequences. It is a question, never a risk level.
 */
export const pendingUserDecisionSchema = z.object({
  request: checkFindingDecisionWireIdSchema,
  by: checkFindingActorViewSchema,
  rationale: text,
  conflicts: z.array(checkFindingConflictViewSchema).min(1),
  options: z.array(checkFindingOptionViewSchema).min(2),
}).strict();
export type PendingUserDecision = z.infer<typeof pendingUserDecisionSchema>;

/** A reasonable interpretation the system chose itself and reported so a person can reconsider it. */
export const checkFindingMaterialChoiceSchema = z.object({
  decision: checkFindingDecisionWireIdSchema,
  action: text,
  choice: text,
  uncertainty: text,
  reason: text,
}).strict();
export type CheckFindingMaterialChoice = z.infer<typeof checkFindingMaterialChoiceSchema>;

/**
 * A plan deviation, as its CheckFinding carries it: the requirements as the
 * plan writes them, what the run does instead, why, the alternatives the
 * global architect rejected and what the person loses. A reworded scenario
 * shows its text before and after. The person accepts it by waiving it or
 * answering `accept`, and rejects it by answering `reject` with the
 * requirement a follow-up run must meet, which `followUp` then holds.
 */
export const planDeviationViewSchema = z.object({
  id: text,
  /** The unresolved request it answers. */
  request: text,
  /** The work item whose request it answers, then every other it changes. */
  workItems: z.array(text).min(1),
  /** The plan it departs from, which stays exactly as written. */
  plan: text,
  requirements: z.array(z.object({ startLine: z.int().positive(), endLine: z.int().positive(), text: z.string() }).strict()).min(1),
  instead: text,
  why: text,
  rejected: z.array(z.object({ alternative: text, reason: text }).strict()),
  loss: text,
  scenarios: z.array(z.object({ scenario: text, file: text, before: z.array(z.string()), after: z.array(z.string()) }).strict()),
  /** Whether the run waited for the person's decision on it, since it was recorded past the run's limit. */
  held: z.boolean(),
  /** The person's answer that rejected it, the requirement for a follow-up run; null unless rejected. */
  followUp: z.string().nullable(),
}).strict();
export type PlanDeviationView = z.infer<typeof planDeviationViewSchema>;

/** The commands a person may send about a CheckFinding now, as the harness would accept them. */
export const userCheckFindingCommandKindSchema = z.enum(['respond', 'waive', 'revoke']);
export type UserCheckFindingCommandKind = z.infer<typeof userCheckFindingCommandKindSchema>;

/** One CheckFinding in a list. */
export const checkFindingSummarySchema = z.object({
  id: checkFindingWireIdSchema,
  revision: z.int().positive(),
  /** The work item that owns it; null for a run-level CheckFinding. */
  workItem: z.string().nullable(),
  standing: checkFindingStandingViewSchema,
  reason: checkFindingReasonViewSchema,
  awaiting: checkFindingAwaitingViewSchema.nullable(),
  /** How a fix is verified: a fresh assessment, or the same check passing again. */
  verification: z.enum(['assessment', 'check']),
  /** The obligation a check verifies, `<subject>@<revision>`; null for an assessment. */
  obligation: z.string().nullable(),
  /** Whether the obligation belongs to a required check, which no waiver or deferral evades. */
  required: z.boolean(),
  risk: checkFindingRiskViewSchema,
  credibility: checkFindingCredibilityViewSchema,
  modules: z.array(z.string()),
  /** For an open signal of a completed work item, why it was left open; null otherwise. */
  unresolved: unresolvedReasonViewSchema.nullable(),
  /** An unresolved signal of non-low risk that surfaced in its work item's latest review. */
  latestReview: z.boolean(),
  settlement: checkFindingSettlementSchema.nullable(),
  pendingUserDecision: pendingUserDecisionSchema.nullable(),
  materialChoice: checkFindingMaterialChoiceSchema.nullable(),
  repair: z.object({ kind: z.enum(['assignment', 'intent']), ref: text }).strict().nullable(),
  producers: z.array(z.string()),
  title: z.string(),
  reports: count,
  decisions: count,
  group: z.object({ canonical: checkFindingWireIdSchema, members: z.array(checkFindingWireIdSchema) }).strict().nullable(),
  userCommands: z.array(userCheckFindingCommandKindSchema),
  /** The plan deviation this CheckFinding records; null for every other signal. Plan deviations come first in attention order. */
  planDeviation: planDeviationViewSchema.nullable(),
}).strict();
export type CheckFindingSummaryView = z.infer<typeof checkFindingSummarySchema>;

/**
 * Counts over every CheckFinding the list's work item or module selects,
 * whatever the page shows. Closed is split by how it was settled; unresolved
 * and awaiting a person count open ones.
 */
export const checkFindingCountsSchema = z.object({
  total: count,
  open: count,
  deferred: count,
  closed: count,
  fixed: count,
  waived: count,
  superseded: count,
  unresolved: count,
  awaitingUser: count,
}).strict();
export type CheckFindingCountsView = z.infer<typeof checkFindingCountsSchema>;

/**
 * What a list selects: `attention`, every open CheckFinding; `reported`,
 * those and every settled one whose latest decision was reported as a
 * material choice; `all`, every standing.
 */
export const checkFindingSelectSchema = z.enum(['attention', 'reported', 'all']);
export type CheckFindingSelect = z.infer<typeof checkFindingSelectSchema>;

/** Pages order by risk, then credibility, then recency, or by ID. */
export const checkFindingOrderSchema = z.enum(['attention', 'id']);

/** A page of a run's CheckFindings. `total` counts what the query selects and `shown` what the page holds. */
export const checkFindingListResponseSchema = z.object({
  protocol: z.literal(checkFindingProtocolVersion),
  runId: jobIdSchema,
  version,
  coverage: reviewCoverageSchema,
  query: z.object({
    workItem: z.string().nullable(),
    module: z.string().nullable(),
    select: checkFindingSelectSchema,
    order: checkFindingOrderSchema,
  }).strict(),
  total: count,
  shown: count,
  /** The cursor of the next page: the last CheckFinding shown, while more remain. */
  next: checkFindingWireIdSchema.nullable(),
  counts: checkFindingCountsSchema,
  items: z.array(checkFindingSummarySchema).max(checkFindingWireLimits.maxLimit),
}).strict();
export type CheckFindingListResponse = z.infer<typeof checkFindingListResponseSchema>;

/**
 * One row per module with at least one CheckFinding. A CheckFinding that
 * concerns two modules counts in both, so the rows do not sum to the run's
 * counts.
 */
export const checkFindingModuleCountsSchema = z.object({
  protocol: z.literal(checkFindingProtocolVersion),
  runId: jobIdSchema,
  version,
  coverage: reviewCoverageSchema,
  modules: z.array(z.object({
    module: text,
    open: count,
    deferred: count,
    unresolved: count,
    highestOpenRisk: checkFindingRiskViewSchema.nullable(),
    pendingUserDecisions: count,
  }).strict()),
}).strict();
export type CheckFindingModuleCounts = z.infer<typeof checkFindingModuleCountsSchema>;

/** One report of a CheckFinding: what was observed and, for a review, the reviewer's judgment. */
export const checkFindingReportViewSchema = z.object({
  id: text,
  producer: text,
  attempt: text,
  source: checkFindingSourceViewSchema,
  observation: z.object({
    kind: z.enum(['check-failed', 'review-concern', 'plan-deviation']),
    summary: text,
    locations: z.array(z.object({ path: text, startLine: z.int().positive().nullable(), endLine: z.int().positive().nullable() }).strict()),
    evidence: z.array(z.object({ kind: text, ref: text }).strict()),
  }).strict(),
  judgment: z.object({
    by: checkFindingActorViewSchema,
    consequence: text,
    rationale: text,
    uncertainty: text,
    remedy: z.string().nullable(),
    risk: checkFindingRiskViewSchema,
    /** The reference the reporter named as grounding it, or null. */
    ground: z.string().nullable(),
  }).strict().nullable(),
  credibility: checkFindingCredibilityViewSchema.exclude(['objective-reproduced']),
  modules: z.array(z.string()),
}).strict();
export type CheckFindingReportView = z.infer<typeof checkFindingReportViewSchema>;

/** One decision of a CheckFinding, in the order it was made: who, why, and what it did. */
export const checkFindingDecisionViewSchema = z.object({
  id: checkFindingDecisionWireIdSchema,
  /** The revision it was decided against. */
  considered: z.int().positive(),
  by: checkFindingActorViewSchema,
  rationale: text,
  /** A risk correction made with the action, else null. */
  risk: checkFindingRiskViewSchema.nullable(),
  materialChoice: z.object({ choice: text, uncertainty: text, reason: text }).strict().nullable(),
  action: z.discriminatedUnion('action', [
    z.object({ action: z.literal('plan-repair'), repair: z.object({ kind: z.enum(['assignment', 'intent']), ref: text }).strict() }).strict(),
    z.object({ action: z.literal('claim-repair'), candidate: checkFindingSourceViewSchema, change: text }).strict(),
    z.object({ action: z.literal('fix-by-check'), witness: checkFindingWitnessViewSchema }).strict(),
    z.object({ action: z.literal('fix-by-assessment'), reassessed: z.array(text) }).strict(),
    z.object({ action: z.literal('supersede'), reassessed: z.array(text), replacement: text }).strict(),
    z.object({ action: z.literal('waive'), authority: text, acceptedRisk: checkFindingRiskViewSchema, uncertainty: text }).strict(),
    z.object({ action: z.literal('revoke-waiver'), reason: text }).strict(),
    z.object({ action: z.literal('defer'), authority: text, revisit: text }).strict(),
    z.object({
      action: z.literal('request-user-decision'), authority: text,
      conflicts: z.array(checkFindingConflictViewSchema), options: z.array(checkFindingOptionViewSchema),
    }).strict(),
    z.object({ action: z.literal('answer-user-decision'), request: checkFindingDecisionWireIdSchema, option: text }).strict(),
    z.object({ action: z.literal('reopen'), cause: text }).strict(),
    z.object({ action: z.literal('revise-obligation'), authority: text, from: text, to: text }).strict(),
  ]),
}).strict();
export type CheckFindingDecisionView = z.infer<typeof checkFindingDecisionViewSchema>;

/** A relation an architect's assessment found between two CheckFindings. Only `same-issue` groups them. */
export const checkFindingRelationViewSchema = z.object({
  id: text,
  from: z.object({ checkFinding: checkFindingWireIdSchema, revision: z.int().positive() }).strict(),
  to: z.object({ checkFinding: checkFindingWireIdSchema, revision: z.int().positive() }).strict(),
  relation: z.enum(['same-issue', 'related-but-distinct', 'distinct', 'uncertain']),
  by: checkFindingActorViewSchema,
  shared: text,
  rationale: text,
}).strict();

/**
 * Where a report came from: the review attempt or gate attempt that made it,
 * the session that ran it, and the candidate diff it judged, from the base
 * the iteration started at to the audited commit.
 */
export const checkFindingAttemptLinkSchema = z.object({
  report: text,
  kind: z.enum(['review', 'gate', 'other']),
  attempt: text,
  /** The review request, for a review. */
  request: z.string().nullable(),
  /** The iteration whose candidate it judged. */
  iteration: z.string().nullable(),
  /** The passing gate the reviewed candidate came from, or the gate that ran the check. */
  gate: z.string().nullable(),
  session: z.string().nullable(),
  invocation: z.string().nullable(),
  candidate: z.object({ base: z.string().nullable(), commit: z.string().nullable(), tree: z.string().nullable() }).strict(),
}).strict();
export type CheckFindingAttemptLink = z.infer<typeof checkFindingAttemptLinkSchema>;

/** A correction planned or claimed for a CheckFinding, with the iteration that made it and its sessions. */
export const checkFindingRepairLinkSchema = z.object({
  decision: checkFindingDecisionWireIdSchema,
  /** The reconciliation whose intent it resolves, for a planned repair. */
  reconciliation: z.string().nullable(),
  /** The correction iteration, once one was assigned. */
  iteration: z.string().nullable(),
  sessions: z.array(z.object({ session: text, invocation: text, role: text }).strict()),
}).strict();
export type CheckFindingRepairLink = z.infer<typeof checkFindingRepairLinkSchema>;

/** One CheckFinding with its bounded history and what it links to. */
export const checkFindingDetailSchema = z.object({
  protocol: z.literal(checkFindingProtocolVersion),
  runId: jobIdSchema,
  version,
  summary: checkFindingSummarySchema,
  reports: z.object({ total: count, items: z.array(checkFindingReportViewSchema).max(checkFindingWireLimits.detailHistory) }).strict(),
  decisions: z.object({ total: count, items: z.array(checkFindingDecisionViewSchema).max(checkFindingWireLimits.detailHistory) }).strict(),
  relations: z.array(checkFindingRelationViewSchema),
  attempts: z.array(checkFindingAttemptLinkSchema),
  repairs: z.array(checkFindingRepairLinkSchema),
}).strict();
export type CheckFindingDetail = z.infer<typeof checkFindingDetailSchema>;

/** One attempt of a review request. */
export const reviewAttemptViewSchema = z.object({
  id: text,
  state: z.enum(['queued', 'running', 'finished']),
  invocation: z.string().nullable(),
  session: z.string().nullable(),
  requestedStart: z.enum(['fresh', 'fork']).nullable(),
  actualStart: z.enum(['fresh', 'fork']).nullable(),
  result: z.enum(['complete', 'partial', 'not-verified']).nullable(),
  reason: z.string().nullable(),
  detail: z.string().nullable(),
  inspected: count,
  missing: count,
  concerns: count,
  settles: z.boolean(),
  checkFindings: z.array(checkFindingWireIdSchema),
}).strict();
export type ReviewAttemptView = z.infer<typeof reviewAttemptViewSchema>;

/** One review question over one audited candidate, with its attempts and the result that settled it. */
export const reviewRequestViewSchema = z.object({
  id: text,
  workItem: text,
  iteration: text,
  kind: z.enum(['code', 'scope', 'design']),
  gate: text,
  /** The candidate diff: from the base the iteration started at to the audited commit. */
  base: z.string().nullable(),
  candidate: text,
  recordedAt: z.iso.datetime(),
  /** The settling attempt's result; null while pending. A complete result with no concern is a clean review of its scope. */
  result: z.enum(['complete', 'partial', 'not-verified']).nullable(),
  settledBy: z.string().nullable(),
  attempts: z.array(reviewAttemptViewSchema),
}).strict();
export type ReviewRequestView = z.infer<typeof reviewRequestViewSchema>;

export const reviewListResponseSchema = z.object({
  protocol: z.literal(checkFindingProtocolVersion),
  runId: jobIdSchema,
  version,
  coverage: reviewCoverageSchema,
  workItem: z.string().nullable(),
  total: count,
  shown: count,
  next: z.string().nullable(),
  requests: z.array(reviewRequestViewSchema).max(checkFindingWireLimits.maxLimit),
}).strict();
export type ReviewListResponse = z.infer<typeof reviewListResponseSchema>;

const checkFindingCommandPayload = {
  planId: planIdSchema,
  jobId: jobIdSchema,
  checkFinding: checkFindingWireIdSchema,
  /** The CheckFinding's revision the person decided against. */
  expectedRevision: z.int().positive(),
  /** The person, by name. */
  responder: z.string().min(1).max(200),
};

/**
 * A person answers a CheckFinding's pending decision request with one of its
 * options. It names the request, so it never answers a later one.
 */
export const respondToCheckFindingCommandSchema = z.object({
  commandId: commandIdSchema,
  expectedVersion: jobVersionSchema,
  type: z.literal('respond-to-check-finding'),
  payload: z.object({
    ...checkFindingCommandPayload,
    request: checkFindingDecisionWireIdSchema,
    option: z.string().min(1).max(200),
    note: z.string().max(4000).optional(),
  }).strict(),
}).strict();
export type RespondToCheckFindingCommand = z.infer<typeof respondToCheckFindingCommandSchema>;

/**
 * A person waives a signal: it is understood and the code stays as it is,
 * accepting its current risk. A required check cannot be waived here; that
 * belongs to its gate.
 */
export const waiveCheckFindingCommandSchema = z.object({
  commandId: commandIdSchema,
  expectedVersion: jobVersionSchema,
  type: z.literal('waive-check-finding'),
  payload: z.object({ ...checkFindingCommandPayload, reason: z.string().min(1).max(4000) }).strict(),
}).strict();
export type WaiveCheckFindingCommand = z.infer<typeof waiveCheckFindingCommandSchema>;

/** A person revokes a waiver, any actor's, which opens the CheckFinding again. */
export const revokeCheckFindingWaiverCommandSchema = z.object({
  commandId: commandIdSchema,
  expectedVersion: jobVersionSchema,
  type: z.literal('revoke-check-finding-waiver'),
  payload: z.object({ ...checkFindingCommandPayload, reason: z.string().min(1).max(4000) }).strict(),
}).strict();
export type RevokeCheckFindingWaiverCommand = z.infer<typeof revokeCheckFindingWaiverCommandSchema>;

/** The three CheckFinding commands, any of them. */
export type CheckFindingUserCommand = RespondToCheckFindingCommand | WaiveCheckFindingCommand | RevokeCheckFindingWaiverCommand;
