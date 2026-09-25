import { describe, expect, test } from 'vitest';
import type { CheckFindingEntry } from '../../subs/check-findings/src/interfaces/check-findings.js';
import { currentDeviationDecision } from '../deviations/readiness-decision.js';

const source = { kind: 'document' as const, id: 'plans/example/plan.md@revision-a' };
const request = {
  id: 'cfd-0001', considered: 1, actor: { kind: 'harness', reason: 'person decides' }, source,
  rationale: 'Ask the person', evidence: [], communication: { mode: 'quiet' },
  decision: { action: 'request-user-decision', authority: { kind: 'governing-record', ref: 'deviations/pd-001.json' },
    conflicts: [{ text: 'Preserve the limit', document: 'plans/example/plan.md', revision: 'revision-a' }],
    options: [{ id: 'accept', summary: 'Accept', consequence: 'It stands' },
      { id: 'reject', summary: 'Reject', consequence: 'Follow up' }] },
};
const user = { kind: 'user', name: 'Reviewer' } as const;
const evidence = [{ kind: 'user-command', ref: 'command-1', hash: null }];
const accepted = {
  id: 'cfd-0002', considered: 2, actor: user, source, rationale: 'Accepted for this candidate',
  evidence, communication: { mode: 'quiet' },
  decision: { action: 'waive', authority: { kind: 'user-decision', ref: 'command-1' }, acceptedRisk: 'high', uncertainty: 'Accepted risk' },
};
const rejected = {
  id: 'cfd-0002', considered: 2, actor: user, source, rationale: 'A follow-up must preserve the limit',
  evidence, communication: { mode: 'quiet' },
  decision: { action: 'answer-user-decision', request: 'cfd-0001', option: 'reject' },
};

function entry(decision: typeof accepted | typeof rejected, changes: Record<string, unknown> = {}): CheckFindingEntry {
  return {
    id: 'cf-0001', revision: 3, owner: { kind: 'run' }, standing: decision === accepted ? 'closed' : 'open',
    reason: decision === accepted ? 'waived' : 'user-decision-answered', settledBy: decision === accepted ? decision.id : null,
    pendingUserDecision: null, reports: [{ source, observation: { kind: 'plan-deviation' } }],
    decisions: [request, decision], ...changes,
  } as unknown as CheckFindingEntry;
}

describe('currentDeviationDecision', () => {
  test('returns current user acceptance and its command and source identity', () => {
    expect(currentDeviationDecision(entry(accepted))).toEqual({ standing: 'accepted', revision: 3,
      decisionId: 'cfd-0002', command: 'command-1', source, followUp: null });
  });

  test('keeps only a current rejected answer as a follow-up requirement', () => {
    expect(currentDeviationDecision(entry(rejected))).toEqual({ standing: 'rejected', revision: 3,
      decisionId: 'cfd-0002', command: 'command-1', source, followUp: rejected.rationale });
    expect(currentDeviationDecision(entry(rejected, { revision: 4 }))).toBeNull();
    expect(currentDeviationDecision(entry(rejected, { reason: 'reopened' }))).toBeNull();
  });

  test('revocation, a later report and a different source make historical waiver unavailable', () => {
    expect(currentDeviationDecision(entry(accepted, { revision: 4, standing: 'open', reason: 'waiver-revoked', settledBy: null }))).toBeNull();
    expect(currentDeviationDecision(entry(accepted, { revision: 4 }))).toBeNull();
    expect(currentDeviationDecision(entry(accepted, { reports: [{ source: { ...source, id: 'other' }, observation: { kind: 'plan-deviation' } }] }))).toBeNull();
  });

  test('an agent closure, wrong owner, or decision without user command is not acceptance', () => {
    expect(currentDeviationDecision(entry(accepted, { owner: { kind: 'work-item', workItem: 'wi-001' } }))).toBeNull();
    expect(currentDeviationDecision(entry(accepted, { decisions: [request, { ...accepted, actor: { kind: 'agent', role: 'global-architect', invocation: 'inv-001' } }] }))).toBeNull();
    expect(currentDeviationDecision(entry(accepted, { decisions: [request, { ...accepted, evidence: [] }] }))).toBeNull();
    expect(currentDeviationDecision(entry(accepted, { reports: [{ source, observation: { kind: 'review-concern' } }] }))).toBeNull();
  });
});
