// The runtime's type is read off the tRPC package itself, so that
// `ProtocolFacilities` names no binding of this owner's runtime files. The
// assembly passes what `createFacilities` returns wherever this type is
// expected, so the two cannot drift. Nothing is imported at runtime.
import type { initTRPC } from '@trpc/server';

/**
 * The neutral protocol vocabulary the application root shares with its
 * dispatch-classified descendants.
 *
 * Only the names this owner exposes leave it. The shapes those exposed
 * contracts are written in are exposed with them: a symbol's signature
 * companions must be available wherever the symbol is.
 */

/**
 * The application router's type, forwarded from the assembly that builds it.
 *
 * This is a same-owner alias rather than a new binding: the original stays in
 * `assembly.ts`, owned here and carrying this owner's `dispatch` tag. The
 * router's type is inferred from the function that composes it, so that
 * function travels with the type as its signature companion. The rest of the
 * assembly stays private. A descendant that receives the router type imports
 * it from this file, which is the only file the root exposes it from.
 *
 * `export type` erases the statement entirely, so nothing of the assembly's
 * Node runtime can travel to a browser along this route: `assembleRouter` is
 * usable here only in a type position.
 */
export type { AppRouter, assembleRouter } from '../assembly.js';

/**
 * What every request knows about itself, whichever protocol carried it. It is
 * the tRPC context created once per request, and the same pair travels with
 * every MCP tool invocation. `sessionId` is the transport's session identity
 * when the transport has one, and `null` otherwise.
 */
export interface InvocationContext {
  readonly requestId: string;
  readonly sessionId: string | null;
}

/**
 * The pieces of the configured tRPC runtime a feature factory needs to build
 * its own router. The root creates the runtime once and hands these to each
 * factory; it never exposes the runtime itself as an importable singleton.
 */
export type ProtocolFacilities = Pick<
  ReturnType<ReturnType<typeof initTRPC.context<InvocationContext>>['create']>,
  'procedure' | 'router'
>;

/** The request identity an MCP tool receives, taken from its request context. */
export interface ToolInvocation {
  readonly sessionId: string | null;
  readonly requestId: string;
}

/**
 * The JSON Schema an MCP tool advertises for its arguments. The root passes it
 * to `tools/list` unread: argument shapes belong to the feature that owns the
 * tool.
 */
export type ToolInputSchema = {
  type: 'object';
  properties?: Record<string, object>;
  required?: string[];
};

/** What an MCP tool answers with. Text content keeps the root out of the payload. */
export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * One tool a feature contributes to the application's single MCP surface. The
 * feature owns the tool's name, its argument schema, its argument parsing and
 * its result adaptation; the root only routes by name.
 *
 * The descriptor is produced per invocation rather than held as data, because
 * a tool whose behaviour depends on the session must be able to describe
 * itself under that session's current binding. The root therefore builds the
 * same invocation for `tools/list` as for `tools/call`, and a tool whose
 * description never varies simply ignores the argument.
 */
export interface McpToolContribution {
  readonly name: string;
  describe(invocation: ToolInvocation): { description: string; inputSchema: ToolInputSchema };
  call(args: unknown, invocation: ToolInvocation): Promise<ToolResult>;
}
