import { z } from 'zod';
import { jobIdSchema, planIdSchema } from './ids.js';

/*
 * The queries the plan pages read: the project this harness serves, its
 * plans and one plan's Markdown. A run's own queries arrive with the
 * protocol of the Run page.
 */

/** `GET /api/v1/project`: the one project this harness serves. */
export const projectResponseSchema = z.object({
  protocolVersion: z.literal(1),
  project: z.object({
    /** The project's directory name. */
    name: z.string().min(1),
    /** The project's absolute root directory on the harness's machine. */
    root: z.string().min(1),
    /** Where plan files belong, relative to the root: `plans/<plan-id>/plan.md`. */
    planPattern: z.literal('plans/<plan-id>/plan.md'),
  }).strict(),
}).strict();
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

/**
 * A run of the plan that waits for a person's decision now: the run
 * snapshot's `decisionRequests` is waiting. It counts the requests that
 * hold its work items and names those work items, which wait, with no time
 * limit, until a person answers.
 */
export const planDecisionWaitSchema = z.object({
  runId: jobIdSchema,
  requests: z.int().positive(),
  workItems: z.array(z.string().min(1)).min(1),
}).strict();
export type PlanDecisionWait = z.infer<typeof planDecisionWaitSchema>;

/** A plan whose file could be read. `path` is relative to the project root. */
export const readablePlanEntrySchema = z.object({
  status: z.literal('readable'),
  id: planIdSchema,
  title: z.string().min(1),
  path: z.string().min(1),
  /** The plan's runs that wait for a person's decision, newest first; empty when none does. */
  waitingForDecision: z.array(planDecisionWaitSchema),
}).strict();

/** A plan directory whose `plan.md` exists but could not be read. */
export const unreadablePlanEntrySchema = z.object({
  status: z.literal('unreadable'),
  id: planIdSchema,
  path: z.string().min(1),
  message: z.string().min(1),
  /** Its runs that wait for a person's decision: a run keeps waiting when its plan file becomes unreadable. */
  waitingForDecision: z.array(planDecisionWaitSchema),
}).strict();

export const planEntrySchema = z.discriminatedUnion('status', [readablePlanEntrySchema, unreadablePlanEntrySchema]);
export type PlanEntry = z.infer<typeof planEntrySchema>;
export type ReadablePlanEntry = z.infer<typeof readablePlanEntrySchema>;
export type UnreadablePlanEntry = z.infer<typeof unreadablePlanEntrySchema>;

/** `GET /api/v1/plans`: every `plans/*\/plan.md`, ordered by ID. */
export const planListResponseSchema = z.object({
  plans: z.array(planEntrySchema),
}).strict();
export type PlanListResponse = z.infer<typeof planListResponseSchema>;

/** `GET /api/v1/plans/:planId`: one plan with its Markdown source. */
export const planResponseSchema = z.object({
  plan: z.object({
    id: planIdSchema,
    title: z.string().min(1),
    path: z.string().min(1),
    markdown: z.string(),
  }).strict(),
}).strict();
export type PlanResponse = z.infer<typeof planResponseSchema>;
export type PlanDocument = PlanResponse['plan'];
