import { describe, expect, it } from 'vitest';

import { createTestSystem } from './setup.js';

/**
 * The assembled application answered through both protocol surfaces. Every
 * call below goes through a real client, so what passes here is what the
 * listener serves.
 */

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

interface ReviewPayload {
  outcome: {
    recordId: string;
    status: string;
    findings: Array<{ code: string; message: string; revisionId: string | null }>;
  };
  invocation: { sessionId: string | null; requestId: string; recordId: string; boundAt: number };
}

/**
 * The SDK types a tool result as either the current shape or the legacy one,
 * so `content` arrives as `unknown`. This narrows it rather than asserting it,
 * which keeps the protocol's own type honest.
 */
function readText(content: unknown): string {
  if (!Array.isArray(content) || content.length !== 1) {
    throw new Error('The tool answered with something other than one content block.');
  }

  const first: unknown = content[0];

  if (typeof first !== 'object' || first === null || !('type' in first) || first.type !== 'text') {
    throw new Error('The tool answered with a content block that is not text.');
  }

  if (!('text' in first) || typeof first.text !== 'string') {
    throw new Error('The tool answered with a text block that carries no text.');
  }

  return first.text;
}

describe('catalog.get through the tRPC client', () => {
  it('answers for both records', async () => {
    const { client } = createTestSystem();

    await expect(client.catalog.get.query({ recordId: 'rec-valid' })).resolves.toEqual({
      recordId: 'rec-valid',
      title: 'Intact revision history',
      revisionCount: 2,
      latestRevisionId: 'rev-2',
    });
    await expect(client.catalog.get.query({ recordId: 'rec-broken' })).resolves.toEqual({
      recordId: 'rec-broken',
      title: 'Chain with a missing predecessor',
      revisionCount: 2,
      latestRevisionId: 'rev-2',
    });
  });

  it('reports an unknown record as not found', async () => {
    const { client } = createTestSystem();

    await expect(client.catalog.get.query({ recordId: 'rec-missing' })).rejects.toThrow(/rec-missing/);
  });
});

describe('reviews.run through the tRPC client', () => {
  it('reviews both records through the assembled router', async () => {
    const { client } = createTestSystem();

    await expect(client.reviews.run.mutate({ recordId: 'rec-valid' })).resolves.toMatchObject({
      recordId: 'rec-valid',
      status: 'passed',
      findings: [],
    });

    const broken = await client.reviews.run.mutate({ recordId: 'rec-broken' });

    expect(broken.status).toBe('failed');
    expect(broken.findings.map((finding) => finding.revisionId)).toEqual(['rev-2']);
  });
});

describe('the MCP surface', () => {
  it('lists the tools the features contributed', async () => {
    const { connectMcpSession } = createTestSystem();
    const session = await connectMcpSession('session-list');

    try {
      const listed = await session.client.listTools();

      expect(listed.tools.map((tool) => tool.name)).toEqual(['catalog.inspect', 'reviews.run']);
      expect(listed.tools.map((tool) => tool.inputSchema.required)).toEqual([
        ['recordId'],
        ['recordId'],
      ]);
    } finally {
      await session.close();
    }
  });

  it('calls catalog.inspect for both records on one session', async () => {
    const { connectMcpSession } = createTestSystem();
    const session = await connectMcpSession('session-call');

    try {
      const intact = await session.client.callTool({
        name: 'catalog.inspect',
        arguments: { recordId: 'rec-valid' },
      });
      const intactPayload: InspectionPayload = JSON.parse(readText(intact.content));

      expect(intact.isError).toBeFalsy();
      expect(intactPayload.report.unresolvedPredecessors).toEqual([]);
      expect(intactPayload.report.resolvedPredecessors).toEqual(['rev-1']);

      const broken = await session.client.callTool({
        name: 'catalog.inspect',
        arguments: { recordId: 'rec-broken' },
      });
      const brokenPayload: InspectionPayload = JSON.parse(readText(broken.content));

      expect(broken.isError).toBeFalsy();
      expect(brokenPayload.report.unresolvedPredecessors).toEqual(['rev-0']);
      // The report states facts. Deciding that the missing predecessor is a
      // defect is the reviewer's job, so there are no findings yet.
      expect(brokenPayload.report.findings).toEqual([]);
      expect(brokenPayload.observations).toHaveLength(2);
    } finally {
      await session.close();
    }
  });

  it('runs one review end to end on one session', async () => {
    const { connectMcpSession } = createTestSystem();
    const session = await connectMcpSession('session-review');

    try {
      const called = await session.client.callTool({
        name: 'reviews.run',
        arguments: { recordId: 'rec-broken' },
      });
      const payload: ReviewPayload = JSON.parse(readText(called.content));

      expect(called.isError).toBeFalsy();
      expect(payload.outcome.status).toBe('failed');
      expect(payload.outcome.findings.map((finding) => finding.code)).toEqual([
        'missing-predecessor',
      ]);
      // The whole application is behind this one call: the catalog's
      // inspection satisfies the review's port, and the root is the only
      // owner that knows it.
      expect(payload.invocation.sessionId).toBe('session-review');
    } finally {
      await session.close();
    }
  });

  it('answers an unknown tool name with an error result', async () => {
    const { connectMcpSession } = createTestSystem();
    const session = await connectMcpSession('session-unknown-tool');

    try {
      const result = await session.client.callTool({ name: 'catalog.destroy', arguments: {} });

      expect(result.isError).toBe(true);
      expect(readText(result.content)).toContain('catalog.destroy');
    } finally {
      await session.close();
    }
  });
});
