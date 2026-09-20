import { describe, expect, it } from 'vitest';

import { summarizeTaskResult } from '../result.js';
import type { InspectionTaskResult } from '../inspection-task.js';
import type { InspectionReport } from '../../../../../../../contracts/src/interfaces/vocabulary.js';

const soundReport: InspectionReport = {
  recordId: 'rec-valid',
  chain: [
    { id: 'rev-1', predecessor: null },
    { id: 'rev-2', predecessor: 'rev-1' },
  ],
  resolvedPredecessors: ['rev-1'],
  unresolvedPredecessors: [],
  findings: [],
};

function taskResult(overrides: Partial<InspectionTaskResult>): InspectionTaskResult {
  return {
    recordId: 'rec-valid',
    report: soundReport,
    findings: [],
    observations: [],
    ...overrides,
  };
}

describe('summarizeTaskResult', () => {
  it('passes a run that produced a report and drew no findings', () => {
    const summary = summarizeTaskResult(
      taskResult({ observations: [{ kind: 'inspection-finished', message: 'done' }] }),
    );

    expect(summary).toEqual({
      recordId: 'rec-valid',
      status: 'passed',
      findings: [],
      observations: [{ kind: 'inspection-finished', message: 'done' }],
    });
  });

  it('fails a run that drew findings, and keeps them', () => {
    const findings = [
      { code: 'missing-predecessor', message: 'rev-0 is missing.', revisionId: 'rev-2' },
    ];

    const summary = summarizeTaskResult(taskResult({ recordId: 'rec-broken', findings }));

    expect(summary.status).toBe('failed');
    expect(summary.findings).toEqual(findings);
  });

  it('fails a run that produced no report at all', () => {
    // Nothing was examined, so nothing can be called sound. What an absent
    // report means for a caller is the caller's decision.
    expect(summarizeTaskResult(taskResult({ report: null })).status).toBe('failed');
  });
});
