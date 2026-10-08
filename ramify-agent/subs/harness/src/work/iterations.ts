import { join } from 'node:path';
import { z } from 'zod';
import { modulePathSchema } from '../interfaces/protocol/evidence.js';
import { failureAnalysisSchema, roleSchema } from '../interfaces/protocol/runs.js';
import { invocationOutcomeSchema, recordRefSchema } from '../run/records.js';
import { packageCitationSchema } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { slugSchema } from '../analysis/records.js';
import { writeScopeSchema } from './scope.js';
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

export { extraPurposeSchema, writeScopeSchema } from './scope.js';
export type { WriteScope } from './scope.js';



/** Which tests a checkpoint requires, as a policy and never as a file list. */
export const testSelectionPolicySchema = z.object({
  policy: z.enum(['owned-by-scope', 'all-project']),
  exactOwners: z.array(modulePathSchema),
  subtrees: z.array(modulePathSchema),
  /** Suites a registered evidence obligation requires; each must be selected. */
  extraSuites: z.array(text),
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
  /** The issuing coordinator; a capability task has its own sequence and limit. */
  coordination: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('work-item'), id: text }).strict(),
    z.object({ kind: z.literal('capability-task'), id: text, sequence: z.int().positive(), plan: recordRefSchema,
      startingTree: text, startingPaths: z.array(z.object({ path: text, hash: z.string().nullable() }).strict()) }).strict(),
  ]).optional(),
  stage: z.int().nonnegative(),
  kind: iterationKindSchema,
  goal: text,
  approach: text,
  scope: writeScopeSchema,
  /**
   * The assignment package: the elements it cites from its work item's
   * package, the plan deviations recorded when it was assigned, and the hash
   * of their rendering. Absent only for a single engineer session, which has
   * no catalog.
   */
  source: packageCitationSchema.optional(),
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
  guarded: z.array(z.object({ path: text, hash: text.nullable() }).strict()),
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
   * The registered obligations the architect delegated to this iteration's
   * engineer, as the assignment named them. Its completion proposal binds
   * every one; absent, none was named.
   */
  obligations: z.array(text).optional(),
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
  coordination: iterationAssignmentSchema.shape.coordination,
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
