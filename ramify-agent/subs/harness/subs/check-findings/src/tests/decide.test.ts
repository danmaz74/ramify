import { describe, expect, it } from 'vitest';
import type { CheckFindingCommand, CheckFindingSource, CheckFindingState, CheckFindingWitness } from '../interfaces/check-findings.js';
import { decideCheckFindingChange } from '../decide.js';
import { applyCheckFindingEvent } from '../replay.js';
import {
  commit, commitAll, concern, decision, dispose, failure, report, tree, witness, workItem,
} from './fixtures/builders.js';

const judged = concern({ attempt: 'rq-0001.a01', key: 'c1', summary: 'The discount is applied twice', hash: 1 });
const failed = failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5 });
const authority = { kind: 'work-item-assessment', ref: 'wi-001/assessment-1' } as const;

function refusal(state: CheckFindingState, command: CheckFindingCommand): string | null {
  const decided = decideCheckFindingChange(state, command);
  return decided.ok ? null : decided.rejection.code;
}

/** A factual CheckFinding with its repair claimed on t-04. */
function claimed(): CheckFindingState {
  let state = commitAll([report(failed)]);
  state = commit(state, dispose('cf-0001', 1, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'intent-1' } })));
  return commit(state, dispose('cf-0001', 2, decision({ action: 'claim-repair', candidate: tree('t-04'), change: 'wi-001.i04' })));
}

const verify = (revision: number, overrides: Partial<CheckFindingWitness> & { source: CheckFindingSource }, candidate = tree('t-04')) =>
  dispose('cf-0001', revision, decision(
    { action: 'fix-by-check', candidate, witness: witness(overrides) },
    { actor: { kind: 'harness', reason: 'gate passed' }, source: candidate },
  ));

describe('revisions', () => {
  it('refuses a decision that considered an earlier revision', () => {
    const state = claimed();
    expect(refusal(state, dispose('cf-0001', 2, decision({ action: 'claim-repair', candidate: tree('t-05'), change: 'x' })))).toBe('stale-revision');
  });

  it('refuses a decision about an unknown CheckFinding', () => {
    expect(refusal(claimed(), dispose('cf-0009', 1, decision({ action: 'reopen', cause: { kind: 'decision' } })))).toBe('unknown-check-finding');
  });

  it('refuses to replay an event whose revision does not follow', () => {
    const state = commitAll([report(judged)]);
    const decided = decideCheckFindingChange(state, dispose('cf-0001', 1, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'i' } })));
    if (!decided.ok) throw new Error(decided.rejection.message);
    const [event] = decided.events;
    if (event?.type !== 'check-finding-decided') throw new Error('no decision');
    const skipped = { ...event, data: { ...event.data, revision: 3 } };
    const applied = applyCheckFindingEvent(state, skipped);
    expect(applied.ok ? null : applied.rejection.code).toBe('replay-conflict');
    // Applied twice, the same event no longer follows the revision it advanced.
    const once = applyCheckFindingEvent(state, event);
    if (!once.ok) throw new Error(once.rejection.message);
    const twice = applyCheckFindingEvent(once.state, event);
    expect(twice.ok ? null : twice.rejection.code).toBe('replay-conflict');
  });

  it('refuses to replay a report event whose ID is not the next one', () => {
    const decided = decideCheckFindingChange(commitAll([]), report(judged));
    if (!decided.ok) throw new Error(decided.rejection.message);
    const [event] = decided.events;
    if (event?.type !== 'check-finding-opened') throw new Error('not opened');
    const applied = applyCheckFindingEvent(commitAll([report(failed)]), event);
    expect(applied.ok ? null : applied.rejection.message).toBe('check-finding-opened allocates cf-0001, but the next CheckFinding is cf-0002');
  });
});

describe('judgments', () => {
  it('supersedes a judgment by a fresh assessment without a code change', () => {
    let state = commitAll([report(judged)]);
    state = commit(state, dispose('cf-0001', 1, decision(
      { action: 'supersede', reassessed: ['cfr-0001'], replacement: 'The coupon path returns before the second discount' },
      { source: tree('t-01') },
    )));
    const entry = state.findings.get('cf-0001');
    expect(entry).toMatchObject({ standing: 'closed', reason: 'superseded', repair: null, revision: 2 });
    // The superseded judgment stays in the history beside the one that replaced it.
    expect(entry?.reports[0]?.judgment?.consequence).toContain('discount is applied twice');
  });

  it('refuses to supersede a report the CheckFinding does not hold', () => {
    const state = commitAll([report(judged)]);
    expect(refusal(state, dispose('cf-0001', 1, decision({ action: 'supersede', reassessed: ['cfr-0002'], replacement: 'r' })))).toBe('unknown-report');
  });

  it('refuses a judgment that would supersede a factual obligation', () => {
    const state = commitAll([report(failed)]);
    expect(refusal(state, dispose('cf-0001', 1, decision({ action: 'supersede', reassessed: ['cfr-0001'], replacement: 'flaky' })))).toBe('factual-obligation');
    expect(refusal(state, dispose('cf-0001', 1, decision({ action: 'fix-by-assessment', reassessed: ['cfr-0001'] })))).toBe('verification-kind-mismatch');
  });

  it('keeps a claimed repair of a judgment open until a fresh assessment verifies it', () => {
    let state = commitAll([report(judged)]);
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'claim-repair', candidate: tree('t-04'), change: 'wi-001.i04' })));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'open', reason: 'repair-claimed' });
    state = commit(state, dispose('cf-0001', 2, decision({ action: 'fix-by-assessment', reassessed: ['cfr-0001'] })));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'fixed-by-assessment' });
  });
});

describe('factual verification', () => {
  it('keeps a repair claim open while it waits for its witness', () => {
    const entry = claimed().findings.get('cf-0001');
    expect(entry).toMatchObject({ standing: 'open', reason: 'repair-claimed', repair: { kind: 'intent', ref: 'intent-1' } });
  });

  it('verifies with a complete pass of the same obligation on the acceptance candidate', () => {
    const state = commit(claimed(), verify(3, { source: tree('t-04') }));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'fixed-by-check', settledBy: 'cfd-0003' });
  });

  it('refuses every witness that is not the same obligation passing on the candidate', () => {
    const state = claimed();
    const cases: Array<[string, CheckFindingCommand]> = [
      ['wrong-subject', verify(3, { source: tree('t-04'), obligation: { subject: 'scenario:sc-005', revision: 1 } })],
      ['obligation-changed', verify(3, { source: tree('t-04'), obligation: { subject: 'scenario:sc-004', revision: 2 } })],
      ['producer-mismatch', verify(3, { source: tree('t-04'), producer: 'check:tests' })],
      ['incomparable-inputs', verify(3, { source: tree('t-04'), selection: 'quick/all-untagged' })],
      ['source-mismatch', verify(3, { source: tree('t-03') })],
      ['insufficient-coverage', verify(3, { source: tree('t-04'), coverage: 'partial' })],
      ['not-executed', verify(3, { source: tree('t-04'), coverage: 'not-run' })],
      ['not-passed', verify(3, { source: tree('t-04'), outcome: 'failed' })],
      ['not-passed', verify(3, { source: tree('t-04'), outcome: 'inconclusive' })],
    ];
    expect(cases.map(([, command]) => refusal(state, command))).toEqual(cases.map(([code]) => code));
  });

  it('refuses a pass on the source the failure was observed on as intermittent evidence', () => {
    expect(refusal(claimed(), verify(3, { source: tree('t-02') }, tree('t-02')))).toBe('failure-source');
  });

  it('refuses a check witness for a judgment', () => {
    const state = commitAll([report(judged)]);
    expect(refusal(state, dispose('cf-0001', 1, decision({ action: 'fix-by-check', candidate: tree('t-04'), witness: witness({ source: tree('t-04') }) }))))
      .toBe('verification-kind-mismatch');
  });

  it('records an authorized obligation revision as its own decision, which the old obligation cannot verify', () => {
    let state = claimed();
    expect(refusal(state, dispose('cf-0001', 3, decision({
      action: 'revise-obligation', authority, from: { subject: 'scenario:sc-004', revision: 1 }, to: { subject: 'scenario:sc-004', revision: 2 },
    })))).toBe('insufficient-authority');
    state = commit(state, dispose('cf-0001', 3, decision({
      action: 'revise-obligation',
      authority: { kind: 'governing-record', ref: 'plan.md@2' },
      from: { subject: 'scenario:sc-004', revision: 1 },
      to: { subject: 'scenario:sc-004', revision: 2 },
    })));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'open', reason: 'obligation-revised' });
    expect(refusal(state, verify(4, { source: tree('t-04') }))).toBe('obligation-changed');
    state = commit(state, verify(4, { source: tree('t-04'), obligation: { subject: 'scenario:sc-004', revision: 2 } }));
    expect(state.findings.get('cf-0001')?.decisions.map(held => held.decision.action)).toEqual(['plan-repair', 'claim-repair', 'revise-obligation', 'fix-by-check']);
  });

  it('refuses to waive or defer a required obligation, and permits it for one that is not required', () => {
    const required = commitAll([report(failed)]);
    const waive = decision({ action: 'waive', authority, acceptedRisk: 'high', uncertainty: 'low' });
    const defer = decision({ action: 'defer', authority, responsible: workItem('wi-001'), revisit: { kind: 'follow-up', ref: 'plan-13' } });
    expect(refusal(required, dispose('cf-0001', 1, waive))).toBe('required-obligation');
    expect(refusal(required, dispose('cf-0001', 1, defer))).toBe('required-obligation');
    // Not even the user waives a required check here; its gate decides it.
    expect(refusal(required, dispose('cf-0001', 1, { ...waive, actor: { kind: 'user', name: 'dan' } }))).toBe('required-obligation');
    const optional = commitAll([report(failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5, required: false }))]);
    expect(refusal(optional, dispose('cf-0001', 1, waive))).toBeNull();
    expect(refusal(optional, dispose('cf-0001', 1, defer))).toBeNull();
  });
});

describe('waivers', () => {
  const waive = decision({ action: 'waive', authority, acceptedRisk: 'medium', uncertainty: 'the rounding helper may drift' });

  it('closes as waived with the actor, the accepted risk and the reason, and refuses a reopening', () => {
    let state = commitAll([report(judged)]);
    state = commit(state, dispose('cf-0001', 1, waive));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'waived', settledBy: 'cfd-0001', revision: 2 });
    expect(state.findings.get('cf-0001')?.decisions[0]).toMatchObject({ actor: { role: 'local-architect' }, decision: { acceptedRisk: 'medium' } });
    expect(refusal(state, dispose('cf-0001', 2, decision({ action: 'reopen', cause: { kind: 'decision' } })))).toBe('waived');
    expect(refusal(state, dispose('cf-0001', 2, waive))).toBe('invalid-transition');
  });

  it('opens again only by a revocation, which keeps the waiver in the history and clears the repair', () => {
    let state = commitAll([report(judged)]);
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'i' } })));
    state = commit(state, dispose('cf-0001', 2, waive));
    state = commit(state, dispose('cf-0001', 3, decision(
      { action: 'revoke-waiver', reason: 'the rounding helper did drift' },
      { actor: { kind: 'user', name: 'dan' } },
    )));
    const entry = state.findings.get('cf-0001');
    expect(entry).toMatchObject({ standing: 'open', reason: 'waiver-revoked', revision: 4, settledBy: null, repair: null });
    expect(entry?.decisions.map(held => held.decision.action)).toEqual(['plan-repair', 'waive', 'revoke-waiver']);
    // Open again, it can be waived again.
    expect(refusal(state, dispose('cf-0001', 4, waive))).toBeNull();
  });

  it('refuses to revoke what is not a waiver', () => {
    let state = commitAll([report(judged)]);
    const revoke = (revision: number) => dispose('cf-0001', revision, decision({ action: 'revoke-waiver', reason: 'r' }));
    expect(refusal(state, revoke(1))).toBe('not-waived');
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'supersede', reassessed: ['cfr-0001'], replacement: 'r' })));
    expect(refusal(state, revoke(2))).toBe('not-waived');
  });

  it('waives a deferral directly', () => {
    let state = commitAll([report(judged)]);
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'defer', authority, responsible: workItem('wi-001'), revisit: { kind: 'condition', condition: 'c' } })));
    state = commit(state, dispose('cf-0001', 2, waive));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'waived' });
  });

  it('records a risk correction with any action, and the latest correction is the current risk', () => {
    let state = commitAll([report(judged)]);
    expect(state.findings.get('cf-0001')?.risk).toBe('medium');
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'i' } }, { risk: 'high' })));
    expect(state.findings.get('cf-0001')?.risk).toBe('high');
    state = commit(state, dispose('cf-0001', 2, decision({ action: 'waive', authority, acceptedRisk: 'low', uncertainty: 'u' }, { risk: 'low' })));
    expect(state.findings.get('cf-0001')).toMatchObject({ risk: 'low', reason: 'waived' });
    expect(state.findings.get('cf-0001')?.decisions.map(held => held.risk)).toEqual(['high', 'low']);
  });
});

describe('transitions', () => {
  it('reopens a closed CheckFinding at a new revision and keeps every earlier decision', () => {
    let state = commitAll([report(judged)]);
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'supersede', reassessed: ['cfr-0001'], replacement: 'the coupon path returns early' })));
    expect(refusal(state, dispose('cf-0001', 2, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'i' } })))).toBe('invalid-transition');
    state = commit(state, dispose('cf-0001', 2, decision({ action: 'reopen', cause: { kind: 'decision' } })));
    const entry = state.findings.get('cf-0001');
    expect(entry).toMatchObject({ standing: 'open', reason: 'reopened', revision: 3, settledBy: null });
    expect(entry?.decisions.map(held => held.decision.action)).toEqual(['supersede', 'reopen']);
  });

  it('refuses to reopen an open CheckFinding', () => {
    expect(refusal(commitAll([report(judged)]), dispose('cf-0001', 1, decision({ action: 'reopen', cause: { kind: 'decision' } })))).toBe('invalid-transition');
  });

  it('reopens a deferral, and supersedes one directly', () => {
    let state = commitAll([report(judged)]);
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'defer', authority, responsible: workItem('wi-001'), revisit: { kind: 'condition', condition: 'c' } })));
    expect(refusal(state, dispose('cf-0001', 2, decision({ action: 'claim-repair', candidate: tree('t-04'), change: 'x' })))).toBe('invalid-transition');
    expect(refusal(state, dispose('cf-0001', 2, decision({ action: 'supersede', reassessed: ['cfr-0001'], replacement: 'r' })))).toBeNull();
    expect(refusal(state, dispose('cf-0001', 2, decision({ action: 'reopen', cause: { kind: 'decision' } })))).toBeNull();
  });

  it('waits for the user once a decision is requested, and takes only a user answer naming an option', () => {
    let state = commitAll([report(judged)]);
    state = commit(state, dispose('cf-0001', 1, decision({
      action: 'request-user-decision',
      authority,
      conflicts: [{ text: 'Coupons never stack.', document: 'plan.md#R4', revision: '1' }],
      options: [{ id: 'a', summary: 'A', consequence: 'x' }, { id: 'b', summary: 'B', consequence: 'y' }],
    })));
    expect(state.findings.get('cf-0001')).toMatchObject({ pendingUserDecision: 'cfd-0001', reason: 'awaiting-user-decision' });
    expect(refusal(state, dispose('cf-0001', 2, decision({ action: 'waive', authority, acceptedRisk: 'low', uncertainty: 'low' })))).toBe('awaiting-user-decision');
    const answer = (option: string, request = 'cfd-0001', actor: 'user' | 'agent' = 'user') => dispose('cf-0001', 2, decision(
      { action: 'answer-user-decision', request, option },
      actor === 'user' ? { actor: { kind: 'user', name: 'dan' } } : {},
    ));
    expect(refusal(state, answer('a', 'cfd-0001', 'agent'))).toBe('insufficient-authority');
    expect(refusal(state, answer('c'))).toBe('unknown-option');
    expect(refusal(state, answer('a', 'cfd-0009'))).toBe('no-pending-user-decision');
    state = commit(state, answer('b'));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'open', reason: 'user-decision-answered', pendingUserDecision: null });
    expect(refusal(state, answer('b', 'cfd-0001'))).toBe('stale-revision');
  });

  it('refuses a user decision whose options repeat an ID', () => {
    const state = commitAll([report(judged)]);
    expect(refusal(state, dispose('cf-0001', 1, decision({
      action: 'request-user-decision',
      authority,
      conflicts: [{ text: 't', document: 'd', revision: '1' }],
      options: [{ id: 'a', summary: 'A', consequence: 'x' }, { id: 'a', summary: 'B', consequence: 'y' }],
    })))).toBe('invalid-command');
  });

  it('accepts an assessment together or refuses it all, naming the refused command', () => {
    const state = commitAll([report(judged), report(concern({ attempt: 'rq-0001.a01', key: 'c2', summary: 'Rounding', hash: 2 }))]);
    const decided = decideCheckFindingChange(state, {
      type: 'assess',
      commands: [
        dispose('cf-0001', 1, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'i' } })),
        dispose('cf-0001', 1, decision({ action: 'waive', authority, acceptedRisk: 'low', uncertainty: 'low' })),
      ],
    });
    expect(decided.ok ? null : decided.rejection).toEqual({
      code: 'stale-revision',
      message: 'the decision considered cf-0001 at revision 1, but it is at 2',
      index: 1,
    });
  });
});
