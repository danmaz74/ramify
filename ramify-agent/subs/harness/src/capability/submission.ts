import { z } from 'zod';
import { modulePathSchema } from '../interfaces/protocol/evidence.js';
import { elementIdSchema } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { capabilityPlanContentSchema, capabilityPlanSchema, type CapabilityPlan } from './records.js';
import { assignmentBodySchema } from '../work/assignment.js';

/** Agent judgments are explicit values. Validation checks form and current
 * authority; it never infers whether prose, code or an expected result is true. */
const text = z.string().min(1).refine(value => value.trim().length > 0, 'Must contain non-whitespace text');
const basis = { task: text, planRevision: z.int().positive(), invocation: text };
const action = <T extends string, S extends z.ZodRawShape>(kind: T, fields: S) =>
  z.object({ ...basis, kind: z.literal(kind), ...fields }).strict();

export const capabilityActionSchema = z.discriminatedUnion('kind', [
  action('consult-consumer', { question: text, sections: z.array(text).min(1), references: z.array(text) }),
  action('assign', {
    assignment: assignmentBodySchema,
  }),
  action('delegate-capability', { request: text, provider: modulePathSchema, placementReason: text, constraints: z.array(text) }),
  action('request-placement', { problem: text, evidence: z.array(text).min(1) }),
  action('unresolved', { problem: text, evidence: z.array(text).min(1) }),
  action('request-handback', {
    summary: text,
    coverage: z.array(z.object({ case: text, evidence: z.array(text).min(1) }).strict()).min(1),
    interfaces: z.array(z.object({ path: text, symbols: z.array(text).min(1), use: text }).strict()).min(1),
    limitations: z.array(text),
  }),
  action('partial', { progress: text, unfinished: z.array(text).min(1) }),
]);
export type CapabilityAction = z.infer<typeof capabilityActionSchema>;

export const qualificationActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('satisfy-with-existing'), request: text, invocation: text,
    api: z.object({ owner: modulePathSchema, path: text, symbol: text }).strict(),
    guidance: text, evidence: z.array(text).min(1),
  }).strict(),
  z.object({ kind: z.literal('delegate-capability'), request: text, invocation: text,
    provider: modulePathSchema, placementReason: text, constraints: z.array(text), requirementRefs: z.array(elementIdSchema),
  }).strict(),
  z.object({ kind: z.literal('request-placement'), request: text, invocation: text, problem: text, evidence: z.array(text).min(1) }).strict(),
  z.object({ kind: z.literal('unresolved'), request: text, invocation: text, problem: text, evidence: z.array(text).min(1) }).strict(),
]);
export type QualificationAction = z.infer<typeof qualificationActionSchema>;

export const capabilityPlanUpdateSchema = z.object({
  task: text,
  basedOn: z.int().positive(),
  invocation: text,
  reason: text,
  changes: capabilityPlanContentSchema.partial().refine(changes => Object.keys(changes).length > 0, 'At least one section must change'),
}).strict();
export type CapabilityPlanUpdate = z.infer<typeof capabilityPlanUpdateSchema>;

export interface CapabilityActionBasis {
  readonly task: string;
  readonly planRevision: number;
  readonly coordinatorInvocation: string | null;
  readonly state: 'coordinating' | 'awaiting-consumer' | 'implementing' | 'awaiting-dependency' | 'verifying' | 'handed-back' | 'stopped';
  readonly openAssignment: string | null;
  readonly openChild: string | null;
}

export interface ValidationIssue {
  readonly kind: 'structure' | 'state';
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export type ValidationResult<T> = { readonly valid: true; readonly value: T; readonly issues: readonly [] } |
  { readonly valid: false; readonly issues: readonly ValidationIssue[] };

/** Used by both preview and final submission. Call again at final submission
 * with freshly replayed state; a preview is never an authorization token. */
export function validateCapabilityAction(input: unknown, current: CapabilityActionBasis): ValidationResult<CapabilityAction> {
  const parsed = capabilityActionSchema.safeParse(input);
  if (!parsed.success) return { valid: false, issues: parsed.error.issues.map(issue => ({
    kind: 'structure', path: issue.path.map(part => typeof part === 'symbol' ? String(part) : part), message: issue.message,
  })) };
  const value = parsed.data;
  const issues: ValidationIssue[] = [];
  if (value.task !== current.task) issues.push({ kind: 'state', path: ['task'], message: 'The task is not current' });
  if (value.planRevision !== current.planRevision) issues.push({ kind: 'state', path: ['planRevision'], message: 'The plan revision is stale' });
  if (value.invocation !== current.coordinatorInvocation) issues.push({ kind: 'state', path: ['invocation'], message: 'The invocation has no active coordination authority' });
  if (current.state !== 'coordinating') issues.push({ kind: 'state', path: ['kind'], message: `The task is ${current.state}` });
  if (current.openAssignment !== null) issues.push({ kind: 'state', path: ['kind'], message: 'An assignment is unfinished' });
  if (current.openChild !== null) issues.push({ kind: 'state', path: ['kind'], message: 'A child task is unfinished' });
  return issues.length === 0 ? { valid: true, value, issues: [] } : { valid: false, issues };
}

/** Plan tools use the same captured basis rule without comparing prose. */
export function validateCapabilityPlanUpdate(input: unknown, current: Pick<CapabilityActionBasis, 'task' | 'planRevision' | 'coordinatorInvocation' | 'state'>): ValidationResult<CapabilityPlanUpdate> {
  const parsed = capabilityPlanUpdateSchema.safeParse(input);
  if (!parsed.success) return { valid: false, issues: parsed.error.issues.map(issue => ({
    kind: 'structure', path: issue.path.map(part => typeof part === 'symbol' ? String(part) : part), message: issue.message,
  })) };
  const issues: ValidationIssue[] = [];
  if (parsed.data.task !== current.task) issues.push({ kind: 'state', path: ['task'], message: 'The task is not current' });
  if (parsed.data.basedOn !== current.planRevision) issues.push({ kind: 'state', path: ['basedOn'], message: 'The plan revision is stale' });
  if (parsed.data.invocation !== current.coordinatorInvocation) issues.push({ kind: 'state', path: ['invocation'], message: 'The invocation has no active coordination authority' });
  if (current.state !== 'coordinating') issues.push({ kind: 'state', path: [], message: `The task is ${current.state}` });
  return issues.length === 0 ? { valid: true, value: parsed.data, issues: [] } : { valid: false, issues };
}

/** Build an immutable next revision after validating the captured basis. The
 * original example set and all existing cases remain linked across edits. */
export function buildCapabilityPlanRevision(previous: CapabilityPlan, update: CapabilityPlanUpdate): CapabilityPlan {
  if (previous.task !== update.task || previous.revision !== update.basedOn) throw new Error('Plan update basis is stale');
  const next = capabilityPlanSchema.parse({
    ...previous, ...update.changes, revision: previous.revision + 1, basedOn: previous.revision,
    updatedBy: update.invocation, revisionReason: update.reason, originalExamples: previous.originalExamples,
  });
  if (previous.useCases.some(old => !next.useCases.some(item => item.id === old.id))) {
    throw new Error('Plan update cannot remove an existing case');
  }
  return next;
}
