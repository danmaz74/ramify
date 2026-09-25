import { z } from 'zod';
import { passageReferenceSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { candidateSchema } from '../../subs/nonfunctional/src/interfaces/contracts.js';

const text = z.string().min(1);

export const deviationOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('work-item-conflict'), request: text, workItem: text, architectInvocation: text }).strict(),
  z.object({ kind: z.literal('nonfunctional-assessment'), nfr: z.string().regex(/^nfr-\d{3,}$/), assessment: text, candidate: candidateSchema, coordinatorInvocation: text }).strict(),
]);

export const preparedCandidateSchema = z.object({
  schema: z.literal('ramify-agent.prepared-candidate/1'),
  candidate: candidateSchema,
  scenarioRenderingHash: z.string().regex(/^[0-9a-f]{64}$/),
  writerSettled: z.literal(true),
}).strict();

/** A read-only projection; absent Plan 13 evidence is unavailable. */
export const mergeReadinessSchema = z.object({
  status: z.enum(['ready', 'pending-review', 'rejected', 'gate-failed', 'unavailable']),
  candidate: candidateSchema.nullable(),
  finalGate: text.nullable(),
  checkFindings: z.array(text),
  reason: text,
}).strict();
export type MergeReadiness = z.infer<typeof mergeReadinessSchema>;

/** A deviation retains exactly the source obligation it changes. */
export const nonfunctionalDeviationSchema = z.object({
  schema: z.literal('ramify-agent.nonfunctional-deviation/1'),
  id: text,
  origin: z.object({ kind: z.literal('nonfunctional-assessment'), nfr: text, assessment: text, candidate: candidateSchema, coordinatorInvocation: text }).strict(),
  passage: passageReferenceSchema,
  evidence: z.array(text),
  uncertainty: z.string(),
  proposedAlternative: z.string(),
  checkFinding: text,
}).strict();

export function legacyNonfunctionalCoverage(manifest: { readonly documentManifest?: unknown }): MergeReadiness {
  return {
    status: 'unavailable', candidate: null, finalGate: null, checkFindings: [],
    reason: manifest.documentManifest === undefined ? 'This run predates captured non-functional evidence' : 'No matching final assessment and gate are recorded',
  };
}
