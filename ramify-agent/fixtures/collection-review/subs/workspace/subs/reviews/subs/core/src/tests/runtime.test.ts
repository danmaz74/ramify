import { describe, expect, it } from 'vitest';

import { createReviewRuntime } from '../runtime.js';
import { makeCatalogFixture } from '../../../../../catalog/subs/core/src/tests/fixture.js';
import type { InspectionPort } from '../interfaces/port.js';

/**
 * The runtime, its controller and its task, run together over the catalog's
 * own test data.
 *
 * This is the parent-owned integration test: nothing below is substituted.
 * The controller's tick, the task and the validator are the real ones, and the
 * only thing built here is the port, whose data comes from the fixture the
 * catalog exposes to other owners' tests. Ordinary source anywhere in this
 * tree could not import that fixture; this area can, because its profile
 * carries `testing`.
 */

function createFixturePort(): InspectionPort {
  const records = makeCatalogFixture();

  return {
    inspect(recordId, scope, observe) {
      const record = records.find((candidate) => candidate.recordId === recordId);

      if (!record) {
        return undefined;
      }

      const chain =
        scope.kind === 'all'
          ? record.chain
          : record.chain.slice(Math.max(record.chain.length - scope.count, 0));

      observe({ kind: 'inspection-started', message: `${chain.length} revision(s)`, recordId });

      const known = new Set(chain.map((revision) => revision.id));
      const resolvedPredecessors: string[] = [];
      const unresolvedPredecessors: string[] = [];

      for (const revision of chain) {
        const predecessor = revision.predecessor;

        if (predecessor === null) {
          continue;
        }

        if (known.has(predecessor)) {
          resolvedPredecessors.push(predecessor);
        } else {
          unresolvedPredecessors.push(predecessor);
        }
      }

      observe({
        kind: 'inspection-finished',
        message: `${unresolvedPredecessors.length} unresolved predecessor reference(s)`,
        recordId,
      });

      return { recordId, chain, resolvedPredecessors, unresolvedPredecessors, findings: [] };
    },
  };
}

describe('createReviewRuntime', () => {
  it('fails the record whose chain names a predecessor it does not contain', () => {
    const outcome = createReviewRuntime(createFixturePort()).run('rec-broken', { kind: 'all' });

    expect(outcome).toEqual({
      recordId: 'rec-broken',
      status: 'failed',
      findings: [
        {
          code: 'missing-predecessor',
          message: 'Revision rev-2 follows rev-0, which is not a revision of the inspected chain.',
          revisionId: 'rev-2',
        },
      ],
      observations: [
        { kind: 'inspection-started', message: '2 revision(s)', recordId: 'rec-broken' },
        {
          kind: 'inspection-finished',
          message: '1 unresolved predecessor reference(s)',
          recordId: 'rec-broken',
        },
      ],
    });
  });

  it('passes the record with an intact history', () => {
    const outcome = createReviewRuntime(createFixturePort()).run('rec-valid', { kind: 'all' });

    expect(outcome?.status).toBe('passed');
    expect(outcome?.findings).toEqual([]);
    expect(outcome?.observations).toHaveLength(2);
  });

  it('reviews only the scope it was given', () => {
    // The latest revision alone still names `rev-1` as its predecessor, and
    // `rev-1` is not part of what was inspected.
    const outcome = createReviewRuntime(createFixturePort()).run('rec-valid', {
      kind: 'latest',
      count: 1,
    });

    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings.map((finding) => finding.revisionId)).toEqual(['rev-2']);
  });

  it('answers with no outcome for a record the port does not know', () => {
    expect(createReviewRuntime(createFixturePort()).run('rec-missing', { kind: 'all' })).toBeUndefined();
  });
});
