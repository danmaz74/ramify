import { describe, expect, it } from 'vitest';
import { checkFindingQueryLimits, type CheckFindingState } from '../interfaces/check-findings.js';
import { selectCheckFindings } from '../queries.js';
import { emptyCheckFindingState } from '../replay.js';
import { commit, commitAll, concern, decision, dispose, report, workItem } from './fixtures/builders.js';

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
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'accept', authority: { kind: 'work-item-assessment', ref: 'a' }, uncertainty: 'low' })));
    const list = listOf(state, { kind: 'list', select: 'attention', owner: workItem('wi-001') });
    expect(list.items.map(item => item.id)).toEqual(['cf-0003']);
    expect(list.counts).toEqual({ total: 2, standings: { open: 1, deferred: 0, closed: 1 }, reasons: { accepted: 1, new: 1 } });
  });

  it('filters by standing when selecting all', () => {
    let state = many(3);
    state = commit(state, dispose('cf-0002', 1, decision({ action: 'accept', authority: { kind: 'work-item-assessment', ref: 'a' }, uncertainty: 'low' })));
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
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'accept', authority: { kind: 'work-item-assessment', ref: 'a' }, uncertainty: 'low' })));
    const list = listOf(state, { kind: 'list', select: 'attention', owner: workItem('wi-001') });
    expect([list.total, list.items]).toEqual([0, []]);
    expect(listOf(emptyCheckFindingState(), { kind: 'list', select: 'attention' }).total).toBe(0);
  });

  it('refuses a due ID that names no CheckFinding', () => {
    const selected = selectCheckFindings(many(1), { kind: 'list', select: 'attention', due: ['cf-0007'] });
    expect(selected.ok ? null : selected.rejection.code).toBe('unknown-check-finding');
  });
});

describe('detail', () => {
  it('bounds the history it returns and states the totals', () => {
    let state = many(1);
    for (let revision = 1; revision < 1 + 2 * 110; revision += 2) {
      state = commit(state, dispose('cf-0001', revision, decision({ action: 'accept', authority: { kind: 'work-item-assessment', ref: 'a' }, uncertainty: 'low' })));
      state = commit(state, dispose('cf-0001', revision + 1, decision({ action: 'reopen', cause: { kind: 'decision' } })));
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
