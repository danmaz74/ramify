import { describe, expect, it } from 'vitest';

import { createSessionTable } from '../session.js';
import { createTestSystem } from '../../../../../../src/tests/setup.js';

/**
 * The session wrapper, over real MCP sessions.
 *
 * Every assertion below is about freshness: that a listing and a call each
 * resolve the binding again, that a binding changed between two requests is
 * seen by both operations afterwards, and that two sessions opened on the same
 * assembled system never read each other's binding. The invocation snapshot in
 * each result is what makes those facts observable.
 */

interface ReviewPayload {
  outcome: {
    recordId: string;
    status: string;
    findings: Array<{ code: string; message: string; revisionId: string | null }>;
    observations: Array<{ kind: string; message: string; recordId?: string }>;
  };
  invocation: {
    sessionId: string | null;
    requestId: string;
    recordId: string;
    scope: { kind: string; count?: number };
    boundAt: number;
  };
}

function readPayload(content: unknown): ReviewPayload {
  if (!Array.isArray(content) || content.length !== 1) {
    throw new Error('The tool answered with something other than one content block.');
  }

  const first: unknown = content[0];

  if (typeof first !== 'object' || first === null || !('text' in first) || typeof first.text !== 'string') {
    throw new Error('The tool answered with a content block that carries no text.');
  }

  return JSON.parse(first.text);
}

/**
 * One session's MCP client, as the root's testing setup hands it out. The
 * setup keeps its own result types private, so the type is read off the
 * exposed factory rather than imported.
 */
type McpClient = Awaited<
  ReturnType<ReturnType<typeof createTestSystem>['connectMcpSession']>
>['client'];

/** The one listed descriptor of `reviews.run` on this session, right now. */
async function describeOnSession(client: McpClient): Promise<string> {
  const listed = await client.listTools();
  const tool = listed.tools.find((candidate) => candidate.name === 'reviews.run');

  if (!tool?.description) {
    throw new Error('The server listed no description for reviews.run.');
  }

  return tool.description;
}

describe('reviews.run on one MCP session', () => {
  it('lists itself and answers a call under the default binding', async () => {
    const { connectMcpSession } = createTestSystem();
    const session = await connectMcpSession('reviews-one');

    try {
      const listed = await session.client.listTools();
      const tool = listed.tools.find((candidate) => candidate.name === 'reviews.run');

      expect(tool?.description).toContain('every recorded revision');
      expect(tool?.inputSchema.required).toEqual(['recordId']);
      expect(Object.keys(tool?.inputSchema.properties ?? {})).toEqual(['recordId', 'scope']);

      const called = await session.client.callTool({
        name: 'reviews.run',
        arguments: { recordId: 'rec-broken' },
      });
      const payload = readPayload(called.content);

      expect(called.isError).toBeFalsy();
      expect(payload.outcome.status).toBe('failed');
      expect(payload.outcome.findings.map((finding) => finding.code)).toEqual([
        'missing-predecessor',
      ]);
      // An unbound session reviews the whole chain, and no binding operation
      // produced that default.
      expect(payload.invocation).toMatchObject({
        sessionId: 'reviews-one',
        recordId: 'rec-broken',
        scope: { kind: 'all' },
        boundAt: 0,
      });
      expect(payload.invocation.requestId).not.toBe('');
    } finally {
      await session.close();
    }
  });

  it('answers an unknown record with an error result rather than a failed review', async () => {
    const { connectMcpSession } = createTestSystem();
    const session = await connectMcpSession('reviews-unknown');

    try {
      const called = await session.client.callTool({
        name: 'reviews.run',
        arguments: { recordId: 'rec-missing' },
      });

      expect(called.isError).toBe(true);
    } finally {
      await session.close();
    }
  });
});

describe('a binding changed between two requests', () => {
  it('is seen by the next listing and by the next call', async () => {
    const { connectMcpSession } = createTestSystem();
    const session = await connectMcpSession('reviews-rebinding');

    try {
      expect(await describeOnSession(session.client)).toContain('every recorded revision');

      // The call that carries a scope binds the session first, so its own
      // snapshot already reads under the new binding.
      const binding = await session.client.callTool({
        name: 'reviews.run',
        arguments: { recordId: 'rec-valid', scope: { kind: 'latest', count: 1 } },
      });

      expect(readPayload(binding.content).invocation).toMatchObject({
        scope: { kind: 'latest', count: 1 },
        boundAt: 1,
      });

      // The listing is resolved again, so it now describes the new binding.
      expect(await describeOnSession(session.client)).toContain('the latest 1 revision(s)');

      // And a later call with no scope of its own runs under it.
      const later = await session.client.callTool({
        name: 'reviews.run',
        arguments: { recordId: 'rec-valid' },
      });
      const payload = readPayload(later.content);

      expect(payload.invocation).toMatchObject({
        scope: { kind: 'latest', count: 1 },
        boundAt: 1,
      });
      expect(payload.outcome.status).toBe('failed');
      expect(payload.outcome.findings.map((finding) => finding.revisionId)).toEqual(['rev-2']);

      // The two calls are two requests of one session, and each snapshot
      // records its own.
      expect(payload.invocation.requestId).not.toBe(
        readPayload(binding.content).invocation.requestId,
      );
    } finally {
      await session.close();
    }
  });
});

describe('two sessions of one assembled system', () => {
  it('each list and call under their own binding, with their requests interleaved', async () => {
    const { connectMcpSession } = createTestSystem();
    const first = await connectMcpSession('a');
    const second = await connectMcpSession('b');

    try {
      // Session `a` binds to one revision; session `b` binds to the whole
      // chain. Both bindings live in the one table behind the contributions.
      const boundA = await first.client.callTool({
        name: 'reviews.run',
        arguments: { recordId: 'rec-valid', scope: { kind: 'latest', count: 1 } },
      });
      const boundB = await second.client.callTool({
        name: 'reviews.run',
        arguments: { recordId: 'rec-valid', scope: { kind: 'all' } },
      });

      expect(readPayload(boundA.content).invocation).toMatchObject({
        sessionId: 'a',
        scope: { kind: 'latest', count: 1 },
        boundAt: 1,
      });
      expect(readPayload(boundB.content).invocation).toMatchObject({
        sessionId: 'b',
        scope: { kind: 'all' },
        boundAt: 2,
      });

      expect(await describeOnSession(first.client)).toContain('the latest 1 revision(s)');
      expect(await describeOnSession(second.client)).toContain('every recorded revision');

      const [laterA, laterB] = await Promise.all([
        first.client.callTool({ name: 'reviews.run', arguments: { recordId: 'rec-valid' } }),
        second.client.callTool({ name: 'reviews.run', arguments: { recordId: 'rec-valid' } }),
      ]);
      const payloadA = readPayload(laterA.content);
      const payloadB = readPayload(laterB.content);

      expect(payloadA.invocation).toMatchObject({ sessionId: 'a', scope: { kind: 'latest', count: 1 }, boundAt: 1 });
      expect(payloadB.invocation).toMatchObject({ sessionId: 'b', scope: { kind: 'all' }, boundAt: 2 });
      expect(payloadA.outcome.status).toBe('failed');
      expect(payloadB.outcome.status).toBe('passed');

      // Request ids are counted by each connection, so two sessions can well
      // be serving the same one. The session id is what tells them apart, and
      // it is what the binding was resolved under.
      expect([payloadA.invocation.sessionId, payloadB.invocation.sessionId]).toEqual(['a', 'b']);

      // And the listings still hold after the interleaved calls.
      expect(await describeOnSession(second.client)).toContain('every recorded revision');
      expect(await describeOnSession(first.client)).toContain('the latest 1 revision(s)');
    } finally {
      await second.close();
      await first.close();
    }
  });
});

describe('createSessionTable', () => {
  // The table is this owner's own source, so its tests reach it directly
  // rather than through a tool call.
  it('answers the default binding for a session nothing has bound', () => {
    const table = createSessionTable();

    expect(table.resolveBinding('never-bound')).toEqual({ scope: { kind: 'all' }, boundAt: 0 });
    expect(table.resolveBinding(null)).toEqual({ scope: { kind: 'all' }, boundAt: 0 });
  });

  it('numbers its bindings in the order they were made', () => {
    const table = createSessionTable();

    expect(table.bind('a', { scope: { kind: 'latest', count: 2 } })).toEqual({
      scope: { kind: 'latest', count: 2 },
      boundAt: 1,
    });
    expect(table.bind('b', { scope: { kind: 'all' } }).boundAt).toBe(2);
    expect(table.bind('a', { scope: { kind: 'all' } }).boundAt).toBe(3);

    expect(table.resolveBinding('a')).toEqual({ scope: { kind: 'all' }, boundAt: 3 });
    expect(table.resolveBinding('b')).toEqual({ scope: { kind: 'all' }, boundAt: 2 });
  });

  it('keeps its own copy of the scope it was given', () => {
    const table = createSessionTable();
    const scope = { kind: 'latest' as const, count: 2 };

    table.bind('a', { scope });
    scope.count = 9;

    expect(table.resolveBinding('a').scope).toEqual({ kind: 'latest', count: 2 });
  });

  it('gives each table its own bindings', () => {
    const first = createSessionTable();
    const second = createSessionTable();

    first.bind('a', { scope: { kind: 'latest', count: 1 } });

    expect(second.resolveBinding('a').boundAt).toBe(0);
  });
});
