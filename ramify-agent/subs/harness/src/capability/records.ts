import { join } from 'node:path';
import { z } from 'zod';
import { modulePathSchema, sha256Schema } from '../interfaces/protocol/evidence.js';
import { recordRefSchema } from '../run/records.js';
import { elementIdSchema } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { writeScopeSchema, testSelectionPolicySchema } from '../work/iterations.js';

/* Durable capability coordination records. The original request and every
 * plan revision are immutable; the event log, rather than a mutable status
 * field, determines the task's current state and authority. */

const text = z.string().min(1).refine(value => value.trim().length > 0, 'Must contain non-whitespace text');
const id = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const exampleId = z.string().regex(/^need-\d+\.ex\d+$/);
const positive = z.int().positive();
const treeIdentity = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const location = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\\\s]+$/);

export const capabilityTaskId = (count: number): string => `cap-${String(count).padStart(3, '0')}`;
export const capabilityRequestId = (count: number): string => `need-${String(count).padStart(3, '0')}`;
export const capabilityExampleId = (request: string, count: number): string => `${request}.ex${String(count).padStart(2, '0')}`;
export const capabilityAssignmentId = (task: string, count: number): string => `${task}.i${String(count).padStart(2, '0')}`;

export const capabilityNeedSchema = z.object({
  need: text,
  usage: z.array(z.object({ path: location, symbol: text.optional(), use: text, prospective: z.boolean(), module: modulePathSchema.optional() }).strict()
    .refine(value => !value.prospective || value.module !== undefined, { path: ['module'], message: 'A prospective call site names its intended module' })).min(1),
  constraints: z.array(text),
  knownInterface: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none-known') }).strict(),
    z.object({ kind: z.literal('insufficient'), path: location, symbol: text, missing: text }).strict(),
  ]),
  examples: z.array(z.object({ id: exampleId, title: text, code: text, designation: z.enum(['executable', 'pseudocode']) }).strict()).min(1),
  suggestedProvider: z.object({ module: modulePathSchema, reason: text }).strict().optional(),
  revises: z.object({ task: id, reason: text }).strict().optional(),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  value.examples.forEach((example, index) => {
    if (seen.has(example.id)) context.addIssue({ code: 'custom', path: ['examples', index, 'id'], message: 'Example IDs are unique' });
    seen.add(example.id);
  });
});
export type CapabilityNeed = z.infer<typeof capabilityNeedSchema>;

/** The engineer does not choose durable example IDs. The harness assigns
 * them after the request ID is reserved. */
const { examples: _identifiedExamples, ...needInputShape } = capabilityNeedSchema.shape;
export const capabilityNeedInputSchema = z.object({ ...needInputShape,
  examples: z.array(z.object({ title: text, code: text, designation: z.enum(['executable', 'pseudocode']) }).strict()).min(1),
}).strict();
export type CapabilityNeedInput = z.infer<typeof capabilityNeedInputSchema>;
export function identifyCapabilityNeed(request: string, input: CapabilityNeedInput): CapabilityNeed {
  return capabilityNeedSchema.parse({
    ...input, examples: input.examples.map((example, index) => ({ ...example, id: capabilityExampleId(request, index + 1) })),
  });
}

export const provisionalSourceSchema = z.object({
  acceptedBase: text,
  /** Git tree object for the live candidate at suspension. */
  tree: treeIdentity,
  /** Hash of the worktree/index byte manifest, which preserves staging. */
  snapshotHash: sha256Schema,
  snapshot: location,
  delta: z.array(z.object({ path: location, before: sha256Schema.nullable(), after: sha256Schema.nullable(), staged: z.boolean() }).strict()),
  writerSettledBy: text,
}).strict();
export type ProvisionalSource = z.infer<typeof provisionalSourceSchema>;

export const capabilityRequestSchema = z.object({
  schema: z.literal('ramify-agent.capability-request/1'),
  id,
  parent: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('work-item'), id: text }).strict(),
    z.object({ kind: z.literal('capability-task'), id }).strict(),
  ]),
  assignment: text,
  invocation: text,
  consumer: modulePathSchema,
  requirementPackage: recordRefSchema,
  continuation: z.object({ session: text, point: text.nullable() }).strict(),
  source: provisionalSourceSchema,
  summary: text,
  original: capabilityNeedSchema,
}).strict();
export type CapabilityRequest = z.infer<typeof capabilityRequestSchema>;

export const capabilityTaskSchema = z.object({
  schema: z.literal('ramify-agent.capability-task/1'),
  id,
  request: id,
  parent: capabilityRequestSchema.shape.parent,
  originatingAssignment: text,
  consumer: modulePathSchema,
  provider: modulePathSchema,
  placementReason: text,
  authority: z.array(z.object({ owner: modulePathSchema, reason: text }).strict()).min(1),
  relatedEntries: z.array(z.object({ entry: text, reason: text }).strict()),
  deferredWorkItems: z.array(text),
  source: provisionalSourceSchema,
  /** A later task links an accepted handback without changing its verdict. */
  revises: z.object({ handback: recordRefSchema, sourceRevision: text, reason: text }).strict().optional(),
  limits: z.object({ maxAssignments: positive, maxWorkUnits: positive, maxInvocations: positive }).strict(),
}).strict();
export type CapabilityTask = z.infer<typeof capabilityTaskSchema>;

const coverage = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unresolved'), reason: text }).strict(),
  z.object({ state: z.literal('exercised'), tests: z.array(text).min(1), candidate: text, configuration: text }).strict(),
  z.object({ state: z.literal('corrected'), reason: text, evidence: z.array(text).min(1), decidedBy: text, tests: z.array(text).min(1), candidate: text, configuration: text }).strict(),
]);
/** The editable plan content is shared with the plan-update tool schema. */
export const capabilityPlanContentSchema = z.object({
  need: text,
  proposedInterface: text,
  useCases: z.array(z.object({ id: z.union([exampleId, id]), expectedBehavior: text, derivedFrom: z.array(exampleId).min(1), coverage }).strict()),
  compatibility: z.array(text),
  outline: z.array(text),
  decisions: z.array(z.object({ decision: text, reason: text, evidence: z.array(text) }).strict()),
  openQuestions: z.array(text),
  requirementRefs: z.array(elementIdSchema),
}).strict();

export const capabilityPlanSchema = z.object({
  schema: z.literal('ramify-agent.capability-plan/1'),
  task: id,
  revision: positive,
  basedOn: z.int().nonnegative(),
  updatedBy: text,
  revisionReason: text,
  ...capabilityPlanContentSchema.shape,
  /** Original example IDs cannot disappear. Additional cases may be derived. */
  originalExamples: z.array(exampleId).min(1),
}).strict().superRefine((plan, context) => {
  if (plan.basedOn !== plan.revision - 1) context.addIssue({ code: 'custom', path: ['basedOn'], message: 'A revision follows its immediate predecessor' });
  const cases = new Set(plan.useCases.map(item => item.id));
  for (const example of plan.originalExamples) {
    if (!cases.has(example)) context.addIssue({ code: 'custom', path: ['useCases'], message: `Original example ${example} requires a case` });
  }
  for (const [index, item] of plan.useCases.entries()) {
    if (!item.derivedFrom.every(example => plan.originalExamples.includes(example))) {
      context.addIssue({ code: 'custom', path: ['useCases', index, 'derivedFrom'], message: 'Coverage links name original examples' });
    }
  }
});
export type CapabilityPlan = z.infer<typeof capabilityPlanSchema>;

export const capabilityExchangeSchema = z.object({
  schema: z.literal('ramify-agent.capability-exchange/1'),
  id,
  task: id,
  request: text,
  planRevision: positive,
  question: text,
  references: z.array(text),
  answer: z.object({ invocation: text, text, objections: z.array(text) }).strict().nullable(),
}).strict();
export type CapabilityExchange = z.infer<typeof capabilityExchangeSchema>;

export const capabilityAssignmentSchema = z.object({
  schema: z.literal('ramify-agent.capability-assignment/1'),
  id: text,
  task: id,
  sequence: positive,
  owner: modulePathSchema,
  plan: recordRefSchema,
  purpose: text,
  approach: text,
  requirementRefs: z.array(elementIdSchema),
  intendedEvidence: z.array(text).min(1),
  scope: writeScopeSchema,
  gate: z.object({ tests: testSelectionPolicySchema }).strict(),
  startingTree: treeIdentity,
  /** Dirty paths that predate this writer, retained for attribution after restart. */
  startingPaths: z.array(z.object({ path: location, hash: z.string().nullable() }).strict()).optional(),
}).strict().superRefine((assignment, context) => {
  if (assignment.id !== capabilityAssignmentId(assignment.task, assignment.sequence)) {
    context.addIssue({ code: 'custom', path: ['id'], message: 'Assignment ID contains its task and sequence' });
  }
});
export type CapabilityAssignment = z.infer<typeof capabilityAssignmentSchema>;

export const capabilityHandbackSchema = z.object({
  schema: z.literal('ramify-agent.capability-handback/1'),
  task: id,
  request: id,
  plan: recordRefSchema,
  sourceRevision: text,
  returnedTree: treeIdentity,
  deltaFromSuspension: z.array(location),
  summary: text,
  interfaces: z.array(z.object({ path: location, symbols: z.array(text).min(1), use: text }).strict()).min(1),
  compatibility: z.array(text),
  checks: z.array(recordRefSchema).min(1),
  reviews: z.array(recordRefSchema),
  limitations: z.array(text),
}).strict();
export type CapabilityHandback = z.infer<typeof capabilityHandbackSchema>;

export const capabilityReviewSchema = z.object({
  schema: z.literal('ramify-agent.capability-review/1'), task: id, planRevision: positive,
  tree: treeIdentity, gate: text,
  outcome: z.enum(['passed', 'failed']), findings: z.array(text),
  assessments: z.array(z.object({ kind: z.enum(['code', 'scope', 'design']), invocation: text,
    inspected: z.array(location), missing: z.array(z.object({ path: location, reason: text }).strict()),
    findings: z.array(text) }).strict()).length(3),
}).strict();
export type CapabilityReview = z.infer<typeof capabilityReviewSchema>;

export const capabilityLayout = {
  /** A request may be satisfied by existing behavior before a task exists. */
  request: (request: string): string => join('capabilities', 'requests', `${request}.json`),
  task: (task: string): string => join('capabilities', task, 'task.json'),
  plan: (task: string, revision: number): string => join('capabilities', task, 'plan', `${revision}.json`),
  exchange: (task: string, exchange: string, revision: number): string => join('capabilities', task, 'exchanges', `${exchange}.${revision}.json`),
  assignment: (task: string, assignment: string): string => join('capabilities', task, 'assignments', `${assignment}.json`),
  handback: (task: string): string => join('capabilities', task, 'handback.json'),
  review: (task: string, gate: string, planRevision: number): string =>
    join('capabilities', task, 'reviews', `${gate}.p${planRevision}.json`),
} as const;

export const capabilitySchemas = {
  request: { schema: 'ramify-agent.capability-request/1', body: capabilityRequestSchema },
  task: { schema: 'ramify-agent.capability-task/1', body: capabilityTaskSchema },
  plan: { schema: 'ramify-agent.capability-plan/1', body: capabilityPlanSchema },
  exchange: { schema: 'ramify-agent.capability-exchange/1', body: capabilityExchangeSchema },
  assignment: { schema: 'ramify-agent.capability-assignment/1', body: capabilityAssignmentSchema },
  handback: { schema: 'ramify-agent.capability-handback/1', body: capabilityHandbackSchema },
} as const;
