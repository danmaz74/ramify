import { describe, expect, expectTypeOf, it } from 'vitest';

import { createTestSystem } from '../../../../../../src/tests/setup.js';
import type { CatalogSummary } from '../../subs/core/src/catalog.js';

/**
 * The catalog's two adapters, exercised through the configured system.
 *
 * These tests belong to the feature that owns the adapters, and they use the
 * root's testing-only setup through an ordinary exposure. The type assertion
 * below is the point of the file: it fails if the client's output type is
 * anything wider than the core-owned summary.
 */

describe('catalog.get', () => {
  it('returns exactly the core-owned summary', async () => {
    const { client } = createTestSystem();

    const summary = await client.catalog.get.query({ recordId: 'rec-broken' });

    expectTypeOf(summary).toEqualTypeOf<CatalogSummary>();
    expect(summary).toEqual({
      recordId: 'rec-broken',
      title: 'Chain with a missing predecessor',
      revisionCount: 2,
      latestRevisionId: 'rev-2',
    });
  });

  it('rejects an unknown record with the message the adapter wrote', async () => {
    const { client } = createTestSystem();

    await expect(client.catalog.get.query({ recordId: 'rec-missing' })).rejects.toThrow(
      /No record is recorded under the id rec-missing/,
    );
  });
});

describe('catalog.inspect', () => {
  it('parses its own arguments and adapts the report and its observations', async () => {
    const { connectMcpSession } = createTestSystem();
    const session = await connectMcpSession('catalog-adapters');

    try {
      const listed = await session.client.listTools();
      const tool = listed.tools.find((candidate) => candidate.name === 'catalog.inspect');

      expect(tool?.inputSchema.required).toEqual(['recordId']);
      expect(Object.keys(tool?.inputSchema.properties ?? {})).toEqual(['recordId', 'scope']);

      const scoped = await session.client.callTool({
        name: 'catalog.inspect',
        arguments: { recordId: 'rec-valid', scope: { kind: 'latest', count: 1 } },
      });

      expect(readPayload(scoped.content).report.chain).toEqual([
        { id: 'rev-2', predecessor: 'rev-1' },
      ]);
      expect(readPayload(scoped.content).observations).toHaveLength(2);

      const rejected = await session.client.callTool({
        name: 'catalog.inspect',
        arguments: { recordId: '' },
      });

      expect(rejected.isError).toBe(true);
    } finally {
      await session.close();
    }
  });
});

interface InspectionPayload {
  report: {
    recordId: string;
    chain: Array<{ id: string; predecessor: string | null }>;
    resolvedPredecessors: string[];
    unresolvedPredecessors: string[];
    findings: unknown[];
  };
  observations: Array<{ kind: string; message: string; recordId?: string }>;
}

function readPayload(content: unknown): InspectionPayload {
  if (!Array.isArray(content) || content.length !== 1) {
    throw new Error('The tool answered with something other than one content block.');
  }

  const first: unknown = content[0];

  if (typeof first !== 'object' || first === null || !('text' in first) || typeof first.text !== 'string') {
    throw new Error('The tool answered with a content block that carries no text.');
  }

  return JSON.parse(first.text);
}
