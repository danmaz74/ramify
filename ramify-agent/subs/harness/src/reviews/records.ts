import { join } from 'node:path';
import { z } from 'zod';
import { checkFindingIdSchema, checkFindingLocationSchema, checkFindingRiskSchema } from '../../subs/check-findings/src/interfaces/check-findings.js';
import { sha256Schema } from '../interfaces/protocol/evidence.js';
import { reviewKindSchema, reviewPolicyVersion, sessionIdSchema } from '../run/records.js';
import { packageCitationSchema } from '../../subs/plan-evidence/src/interfaces/catalog.js';

/*
 * The durable records of iteration reviews (Plan 12 appendix §3). A request
 * is one review question over one audited candidate, recorded once per key
 * before the driver passes the iteration. An attempt is one execution of
 * it, and only its terminal record is committed: a queued attempt is the
 * durable request without a settling attempt, and a running one has its
 * start and no finish. The CheckFindings a finished attempt promotes travel
 * on the same line as its terminal record.
 */

const text = z.string().min(1);

/** `rq-0001`, the count of committed `review-request-recorded` events plus one. */
export const reviewRequestId = (count: number): string => `rq-${String(count).padStart(4, '0')}`;
/** `rq-0001.a01`, the count of the request's attempts plus one. */
export const reviewAttemptId = (request: string, count: number): string => `${request}.a${String(count).padStart(2, '0')}`;
/** An attempt's directory, `01`, from its ID. */
export const attemptDirectory = (attempt: string): string => attempt.slice(attempt.lastIndexOf('.a') + 2);
/** `concern-01`, a concern's position in its validated submission. */
export const concernKey = (index: number): string => `concern-${String(index + 1).padStart(2, '0')}`;

export const reviewRequestIdSchema = z.string().regex(/^rq-\d{4,}$/);
export const reviewAttemptIdSchema = z.string().regex(/^rq-\d{4,}\.a\d{2,}$/);

/** A captured input a request names with the hash of its bytes. */
const hashedRefSchema = z.object({ ref: text, hash: sha256Schema }).strict();

/**
 * The session point a review starts from. Code review never forks, so its
 * key cannot change when forks are introduced for the other questions. A
 * scope review names the local architect's pinned point at the assignment,
 * or why none was captured. A design review names the orientation of its
 * guidance selection by key: the orientation is made by the first attempt
 * that needs it, and every design review of the same key forks it.
 */
export const forkPointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('session'), session: sessionIdSchema, ref: text }).strict(),
  z.object({ kind: z.literal('orientation'), key: sha256Schema }).strict(),
  z.object({ kind: z.literal('unavailable'), reason: text }).strict(),
]);
export type ForkPoint = z.infer<typeof forkPointSchema>;

/** One review question over one audited candidate, immutable once recorded. */
export const reviewRequestSchema = z.object({
  schema: z.literal('ramify-agent.review-request/1'),
  id: reviewRequestIdSchema,
  /** One request per key. */
  key: z.object({
    iteration: text,
    /** The audited commit of the passing iteration gate. */
    candidate: text,
    kind: reviewKindSchema,
    policy: z.literal(reviewPolicyVersion),
  }).strict(),
  workItem: text,
  /** The iteration assignment record's path under the run directory. */
  assignment: text,
  /** The accepted source boundary the iteration started from, which the candidate diff is taken against. */
  base: text,
  /** The passing gate attempt. */
  gate: text,
  /** The candidate's tree, as Git names it. */
  tree: text,
  /** An input that failed while the request was recorded is never an empty package. */
  inputsUnavailable: text.optional(),
  /**
   * Code and scope: the package the reviewer receives, the assignment's
   * elements with, for scope, the plan deviations recorded when the request
   * was; absent where the assignment cites none.
   */
  source: packageCitationSchema.optional(),
  guidance: z.array(hashedRefSchema),
  forkPoint: forkPointSchema,
}).strict();
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

const inspectedSchema = z.array(z.object({ path: text }).strict());
const missingSchema = z.array(z.object({ path: text, reason: text }).strict());

/** Why an attempt did not verify its scope. None of these is a clean review. */
export const notVerifiedReasonSchema = z.enum([
  'invalid-output', 'unavailable', 'timed-out', 'execution-failed', 'deadline',
  'queue-overflow', 'no-time-before-deadline', 'stopped',
]);
export type NotVerifiedReason = z.infer<typeof notVerifiedReasonSchema>;

/** What a finished attempt found: its covered scope, or why it covered none. */
export const reviewResultSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('complete'), inspected: inspectedSchema, concerns: z.int().nonnegative() }).strict(),
  z.object({ result: z.literal('partial'), inspected: inspectedSchema, missing: missingSchema.min(1), concerns: z.int().nonnegative() }).strict(),
  z.object({ result: z.literal('not-verified'), reason: notVerifiedReasonSchema, detail: z.string() }).strict(),
]);
export type ReviewResult = z.infer<typeof reviewResultSchema>;

/** One terminal attempt of a request. */
export const reviewAttemptSchema = z.object({
  schema: z.literal('ramify-agent.review-attempt/1'),
  id: reviewAttemptIdSchema,
  request: reviewRequestIdSchema,
  queuedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime(),
  invocation: text.nullable(),
  session: sessionIdSchema.nullable(),
  requestedStart: z.enum(['fresh', 'fork']),
  /** What the executor answered; null when no session ran. */
  actualStart: z.enum(['fresh', 'fork']).nullable(),
  result: reviewResultSchema,
  /** Whether this attempt settles its request; a not-verified attempt with a retry left does not. */
  settles: z.boolean(),
  /** The CheckFindings this attempt opened or reported to, in concern order. */
  checkFindings: z.array(checkFindingIdSchema),
}).strict();
export type ReviewAttempt = z.infer<typeof reviewAttemptSchema>;

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

/** The submission as its record holds it. */
export const reviewSubmissionRecordSchema = reviewSubmissionSchema.extend({
  schema: z.literal('ramify-agent.review-submission/1'),
  attempt: reviewAttemptIdSchema,
}).strict();
export type ReviewSubmissionRecord = z.infer<typeof reviewSubmissionRecordSchema>;

// The events' data. The run log imports these.

export const reviewRequestRecordedDataSchema = z.object({
  request: reviewRequestIdSchema,
  workItem: text,
  iteration: text,
  kind: reviewKindSchema,
  gate: text,
  candidate: text,
}).strict();

/**
 * An attempt's session is about to start. The start the executor actually
 * made is known only once it has, so the terminal attempt records it.
 */
export const reviewAttemptStartedDataSchema = z.object({
  request: reviewRequestIdSchema,
  attempt: reviewAttemptIdSchema,
  invocation: text,
  session: sessionIdSchema,
  requestedStart: z.enum(['fresh', 'fork']),
}).strict();

/** The fields of `review-attempt-finished` beside its carried CheckFinding events. */
export const reviewAttemptFinishedFields = {
  request: reviewRequestIdSchema,
  attempt: reviewAttemptIdSchema,
  result: z.enum(['complete', 'partial', 'not-verified']),
  reason: notVerifiedReasonSchema.nullable(),
  settles: z.boolean(),
} as const;

/**
 * One design orientation: a reviewer session that read one guidance
 * selection, whose end point the design reviews of the same key fork. A
 * failed orientation is recorded too, so the run does not make it again
 * and its design reviews start fresh with the reason.
 */
export const reviewOrientationSchema = z.object({
  schema: z.literal('ramify-agent.review-orientation/1'),
  /** SHA-256 over the guidance selection and hashes, the question, the reviewer's package and the executor. */
  key: sha256Schema,
  guidance: z.array(hashedRefSchema).min(1),
  /** The request whose attempt made it. */
  request: reviewRequestIdSchema,
  invocation: text.nullable(),
  session: sessionIdSchema.nullable(),
  /** The executor's pinned ref at the orientation's end; null when it did not orient. */
  ref: text.nullable(),
  outcome: z.enum(['oriented', 'failed']),
  /** The reviewer's own account of what the guidance asks, from its submission. */
  summary: z.string().nullable(),
  reason: z.string().nullable(),
}).strict();
export type ReviewOrientation = z.infer<typeof reviewOrientationSchema>;

export const reviewOrientationRecordedDataSchema = z.object({
  key: sha256Schema,
  request: reviewRequestIdSchema,
  invocation: text.nullable(),
  session: sessionIdSchema.nullable(),
  outcome: z.enum(['oriented', 'failed']),
}).strict();

/** What an orientation session submits: the guidance it read, and what that guidance asks of a design. */
export const orientationSubmissionSchema = z.object({
  read: z.array(z.string().min(1)).min(1).max(50),
  summary: z.string().min(1).max(4000),
}).strict();
export type OrientationSubmission = z.infer<typeof orientationSubmissionSchema>;

/** Where each review record is materialized, under the run directory. */
export const reviewLayout = {
  request: (request: string): string => join('reviews', request, 'request.json'),
  attempt: (attempt: string): string => join('reviews', attempt.slice(0, attempt.lastIndexOf('.a')), 'attempts', attemptDirectory(attempt), 'attempt.json'),
  submission: (attempt: string): string => join('reviews', attempt.slice(0, attempt.lastIndexOf('.a')), 'attempts', attemptDirectory(attempt), 'submission.json'),
  orientation: (key: string): string => join('reviews', 'orientations', `${key.slice(0, 16)}.json`),
} as const;

export const reviewSchemas = {
  reviewRequest: { schema: 'ramify-agent.review-request/1', body: reviewRequestSchema },
  reviewAttempt: { schema: 'ramify-agent.review-attempt/1', body: reviewAttemptSchema },
  reviewSubmission: { schema: 'ramify-agent.review-submission/1', body: reviewSubmissionRecordSchema },
  reviewOrientation: { schema: 'ramify-agent.review-orientation/1', body: reviewOrientationSchema },
} as const;
