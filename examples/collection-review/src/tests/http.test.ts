import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createTRPCClient, httpLink } from '@trpc/client';
import type { TRPCClient } from '@trpc/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startApiServer } from '../server.js';
import type { ApiServer } from '../server.js';
import type { AppRouter } from '../assembly.js';

/**
 * The listener itself, over a real socket.
 *
 * Every other test in this tree speaks to the assembled system through an
 * in-process transport, which is what keeps them fast. This one starts the
 * program the entry point starts, on a port the operating system picks, and
 * reaches both mounts the way a browser and an MCP client do: one HTTP origin,
 * `/trpc` for the typed client and `/mcp` for the tool sessions.
 *
 * The two MCP sessions are the point of doing it over HTTP at all. Their
 * session ids are the ones the HTTP transport generated, not ids a test chose,
 * so what they demonstrate is that the review feature re-resolves a binding
 * per request under the identity the transport actually supplied.
 */

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

  if (typeof first !== 'object' || first === null || !('text' in first) || typeof first.text !== 'string') {
    throw new Error('The tool answered with a content block that carries no text.');
  }

  return first.text;
}

interface ReviewPayload {
  outcome: { recordId: string; status: string; findings: Array<{ code: string }> };
  invocation: {
    sessionId: string | null;
    requestId: string;
    recordId: string;
    scope: { kind: string; count?: number };
    boundAt: number;
  };
}

interface InspectionPayload {
  report: { recordId: string; unresolvedPredecessors: string[]; findings: unknown[] };
  observations: Array<{ kind: string }>;
}

function readReview(content: unknown): ReviewPayload {
  return JSON.parse(readText(content));
}

/** One MCP session over HTTP, and the two objects that have to be closed. */
interface HttpMcpSession {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

let api: ApiServer;
let origin: string;
let client: TRPCClient<AppRouter>;

beforeAll(async () => {
  // Port 0: the operating system picks a free one and answers with it, so this
  // test never competes with a development server for a fixed port.
  api = await startApiServer({ port: 0 });
  origin = `http://127.0.0.1:${api.port}`;
  client = createTRPCClient<AppRouter>({ links: [httpLink({ url: `${origin}/trpc` })] });
});

afterAll(async () => {
  await api.close();
});

async function openMcpSession(): Promise<HttpMcpSession> {
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`));
  const mcpClient = new Client({ name: 'collection-review-http-tests', version: '0.0.0' });

  await mcpClient.connect(transport);

  return { client: mcpClient, transport };
}

async function closeMcpSession(session: HttpMcpSession): Promise<void> {
  await session.client.close();
  await session.transport.close();
}

/** The one listed description of `reviews.run` on this session, right now. */
async function describeOnSession(session: HttpMcpSession): Promise<string> {
  const listed = await session.client.listTools();
  const tool = listed.tools.find((candidate) => candidate.name === 'reviews.run');

  if (!tool?.description) {
    throw new Error('The server listed no description for reviews.run.');
  }

  return tool.description;
}

describe('the tRPC mount over HTTP', () => {
  it('answers both procedures through a typed client', async () => {
    await expect(client.catalog.get.query({ recordId: 'rec-valid' })).resolves.toEqual({
      recordId: 'rec-valid',
      title: 'Intact revision history',
      revisionCount: 2,
      latestRevisionId: 'rev-2',
    });

    const outcome = await client.reviews.run.mutate({ recordId: 'rec-broken' });

    expect(outcome.status).toBe('failed');
    expect(outcome.findings.map((finding) => finding.code)).toEqual(['missing-predecessor']);
  });

  it('reports an unknown record as not found across the wire', async () => {
    await expect(client.catalog.get.query({ recordId: 'rec-missing' })).rejects.toThrow(
      /rec-missing/,
    );
  });
});

describe('the MCP mount over HTTP', () => {
  it('keeps two transport-identified sessions on their own bindings', async () => {
    const first = await openMcpSession();
    const second = await openMcpSession();

    try {
      // The transport generated each session id during initialization, and
      // they are distinct.
      expect(first.transport.sessionId).toBeTypeOf('string');
      expect(second.transport.sessionId).toBeTypeOf('string');
      expect(first.transport.sessionId).not.toBe(second.transport.sessionId);

      // Both sessions start unbound, so both listings describe the default.
      expect(await describeOnSession(first)).toContain('every recorded revision');
      expect(await describeOnSession(second)).toContain('every recorded revision');

      // One scope argument each, in order, so each session's binding is its
      // own and the binding counter says which came first.
      const boundFirst = await first.client.callTool({
        name: 'reviews.run',
        arguments: { recordId: 'rec-valid', scope: { kind: 'latest', count: 1 } },
      });
      const boundSecond = await second.client.callTool({
        name: 'reviews.run',
        arguments: { recordId: 'rec-valid', scope: { kind: 'all' } },
      });

      expect(readReview(boundFirst.content).invocation).toMatchObject({
        sessionId: first.transport.sessionId,
        scope: { kind: 'latest', count: 1 },
        boundAt: 1,
      });
      expect(readReview(boundSecond.content).invocation).toMatchObject({
        sessionId: second.transport.sessionId,
        scope: { kind: 'all' },
        boundAt: 2,
      });

      // A listing is resolved again per request, so each session now reads its
      // own binding out of the description the server sent it.
      expect(await describeOnSession(first)).toContain('the latest 1 revision(s)');
      expect(await describeOnSession(second)).toContain('every recorded revision');

      // And a later call carrying no scope of its own runs under that binding.
      const laterFirst = await first.client.callTool({
        name: 'reviews.run',
        arguments: { recordId: 'rec-valid' },
      });
      const laterSecond = await second.client.callTool({
        name: 'reviews.run',
        arguments: { recordId: 'rec-valid' },
      });
      const payloadFirst = readReview(laterFirst.content);
      const payloadSecond = readReview(laterSecond.content);

      expect(payloadFirst.invocation).toMatchObject({
        sessionId: first.transport.sessionId,
        scope: { kind: 'latest', count: 1 },
        boundAt: 1,
      });
      expect(payloadSecond.invocation).toMatchObject({
        sessionId: second.transport.sessionId,
        scope: { kind: 'all' },
        boundAt: 2,
      });

      // The scope each session bound is what its review actually covered: the
      // latest revision alone still follows a revision outside that scope.
      expect(payloadFirst.outcome.status).toBe('failed');
      expect(payloadSecond.outcome.status).toBe('passed');
    } finally {
      await closeMcpSession(second);
      await closeMcpSession(first);
    }
  });

  it('lists the tools both features contributed and calls the catalog one', async () => {
    const session = await openMcpSession();

    try {
      const listed = await session.client.listTools();

      expect(listed.tools.map((tool) => tool.name)).toEqual(['catalog.inspect', 'reviews.run']);

      const inspected = await session.client.callTool({
        name: 'catalog.inspect',
        arguments: { recordId: 'rec-broken' },
      });

      const payload: InspectionPayload = JSON.parse(readText(inspected.content));

      expect(inspected.isError).toBeFalsy();
      expect(payload.report.recordId).toBe('rec-broken');
      expect(payload.report.unresolvedPredecessors).toEqual(['rev-0']);
      expect(payload.observations.map((observation) => observation.kind)).toEqual([
        'inspection-started',
        'inspection-finished',
      ]);
    } finally {
      await closeMcpSession(session);
    }
  });
});
