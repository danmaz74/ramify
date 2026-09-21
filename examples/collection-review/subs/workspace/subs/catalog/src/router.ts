import { TRPCError } from '@trpc/server';
import type { TRPCQueryProcedure } from '@trpc/server';
import { z } from 'zod';

import { recordIdSchema } from '../../contracts/src/interfaces/vocabulary.js';
import type { RecordId } from '../../contracts/src/interfaces/vocabulary.js';
import { getRecord } from '../subs/core/src/catalog.js';
import type { CatalogSummary } from '../subs/core/src/catalog.js';
import type { ProtocolFacilities } from '../../../../../src/interfaces/protocol.js';
import type { ProtocolRouter } from '../../../../../src/interfaces/protocol.js';

/**
 * The catalog's procedures, as the application router mounts them: `get`
 * takes a record id and answers with that record's summary.
 *
 * The input is what the procedure's parser accepts. The answer is written in
 * the shared vocabulary rather than as the core's `CatalogSummary`, so the
 * application router's contract names nothing of the core and the summary type
 * still stops at the shell. The summary `get` returns must satisfy it.
 */
export type CatalogProcedures = {
  get: TRPCQueryProcedure<{
    input: { recordId: z.input<typeof recordIdSchema> };
    output: { recordId: RecordId; title: string; revisionCount: number; latestRevisionId: string };
    meta: object;
  }>;
};

/**
 * The catalog's tRPC surface.
 *
 * The factory receives the configured runtime rather than importing it, so the
 * root stays the only place a runtime is created. Its declared return type
 * states the procedure's input and output types, and they survive composition
 * into the application router.
 */
export function createCatalogRouter(facilities: ProtocolFacilities): ProtocolRouter<CatalogProcedures> {
  return facilities.router({
    get: facilities.procedure
      .input(z.object({ recordId: recordIdSchema }))
      .query(({ input }): CatalogSummary => {
        const summary = getRecord(input.recordId);

        if (!summary) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `No record is recorded under the id ${input.recordId}.`,
          });
        }

        return summary;
      }),
  });
}
