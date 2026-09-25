import { z } from 'zod';
import { passageReferenceSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';

const text = z.string().min(1);

/** One durable, read-only selection made before a work item is organized. */
export const contextSelectionSchema = z.object({
  schema: z.literal('ramify-agent.context-selection/1'),
  workItem: text,
  orientationInvocation: text,
  orientationPoint: text.nullable(),
  selectorInvocation: text,
  degraded: z.boolean(),
  /** Accepted catalog IDs or captured principle document IDs. */
  examined: z.array(text),
  selected: z.array(z.object({
    /** A catalog ID, or a principle document ID with an exact passage below. */
    item: text,
    passage: passageReferenceSchema,
    reason: text,
    conditions: z.array(text),
    uncertainty: z.string(),
  }).strict()),
  unavailable: z.array(z.object({ item: text, reason: text }).strict()),
  packageHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type ContextSelection = z.infer<typeof contextSelectionSchema>;

/** Architect citations on an assignment never substitute for the source package. */
export const assignmentContextSchema = z.object({
  schema: z.literal('ramify-agent.assignment-context/1'),
  workItem: text,
  assignment: text,
  selection: text,
  citedItems: z.array(text),
  packageHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
