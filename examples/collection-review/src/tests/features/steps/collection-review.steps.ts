import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

// Case K05's second setup path. Cucumber has already loaded this file through
// the `import` glob in `cucumber.js`; naming it here is a symbol-free
// side-effect import of the same module, which Node resolves to the URL it has
// already evaluated. The hooks are therefore registered once, and the last
// step of the scenario is what checks that.
import '../support/hooks.js';
import { beforeAllRuns, initializationLoads } from '../support/initialization.js';
import type { CollectionReviewWorld } from '../support/world.js';
import type { McpSession } from '../../setup.js';

/**
 * The steps of the one scenario this package runs through Cucumber.
 *
 * Everything below speaks to the assembled system through its real clients:
 * the typed tRPC client for the first half, one MCP session for the second.
 * The last step is the case the fixture exists for — the shared hook
 * initialization, having been reached through two setup paths, ran once.
 */

/**
 * The records the catalog holds. There is no list procedure on purpose: this
 * application is two fixed records, so reading the catalog means reading both,
 * exactly as the browser shell does.
 */
const catalogRecordIds = ['rec-valid', 'rec-broken'] as const;

/** What `reviews.run` answers over MCP, as this feature reads it. */
interface ReviewPayload {
  outcome: {
    recordId: string;
    status: string;
    findings: Array<{ code: string; message: string; revisionId: string | null }>;
  };
  invocation: {
    sessionId: string | null;
    requestId: string;
    recordId: string;
    scope: { kind: string; count?: number };
    boundAt: number;
  };
}

/**
 * The SDK types a tool result as either the current shape or the legacy one,
 * so `content` arrives as `unknown`. This narrows it rather than asserting it,
 * which keeps the protocol's own type honest.
 */
function readPayload(content: unknown): ReviewPayload {
  if (!Array.isArray(content) || content.length !== 1) {
    throw new Error('The tool answered with something other than one content block.');
  }

  const first: unknown = content[0];

  if (
    typeof first !== 'object' ||
    first === null ||
    !('text' in first) ||
    typeof first.text !== 'string'
  ) {
    throw new Error('The tool answered with a content block that carries no text.');
  }

  return JSON.parse(first.text);
}

/** The one listed description of `reviews.run` on this session, right now. */
async function describeOnSession(session: McpSession): Promise<string> {
  const listed = await session.client.listTools();
  const tool = listed.tools.find((candidate) => candidate.name === 'reviews.run');

  if (!tool?.description) {
    throw new Error('The server listed no description for reviews.run.');
  }

  return tool.description;
}

Given('the configured collection-review system', function (this: CollectionReviewWorld) {
  this.configure();
});

When('I read the catalog through the typed client', async function (this: CollectionReviewWorld) {
  const client = this.system.client;

  this.recordSummaries(
    await Promise.all(catalogRecordIds.map((recordId) => client.catalog.get.query({ recordId }))),
  );
});

Then(
  'it lists {string} and {string}',
  function (this: CollectionReviewWorld, first: string, second: string) {
    assert.deepEqual(
      this.summaries.map((summary) => summary.title),
      [first, second],
    );
  },
);

When(
  'I review {string} through the typed client',
  async function (this: CollectionReviewWorld, recordId: string) {
    this.recordReview(await this.system.client.reviews.run.mutate({ recordId }));
  },
);

Then(
  'the review fails with the finding {string} on revision {string}',
  function (this: CollectionReviewWorld, code: string, revisionId: string) {
    const review = this.review;

    assert.equal(review.status, 'failed');
    assert.deepEqual(
      review.findings.map((finding) => finding.code),
      [code],
    );
    assert.deepEqual(
      review.findings.map((finding) => finding.revisionId),
      [revisionId],
    );
  },
);

Then('the review passes with no findings', function (this: CollectionReviewWorld) {
  assert.equal(this.review.status, 'passed');
  assert.deepEqual(this.review.findings, []);
});

When(
  'I open an MCP session and bind it to the latest {int} revision by reviewing {string}',
  async function (this: CollectionReviewWorld, count: number, recordId: string) {
    const session = await this.openMcpSession('feature-session');

    // The scope argument is what binds the session; the call it travels with
    // already runs under the new binding.
    const called = await session.client.callTool({
      name: 'reviews.run',
      arguments: { recordId, scope: { kind: 'latest', count } },
    });
    const payload = readPayload(called.content);

    assert.ok(called.isError !== true, 'The binding call answered with an error result.');
    assert.deepEqual(payload.invocation.scope, { kind: 'latest', count });

    this.recordBinding(payload.invocation.scope);
  },
);

Then(
  "that session's tool listing describes the latest {int} revision",
  async function (this: CollectionReviewWorld, count: number) {
    // The listing resolves the binding again, so this description is the one
    // the binding above produced rather than the default the session started
    // with.
    const description = await describeOnSession(this.mcpSession);

    assert.ok(
      description.includes(`the latest ${count} revision`),
      `The listing describes something else: ${description}`,
    );
  },
);

Then(
  "the session's review of {string} fails under that binding",
  async function (this: CollectionReviewWorld, recordId: string) {
    // No scope of its own: this call runs under whatever the session is bound
    // to, which is what makes the outcome differ from the same record's review
    // through the typed client.
    const called = await this.mcpSession.client.callTool({
      name: 'reviews.run',
      arguments: { recordId },
    });
    const payload = readPayload(called.content);

    assert.ok(called.isError !== true, 'The review answered with an error result.');
    assert.equal(payload.invocation.sessionId, 'feature-session');
    assert.deepEqual(payload.invocation.scope, this.binding);
    assert.equal(payload.outcome.status, 'failed');
    assert.deepEqual(
      payload.outcome.findings.map((finding) => finding.code),
      ['missing-predecessor'],
    );
  },
);

Then('the shared hook initialization ran exactly once', function () {
  // Two setup paths named the hook module in this runtime: the runner's
  // `import` glob and the side-effect import at the top of this file. Had they
  // resolved to two modules, the shared initialization would have been
  // evaluated twice and the run-level hook registered twice.
  assert.equal(
    initializationLoads(),
    1,
    'The shared initialization was evaluated more than once in this runtime.',
  );
  assert.equal(
    beforeAllRuns(),
    1,
    'The run-level hook executed more than once in this runtime.',
  );
});
