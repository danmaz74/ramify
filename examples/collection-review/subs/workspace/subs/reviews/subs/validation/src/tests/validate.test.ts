import { describe, expect, it } from 'vitest';

import { validateRevisionChain } from '../validate.js';
import type { InspectionReport } from '../../../../../contracts/src/interfaces/vocabulary.js';

/**
 * The rules, read straight from reports. Nothing here builds a runtime, a port
 * or a client: a report is all the validator ever sees, and a report is all a
 * test needs to state a rule.
 */

function report(overrides: Partial<InspectionReport>): InspectionReport {
  return {
    recordId: 'rec-under-test',
    chain: [],
    resolvedPredecessors: [],
    unresolvedPredecessors: [],
    findings: [],
    ...overrides,
  };
}

describe('validateRevisionChain', () => {
  it('finds nothing in a chain whose predecessors all resolve', () => {
    expect(
      validateRevisionChain(
        report({
          chain: [
            { id: 'rev-1', predecessor: null },
            { id: 'rev-2', predecessor: 'rev-1' },
          ],
          resolvedPredecessors: ['rev-1'],
        }),
      ),
    ).toEqual([]);
  });

  it('finds nothing in an empty chain', () => {
    expect(validateRevisionChain(report({}))).toEqual([]);
  });

  it('reports the revision that follows a predecessor the chain does not contain', () => {
    const findings = validateRevisionChain(
      report({
        recordId: 'rec-broken',
        chain: [
          { id: 'rev-1', predecessor: null },
          { id: 'rev-2', predecessor: 'rev-0' },
        ],
        unresolvedPredecessors: ['rev-0'],
      }),
    );

    expect(findings).toEqual([
      {
        code: 'missing-predecessor',
        message: 'Revision rev-2 follows rev-0, which is not a revision of the inspected chain.',
        revisionId: 'rev-2',
      },
    ]);
  });

  it('reports one finding per revision that references a missing predecessor', () => {
    const findings = validateRevisionChain(
      report({
        chain: [
          { id: 'rev-1', predecessor: 'rev-0' },
          { id: 'rev-2', predecessor: 'rev-0' },
        ],
        unresolvedPredecessors: ['rev-0', 'rev-0'],
      }),
    );

    expect(findings.map((finding) => finding.revisionId)).toEqual(['rev-1', 'rev-2']);
  });

  it('follows the report about a predecessor left outside the inspected scope', () => {
    // A scoped inspection reports the revisions it looked at. `rev-1` may well
    // exist in the record, but it is not part of what was inspected, and the
    // rules judge the report they were given.
    const findings = validateRevisionChain(
      report({
        chain: [{ id: 'rev-2', predecessor: 'rev-1' }],
        unresolvedPredecessors: ['rev-1'],
      }),
    );

    expect(findings.map((finding) => finding.revisionId)).toEqual(['rev-2']);
  });

  it('reports a repeated revision id after the missing predecessors', () => {
    const findings = validateRevisionChain(
      report({
        chain: [
          { id: 'rev-1', predecessor: null },
          { id: 'rev-1', predecessor: 'rev-0' },
        ],
        unresolvedPredecessors: ['rev-0'],
      }),
    );

    expect(findings.map((finding) => finding.code)).toEqual([
      'missing-predecessor',
      'duplicate-revision',
    ]);
    expect(findings[1]).toEqual({
      code: 'duplicate-revision',
      message: 'The chain records more than one revision under the id rev-1.',
      revisionId: 'rev-1',
    });
  });
});
