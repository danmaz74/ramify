import { TRPCError } from '@trpc/server';
import type { TRPCMutationProcedure } from '@trpc/server';
import { z } from 'zod';

import { recordIdSchema, revisionScopeSchema } from '../../contracts/src/interfaces/vocabulary.js';
import type { Finding, Observation, RecordId, ReviewStatus } from '../../contracts/src/interfaces/vocabulary.js';
import { createReviewRuntime } from '../subs/core/src/runtime.js';
import type { ReviewOutcome } from '../subs/core/src/runtime.js';
import type { InspectionPort } from '../subs/core/src/interfaces/port.js';
import type { ProtocolFacilities } from '../../../../../src/interfaces/protocol.js';
import type { ProtocolRouter } from '../../../../../src/interfaces/protocol.js';

/**
 * The review feature's procedures, as the application router mounts them:
 * `run` takes a record id and an optional revision scope and answers with the
 * review's outcome.
 *
 * The input is what the procedure's parser accepts. The answer is written in
 * the shared vocabulary rather than as the runtime's `ReviewOutcome`, so the
 * application router's contract names nothing of the runtime and the outcome
 * type still stops at this owner. The outcome `run` returns must satisfy it.
 */
export type ReviewsProcedures = {
  run: TRPCMutationProcedure<{
    input: { recordId: z.input<typeof recordIdSchema>; scope?: z.input<typeof revisionScopeSchema> | undefined };
    output: { recordId: RecordId; status: ReviewStatus; findings: Finding[]; observations: Observation[] };
    meta: object;
  }>;
};

/**
 * The review feature's tRPC surface.
 *
 * The factory receives the configured runtime and the inspection port rather
 * than importing either, so the root stays the only place a runtime is created
 * and the only place that decides what satisfies the port. `run` is a mutation
 * because a review is work performed on request, not a value read.
 *
 * This surface has no session of its own: the tRPC transport carries none, so
 * a caller states its scope with every request. The session binding belongs to
 * the MCP surface beside this one.
 */
export function createReviewsRouter(
  facilities: ProtocolFacilities,
  port: InspectionPort,
): ProtocolRouter<ReviewsProcedures> {
  const runtime = createReviewRuntime(port);

  return facilities.router({
    run: facilities.procedure
      .input(z.object({ recordId: recordIdSchema, scope: revisionScopeSchema.optional() }))
      .mutation(({ input }): ReviewOutcome => {
        const outcome = runtime.run(input.recordId, input.scope ?? { kind: 'all' });

        if (!outcome) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `No record is recorded under the id ${input.recordId}.`,
          });
        }

        return outcome;
      }),
  });
}
