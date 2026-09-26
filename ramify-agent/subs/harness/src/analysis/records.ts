import { join } from 'node:path';
import { z } from 'zod';
import { citationSchema, modulePathSchema } from '../interfaces/protocol/evidence.js';
import { moduleProposalSchema, recordRefSchema } from '../run/records.js';
import { scenarioIdSchema } from '../../subs/scenarios/src/records.js';
import type { ScenarioWarningKind } from '../../subs/scenarios/src/form.js';
import { elementIdSchema } from '../../subs/plan-evidence/src/interfaces/catalog.js';

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

/** What the retired `extend` value is answered with, in the terms the role submits. */
export const extensionIsANewForecast = 'An existing capability is never revised to cover more. Forecast the extended behavior as a new capability named for itself, with change "create" and the existing module as its suggested owner, and set "changesExistingSymbols" to true where implementing it changes symbols that already have consumers';

/**
 * What a hypothesis forecasts. Each value has a decision outcome that can
 * confirm it, and `create-by-extraction` pairs with the outcome `extract`.
 * `refactor` is not here: no decision outcome could confirm it.
 *
 * There is no value for extending a capability. An extension is a new
 * capability named for itself, so it is forecast as `create`, and
 * `changesExistingSymbols` says whether implementing it changes symbols
 * that already have consumers.
 */
export const hypothesisChangeSchema = z.enum(['reuse', 'create', 'create-by-extraction'], {
  error: issue => (issue.input === 'extend' ? extensionIsANewForecast : undefined),
});
export type HypothesisChange = z.infer<typeof hypothesisChangeSchema>;

export const hypothesisSchema = z.object({
  schema: z.literal('ramify-agent.hypothesis/1'),
  id: slugSchema,
  revision: z.int().positive(),
  standing: z.enum(['tentative', 'confirmed', 'superseded']),
  /** The forecast capability. It is not a registry entry. */
  capability: slugSchema,
  change: hypothesisChangeSchema,
  /**
   * Whether implementing the forecast capability is expected to change
   * symbols that already have consumers, which a later decision confirms or
   * revises.
   */
  changesExistingSymbols: z.boolean(),
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

/** The kinds of warning the scenarios' form rules give, as the accepted analysis records them. */
const scenarioWarningKinds = ['names-view-symbol', 'names-view-file', 'sub-scenario-shares-no-step', 'duplicate-architect-steps'] as const satisfies readonly ScenarioWarningKind[];
const _everyWarningKind: (typeof scenarioWarningKinds)[number] = undefined as unknown as ScenarioWarningKind;
void _everyWarningKind;

/**
 * A warning on the accepted analysis's scenarios, never a rejection: it is
 * recorded with the scenarios it concerns, by their IDs, and shown in the
 * review.
 */
export const scenarioWarningSchema = z.object({
  kind: z.enum(scenarioWarningKinds),
  scenarios: z.array(scenarioIdSchema),
  message: text,
}).strict();
export type RecordedScenarioWarning = z.infer<typeof scenarioWarningSchema>;

/**
 * One correction a checker made to the catalog before it was frozen, with
 * its reason: shown at the review stop beside the corrected catalog, and
 * never a rejection.
 */
export const catalogFindingSchema = z.object({
  /** The captured document whose reading was checked. */
  document: z.string().regex(/^doc-\d{3,}$/),
  invocation: text,
  action: z.enum(['add', 'rewrite', 'replace']),
  reason: text,
  /** The elements the correction added, rewrote or put in place of the retired ones. */
  elements: z.array(elementIdSchema),
  retired: z.array(elementIdSchema),
}).strict();
export type CatalogFinding = z.infer<typeof catalogFindingSchema>;

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
