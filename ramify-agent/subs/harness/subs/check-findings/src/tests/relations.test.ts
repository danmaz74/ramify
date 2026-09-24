import { describe, expect, it } from 'vitest';
import type { CheckFindingCommand, CheckFindingState } from '../interfaces/check-findings.js';
import { decideCheckFindingChange } from '../decide.js';
import { selectCheckFindings } from '../queries.js';
import {
  commit, commitAll, concern, decision, dispose, failure, relate, report, tree, witness, workItem,
} from './fixtures/builders.js';

function refusal(state: CheckFindingState, command: CheckFindingCommand): string | null {
  const decided = decideCheckFindingChange(state, command);
  return decided.ok ? null : decided.rejection.code;
}

function groupOf(state: CheckFindingState, id: string) {
  const detail = selectCheckFindings(state, { kind: 'detail', checkFinding: id });
  if (!detail.ok || detail.view.kind !== 'detail') throw new Error('no detail');
  return detail.view.summary.group;
}

/** A failed scenario, a reviewer's concern about the same behavior and an unrelated concern, all of wi-001. */
function three(): CheckFindingState {
  return commitAll([
    report(failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5 })),
    report(concern({ attempt: 'rq-0002.a01', key: 'c1', summary: 'Totals are rounded before the discount', hash: 2, source: tree('t-02') })),
    report(concern({ attempt: 'rq-0003.a01', key: 'c1', summary: 'Rounding is duplicated', hash: 3, source: tree('t-02') })),
  ]);
}

describe('same-issue relations', () => {
  it('groups two CheckFindings under the earlier ID while each keeps its reports and obligation', () => {
    const state = commit(three(), relate(['cf-0002', 1], ['cf-0001', 1], 'same-issue', 'sc-004 fails because totals round first'));
    expect(groupOf(state, 'cf-0002')).toEqual({ canonical: 'cf-0001', members: ['cf-0001', 'cf-0002'] });
    expect(state.findings.get('cf-0001')?.verification.kind).toBe('check');
    expect(state.findings.get('cf-0002')?.verification.kind).toBe('assessment');
    // A relation changes neither revision.
    expect([state.findings.get('cf-0001')?.revision, state.findings.get('cf-0002')?.revision]).toEqual([1, 1]);
  });

  it('lets the judgment in a group be superseded while the factual member still needs its witness', () => {
    let state = commit(three(), relate(['cf-0002', 1], ['cf-0001', 1], 'same-issue'));
    state = commit(state, dispose('cf-0002', 1, decision({ action: 'supersede', reassessed: ['cfr-0002'], replacement: 'the rounding order is correct' })));
    expect(refusal(state, dispose('cf-0001', 1, decision({ action: 'supersede', reassessed: ['cfr-0001'], replacement: 'as cf-0002' })))).toBe('factual-obligation');
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'open', reason: 'new' });
    const attention = selectCheckFindings(state, { kind: 'list', select: 'attention' });
    expect(attention.ok && attention.view.kind === 'list' && attention.view.items.map(item => [item.id, item.awaiting])).toEqual([['cf-0001', 'assessment'], ['cf-0003', 'assessment']]);
    // One repair can serve the group; each member records it and the factual one still needs its witness.
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'plan-repair', repair: { kind: 'assignment', ref: 'wi-001.i04' } })));
    state = commit(state, dispose('cf-0001', 2, decision({ action: 'claim-repair', candidate: tree('t-04'), change: 'wi-001.i04' })));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'open', reason: 'repair-claimed' });
    state = commit(state, dispose('cf-0001', 3, decision(
      { action: 'fix-by-check', candidate: tree('t-04'), witness: witness({ source: tree('t-04') }) },
      { actor: { kind: 'harness', reason: 'ga-0009 passed' } },
    )));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'fixed-by-check' });
  });

  it('does not group related-but-distinct, distinct or uncertain pairs', () => {
    let state = three();
    state = commit(state, relate(['cf-0002', 1], ['cf-0001', 1], 'related-but-distinct'));
    state = commit(state, relate(['cf-0003', 1], ['cf-0002', 1], 'uncertain'));
    state = commit(state, relate(['cf-0003', 1], ['cf-0001', 1], 'distinct'));
    expect(['cf-0001', 'cf-0002', 'cf-0003'].map(id => groupOf(state, id))).toEqual([null, null, null]);
    expect(state.relations).toHaveLength(3);
  });

  it('separates a pair a later assessment finds distinct, and keeps both assessments', () => {
    let state = commit(three(), relate(['cf-0003', 1], ['cf-0002', 1], 'same-issue'));
    state = commit(state, relate(['cf-0002', 1], ['cf-0003', 1], 'distinct', 'one rounds, the other duplicates'));
    expect(groupOf(state, 'cf-0003')).toBeNull();
    expect(state.relations.map(relation => relation.relation)).toEqual(['same-issue', 'distinct']);
    const detail = selectCheckFindings(state, { kind: 'detail', checkFinding: 'cf-0003' });
    expect(detail.ok && detail.view.kind === 'detail' && detail.view.relations.map(relation => relation.id)).toEqual(['cfl-0002']);
  });

  it('joins a third member transitively under the earliest canonical ID', () => {
    let state = commit(three(), relate(['cf-0003', 1], ['cf-0002', 1], 'same-issue'));
    state = commit(state, relate(['cf-0002', 1], ['cf-0001', 1], 'same-issue'));
    expect(groupOf(state, 'cf-0003')).toEqual({ canonical: 'cf-0001', members: ['cf-0001', 'cf-0002', 'cf-0003'] });
    expect(refusal(state, relate(['cf-0003', 1], ['cf-0001', 1], 'same-issue'))).toBe('relation-cycle');
    expect(refusal(state, relate(['cf-0002', 1], ['cf-0003', 1], 'same-issue'))).toBe('relation-cycle');
  });

  it('refuses a relation to itself, across owners, or at a stale revision', () => {
    const state = commit(three(), report(concern({ attempt: 'rq-0004.a01', key: 'c1', summary: 'Other owner', hash: 4, owner: workItem('wi-002') })));
    expect(refusal(state, relate(['cf-0002', 1], ['cf-0002', 1], 'same-issue'))).toBe('relation-self');
    expect(refusal(state, relate(['cf-0004', 1], ['cf-0002', 1], 'same-issue'))).toBe('cross-owner');
    expect(refusal(state, relate(['cf-0002', 2], ['cf-0001', 1], 'same-issue'))).toBe('stale-revision');
    expect(refusal(state, relate(['cf-0009', 1], ['cf-0001', 1], 'same-issue'))).toBe('unknown-check-finding');
  });
});

describe('a re-raise joined to a waived issue', () => {
  const authority = { kind: 'work-item-assessment', ref: 'wi-001.rc01' } as const;
  const waived = (): CheckFindingState => {
    let state = commitAll([
      report(concern({ attempt: 'rq-0001.a01', key: 'c1', summary: 'Configuration is read in a loop', hash: 1, risk: 'low' })),
    ]);
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'waive', authority, acceptedRisk: 'low', uncertainty: 'the value is cached' })));
    return commit(state, report(concern({ attempt: 'rq-0005.a01', key: 'c1', summary: 'Configuration is still read in a loop', hash: 5, suggests: 'cf-0001', source: tree('t-05') })));
  };

  it('waives the newly joined open member as the harness, under the canonical\'s waiver', () => {
    const decided = decideCheckFindingChange(waived(), relate(['cf-0002', 1], ['cf-0001', 2], 'same-issue'));
    if (!decided.ok) throw new Error(decided.rejection.message);
    expect(decided.events.map(event => event.type)).toEqual(['check-finding-related', 'check-finding-decided']);
    expect(decided.touched).toEqual(['cf-0002', 'cf-0001']);
    const state = commit(waived(), relate(['cf-0002', 1], ['cf-0001', 2], 'same-issue'));
    const member = state.findings.get('cf-0002');
    expect(member).toMatchObject({ standing: 'closed', reason: 'waived', revision: 2, settledBy: 'cfd-0002' });
    expect(member?.decisions[0]).toMatchObject({
      actor: { kind: 'harness' },
      communication: { mode: 'quiet' },
      decision: { action: 'waive', authority: { kind: 'governing-record', ref: 'cfd-0001' }, acceptedRisk: 'medium', uncertainty: 'the value is cached' },
    });
    // Revoking the member's waiver reopens it alone; the canonical's stands.
    const revoked = commit(state, dispose('cf-0002', 2, decision({ action: 'revoke-waiver', reason: 'this one differs' }, { actor: { kind: 'user', name: 'dan' } })));
    expect([revoked.findings.get('cf-0001')?.reason, revoked.findings.get('cf-0002')?.reason]).toEqual(['waived', 'waiver-revoked']);
  });

  it('waives nothing when the canonical is not waived, or a relation other than same-issue joins them', () => {
    let state = waived();
    state = commit(state, dispose('cf-0001', 2, decision({ action: 'revoke-waiver', reason: 'r' })));
    const joined = decideCheckFindingChange(state, relate(['cf-0002', 1], ['cf-0001', 3], 'same-issue'));
    expect(joined.ok && joined.events.map(event => event.type)).toEqual(['check-finding-related']);
    const related = decideCheckFindingChange(waived(), relate(['cf-0002', 1], ['cf-0001', 2], 'related-but-distinct'));
    expect(related.ok && related.events.map(event => event.type)).toEqual(['check-finding-related']);
  });

  it('leaves a required check and a member awaiting the user open when they join a waived issue', () => {
    let state = waived();
    state = commit(state, report(failure({ attempt: 'ga-0009', source: tree('t-05'), hash: 9 })));
    state = commit(state, dispose('cf-0002', 1, decision({
      action: 'request-user-decision', authority,
      conflicts: [{ text: 'Configuration is read once.', document: 'plan.md#R7', revision: '1' }],
      options: [{ id: 'a', summary: 'A', consequence: 'x' }, { id: 'b', summary: 'B', consequence: 'y' }],
    })));
    state = commit(state, relate(['cf-0002', 2], ['cf-0001', 2], 'same-issue'));
    state = commit(state, relate(['cf-0003', 1], ['cf-0001', 2], 'same-issue'));
    expect(['cf-0002', 'cf-0003'].map(id => state.findings.get(id)?.reason)).toEqual(['awaiting-user-decision', 'new']);
    expect(groupOf(state, 'cf-0003')).toEqual({ canonical: 'cf-0001', members: ['cf-0001', 'cf-0002', 'cf-0003'] });
  });

  it('waives every open member a relation joins at once, and none it had joined before', () => {
    let state = waived();
    state = commit(state, report(concern({ attempt: 'rq-0006.a01', key: 'c1', summary: 'A third raise', hash: 6, source: tree('t-06') })));
    // cf-0002 and cf-0003 form a group first; one relation then joins both to the waived cf-0001.
    state = commit(state, relate(['cf-0003', 1], ['cf-0002', 1], 'same-issue'));
    state = commit(state, relate(['cf-0002', 1], ['cf-0001', 2], 'same-issue'));
    expect(['cf-0002', 'cf-0003'].map(id => [state.findings.get(id)?.reason, state.findings.get(id)?.decisions[0]?.id])).toEqual([['waived', 'cfd-0002'], ['waived', 'cfd-0003']]);
  });
});
