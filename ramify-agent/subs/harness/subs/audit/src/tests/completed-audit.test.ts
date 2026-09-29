import { describe, expect, it } from 'vitest';

import type { AuditResult } from 'ramify-audit';

import { missingExecutedRecords, unexpectedCompletedAudit } from '../check-execution.js';

/*
 * A gate's audit request forces a new audit of the commit the gate made.
 * A completed answer that reused an existing audit, or that audited another
 * commit, is the audit's own failure and never the gate's verdict.
 */

type Completed = Extract<AuditResult, { status: 'completed' }>;

const made = 'a'.repeat(40);
const earlier = 'b'.repeat(40);

function completed(sourceCommit: string, reused?: Completed['reused']): Completed {
  return {
    status: 'completed',
    requestId: 'attempt-1',
    runId: 'run-1',
    summary: { sourceCommit, overall: 'pass' } as unknown as Completed['summary'],
    refs: { reportCommit: 'c'.repeat(40), runRef: 'refs/audited/runs/earlier', treeRef: 'refs/audited/trees/earlier' },
    retrievalCommands: [],
    composition: { verdict: 'pass', scoped: false, chainDepth: 0, reportCommit: 'c'.repeat(40) },
    ...(reused === undefined ? {} : { reused }),
  };
}

describe('a completed audit as a gate\'s answer', () => {
  it('requires records only for checks selected by a partial link', () => {
    const definitions: Parameters<typeof missingExecutedRecords>[0] = ['tests', 'type-check', 'harness-rules'].map(id => ({
      id, name: id, description: id, scope: 'both', category: 'registered',
      executor: { kind: 'registered', executorId: 'fixture' }, onFailure: 'record',
    }));
    const none = new Map();
    expect(missingExecutedRecords(definitions, new Set(), none)).toEqual([]);
    expect(missingExecutedRecords(definitions, new Set(['type-check']), none)).toEqual(['type-check']);
    expect(missingExecutedRecords(definitions, new Set(['harness-rules']), none)).toEqual([]);
  });

  it('accepts an audit that ran over the requested commit', () => {
    expect(unexpectedCompletedAudit(completed(made), made)).toBeNull();
  });

  it('refuses a reused audit, even a passing one of the same commit, naming the audit it reused', () => {
    const answer = unexpectedCompletedAudit(
      completed(made, { sourceCommit: made, auditedCommit: made, ignoredChangedPaths: [], requestedMode: 'full', resolution: 'defaulted' }),
      made,
    );
    expect(answer).toEqual({
      kind: 'audit-reused',
      message: `The audit of ${made} returned the existing audit of ${made} (run refs/audited/runs/earlier)`
        + ' instead of running the gate\'s checks, although the request forced a new audit',
    });
  });

  it('refuses a reused audit of an earlier commit whose later changes were all ignored', () => {
    const answer = unexpectedCompletedAudit(
      completed(earlier, { sourceCommit: made, auditedCommit: earlier, ignoredChangedPaths: ['docs/guide.md'], requestedMode: 'full', resolution: 'defaulted' }),
      made,
    );
    expect(answer?.kind).toBe('audit-reused');
    expect(answer?.message).toContain(`existing audit of ${earlier}`);
  });

  it('refuses an audit that recorded another source commit', () => {
    expect(unexpectedCompletedAudit(completed(earlier), made)).toEqual({
      kind: 'audit-result',
      message: `The audit requested for ${made} recorded ${earlier} as its source commit`,
    });
  });
});
