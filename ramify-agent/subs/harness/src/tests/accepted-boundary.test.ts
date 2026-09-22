import { describe, expect, test } from 'vitest';
import { acceptedCommit, type AcceptedBoundaryLine } from '../checks/accepted.js';
import type { Checkpoint, GateAttempt } from '../checks/records.js';

function line(
  id: string,
  checkpoint: Checkpoint,
  verdict: GateAttempt['verdict'],
  commit: string | null,
  audited: string | null,
): AcceptedBoundaryLine {
  const attempt: GateAttempt = {
    schema: 'ramify-agent.gate-attempt/2', id, checkpoint, subject: {}, proposedBy: null,
    repairRound: 0, infrastructureAttempt: 0, head: 'base', commit, audited, evidence: null,
    guardedChanges: [], commands: [], verdict, cause: verdict === 'passed' ? null : 'infrastructure',
    next: verdict === 'passed' ? 'accept' : 'retry-infrastructure',
  };
  return {
    transaction: {
      event: { type: 'gate-attempted', data: { gate: id, checkpoint, verdict } },
      records: [{ body: attempt }],
    },
  };
}

describe('the accepted source boundary', () => {
  test('it follows passed committing attempts in ledger order, not branch commits', () => {
    const entries = [
      line('ga-0001', 'readiness', 'passed', null, null),
      line('ga-0002', 'iteration', 'passed', 'A', 'A'),
      line('ga-0003', 'iteration', 'failed', 'B', 'B'),
      // An unchanged retry accepts the commit made by the failed attempt.
      line('ga-0004', 'iteration', 'passed', null, 'B'),
      line('ga-0005', 'final', 'failed', 'C', 'C'),
    ];
    expect(acceptedCommit([], 'base')).toBe('base');
    expect(acceptedCommit(entries.slice(0, 3), 'base')).toBe('A');
    expect(acceptedCommit(entries, 'base')).toBe('B');
  });

  test('a passed committing attempt must name what it audited', () => {
    expect(() => acceptedCommit([line('ga-0001', 'iteration', 'passed', null, null)], 'base'))
      .toThrow('Passed committing gate ga-0001 has no audited commit');
  });
});
