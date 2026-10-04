import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { initTRPC } from '@trpc/server';

import type {
  InvocationContext,
  McpToolContribution,
  ToolInvocation,
} from './interfaces/protocol.js';

/**
 * The application's configured protocol runtimes.
 *
 * Both are created here so that every adapter in the tree composes into one
 * tRPC runtime and one MCP surface. Neither function knows anything about
 * records or reviews: the root routes, and the features decide.
 */

/**
 * Initializes tRPC with the application's invocation context. Feature
 * factories receive the result and build their routers from it, which is what
 * keeps their inferred input and output types intact through composition.
 */
export function createFacilities() {
  return initTRPC.context<InvocationContext>().create();
}

/**
 * Builds one MCP server over the collected tool contributions.
 *
 * The SDK binds a server instance to a single transport, so this is a factory:
 * the caller invokes it once per connection. The contributions themselves are
 * created once at assembly and shared by every server instance.
 */
export function createMcpServer(contributions: readonly McpToolContribution[]): Server {
  const server = new Server(
    { name: 'collection-review', version: '0.0.0' },
    { capabilities: { tools: {} } },
  );

  const byName = new Map(contributions.map((contribution) => [contribution.name, contribution]));

  // Both handlers build the same invocation out of the request context, so a
  // tool sees its session on a listing exactly as it does on a call.
  const invocationOf = (extra: { sessionId?: string; requestId: unknown }): ToolInvocation => ({
    sessionId: extra.sessionId ?? null,
    requestId: String(extra.requestId),
  });

  server.setRequestHandler(ListToolsRequestSchema, (_request, extra) => ({
    tools: contributions.map((contribution) => {
      const descriptor = contribution.describe(invocationOf(extra));

      return {
        name: contribution.name,
        description: descriptor.description,
        inputSchema: descriptor.inputSchema,
      };
    }),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const contribution = byName.get(request.params.name);

    if (!contribution) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }

    // The request context reaches the feature unchanged. The root never reads
    // or parses the tool's arguments.
    return contribution.call(request.params.arguments, invocationOf(extra));
  });

  return server;
}
