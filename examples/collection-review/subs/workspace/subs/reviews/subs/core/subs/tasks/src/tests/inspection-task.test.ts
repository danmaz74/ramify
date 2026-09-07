import { describe, expect, it } from 'vitest';

import { collectObservations, runInspectionTask } from '../inspection-task.js';
import type { InspectionPort } from '../../../../src/interfaces/port.js';
import type {
  Finding,
  InspectionReport,
} from '../../../../../../../contracts/src/interfaces/vocabulary.js';

/**
 * The task against a hand-built port. The port is the whole point of the
 * contract: this owner never learns what is behind it, so a test can put
 * anything there.
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

const oneFinding: Finding[] = [
  { code: 'missing-predecessor', message: 'rev-0 is not a revision of the chain.', revisionId: 'rev-2' },
];

/** A port that answers with one fixed report and reports two observations. */
function portFor(report: InspectionReport | undefined): InspectionPort {
  return {
    inspect(recordId, scope, observe) {
      observe({ kind: 'inspection-started', message: `scope ${scope.kind}`, recordId });

      if (!report) {
        return undefined;
      }

      observe({ kind: 'inspection-finished', message: 'done', recordId });
      return report;
    },
  };
}

describe('runInspectionTask', () => {
  it('validates the report the port produced and keeps its observations', () => {
    const result = runInspectionTask({
      recordId: 'rec-broken',
      scope: { kind: 'all' },
      port: portFor(brokenReport),
      validate: (report) => (report.unresolvedPredecessors.length > 0 ? oneFinding : []),
    });

    expect(result.recordId).toBe('rec-broken');
    expect(result.report).toEqual(brokenReport);
    expect(result.findings).toEqual(oneFinding);
    expect(result.observations.map((observation) => observation.kind)).toEqual([
      'inspection-started',
      'inspection-finished',
    ]);
  });

  it('passes the scope it was given straight to the port', () => {
    const result = runInspectionTask({
      recordId: 'rec-valid',
      scope: { kind: 'latest', count: 1 },
      port: portFor(brokenReport),
      validate: () => [],
    });

    expect(result.observations[0]?.message).toBe('scope latest');
    expect(result.findings).toEqual([]);
  });

  it('draws no findings when the port knew no such record, but keeps what it observed', () => {
    let validatorCalls = 0;

    const result = runInspectionTask({
      recordId: 'rec-missing',
      scope: { kind: 'all' },
      port: portFor(undefined),
      validate: () => {
        validatorCalls += 1;
        return oneFinding;
      },
    });

    expect(result.report).toBeNull();
    expect(result.findings).toEqual([]);
    expect(validatorCalls).toBe(0);
    expect(result.observations).toHaveLength(1);
  });
});

describe('collectObservations', () => {
  // The collector is exported for this owner's own files and tests. No
  // description exposes it, so no other module can read it.
  it('hands out a sink and the callback that fills it, in order', () => {
    const collector = collectObservations();

    expect(collector.observations).toEqual([]);

    collector.observe({ kind: 'first', message: 'one' });
    collector.observe({ kind: 'second', message: 'two', recordId: 'rec-valid' });

    expect(collector.observations).toEqual([
      { kind: 'first', message: 'one' },
      { kind: 'second', message: 'two', recordId: 'rec-valid' },
    ]);
  });

  it('gives each caller its own sink', () => {
    const first = collectObservations();
    const second = collectObservations();

    first.observe({ kind: 'first', message: 'one' });

    expect(second.observations).toEqual([]);
  });
});
