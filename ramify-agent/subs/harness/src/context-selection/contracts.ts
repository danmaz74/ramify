import { z } from 'zod';
import { elementIdSchema, packageCitationSchema } from '../../subs/plan-evidence/src/interfaces/catalog.js';

const text = z.string().min(1);

/**
 * One work item's selection, made by a read-only fork of its oriented local
 * architect: the non-functional, fixed and recommendation elements it
 * selected with its judgment of each, and the work-item package it cites,
 * which adds the entry's functional and context elements. A later selection
 * of the same work item supersedes it for later assignments.
 */
export const contextSelectionSchema = z.object({
  schema: z.literal('ramify-agent.context-selection/2'),
  workItem: text,
  orientationInvocation: text,
  orientationPoint: text.nullable(),
  selectorInvocation: text,
  degraded: z.boolean(),
  selected: z.array(z.object({
    id: elementIdSchema,
    reason: text,
    conditions: z.array(text),
    uncertainty: z.string(),
  }).strict()),
  /** The work-item package, with the plan deviations recorded when it was selected. */
  package: packageCitationSchema,
}).strict();
export type ContextSelection = z.infer<typeof contextSelectionSchema>;
