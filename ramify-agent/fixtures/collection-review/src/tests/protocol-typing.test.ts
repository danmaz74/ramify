import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { createTestSystem } from './setup.js';
import type { InvocationContext } from '../interfaces/protocol.js';

/**
 * The root-level type assertions.
 *
 * Runtime tests alone cannot show that the assembled surface is exactly typed,
 * because a widened router satisfies every call. These assertions fail the
 * build instead, and each `@ts-expect-error` below fails it from the other
 * side: `type-check` reports an unused directive as an error, so a widened
 * type cannot pass unnoticed.
 */

describe('the assembled router', () => {
  it('keeps the procedure input inferred from its parser', async () => {
    const { router } = createTestSystem();
    const caller = router.createCaller({ requestId: 'typing-1', sessionId: null });

    expectTypeOf(caller.catalog.get).parameter(0).toEqualTypeOf<{ recordId: string }>();

    await expect(caller.catalog.get({ recordId: 'rec-valid' })).resolves.toMatchObject({
      recordId: 'rec-valid',
    });
  });

  it('creates its invocation context per request', () => {
    const { router } = createTestSystem();

    expectTypeOf(router.createCaller)
      .parameter(0)
      .toEqualTypeOf<InvocationContext | (() => InvocationContext | Promise<InvocationContext>)>();
  });
});

/**
 * Neither declaration below is ever called: the assertion is the compiler
 * error each one provokes.
 */

function callerWithoutInvocationContext(): void {
  const { router } = createTestSystem();

  // @ts-expect-error A server-side caller needs the invocation context; the
  // router's context type is not satisfied by an absent argument.
  router.createCaller();
}

async function fetchAdapterWithoutContextFactory(): Promise<Response> {
  const { router } = createTestSystem();

  // @ts-expect-error The router's context has required members, so the fetch
  // adapter's options make `createContext` required too.
  return fetchRequestHandler({
    router,
    req: new Request('http://collection-review.test/trpc/catalog.get'),
    endpoint: '/trpc',
  });
}

export { callerWithoutInvocationContext, fetchAdapterWithoutContextFactory };
