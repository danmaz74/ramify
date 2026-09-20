import { describe, expect, it } from 'vitest';

import { createTestSystem } from '../../../../../../src/tests/setup.js';

/**
 * `reviews.run` through a real typed client over the assembled router.
 *
 * The port behind it is the one the root wired in, so these are the answers
 * the listener gives. Nothing here builds a runtime or a validator: what the
 * feature publishes is what is exercised.
 */

describe('reviews.run', () => {
  it('fails the record whose chain names a predecessor it does not contain', async () => {
    const { client } = createTestSystem();

    const outcome = await client.reviews.run.mutate({ recordId: 'rec-broken' });

    expect(outcome.status).toBe('failed');
    expect(outcome.findings).toEqual([
      {
        code: 'missing-predecessor',
        message: 'Revision rev-2 follows rev-0, which is not a revision of the inspected chain.',
        revisionId: 'rev-2',
      },
    ]);
    expect(outcome.observations.map((observation) => observation.kind)).toEqual([
      'inspection-started',
      'inspection-finished',
    ]);
  });

  it('passes the record with an intact history', async () => {
    const { client } = createTestSystem();

    await expect(client.reviews.run.mutate({ recordId: 'rec-valid' })).resolves.toMatchObject({
      recordId: 'rec-valid',
      status: 'passed',
      findings: [],
    });
  });

  it('reviews only the scope the caller asked for', async () => {
    const { client } = createTestSystem();

    // The latest revision alone still follows `rev-1`, which is outside what
    // was inspected.
    const outcome = await client.reviews.run.mutate({
      recordId: 'rec-valid',
      scope: { kind: 'latest', count: 1 },
    });

    expect(outcome.status).toBe('failed');
    expect(outcome.findings.map((finding) => finding.revisionId)).toEqual(['rev-2']);
  });

  it('reports an unknown record as not found', async () => {
    const { client } = createTestSystem();

    await expect(client.reviews.run.mutate({ recordId: 'rec-missing' })).rejects.toThrow(
      /No record is recorded under the id rec-missing/,
    );
  });

  it('rejects an argument the contracts schema does not accept', async () => {
    const { client } = createTestSystem();

    await expect(client.reviews.run.mutate({ recordId: '' })).rejects.toThrow();
  });
});
