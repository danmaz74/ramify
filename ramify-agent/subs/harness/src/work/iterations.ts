import { join } from 'node:path';
import { z } from 'zod';
import { modulePathSchema, viewIdentitySchema } from '../interfaces/protocol/evidence.js';
import { failureAnalysisSchema, roleSchema } from '../interfaces/protocol/runs.js';
import { invocationOutcomeSchema, planRefSchema, recordRefSchema } from '../run/records.js';
import { slugSchema } from '../analysis/records.js';
import type { WorkItemId } from './records.js';

/*
 * One iteration of a work item: the assignment that fixes it, the write
 * scope it was captured with, and the result that closes it.
 *
 * The assignment is immutable. Its gate and its test-selection policy are
 * derived by the harness from the kind, the scope and the required evidence;
 * no submission carries them, and the policy is frozen here while each gate
 * attempt resolves the current files again.
 */

const text = z.string().min(1);

/** `wi-001.i02`, from the count of committed assignments of that work item. */
export type IterationId = string;

export const iterationId = (workItem: WorkItemId, count: number): IterationId =>
  `${workItem}.i${String(count).padStart(2, '0')}`;

/** The work item one iteration identifier belongs to, or null when it names none. */
export function workItemOfIteration(id: IterationId): WorkItemId | null {
  const [workItem, tail] = id.split('.i');
  return workItem !== undefined && workItem !== '' && tail !== undefined ? workItem : null;
}

/**
 * What a location beyond the base was assigned for. `fake-injection` is a
 * file the agreement names as holding the fake, in the consumer or on the
 * provider side, which a contract iteration may write. `outside-modules` is
 * a path outside every module's own contents, such as a project script,
 * where only a change meets a plan requirement; it carries that requirement
 * as its reason.
 */
export const extraPurposeSchema = z.enum(['contract', 'conformance', 'fake', 'exposure-declaration', 'consumer', 'fake-injection', 'outside-modules']);

/**
 * What one iteration may write. `base` is the assigned module's own contents
 * plus the complete subtrees of the immediate children it names: each child
 * subtree is wholly included or excluded, and no descendant is selected on
 * its own.
 *
 * `resolved` is what the guard compares against: canonical paths, captured
 * when the assignment was accepted, with the view they were resolved from.
 * A later refresh never widens them.
 */
export const writeScopeSchema = z.object({
  /** Per work item; only an assignment raises it. */
  revision: z.int().nonnegative(),
  base: z.union([
    z.object({ module: modulePathSchema, includedChildren: z.array(modulePathSchema) }).strict(),
    z.object({ modules: z.array(modulePathSchema).min(1), rationale: text }).strict(),
  ]),
  /**
   * Locations assigned beyond the base. A contract iteration is given
   * directories, because the files it will write do not exist yet and their
   * names are the agreement's to choose; an architect's own extra location
   * is one file, which is the default, or a directory outside every module.
   */
  extra: z.array(z.object({
    path: text,
    purpose: extraPurposeSchema,
    kind: z.enum(['file', 'directory']).optional(),
    /** For `outside-modules`: the plan requirement the change serves. */
    reason: text.optional(),
  }).strict()),
  /** The declared read scope beyond the base; soft. */
  read: z.array(modulePathSchema),
  /** Creation authority captured from accepted registry entries, never from hypotheses. */
  bootstrap: z.array(z.object({ capability: recordRefSchema, directory: text }).strict()),
  rationale: text,
  /** Captured canonical paths, including validated absent bootstrap paths under a real ancestor. */
  resolved: z.object({
    roots: z.array(text),
    files: z.array(text),
    view: viewIdentitySchema,
  }).strict(),
}).strict();
export type WriteScope = z.infer<typeof writeScopeSchema>;

/** Which tests a checkpoint requires, as a policy and never as a file list. */
export const testSelectionPolicySchema = z.object({
  policy: z.enum(['owned-by-scope', 'all-project']),
  exactOwners: z.array(modulePathSchema),
  subtrees: z.array(modulePathSchema),
  /** Suites a registered evidence obligation requires; each must be selected. */
  extraSuites: z.array(text),
  /**
   * The assignment's `outside-modules` paths. Each attempt resolves the test
   * files beneath them anew, and they join `extraSuites`.
   */
  outsideModules: z.array(text).optional(),
}).strict();

export const checkpointSchema = z.enum(['readiness', 'iteration', 'contract', 'breaking-iteration', 'work-item', 'final']);

/** The kinds of iteration. This iteration's local architect may assign three of them. */
export const iterationKindSchema = z.enum(['ordinary', 'breaking', 'contract', 'verification', 'repair', 'integration']);
export type IterationKind = z.infer<typeof iterationKindSchema>;

/** One bound an assignment raises: the value, and why the work needs it. */
const raisedBoundSchema = z.object({ ms: z.int().positive(), reason: text }).strict();

/**
 * The bounds an assignment raises for every engineer invocation of its
 * iteration: the longest one shell command may run, the idle bound and the
 * absolute bound of each invocation. A bound it leaves out is the policy's.
 * Each is at most the policy's ceiling, and a command's timeout is never
 * longer than the invocation that runs it.
 */
export const assignedBoundsSchema = z.object({
  commandTimeoutMs: raisedBoundSchema.optional(),
  idleMs: raisedBoundSchema.optional(),
  absoluteMs: raisedBoundSchema.optional(),
}).strict();
export type AssignedBounds = z.infer<typeof assignedBoundsSchema>;

export const iterationAssignmentSchema = z.object({
  schema: z.literal('ramify-agent.iteration-assignment/1'),
  id: text,
  workItem: text,
  outline: recordRefSchema,
  stage: z.int().nonnegative(),
  kind: iterationKindSchema,
  goal: text,
  approach: text,
  scope: writeScopeSchema,
  requirementRefs: z.array(planRefSchema),
  /** IDs cited from the work item's recorded selection; absent on legacy assignments. */
  citedItems: z.array(text).optional(),
  externalCapabilities: z.array(z.object({
    capability: slugSchema,
    owner: modulePathSchema,
    role: z.enum(['use', 'request']),
    contract: recordRefSchema.optional(),
  }).strict()),
  completionEvidence: text,
  /** Registered evidence this iteration must satisfy, owned anywhere. */
  evidenceObligations: z.array(z.object({
    obligation: recordRefSchema.optional(),
    requirement: recordRefSchema.optional(),
    suite: z.array(text),
    against: z.enum(['fake', 'real']),
  }).strict()),
  /** Derived by the policy from `kind` and `scope`; no submission carries it. */
  gate: z.object({ checkpoint: checkpointSchema, tests: testSelectionPolicySchema }).strict(),
  /** Guarded files as captured; a gate compares the tree with them. */
  guarded: z.array(z.object({ path: text, hash: text }).strict()),
  /**
   * Guarded paths this iteration may change, each with the record that
   * authorized it and the reason the request establishes. It is captured
   * here and stands for this iteration alone; a gate reads it and nothing
   * else, and an unlisted guarded change is never a pass.
   */
  authorizations: z.array(z.object({ path: text, rationale: text, by: recordRefSchema }).strict()),
  /** Set for a contract iteration: the engineer iteration that asked for it. */
  requestedBy: text.optional(),
  /** A local architect may assign a contract revision directly. */
  revisesContract: recordRefSchema.optional(),
  /**
   * The scenarios the architect expects this iteration to bind, shown to the
   * engineer under "Scenarios to bind". Informative: the engineer declares
   * what its step definitions bind, and nothing requires exactly these.
   */
  scenarios: z.array(text).optional(),
  /** The bounds the local architect raised for this iteration's engineers; absent, the policy's. */
  bounds: assignedBoundsSchema.optional(),
}).strict();
export type IterationAssignment = z.infer<typeof iterationAssignmentSchema>;

/**
 * A module the accepted commit added or removed, read from the commit and
 * never from an agent's words, with the placement decision that proposed it
 * or `null` when none did.
 */
export const moduleNoticeSchema = z.object({
  kind: z.enum(['module-created', 'module-removed']),
  module: z.string(),
  declaration: text,
  commit: text,
  iteration: text,
  decision: recordRefSchema.nullable(),
}).strict();
export type ModuleNotice = z.infer<typeof moduleNoticeSchema>;

const count = z.int().nonnegative();

/**
 * What an engineer that ended without a result left, derived by the harness
 * from what it already holds, and bounded as a gate summary is: why it
 * ended, what was in flight, what it changed, what it said last and where
 * its transcript is. Its local architect reads it without the transcript.
 */
export const failureDigestSchema = z.object({
  invocation: text,
  role: roleSchema,
  ended: invocationOutcomeSchema.shape.ended,
  interruption: invocationOutcomeSchema.shape.interruption.unwrap().nullable(),
  /** Why it ended, in one line: the bound that fired, the error, or the rejections. */
  cause: text,
  /** The submissions or tool inputs rejected in the invocation, with the last rejection's reasons. */
  rejected: z.object({ count, target: text, reasons: z.array(z.string()) }).strict().nullable(),
  elapsedMs: count,
  /** The bounds the invocation ran under. */
  bounds: z.object({ commandTimeoutMs: z.int().positive(), idleMs: z.int().positive(), absoluteMs: z.int().positive() }).strict(),
  /** The tool calls in flight when it ended; a shell call names its command and the end of its output. */
  inFlight: z.array(z.object({
    tool: text,
    callId: z.string(),
    runningMs: count,
    command: z.object({
      text: z.string(),
      timeoutMs: z.int().positive(),
      /** The command's complete output, relative to the run's directory; null where none was written. */
      output: z.string().nullable(),
      tail: z.array(z.string()),
    }).strict().nullable(),
  }).strict()),
  /** What the invocation changed, from its line events, and what is uncommitted in the tree. */
  changes: z.object({
    paths: z.array(z.object({ path: text, added: count, deleted: count, binary: z.boolean() }).strict()),
    /** Changed paths beyond the ones listed. */
    more: count,
    /** Paths the tree changes beyond the last accepted commit; null where unknown. */
    uncommitted: count.nullable(),
    /** Why the counts are missing or partial, where they are. */
    gaps: z.array(z.string()),
  }).strict(),
  /** The engineer's last assistant text, shortened; null where it wrote none. */
  lastMessage: z.string().nullable(),
  /** The session's transcript, relative to the run's directory. */
  transcript: text,
  /** The complete outputs of the invocation's shell calls, relative to the run's directory. */
  outputs: z.array(text),
}).strict();
export type FailureDigest = z.infer<typeof failureDigestSchema>;

export const iterationResultSchema = z.object({
  schema: z.literal('ramify-agent.iteration-result/1'),
  iteration: text,
  outcome: z.enum(['accepted', 'partial', 'unsuitable', 'exhausted', 'superseded']),
  /** Every attempt, in order. */
  invocations: z.array(text),
  /** The passing attempt, for `accepted`. */
  gate: text.nullable(),
  /** The passing gate's audited commit: the accepted boundary, including an unchanged retry. */
  commit: text.nullable(),
  findings: z.array(z.string()),
  changedAssumptions: z.array(z.string()),
  recommendation: z.string().optional(),
  artifacts: z.array(z.string()),
  /**
   * Where an engineer ended without a result: the harness's digest, then the
   * failure analysis, both read by the local architect before it decides.
   */
  failure: z.object({ digest: failureDigestSchema, analysis: failureAnalysisSchema }).strict().optional(),
}).strict();
export type IterationResult = z.infer<typeof iterationResultSchema>;

/** Where an iteration's records are materialized, relative to the run's directory. */
export const iterationLayout = {
  assignment: (workItem: WorkItemId, number: number): string =>
    join('work-items', workItem, 'iterations', String(number).padStart(2, '0'), 'assignment.json'),
  result: (workItem: WorkItemId, number: number): string =>
    join('work-items', workItem, 'iterations', String(number).padStart(2, '0'), 'result.json'),
} as const;

/** The schema literal of each kind, for a reader that answers unsupported version. */
export const iterationSchemas = {
  assignment: { schema: 'ramify-agent.iteration-assignment/1', body: iterationAssignmentSchema },
  result: { schema: 'ramify-agent.iteration-result/1', body: iterationResultSchema },
} as const;
