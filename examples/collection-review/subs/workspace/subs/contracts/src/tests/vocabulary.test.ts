import { describe, expect, it } from 'vitest';

import { inspectionReportSchema } from '../interfaces/vocabulary.js';

describe('inspectionReportSchema', () => {
  it('round-trips a report whose chain names a missing predecessor', () => {
    const report = {
      recordId: 'record-2',
      chain: [
        { id: 'rev-1', predecessor: null },
        { id: 'rev-2', predecessor: 'rev-0' },
      ],
      resolvedPredecessors: [],
      unresolvedPredecessors: ['rev-0'],
      findings: [],
    };

    const parsed = inspectionReportSchema.parse(report);

    expect(parsed).toEqual(report);
  });

  it('rejects a report whose revisions omit their predecessor field', () => {
    const result = inspectionReportSchema.safeParse({
      recordId: 'record-1',
      chain: [{ id: 'rev-1' }],
      resolvedPredecessors: [],
      unresolvedPredecessors: [],
      findings: [],
    });

    expect(result.success).toBe(false);
  });
});
