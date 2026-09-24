import { describe, expect, it } from 'vitest';
import { checkFindingQueryLimits, type CheckFindingState } from '../interfaces/check-findings.js';
import { selectCheckFindings } from '../queries.js';
import { emptyCheckFindingState } from '../replay.js';
import { commit, commitAll, concern, decision, dispose, failure, ground, report, tree, workItem } from './fixtures/builders.js';

function many(count: number): CheckFindingState {
  return commitAll(Array.from({ length: count }, (_, index) => report(concern({
    attempt: 'rq-0001.a01', key: `c${index + 1}`, summary: `Concern ${index + 1}`, hash: index + 1,
    owner: workItem(index % 2 === 0 ? 'wi-001' : 'wi-002'),
  }))));
}

function listOf(state: CheckFindingState, query: Parameters<typeof selectCheckFindings>[1]) {
  const selected = selectCheckFindings(state, query);
  if (!selected.ok || selected.view.kind !== 'list') throw new Error(selected.ok ? 'not a list' : selected.rejection.message);
  return selected.view;
}

describe('list bounds', () => {
  it('pages by ID with the default limit and reports total, shown and the next cursor', () => {
    const state = many(120);
    const first = listOf(state, { kind: 'list', select: 'all' });
    expect([first.total, first.shown, first.next, first.items[0]?.id]).toEqual([120, checkFindingQueryLimits.defaultLimit, 'cf-0050', 'cf-0001']);
    const last = listOf(state, { kind: 'list', select: 'all', after: 'cf-0100', limit: 100 });
    expect([last.total, last.shown, last.next, last.items[0]?.id]).toEqual([120, 20, null, 'cf-0101']);
  });

  it('refuses a limit beyond the maximum and a malformed cursor', () => {
    const state = many(2);
    const tooMany = selectCheckFindings(state, { kind: 'list', select: 'all', limit: checkFindingQueryLimits.maxLimit + 1 });
    expect(tooMany.ok ? null : tooMany.rejection.code).toBe('invalid-query');
    const cursor = selectCheckFindings(state, { kind: 'list', select: 'all', after: 'wi-001' });
    expect(cursor.ok ? null : cursor.rejection.code).toBe('invalid-query');
  });

  it('counts every CheckFinding of the owner whatever the page selects', () => {
    let state = many(4);
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'waive', authority: { kind: 'work-item-assessment', ref: 'a' }, acceptedRisk: 'low', uncertainty: 'low' })));
    const list = listOf(state, { kind: 'list', select: 'attention', owner: workItem('wi-001') });
    expect(list.items.map(item => item.id)).toEqual(['cf-0003']);
    expect(list.counts).toEqual({ total: 2, standings: { open: 1, deferred: 0, closed: 1 }, reasons: { waived: 1, new: 1 } });
  });

  it('filters by standing when selecting all', () => {
    let state = many(3);
    state = commit(state, dispose('cf-0002', 1, decision({ action: 'waive', authority: { kind: 'work-item-assessment', ref: 'a' }, acceptedRisk: 'low', uncertainty: 'low' })));
    expect(listOf(state, { kind: 'list', select: 'all', standings: ['closed'] }).items.map(item => item.id)).toEqual(['cf-0002']);
  });
});

describe('attention', () => {
  it('selects open CheckFindings and only the deferred ones the caller says are due', () => {
    let state = many(3);
    for (const id of ['cf-0001', 'cf-0003']) {
      state = commit(state, dispose(id, 1, decision({
        action: 'defer',
        authority: { kind: 'work-item-assessment', ref: 'a' },
        responsible: workItem('wi-001'),
        revisit: { kind: 'condition', condition: 'when pricing changes' },
      })));
    }
    expect(listOf(state, { kind: 'list', select: 'attention' }).items.map(item => [item.id, item.attention])).toEqual([['cf-0002', 'open']]);
    expect(listOf(state, { kind: 'list', select: 'attention', due: ['cf-0003', 'cf-0002'] }).items.map(item => [item.id, item.attention]))
      .toEqual([['cf-0002', 'open'], ['cf-0003', 'due']]);
  });

  it('is empty when nothing is open or due, so the caller can take the ordinary gate path', () => {
    let state = many(1);
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'waive', authority: { kind: 'work-item-assessment', ref: 'a' }, acceptedRisk: 'low', uncertainty: 'low' })));
    const list = listOf(state, { kind: 'list', select: 'attention', owner: workItem('wi-001') });
    expect([list.total, list.items]).toEqual([0, []]);
    expect(listOf(emptyCheckFindingState(), { kind: 'list', select: 'attention' }).total).toBe(0);
  });

  it('refuses a due ID that names no CheckFinding', () => {
    const selected = selectCheckFindings(many(1), { kind: 'list', select: 'attention', due: ['cf-0007'] });
    expect(selected.ok ? null : selected.rejection.code).toBe('unknown-check-finding');
  });
});

describe('attention order and modules', () => {
  /** Six concerns of one owner across two modules, with every risk and credibility the order compares. */
  function signals(): CheckFindingState {
    return commitAll([
      report(concern({ attempt: 'rq-0001.a01', key: 'c1', summary: 'Low, ungrounded', hash: 1, risk: 'low' })),
      report(concern({ attempt: 'rq-0001.a01', key: 'c2', summary: 'High, agent-generated', hash: 2, risk: 'high', ground: ground('src/tests/a.test.ts', 12) })),
      report(concern({
        attempt: 'rq-0001.a01', key: 'c3', summary: 'High, human-reviewed', hash: 3, risk: 'high',
        ground: ground('docs/cart.principles.md', 13), credibility: 'human-reviewed', modules: ['project/pricing'],
      })),
      report(concern({ attempt: 'rq-0001.a01', key: 'c4', summary: 'Medium, ungrounded', hash: 4, modules: ['project/cart', 'project/pricing'] })),
      report(concern({ attempt: 'rq-0002.a01', key: 'c1', summary: 'Low, ungrounded, later', hash: 5, risk: 'low' })),
      report(failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 6, required: false, modules: ['project/pricing'] })),
    ]);
  }

  it('orders by risk, then credibility, then the latest report, and pages after a position in that order', () => {
    const state = signals();
    const ordered = listOf(state, { kind: 'list', select: 'all', order: 'attention' });
    // cf-0006 is a non-required failed check: medium, objective.
    expect(ordered.items.map(item => [item.id, item.risk, item.credibility])).toEqual([
      ['cf-0003', 'high', 'human-reviewed'],
      ['cf-0002', 'high', 'agent-generated'],
      ['cf-0006', 'medium', 'objective'],
      ['cf-0004', 'medium', 'ungrounded'],
      ['cf-0005', 'low', 'ungrounded'],
      ['cf-0001', 'low', 'ungrounded'],
    ]);
    const first = listOf(state, { kind: 'list', select: 'all', order: 'attention', limit: 2 });
    expect([first.items.map(item => item.id), first.next]).toEqual([['cf-0003', 'cf-0002'], 'cf-0002']);
    const second = listOf(state, { kind: 'list', select: 'all', order: 'attention', after: 'cf-0002', limit: 2 });
    expect([second.items.map(item => item.id), second.next]).toEqual([['cf-0006', 'cf-0004'], 'cf-0004']);
    const unknown = selectCheckFindings(state, { kind: 'list', select: 'all', order: 'attention', after: 'cf-0009' });
    expect(unknown.ok ? null : unknown.rejection.code).toBe('unknown-check-finding');
  });

  it('ranks a reproduced objective signal first, and follows a risk correction over the reporter\'s level', () => {
    let state = signals();
    state = commit(state, report(failure({ attempt: 'ga-0007', source: tree('t-03'), hash: 7, required: false, modules: ['project/pricing'] })));
    expect(state.findings.get('cf-0006')).toMatchObject({ credibility: 'objective-reproduced', risk: 'medium' });
    state = commit(state, dispose('cf-0005', 1, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'i' } }, { risk: 'high' })));
    expect(state.findings.get('cf-0005')?.risk).toBe('high');
    const ordered = listOf(state, { kind: 'list', select: 'all', order: 'attention' });
    expect(ordered.items.map(item => item.id)).toEqual(['cf-0003', 'cf-0002', 'cf-0005', 'cf-0006', 'cf-0004', 'cf-0001']);
    // A later report does not undo the correction: the latest correction stands.
    expect(state.findings.get('cf-0005')?.reports.at(-1)?.judgment?.risk).toBe('low');
  });

  it('narrows a list and its counts to the CheckFindings that concern one module', () => {
    const state = signals();
    const pricing = listOf(state, { kind: 'list', select: 'all', module: 'project/pricing' });
    expect(pricing.items.map(item => [item.id, item.modules])).toEqual([
      ['cf-0003', ['project/pricing']], ['cf-0004', ['project/cart', 'project/pricing']], ['cf-0006', ['project/pricing']],
    ]);
    expect(pricing.counts.total).toBe(3);
    // A CheckFinding of two modules counts in both, so the module counts do not sum to the owner's.
    expect(listOf(state, { kind: 'list', select: 'all', module: 'project/cart' }).counts.total).toBe(4);
    expect(listOf(state, { kind: 'list', select: 'all' }).counts.total).toBe(6);
    expect(listOf(state, { kind: 'list', select: 'all', module: 'project/none' }).total).toBe(0);
  });
});

describe('detail', () => {
  it('bounds the history it returns and states the totals', () => {
    let state = many(1);
    for (let revision = 1; revision < 1 + 2 * 110; revision += 2) {
      state = commit(state, dispose('cf-0001', revision, decision({ action: 'waive', authority: { kind: 'work-item-assessment', ref: 'a' }, acceptedRisk: 'low', uncertainty: 'low' })));
      state = commit(state, dispose('cf-0001', revision + 1, decision({ action: 'revoke-waiver', reason: 'a later report contradicts it' })));
    }
    const detail = selectCheckFindings(state, { kind: 'detail', checkFinding: 'cf-0001' });
    if (!detail.ok || detail.view.kind !== 'detail') throw new Error('no detail');
    expect([detail.view.decisions.total, detail.view.decisions.items.length]).toEqual([220, checkFindingQueryLimits.detailHistory]);
    expect(detail.view.decisions.items.at(-1)?.id).toBe('cfd-0220');
  });

  it('refuses an unknown CheckFinding', () => {
    const detail = selectCheckFindings(many(1), { kind: 'detail', checkFinding: 'cf-0002' });
    expect(detail.ok ? null : detail.rejection.code).toBe('unknown-check-finding');
  });
});
