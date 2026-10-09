import { z } from 'zod';
import { checkFindingIdSchema, checkFindingLocationSchema, checkFindingRiskSchema } from '../../../check-findings/src/interfaces/check-findings.js';

/**
 * What a reviewer names as grounding a concern: a file of the candidate it
 * read with `snapshot_read` during this attempt, and optionally the words
 * it relies on. The harness hashes the file and classifies its provenance;
 * the reviewer never states how credible it is.
 */
export const reviewGroundSchema = z.object({
  path: z.string().min(1),
  quote: z.string().max(1000).optional(),
}).strict();
export type ReviewGround = z.infer<typeof reviewGroundSchema>;

/** One concern of a reviewer's submission, as the agent writes it. */
export const reviewConcernSchema = z.object({
  summary: z.string().min(1).max(4000),
  consequence: z.string().min(1).max(4000),
  rationale: z.string().min(1).max(4000),
  uncertainty: z.string().min(1).max(4000),
  remedy: z.string().min(1).max(4000),
  locations: z.array(checkFindingLocationSchema).min(1).max(50),
  suggests: checkFindingIdSchema.nullable(),
  /** The harm if the concern is real, as the reviewer proposes it. */
  risk: checkFindingRiskSchema,
  /** What grounds the concern, or null when nothing the reviewer read does. */
  ground: reviewGroundSchema.nullable(),
}).strict();
export type ReviewConcern = z.infer<typeof reviewConcernSchema>;

/**
 * What a reviewer submits: every changed path it inspected, every one it
 * could not with the reason, and its actionable concerns. No concern and no
 * missing path is a clean review of exactly the inspected scope.
 */
export const reviewSubmissionSchema = z.object({
  inspected: z.array(z.string().min(1)).max(500),
  missing: z.array(z.object({ path: z.string().min(1), reason: z.string().min(1).max(1000) }).strict()).max(500),
  concerns: z.array(reviewConcernSchema).max(20),
}).strict();
export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;

/** What an orientation session submits: the guidance it read, and what that guidance asks of a design. */
export const orientationSubmissionSchema = z.object({
  read: z.array(z.string().min(1)).min(1).max(50),
  summary: z.string().min(1).max(4000),
}).strict();
export type OrientationSubmission = z.infer<typeof orientationSubmissionSchema>;
