import { z } from 'zod';
import { join } from 'node:path';
import { citationSchema, inputManifestSchema, modulePathSchema, sha256Schema, viewIdentitySchema } from '../interfaces/protocol/evidence.js';
import { jobIdSchema, planIdSchema } from '../interfaces/protocol/ids.js';
import { roleSchema, runAgentSchema, type Role } from '../interfaces/protocol/runs.js';
import { jobSchemaVersion, jobsDirectory } from '../jobs/records.js';
import type { GateAttempt } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { planScenarioExtractionSchema } from '../../subs/scenarios/src/extraction.js';
import { scenarioRecordSchema } from '../../subs/scenarios/src/records.js';
import { scenarioModeSchema, scenarioSelectionSchema } from '../../subs/scenarios/src/profiles.js';
import { scenarioRunResultSchema, untrackedScenarioCountsSchema } from '../../subs/scenarios/src/messages.js';
import { documentManifestSchema, catalogSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { assessmentSchema, roundSchema } from '../../subs/nonfunctional/src/interfaces/contracts.js';
import { incorporationSchema } from '../analysis/evidence-contracts.js';
import { contextSelectionSchema, assignmentContextSchema } from '../context-selection/contracts.js';
import { preparedCandidateSchema, nonfunctionalDeviationSchema, nonfunctionalRepairAssignmentSchema } from './nonfunctional-records.js';

/*
 * The durable records of one implementation run, and where each of them is
 * materialized beneath the run's directory. Every one of them is an
 * immutable file committed by one run-log event; a change is a new revision
 * in a new file, and no record carries a status field.
 *
 * The record types are the core records proposal's. The schemas are here and
 * not beside the types they mirror, because persisting a record is the run's
 * concern: `checks/records.ts` describes a gate attempt and returns it, and
 * it is this file that reads one back.
 */

// Identifiers. Each is derived by the harness from committed state, so a step
// repeated after a crash derives the same one.

/** `inv-0007`, the count of committed invocations of the run. */
export type InvocationId = string;
/** `rec-0004`, the count of committed infrastructure recoveries. */
export type RecoveryId = string;
/** `ms-0007`, the count of committed measurement snapshots. */
export type SnapshotId = string;
/** `ses-0003`, the count of committed `session-opened` events of the run. */
export type SessionId = string;

const counted = (prefix: string, width: number) => (count: number): string => `${prefix}-${String(count).padStart(width, '0')}`;

export const invocationId = counted('inv', 4);
export const gateAttemptId = counted('ga', 4);
export const recoveryId = counted('rec', 4);
export const snapshotId = counted('ms', 4);
export const sessionId = counted('ses', 4);

/** A run's session identifier, as its log records it. */
export const sessionIdSchema = z.string().regex(/^ses-\d{4,}$/);

/**
 * Why the harness finished a session: its iteration or work item closed, its
 * run ended, the agent can no longer read it, a session reconstructed from
 * records took its place, recovery closed its interrupted invocation, or the
 * harness has no further use for it.
 */
export const sessionFinishReasonSchema = z.enum(['work-closed', 'run-ended', 'lost', 'replaced', 'interrupted', 'not-kept']);
export type SessionFinishReason = z.infer<typeof sessionFinishReasonSchema>;

/** A readiness attempt's directory name, `01`. */
export const readinessDirectory = (attempt: number): string => String(attempt).padStart(2, '0');

// The run's own record.

/** How a session of one invocation started, as the port names it. */
export const sessionModeSchema = z.enum(['fresh', 'continued', 'fork']);
export type SessionMode = z.infer<typeof sessionModeSchema>;

const timestamp = z.iso.datetime();
const text = z.string().min(1);

/**
 * One external command, with the environment the harness built for it named
 * and not quoted. `env` is the sorted names of the variables its child
 * receives and `envAdditions` the harness's own settings; `checks/records.ts`
 * says why.
 *
 * A command recorded before this harness recorded names holds `env` as a
 * name-to-value map. It is read as the names it maps, which is the whole of
 * what this harness now keeps of one: a version bump for it alone would have
 * made every recorded run unreadable to gain nothing, since no reader wanted
 * the values.
 * Its settings are not recoverable from such a map and are read as none.
 */
export const checkCommandSchema = z.object({
  argv: z.array(z.string()),
  cwd: text,
  env: z.union([
    z.array(z.string()),
    z.record(z.string(), z.string()).transform(recorded => Object.keys(recorded).sort()),
  ]),
  envAdditions: z.record(z.string(), z.string()).default({}),
  timeoutMs: z.int().positive(),
}).strict();

/** The context and compaction policy of one role. */
export const contextPolicySchema = z.object({
  compaction: z.enum(['forbidden', 'allowed']),
  budgetTokens: z.int().positive().nullable(),
  budgetFraction: z.number().positive().max(1).nullable(),
  reportReserveTokens: z.int().nonnegative(),
}).strict();

/** The review questions a run can ask of one audited iteration candidate. */
export const reviewKindSchema = z.enum(['code', 'scope', 'design']);
export type ReviewKind = z.infer<typeof reviewKindSchema>;

/** The version of the review policy and prompt contract a request is keyed by. */
export const reviewPolicyVersion = 'review-policy/1';

/**
 * How a run reviews its passing iterations: which questions, how many
 * readers beside the one writer, how many requests may wait, how many
 * retries follow an execution or validation failure, how long one attempt
 * may run, how long a work item waits for its reviews from its completion
 * request, and how many concerns one submission may carry.
 */
export const reviewPolicySchema = z.object({
  version: z.literal(reviewPolicyVersion),
  kinds: z.array(reviewKindSchema).min(1),
  concurrency: z.int().positive(),
  queue: z.int().positive(),
  retries: z.int().nonnegative(),
  attemptMs: z.int().positive(),
  settleMs: z.int().positive(),
  maxConcerns: z.int().positive(),
}).strict();
export type ReviewPolicy = z.infer<typeof reviewPolicySchema>;

/**
 * The bounds and commands a run ran under, captured in `job.json` and not
 * configurable while it runs, so that an exhaustion is reproducible.
 */
export const runPolicySchema = z.object({
  version: text,
  limits: z.object({
    repairRoundsPerIteration: z.int().positive(),
    repairRoundsPerWorkItemGate: z.int().positive(),
    infrastructureRetriesPerGate: z.int().positive(),
    forkRetriesPerRequest: z.int().positive(),
    budgetReturnsPerIteration: z.int().positive(),
    sessionReconstructionsPerWork: z.int().positive(),
    cycleReplansPerWorkItem: z.int().positive(),
    rejectedSubmissionsPerTurn: z.int().positive(),
    rejectedToolInputsPerTurn: z.int().positive(),
    readinessRecoveries: z.int().positive(),
    stopSettleMs: z.int().positive(),
    writerSettleMs: z.int().positive(),
    invocationIdleMs: z.int().positive(),
    invocationAbsoluteMs: z.int().positive(),
    maxIterationsPerWorkItem: z.int().positive(),
    maxWorkItems: z.int().positive(),
    maxPlacementRequests: z.int().positive(),
    maxInvocationsPerRun: z.int().positive(),
    runAbsoluteMs: z.int().positive(),
    /** Assessment and correction rounds of one work item's reconciliation; absent before `run-policy/3`. */
    reconciliationRoundsPerWorkItem: z.int().positive().optional(),
    /** The least risk a correction after a work item's first reconciliation round may be planned for; absent before iteration 5. */
    laterRoundMinimumRisk: z.enum(['medium', 'high']).optional(),
    /** The plan deviations a run records before the next one waits for the person; absent before plan deviations existed, which means five. */
    maxPlanDeviations: z.int().nonnegative().optional(),
    /**
     * The longest one shell command of an engineer may run unless its
     * assignment raises it; absent before assignments could raise bounds,
     * which means the shell's own maximum.
     */
    commandTimeoutMs: z.int().positive().optional(),
    /**
     * The ceilings an assignment may raise an engineer's bounds to: one
     * shell command, the idle bound and the absolute bound of each of its
     * invocations. Absent before assignments could raise bounds, which means
     * the defaults of `run/policy.ts`.
     */
    maxCommandTimeoutMs: z.int().positive().optional(),
    maxInvocationIdleMs: z.int().positive().optional(),
    maxInvocationAbsoluteMs: z.int().positive().optional(),
    /** Absent on earlier runs, whose non-functional coverage is unavailable. */
    nonfunctionalRoundsPerPlan: z.int().positive().max(3).optional(),
  }).strict(),
  /**
   * The context policy of each role. The reviewer's is absent from a run
   * captured before `run-policy/3`, which reviews nothing; every other role
   * must have one.
   */
  context: z.object({
    'initial-architect': contextPolicySchema,
    'global-fork': contextPolicySchema,
    'local-architect': contextPolicySchema,
    engineer: contextPolicySchema,
    'contract-engineer': contextPolicySchema,
    reviewer: contextPolicySchema.optional(),
    /** Absent from a run captured before failure analysis existed, which analyzes nothing. */
    'failure-analyst': contextPolicySchema.optional(),
    /** Absent before Plan 13. */
    'context-selector': contextPolicySchema.optional(),
    'nonfunctional-coordinator': contextPolicySchema.optional(),
    'nonfunctional-repair-engineer': contextPolicySchema.optional(),
  }).strict() satisfies z.ZodType<Partial<Record<Role, z.infer<typeof contextPolicySchema>>>>,
  /** A transcript body larger than `inlineBodyBytes` is stored in the content store, not in its entry. */
  transcript: z.object({ inlineBodyBytes: z.int().positive() }).strict(),
  /**
   * The iteration reviews a run requests and how it runs them. A policy
   * without it records no review request, and every review coverage view of
   * the run answers unavailable, never clean.
   */
  reviews: reviewPolicySchema.optional(),
  commands: z.object({
    typeCheck: checkCommandSchema,
    allTests: checkCommandSchema,
    /** The scoped test run's template; the resolved files follow its argv. */
    scopedTests: checkCommandSchema,
    ramifyCheck: checkCommandSchema,
    ramifyChanged: checkCommandSchema,
    hookTimeoutMs: z.int().positive(),
    /** Independent nested packages that readiness verifies and gates include. */
    nestedPackages: z.array(z.object({
      directory: text,
      install: checkCommandSchema,
      tests: checkCommandSchema.nullable(),
    }).strict()),
  }).strict(),
}).strict();
export type RunPolicy = z.infer<typeof runPolicySchema>;
export type CheckCommandRecord = z.infer<typeof checkCommandSchema>;

// The project's configuration.

/** The version a project's `ramify-agent.json` declares. */
export const projectConfigVersion = 'ramify-agent.project/1';

/** An argv the harness runs as it stands, with its first element the executable or `npm`. */
const argvSchema = z.array(text).min(1);

/** One execution mode of the project's scenario harness. */
export const acceptanceModeSchema = z.object({
  /** Starts `cucumber-js` in this mode and passes the harness's own arguments through. */
  command: argvSchema,
  /** Run once per gate attempt before the mode's first run. */
  setup: argvSchema.optional(),
  /** Run once per gate attempt after the mode's last run. */
  teardown: argvSchema.optional(),
}).strict();
export type AcceptanceMode = z.infer<typeof acceptanceModeSchema>;

/** Whether readiness loads full mode with `--dry-run` or executes it. */
export const fullModeReadinessSchema = z.enum(['dry-run', 'run']);

/** The longest a project may give one gate command: two hours. */
export const projectCommandTimeoutCeilingMs = 7_200_000;

const projectTimeout = z.int().positive().max(projectCommandTimeoutCeilingMs, {
  error: `A command timeout is at most ${projectCommandTimeoutCeilingMs} ms (two hours)`,
});

/** The formats of a type checker's output the gate reads error locations from. */
export const typeCheckOutputSchema = z.enum(['tsc']);

/** A project-relative directory inside the project: no absolute path, no drive and no `..` segment. */
const projectDirectorySchema = z.string().refine(value => {
  const normalized = value.replaceAll('\\', '/');
  return !normalized.startsWith('/') && !/^[A-Za-z]:/u.test(normalized) && !normalized.split('/').includes('..');
}, 'must be a relative directory inside the project');

/**
 * One command that prepares the project before a gate's checks run, such as
 * its build. `command` is the argv as it stands; `cwd` is relative to the
 * project root, which it defaults to; `env` is added to the environment the
 * harness builds for every command.
 */
export const setupCommandSchema = z.object({
  /** Labels the command in records and pages; `build` is shown as the build. */
  name: text.optional(),
  command: argvSchema,
  cwd: projectDirectorySchema.optional(),
  /** Positive milliseconds; ten minutes where it is not declared. */
  timeoutMs: z.int().positive().optional(),
  env: z.record(text, z.string()).optional(),
}).strict();
export type SetupCommandConfig = z.infer<typeof setupCommandSchema>;

/**
 * `ramify-agent.json`, the target project's configuration for the harness:
 * only what the harness cannot derive. In v1 that is the scenario harness,
 * the support code Cucumber imports before any step file and the command of
 * each execution mode, and, optionally, the format of what the type check
 * prints and the setup commands every gate runs first.
 */
export const projectConfigSchema = z.object({
  schema: z.literal(projectConfigVersion),
  /**
   * The project's type check. `output` declares the format it prints, from
   * which a failed type check is attributed by the locations of its errors;
   * without it, by which commands failed.
   */
  typeCheck: z.object({ output: typeCheckOutputSchema.optional() }).strict().optional(),
  /**
   * The timeouts of the gate's commands for this project, in milliseconds,
   * each replacing the harness's own: the type check, the project's tests
   * (and each nested package's), the scoped test run and the complete
   * Ramify check. Each is bounded by `projectCommandTimeoutCeilingMs`.
   */
  timeouts: z.object({
    typeCheck: projectTimeout.optional(),
    tests: projectTimeout.optional(),
    scopedTests: projectTimeout.optional(),
    ramifyCheck: projectTimeout.optional(),
  }).strict().optional(),
  /**
   * The project's setup commands, run in order before every gate's checks:
   * in place at the project root, and by ramify-audit in the worktree of an
   * audited commit, whose ignored build outputs are otherwise absent. Each
   * carries its own bound, which `timeouts` does not replace.
   */
  setup: z.array(setupCommandSchema).optional(),
  acceptance: z.object({
    /** Project-relative files or globs, imported in order before any step file. */
    support: z.array(text),
    modes: z.object({
      quick: acceptanceModeSchema,
      full: z.object({
        command: argvSchema,
        setup: argvSchema.optional(),
        teardown: argvSchema.optional(),
        readiness: fullModeReadinessSchema.default('dry-run'),
      }).strict(),
    }).strict(),
  }).strict(),
}).strict();
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/**
 * The configuration as `start-run` found it, captured in `job.json`: the
 * validated file with its hash, or why there is none. An invalid or missing
 * file is not a refusal to start; readiness reports it.
 */
export const capturedProjectConfigSchema = z.union([
  z.object({ path: text, hash: sha256Schema, config: projectConfigSchema }).strict(),
  z.object({ path: text, hash: sha256Schema.nullable(), invalid: text }).strict(),
]);
export type CapturedProjectConfig = z.infer<typeof capturedProjectConfigSchema>;

/** A committed record at one revision; `hash` is the SHA-256 of the file's bytes. */
export const recordRefSchema = z.object({ id: z.string(), revision: z.int().nonnegative(), hash: sha256Schema }).strict();
export type RecordRef = z.infer<typeof recordRefSchema>;

/** `job.json` of a run. Written once, before the first event. */
export const runRecordSchema = z.object({
  schema: z.literal(jobSchemaVersion),
  jobId: jobIdSchema,
  planId: planIdSchema,
  kind: z.literal('implementation'),
  agent: runAgentSchema,
  createdAt: timestamp,
  manifest: inputManifestSchema,
  /** Prompt and skill packages by role, each a content hash. A role without a package has none yet. */
  prompts: z.partialRecord(roleSchema, z.object({ package: text, hash: sha256Schema }).strict()),
  policy: runPolicySchema,
  /** The project's `ramify-agent.json`, validated or with the reason it is not. */
  projectConfig: capturedProjectConfigSchema,
  /** The frozen measurement baseline B, or the reason the producer gave none. */
  baseline: z.union([
    z.object({ measurement: recordRefSchema }).strict(),
    z.object({ unavailable: text }).strict(),
  ]),
  /**
   * The plan scenarios extracted from the captured plan's `gherkin` blocks,
   * `ps-01`, … in document order, and every block that did not parse as a
   * limitation. Captured with the plan and never revised.
   */
  planScenarios: planScenarioExtractionSchema,
  /**
   * Whether the run waits at its review stop after the analysis is accepted,
   * as `start-run` asked. The review itself is a transition of the log,
   * `analysis-approved`, never a field here: this record is written once.
   */
  reviewStop: z.boolean(),
}).strict();
export type RunRecord = z.infer<typeof runRecordSchema>;

// The prompt packages.

export const promptPackageManifestSchema = z.object({
  schema: z.literal('ramify-agent.prompt-manifest/1'),
  packages: z.partialRecord(roleSchema, z.object({
    package: text,
    hash: sha256Schema,
    files: z.array(z.object({
      path: text,
      hash: sha256Schema,
      kind: z.enum(['system', 'procedure', 'skill', 'submission-schema']),
    }).strict()),
    /** The submission union members this package offers the role. */
    submissionKinds: z.array(text),
  }).strict()),
}).strict();
export type PromptPackageManifest = z.infer<typeof promptPackageManifestSchema>;

// The initial analysis.

/** A heading anchor or line range of the captured plan. */
export const planRefSchema = z.object({
  /** Absent on old runs: resolve against the captured root plan. */
  document: z.string().regex(/^doc-\d{3,}$/).optional(),
  anchor: text.optional(),
  lines: z.tuple([z.int().nonnegative(), z.int().nonnegative()]).optional(),
}).strict();

export const moduleProposalSchema = z.object({
  parent: modulePathSchema,
  directory: text,
  purpose: text,
  tags: z.array(z.string()),
}).strict();
export type ModuleProposal = z.infer<typeof moduleProposalSchema>;

export const entryAssignmentsSchema = z.object({
  schema: z.literal('ramify-agent.entry-assignments/1'),
  view: viewIdentitySchema,
  entries: z.array(z.object({
    capability: text,
    description: text,
    owner: modulePathSchema,
    proposed: moduleProposalSchema.optional(),
    requirementRefs: z.array(planRefSchema),
    acceptanceRefs: z.array(planRefSchema),
    citations: z.array(citationSchema),
  }).strict()),
}).strict();
export type EntryAssignments = z.infer<typeof entryAssignmentsSchema>;

// Readiness and its recoveries.

/**
 * The steps readiness verifies. The attempt records the six the baseline
 * gate verifies, the project's setup first and the two acceptance steps
 * among them, after `ramify-daemon`, where they run, and `run-branch`, the
 * run branch created and checked out, last of all.
 */
export const readinessSteps = [
  'project-root', 'git-clean', 'compiler-config', 'test-runner', 'project-config', 'acceptance-runner',
  'baseline-acceptance', 'acceptance-full', 'nested-packages',
  'test-discovery', 'ramify-daemon', 'baseline-setup', 'baseline-tests', 'baseline-type-check', 'baseline-ramify-check',
  'run-branch',
] as const;
export const readinessStepSchema = z.enum(readinessSteps);
export type ReadinessStep = z.infer<typeof readinessStepSchema>;

export const readinessAttemptSchema = z.object({
  schema: z.literal('ramify-agent.readiness-attempt/1'),
  /** The count of committed readiness attempts, this one included. */
  attempt: z.int().positive(),
  /** The commit readiness ran on. */
  head: z.string(),
  steps: z.array(z.object({
    step: readinessStepSchema,
    outcome: z.enum(['passed', 'failed', 'not-verified']),
    detail: z.string(),
    command: checkCommandSchema.optional(),
    gate: text.optional(),
  }).strict()),
  /** Independent nested packages found, and what each one answered. */
  nested: z.array(z.object({
    directory: text,
    manifest: text,
    installed: z.boolean(),
    testScript: z.string().nullable(),
  }).strict()),
  verdict: z.enum(['passed', 'failed']),
  /** The recovery attempted after a failure; null when the failure was not recoverable. */
  recovery: z.string().nullable(),
}).strict();
export type ReadinessAttempt = z.infer<typeof readinessAttemptSchema>;

export const infrastructureRecoverySchema = z.object({
  schema: z.literal('ramify-agent.infrastructure-recovery/1'),
  id: text,
  subject: z.object({
    gate: text.optional(),
    readiness: z.int().positive().optional(),
    invocation: text.optional(),
  }).strict(),
  cause: z.enum(['in-scope', 'infrastructure', 'timeout', 'invalid-session', 'outside-assignment', 'guarded-change', 'unknown', 'session-lost', 'daemon-unavailable']),
  action: z.enum(['restart-daemon', 'reinstall-nested', 'rerun-command', 'reconstruct-session', 'none']),
  /** Counted over committed history for this subject. */
  attempt: z.int().positive(),
  outcome: z.enum(['recovered', 'failed']),
  /** Command output file references. */
  evidence: z.array(z.string()),
}).strict();
export type InfrastructureRecovery = z.infer<typeof infrastructureRecoverySchema>;

// Measurements.

export const measurementSnapshotSchema = z.object({
  schema: z.literal('ramify-agent.measurement-snapshot/1'),
  id: text,
  policy: z.literal('scope-size/1'),
  /** The run branch's head when it was taken. */
  head: z.string(),
  /** The captured `ramify.measure/1` document, verbatim, with its revision. */
  measure: z.union([
    z.object({ revision: z.string(), document: z.unknown(), hash: sha256Schema }).strict(),
    z.object({ unavailable: text }).strict(),
  ]),
  view: viewIdentitySchema.nullable(),
  /** Supplementary bytes outside Ramify's inventory: prompts, skills, the captured plan. */
  supplementary: z.array(z.object({ path: text, bytes: z.int().nonnegative() }).strict()),
}).strict();
export type MeasurementSnapshot = z.infer<typeof measurementSnapshotSchema>;

/**
 * One component of `S_s`, the scope size of one invocation. A component
 * whose source the snapshot does not hold is `unavailable` with its reason:
 * the total is then unavailable with its known subtotal beside it, never a
 * zero, and a proposed module's size is unknown.
 */
export const scopeComponentSchema = z.object({
  component: z.enum(['owned-source', 'api-views', 'architect-view', 'support-documents']),
  detail: z.string(),
  bytes: z.int().nonnegative().nullable(),
  state: z.enum(['measured', 'unavailable', 'unknown']),
  reason: z.string().optional(),
  /** Production, testing, documentation and API buckets, preserved beside the aggregate. */
  buckets: z.record(z.string(), z.int().nonnegative()).optional(),
}).strict();
export type ScopeComponent = z.infer<typeof scopeComponentSchema>;

export const scopeSizeSchema = z.object({
  policy: z.literal('scope-size/1'),
  snapshot: text,
  components: z.array(scopeComponentSchema),
  /** The deduplicated union in bytes, or null when a component is unavailable. */
  bytes: z.int().nonnegative().nullable(),
  /** What was measured where the total is unavailable. */
  subtotal: z.int().nonnegative(),
  coverage: z.enum(['complete', 'partial']),
}).strict();
export type ScopeSize = z.infer<typeof scopeSizeSchema>;

export const lineEventSummarySchema = z.object({
  schema: z.literal('ramify-agent.line-events/1'),
  invocation: text,
  paths: z.array(z.object({
    path: text,
    owner: modulePathSchema.nullable(),
    added: z.int().nonnegative(),
    deleted: z.int().nonnegative(),
    binary: z.boolean(),
    /** A binary file's size: git reports no lines for it and none is invented. Null for a text file. */
    bytes: z.int().nonnegative().nullable(),
  }).strict()),
  unmapped: z.object({ paths: z.int().nonnegative(), added: z.int().nonnegative(), deleted: z.int().nonnegative() }).strict(),
  coverage: z.enum(['complete', 'partial']),
  gaps: z.array(z.string()),
}).strict();
export type LineEventSummary = z.infer<typeof lineEventSummarySchema>;

// Invocations.

export const usageSchema = z.object({
  input: z.int().nonnegative(),
  output: z.int().nonnegative(),
  cacheRead: z.int().nonnegative(),
  cacheWrite: z.int().nonnegative(),
  total: z.int().nonnegative(),
}).strict();

/** The work one invocation, and the session it belongs to, is for: none for the initial architect. */
export const invocationWorkSchema = z.object({ workItem: text.optional(), iteration: text.optional(), request: text.optional(),
  nonfunctionalRepair: text.optional(),
}).strict();
export type InvocationWork = z.infer<typeof invocationWorkSchema>;

// Lineage: how a session relates to others, by harness points and never by
// an executor's ref.

/**
 * A point a session can be continued or forked from: the end of one of its
 * invocations, or the result of one append to it, named by the sequence of
 * its `brief-appended` event.
 */
export const sessionPointSchema = z.union([
  z.object({ session: sessionIdSchema, invocation: text }).strict(),
  z.object({ session: sessionIdSchema, append: z.int().positive() }).strict(),
]);
export type SessionPoint = z.infer<typeof sessionPointSchema>;

/**
 * Why a suspended session is continued: its placement request was answered,
 * the iteration it assigned closed, its completion was refused while
 * evidence was owed, a gate failed after its result and it repairs, the
 * reconciliation of its completion request chose a correction, its
 * unresolved request was answered with a plan deviation, or the operator
 * resumed the run after its unresolved request was answered with an
 * environment problem.
 */
export const continueReasonSchema = z.enum(['placement-answered', 'iteration-closed', 'completion-refused', 'repair', 'reconciliation', 'deviation-recorded', 'environment-resumed', 'context-selected']);
export type ContinueReason = z.infer<typeof continueReasonSchema>;

/**
 * Why a session is forked from another: a placement request forks the
 * architect context; a scope review forks the local architect at the point
 * that produced the assignment; a design review forks the orientation that
 * read its guidance; a reconciliation forks the local architect at the
 * point after its completion request; an unresolved request forks the
 * architect context, as a placement request does.
 */
export const forkReasonSchema = z.enum(['placement-request', 'scope-review', 'design-orientation', 'reconciliation', 'unresolved-request', 'context-selection']);

/** Why a session takes another's place: a lost engineer is reconstructed from records, or the architect context is rebuilt. */
export const replaceReasonSchema = z.enum(['reconstructed', 'context-rebuilt']);

/** Why an invocation's result opened a session: an engineer's need opens a contract sub-session. */
export const requestReasonSchema = z.enum(['contract-needed']);

/** A continued invocation: the point it continues from, why, and the briefs appended since its session's previous invocation. */
export const continueRelationSchema = z.object({
  from: sessionPointSchema,
  reason: continueReasonSchema,
  briefs: z.array(text),
}).strict();
export type ContinueRelation = z.infer<typeof continueRelationSchema>;

/**
 * A forked session: its source point, why, and the briefs the source held
 * at the point. The architect context's generation is named by a fork of
 * that context, a placement request's; a review's fork is of another
 * session and names none.
 */
export const forkRelationSchema = z.object({
  from: sessionPointSchema,
  reason: forkReasonSchema,
  generation: z.int().positive().optional(),
  briefs: z.array(text),
}).strict();
export type ForkRelation = z.infer<typeof forkRelationSchema>;

/**
 * The local architect's session and the executor's pinned ref at one point
 * of it, captured with the event that commits what that point produced. A
 * fork from the ref starts at that point whatever the session did later.
 */
export const architectRefSchema = z.object({ session: sessionIdSchema, ref: text }).strict();
export type ArchitectRef = z.infer<typeof architectRefSchema>;

/** A session that takes another's place, which is finished before it opens. */
export const replaceRelationSchema = z.object({ session: sessionIdSchema, reason: replaceReasonSchema }).strict();
export type ReplaceRelation = z.infer<typeof replaceRelationSchema>;

/** A session opened because an invocation's result asked for it; it shares no history with it. */
export const requestRelationSchema = z.object({ invocation: text, reason: requestReasonSchema }).strict();
export type RequestRelation = z.infer<typeof requestRelationSchema>;

/**
 * A start the executor could not honor: the relation requested, the start
 * that was actual, and the executor's reason, null where it gave none.
 */
export const degradeRelationSchema = z.object({
  requested: z.enum(['continue', 'fork']),
  actual: z.enum(['fresh', 'continue', 'fork']),
  reason: z.string().nullable(),
}).strict();
export type DegradeRelation = z.infer<typeof degradeRelationSchema>;

export const invocationSchema = z.object({
  schema: z.literal('ramify-agent.invocation/1'),
  id: text,
  role: roleSchema,
  work: invocationWorkSchema,
  /** The count of this role's invocations for this work, this one included. */
  attempt: z.int().positive(),
  /** `actual` differs from `requested` when the implementation could not continue or fork. */
  session: z.object({
    requested: sessionModeSchema,
    actual: sessionModeSchema,
    ref: z.string(),
    from: z.string().optional(),
    degradedReason: z.string().optional(),
  }).strict(),
  prompt: z.object({ package: text, hash: sha256Schema, inputsHash: sha256Schema }).strict(),
  /** The write scope's revision, and the scope size this invocation was measured at. */
  scope: z.object({
    write: z.int().nonnegative().nullable(),
    measurement: recordRefSchema.nullable(),
    size: scopeSizeSchema.nullable(),
  }).strict(),
  writer: z.boolean(),
  supersedes: text.optional(),
  /** The latest passed committing checkpoint's audited hash when it started, or the run base before one exists. */
  base: z.string(),
  startedAt: timestamp,
}).strict();
export type Invocation = z.infer<typeof invocationSchema>;

export const invocationOutcomeSchema = z.object({
  schema: z.literal('ramify-agent.invocation-outcome/1'),
  invocation: text,
  ended: z.enum(['submitted', 'ended', 'failed', 'stopped', 'context-budget-reached', 'invalid-submission']),
  /** Each one is a `rejection` observation with its errors. */
  rejectedSubmissions: z.int().nonnegative(),
  interruption: z.enum(['idle-timeout', 'absolute-timeout', 'provider-error', 'session-lost', 'adapter-fault']).optional(),
  /** A superseded invocation's result is kept and never applied. */
  disposition: z.enum(['applied', 'superseded', 'incomplete']),
  /**
   * Where the session's history ended, and the mode that was actual. The
   * `Invocation` records what was requested, before the session started;
   * this records what the implementation answered and the point a later
   * fork or append names. Absent for an invocation whose session never ran.
   */
  session: z.object({
    ref: z.string(),
    mode: sessionModeSchema,
    /** Why the requested mode was not honored, as the implementation said. */
    degradedReason: z.string().optional(),
  }).strict().optional(),
  submission: z.object({ hash: sha256Schema }).strict().nullable(),
  /** Always an estimate; `observed: null` is unknown, never room. */
  budget: z.object({ threshold: z.number(), observed: z.number().nullable(), reportDelivered: z.boolean() }).strict().optional(),
  /**
   * The harness's own observation, never `stop()` resolving or the agent's
   * word: the session idle and its registered process groups killed and gone.
   */
  settled: z.object({
    confirmed: z.boolean(),
    at: timestamp,
    groupsKilled: z.int().nonnegative(),
    lateWrites: z.array(z.string()),
  }).strict(),
  /** Writers only: uncommitted changed paths outside the write scope when it settled. */
  outsideScope: z.array(z.string()),
  usage: z.union([usageSchema, z.object({ unavailable: text }).strict()]),
  elapsedMs: z.int().nonnegative(),
  error: z.string().optional(),
}).strict();
export type InvocationOutcome = z.infer<typeof invocationOutcomeSchema>;

// Gate attempts. The type is `checks/records.ts`'s; this is the reader.

const testSelectionSchema = z.object({
  policy: z.enum(['owned-by-scope', 'all-project']),
  exactOwners: z.array(z.string()),
  subtrees: z.array(z.string()),
  extraSuites: z.array(z.string()),
  resolved: z.array(z.string()),
}).strict();

/** The kinds of command a gate runs. */
const checkKindSchema = z.enum(['setup', 'ramify-check', 'type-check', 'tests', 'conformance', 'scenarios']);

/** What a `scenarios` check runs: one run per module, with the mode's setup and teardown around them. */
const scenarioCheckPlanSchema = z.object({
  mode: scenarioModeSchema,
  selection: scenarioSelectionSchema,
  strict: z.literal(true),
  dryRun: z.boolean(),
  support: z.array(text),
  runs: z.array(z.object({
    module: z.object({ module: text, dir: z.string(), testing: z.boolean() }).strict(),
    selection: scenarioSelectionSchema,
  }).strict()),
  setup: checkCommandSchema.nullable(),
  teardown: checkCommandSchema.nullable(),
  runTimeoutMs: z.int().positive(),
  tracked: z.array(z.object({ id: text, file: text }).strict()),
}).strict();

/** What a `scenarios` command established, read from its runs' message streams. */
export const scenarioCheckSummarySchema = z.object({
  mode: scenarioModeSchema,
  selection: scenarioSelectionSchema,
  dryRun: z.boolean(),
  excluded: z.int().nonnegative(),
  setup: z.object({ exit: z.int().nullable() }).strict().nullable(),
  teardown: z.object({ exit: z.int().nullable() }).strict().nullable(),
  runs: z.array(z.object({ module: text, exit: z.int().nullable(), profile: text, messages: text }).strict()),
  scenarios: z.array(scenarioRunResultSchema.extend({ run: text })),
  untracked: untrackedScenarioCountsSchema,
  failures: z.array(z.string()),
}).strict();

const plannedCheckSchema = z.object({
  kind: checkKindSchema,
  /** A setup command's declared name. */
  name: text.optional(),
  command: checkCommandSchema,
  selection: testSelectionSchema.optional(),
  requiresTests: z.boolean().optional(),
  discovery: z.object({
    failed: z.enum(['discovery-error', 'required-suite-missing']),
    detail: z.string(),
  }).strict().optional(),
  attribution: z.enum(['in-scope', 'project']).optional(),
  /** A type check's declared output format. */
  output: typeCheckOutputSchema.optional(),
  scenarios: scenarioCheckPlanSchema.optional(),
}).strict();

/** A durable gate operation exists only after every plan verified. */
const verifiedPlannedCheckSchema = plannedCheckSchema
  .omit({ discovery: true })
  .extend({ kind: z.enum(['setup', 'ramify-check', 'type-check', 'tests', 'scenarios']) });

/** A rule the harness verified itself over the tree, beside the commands it ran. */
export const gateRuleSchema = z.object({
  rule: z.enum(['fake-naming', 'fake-exposure-parity']),
  outcome: z.enum(['passed', 'failed']),
  violations: z.array(z.object({ rule: text, path: text, detail: text }).strict()),
  /** What the rule could not establish, or found and did not attribute to this attempt; absent when nothing. */
  limits: z.array(text).optional(),
}).strict();

export const gateAttemptSchema = z.object({
  schema: z.literal('ramify-agent.gate-attempt/3'),
  id: text,
  checkpoint: z.enum(['readiness', 'iteration', 'contract', 'breaking-iteration', 'work-item', 'final']),
  subject: z.object({ workItem: text.optional(), iteration: text.optional() }).strict(),
  proposedBy: z.string().nullable(),
  repairRound: z.int().nonnegative(),
  infrastructureAttempt: z.int().nonnegative(),
  head: z.string(),
  commit: z.string().nullable(),
  audited: z.string().nullable(),
  evidence: z.object({ runRef: text, reportCommit: text, treeRef: text }).strict().nullable(),
  guardedChanges: z.array(z.object({
    path: text,
    before: z.string(),
    after: z.string().nullable(),
    authorizedBy: recordRefSchema.nullable(),
  }).strict()),
  /** Rules the harness verified itself; absent for a checkpoint that has none. */
  rules: z.array(gateRuleSchema).optional(),
  commands: z.array(z.object({
    kind: checkKindSchema,
    /** A setup command's declared name. */
    name: text.optional(),
    command: checkCommandSchema,
    selection: testSelectionSchema.optional(),
    startedAt: z.string(),
    elapsedMs: z.int().nonnegative(),
    exitCode: z.int().nullable(),
    outcome: z.enum(['passed', 'failed', 'not-verified']),
    notVerified: z.enum(['timeout', 'runner-error', 'command-missing', 'empty-selection', 'interrupted', 'discovery-error', 'required-suite-missing', 'setup-failed']).optional(),
    runnerError: z.object({ kind: z.string(), message: z.string() }).strict().nullable(),
    output: z.object({ path: z.string(), bytes: z.int().nonnegative(), truncated: z.boolean(), tail: z.string() }).strict(),
    /** How ramify-audit stopped the command's process tree, in words; absent where it did not stop it. */
    stopped: text.optional(),
    /** The command's output streams stayed open after it ended, so what it printed may be incomplete. */
    outputIncomplete: z.literal(true).optional(),
    /** A `scenarios` command's summary of its message streams. */
    scenarios: scenarioCheckSummarySchema.optional(),
  }).strict()),
  /** The checkpoint's scenario check had nothing to run; not a failure. */
  scenarios: z.literal('none-selected').optional(),
  verdict: z.enum(['passed', 'failed', 'not-verified']),
  cause: z.enum(['in-scope', 'infrastructure', 'timeout', 'invalid-session', 'outside-assignment', 'guarded-change', 'unknown']).nullable(),
  /**
   * Where a failed Ramify check's own findings and a failed type check's
   * errors lie, against the write scope the attempt followed. Absent for an
   * attempt with neither.
   */
  attribution: z.object({
    basis: z.enum(['ramify-findings', 'type-check-errors', 'ramify-findings-and-type-check-errors']),
    inScope: z.array(z.string()),
    outside: z.array(z.string()),
  }).strict().optional(),
  next: z.enum(['accept', 'repair', 'retry-infrastructure', 'return-to-local-architect', 'exhausted']),
}).strict();

/** Exact overall result supplied by the external auditor, independent of the gate verdict. */
export const gateAuditOutcomeSchema = z.object({
  schema: z.literal('ramify-agent.gate-audit-outcome/1'),
  gate: text,
  overall: z.enum(['pass', 'fail']),
  audited: text,
}).strict();

/** The reader and the engine's own type describe one record; this keeps them so. */
const _gateAttemptsAgree: GateAttempt = undefined as unknown as z.infer<typeof gateAttemptSchema>;
void _gateAttemptsAgree;

/** Durable input for a committing gate, written before its commit and audit effect. */
export const gateOperationSchema = z.object({
  schema: z.literal('ramify-agent.gate-operation/1'),
  checkpoint: z.enum(['iteration', 'contract', 'breaking-iteration', 'work-item', 'final']),
  request: z.object({
    id: text,
    runId: text,
    projectRoot: text,
    directory: text,
    head: z.string(),
    checks: z.array(verifiedPlannedCheckSchema),
    selection: z.object({
      policy: z.enum(['owned-by-scope', 'all-project']),
      exactOwners: z.array(z.string()),
      subtrees: z.array(z.string()),
    }).strict(),
    dependencyDirectories: z.array(z.string()),
    subject: z.object({ workItem: text.optional(), iteration: text.optional() }).strict(),
    proposedBy: z.string().nullable(),
    repairRound: z.int().nonnegative(),
    infrastructureAttempt: z.int().nonnegative(),
    writeScope: z.array(z.string()),
    limits: z.object({ repairRounds: z.int().positive(), infrastructureRetries: z.int().positive() }).strict(),
    /** The checkpoint's scenario check had nothing to run. */
    scenarios: z.literal('none-selected').optional(),
  }).strict(),
  guardedChanges: z.array(z.object({
    path: text, before: z.string(), after: z.string().nullable(), authorizedBy: recordRefSchema.nullable(),
  }).strict()),
  rules: z.array(gateRuleSchema),
  unauthorized: z.boolean(),
  ruleFailed: z.boolean(),
  timeoutMs: z.int().positive(),
  message: z.string(),
}).strict();
export type GateOperation = z.infer<typeof gateOperationSchema>;

const _plannedChecksAgree: readonly PlannedCheck[] = undefined as unknown as GateOperation['request']['checks'];
void _plannedChecksAgree;

// Where each record lives beneath the run's directory.

/** The absolute directory of one run, `plans/<plan-id>/.harness/jobs/<run-id>/`. */
export function runDirectory(projectRoot: string, planId: string, runId: string): string {
  return join(jobsDirectory(projectRoot, planId), runId);
}

/**
 * Every path of the run layout. The record paths are relative to the run's
 * directory, which is the ledger's records root, so a path that would leave
 * it is refused before anything is written.
 */
export const runLayout = {
  record: 'job.json',
  capturedPlan: join('input', 'plan.md'),
  documentManifest: join('input', 'documents.json'),
  documentBytes: (id: string): string => join('input', 'documents', `${id}.bin`),
  catalogVersion: (hash: string): string => join('analysis', 'catalog', `${hash}.json`),
  incorporationVersion: (hash: string): string => join('analysis', 'incorporation', `${hash}.json`),
  orientationPacket: (workItem: string, hash: string): string => join('work', workItem, 'orientation', `${hash}.txt`),
  selectionVersion: (workItem: string, hash: string): string => join('work', workItem, 'selection', `${hash}.json`),
  contextPackage: (workItem: string, hash: string): string => join('work', workItem, 'context', `${hash}.txt`),
  selection: (workItem: string): string => join('work', workItem, 'context-selection.json'),
  assignmentContext: (assignment: string): string => join('assignments', `${assignment}-context.json`),
  candidate: (id: string): string => join('nonfunctional', 'candidates', `${id}.json`),
  assessment: (id: string): string => join('nonfunctional', 'assessments', `${id}.json`),
  nonfunctionalRound: (number: number): string => join('nonfunctional', 'rounds', `${number}.json`),
  nonfunctionalRepairAssignment: (id: string): string => join('nonfunctional', 'repairs', `${id}.json`),
  nonfunctionalDeviation: (id: string): string => join('deviations', `${id}.json`),
  events: 'events.jsonl',
  promptManifest: join('prompts', 'manifest.json'),
  entries: join('analysis', 'entries.json'),
  /** One tracked scenario, `sc-001`, committed by `analysis-accepted` and immutable. */
  scenario: (id: string): string => join('scenarios', `${id}.json`),
  readiness: (attempt: number): string => join('readiness', readinessDirectory(attempt), 'attempt.json'),
  readinessOutput: (attempt: number): string => join('readiness', readinessDirectory(attempt)),
  recovery: (id: RecoveryId): string => join('recoveries', `${id}.json`),
  measurement: (id: SnapshotId): string => join('measurements', `${id}.json`),
  gate: (id: string): string => join('gates', id, 'attempt.json'),
  gateAuditOutcome: (id: string): string => join('gates', id, 'audit-outcome.json'),
  gateOperation: (id: string): string => join('gates', id, 'operation.json'),
  gateOutput: (id: string): string => join('gates', id),
  invocation: (id: InvocationId): string => join('invocations', id, 'invocation.json'),
  submission: (id: InvocationId): string => join('invocations', id, 'submission.json'),
  outcome: (id: InvocationId): string => join('invocations', id, 'outcome.json'),
  observations: (id: InvocationId): string => join('invocations', id, 'observations.jsonl'),
  lineEvents: (id: InvocationId): string => join('invocations', id, 'lines.json'),
  /** The executor's own session record, such as pi's, which only it reads. */
  session: (id: InvocationId): string => join('invocations', id, 'session'),
  /** The complete output of one `shell` call, which the tool answers only the tail of. */
  shellOutput: (id: InvocationId, call: number): string => join('invocations', id, 'shell', `${String(call).padStart(3, '0')}.log`),
  /** What one post-write hook check printed, which its observation names. */
  hookOutput: (id: InvocationId, check: number): string => join('invocations', id, 'hooks', `${String(check).padStart(3, '0')}.json`),
  /** The profiles, streams and log of one scenario check `run_scope_tests` ran. */
  scopeScenarios: (id: InvocationId, call: number): string => join('invocations', id, 'scenarios', String(call).padStart(3, '0')),
  /** The harness's transcript of one session: raw output, never a record. */
  transcript: (session: SessionId): string => join('transcripts', `${session}.jsonl`),
  /** The content store the run's transcripts name bodies in, `blobs/<sha256>`. */
  blobs: 'blobs',
} as const;

/** The schema literal of each record kind, for a reader that answers unsupported version. */
export const runSchemas = {
  run: { schema: jobSchemaVersion, body: runRecordSchema },
  documents: { schema: 'ramify-agent.document-manifest/1', body: documentManifestSchema },
  catalog: { schema: 'ramify-agent.nonfunctional-catalog/1', body: catalogSchema },
  incorporation: { schema: 'ramify-agent.document-incorporation/1', body: incorporationSchema },
  selection: { schema: 'ramify-agent.context-selection/1', body: contextSelectionSchema },
  assignmentContext: { schema: 'ramify-agent.assignment-context/1', body: assignmentContextSchema },
  preparedCandidate: { schema: 'ramify-agent.prepared-candidate/1', body: preparedCandidateSchema },
  assessment: { schema: 'ramify-agent.nonfunctional-assessment/1', body: assessmentSchema },
  nonfunctionalRound: { schema: 'ramify-agent.nonfunctional-round/1', body: roundSchema },
  nonfunctionalRepairAssignment: { schema: 'ramify-agent.nonfunctional-repair-assignment/1', body: nonfunctionalRepairAssignmentSchema },
  nonfunctionalDeviation: { schema: 'ramify-agent.nonfunctional-deviation/1', body: nonfunctionalDeviationSchema },
  promptManifest: { schema: 'ramify-agent.prompt-manifest/1', body: promptPackageManifestSchema },
  entries: { schema: 'ramify-agent.entry-assignments/1', body: entryAssignmentsSchema },
  scenario: { schema: 'ramify-agent.scenario/1', body: scenarioRecordSchema },
  readiness: { schema: 'ramify-agent.readiness-attempt/1', body: readinessAttemptSchema },
  recovery: { schema: 'ramify-agent.infrastructure-recovery/1', body: infrastructureRecoverySchema },
  measurement: { schema: 'ramify-agent.measurement-snapshot/1', body: measurementSnapshotSchema },
  lineEvents: { schema: 'ramify-agent.line-events/1', body: lineEventSummarySchema },
  invocation: { schema: 'ramify-agent.invocation/1', body: invocationSchema },
  outcome: { schema: 'ramify-agent.invocation-outcome/1', body: invocationOutcomeSchema },
  gate: { schema: 'ramify-agent.gate-attempt/3', body: gateAttemptSchema },
  gateAuditOutcome: { schema: 'ramify-agent.gate-audit-outcome/1', body: gateAuditOutcomeSchema },
  gateOperation: { schema: 'ramify-agent.gate-operation/1', body: gateOperationSchema },
} as const;

/** Every role a run's policy and prompt manifest must carry an entry for. */
export const roles: readonly Role[] = roleSchema.options;
