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
      { action: 'verify-by-check', candidate: tree('t-04'), witness: witness({ source: tree('t-04') }) },
      { actor: { kind: 'harness', reason: 'ga-0009 passed' } },
    )));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'verified-by-check' });
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
