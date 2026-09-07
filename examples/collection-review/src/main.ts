import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';

import { assembleSystem } from './assembly.js';
import type { InvocationContext } from './interfaces/protocol.js';

/**
 * The application's one API listener: tRPC under `/trpc`, MCP under `/mcp`.
 *
 * Both mounts serve the same assembled system, so the two protocol surfaces
 * are two adapters over one application rather than two applications.
 */

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
const system = assembleSystem();

function readHeader(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  return typeof value === 'string' ? value : null;
}

/**
 * The invocation context of one HTTP request to the tRPC mount. This transport
 * has no session of its own, so `sessionId` is null here; the MCP transport
 * below is what supplies one.
 */
function createContext(): InvocationContext {
  return { requestId: randomUUID(), sessionId: null };
}

const trpcHandler = createHTTPHandler({
  router: system.router,
  createContext,
  basePath: '/trpc/',
});

/**
 * One streamable HTTP transport, and one MCP server, per session. An
 * initialization request without a session header opens a new pair; every
 * later request carries the session id the transport generated.
 */
const transports = new Map<string, StreamableHTTPServerTransport>();

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function respondWithError(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

async function handleMcp(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const sessionId = readHeader(request, 'mcp-session-id');
  const body = request.method === 'POST' ? await readBody(request) : undefined;

  if (sessionId !== null) {
    const transport = transports.get(sessionId);

    if (!transport) {
      respondWithError(response, 404, `Unknown MCP session: ${sessionId}`);
      return;
    }

    await transport.handleRequest(request, response, body);
    return;
  }

  if (request.method !== 'POST' || !isInitializeRequest(body)) {
    respondWithError(response, 400, 'An MCP request needs a session id, or must be an initialization request.');
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    // Answer a single request with a single JSON response. Nothing this
    // application serves streams, and it keeps the surface inspectable with
    // an ordinary HTTP client.
    enableJsonResponse: true,
    onsessioninitialized: (openedSessionId) => {
      transports.set(openedSessionId, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId !== undefined) {
      transports.delete(transport.sessionId);
    }
  };

  await system.createMcpServer().connect(transport);
  await transport.handleRequest(request, response, body);
}

const server = createServer((request, response) => {
  const path = request.url ?? '/';

  if (path === '/trpc' || path.startsWith('/trpc/') || path.startsWith('/trpc?')) {
    trpcHandler(request, response);
    return;
  }

  if (path === '/mcp' || path.startsWith('/mcp?')) {
    handleMcp(request, response).catch((error: unknown) => {
      respondWithError(response, 500, error instanceof Error ? error.message : String(error));
    });
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not found', path }));
});

server.listen(port, () => {
  console.log(`collection-review api listening on http://localhost:${port}`);
});
