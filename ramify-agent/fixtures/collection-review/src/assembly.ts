import { createFacilities, createMcpServer } from './protocol.js';
import { inspect } from '../subs/workspace/subs/catalog/subs/core/src/catalog.js';
import { createCatalogTools } from '../subs/workspace/subs/catalog/src/mcp.js';
import { createCatalogRouter } from '../subs/workspace/subs/catalog/src/router.js';
import { createReviewsTools } from '../subs/workspace/subs/reviews/src/mcp.js';
import { createReviewsRouter } from '../subs/workspace/subs/reviews/src/router.js';
import type { McpToolContribution } from './interfaces/protocol.js';
import type { InspectionPort } from '../subs/workspace/subs/reviews/subs/core/src/interfaces/port.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * The one place the application is put together.
 *
 * Each feature relays its factories up to this owner. Here the protocol
 * runtimes are created once, every feature's router is mounted under its own
 * key, and every feature's tool contributions are collected behind one server
 * factory.
 *
 * This is also the only place that knows the two features are related. The
 * review runtime asks for an inspection port; the catalog happens to have an
 * operation that satisfies it. Neither owner imports the other, and neither
 * knows that the wiring below exists.
 */

/** The configured tRPC runtime, as the feature factories receive it. */
type ProtocolRuntime = ReturnType<typeof createFacilities>;

/**
 * The catalog's inspection, as the review's port. It fits without an adapter
 * because both sides are written in the neutral vocabulary the `contracts`
 * owner publishes. The map records this symbol under the name `inspectRecord`,
 * which is how it reached this owner; an exposed name never prescribes an
 * import's spelling.
 */
const inspectionPort: InspectionPort = { inspect };

function assembleRouter(facilities: ProtocolRuntime) {
  return facilities.router({
    catalog: createCatalogRouter(facilities),
    reviews: createReviewsRouter(facilities, inspectionPort),
  });
}

/** The assembled application: one router, one tool list, one server factory. */
export interface AssembledSystem {
  router: ReturnType<typeof assembleRouter>;
  contributions: readonly McpToolContribution[];
  createMcpServer: () => Server;
}

export function assembleSystem(): AssembledSystem {
  const facilities = createFacilities();
  const router = assembleRouter(facilities);
  const contributions: readonly McpToolContribution[] = [
    ...createCatalogTools(),
    ...createReviewsTools(inspectionPort),
  ];

  return {
    router,
    contributions,
    // The contributions are built once, here. The SDK binds one server to one
    // transport, so a fresh server over the same contributions is created for
    // each connection. The review session table lives behind those
    // contributions and is therefore shared by every connection.
    createMcpServer: () => createMcpServer(contributions),
  };
}

/** The application router's type, as the browser client and the tests use it. */
export type AppRouter = AssembledSystem['router'];
