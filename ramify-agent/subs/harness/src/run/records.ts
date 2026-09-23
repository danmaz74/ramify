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

const counted = (prefix: string, width: number) => (count: number): string => `${prefix}-${String(count).padStart(width, '0')}`;

export const invocationId = counted('inv', 4);
export const gateAttemptId = counted('ga', 4);
export const recoveryId = counted('rec', 4);
export const snapshotId = counted('ms', 4);

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
 * A run written before this harness recorded names holds `env` as a
 * name-to-value map. It is read as the names it maps, which is the whole of
 * what this harness now keeps of one, so a run on disk stays readable through
 * the same `ramify-agent.job/2`: a version bump would have made every
 * recorded run unreadable to gain nothing, since no reader wanted the values.
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
  }).strict(),
  context: z.record(roleSchema, contextPolicySchema),
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

/**
 * `ramify-agent.json`, the target project's configuration for the harness:
 * only what the harness cannot derive. In v1 that is the scenario harness,
 * the support code Cucumber imports before any step file and the command of
 * each execution mode.
 */
export const projectConfigSchema = z.object({
  schema: z.literal(projectConfigVersion),
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
 * The steps readiness verifies. The attempt records the five the baseline
 * gate verifies, the two acceptance steps among them, after `ramify-daemon`,
 * where they run.
 */
export const readinessSteps = [
  'project-root', 'git-clean', 'compiler-config', 'test-runner', 'project-config', 'acceptance-runner',
  'baseline-acceptance', 'acceptance-full', 'nested-packages',
  'test-discovery', 'ramify-daemon', 'baseline-tests', 'baseline-type-check', 'baseline-ramify-check',
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

export const invocationSchema = z.object({
  schema: z.literal('ramify-agent.invocation/1'),
  id: text,
  role: roleSchema,
  work: z.object({ workItem: text.optional(), iteration: text.optional(), request: text.optional() }).strict(),
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
const checkKindSchema = z.enum(['ramify-check', 'type-check', 'tests', 'conformance', 'scenarios']);

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
  command: checkCommandSchema,
  selection: testSelectionSchema.optional(),
  requiresTests: z.boolean().optional(),
  discovery: z.object({
    failed: z.enum(['discovery-error', 'required-suite-missing']),
    detail: z.string(),
  }).strict().optional(),
  attribution: z.enum(['in-scope', 'project']).optional(),
  scenarios: scenarioCheckPlanSchema.optional(),
}).strict();

/** A durable gate operation exists only after every plan verified. */
const verifiedPlannedCheckSchema = plannedCheckSchema
  .omit({ discovery: true })
  .extend({ kind: z.enum(['ramify-check', 'type-check', 'tests', 'scenarios']) });

/** A rule the harness verified itself over the tree, beside the commands it ran. */
export const gateRuleSchema = z.object({
  rule: z.literal('fake-naming'),
  outcome: z.enum(['passed', 'failed']),
  violations: z.array(z.object({ rule: text, path: text, detail: text }).strict()),
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
    command: checkCommandSchema,
    selection: testSelectionSchema.optional(),
    startedAt: z.string(),
    elapsedMs: z.int().nonnegative(),
    exitCode: z.int().nullable(),
    outcome: z.enum(['passed', 'failed', 'not-verified']),
    notVerified: z.enum(['timeout', 'runner-error', 'command-missing', 'empty-selection', 'interrupted', 'discovery-error', 'required-suite-missing']).optional(),
    runnerError: z.object({ kind: z.string(), message: z.string() }).strict().nullable(),
    output: z.object({ path: z.string(), bytes: z.int().nonnegative(), truncated: z.boolean(), tail: z.string() }).strict(),
    /** A `scenarios` command's summary of its message streams. */
    scenarios: scenarioCheckSummarySchema.optional(),
  }).strict()),
  /** The checkpoint's scenario check had nothing to run; not a failure. */
  scenarios: z.literal('none-selected').optional(),
  verdict: z.enum(['passed', 'failed', 'not-verified']),
  cause: z.enum(['in-scope', 'infrastructure', 'timeout', 'invalid-session', 'outside-assignment', 'guarded-change', 'unknown']).nullable(),
  /**
   * Where a failed Ramify check's own findings lie, against the write scope
   * the attempt followed. Absent for an attempt with no such report.
   */
  attribution: z.object({
    basis: z.literal('ramify-findings'),
    inScope: z.array(z.string()),
    outside: z.array(z.string()),
  }).strict().optional(),
  next: z.enum(['accept', 'repair', 'retry-infrastructure', 'return-to-local-architect', 'exhausted']),
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
  gateOperation: (id: string): string => join('gates', id, 'operation.json'),
  gateOutput: (id: string): string => join('gates', id),
  invocation: (id: InvocationId): string => join('invocations', id, 'invocation.json'),
  submission: (id: InvocationId): string => join('invocations', id, 'submission.json'),
  outcome: (id: InvocationId): string => join('invocations', id, 'outcome.json'),
  observations: (id: InvocationId): string => join('invocations', id, 'observations.jsonl'),
  lineEvents: (id: InvocationId): string => join('invocations', id, 'lines.json'),
  session: (id: InvocationId): string => join('invocations', id, 'session'),
  /** The complete output of one `shell` call, which the tool answers only the tail of. */
  shellOutput: (id: InvocationId, call: number): string => join('invocations', id, 'shell', `${String(call).padStart(3, '0')}.log`),
  /** What one post-write hook check printed, which its observation names. */
  hookOutput: (id: InvocationId, check: number): string => join('invocations', id, 'hooks', `${String(check).padStart(3, '0')}.json`),
  /** The profiles, streams and log of one scenario check `run_scope_tests` ran. */
  scopeScenarios: (id: InvocationId, call: number): string => join('invocations', id, 'scenarios', String(call).padStart(3, '0')),
} as const;

/** The schema literal of each record kind, for a reader that answers unsupported version. */
export const runSchemas = {
  run: { schema: jobSchemaVersion, body: runRecordSchema },
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
  gateOperation: { schema: 'ramify-agent.gate-operation/1', body: gateOperationSchema },
} as const;

/** Every role a run's policy and prompt manifest must carry an entry for. */
export const roles: readonly Role[] = roleSchema.options;
