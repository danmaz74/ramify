import { z } from 'zod';

/**
 * Every error the protocol can report. For commands:
 * - `conflict`: a command ID reused with different content, or a command the
 *   job's state does not allow;
 * - `stale-version`: the expected version is not the job's, which the error
 *   carries as `currentVersion`;
 * - `busy`: another job is running in the project;
 * - `unavailable`: the harness cannot run the command, such as a start with
 *   no agent configured, or an approval whose evidence cannot be materialized;
 * - `inputs-changed`: an approval refused as stale, because the plan or the
 *   source is no longer what the map's manifest names.
 *
 * For queries, `unsupported-version` is a record whose schema version this
 * harness does not read. It is a failure with evidence, never an absent
 * record, so a query never answers `not-found` for a record that exists.
 */
export const errorCodeSchema = z.enum([
  'invalid-request',
  'not-found',
  'unreadable',
  'conflict',
  'stale-version',
  'busy',
  'unavailable',
  'inputs-changed',
  'internal',
  'unsupported-version',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** The HTTP status that carries each error code. */
export const errorHttpStatus: Readonly<Record<ErrorCode, number>> = {
  'invalid-request': 400,
  'not-found': 404,
  unreadable: 422,
  conflict: 409,
  'stale-version': 409,
  busy: 409,
  unavailable: 503,
  'inputs-changed': 409,
  internal: 500,
  'unsupported-version': 422,
};

/** The body of every non-2xx response under `/api/v1`. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    /** The job's current version, on a `stale-version` rejection. */
    currentVersion: z.int().nonnegative().optional(),
    /** What establishes the failure, such as the record's path and the schema it declares. */
    evidence: z.array(z.string()).optional(),
  }).strict(),
}).strict();
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
