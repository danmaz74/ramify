import { join } from 'node:path';
import { z } from 'zod';
import { citationSchema, modulePathSchema } from '../interfaces/protocol/evidence.js';
import { moduleProposalSchema, recordRefSchema } from '../run/records.js';

/*
 * The records the initial analysis commits beside its entry assignments: one
 * `Hypothesis` per forecast, at revision 1, and one `RegistryEntry` per entry
 * capability.
 *
 * A hypothesis is a forecast and nothing more. It has no reference to a work
 * item, and nothing references it but a decision and a local architect's
 * input; no harness code reads one to create work, an obligation or a
 * completion requirement. Revision 1 is never rewritten, so the forecast and
 * what happened stay comparable.
 */

const text = z.string().min(1);

/** A capability or hypothesis slug: an architect proposes it, and it is unique in the run. */
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'A kebab-case slug, such as "send-email"');

/**
 * What a hypothesis forecasts. Each value has a decision outcome that can
 * confirm it, and `create-by-extraction` pairs with the outcome `extract`.
 * `refactor` is not here: no decision outcome could confirm it.
 */
export const hypothesisChangeSchema = z.enum(['reuse', 'extend', 'create', 'create-by-extraction']);
export type HypothesisChange = z.infer<typeof hypothesisChangeSchema>;

export const hypothesisSchema = z.object({
  schema: z.literal('ramify-agent.hypothesis/1'),
  id: slugSchema,
  revision: z.int().positive(),
  standing: z.enum(['tentative', 'confirmed', 'superseded']),
  /** The forecast capability. It is not a registry entry. */
  capability: slugSchema,
  change: hypothesisChangeSchema,
  suggestedOwner: modulePathSchema,
  anticipatedConsumers: z.array(text),
  /** Which local architects receive it, beside the anticipated consumers. */
  involvedModules: z.array(modulePathSchema),
  /** Forecast dependency links, all tentative. */
  dependsOn: z.array(slugSchema),
  confidence: z.enum(['low', 'medium', 'high']),
  rationale: text,
  assumptions: z.array(z.string()),
  uncertainties: z.array(z.string()),
  citations: z.array(citationSchema),
  /** Revision 1 comes from the initial analysis; a later one from one global decision. */
  cause: z.union([
    z.object({ initial: text }).strict(),
    z.object({ decision: text, reason: text }).strict(),
  ]),
  supersededBy: slugSchema.optional(),
  confirmedBy: text.optional(),
}).strict();
export type Hypothesis = z.infer<typeof hypothesisSchema>;

export const registryEntrySchema = z.object({
  schema: z.literal('ramify-agent.capability/1'),
  capability: slugSchema,
  revision: z.int().positive(),
  behavior: text,
  owner: modulePathSchema,
  proposed: moduleProposalSchema.optional(),
  origin: z.enum(['entry', 'global-decision', 'local-decision']),
  /** Null for an entry assignment; a decision's ID otherwise. */
  decision: z.string().nullable(),
  /** Confirmed consumer-to-dependency links this revision adds. */
  consumers: z.array(z.object({ capability: slugSchema, workItem: text }).strict()),
  previousOwner: modulePathSchema.optional(),
}).strict();
export type RegistryEntry = z.infer<typeof registryEntrySchema>;

/** Where the analysis's records are materialized, relative to the run's directory. */
export const analysisLayout = {
  hypothesis: (id: string, revision: number): string => join('hypotheses', id, `${revision}.json`),
  registry: (capability: string, revision: number): string => join('registry', capability, `${revision}.json`),
} as const;

/** The schema literal of each kind, for a reader that answers unsupported version. */
export const analysisSchemas = {
  hypothesis: { schema: 'ramify-agent.hypothesis/1', body: hypothesisSchema },
  registry: { schema: 'ramify-agent.capability/1', body: registryEntrySchema },
} as const;
