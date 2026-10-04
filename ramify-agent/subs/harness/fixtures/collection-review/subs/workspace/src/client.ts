import { createTRPCClient, httpLink } from '@trpc/client';
import type { TRPCClient } from '@trpc/client';

import type { AppRouter } from '../../../src/interfaces/protocol.js';

/**
 * The browser's typed client.
 *
 * `AppRouter` arrives through a statement-level `import type`, which erases
 * the whole statement: the shell learns the exact shape of every procedure the
 * root assembled and loads none of the root's Node runtime to do it. The
 * router type is the only thing this owner needs from the application root,
 * and the exposure that carries it is the root's alone.
 */

/**
 * A client for the API this application serves. The default URL is the path
 * the development server proxies to the API process, so the browser talks to
 * one origin.
 */
export function createClient(url = '/trpc'): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({ links: [httpLink({ url })] });
}
