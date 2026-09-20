import { z } from 'zod';

import { recordIdSchema, revisionScopeSchema } from '../../contracts/src/interfaces/vocabulary.js';
import { inspect } from '../subs/core/src/catalog.js';
import type { Observation } from '../../contracts/src/interfaces/vocabulary.js';
import type { McpToolContribution } from '../../../../../src/interfaces/protocol.js';

/**
 * The catalog's MCP surface.
 *
 * This feature owns everything about its tool: the arguments it accepts, how
 * they are parsed, and how a report and its observations become tool content.
 * The root only routes `catalog.inspect` here.
 */

const inspectArgumentsSchema = z.object({
  recordId: recordIdSchema,
  scope: revisionScopeSchema.optional(),
});

/**
 * The advertised argument schema. It is written out rather than derived from
 * the parser above, because what `tools/list` publishes is a contract in its
 * own right and is asserted as such by this feature's tests.
 */
const inspectInputSchema = {
  type: 'object' as const,
  properties: {
    recordId: { type: 'string', minLength: 1, description: 'The record to inspect.' },
    scope: {
      description: 'Which revisions to inspect. Defaults to the whole chain.',
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

const inspectRecordTool: McpToolContribution = {
  name: 'catalog.inspect',
  // This tool answers the same way whichever session asks, so it ignores the
  // invocation and returns its static descriptor.
  describe() {
    return {
      description:
        'Reports the recorded revision chain of one catalog record, including any predecessor reference that resolves to no revision.',
      inputSchema: inspectInputSchema,
    };
  },
  async call(args) {
    const parsed = inspectArgumentsSchema.safeParse(args);

    if (!parsed.success) {
      return {
        content: [{ type: 'text', text: `catalog.inspect rejected its arguments: ${parsed.error.message}` }],
        isError: true,
      };
    }

    const observations: Observation[] = [];
    const report = inspect(parsed.data.recordId, parsed.data.scope ?? { kind: 'all' }, (observation) => {
      observations.push(observation);
    });

    if (!report) {
      return {
        content: [
          { type: 'text', text: `No record is recorded under the id ${parsed.data.recordId}.` },
        ],
        isError: true,
      };
    }

    return { content: [{ type: 'text', text: JSON.stringify({ report, observations }, null, 2) }] };
  },
};

/** Every MCP tool this feature contributes to the application's one server. */
export function createCatalogTools(): McpToolContribution[] {
  return [inspectRecordTool];
}
