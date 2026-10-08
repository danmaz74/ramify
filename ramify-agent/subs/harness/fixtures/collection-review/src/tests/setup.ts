import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createTRPCClient, httpLink } from '@trpc/client';
import type { TRPCClient } from '@trpc/client';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { assembleSystem } from '../assembly.js';
import type { AppRouter } from '../assembly.js';
import type { InvocationContext } from '../interfaces/protocol.js';
import { startApiServer } from '../server.js';

/**
 * The configured system, for any owner's tests.
 *
 * Both clients are the real ones. The tRPC client speaks to the fetch adapter
 * over the assembled router, and the MCP client speaks to a server built by
 * the same factory the listener uses, over the SDK's linked in-memory
 * transports. No socket is opened and no protocol is imitated, so a test that
 * passes here exercises the same runtimes the application serves.
 */

/**
 * One connected MCP session and the means to close it. `sessionId` is the id
 * the server sees: the one asked for in process, the one the listener's
 * transport generated over HTTP.
 */
export interface McpSession {
  sessionId: string;
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
      sessionId,
      client: mcpClient,
      close: async () => {
        await mcpClient.close();
        await server.close();
      },
    };
  };

  return { router: system.router, client, connectMcpSession };
}

/**
 * The same system, served by the real listener on a loopback port, with the
 * same two clients speaking HTTP to it, and the means to stop it.
 */
export interface ServedTestSystem {
  origin: string;
  client: TRPCClient<AppRouter>;
  connectMcpSession: (sessionId: string) => Promise<McpSession>;
  close: () => Promise<void>;
}

/**
 * Starts the program the entry point starts, on a port the operating system
 * picks, and connects the typed client and MCP sessions to it over HTTP. The
 * listener's transport generates each MCP session's id, so the id asked for
 * names the client only; the session answers the id the server sees.
 */
export async function startServedTestSystem(): Promise<ServedTestSystem> {
  const api = await startApiServer({ port: 0 });
  const origin = `http://127.0.0.1:${api.port}`;
  const client = createTRPCClient<AppRouter>({ links: [httpLink({ url: `${origin}/trpc` })] });
  const opened: McpSession[] = [];

  const connectMcpSession = async (sessionId: string): Promise<McpSession> => {
    const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`));
    const mcpClient = new Client({ name: sessionId, version: '0.0.0' });

    await mcpClient.connect(transport);

    const served = transport.sessionId;

    if (served === undefined) {
      throw new Error('The listener opened an MCP session without an id.');
    }

    const session: McpSession = {
      sessionId: served,
      client: mcpClient,
      close: async () => {
        opened.splice(opened.indexOf(session), 1);
        await mcpClient.close();
        await transport.close();
      },
    };

    opened.push(session);

    return session;
  };

  const close = async (): Promise<void> => {
    for (const session of [...opened]) {
      await session.close();
    }

    await api.close();
  };

  return { origin, client, connectMcpSession, close };
}
