import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createTRPCClient, httpLink } from '@trpc/client';
import type { TRPCClient } from '@trpc/client';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { assembleSystem } from '../assembly.js';
import type { AppRouter } from '../assembly.js';
import type { InvocationContext } from '../interfaces/protocol.js';

/**
 * The configured system, for any owner's tests.
 *
 * Both clients are the real ones. The tRPC client speaks to the fetch adapter
 * over the assembled router, and the MCP client speaks to a server built by
 * the same factory the listener uses, over the SDK's linked in-memory
 * transports. No socket is opened and no protocol is imitated, so a test that
 * passes here exercises the same runtimes the application serves.
 */

/** One connected MCP session and the means to close it. */
export interface McpSession {
  client: Client;
  close: () => Promise<void>;
}

/** The assembled system as a test uses it. */
export interface TestSystem {
  router: AppRouter;
  client: TRPCClient<AppRouter>;
  connectMcpSession: (sessionId: string) => Promise<McpSession>;
}

/** The base URL the test client posts to; the fetch adapter answers it directly. */
const testOrigin = 'http://collection-review.test';

export function createTestSystem(): TestSystem {
  const system = assembleSystem();

  let requestCount = 0;

  const createContext = (): InvocationContext => {
    requestCount += 1;
    return { requestId: `test-request-${requestCount}`, sessionId: null };
  };

  const client = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${testOrigin}/trpc`,
        fetch: (input, init) =>
          fetchRequestHandler({
            router: system.router,
            req: new Request(input, init),
            endpoint: '/trpc',
            createContext,
          }),
      }),
    ],
  });

  /**
   * Opens one MCP session under the given id. The server-side transport
   * carries that id, so every request handler sees it in its request context,
   * for `tools/list` and `tools/call` alike.
   */
  const connectMcpSession = async (sessionId: string): Promise<McpSession> => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    serverTransport.sessionId = sessionId;

    const server = system.createMcpServer();
    const mcpClient = new Client({ name: 'collection-review-tests', version: '0.0.0' });

    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);

    return {
      client: mcpClient,
      close: async () => {
        await mcpClient.close();
        await server.close();
      },
    };
  };

  return { router: system.router, client, connectMcpSession };
}
