import { z } from 'zod';

/*
 * The CheckFinding domain contract: the vocabulary the harness passes in, the
 * commands it asks this module to decide, the events a decision returns and
 * replay applies, the state replay derives and the views a query selects.
 *
 * Every reference here is opaque. The harness binds each one to the record it
 * names (a tree, a gate or review attempt, an invocation, an assignment) and
 * authenticates it before calling; this module compares references for
 * equality and never reads what they name. No agent can supply a trusted
 * attestation through this contract: a witness, an authority and an actor
 * are whatever the trusted caller put there.
 */

/** The version every event of this contract carries. */
export const checkFindingEventVersion = 1;
/** The version every view and selection of this contract carries. */
export const checkFindingViewVersion = 'check-finding-view/1';

/** Prose a report or a decision carries: a summary, a rationale, a consequence. */
const prose = z.string().min(1).max(4000);
/** An opaque reference or a short name. */
const ref = z.string().min(1).max(500);
const name = z.string().min(1).max(200);
const hashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/, 'A sha256: digest in lowercase hexadecimal');

// Identifiers. Each is allocated from the replayed state, so a decision
// repeated over the same state allocates the same one.

/** `cf-0001`, one more than the CheckFindings the state holds. */
export const checkFindingIdSchema = z.string().regex(/^cf-\d{4,}$/);
export type CheckFindingId = z.infer<typeof checkFindingIdSchema>;
/** `cfr-0001`, one more than the reports the state holds. */
export const checkFindingReportIdSchema = z.string().regex(/^cfr-\d{4,}$/);
export type CheckFindingReportId = z.infer<typeof checkFindingReportIdSchema>;
/** `cfd-0001`, one more than the decisions the state holds. */
export const checkFindingDecisionIdSchema = z.string().regex(/^cfd-\d{4,}$/);
export type CheckFindingDecisionId = z.infer<typeof checkFindingDecisionIdSchema>;
/** `cfl-0001`, one more than the relations the state holds. */
export const checkFindingRelationIdSchema = z.string().regex(/^cfl-\d{4,}$/);
export type CheckFindingRelationId = z.infer<typeof checkFindingRelationIdSchema>;

// Opaque references the harness binds.

/**
 * What produced a report: `review:code`, `review:scope`, `review:design`,
 * `check:scenario`, or `plan:deviation` for a departure from the plan the
 * global architect recorded. The trusted integration names it; a reporting
 * agent never does.
 */
export const checkFindingProducerSchema = z.string().regex(/^(review|check|plan):[a-z][a-z0-9-]*$/);
export type CheckFindingProducer = z.infer<typeof checkFindingProducerSchema>;

/**
 * An immutable source identity: a tree, one file's captured contents, a
 * document revision or a captured artifact. Two sources are the same only
 * when kind and id are equal, so evidence about one file never stands for a
 * tree.
 */
export const checkFindingSourceSchema = z.object({
  kind: z.enum(['tree', 'file', 'document', 'artifact']),
  id: ref,
}).strict();
export type CheckFindingSource = z.infer<typeof checkFindingSourceSchema>;

/** Who is responsible: ordinarily the originating module work item, or the run for run-level reviews. */
export const checkFindingOwnerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('work-item'), workItem: ref }).strict(),
  z.object({ kind: z.literal('run') }).strict(),
]);
export type CheckFindingOwner = z.infer<typeof checkFindingOwnerSchema>;

/** A reference to evidence the harness retains: a gate output, a diff, a report body. */
export const checkFindingEvidenceSchema = z.object({
  kind: name,
  ref,
  hash: hashSchema.nullable(),
}).strict();
export type CheckFindingEvidence = z.infer<typeof checkFindingEvidenceSchema>;

/** Where a report points. Informative only: a location never forms identity. */
export const checkFindingLocationSchema = z.object({
  path: ref,
  startLine: z.int().positive().nullable(),
  endLine: z.int().positive().nullable(),
}).strict();
export type CheckFindingLocation = z.infer<typeof checkFindingLocationSchema>;

/** A verification obligation: what must pass, such as `scenario:sc-004`, at its frozen revision. */
export const checkFindingObligationSchema = z.object({
  subject: ref,
  revision: z.int().positive(),
}).strict();
export type CheckFindingObligation = z.infer<typeof checkFindingObligationSchema>;

/**
 * How a claimed resolution is verified, chosen by the trusted producer
 * integration. `assessment` is a fresh reasoned judgment; `check` is a rerun
 * of the same obligation by the same producer with comparable inputs
 * (`selection` is the selection and configuration identity), and `required`
 * says the obligation belongs to a required check, which no waiver or
 * deferral may evade.
 */
export const checkFindingVerificationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('assessment') }).strict(),
  z.object({
    kind: z.literal('check'),
    producer: checkFindingProducerSchema,
    obligation: checkFindingObligationSchema,
    selection: ref,
    required: z.boolean(),
  }).strict(),
]);
export type CheckFindingVerification = z.infer<typeof checkFindingVerificationSchema>;

/** Who made a judgment or a decision, as the harness bound it. */
export const checkFindingActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agent'), role: name, invocation: ref }).strict(),
  z.object({ kind: z.literal('user'), name }).strict(),
  z.object({ kind: z.literal('harness'), reason: prose }).strict(),
]);
export type CheckFindingActor = z.infer<typeof checkFindingActorSchema>;

/**
 * The authority a decision was made under, as the harness validated it: the
 * work item's assessment, an answered user decision, or a governing record
 * that permits it.
 */
export const checkFindingAuthoritySchema = z.object({
  kind: z.enum(['work-item-assessment', 'user-decision', 'governing-record']),
  ref,
}).strict();
export type CheckFindingAuthority = z.infer<typeof checkFindingAuthoritySchema>;

// Risk, ground and credibility.

/**
 * The harm if the signal is real: the reporter proposes it, and the
 * assessing architect may correct it by a recorded decision. It orders
 * attention; it never escalates to a user by itself.
 */
export const checkFindingRiskSchema = z.enum(['high', 'medium', 'low']);
export type CheckFindingRisk = z.infer<typeof checkFindingRiskSchema>;

/**
 * What grounds a judgment: the reference the reporter named, with the hash
 * of the bytes the harness bound it to. The harness classifies it into the
 * report's credibility; the reporter never declares that.
 */
export const checkFindingGroundSchema = z.object({ ref, hash: hashSchema }).strict();
export type CheckFindingGround = z.infer<typeof checkFindingGroundSchema>;

/**
 * How far a signal is to be trusted, by the provenance of what grounds it,
 * most credible first: an objective signal a check observed more than once,
 * one it observed once, a judgment grounded in human-reviewed material, one
 * grounded in agent-generated material, and one with no ground. Only a view
 * derives `objective-reproduced`; a report carries one of the other four.
 */
export const checkFindingCredibilitySchema = z.enum(['objective-reproduced', 'objective', 'human-reviewed', 'agent-generated', 'ungrounded']);
export type CheckFindingCredibility = z.infer<typeof checkFindingCredibilitySchema>;
/** The credibility the harness binds to one report. */
export const checkFindingReportCredibilitySchema = checkFindingCredibilitySchema.exclude(['objective-reproduced']);
export type CheckFindingReportCredibility = z.infer<typeof checkFindingReportCredibilitySchema>;

// Reports.

/**
 * What was observed: a failed check execution, a concern a reviewer
 * asserted, or a plan deviation: the run does something other than a
 * requirement of its plan states, because the requirement cannot be met as
 * written. A plan deviation is the person's to accept or reject; it holds
 * no work item and no gate.
 */
export const checkFindingObservationKindSchema = z.enum(['check-failed', 'review-concern', 'plan-deviation']);
export type CheckFindingObservationKind = z.infer<typeof checkFindingObservationKindSchema>;

export const checkFindingObservationSchema = z.object({
  kind: checkFindingObservationKindSchema,
  summary: prose,
  evidence: z.array(checkFindingEvidenceSchema).max(50),
  locations: z.array(checkFindingLocationSchema).max(50),
}).strict();
export type CheckFindingObservation = z.infer<typeof checkFindingObservationSchema>;

/**
 * An attributed interpretation: the consequence, why, how sure, a bounded
 * remedy, the risk the reporter proposes and what the reporter named as
 * grounding it, or null.
 */
export const checkFindingJudgmentSchema = z.object({
  actor: checkFindingActorSchema,
  consequence: prose,
  rationale: prose,
  uncertainty: prose,
  remedy: prose.nullable(),
  risk: checkFindingRiskSchema,
  ground: checkFindingGroundSchema.nullable(),
}).strict();
export type CheckFindingJudgment = z.infer<typeof checkFindingJudgmentSchema>;

/**
 * One immutable report, as the trusted producer integration submits it.
 * `(producer, attempt, reportKey)` is its ingestion key and `contentHash` the
 * harness's `sha256:` over the canonical JSON of every other field; an equal
 * key with an equal hash is a replay, with another hash a conflict.
 * `issueKey` is a trusted producer's stable issue identity, scoped by owner
 * and verification obligation; `suggests` is a reviewer's hint of an existing
 * CheckFinding and never attaches the report. `credibility` and `modules` are
 * the harness's: the provenance class of the judgment's ground (`objective`
 * for a failed check), and the modules that own the report's locations on
 * its own source, else the owner work item's module. They never form
 * identity.
 */
export const checkFindingReportInputSchema = z.object({
  producer: checkFindingProducerSchema,
  attempt: ref,
  reportKey: ref,
  contentHash: hashSchema,
  owner: checkFindingOwnerSchema,
  source: checkFindingSourceSchema,
  issueKey: ref.nullable(),
  verification: checkFindingVerificationSchema,
  observation: checkFindingObservationSchema,
  judgment: checkFindingJudgmentSchema.nullable(),
  suggests: checkFindingIdSchema.nullable(),
  credibility: checkFindingReportCredibilitySchema,
  modules: z.array(ref).max(50),
}).strict();
export type CheckFindingReportInput = z.infer<typeof checkFindingReportInputSchema>;

/** A report as a CheckFinding holds it: the input with its allocated ID. */
export const checkFindingReportSchema = checkFindingReportInputSchema.extend({ id: checkFindingReportIdSchema }).strict();
export type CheckFindingReport = z.infer<typeof checkFindingReportSchema>;

// Decisions.

/** A repair's link: a committed correction assignment, or a recoverable pending assignment intent. */
export const checkFindingRepairSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('assignment'), ref }).strict(),
  z.object({ kind: z.literal('intent'), ref }).strict(),
]);
export type CheckFindingRepair = z.infer<typeof checkFindingRepairSchema>;

/**
 * A trusted check result offered as a verification witness: which producer
 * ran which obligation with which selection on which source, whether it
 * executed the obligation completely, and its outcome. A process exit alone
 * is never a witness.
 */
export const checkFindingWitnessSchema = z.object({
  producer: checkFindingProducerSchema,
  attempt: ref,
  obligation: checkFindingObligationSchema,
  selection: ref,
  source: checkFindingSourceSchema,
  coverage: z.enum(['complete', 'partial', 'not-run']),
  outcome: z.enum(['passed', 'failed', 'inconclusive']),
  evidence: z.array(checkFindingEvidenceSchema).min(1).max(50),
}).strict();
export type CheckFindingWitness = z.infer<typeof checkFindingWitnessSchema>;

/** Where a revisit of a deferral is due: a condition the harness evaluates, or a follow-up reference. */
export const checkFindingRevisitSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('condition'), condition: prose }).strict(),
  z.object({ kind: z.literal('follow-up'), ref }).strict(),
]);
export type CheckFindingRevisit = z.infer<typeof checkFindingRevisitSchema>;

/** The exact conflicting text a user decision cites, with the document and revision it is from. */
export const checkFindingConflictSchema = z.object({
  text: prose,
  document: ref,
  revision: ref,
}).strict();
export type CheckFindingConflict = z.infer<typeof checkFindingConflictSchema>;

/** One option of a user decision and its consequence. */
export const checkFindingOptionSchema = z.object({
  id: name,
  summary: prose,
  consequence: prose,
}).strict();
export type CheckFindingOption = z.infer<typeof checkFindingOptionSchema>;

/**
 * What caused a reopening: a decision about new evidence, or a report the
 * harness attached that contradicts the closing decision's basis.
 */
export const checkFindingReopenCauseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('decision') }).strict(),
  z.object({ kind: z.literal('report'), report: checkFindingReportIdSchema }).strict(),
]);
export type CheckFindingReopenCause = z.infer<typeof checkFindingReopenCauseSchema>;

/** The action of one decision, with the fields that action requires. */
export const checkFindingActionSchema = z.discriminatedUnion('action', [
  /** Stays open; links the correction that will repair it. */
  z.object({ action: z.literal('plan-repair'), repair: checkFindingRepairSchema }).strict(),
  /** Stays open until fixed; names what changed and the candidate it claims repaired. */
  z.object({ action: z.literal('claim-repair'), candidate: checkFindingSourceSchema, change: ref }).strict(),
  /** Closes a `check` CheckFinding as fixed, with a matching witness on the acceptance candidate. */
  z.object({ action: z.literal('fix-by-check'), candidate: checkFindingSourceSchema, witness: checkFindingWitnessSchema }).strict(),
  /** Closes an `assessment` CheckFinding as fixed, with a fresh assessment of the named reports. */
  z.object({ action: z.literal('fix-by-assessment'), reassessed: z.array(checkFindingReportIdSchema).min(1).max(100) }).strict(),
  /** Closes an `assessment` CheckFinding with a replacing judgment; no code change is claimed. */
  z.object({ action: z.literal('supersede'), reassessed: z.array(checkFindingReportIdSchema).min(1).max(100), replacement: prose }).strict(),
  /**
   * Closes as waived: the signal is understood and the code stays as it is,
   * with the authority, the risk accepted and the uncertainty. Claims no
   * repair and changes no gate. A later report of the same issue never
   * reopens it; only a revocation does.
   */
  z.object({ action: z.literal('waive'), authority: checkFindingAuthoritySchema, acceptedRisk: checkFindingRiskSchema, uncertainty: prose }).strict(),
  /** Open again after a waiver, with the reason; the waiver stays in the history. */
  z.object({ action: z.literal('revoke-waiver'), reason: prose }).strict(),
  /** Deferred, with a responsible owner and a revisit. Claims nothing fixed. */
  z.object({ action: z.literal('defer'), authority: checkFindingAuthoritySchema, responsible: checkFindingOwnerSchema, revisit: checkFindingRevisitSchema }).strict(),
  /** Stays open and awaits a user's answer. */
  z.object({
    action: z.literal('request-user-decision'),
    authority: checkFindingAuthoritySchema,
    conflicts: z.array(checkFindingConflictSchema).min(1).max(20),
    options: z.array(checkFindingOptionSchema).min(2).max(10),
  }).strict(),
  /** A user's answer to the pending request, naming it and one of its options. */
  z.object({ action: z.literal('answer-user-decision'), request: checkFindingDecisionIdSchema, option: name }).strict(),
  /** Open again at a new revision; every earlier decision stays in the history. A waiver is revoked instead. */
  z.object({ action: z.literal('reopen'), cause: checkFindingReopenCauseSchema }).strict(),
  /** An authorized change of the obligation a `check` CheckFinding must be verified against. */
  z.object({
    action: z.literal('revise-obligation'),
    authority: checkFindingAuthoritySchema,
    from: checkFindingObligationSchema,
    to: checkFindingObligationSchema,
  }).strict(),
]);
export type CheckFindingAction = z.infer<typeof checkFindingActionSchema>;
export type CheckFindingActionKind = CheckFindingAction['action'];

/**
 * Whether the decision is reported to the user: `quiet` by default, or a
 * material choice with the fix, its uncertainty and why it is reported.
 */
export const checkFindingCommunicationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('quiet') }).strict(),
  z.object({ mode: z.literal('report'), choice: prose, uncertainty: prose, reason: prose }).strict(),
]);
export type CheckFindingCommunication = z.infer<typeof checkFindingCommunicationSchema>;

/**
 * One decision as submitted: who, against which current source, why, on what
 * evidence, how it is communicated, and the action. `risk`, when present,
 * corrects the CheckFinding's risk level with the action.
 */
export const checkFindingDecisionInputSchema = z.object({
  actor: checkFindingActorSchema,
  source: checkFindingSourceSchema,
  rationale: prose,
  evidence: z.array(checkFindingEvidenceSchema).max(50),
  communication: checkFindingCommunicationSchema,
  risk: checkFindingRiskSchema.optional(),
  decision: checkFindingActionSchema,
}).strict();
export type CheckFindingDecisionInput = z.infer<typeof checkFindingDecisionInputSchema>;

/** A decision as a CheckFinding holds it: its ID and the revision it considered. */
export const checkFindingDecisionSchema = checkFindingDecisionInputSchema.extend({
  id: checkFindingDecisionIdSchema,
  considered: z.int().positive(),
}).strict();
export type CheckFindingDecision = z.infer<typeof checkFindingDecisionSchema>;

// Relations.

/** The relation an assessment found between two CheckFindings. Only `same-issue` groups them. */
export const checkFindingRelationKindSchema = z.enum(['same-issue', 'related-but-distinct', 'distinct', 'uncertain']);
export type CheckFindingRelationKind = z.infer<typeof checkFindingRelationKindSchema>;

/** A CheckFinding at the revision an assessment captured. */
export const checkFindingAtSchema = z.object({ checkFinding: checkFindingIdSchema, revision: z.int().positive() }).strict();
export type CheckFindingAt = z.infer<typeof checkFindingAtSchema>;

/**
 * One relation assessment: both CheckFindings at their captured revisions,
 * the relation, the shared behavior or obligation, evidence and rationale.
 * The latest assessment of a pair is its current relation.
 */
export const checkFindingRelationInputSchema = z.object({
  actor: checkFindingActorSchema,
  source: checkFindingSourceSchema,
  from: checkFindingAtSchema,
  to: checkFindingAtSchema,
  relation: checkFindingRelationKindSchema,
  shared: prose,
  evidence: z.array(checkFindingEvidenceSchema).max(50),
  rationale: prose,
}).strict();
export type CheckFindingRelationInput = z.infer<typeof checkFindingRelationInputSchema>;

export const checkFindingRelationSchema = checkFindingRelationInputSchema.extend({ id: checkFindingRelationIdSchema }).strict();
export type CheckFindingRelation = z.infer<typeof checkFindingRelationSchema>;

// Commands.

const reportCommandSchema = z.object({ type: z.literal('report'), report: checkFindingReportInputSchema }).strict();
const disposeCommandSchema = z.object({
  type: z.literal('dispose'),
  checkFinding: checkFindingIdSchema,
  expectedRevision: z.int().positive(),
  decision: checkFindingDecisionInputSchema,
}).strict();
const relateCommandSchema = z.object({ type: z.literal('relate'), relation: checkFindingRelationInputSchema }).strict();

/**
 * A command the harness asks this module to decide. `assess` is one
 * assessment's relations and dispositions, decided in order and accepted
 * together or not at all.
 */
export const checkFindingCommandSchema = z.discriminatedUnion('type', [
  reportCommandSchema,
  disposeCommandSchema,
  relateCommandSchema,
  z.object({
    type: z.literal('assess'),
    commands: z.array(z.discriminatedUnion('type', [disposeCommandSchema, relateCommandSchema])).min(1).max(100),
  }).strict(),
]);
export type CheckFindingCommand = z.infer<typeof checkFindingCommandSchema>;

// Events.

const version = z.literal(checkFindingEventVersion);

/** A new CheckFinding at revision 1 with its first report. */
export const checkFindingOpenedDataSchema = z.object({
  version, checkFinding: checkFindingIdSchema, revision: z.literal(1), report: checkFindingReportSchema,
}).strict();
/** A further report attached to an existing CheckFinding by its producer issue key. */
export const checkFindingReportedDataSchema = z.object({
  version, checkFinding: checkFindingIdSchema, revision: z.int().min(2), report: checkFindingReportSchema,
}).strict();
/** One decision about one CheckFinding, at the revision it moves the CheckFinding to. */
export const checkFindingDecidedDataSchema = z.object({
  version, checkFinding: checkFindingIdSchema, revision: z.int().min(2), decision: checkFindingDecisionSchema,
}).strict();
/** One relation assessment between two CheckFindings. It changes neither revision. */
export const checkFindingRelatedDataSchema = z.object({ version, relation: checkFindingRelationSchema }).strict();

/** Every event a decision returns and replay applies: its type and the data the run log carries. */
export const checkFindingEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('check-finding-opened'), data: checkFindingOpenedDataSchema }).strict(),
  z.object({ type: z.literal('check-finding-reported'), data: checkFindingReportedDataSchema }).strict(),
  z.object({ type: z.literal('check-finding-decided'), data: checkFindingDecidedDataSchema }).strict(),
  z.object({ type: z.literal('check-finding-related'), data: checkFindingRelatedDataSchema }).strict(),
]);
export type CheckFindingEvent = z.infer<typeof checkFindingEventSchema>;
export type CheckFindingEventType = CheckFindingEvent['type'];

export const checkFindingEventTypes: readonly CheckFindingEventType[] = [
  'check-finding-opened', 'check-finding-reported', 'check-finding-decided', 'check-finding-related',
];

// Standing.

/** The derived standing. Closed is never a quality claim on its own; its reason says what closed it. */
export const checkFindingStandingSchema = z.enum(['open', 'deferred', 'closed']);
export type CheckFindingStanding = z.infer<typeof checkFindingStandingSchema>;

/** Why a CheckFinding stands where it does. */
export const checkFindingReasonSchema = z.enum([
  // open
  'new', 'repair-planned', 'repair-claimed', 'awaiting-user-decision', 'user-decision-answered', 'reopened', 'waiver-revoked',
  'obligation-revised',
  // deferred
  'deferred',
  // closed
  'fixed-by-check', 'fixed-by-assessment', 'superseded', 'waived',
]);
export type CheckFindingReason = z.infer<typeof checkFindingReasonSchema>;

/** What an open CheckFinding waits for. */
export const checkFindingAwaitingSchema = z.enum(['assessment', 'repair', 'witness', 'user-decision']);
export type CheckFindingAwaiting = z.infer<typeof checkFindingAwaitingSchema>;

// State.

/** One CheckFinding as replay derives it. */
export interface CheckFindingEntry {
  readonly id: CheckFindingId;
  readonly revision: number;
  readonly owner: CheckFindingOwner;
  /** The current verification rule; an authorized obligation revision replaces its obligation. */
  readonly verification: CheckFindingVerification;
  readonly standing: CheckFindingStanding;
  readonly reason: CheckFindingReason;
  readonly reports: readonly CheckFindingReport[];
  readonly decisions: readonly CheckFindingDecision[];
  /** The scoped issue keys that attach a report to it. */
  readonly issueKeys: readonly string[];
  /** The request awaiting a user's answer, while one does. */
  readonly pendingUserDecision: CheckFindingDecisionId | null;
  /** The repair planned since the CheckFinding was last opened, reopened or its waiver revoked. */
  readonly repair: CheckFindingRepair | null;
  /** The decision that closed or deferred it, while it is closed or deferred. */
  readonly settledBy: CheckFindingDecisionId | null;
  /** Its latest risk correction, else its latest report's risk. */
  readonly risk: CheckFindingRisk;
  /** `objective-reproduced` with two or more objective reports, else the most credible of its reports'. */
  readonly credibility: CheckFindingCredibility;
  /** The union of its reports' modules, in order. */
  readonly modules: readonly string[];
}

/** Where an ingestion key led. */
export interface CheckFindingIngestion {
  readonly checkFinding: CheckFindingId;
  readonly report: CheckFindingReportId;
  readonly contentHash: string;
}

/** Everything replay derives from accepted events. It is never changed; each event yields a new state. */
export interface CheckFindingState {
  /** How many events were applied. */
  readonly applied: number;
  readonly findings: ReadonlyMap<CheckFindingId, CheckFindingEntry>;
  /** Ingestion key to where it led; the key is producer, attempt and report key joined by NUL. */
  readonly ingested: ReadonlyMap<string, CheckFindingIngestion>;
  readonly relations: readonly CheckFindingRelation[];
  readonly counters: { readonly findings: number; readonly reports: number; readonly decisions: number; readonly relations: number };
}

// Outcomes.

/** Every reason a command or an event is refused. */
export const checkFindingRejectionCodeSchema = z.enum([
  'invalid-command',
  'invalid-report',
  'report-key-conflict',
  'ambiguous-issue-key',
  'unknown-check-finding',
  'unknown-report',
  'stale-revision',
  'invalid-transition',
  'waived',
  'not-waived',
  'awaiting-user-decision',
  'no-pending-user-decision',
  'unknown-option',
  'insufficient-authority',
  'verification-kind-mismatch',
  'factual-obligation',
  'required-obligation',
  'producer-mismatch',
  'wrong-subject',
  'obligation-changed',
  'incomparable-inputs',
  'source-mismatch',
  'failure-source',
  'insufficient-coverage',
  'not-executed',
  'not-passed',
  'relation-self',
  'cross-owner',
  'relation-cycle',
  'replay-conflict',
  'invalid-query',
]);
export type CheckFindingRejectionCode = z.infer<typeof checkFindingRejectionCodeSchema>;

/** A refusal: its code, a message naming what was refused, and within `assess` the command's position. */
export interface CheckFindingRejection {
  readonly code: CheckFindingRejectionCode;
  readonly message: string;
  readonly index?: number;
}

/**
 * A decided command: the events to commit, in order, or the refusal. An exact
 * report replay is accepted with no events and names the CheckFinding it led
 * to. `touched` lists every CheckFinding the events change.
 */
export type CheckFindingChange =
  | {
    readonly ok: true;
    readonly events: readonly CheckFindingEvent[];
    readonly replayed: boolean;
    readonly touched: readonly CheckFindingId[];
  }
  | { readonly ok: false; readonly rejection: CheckFindingRejection };

/** An applied event, or why the state cannot accept it. */
export type CheckFindingApplied =
  | { readonly ok: true; readonly state: CheckFindingState }
  | { readonly ok: false; readonly rejection: CheckFindingRejection };

/** A replayed sequence, or the first event it cannot accept and its position. */
export type CheckFindingReplay =
  | { readonly ok: true; readonly state: CheckFindingState }
  | { readonly ok: false; readonly rejection: CheckFindingRejection; readonly event: number };

// Queries.

/** Bounds of every selection. */
export const checkFindingQueryLimits = { defaultLimit: 50, maxLimit: 100, detailHistory: 200, maxDue: 500 } as const;

/**
 * A bounded list or one CheckFinding's detail. `attention` selects the open
 * CheckFindings and the deferred ones whose revisit the harness found due
 * (`due`); `all` selects every standing, optionally narrowed by `standings`.
 * `module` narrows either to the CheckFindings that concern that module.
 * Pages are ordered by ID, or with `order: attention` by risk, credibility
 * and recency, and continue after the CheckFinding `after` names.
 */
export const checkFindingQuerySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('list'),
    owner: checkFindingOwnerSchema.nullable().default(null),
    module: ref.nullable().default(null),
    select: z.enum(['attention', 'all']),
    standings: z.array(checkFindingStandingSchema).min(1).nullable().default(null),
    due: z.array(checkFindingIdSchema).max(checkFindingQueryLimits.maxDue).default([]),
    order: z.enum(['id', 'attention']).default('id'),
    after: checkFindingIdSchema.nullable().default(null),
    limit: z.int().min(1).max(checkFindingQueryLimits.maxLimit).default(checkFindingQueryLimits.defaultLimit),
  }).strict(),
  z.object({ kind: z.literal('detail'), checkFinding: checkFindingIdSchema }).strict(),
]);
export type CheckFindingQueryInput = z.input<typeof checkFindingQuerySchema>;
export type CheckFindingQuery = z.output<typeof checkFindingQuerySchema>;

/** A same-issue group: its canonical (earliest) ID and every member, in ID order. */
export interface CheckFindingGroup {
  readonly canonical: CheckFindingId;
  readonly members: readonly CheckFindingId[];
}

/** A reported material choice: the decision, its fix, uncertainty and reason. */
export interface CheckFindingMaterialChoice {
  readonly decision: CheckFindingDecisionId;
  readonly action: CheckFindingActionKind;
  readonly choice: string;
  readonly uncertainty: string;
  readonly reason: string;
}

/** One line of a list. */
export interface CheckFindingSummary {
  readonly id: CheckFindingId;
  readonly revision: number;
  readonly owner: CheckFindingOwner;
  readonly standing: CheckFindingStanding;
  readonly reason: CheckFindingReason;
  /** What an open one waits for; null unless open. */
  readonly awaiting: CheckFindingAwaiting | null;
  /** Why it is selected for attention; null unless it is. */
  readonly attention: 'open' | 'due' | null;
  readonly verification: CheckFindingVerification;
  readonly producers: readonly CheckFindingProducer[];
  /** The first report's observation summary. */
  readonly title: string;
  readonly risk: CheckFindingRisk;
  readonly credibility: CheckFindingCredibility;
  readonly modules: readonly string[];
  readonly latestSource: CheckFindingSource;
  readonly reports: number;
  readonly decisions: number;
  readonly group: CheckFindingGroup | null;
  readonly pendingUserDecision: CheckFindingDecisionId | null;
  readonly repair: CheckFindingRepair | null;
  /** The latest decision reported as a material choice since the last reopening or revocation. */
  readonly materialChoice: CheckFindingMaterialChoice | null;
}

/** Counts over every CheckFinding of the queried owner and module, whatever the page shows. */
export interface CheckFindingCounts {
  readonly total: number;
  readonly standings: Readonly<Record<CheckFindingStanding, number>>;
  readonly reasons: Readonly<Partial<Record<CheckFindingReason, number>>>;
}

/** A page of a list. `total` counts what the query selects and `shown` what this page holds. */
export interface CheckFindingListView {
  readonly kind: 'list';
  readonly view: typeof checkFindingViewVersion;
  readonly applied: number;
  readonly total: number;
  readonly shown: number;
  readonly next: CheckFindingId | null;
  readonly counts: CheckFindingCounts;
  readonly items: readonly CheckFindingSummary[];
}

/** One CheckFinding with its history, each list bounded by `detailHistory` with its total. */
export interface CheckFindingDetailView {
  readonly kind: 'detail';
  readonly view: typeof checkFindingViewVersion;
  readonly applied: number;
  readonly summary: CheckFindingSummary;
  readonly reports: { readonly total: number; readonly items: readonly CheckFindingReport[] };
  readonly decisions: { readonly total: number; readonly items: readonly CheckFindingDecision[] };
  /** Every current relation assessment that names it, the latest per pair. */
  readonly relations: readonly CheckFindingRelation[];
}

export type CheckFindingSelection =
  | { readonly ok: true; readonly view: CheckFindingListView | CheckFindingDetailView }
  | { readonly ok: false; readonly rejection: CheckFindingRejection };
