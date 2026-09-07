import { describe, expect, it } from 'vitest';

import { tick } from '../controller.js';
import type { InspectionPort } from '../../../../src/interfaces/port.js';
import type { InspectionReport } from '../../../../../../../contracts/src/interfaces/vocabulary.js';

/**
 * The tick, driving the real task over a hand-built port. Nothing is
 * substituted for the task: what this test exercises is the whole of the
 * runtime below the runtime module.
 */

const brokenReport: InspectionReport = {
  recordId: 'rec-broken',
  chain: [
    { id: 'rev-1', predecessor: null },
    { id: 'rev-2', predecessor: 'rev-0' },
  ],
  resolvedPredecessors: [],
  unresolvedPredecessors: ['rev-0'],
  findings: [],
};

function portFor(report: InspectionReport | undefined): InspectionPort {
  return {
    inspect(recordId, _scope, observe) {
      observe({ kind: 'inspection-started', message: 'looking', recordId });
      return report;
    },
  };
}

describe('tick', () => {
  it('fails the review when the validator drew a finding', () => {
    const verdict = tick({
      recordId: 'rec-broken',
      scope: { kind: 'all' },
      port: portFor(brokenReport),
      validate: () => [
        { code: 'missing-predecessor', message: 'rev-0 is missing.', revisionId: 'rev-2' },
      ],
    });

    expect(verdict).toEqual({
      recordId: 'rec-broken',
      status: 'failed',
      findings: [
        { code: 'missing-predecessor', message: 'rev-0 is missing.', revisionId: 'rev-2' },
      ],
      observations: [{ kind: 'inspection-started', message: 'looking', recordId: 'rec-broken' }],
    });
  });

  it('passes the review when the validator drew nothing', () => {
    const verdict = tick({
      recordId: 'rec-broken',
      scope: { kind: 'all' },
      port: portFor(brokenReport),
      validate: () => [],
    });

    expect(verdict?.status).toBe('passed');
    expect(verdict?.findings).toEqual([]);
  });

  it('reports no verdict at all when the task inspected nothing', () => {
    const verdict = tick({
      recordId: 'rec-missing',
      scope: { kind: 'all' },
      port: portFor(undefined),
      validate: () => [],
    });

    expect(verdict).toBeUndefined();
  });
});
