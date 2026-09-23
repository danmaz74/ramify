import { join } from 'node:path';
import { z } from 'zod';
import { citationSchema, modulePathSchema } from '../interfaces/protocol/evidence.js';
import { planRefSchema, recordRefSchema } from '../run/records.js';
import { slugSchema } from '../analysis/records.js';
import { scenarioIdSchema } from '../../subs/scenarios/src/records.js';

/*
 * A module work item and the outline its local architect writes for it.
 *
 * One work item is created per entry capability, always: its module is the
 * entry's owner and its goal the entry's description. Iterations, their
 * assignments and their results belong to the iteration that assigns them.
 *
 * An integration work item exists for one integration scenario, which it
 * names in place of an entry capability: the harness creates it at the
 * scenario's owner, the lowest common ancestor of its sub-scenarios' owners,
 * once every sub-scenario is implemented (architecture §10).
 */

const text = z.string().min(1);

/** `wi-001`, the count of committed work items. */
export type WorkItemId = string;

export const workItemId = (count: number): WorkItemId => `wi-${String(count).padStart(3, '0')}`;

export const workItemSchema = z.object({
  schema: z.literal('ramify-agent.work-item/1'),
  id: text,
  module: modulePathSchema,
  /**
   * The harness derives the one capability from the entry, obligation or
   * requirement. An integration work item binds one scenario and implements
   * no capability of its own.
   */
  origin: z.union([
    z.object({ entry: slugSchema }).strict(),
    z.object({ obligation: recordRefSchema }).strict(),
    z.object({ verification: recordRefSchema }).strict(),
    z.object({ integration: scenarioIdSchema }).strict(),
  ]),
  /** A completed item's follow-up preserves that item's historical completion. */
  follows: text.optional(),
  goal: text,
  requirementRefs: z.array(planRefSchema),
  acceptanceRefs: z.array(planRefSchema),
  /** The work item whose yield started this one; the depth-first stack. */
  startedFor: text.nullable(),
}).strict();
export type WorkItem = z.infer<typeof workItemSchema>;

/** The kind of a work item's origin, as `work-item-started` and the projections name it. */
export type WorkItemOriginKind = 'entry' | 'obligation' | 'verification' | 'integration';

/** Which of the four origins a work item has. */
export function originKindOf(item: WorkItem): WorkItemOriginKind {
  if ('entry' in item.origin) return 'entry';
  if ('obligation' in item.origin) return 'obligation';
  if ('verification' in item.origin) return 'verification';
  return 'integration';
}

/** The integration scenario an integration work item binds; null for every other origin. */
export function integrationScenarioOf(item: WorkItem): string | null {
  return 'integration' in item.origin ? item.origin.integration : null;
}

export const decompositionSchema = z.object({
  kind: z.enum(['single-iteration', 'staged']),
  rationale: text,
}).strict();

export const workItemOutlineSchema = z.object({
  schema: z.literal('ramify-agent.work-item-outline/1'),
  workItem: text,
  revision: z.int().positive(),
  invocation: text,
  /** The analysis, concise. */
  changes: text,
  decomposition: decompositionSchema,
  reuse: z.array(z.object({ capability: slugSchema, owner: modulePathSchema, role: text }).strict()),
  breakingChanges: z.array(z.object({
    guarantee: text,
    reason: text,
    affectedConsumers: z.array(modulePathSchema),
    citations: z.array(citationSchema),
  }).strict()),
  stages: z.array(z.object({
    title: text,
    approach: z.enum(['non-breaking', 'breaking']),
    dependsOn: z.array(z.int().nonnegative()),
    note: z.string(),
  }).strict()),
  /** What the architect had been given. */
  hypothesesSeen: z.array(recordRefSchema),
  /** Why this revision differs from the last; empty on revision 1. */
  revisionReason: z.string(),
}).strict();
export type WorkItemOutline = z.infer<typeof workItemOutlineSchema>;

/** Where a work item's records are materialized, relative to the run's directory. */
export const workLayout = {
  item: (id: WorkItemId): string => join('work-items', id, 'item.json'),
  outline: (id: WorkItemId, revision: number): string => join('work-items', id, 'outline', `${revision}.json`),
  directory: (id: WorkItemId): string => join('work-items', id),
} as const;

/** The schema literal of each kind, for a reader that answers unsupported version. */
export const workSchemas = {
  item: { schema: 'ramify-agent.work-item/1', body: workItemSchema },
  outline: { schema: 'ramify-agent.work-item-outline/1', body: workItemOutlineSchema },
} as const;
