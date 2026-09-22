import { z } from 'zod';
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
 * the fork that performed it.
 */
export const roleSchema = z.enum([
  'initial-architect',
  'global-fork',
  'local-architect',
  'engineer',
  'contract-engineer',
]);
export type Role = z.infer<typeof roleSchema>;

/** The agent implementations a run may be started with. */
export const runAgentSchema = z.enum(['pi', 'scripted']);
export type RunAgent = z.infer<typeof runAgentSchema>;

/**
 * Starts an implementation run for a plan. It creates the run, so it expects
 * version 0. It carries nothing the harness will execute.
 */
export const startRunCommandSchema = z.object({
  commandId: commandIdSchema,
  expectedVersion: jobVersionSchema,
  type: z.literal('start-run'),
  payload: z.object({ planId: planIdSchema, agent: runAgentSchema }).strict(),
}).strict();
export type StartRunCommand = z.infer<typeof startRunCommandSchema>;

/**
 * The commands a run serves. `stop-job` is Plan 1's, unchanged: a run is a
 * job, and it takes over that lifecycle of commands, receipts, versions and
 * stop.
 */
export const runCommandSchema = z.discriminatedUnion('type', [startRunCommandSchema, stopJobCommandSchema]);
export type RunCommand = z.infer<typeof runCommandSchema>;
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

/** Which part of a run's lifecycle it has reached. */
export const runPhaseSchema = z.enum(['analysis', 'readiness', 'working', 'final-verification', 'ended']);
export type RunPhase = z.infer<typeof runPhaseSchema>;

// The answers a client reads. Each one is a projection, never a record.

const text = z.string().min(1);
const timestamp = z.iso.datetime();
const count = z.int().nonnegative();

/** The most items each list query answers with, and the bound on a gate command's output tail. */
export const runQueryLimits = {
  runs: 200,
  events: 500,
  analysis: 500,
  decisions: 500,
  workItems: 200,
  capabilities: 500,
  /** Module-capability rows of one comparison, of the capabilities kept whole within `capabilities`. */
  moduleCapabilityRows: 2000,
  /** Bytes of a gate command's output a client receives; the complete output stays a file of the run. */
  outputTailBytes: 8 * 1024,
} as const;

/** The measurement policy the scope sizes were taken under. It is versioned apart from the KPIs. */
export const measurementPolicySchema = z.literal('scope-size/1');
/** The version of the KPI projection, versioned apart from the measurement policy. */
export const kpiPolicySchema = z.literal('kpi/1');

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
  }).strict(),
  /** The one writer: which invocation holds it, and an invocation whose release was not confirmed. */
  writer: z.object({ held: text.nullable(), unsettled: text.nullable() }).strict(),
  /** Module notices first, then cycles, each in the order the log established them. */
  notices: z.array(runNoticeSchema),
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
  'contract', 'obligation', 'requirement', 'capability', 'commit',
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

/**
 * `GET /api/v1/plans/:planId/runs/:runId/analysis`: the captured plan, the
 * entry assignments with their owners and the hypotheses with their standing
 * and revision. `pending` until the analysis is accepted.
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
      total: z.object({ entries: count, hypotheses: count }).strict(),
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
  origin: z.enum(['entry', 'obligation', 'verification']),
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

/** One gate attempt, with each command's output tail bounded at 8 KiB and its environment withheld. */
export const gateViewSchema = z.object({
  id: text,
  checkpoint: gateCheckpointSchema,
  subject: z.object({ workItem: text.optional(), iteration: text.optional() }).strict(),
  repairRound: count,
  infrastructureAttempt: count,
  head: z.string(),
  commit: text.nullable(),
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
  }).strict()),
  commands: z.array(z.object({
    kind: z.enum(['ramify-check', 'type-check', 'tests', 'conformance']),
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
  }).strict()),
}).strict();
export type GateView = z.infer<typeof gateViewSchema>;

/** `GET /api/v1/plans/:planId/runs/:runId/gates/:gate`. */
export const gateResponseSchema = z.object({ gate: gateViewSchema }).strict();
export type GateResponse = z.infer<typeof gateResponseSchema>;

export const metricStateSchema = z.enum(['measured', 'partial', 'unavailable', 'not-applicable']);
export type MetricState = z.infer<typeof metricStateSchema>;

/**
 * One KPI. A missing observation is `unavailable`, never zero; a zero
 * denominator is `not-applicable`; a whole-run ratio over partial coverage
 * is `partial`, with the covered numerator and denominator shown instead of
 * a value. Only a `measured` metric has a value.
 */
export const metricSchema = z.object({
  id: text,
  unit: text,
  policyVersion: kpiPolicySchema,
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
export type Metric = z.infer<typeof metricSchema>;

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
 * policy versions and coverage, and the evaluation evidence beside them:
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
  evaluation: z.object({
    guarding: guardingViewSchema,
    outsideScope: z.array(z.object({ invocation: text, role: roleSchema, workItem: text.nullable(), iteration: text.nullable(), path: text }).strict()),
    invocations: z.array(invocationEvaluationSchema),
  }).strict(),
}).strict();
export type MetricsResponse = z.infer<typeof metricsResponseSchema>;
