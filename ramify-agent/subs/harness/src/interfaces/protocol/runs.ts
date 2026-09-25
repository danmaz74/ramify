import { z } from 'zod';
import {
  respondToCheckFindingCommandSchema, revokeCheckFindingWaiverCommandSchema, waiveCheckFindingCommandSchema,
} from './check-findings.js';
import { moduleTreeResponseSchema, viewIdentitySchema } from './evidence.js';
import { jobIdSchema, planIdSchema } from './ids.js';
import { commandIdSchema, jobStateSchema, jobVersionSchema, stopJobCommandSchema } from './jobs.js';

/*
 * The public protocol of an implementation run: the command that starts
 * one, the roles it invokes, the reasons it can fail, and every answer a
 * client reads about it.
 *
 * Every answer here is a projection: a pure function of the run's log and
 * the records it committed, computed by the harness. The durable records
 * themselves stay private, and so does the internal event union: a
 * projected event names its transition, its references and its time, so the
 * log can change without changing the wire.
 *
 * Like every file beside it, it imports nothing but `zod` and its siblings,
 * so every export promises browser safety.
 */

/** A run's identifier is the job ID it was created with. */
export const runIdSchema = jobIdSchema;
export type RunId = z.infer<typeof runIdSchema>;

/**
 * The roles a run invokes. The long-lived global parent is no role: briefs
 * append to it without inference, and its maintenance is recorded against
 * the fork that performed it. A reviewer reads one frozen candidate beside
 * the run's one writer and writes nothing.
 */
export const roleSchema = z.enum([
  'initial-architect',
  'global-fork',
  'local-architect',
  'engineer',
  'contract-engineer',
  'reviewer',
]);
export type Role = z.infer<typeof roleSchema>;

/** The agent implementations a run may be started with. */
export const runAgentSchema = z.enum(['pi', 'scripted']);
export type RunAgent = z.infer<typeof runAgentSchema>;

/**
 * Starts an implementation run for a plan. It creates the run, so it expects
 * version 0. It carries nothing the harness will execute. With `reviewStop`
 * the run waits after its analysis is accepted until a person approves it or
 * stops the run; without it, which is the default, the run goes on.
 */
export const startRunCommandSchema = z.object({
  commandId: commandIdSchema,
  expectedVersion: jobVersionSchema,
  type: z.literal('start-run'),
  payload: z.object({ planId: planIdSchema, agent: runAgentSchema, reviewStop: z.boolean().default(false) }).strict(),
}).strict();
export type StartRunCommand = z.infer<typeof startRunCommandSchema>;

/**
 * A person approves the run's accepted analysis. At the review stop the run
 * goes on to readiness. Any other run records the approval and changes
 * nothing else: it is accepted before `final-verification` and after the run
 * completed, and refused a second time, before the analysis is accepted, and
 * for a run that failed, stopped or was interrupted. It expects the run's
 * current version.
 */
export const approveAnalysisCommandSchema = z.object({
  commandId: commandIdSchema,
  expectedVersion: jobVersionSchema,
  type: z.literal('approve-analysis'),
  payload: z.object({
    planId: planIdSchema,
    jobId: jobIdSchema,
    reviewer: z.string().min(1).max(200),
    note: z.string().max(4000).optional(),
  }).strict(),
}).strict();
export type ApproveAnalysisCommand = z.infer<typeof approveAnalysisCommandSchema>;

/**
 * The commands a run serves. `stop-job` is Plan 1's, unchanged: a run is a
 * job, and it takes over that lifecycle of commands, receipts, versions and
 * stop. The three CheckFinding commands are a person's answer, waiver and
 * revocation, each against a CheckFinding's revision.
 */
export const runCommandSchema = z.discriminatedUnion('type', [
  startRunCommandSchema, stopJobCommandSchema, approveAnalysisCommandSchema,
  respondToCheckFindingCommandSchema, waiveCheckFindingCommandSchema, revokeCheckFindingWaiverCommandSchema,
]);
/** A command as the harness receives it, with every default applied. */
export type RunCommand = z.infer<typeof runCommandSchema>;
/** A command as a client may send it: a field with a default may be left out. */
export type RunCommandInput = z.input<typeof runCommandSchema>;
export type RunCommandType = RunCommand['type'];

/**
 * Why a run failed. Each reason names what the harness established, never
 * what an agent said about it.
 */
export const runFailureReasonSchema = z.enum([
  /** The initial analysis could not be accepted. */
  'analysis-invalid',
  /** Readiness did not pass within its bounded recoveries. */
  'readiness-failed',
  /** Readiness found no valid `ramify-agent.json`, or support code it names outside every test area. */
  'project-config-invalid',
  /** Readiness found no `cucumber-js`, or an acceptance mode's command that does not resolve. */
  'acceptance-harness-missing',
  /** An agent session crashed or could not start. */
  'agent-failed',
  /** Every allowed submission of one invocation was invalid. */
  'invalid-submission',
  /** The plan or the source changed during the run. */
  'inputs-changed',
  /** A capability transitively depends on itself, and the same cycle recurred. */
  'dependency-cycle',
  /** A consumer requirement has no provider that can satisfy it. */
  'unresolvable-requirement',
  /** Repair rounds were spent without a passing gate. */
  'repair-exhausted',
  /**
   * A tracked scenario was not `implemented` before the final gate, or the
   * final gate's scenario check did not pass every one in full mode, or a
   * work item asked for completion with a scenario of its entry unfinished
   * more often than the bound allows.
   */
  'acceptance-incomplete',
  /** Infrastructure recoveries were spent without a running check. */
  'recovery-exhausted',
  /** A writer could not be confirmed settled, so no writer and no gate may follow. */
  'writer-unsettled',
  /** A whole-run bound was exceeded; the counter is the evidence. */
  'limit-exceeded',
  /** A fault in the harness itself. */
  'internal',
]);
export type RunFailureReason = z.infer<typeof runFailureReasonSchema>;

/**
 * Which part of a run's lifecycle it has reached. `awaiting-review` is the
 * review stop: the analysis is accepted, and the run waits for a person.
 */
export const runPhaseSchema = z.enum(['analysis', 'awaiting-review', 'readiness', 'working', 'final-verification', 'ended']);
export type RunPhase = z.infer<typeof runPhaseSchema>;

// The answers a client reads. Each one is a projection, never a record.

const text = z.string().min(1);
const timestamp = z.iso.datetime();
const count = z.int().nonnegative();

/**
 * Whether a person approved the run's analysis: `not-reviewed` until then,
 * and afterwards who approved it, when, and whether the run was working
 * while they did, rather than waiting at its review stop or complete.
 */
export const runReviewSchema = z.union([
  z.literal('not-reviewed'),
  z.object({ reviewer: text, at: timestamp, duringRun: z.boolean() }).strict(),
]);
export type RunReview = z.infer<typeof runReviewSchema>;

/** The most items each list query answers with, and the bound on a gate command's output tail. */
export const runQueryLimits = {
  runs: 200,
  events: 500,
  analysis: 500,
  decisions: 500,
  workItems: 200,
  capabilities: 500,
  /** Tracked scenarios of the scenario list and of the analysis's review. */
  scenarios: 500,
  /** Module-capability rows of one comparison, of the capabilities kept whole within `capabilities`. */
  moduleCapabilityRows: 2000,
  /** Bytes of a gate command's output a client receives; the complete output stays a file of the run. */
  outputTailBytes: 8 * 1024,
} as const;

/** The measurement policy the scope sizes were taken under. It is versioned apart from the KPIs. */
export const measurementPolicySchema = z.literal('scope-size/1');
/** The version of the KPI projection, versioned apart from the measurement policy. */
export const kpiPolicySchema = z.literal('kpi/1');
/** The version of the lineage measurements, versioned apart from the KPIs. */
export const lineagePolicySchema = z.literal('lineage/1');

const moduleNotice = <K extends 'module-created' | 'module-removed'>(kind: K) => z.object({
  kind: z.literal(kind),
  at: timestamp,
  sequence: z.int().positive(),
  summary: text,
  module: text,
  /** The `module.ramify` the accepted commit added or deleted. */
  declaration: text,
  commit: text,
  iteration: text,
  /** The placement decision that proposed it; null when none did, which the summary says. */
  decision: text.nullable(),
}).strict();

/**
 * Something the person must be told. Every module created or removed, read
 * from the accepted commit, and every detected dependency cycle, kept for
 * the whole run and after it, resolved or not.
 */
export const runNoticeSchema = z.discriminatedUnion('kind', [
  moduleNotice('module-created'),
  moduleNotice('module-removed'),
  z.object({
    kind: z.literal('dependency-cycle'),
    at: timestamp,
    sequence: z.int().positive(),
    summary: text,
    /** The capabilities of the cycle, in their normalized order. */
    cycle: z.array(text).min(1),
    /** The work item whose registration closed the cycle, whose architect re-planned. */
    closedBy: text,
    /** Whether the re-plan resolved it: that work item completed and the same cycle did not recur. */
    resolved: z.boolean(),
  }).strict(),
]);
export type RunNotice = z.infer<typeof runNoticeSchema>;
export type RunNoticeKind = RunNotice['kind'];

/**
 * The requests for a person's decision that the run's CheckFindings hold
 * open. A work item with one is held before its gate until a person
 * answers, with no time limit, and the run advances no further meanwhile.
 * A plan deviation's request holds nothing, except one recorded past the
 * run's limit, which holds the work item whose request it answered.
 * `waiting` says the run is held now: it is running, no stop was requested,
 * and a work item has an open request. A run with no CheckFinding, such as
 * one begun before CheckFindings existed, has none.
 */
export const runDecisionRequestsSchema = z.object({
  /** Every open request, a run-level CheckFinding's included. */
  open: count,
  waiting: z.boolean(),
  /** The work items with an open request, in the order of their CheckFindings' IDs. */
  workItems: z.array(z.object({
    workItem: text,
    requests: z.array(z.object({ checkFinding: text, request: text }).strict()).min(1),
  }).strict()),
}).strict();
export type RunDecisionRequests = z.infer<typeof runDecisionRequestsSchema>;

/**
 * The plan deviations a run recorded: departures from a requirement of its
 * plan that the global architect decided because the requirement could not
 * be met as written. None holds a work item or a gate, so a run that
 * recorded any completes "with N plan deviations to review", never plainly;
 * `toReview` counts those still awaiting the person's decision.
 */
export const runPlanDeviationsSchema = z.object({
  recorded: count,
  toReview: count,
}).strict();
export type RunPlanDeviations = z.infer<typeof runPlanDeviationsSchema>;

/**
 * A run as its log states it. Status lives in the log: every field here is
 * derived from the events the run committed, and nothing is stored.
 */
export const runSnapshotSchema = z.object({
  jobId: runIdSchema,
  planId: planIdSchema,
  agent: runAgentSchema,
  /** The sequence of the run's last event. */
  version: jobVersionSchema,
  state: jobStateSchema,
  phase: runPhaseSchema,
  /** A stop was accepted and the run has not ended yet. */
  stopRequested: z.boolean(),
  startedAt: timestamp,
  updatedAt: timestamp,
  endedAt: timestamp.nullable(),
  failure: z.object({ reason: runFailureReasonSchema, message: z.string(), evidence: z.array(z.string()) }).strict().nullable(),
  /** The invocation the run has open, with the work it belongs to. */
  current: z.object({
    workItem: text.optional(),
    iteration: text.optional(),
    request: text.optional(),
    role: roleSchema.optional(),
    invocation: text.optional(),
    waitingFor: text.optional(),
  }).strict().nullable(),
  /** Work items that yielded and wait for their providers, with what they wait for. */
  waits: z.array(z.object({ workItem: text, requirements: z.array(text), reason: text }).strict()),
  counts: z.object({
    workItems: count,
    completedWorkItems: count,
    openRequirements: count,
    invocations: count,
    readinessAttempts: count,
    gateAttempts: count,
    /** The tracked acceptance scenarios in each state. */
    scenarios: z.object({ pending: count, bound: count, declared: count, implemented: count }).strict(),
    /** Invocations whose executor started otherwise than the harness asked: a continuation or fork made fresh. */
    degradedStarts: count,
  }).strict(),
  /** The one writer: which invocation holds it, and an invocation whose release was not confirmed. */
  writer: z.object({ held: text.nullable(), unsettled: text.nullable() }).strict(),
  review: runReviewSchema,
  /** Module notices first, then cycles, each in the order the log established them. */
  notices: z.array(runNoticeSchema),
  decisionRequests: runDecisionRequestsSchema,
  planDeviations: runPlanDeviationsSchema,
}).strict();
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;

/** A run directory the harness does not serve, and why: it is reported, never left absent. */
export const unservedRunSchema = z.object({
  jobId: runIdSchema,
  /** The run's `job.json`, relative to the project root. */
  path: text,
  code: z.enum(['unsupported-version', 'unreadable']),
  message: text,
}).strict();
export type UnservedRun = z.infer<typeof unservedRunSchema>;

/** `GET /api/v1/plans/:planId/runs`: the plan's runs, newest first, at most 200. */
export const runListResponseSchema = z.object({
  runs: z.array(runSnapshotSchema).max(runQueryLimits.runs),
  total: count,
  /** The agent this harness starts runs with, or null when none is configured and no run can start. */
  agent: runAgentSchema.nullable(),
  unserved: z.array(unservedRunSchema),
}).strict();
export type RunListResponse = z.infer<typeof runListResponseSchema>;

/** `GET /api/v1/plans/:planId/runs/:runId`: one run's snapshot. */
export const runResponseSchema = z.object({ run: runSnapshotSchema }).strict();
export type RunResponse = z.infer<typeof runResponseSchema>;

/** What a projected event refers to. */
export const runEventRefKindSchema = z.enum([
  'work-item', 'iteration', 'invocation', 'gate', 'decision', 'request',
  'contract', 'obligation', 'requirement', 'capability', 'commit', 'scenario',
  'session',
]);
export type RunEventRefKind = z.infer<typeof runEventRefKindSchema>;

/**
 * One transition of the run, as a client reads it: its name, a sentence, the
 * records it refers to and its time. It is a projection of the log line and
 * carries no record body.
 */
export const projectedRunEventSchema = z.object({
  sequence: z.int().positive(),
  at: timestamp,
  transition: text,
  summary: text,
  refs: z.array(z.object({ kind: runEventRefKindSchema, id: text }).strict()),
}).strict();
export type ProjectedRunEvent = z.infer<typeof projectedRunEventSchema>;

/**
 * `GET /api/v1/plans/:planId/runs/:runId/events?after=<cursor>`: the run's
 * snapshot and at most 500 events after the cursor, in order. A client that
 * reconnects asks again from its last cursor.
 */
export const runEventPageSchema = z.object({
  run: runSnapshotSchema,
  events: z.array(projectedRunEventSchema).max(runQueryLimits.events),
  /** The cursor for the next fetch: the last returned sequence, or the request's. */
  cursor: jobVersionSchema,
  /** More events follow the returned ones. */
  more: z.boolean(),
}).strict();
export type RunEventPage = z.infer<typeof runEventPageSchema>;

const moduleProposalView = z.object({ parent: text, directory: text, purpose: text, tags: z.array(z.string()) }).strict();

/** One entry capability and the owner the initial analysis assigned it. */
export const entryViewSchema = z.object({
  capability: text,
  description: text,
  owner: text,
  /** The module the entry proposes, where its owner did not exist. */
  proposed: moduleProposalView.nullable(),
  /** The work item the entry created. */
  workItem: text.nullable(),
}).strict();
export type EntryView = z.infer<typeof entryViewSchema>;

export const hypothesisStandingSchema = z.enum(['tentative', 'confirmed', 'superseded']);
export type HypothesisStanding = z.infer<typeof hypothesisStandingSchema>;

/**
 * A hypothesis at its current revision, beside what it forecast at revision
 * 1, which is never rewritten. It is a forecast and never a commitment: no
 * work, obligation or completion requirement derives from it.
 */
export const hypothesisViewSchema = z.object({
  id: text,
  capability: text,
  revision: z.int().positive(),
  standing: hypothesisStandingSchema,
  change: text,
  /** Whether implementing the forecast capability is expected to change symbols that already have consumers. */
  changesExistingSymbols: z.boolean(),
  suggestedOwner: text,
  confidence: text,
  rationale: text,
  dependsOn: z.array(text),
  anticipatedConsumers: z.array(text),
  initial: z.object({ change: text, suggestedOwner: text, rationale: text }).strict(),
  /** The decisions that revised it, in order: the link to the decision list. */
  decisions: z.array(text),
  supersededBy: text.nullable(),
  confirmedBy: text.nullable(),
}).strict();
export type HypothesisView = z.infer<typeof hypothesisViewSchema>;

// The acceptance scenarios a run tracks, as the review and the scenario list read them.

/** Whether a scenario is one entry's, or a plan scenario that combines several entries. */
export const scenarioKindSchema = z.enum(['entry', 'integration']);
export type ScenarioKind = z.infer<typeof scenarioKindSchema>;

/**
 * Where a tracked scenario comes from: the plan, whose text is the
 * requirement, with the plan's lines; or the initial architect, with the
 * parts of the plan it cites.
 */
export const scenarioOriginViewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plan'), planScenario: text, lines: z.tuple([z.int().positive(), z.int().positive()]) }).strict(),
  z.object({
    kind: z.literal('architect'),
    refs: z.array(z.object({ anchor: text.optional(), lines: z.tuple([count, count]).optional() }).strict()),
  }).strict(),
]);
export type ScenarioOriginView = z.infer<typeof scenarioOriginViewSchema>;

/**
 * A tracked scenario's state: `pending` and `bound` keep the pending tag in
 * the source, `declared` waits for a gate to verify it, `implemented` passed
 * one. Only the harness moves a state.
 */
export const trackedScenarioStateSchema = z.enum(['pending', 'bound', 'declared', 'implemented']);
export type TrackedScenarioState = z.infer<typeof trackedScenarioStateSchema>;

/** One scenario's result in one Cucumber run: the worst of its steps. */
export const scenarioStatusSchema = z.enum(['passed', 'failed', 'undefined', 'pending', 'ambiguous', 'skipped']);
export type ScenarioStatus = z.infer<typeof scenarioStatusSchema>;

/** The execution mode of a scenario check, fixed for the whole check. */
export const scenarioCheckModeSchema = z.enum(['quick', 'full']);
export type ScenarioCheckMode = z.infer<typeof scenarioCheckModeSchema>;

/** The kinds of warning the accepted analysis recorded on its scenarios. */
export const scenarioWarningKindSchema = z.enum(['names-view-symbol', 'names-view-file', 'sub-scenario-shares-no-step', 'duplicate-architect-steps']);
export type ScenarioWarningKind = z.infer<typeof scenarioWarningKindSchema>;

/** A warning of the accepted analysis, never a rejection, with the scenarios it concerns. */
export const scenarioWarningViewSchema = z.object({
  kind: scenarioWarningKindSchema,
  scenarios: z.array(text),
  message: text,
}).strict();
export type ScenarioWarningView = z.infer<typeof scenarioWarningViewSchema>;

/**
 * One tracked scenario as the accepted analysis froze it, with its text: an
 * entry scenario with its entry, a sub-scenario with the integration scenario
 * it came from, and an integration scenario, whose text is the plan's, with
 * its sub-scenarios.
 */
export const analysisScenarioSchema = z.object({
  id: text,
  kind: scenarioKindSchema,
  /** The entry capability; null for an integration scenario. */
  entry: text.nullable(),
  owner: text,
  origin: scenarioOriginViewSchema,
  /** The integration scenario this one is a sub-scenario of. */
  partOf: text.nullable(),
  subScenarios: z.array(text),
  name: z.string(),
  /** The `Scenario` block as the feature file carries it, tags excluded. */
  source: z.array(z.string()),
  /** The feature file that carries it, relative to the project. */
  file: text,
}).strict();
export type AnalysisScenario = z.infer<typeof analysisScenarioSchema>;

/**
 * `GET /api/v1/plans/:planId/runs/:runId/analysis`: the captured plan, the
 * entry assignments with their owners, the hypotheses with their standing
 * and revision, and the tracked scenarios with the warnings the acceptance
 * recorded on them. `pending` until the analysis is accepted.
 */
export const analysisResponseSchema = z.object({
  plan: z.object({ markdown: z.string(), hash: text }).strict(),
  analysis: z.discriminatedUnion('status', [
    z.object({ status: z.literal('pending') }).strict(),
    z.object({
      status: z.literal('accepted'),
      view: viewIdentitySchema,
      entries: z.array(entryViewSchema).max(runQueryLimits.analysis),
      hypotheses: z.array(hypothesisViewSchema).max(runQueryLimits.analysis),
      /** Entry scenarios in the order the analysis submitted them, then integration scenarios. */
      scenarios: z.array(analysisScenarioSchema).max(runQueryLimits.scenarios),
      warnings: z.array(scenarioWarningViewSchema),
      total: z.object({ entries: count, hypotheses: count, scenarios: count }).strict(),
    }).strict(),
  ]),
}).strict();
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;

export const placementOutcomeViewSchema = z.enum(['reuse', 'create', 'extract', 'external']);

const decisionBase = { at: timestamp, sequence: z.int().positive(), workItem: text };

/**
 * One choice the run made, read from the record that holds it. There is no
 * second copy of any choice: a placement is its `PlacementDecision`, a scope
 * is its assignment, a breaking change and a plan revision are an outline,
 * and a contract design is its contract.
 */
export const decisionViewSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('placement'),
    ...decisionBase,
    id: text,
    authority: z.enum(['global', 'local']),
    /** The request the global architect answered; null for a local decision. */
    request: text.nullable(),
    question: text,
    outcome: placementOutcomeViewSchema,
    capability: text,
    /** Whether implementing it changes symbols that already have consumers. */
    changesExistingSymbols: z.boolean(),
    owner: text.nullable(),
    proposed: moduleProposalView.nullable(),
    rationale: text,
    revises: text.nullable(),
    /** The hypothesis revisions this decision made: the link to the analysis. */
    hypotheses: z.array(z.object({ id: text, revision: z.int().positive() }).strict()),
    registry: z.array(text),
  }).strict(),
  z.object({
    kind: z.literal('scope'),
    ...decisionBase,
    iteration: text,
    iterationKind: text,
    modules: z.array(text).min(1),
    includedChildren: z.array(text),
    /** An explicitly broad breaking scope, with its rationale. */
    broad: z.boolean(),
    rationale: text,
    extra: z.array(z.object({ path: text, purpose: text }).strict()),
    authorizations: z.array(z.object({ path: text, rationale: text, by: text }).strict()),
  }).strict(),
  z.object({
    kind: z.literal('breaking'),
    ...decisionBase,
    outlineRevision: z.int().positive(),
    guarantee: text,
    reason: text,
    affectedConsumers: z.array(text),
  }).strict(),
  z.object({
    kind: z.literal('plan-revision'),
    ...decisionBase,
    outlineRevision: z.int().positive(),
    decomposition: z.enum(['single-iteration', 'staged']),
    rationale: text,
    /** Why this revision differs from the last; the first outline has none. */
    reason: z.string(),
    stages: count,
  }).strict(),
  z.object({
    kind: z.literal('contract'),
    ...decisionBase,
    contract: text,
    revision: z.int().positive(),
    capability: text,
    provider: text,
    authority: z.object({ kind: z.enum(['provider', 'consumer', 'independent']), owner: text, rationale: text }).strict(),
    mode: z.enum(['fake-backed', 'access-only']),
    decision: text.nullable(),
    establishedBy: z.object({ iteration: text, gate: text }).strict(),
  }).strict(),
]);
export type DecisionView = z.infer<typeof decisionViewSchema>;
export type DecisionKind = DecisionView['kind'];

/** `GET /api/v1/plans/:planId/runs/:runId/decisions`: every choice, in the order it was committed. */
export const decisionListResponseSchema = z.object({
  decisions: z.array(decisionViewSchema).max(runQueryLimits.decisions),
  total: count,
}).strict();
export type DecisionListResponse = z.infer<typeof decisionListResponseSchema>;

export const workItemStateSchema = z.enum(['todo', 'working', 'yielded', 'completed']);
export type WorkItemState = z.infer<typeof workItemStateSchema>;

export const workItemSummarySchema = z.object({
  id: text,
  module: text,
  capability: text.nullable(),
  origin: z.enum(['entry', 'obligation', 'verification', 'integration']),
  goal: text,
  state: workItemStateSchema,
  /** A completed item this one follows up after its evidence was reopened. */
  follows: text.nullable(),
  /** The work item whose yield started this one. */
  startedFor: text.nullable(),
  currentIteration: text.nullable(),
  /** The requirements it waits for while yielded. */
  waitingFor: z.array(text),
  /** The passing work-item gate that completed it. */
  completedBy: text.nullable(),
  counts: z.object({ outlineRevisions: count, iterations: count, gateAttempts: count, invocations: count }).strict(),
}).strict();
export type WorkItemSummary = z.infer<typeof workItemSummarySchema>;

/** `GET /api/v1/plans/:planId/runs/:runId/work-items`: at most 200, in the order they were committed. */
export const workItemListResponseSchema = z.object({
  workItems: z.array(workItemSummarySchema).max(runQueryLimits.workItems),
  total: count,
}).strict();
export type WorkItemListResponse = z.infer<typeof workItemListResponseSchema>;

export const gateVerdictSchema = z.enum(['passed', 'failed', 'not-verified']);
export const gateCheckpointSchema = z.enum(['readiness', 'iteration', 'contract', 'breaking-iteration', 'work-item', 'final']);
export const gateCauseSchema = z.enum(['in-scope', 'infrastructure', 'timeout', 'invalid-session', 'outside-assignment', 'guarded-change', 'unknown']);
export const gateNextSchema = z.enum(['accept', 'repair', 'retry-infrastructure', 'return-to-local-architect', 'exhausted']);

const gateSummary = z.object({
  id: text,
  checkpoint: gateCheckpointSchema,
  verdict: gateVerdictSchema,
  cause: gateCauseSchema.nullable(),
  next: gateNextSchema,
  repairRound: count,
}).strict();

const scopeView = z.object({
  modules: z.array(text).min(1),
  includedChildren: z.array(text),
  broad: z.boolean(),
  rationale: text,
  extra: z.array(z.object({ path: text, purpose: text }).strict()),
  read: z.array(text),
}).strict();

/** `GET /api/v1/plans/:planId/runs/:runId/work-items/:workItem`: one work item's outlines, iterations, gates and requirements. */
export const workItemResponseSchema = z.object({
  workItem: workItemSummarySchema,
  outlines: z.array(z.object({
    revision: z.int().positive(),
    invocation: text,
    changes: text,
    decomposition: z.object({ kind: z.enum(['single-iteration', 'staged']), rationale: text }).strict(),
    stages: z.array(z.object({ title: text, approach: z.enum(['non-breaking', 'breaking']), dependsOn: z.array(count), note: z.string() }).strict()),
    breakingChanges: z.array(z.object({ guarantee: text, reason: text, affectedConsumers: z.array(text) }).strict()),
    reuse: z.array(z.object({ capability: text, owner: text, role: text }).strict()),
    revisionReason: z.string(),
    hypothesesSeen: z.array(z.object({ id: text, revision: count }).strict()),
  }).strict()),
  iterations: z.array(z.object({
    id: text,
    kind: text,
    stage: count,
    goal: text,
    approach: text,
    scope: scopeView,
    checkpoint: gateCheckpointSchema,
    completionEvidence: text,
    authorizations: z.array(z.object({ path: text, rationale: text, by: text }).strict()),
    result: z.object({
      outcome: z.enum(['accepted', 'partial', 'unsuitable', 'exhausted', 'superseded']),
      gate: text.nullable(),
      commit: text.nullable(),
      findings: z.array(z.string()),
      changedAssumptions: z.array(z.string()),
      recommendation: z.string().nullable(),
    }).strict().nullable(),
    gates: z.array(gateSummary),
    invocations: z.array(z.object({ id: text, role: roleSchema, ended: text.nullable(), outsideScope: z.array(text) }).strict()),
  }).strict()),
  /** The gates of the work item itself, beside its iterations' own. */
  gates: z.array(gateSummary),
  requirements: z.array(z.object({
    id: text,
    revision: z.int().positive(),
    obligation: text,
    consumer: text,
    forCapability: text,
    behavior: text,
    verified: z.boolean(),
  }).strict()),
  requests: z.array(z.object({
    id: text,
    question: text,
    requiredBehavior: text,
    forCapability: text,
    candidates: z.array(z.object({ capability: text.nullable(), owner: text.nullable(), note: text }).strict()),
    hypotheses: z.array(z.object({ id: text, revision: count, stance: z.enum(['supports', 'contradicts', 'departs']), evidence: text }).strict()),
    decision: text.nullable(),
  }).strict()),
}).strict();
export type WorkItemResponse = z.infer<typeof workItemResponseSchema>;

export const capabilityStateSchema = z.enum(['todo', 'working', 'completed']);
export type CapabilityState = z.infer<typeof capabilityStateSchema>;

/**
 * What the run has done about one capability. `completed` is stated only
 * with current verification evidence; a fake-backed pass is `working`, a
 * provider wait stays `working` with its reason, and a superseded
 * hypothesis leaves the list rather than becoming completed.
 */
export const capabilityProgressSchema = z.object({
  capability: text,
  owner: text,
  /** An entry capability of the plan. */
  entry: z.boolean(),
  /** Known from a hypothesis only: a forecast, never a commitment. */
  tentative: z.boolean(),
  state: capabilityStateSchema,
  reason: text,
  dependsOn: z.array(z.object({ capability: text, tentative: z.boolean() }).strict()),
  workItems: z.array(text),
  evidence: z.array(text),
  /** An entry's scenarios: how many are implemented of all it has. Null for a capability that is not an entry. */
  scenarios: z.object({ implemented: count, total: count }).strict().nullable(),
}).strict();
export type CapabilityProgress = z.infer<typeof capabilityProgressSchema>;

/** `GET /api/v1/plans/:planId/runs/:runId/capabilities`: registered capabilities first, forecast ones after. */
export const capabilityListResponseSchema = z.object({
  capabilities: z.array(capabilityProgressSchema).max(runQueryLimits.capabilities),
  total: count,
}).strict();
export type CapabilityListResponse = z.infer<typeof capabilityListResponseSchema>;

// The comparison of the initial analysis's module associations with the
// capabilities verified at their current owners.

/**
 * How a comparison identifies one capability across the initial analysis and
 * the run's registry: identical slugs are one capability. There is no fuzzy
 * or semantic matching, and a later policy gets a new version.
 */
export const comparisonIdentityPolicySchema = z.literal('exact-capability-slug/1');
export type ComparisonIdentityPolicy = z.infer<typeof comparisonIdentityPolicySchema>;

/**
 * Where a module is drawn. `declared`: it is in the returned tree. `proposed`:
 * it is absent from the tree and one recorded proposal supplies its parent,
 * itself declared or proposed. `unplaced`: anything else, including every
 * module while the tree is unavailable.
 */
export const modulePlacementSchema = z.enum(['declared', 'proposed', 'unplaced']);
export type ModulePlacement = z.infer<typeof modulePlacementSchema>;

/**
 * Why revision 1 of the initial analysis associated a capability with a
 * module: the entry assignment's owner, a hypothesis's suggested owner, or a
 * module a hypothesis explicitly involves. Anticipated consumers are none of
 * these.
 */
export const initialRoleSchema = z.enum(['entry-owner', 'suggested-owner', 'involved']);
export type InitialRole = z.infer<typeof initialRoleSchema>;

/** One association of revision 1: its role, and the hypothesis that made it, null for an entry assignment. */
export const initialAssociationSchema = z.object({
  role: initialRoleSchema,
  hypothesis: text.nullable(),
}).strict();
export type InitialAssociation = z.infer<typeof initialAssociationSchema>;

/**
 * One capability in one module. `initial` lists every revision-1 association
 * with this module, each once; `implementedHere` is set only when the
 * capability's current progress is registered, `completed` and owned by this
 * module, with that progress's reason and evidence.
 */
export const moduleCapabilityRowSchema = z.object({
  capability: text,
  initial: z.array(initialAssociationSchema),
  implementedHere: z.object({ reason: text, evidence: z.array(text) }).strict().nullable(),
}).strict().refine(row => row.initial.length > 0 || row.implementedHere !== null, {
  message: 'A row has an initial association, an implementation here, or both',
});
export type ModuleCapabilityRow = z.infer<typeof moduleCapabilityRowSchema>;

/** One module of the comparison, where it is drawn, what an entry proposed for it, and its rows. */
export const moduleCapabilitiesSchema = z.object({
  module: text,
  placement: modulePlacementSchema,
  /** The module one or more entry assignments proposed, when they agree; null otherwise. */
  proposedAtStart: z.object({ parent: text, purpose: text, tags: z.array(z.string()) }).strict().nullable(),
  capabilities: z.array(moduleCapabilityRowSchema),
}).strict();
export type ModuleCapabilities = z.infer<typeof moduleCapabilitiesSchema>;

/**
 * The comparison's only count and coverage statement. `complete` counts every
 * compared capability and those implemented; `partial` counts only what is
 * known, names each gap, and carries the total only when a bound dropped
 * capabilities; `unavailable` says why there is nothing to compare.
 */
export const comparisonCoverageSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('complete'), capabilities: count, implemented: count }).strict(),
  z.object({
    state: z.literal('partial'),
    knownCapabilities: count,
    knownImplemented: count,
    /** Every capability the comparison would hold, when a bound dropped some; null otherwise. */
    totalCapabilities: count.nullable(),
    gaps: z.array(text).min(1),
  }).strict(),
  z.object({ state: z.literal('unavailable'), reason: text }).strict(),
]);
export type ComparisonCoverage = z.infer<typeof comparisonCoverageSchema>;

/**
 * `GET /api/v1/plans/:planId/runs/:runId/module-capabilities`: the initial
 * analysis's module associations beside the capabilities verified at their
 * current owners, over one current module tree and one committed run
 * version. At most 500 capabilities and 2,000 rows; a capability is kept
 * with all of its rows or dropped whole.
 *
 * It names the compared states: the initial analysis's view, the tree's
 * revision and input, and the run version. Verified means verified in this
 * run; nothing here describes deployment.
 */
export const moduleCapabilityComparisonResponseSchema = z.object({
  identityPolicy: comparisonIdentityPolicySchema,
  runVersion: jobVersionSchema,
  initialView: viewIdentitySchema.nullable(),
  tree: moduleTreeResponseSchema.shape.tree,
  modules: z.array(moduleCapabilitiesSchema),
  coverage: comparisonCoverageSchema,
}).strict().superRefine((response, context) => {
  const issue = (message: string, path: PropertyKey[] = ['coverage']) => context.addIssue({ code: 'custom', message, path });
  const { coverage, modules } = response;

  if (coverage.state === 'unavailable') {
    if (response.initialView !== null) issue('An unavailable comparison has no initial view', ['initialView']);
    if (modules.length > 0) issue('An unavailable comparison has no modules', ['modules']);
    return;
  }
  if (response.initialView === null) issue('Only an unavailable comparison lacks the initial view', ['initialView']);

  const names = new Set<string>();
  const capabilities = new Set<string>();
  const implementedAt = new Map<string, string>();
  let rows = 0;
  for (const [index, entry] of modules.entries()) {
    if (names.has(entry.module)) issue(`Module ${entry.module} is listed twice`, ['modules', index]);
    names.add(entry.module);
    if (response.tree.status === 'unavailable' && entry.placement !== 'unplaced') {
      issue('While the tree is unavailable every module is unplaced', ['modules', index, 'placement']);
    }
    if (entry.placement === 'proposed' && entry.proposedAtStart === null) {
      issue('A proposed module is placed from its recorded proposal', ['modules', index, 'proposedAtStart']);
    }
    const seen = new Set<string>();
    for (const row of entry.capabilities) {
      rows += 1;
      if (seen.has(row.capability)) issue(`Capability ${row.capability} has two rows in ${entry.module}`, ['modules', index]);
      seen.add(row.capability);
      capabilities.add(row.capability);
      if (row.implementedHere === null) continue;
      const other = implementedAt.get(row.capability);
      if (other !== undefined) issue(`Capability ${row.capability} is implemented in both ${other} and ${entry.module}`, ['modules', index]);
      implementedAt.set(row.capability, entry.module);
    }
  }
  if (capabilities.size > runQueryLimits.capabilities) issue(`At most ${runQueryLimits.capabilities} capabilities`, ['modules']);
  if (rows > runQueryLimits.moduleCapabilityRows) issue(`At most ${runQueryLimits.moduleCapabilityRows} rows`, ['modules']);

  if (coverage.state === 'complete') {
    if (response.tree.status !== 'available') issue('A comparison over an unavailable tree is partial');
    if (modules.some(entry => entry.placement === 'unplaced')) issue('A complete comparison places every module');
    const limits = response.initialView?.status === 'materialized' ? response.initialView.coverageLimits : [];
    if (limits.length > 0) issue('A comparison whose initial view reports coverage limits is partial');
    if (coverage.capabilities !== capabilities.size) issue('The count is of the capabilities returned', ['coverage', 'capabilities']);
    if (coverage.implemented !== implementedAt.size) issue('The count is of the capabilities returned as implemented', ['coverage', 'implemented']);
    return;
  }
  if (coverage.knownCapabilities !== capabilities.size) issue('The known count is of the capabilities returned', ['coverage', 'knownCapabilities']);
  if (coverage.knownImplemented !== implementedAt.size) issue('The known count is of the capabilities returned as implemented', ['coverage', 'knownImplemented']);
  if (coverage.totalCapabilities !== null && coverage.totalCapabilities <= coverage.knownCapabilities) {
    issue('A total is given only when a bound dropped capabilities', ['coverage', 'totalCapabilities']);
  }
});
export type ModuleCapabilityComparisonResponse = z.infer<typeof moduleCapabilityComparisonResponseSchema>;

const tailBytes = (tail: string): number => new TextEncoder().encode(tail).byteLength;

/** A failing scenario's first failing step and its message. */
const scenarioFailureView = z.object({ step: z.string(), message: z.string() }).strict();

/**
 * What a `scenarios` command established, in compact form: its mode and
 * selection, each module's run by exit code, each tracked scenario's status
 * with its failure and undefined steps, the project's own scenarios by count,
 * and why the check did not pass. The bindings and message streams stay
 * files of the run.
 */
export const scenarioCheckViewSchema = z.object({
  mode: scenarioCheckModeSchema,
  selection: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('identity'), scenarios: z.array(text).min(1) }).strict(),
    z.object({ kind: z.literal('all-untagged') }).strict(),
    z.object({ kind: z.literal('all') }).strict(),
  ]),
  dryRun: z.boolean(),
  /** Tracked scenarios the runs' files held and the selection kept out. */
  excluded: count,
  runs: z.array(z.object({ module: text, exit: z.int().nullable() }).strict()),
  scenarios: z.array(z.object({
    id: text,
    /** The module whose run executed it. */
    run: text,
    status: scenarioStatusSchema,
    file: z.string(),
    line: z.int().positive(),
    failure: scenarioFailureView.nullable(),
    /** Step texts no definition matched. */
    undefined: z.array(z.string()),
  }).strict()),
  untracked: z.object({ passed: count, skipped: count, failed: count }).strict(),
  /** One line per reason the check did not pass; empty when it passed. */
  failures: z.array(z.string()),
}).strict();
export type ScenarioCheckView = z.infer<typeof scenarioCheckViewSchema>;

/** One gate attempt, with each command's output tail bounded at 8 KiB and its environment withheld. */
export const gateViewSchema = z.object({
  id: text,
  checkpoint: gateCheckpointSchema,
  subject: z.object({ workItem: text.optional(), iteration: text.optional() }).strict(),
  repairRound: count,
  infrastructureAttempt: count,
  head: z.string(),
  commit: text.nullable(),
  audited: text.nullable(),
  evidence: z.object({ runRef: text, reportCommit: text, treeRef: text }).strict().nullable(),
  verdict: gateVerdictSchema,
  cause: gateCauseSchema.nullable(),
  next: gateNextSchema,
  guardedChanges: z.array(z.object({
    path: text,
    before: z.string(),
    /** Null is a deletion, which is a change like any other. */
    after: z.string().nullable(),
    authorizedBy: z.object({ id: z.string(), revision: count }).strict().nullable(),
  }).strict()),
  rules: z.array(z.object({
    rule: text,
    outcome: z.enum(['passed', 'failed']),
    violations: z.array(z.object({ rule: text, path: text, detail: text }).strict()),
    /** What the rule could not establish, or found and did not attribute to this attempt. */
    limits: z.array(text).optional(),
  }).strict()),
  commands: z.array(z.object({
    kind: z.enum(['ramify-check', 'type-check', 'tests', 'conformance', 'scenarios']),
    argv: z.array(z.string()),
    cwd: text,
    startedAt: z.string(),
    elapsedMs: count,
    exitCode: z.int().nullable(),
    outcome: gateVerdictSchema,
    notVerified: z.enum(['timeout', 'runner-error', 'command-missing', 'empty-selection', 'interrupted', 'discovery-error', 'required-suite-missing']).nullable(),
    runnerError: z.object({ kind: z.string(), message: z.string() }).strict().nullable(),
    selection: z.object({
      policy: z.enum(['owned-by-scope', 'all-project']),
      exactOwners: z.array(z.string()),
      subtrees: z.array(z.string()),
      extraSuites: z.array(z.string()),
      resolved: z.array(z.string()),
    }).strict().nullable(),
    output: z.object({
      /** The complete output, a file of the run. */
      path: z.string(),
      bytes: count,
      truncated: z.boolean(),
      tail: z.string().refine(tail => tailBytes(tail) <= runQueryLimits.outputTailBytes, 'An output tail is at most 8 KiB'),
    }).strict(),
    /** A `scenarios` command's summary; null for every other kind, and for one that recorded none. */
    scenarios: scenarioCheckViewSchema.nullable(),
  }).strict()),
}).strict();
export type GateView = z.infer<typeof gateViewSchema>;

/** `GET /api/v1/plans/:planId/runs/:runId/gates/:gate`. */
export const gateResponseSchema = z.object({ gate: gateViewSchema }).strict();
export type GateResponse = z.infer<typeof gateResponseSchema>;

/** One gate attempt whose scenario check ran a tracked scenario, with the scenario's status there. */
export const scenarioGateResultSchema = z.object({
  gate: text,
  checkpoint: gateCheckpointSchema,
  subject: z.object({ workItem: text.optional(), iteration: text.optional() }).strict(),
  /** The attempt's verdict, which covers every check it ran. */
  verdict: gateVerdictSchema,
  mode: scenarioCheckModeSchema,
  dryRun: z.boolean(),
  status: scenarioStatusSchema,
  failure: scenarioFailureView.nullable(),
  undefined: z.array(z.string()),
}).strict();
export type ScenarioGateResult = z.infer<typeof scenarioGateResultSchema>;

/**
 * One tracked scenario as the run holds it now: its state, where it came
 * from, what it belongs to, who owns it and in which file, and every gate
 * attempt that ran it, in the order they were committed.
 */
export const scenarioViewSchema = z.object({
  id: text,
  kind: scenarioKindSchema,
  name: z.string(),
  state: trackedScenarioStateSchema,
  origin: scenarioOriginViewSchema,
  /** The entry capability; null for an integration scenario. */
  entry: text.nullable(),
  /** The integration scenario this one is a sub-scenario of. */
  partOf: text.nullable(),
  subScenarios: z.array(text),
  /**
   * The work item that binds it: its entry's, or for an integration scenario
   * the integration work item, null until its sub-scenarios are implemented.
   */
  workItem: text.nullable(),
  owner: text,
  file: text,
  /** The gate whose pass made it `implemented`; null while it is not. */
  implementedBy: text.nullable(),
  gates: z.array(scenarioGateResultSchema),
}).strict();
export type ScenarioView = z.infer<typeof scenarioViewSchema>;

/**
 * `GET /api/v1/plans/:planId/runs/:runId/scenarios`: every tracked scenario,
 * at most 500, entry scenarios first, then integration scenarios. Empty until
 * the analysis is accepted.
 */
export const scenarioListResponseSchema = z.object({
  scenarios: z.array(scenarioViewSchema).max(runQueryLimits.scenarios),
  total: count,
}).strict();
export type ScenarioListResponse = z.infer<typeof scenarioListResponseSchema>;

export const metricStateSchema = z.enum(['measured', 'partial', 'unavailable', 'not-applicable']);
export type MetricState = z.infer<typeof metricStateSchema>;

/**
 * One measurement under a policy. A missing observation is `unavailable`,
 * never zero; a zero denominator is `not-applicable`; a whole-run ratio over
 * partial coverage is `partial`, with the covered numerator and denominator
 * shown instead of a value. Only a `measured` metric has a value.
 */
const measurementSchema = <P extends z.ZodLiteral<string>>(policy: P) => z.object({
  id: text,
  unit: text,
  policyVersion: policy,
  /** The measurement policy of the sizes it reads, where it reads any. */
  measurementPolicy: measurementPolicySchema.nullable(),
  state: metricStateSchema,
  value: z.number().nullable(),
  numerator: z.number().nullable(),
  denominator: z.number().nullable(),
  /** What was measured where the total is unavailable. */
  subtotal: z.number().nullable(),
  coverage: z.object({ covered: count, total: count }).strict().nullable(),
  evidence: z.array(z.string()),
  /** What qualifies the figure, stated beside it. */
  note: z.string().nullable(),
}).strict().refine(metric => (metric.state === 'measured') === (metric.value !== null), {
  message: 'Only a measured metric has a value; any other state has none',
  path: ['value'],
});

/** One KPI, under `kpi/1`. */
export const metricSchema = measurementSchema(kpiPolicySchema);
export type Metric = z.infer<typeof metricSchema>;

/**
 * One lineage measurement, under `lineage/1`: a comparison of segments by
 * the start each one made, or a count of lineage relations. It reads no
 * scope size, so its `measurementPolicy` is null.
 */
export const lineageMetricSchema = measurementSchema(lineagePolicySchema);
export type LineageMetric = z.infer<typeof lineageMetricSchema>;

const verdictCounts = z.object({ allowed: count, 'blocked-scope': count, 'blocked-unresolved': count }).strict();

/**
 * Which tools were guarded and which only observed. `complete` is false
 * while an unguarded tool mutated, and then no count of blocked calls is
 * evidence that every write respected its scope; the statement says so.
 */
export const guardingViewSchema = z.object({
  guarded: z.array(text),
  unguarded: z.array(text),
  verdicts: verdictCounts,
  complete: z.boolean(),
  statement: text,
}).strict();
export type GuardingView = z.infer<typeof guardingViewSchema>;

/** One invocation's evaluation evidence: guarding, what changed outside its scope, hook checks and reads outside it. */
export const invocationEvaluationSchema = z.object({
  invocation: text,
  role: roleSchema,
  workItem: text.nullable(),
  iteration: text.nullable(),
  request: text.nullable(),
  ended: text.nullable(),
  writer: z.boolean(),
  guarding: guardingViewSchema,
  /** Writers only: uncommitted changed paths outside the write scope when it settled. */
  outsideScope: z.array(text),
  hookChecks: z.object({ passed: count, findings: count, notChecked: count, newFindings: count }).strict(),
  /** Modules this invocation read outside its declared scope, each once. */
  excursions: z.array(text),
  gaps: z.array(z.object({ kind: text, count: z.int().positive() }).strict()),
  /** The invocation's line events; null for an invocation that held no writer. */
  lines: z.object({
    coverage: z.enum(['complete', 'partial']),
    paths: count,
    added: count,
    deleted: count,
    gaps: z.array(z.string()),
  }).strict().nullable(),
  /** Tokens by category, never summed into a price; unavailable is not zero. */
  usage: z.union([
    z.object({ input: count, cacheRead: count, cacheWrite: count, output: count }).strict(),
    z.object({ unavailable: text }).strict(),
  ]),
}).strict();
export type InvocationEvaluation = z.infer<typeof invocationEvaluationSchema>;

/**
 * `GET /api/v1/plans/:planId/runs/:runId/metrics`: the KPIs with their
 * policy versions and coverage, the lineage measurements, and the
 * evaluation evidence beside them:
 * what was guarded, and every change outside a recorded write scope.
 */
export const metricsResponseSchema = z.object({
  policyVersion: kpiPolicySchema,
  measurementPolicy: measurementPolicySchema,
  /** The frozen baseline `B`, or why the producer gave none. */
  baseline: z.discriminatedUnion('state', [
    z.object({ state: z.literal('measured'), bytes: count, snapshot: text }).strict(),
    z.object({ state: z.literal('unavailable'), reason: text, subtotal: count.nullable() }).strict(),
  ]),
  metrics: z.array(metricSchema),
  /**
   * The lineage measurements: forks, continuations, repairs, degraded starts
   * and replacements, each segment classified by the start it made.
   */
  lineage: z.object({
    policyVersion: lineagePolicySchema,
    metrics: z.array(lineageMetricSchema),
  }).strict(),
  evaluation: z.object({
    guarding: guardingViewSchema,
    outsideScope: z.array(z.object({ invocation: text, role: roleSchema, workItem: text.nullable(), iteration: text.nullable(), path: text }).strict()),
    invocations: z.array(invocationEvaluationSchema),
  }).strict(),
}).strict();
export type MetricsResponse = z.infer<typeof metricsResponseSchema>;
