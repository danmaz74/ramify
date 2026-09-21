import { z } from 'zod';

/**
 * The neutral vocabulary shared by the catalog side and the review side.
 *
 * Every export of this file is part of the contract: `contracts` exposes it
 * with an interface-file wildcard, so a binding added here joins the contract
 * without a description change. Keep anything that is not shared vocabulary in
 * another file.
 */

/** Identifies one catalog record. */
export const recordIdSchema: z.ZodString = z.string().min(1);
export type RecordId = z.infer<typeof recordIdSchema>;

/**
 * One revision of a record. `predecessor` is the id of the revision this one
 * follows, or `null` for the first revision. A predecessor id may name a
 * revision that the chain does not contain; that is a defect of the record,
 * not of this shape.
 */
export const revisionSchema: z.ZodObject<{
  id: z.ZodString;
  predecessor: z.ZodNullable<z.ZodString>;
}> = z.object({
  id: z.string().min(1),
  predecessor: z.string().min(1).nullable(),
});
export type Revision = z.infer<typeof revisionSchema>;

/** A record's revisions, oldest first, exactly as recorded. */
export const revisionChainSchema: z.ZodArray<typeof revisionSchema> = z.array(revisionSchema);
export type RevisionChain = z.infer<typeof revisionChainSchema>;

/** Selects which revisions of a chain an inspection covers. */
export const revisionScopeSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{ kind: z.ZodLiteral<'all'> }>,
    z.ZodObject<{ kind: z.ZodLiteral<'latest'>; count: z.ZodInt }>,
  ],
  'kind'
> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('latest'), count: z.int().positive() }),
]);
export type RevisionScope = z.infer<typeof revisionScopeSchema>;

/** One defect a reviewer reports about a record. */
export const findingSchema: z.ZodObject<{
  code: z.ZodString;
  message: z.ZodString;
  revisionId: z.ZodNullable<z.ZodString>;
}> = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  revisionId: z.string().min(1).nullable(),
});
export type Finding = z.infer<typeof findingSchema>;

/**
 * What an inspection observed about one record: the chain as recorded, which
 * predecessor references resolved to a revision of that chain and which did
 * not, and any findings. An inspection reports facts; a reviewer decides which
 * of them are defects, so `findings` is empty unless a validator filled it.
 */
export const inspectionReportSchema: z.ZodObject<{
  recordId: typeof recordIdSchema;
  chain: typeof revisionChainSchema;
  resolvedPredecessors: z.ZodArray<z.ZodString>;
  unresolvedPredecessors: z.ZodArray<z.ZodString>;
  findings: z.ZodArray<typeof findingSchema>;
}> = z.object({
  recordId: recordIdSchema,
  chain: revisionChainSchema,
  resolvedPredecessors: z.array(z.string().min(1)),
  unresolvedPredecessors: z.array(z.string().min(1)),
  findings: z.array(findingSchema),
});
export type InspectionReport = z.infer<typeof inspectionReportSchema>;

/** The verdict of one review. */
export const reviewStatusSchema: z.ZodEnum<{ passed: 'passed'; failed: 'failed' }> = z.enum(['passed', 'failed']);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

/** A neutral event a long-running operation reports as it proceeds. */
export const observationSchema: z.ZodObject<{
  kind: z.ZodString;
  message: z.ZodString;
  recordId: z.ZodOptional<typeof recordIdSchema>;
}> = z.object({
  kind: z.string().min(1),
  message: z.string().min(1),
  recordId: recordIdSchema.optional(),
});
export type Observation = z.infer<typeof observationSchema>;

/**
 * How an operation reports its observations. Passing this callback is what
 * lets an inspection describe its progress without knowing who called it.
 */
export type ObservationCallback = (observation: Observation) => void;
