import { describe, expect, it } from 'vitest';
import type { CheckFindingCommand, CheckFindingState } from '../interfaces/check-findings.js';
import { decideCheckFindingChange } from '../decide.js';
import { selectCheckFindings } from '../queries.js';
import {
  commit, commitAll, concern, decision, deviation, deviationRequest, dispose, environmentProblem, report, workItem,
} from './fixtures/builders.js';

/*
 * A plan deviation: the run's own CheckFinding, recorded when the global
 * architect decides the run does something other than a requirement states.
 * It awaits the person's decision, is accepted by their waiver, rejected by
 * their answer, and comes first in the attention order.
 */

function refusal(state: CheckFindingState, command: CheckFindingCommand): string | null {
  const decided = decideCheckFindingChange(state, command);
  return decided.ok ? null : decided.rejection.code;
}

const user = { kind: 'user', name: 'Dan' } as const;
const waive = decision(
  { action: 'waive', authority: { kind: 'user-decision', ref: 'cmd-1' }, acceptedRisk: 'high', uncertainty: 'accepted as recorded' },
  { actor: user },
);

/** One recorded deviation, awaiting the person's decision. */
function recorded(): CheckFindingState {
  return commitAll([report(deviation({ key: 'pd-001', hash: 1 })), dispose('cf-0001', 1, deviationRequest())]);
}

describe('plan deviations', () => {
  it('is the run\'s, judged, verified by assessment and agent-generated', () => {
    const valid = deviation({ key: 'pd-001', hash: 1 });
    expect(refusal(commitAll([]), report(valid))).toBeNull();
    expect(refusal(commitAll([]), report({ ...valid, owner: workItem('wi-001') }))).toBe('invalid-report');
    expect(refusal(commitAll([]), report({ ...valid, judgment: null }))).toBe('invalid-report');
    expect(refusal(commitAll([]), report({ ...valid, credibility: 'ungrounded' }))).toBe('invalid-report');
  });

  it('awaits the person, and their waiver accepts it and settles the request', () => {
    const state = recorded();
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'open', reason: 'awaiting-user-decision', pendingUserDecision: 'cfd-0001', risk: 'high' });
    const accepted = commit(state, dispose('cf-0001', 2, waive));
    expect(accepted.findings.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'waived', pendingUserDecision: null, settledBy: 'cfd-0002' });
  });

  it('refuses anyone else\'s waiver while it awaits the person', () => {
    const state = recorded();
    expect(refusal(state, dispose('cf-0001', 2, { ...waive, actor: { kind: 'agent', role: 'global-architect', invocation: 'inv-1' } }))).toBe('awaiting-user-decision');
  });

  it('keeps an ordinary signal\'s request pending against a person\'s waiver', () => {
    const state = commitAll([
      report(concern({ attempt: 'rq-0001.a01', key: 'c1', summary: 'A concern', hash: 1 })),
      dispose('cf-0001', 1, deviationRequest()),
    ]);
    expect(refusal(state, dispose('cf-0001', 2, waive))).toBe('awaiting-user-decision');
  });

  it('is rejected by the person\'s answer, which stays open with the answer recorded', () => {
    const answered = commit(recorded(), dispose('cf-0001', 2, decision(
      { action: 'answer-user-decision', request: 'cfd-0001', option: 'reject' },
      { actor: user, rationale: 'The script prints the block in a follow-up run' },
    )));
    expect(answered.findings.get('cf-0001')).toMatchObject({ standing: 'open', reason: 'user-decision-answered', pendingUserDecision: null });
  });

  it('comes before every other signal in the attention order', () => {
    const state = commitAll([
      report(concern({ attempt: 'rq-0001.a01', key: 'c1', summary: 'A high concern', hash: 1, risk: 'high', credibility: 'human-reviewed', ground: { ref: 'plan', hash: `sha256:${'1'.repeat(64)}` } })),
      report(deviation({ key: 'pd-001', hash: 2 })),
    ]);
    const selected = selectCheckFindings(state, { kind: 'list', select: 'all', order: 'attention' });
    if (!selected.ok || selected.view.kind !== 'list') throw new Error('no list');
    expect(selected.view.items.map(item => item.id)).toEqual(['cf-0002', 'cf-0001']);
  });
});

describe('environment problems', () => {
  /** One reported environment problem, awaiting the operator's answer. */
  function reported(): CheckFindingState {
    return commitAll([report(environmentProblem({ key: 'ep-001', hash: 1 })), dispose('cf-0001', 1, deviationRequest())]);
  }

  it('is the run\'s, judged, verified by assessment and agent-generated', () => {
    const valid = environmentProblem({ key: 'ep-001', hash: 1 });
    expect(refusal(commitAll([]), report(valid))).toBeNull();
    expect(refusal(commitAll([]), report({ ...valid, owner: workItem('wi-001') }))).toBe('invalid-report');
    expect(refusal(commitAll([]), report({ ...valid, judgment: null }))).toBe('invalid-report');
    expect(refusal(commitAll([]), report({ ...valid, credibility: 'ungrounded' }))).toBe('invalid-report');
  });

  it('the operator\'s waiver settles its request, and no one else\'s does', () => {
    const state = reported();
    expect(refusal(state, dispose('cf-0001', 2, { ...waive, actor: { kind: 'agent', role: 'global-architect', invocation: 'inv-1' } }))).toBe('awaiting-user-decision');
    const resumed = commit(state, dispose('cf-0001', 2, waive));
    expect(resumed.findings.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'waived', pendingUserDecision: null });
  });

  it('comes before an ordinary signal in the attention order', () => {
    const state = commitAll([
      report(concern({ attempt: 'rq-0001.a01', key: 'c1', summary: 'A high concern', hash: 1, risk: 'high', credibility: 'human-reviewed', ground: { ref: 'plan', hash: `sha256:${'1'.repeat(64)}` } })),
      report(environmentProblem({ key: 'ep-001', hash: 2 })),
    ]);
    const selected = selectCheckFindings(state, { kind: 'list', select: 'all', order: 'attention' });
    if (!selected.ok || selected.view.kind !== 'list') throw new Error('no list');
    expect(selected.view.items.map(item => item.id)).toEqual(['cf-0002', 'cf-0001']);
  });
});
