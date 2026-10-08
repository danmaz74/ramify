import { describe, expect, expectTypeOf, it } from 'vitest';

import { createTestSystem } from '../../../../../../src/tests/setup.js';
import type { ReviewOutcome } from '../../subs/core/src/runtime.js';

/**
 * The review surface's type assertions.
 *
 * A runtime test cannot tell an exact result type from a widened one, because
 * both answer every call. These assertions fail the build instead: the first
 * if the client's output is anything but the runtime-owned outcome, the second
 * if an input the parser rejects has become legal source. `type-check` reports
 * an unused `@ts-expect-error` as an error, so neither can pass unnoticed.
 */

describe('reviews.run through the typed client', () => {
  it('returns exactly the outcome the review runtime owns', async () => {
    const { client } = createTestSystem();

    const outcome = await client.reviews.run.mutate({ recordId: 'rec-valid' });

    expectTypeOf(outcome).toEqualTypeOf<ReviewOutcome>();
    expect(outcome.status).toBe('passed');
  });
});

/**
 * Never called: the assertion is the compiler error the declaration provokes.
 */
async function reviewWithoutARecordId(): Promise<void> {
  const { client } = createTestSystem();

  // @ts-expect-error The procedure's parser requires a record id, so an input
  // without one is not a legal call.
  await client.reviews.run.mutate({});
}

export { reviewWithoutARecordId };
