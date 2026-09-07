import { z } from 'zod';

import { recordIdSchema, revisionScopeSchema } from '../../contracts/src/interfaces/vocabulary.js';
import { createReviewRuntime } from '../subs/core/src/runtime.js';
import { createSessionTable } from './session.js';
import type { SessionBinding } from './session.js';
import type { RecordId, RevisionScope } from '../../contracts/src/interfaces/vocabulary.js';
import type { InspectionPort } from '../subs/core/src/interfaces/port.js';
import type {
  McpToolContribution,
  ToolInvocation,
} from '../../../../../src/interfaces/protocol.js';

/**
 * The review feature's MCP surface, and the session wrapper around it.
 *
 * The wrapper is what makes this tool different from the catalog's: the review
 * a session gets depends on what that session is bound to, so the binding is
 * resolved separately for every `tools/list` and every `tools/call`. Nothing
 * is cached between requests and no binding is read at construction time.
 *
 * Each call then takes one immutable snapshot of the request it is serving —
 * session, request, record, scope and the binding that supplied the scope —
 * and everything the call does afterwards reads that snapshot. A later request
 * that rebinds the session cannot change what this one reviewed or reported.
 */

const runArgumentsSchema = z.object({
  recordId: recordIdSchema,
  scope: revisionScopeSchema.optional(),
});

/**
 * The advertised argument schema. It is written out rather than derived from
 * the parser above, because what `tools/list` publishes is a contract in its
 * own right and is asserted as such by this feature's tests.
 */
const runInputSchema = {
  type: 'object' as const,
  properties: {
    recordId: { type: 'string', minLength: 1, description: 'The record to review.' },
    scope: {
      description:
        'Which revisions to review. Binds the session to this scope; later calls without it use the binding.',
      oneOf: [
        { type: 'object', properties: { kind: { const: 'all' } }, required: ['kind'] },
        {
          type: 'object',
          properties: { kind: { const: 'latest' }, count: { type: 'integer', minimum: 1 } },
          required: ['kind', 'count'],
        },
      ],
    },
  },
  required: ['recordId'],
};

/** How a bound scope reads in the tool's description. */
function describeScope(scope: RevisionScope): string {
  return scope.kind === 'all'
    ? 'every recorded revision'
    : `the latest ${scope.count} revision(s)`;
}

/** One request's own record of what it is about to do. */
interface InvocationSnapshot {
  readonly sessionId: string | null;
  readonly requestId: string;
  readonly recordId: RecordId;
  readonly scope: RevisionScope;
  readonly boundAt: number;
}

/**
 * Freezes what this invocation resolved, before any work is done with it. The
 * request identity comes from the invocation the root passed through; the
 * scope comes from the binding resolved a moment ago.
 */
function takeInvocationSnapshot(
  invocation: ToolInvocation,
  recordId: RecordId,
  binding: SessionBinding,
): InvocationSnapshot {
  return Object.freeze({
    sessionId: invocation.sessionId,
    requestId: invocation.requestId,
    recordId,
    scope: binding.scope,
    boundAt: binding.boundAt,
  });
}

/**
 * Every MCP tool this feature contributes to the application's one server.
 *
 * The runtime and the session table are created once, here. The root calls
 * this factory once at assembly and builds a fresh server per connection over
 * the result, so every connection shares one table and sessions opened on
 * different connections stay distinct by their session ids.
 */
export function createReviewsTools(port: InspectionPort): McpToolContribution[] {
  const runtime = createReviewRuntime(port);
  const sessions = createSessionTable();

  const runReviewTool: McpToolContribution = {
    name: 'reviews.run',

    // Resolved per listing: a session that has bound a scope is told, in the
    // description it reads, what it will review.
    describe(invocation) {
      const binding = sessions.resolveBinding(invocation.sessionId);

      return {
        description: `Reviews the revision chain of one catalog record and reports its findings. This session reviews ${describeScope(binding.scope)}; pass "scope" to bind it to another.`,
        inputSchema: runInputSchema,
      };
    },

    async call(args, invocation) {
      const parsed = runArgumentsSchema.safeParse(args);

      if (!parsed.success) {
        return {
          content: [{ type: 'text', text: `reviews.run rejected its arguments: ${parsed.error.message}` }],
          isError: true,
        };
      }

      // A scope in the arguments binds the session first. That is how a real
      // client changes a binding; this feature's own tests can also call the
      // table directly.
      if (parsed.data.scope) {
        sessions.bind(invocation.sessionId, { scope: parsed.data.scope });
      }

      const snapshot = takeInvocationSnapshot(
        invocation,
        parsed.data.recordId,
        sessions.resolveBinding(invocation.sessionId),
      );
      const outcome = runtime.run(snapshot.recordId, snapshot.scope);

      if (!outcome) {
        return {
          content: [
            { type: 'text', text: `No record is recorded under the id ${snapshot.recordId}.` },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ outcome, invocation: snapshot }, null, 2) }],
      };
    },
  };

  return [runReviewTool];
}
