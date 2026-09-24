import { describe, expect, it } from 'vitest';
import { decideCheckFindingChange } from '../decide.js';
import { emptyCheckFindingState } from '../replay.js';
import {
  commit, commitAll, concern, decision, dispose, failure, ground, hashOf, report, tree, witness, workItem,
} from './fixtures/builders.js';

const first = concern({ attempt: 'rq-0001.a01', key: 'c1', summary: 'The discount is applied twice', hash: 1 });

describe('ingestion keys', () => {
  it('accepts an exact replay with no events and names the CheckFinding it led to', () => {
    const state = commitAll([report(first)]);
    const replay = decideCheckFindingChange(state, report(first));
    expect(replay).toEqual({ ok: true, events: [], replayed: true, touched: ['cf-0001'] });
  });

  it('refuses the same key with other content', () => {
    const state = commitAll([report(first)]);
    const replay = decideCheckFindingChange(state, report({ ...first, contentHash: hashOf(2) }));
    expect(replay.ok ? null : replay.rejection.code).toBe('report-key-conflict');
  });

  it('treats a report of another attempt as a new delivery, even with the same key and content', () => {
    const state = commitAll([report(first)]);
    const other = decideCheckFindingChange(state, report({ ...first, attempt: 'rq-0002.a01' }));
    expect(other.ok && other.events.map(event => event.type)).toEqual(['check-finding-opened']);
  });

  it('replays a factual report attached to an existing CheckFinding without a second attachment', () => {
    const second = failure({ attempt: 'ga-0007', source: tree('t-03'), hash: 7 });
    const state = commitAll([report(failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5 })), report(second)]);
    expect(decideCheckFindingChange(state, report(second))).toEqual({ ok: true, events: [], replayed: true, touched: ['cf-0001'] });
  });
});

describe('producer issue keys', () => {
  it('attaches a second report with the same issue key to the same CheckFinding', () => {
    const state = commitAll([
      report(failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5 })),
      report(failure({ attempt: 'ga-0007', source: tree('t-03'), hash: 7 })),
    ]);
    expect(state.findings.size).toBe(1);
    expect(state.findings.get('cf-0001')?.reports.map(held => held.attempt)).toEqual(['ga-0005', 'ga-0007']);
    expect(state.findings.get('cf-0001')?.revision).toBe(2);
  });

  it('scopes the key by owner and by obligation revision', () => {
    const state = commitAll([
      report(failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5 })),
      report(failure({ attempt: 'ga-0006', source: tree('t-02'), hash: 6, owner: workItem('wi-002') })),
      report(failure({ attempt: 'ga-0007', source: tree('t-03'), hash: 7, revision: 2 })),
    ]);
    expect([...state.findings.keys()]).toEqual(['cf-0001', 'cf-0002', 'cf-0003']);
  });

  it('refuses a key that names two CheckFindings instead of choosing one', () => {
    // cf-0001 is revision 1 of sc-004; cf-0002 arrived for revision 2 before
    // the authorized revision of cf-0001's obligation was recorded, which
    // gives both the scoped key of revision 2.
    let state = commitAll([
      report(failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5 })),
      report(failure({ attempt: 'ga-0006', source: tree('t-03'), hash: 6, revision: 2 })),
    ]);
    state = commit(state, dispose('cf-0001', 1, decision({
      action: 'revise-obligation',
      authority: { kind: 'user-decision', ref: 'cfd-0000' },
      from: { subject: 'scenario:sc-004', revision: 1 },
      to: { subject: 'scenario:sc-004', revision: 2 },
    })));
    const ambiguous = decideCheckFindingChange(state, report(failure({ attempt: 'ga-0008', source: tree('t-04'), hash: 8, revision: 2 })));
    expect(ambiguous.ok ? null : ambiguous.rejection).toEqual({
      code: 'ambiguous-issue-key',
      message: 'issue key scenario:sc-004 names cf-0001, cf-0002; a report attaches to exactly one',
    });
    // Without its key the report is recorded as a provisional CheckFinding for the architect to match.
    const provisional = decideCheckFindingChange(state, report(failure({ attempt: 'ga-0008', source: tree('t-04'), hash: 8, revision: 2, issueKey: null })));
    expect(provisional.ok && provisional.events.map(event => event.type)).toEqual(['check-finding-opened']);
  });

  it('keeps a deferral deferred and adds evidence when a same-key report arrives', () => {
    let state = commitAll([report(failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5, required: false }))]);
    state = commit(state, dispose('cf-0001', 1, decision({
      action: 'defer', authority: { kind: 'work-item-assessment', ref: 'a' }, responsible: workItem('wi-001'), revisit: { kind: 'follow-up', ref: 'plan-13' },
    })));
    state = commit(state, report(failure({ attempt: 'ga-0007', source: tree('t-03'), hash: 7, required: false })));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'deferred', revision: 3 });
  });
});

describe('judgmental reports', () => {
  it('keeps two concerns about one file distinct', () => {
    const state = commitAll([
      report(first),
      report(concern({ attempt: 'rq-0001.a01', key: 'c2', summary: 'Rounding is duplicated', hash: 2 })),
    ]);
    expect([...state.findings.keys()]).toEqual(['cf-0001', 'cf-0002']);
    expect(state.relations).toEqual([]);
  });

  it('records a reviewer hint without attaching the report', () => {
    const state = commitAll([
      report(first),
      report(concern({ attempt: 'rq-0003.a01', key: 'c1', summary: 'A coupon discounts twice', hash: 3, suggests: 'cf-0001' })),
    ]);
    expect(state.findings.size).toBe(2);
    expect(state.findings.get('cf-0002')?.reports[0]?.suggests).toBe('cf-0001');
  });

  it('refuses a hint that names no CheckFinding', () => {
    const hinted = decideCheckFindingChange(emptyCheckFindingState(), report({ ...first, suggests: 'cf-0009' }));
    expect(hinted.ok ? null : hinted.rejection.code).toBe('unknown-check-finding');
  });

  it('refuses a review concern without its judgment, and a failed check verified by assessment', () => {
    const bare = decideCheckFindingChange(emptyCheckFindingState(), report({ ...first, judgment: null }));
    expect(bare.ok ? null : bare.rejection.code).toBe('invalid-report');
    const mixed = decideCheckFindingChange(emptyCheckFindingState(), report({
      ...failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5 }), verification: { kind: 'assessment' },
    }));
    expect(mixed.ok ? null : mixed.rejection.code).toBe('invalid-report');
  });

  it('refuses a report whose credibility does not fit its kind or its ground', () => {
    const refused = (input: Parameters<typeof report>[0]) => {
      const decided = decideCheckFindingChange(emptyCheckFindingState(), report(input));
      return decided.ok ? null : decided.rejection.code;
    };
    expect(refused({ ...first, credibility: 'objective' })).toBe('invalid-report');
    expect(refused({ ...failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5 }), credibility: 'human-reviewed' })).toBe('invalid-report');
    // Without a ground a concern is ungrounded, and with one it is not.
    expect(refused({ ...first, credibility: 'agent-generated' })).toBe('invalid-report');
    const grounded = concern({ attempt: 'rq-0001.a01', key: 'c1', summary: 's', hash: 1, ground: ground('docs/a.principles.md', 9) });
    expect(refused({ ...grounded, credibility: 'ungrounded' })).toBe('invalid-report');
    expect(refused({ ...grounded, credibility: 'human-reviewed' })).toBeNull();
  });

  it('refuses a malformed command with the path of the offending value', () => {
    const malformed = decideCheckFindingChange(emptyCheckFindingState(), report({ ...first, contentHash: 'abc' }));
    expect(malformed.ok ? null : malformed.rejection.code).toBe('invalid-command');
    expect(malformed.ok ? '' : malformed.rejection.message).toContain('report.contentHash');
  });
});

describe('reopening by a same-key report', () => {
  it('reopens a fixed CheckFinding when its obligation fails again, preserving the fix', () => {
    let state = commitAll([report(failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5 }))]);
    state = commit(state, dispose('cf-0001', 1, decision(
      { action: 'fix-by-check', candidate: tree('t-04'), witness: witness({ source: tree('t-04') }) },
      { actor: { kind: 'harness', reason: 'ga-0009 passed' } },
    )));
    const decided = decideCheckFindingChange(state, report(failure({ attempt: 'ga-0011', source: tree('t-06'), hash: 11 })));
    expect(decided.ok && decided.events.map(event => event.type)).toEqual(['check-finding-reported', 'check-finding-decided']);
    state = commit(state, report(failure({ attempt: 'ga-0011', source: tree('t-06'), hash: 11 })));
    const entry = state.findings.get('cf-0001');
    expect(entry).toMatchObject({ standing: 'open', reason: 'reopened', revision: 4 });
    expect(entry?.decisions.map(held => [held.decision.action, held.actor.kind])).toEqual([['fix-by-check', 'harness'], ['reopen', 'harness']]);
    expect(entry?.decisions[1]?.decision).toEqual({ action: 'reopen', cause: { kind: 'report', report: 'cfr-0002' } });
  });

  it('keeps a waived CheckFinding closed when its issue key reports again, from any source, until a revocation', () => {
    let state = commitAll([report(failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5, required: false }))]);
    state = commit(state, dispose('cf-0001', 1, decision(
      { action: 'waive', authority: { kind: 'work-item-assessment', ref: 'a' }, acceptedRisk: 'medium', uncertainty: 'low' },
      { source: tree('t-02') },
    )));
    state = commit(state, report(failure({ attempt: 'ga-0006', source: tree('t-02'), hash: 6, required: false })));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'waived', revision: 3 });
    state = commit(state, report(failure({ attempt: 'ga-0007', source: tree('t-03'), hash: 7, required: false })));
    const entry = state.findings.get('cf-0001');
    expect(entry).toMatchObject({ standing: 'closed', reason: 'waived', revision: 4, settledBy: 'cfd-0001' });
    // The re-raises are evidence: three objective reports, and no harness decision.
    expect([entry?.reports.length, entry?.decisions.length, entry?.credibility]).toEqual([3, 1, 'objective-reproduced']);
    state = commit(state, dispose('cf-0001', 4, decision({ action: 'revoke-waiver', reason: 'it keeps failing' }, { actor: { kind: 'user', name: 'dan' } })));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'open', reason: 'waiver-revoked', revision: 5 });
  });

  it('adds evidence to a judgment closed on the same source, and reopens it from another source', () => {
    const keyed = (attempt: string, hash: number, source: string) => concern({ attempt, key: 'c1', summary: 'The discount is applied twice', hash, source: tree(source), issueKey: 'discount' });
    let state = commitAll([report(keyed('rq-0001.a01', 1, 't-01'))]);
    state = commit(state, dispose('cf-0001', 1, decision({ action: 'fix-by-assessment', reassessed: ['cfr-0001'] }, { source: tree('t-02') })));
    state = commit(state, report(keyed('rq-0002.a01', 2, 't-02')));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'fixed-by-assessment', revision: 3 });
    state = commit(state, report(keyed('rq-0003.a01', 3, 't-03')));
    expect(state.findings.get('cf-0001')).toMatchObject({ standing: 'open', reason: 'reopened', revision: 5 });
  });
});
