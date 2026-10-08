import { z } from 'zod';
import { jobVersionSchema } from './jobs.js';
import { obligationViewSchema } from './runs.js';

/* A browser-safe projection of durable capability coordination. A task ID is
 * never a registry capability ID or a module-capability comparison key. The
 * original examples are the request's immutable context; a plan case carries
 * no per-example state, and the task's architect reports on its obligations. */
const text = z.string().min(1);
const ref = z.object({ id: text, revision: z.int().nonnegative() }).strict();
export const capabilityTaskViewSchema = z.object({
  id: text,
  request: text,
  parent: z.object({ kind: z.enum(['work-item', 'capability-task']), id: text }).strict(),
  consumer: text,
  provider: text,
  status: z.enum(['coordinating', 'awaiting-consumer', 'implementing', 'awaiting-dependency', 'verifying', 'handed-back', 'stopped']),
  active: z.boolean(),
  currentCoordinator: text.nullable(),
  original: z.object({ need: text, usage: z.array(z.object({ path: text, symbol: text.optional(), use: text,
    prospective: z.boolean(), module: text.optional() }).strict()), constraints: z.array(text),
    knownInterface: z.discriminatedUnion('kind', [z.object({ kind: z.literal('none-known') }).strict(),
      z.object({ kind: z.literal('insufficient'), path: text, symbol: text, missing: text }).strict()]),
    suggestedProvider: z.object({ module: text, reason: text }).strict().nullable(),
    examples: z.array(z.object({ id: text, title: text, code: text, designation: z.enum(['executable', 'pseudocode']) }).strict()) }).strict(),
  source: z.object({ acceptedBase: text, tree: text, delta: z.array(z.object({ path: text, staged: z.boolean() }).strict()) }).strict(),
  placementReason: text,
  relatedEntries: z.array(z.object({ entry: text, reason: text }).strict()),
  deferredWorkItems: z.array(text),
  plan: z.object({ revision: z.int().positive(), revisionReason: text, need: text, proposedInterface: text,
    useCases: z.array(z.object({ id: text, expectedBehavior: text, derivedFrom: z.array(text) }).strict()),
    compatibility: z.array(text), outline: z.array(text), decisions: z.array(z.object({ decision: text, reason: text,
      evidence: z.array(text) }).strict()), openQuestions: z.array(text), requirementRefs: z.array(text) }).strict(),
  assignments: z.array(z.object({ id: text, owner: text, purpose: text, approach: text,
    status: z.enum(['active', 'accepted', 'partial', 'failed', 'interrupted']), intendedEvidence: z.array(text),
    failures: z.array(text),
    result: z.object({ outcome: z.enum(['accepted', 'partial', 'unsuitable', 'exhausted', 'superseded']),
      gate: text.nullable(), commit: text.nullable(), findings: z.array(text) }).strict().nullable().optional(),
    reviews: z.array(z.object({ id: text, kind: z.enum(['code', 'scope', 'design']),
      result: z.enum(['complete', 'partial', 'not-verified']).nullable() }).strict()).optional() }).strict()),
  consultations: z.array(z.object({ id: text, question: text, references: z.array(text),
    answer: text.nullable(), objections: z.array(text) }).strict()),
  /** The obligations this task's architect reports on: its delegated
   * outcome and the cases and tests it registered, each with its latest
   * binding and report. The outcome's done report is the handback's judgment. */
  obligations: z.array(obligationViewSchema),
  children: z.array(text),
  activeChild: text.nullable(),
  verification: z.object({ status: z.enum(['pending', 'running', 'failed', 'passed']),
    gates: z.array(text), reviews: z.array(z.object({ gate: text, planRevision: z.int().positive(),
      outcome: z.enum(['passed', 'failed']),
      findings: z.array(text) }).strict()), findings: z.array(text) }).strict(),
  handback: z.object({ summary: text, returnedTree: text, deltaFromSuspension: z.array(text),
    interfaces: z.array(z.object({ path: text, symbols: z.array(text), use: text }).strict()),
    limitations: z.array(text), checks: z.array(ref), reviews: z.array(ref) }).strict().nullable(),
}).strict();
export type CapabilityTaskView = z.infer<typeof capabilityTaskViewSchema>;

export const capabilityRequestViewSchema = z.object({ id: text, parent: text, assignment: text,
  need: text, outcome: z.enum(['pending', 'satisfied', 'request-placement', 'unresolved', 'delegated']),
  task: text.nullable(), evidence: z.array(text) }).strict();
export type CapabilityRequestView = z.infer<typeof capabilityRequestViewSchema>;

/** The stack includes its ordinary work-item root and active task descendants. */
export const capabilityTasksResponseSchema = z.object({
  schema: z.literal('capability-tasks/1'), version: jobVersionSchema,
  terminal: z.object({ state: z.enum(['running', 'completed', 'failed', 'stopped', 'interrupted']),
    reason: text.nullable(), message: z.string().nullable() }).strict(),
  requests: z.array(capabilityRequestViewSchema), tasks: z.array(capabilityTaskViewSchema),
  stack: z.array(text),
}).strict();
export type CapabilityTasksResponse = z.infer<typeof capabilityTasksResponseSchema>;
