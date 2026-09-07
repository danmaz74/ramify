import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { recordIdSchema } from '../../contracts/src/interfaces/vocabulary.js';
import { getRecord } from '../subs/core/src/catalog.js';
import type { CatalogSummary } from '../subs/core/src/catalog.js';
import type { ProtocolFacilities } from '../../../../../src/interfaces/protocol.js';

/**
 * The catalog's tRPC surface.
 *
 * The factory receives the configured runtime rather than importing it, so the
 * root stays the only place a runtime is created and the procedure's inferred
 * input and output types survive composition into the application router.
 */
export function createCatalogRouter(facilities: ProtocolFacilities) {
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
