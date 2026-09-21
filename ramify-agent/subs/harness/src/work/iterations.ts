import { join } from 'node:path';
import { z } from 'zod';
import { modulePathSchema, viewIdentitySchema } from '../interfaces/protocol/evidence.js';
import { planRefSchema, recordRefSchema } from '../run/records.js';
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

/** What a location beyond the base was assigned for. */
export const extraPurposeSchema = z.enum(['contract', 'conformance', 'fake', 'exposure-declaration', 'consumer']);

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
   * is one file, which is the default.
   */
  extra: z.array(z.object({
    path: text,
    purpose: extraPurposeSchema,
    kind: z.enum(['file', 'directory']).optional(),
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
}).strict();

export const checkpointSchema = z.enum(['readiness', 'iteration', 'contract', 'breaking-iteration', 'work-item', 'final']);

/** The kinds of iteration. This iteration's local architect may assign three of them. */
export const iterationKindSchema = z.enum(['ordinary', 'breaking', 'contract', 'verification', 'repair', 'integration']);
export type IterationKind = z.infer<typeof iterationKindSchema>;

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

export const iterationResultSchema = z.object({
  schema: z.literal('ramify-agent.iteration-result/1'),
  iteration: text,
  outcome: z.enum(['accepted', 'partial', 'unsuitable', 'exhausted', 'superseded']),
  /** Every attempt, in order. */
  invocations: z.array(text),
  /** The passing attempt, for `accepted`. */
  gate: text.nullable(),
  /** The commit the harness made after the gate passed; null when nothing changed. */
  commit: text.nullable(),
  findings: z.array(z.string()),
  changedAssumptions: z.array(z.string()),
  recommendation: z.string().optional(),
  artifacts: z.array(z.string()),
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
