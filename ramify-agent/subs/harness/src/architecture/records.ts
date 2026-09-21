import { join } from 'node:path';
import { z } from 'zod';
import { citationSchema, modulePathSchema, viewIdentitySchema } from '../interfaces/protocol/evidence.js';
import { moduleProposalSchema, recordRefSchema } from '../run/records.js';
import { slugSchema } from '../analysis/records.js';

/*
 * The records of capability identity and placement: the request a local
 * architect makes of the global architect, and the decision one fork of the
 * long-lived architect context commits.
 *
 * Only placement has its own decision record. The other significant choices
 * are fields of the records where they are made, and the decision list a
 * person reads is a projection over all of them.
 *
 * A decision is immutable, as every record is. A decision that replaces an
 * earlier one says so in `revises`, with what it affects: a silent
 * contradiction is impossible because the field is required wherever the
 * owner conflicts with one already decided.
 */

const text = z.string().min(1);

/** `pr-003`, the count of committed placement requests. */
export const requestId = (count: number): string => `pr-${String(count).padStart(3, '0')}`;

/** `gd-003` for request `pr-003`: one decision per request, derived from it. */
export const globalDecisionId = (request: string): string => `gd-${request.replace(/^pr-/, '')}`;

/** `ld-wi-001-02`, from the work item and the count of its committed local decisions. */
export const localDecisionId = (workItem: string, count: number): string => `ld-${workItem}-${String(count).padStart(2, '0')}`;

/**
 * What a decision resolved. `extract` moves existing behavior to a new
 * owner; `external` is satisfied by a package or another system, so it has
 * no owner module and creates no provider obligation.
 */
export const placementOutcomeSchema = z.enum(['reuse', 'extend', 'create', 'extract', 'external']);
export type PlacementOutcome = z.infer<typeof placementOutcomeSchema>;

/** Who decided: one fork of the global architect, or the work item's own local architect. */
export const decisionAuthoritySchema = z.enum(['global', 'local']);
export type DecisionAuthority = z.infer<typeof decisionAuthoritySchema>;

/** What a request's evidence says about a hypothesis it tests. */
export const hypothesisStanceSchema = z.enum(['supports', 'contradicts', 'departs']);
export type HypothesisStance = z.infer<typeof hypothesisStanceSchema>;

export const placementRequestSchema = z.object({
  schema: z.literal('ramify-agent.placement-request/1'),
  id: text,
  workItem: text,
  requester: modulePathSchema,
  /** The consumer capability being implemented, which this request is made for. */
  forCapability: slugSchema,
  question: text,
  requiredBehavior: text,
  findings: z.array(z.object({ text, citations: z.array(citationSchema) }).strict()),
  candidates: z.array(z.object({
    capability: slugSchema.optional(),
    owner: modulePathSchema.optional(),
    note: text,
  }).strict()),
  unresolved: z.array(text),
  /** The hypotheses being tested, at the revisions the harness delivered. */
  hypotheses: z.array(z.object({ ref: recordRefSchema, stance: hypothesisStanceSchema, evidence: text }).strict()),
  /** The requester's own local decisions this request rests on. */
  localDecisions: z.array(text),
}).strict();
export type PlacementRequest = z.infer<typeof placementRequestSchema>;

export const placementDecisionSchema = z.object({
  schema: z.literal('ramify-agent.placement-decision/1'),
  id: text,
  authority: decisionAuthoritySchema,
  /** Null for a local decision: no request was made of the global architect. */
  request: z.string().nullable(),
  workItem: text,
  invocation: text,
  question: text,
  outcome: placementOutcomeSchema,
  capability: slugSchema,
  /** Null only for `external`. */
  owner: modulePathSchema.nullable(),
  /** Required for an owner the refreshed view does not have yet. */
  proposed: moduleProposalSchema.optional(),
  rationale: text,
  constraints: z.array(text),
  uncertainties: z.array(text),
  evidence: z.object({
    /** The view the decision was made against, as the refresh recorded it. */
    view: viewIdentitySchema,
    citations: z.array(citationSchema),
    /** Coverage the decision could not establish; a failed refresh stays explicit here. */
    gaps: z.array(text),
  }).strict(),
  /** An earlier decision this one replaces, with what it affects. Never silent. */
  revises: z.object({
    decision: text,
    affected: z.array(z.object({
      workItem: text.optional(),
      contract: text.optional(),
      consequence: text,
    }).strict()),
  }).strict().optional(),
  /** The registry entries this decision committed. */
  registry: z.array(recordRefSchema),
  hypothesisRevisions: z.array(recordRefSchema),
  /** Global decisions only: the text appended to the parent context. */
  brief: text.optional(),
}).strict();
export type PlacementDecision = z.infer<typeof placementDecisionSchema>;

/** Where the architecture's records are materialized, relative to the run's directory. */
export const architectureLayout = {
  request: (id: string): string => join('requests', `${id}.json`),
  decision: (id: string): string => join('decisions', `${id}.json`),
} as const;

/** The schema literal of each kind, for a reader that answers unsupported version. */
export const architectureSchemas = {
  request: { schema: 'ramify-agent.placement-request/1', body: placementRequestSchema },
  decision: { schema: 'ramify-agent.placement-decision/1', body: placementDecisionSchema },
} as const;
