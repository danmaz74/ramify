import type {
  CheckFindingCommand, CheckFindingEventType, CheckFindingId, CheckFindingReason, CheckFindingRejectionCode,
  CheckFindingStanding,
} from '../../interfaces/check-findings.js';
import {
  concern, decision, dispose, failure, ground, hashOf, relate, report, tree, witness, workItem,
} from './builders.js';

/*
 * The worked stream of the contract appendix: one work item, `wi-001`, over
 * five candidate trees `t-01` to `t-05`. It holds two unrelated concerns in
 * one file, two parallel reports about one behavior, one stable producer
 * issue key, a waiver, a later contradiction that revokes it, a deferred
 * revisit and a re-raise of a waived issue that stays waived, with the exact
 * replay, the conflicting replay and two refused witnesses between them.
 * Each step names what the decision must return; the expected views below
 * are literal data, not the query's own output. The appendix's step 21, a
 * correction below the round's floor, is refused by the harness before this
 * module decides anything, so it is not a step here.
 */

export interface StreamStep {
  readonly name: string;
  readonly command: CheckFindingCommand;
  readonly expect:
    | { readonly events: readonly CheckFindingEventType[]; readonly replayed?: true }
    | { readonly rejection: CheckFindingRejectionCode };
}

const codeReview1 = concern({
  attempt: 'rq-0001.a01', key: 'concern-01', summary: 'The discount is applied twice when a coupon is present', hash: 1,
  risk: 'high', ground: ground('src/tests/cart.test.ts', 2002),
});
const workItemAuthority = { kind: 'work-item-assessment', ref: 'wi-001/assessment-1' } as const;
const reRaised = relate(['cf-0007', 1], ['cf-0006', 2], 'same-issue', 'the handler reads its configuration on every loop pass');

export const fixtureStream: readonly StreamStep[] = [
  {
    name: 'code review: a behavior bug in src/cart.ts',
    command: report(codeReview1),
    expect: { events: ['check-finding-opened'] },
  },
  {
    name: 'code review: an unrelated simplification in the same file',
    command: report(concern({ attempt: 'rq-0001.a01', key: 'concern-02', summary: 'Rounding is duplicated beside the shared helper', hash: 2, risk: 'low' })),
    expect: { events: ['check-finding-opened'] },
  },
  {
    name: 'scope review of iteration 1: the default currency contradicts R2',
    command: report(concern({
      producer: 'review:scope', attempt: 'rq-0002.a01', key: 'concern-01', summary: 'The new EUR default currency contradicts requirement R2', hash: 3, invocation: 'inv-0011',
      risk: 'high', ground: ground('plans/checkout/plan.md', 2003), credibility: 'human-reviewed',
    })),
    expect: { events: ['check-finding-opened'] },
  },
  {
    name: 'code review of iteration 2, in parallel: the same default, reported without seeing cf-0003',
    command: report(concern({
      attempt: 'rq-0004.a01', key: 'concern-01', summary: 'Defaulting to EUR ignores the configured locale', source: tree('t-02'), hash: 4, invocation: 'inv-0012', path: 'src/config.ts',
    })),
    expect: { events: ['check-finding-opened'] },
  },
  {
    name: 'the first report delivered again after a crash: an exact replay',
    command: report(codeReview1),
    expect: { events: [], replayed: true },
  },
  {
    name: 'the first report key with changed content: a conflicting replay',
    command: report({ ...codeReview1, contentHash: hashOf(99) }),
    expect: { rejection: 'report-key-conflict' },
  },
  {
    name: 'the scenario check of ga-0005 fails sc-004 on t-02',
    command: report(failure({ attempt: 'ga-0005', source: tree('t-02'), hash: 5 })),
    expect: { events: ['check-finding-opened'] },
  },
  {
    name: 'the scenario check of ga-0007 fails sc-004 again on t-03: the issue key attaches it',
    command: report(failure({ attempt: 'ga-0007', source: tree('t-03'), hash: 7 })),
    expect: { events: ['check-finding-reported'] },
  },
  {
    name: 'design review: the handler reads configuration in a loop',
    command: report(concern({
      producer: 'review:design', attempt: 'rq-0009.a01', key: 'concern-01', summary: 'The handler reads configuration on every loop pass', source: tree('t-03'), hash: 9, invocation: 'inv-0013', path: 'src/handler.ts',
      risk: 'low', ground: ground('docs/handler-notes.md', 2009), modules: ['project/handler'],
    })),
    expect: { events: ['check-finding-opened'] },
  },
  {
    name: 'the local architect assesses the work item at t-03 in one submission',
    command: {
      type: 'assess',
      commands: [
        relate(['cf-0004', 1], ['cf-0003', 1], 'same-issue', 'the default currency must follow R2'),
        relate(['cf-0002', 1], ['cf-0001', 1], 'distinct', 'one file; a discount defect and a duplicated helper'),
        dispose('cf-0001', 1, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'wi-001.rc01' } })),
        dispose('cf-0002', 1, decision({
          action: 'defer',
          authority: workItemAuthority,
          responsible: workItem('wi-001'),
          revisit: { kind: 'condition', condition: 'when a later iteration changes the rounding helpers' },
        })),
        dispose('cf-0003', 1, decision(
          { action: 'waive', authority: workItemAuthority, acceptedRisk: 'high', uncertainty: 'R2 names a locale fallback without its order' },
          {
            communication: {
              mode: 'report',
              choice: 'Keep EUR as the default; R2 permits a locale fallback',
              uncertainty: 'R2 does not order the fallback',
              reason: 'a reader of R2 could expect the configured locale first',
            },
          },
        )),
        dispose('cf-0004', 1, decision({ action: 'waive', authority: workItemAuthority, acceptedRisk: 'medium', uncertainty: 'as cf-0003' })),
        dispose('cf-0006', 1, decision(
          { action: 'waive', authority: workItemAuthority, acceptedRisk: 'low', uncertainty: 'the configuration is small and read from memory' },
          { rationale: 'A low risk, grounded only in an agent\'s note; the repeated read costs nothing measurable' },
        )),
        dispose('cf-0005', 2, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'wi-001.rc01' } })),
      ],
    },
    expect: {
      events: [
        'check-finding-related', 'check-finding-related',
        'check-finding-decided', 'check-finding-decided', 'check-finding-decided', 'check-finding-decided',
        'check-finding-decided', 'check-finding-decided',
      ],
    },
  },
  {
    name: 'the correction engineer claims the discount repaired on t-04',
    command: dispose('cf-0001', 2, decision(
      { action: 'claim-repair', candidate: tree('t-04'), change: 'wi-001.i04' },
      { actor: { kind: 'agent', role: 'engineer', invocation: 'inv-0021' }, source: tree('t-04') },
    )),
    expect: { events: ['check-finding-decided'] },
  },
  {
    name: 'and claims sc-004 repaired on t-04',
    command: dispose('cf-0005', 3, decision(
      { action: 'claim-repair', candidate: tree('t-04'), change: 'wi-001.i04' },
      { actor: { kind: 'agent', role: 'engineer', invocation: 'inv-0021' }, source: tree('t-04') },
    )),
    expect: { events: ['check-finding-decided'] },
  },
  {
    name: 'a pass of another scenario is no witness',
    command: dispose('cf-0005', 4, decision(
      { action: 'fix-by-check', candidate: tree('t-04'), witness: witness({ source: tree('t-04'), obligation: { subject: 'scenario:sc-005', revision: 1 } }) },
      { actor: { kind: 'harness', reason: 'gate ga-0009 passed' }, source: tree('t-04') },
    )),
    expect: { rejection: 'wrong-subject' },
  },
  {
    name: 'a partial run of sc-004 is no witness',
    command: dispose('cf-0005', 4, decision(
      { action: 'fix-by-check', candidate: tree('t-04'), witness: witness({ source: tree('t-04'), coverage: 'partial' }) },
      { actor: { kind: 'harness', reason: 'gate ga-0009 passed' }, source: tree('t-04') },
    )),
    expect: { rejection: 'insufficient-coverage' },
  },
  {
    name: 'sc-004 passes completely on the acceptance candidate t-04',
    command: dispose('cf-0005', 4, decision(
      { action: 'fix-by-check', candidate: tree('t-04'), witness: witness({ source: tree('t-04') }) },
      { actor: { kind: 'harness', reason: 'gate ga-0009 passed' }, source: tree('t-04') },
    )),
    expect: { events: ['check-finding-decided'] },
  },
  {
    name: 'a fresh assessment finds the discount fixed',
    command: dispose('cf-0001', 3, decision({ action: 'fix-by-assessment', reassessed: ['cfr-0001'] }, { source: tree('t-04') })),
    expect: { events: ['check-finding-decided'] },
  },
  {
    name: 'a later contradiction: R2 revision 2 forbids the locale fallback the waiver relied on',
    command: dispose('cf-0003', 2, decision(
      { action: 'revoke-waiver', reason: 'R2 revision 2 removes the locale fallback the waiver relied on' },
      { source: tree('t-05'), rationale: 'R2 revision 2 requires the configured locale first', evidence: [{ kind: 'document', ref: 'plan.md#R2@2', hash: hashOf(52) }] },
    )),
    expect: { events: ['check-finding-decided'] },
  },
  {
    name: 'the architect asks the user: the fix would change an approved acceptance obligation',
    command: dispose('cf-0003', 3, decision({
      action: 'request-user-decision',
      authority: workItemAuthority,
      conflicts: [{ text: 'The configured locale decides the default currency.', document: 'plan.md#R2', revision: '2' }],
      options: [
        { id: 'follow-r2', summary: 'Default to the configured locale', consequence: 'Scenario sc-003 must be revised' },
        { id: 'keep-eur', summary: 'Keep EUR and record the deviation', consequence: 'R2 revision 2 stays unmet' },
      ],
    }, { source: tree('t-05') })),
    expect: { events: ['check-finding-decided'] },
  },
  {
    name: 'design review of t-05 raises the configuration read again, suggesting cf-0006',
    command: report(concern({
      producer: 'review:design', attempt: 'rq-0012.a01', key: 'concern-01', summary: 'The handler still reads configuration inside its loop', source: tree('t-05'), hash: 12,
      invocation: 'inv-0015', path: 'src/handler.ts', risk: 'low', modules: ['project/handler'], suggests: 'cf-0006',
    })),
    expect: { events: ['check-finding-opened'] },
  },
  {
    name: 'the last round finds cf-0007 is cf-0006 again: the waiver settles the re-raise',
    command: { type: 'assess', commands: [{ type: 'relate', relation: { ...reRaised.relation, source: tree('t-05') } }] },
    expect: { events: ['check-finding-related', 'check-finding-decided'] },
  },
];

/** The three steps the second reconciliation commits as one assessment. */
export const secondReconciliation = { from: 15, to: 18 } as const;

export interface ExpectedFinding {
  readonly id: CheckFindingId;
  readonly revision: number;
  readonly standing: CheckFindingStanding;
  readonly reason: CheckFindingReason;
  readonly reports: number;
  readonly decisions: number;
}

/** What every CheckFinding of the stream must derive to. */
export const expectedFindings: readonly ExpectedFinding[] = [
  { id: 'cf-0001', revision: 4, standing: 'closed', reason: 'fixed-by-assessment', reports: 1, decisions: 3 },
  { id: 'cf-0002', revision: 2, standing: 'deferred', reason: 'deferred', reports: 1, decisions: 1 },
  { id: 'cf-0003', revision: 4, standing: 'open', reason: 'awaiting-user-decision', reports: 1, decisions: 3 },
  { id: 'cf-0004', revision: 2, standing: 'closed', reason: 'waived', reports: 1, decisions: 1 },
  { id: 'cf-0005', revision: 5, standing: 'closed', reason: 'fixed-by-check', reports: 2, decisions: 3 },
  { id: 'cf-0006', revision: 2, standing: 'closed', reason: 'waived', reports: 1, decisions: 1 },
  { id: 'cf-0007', revision: 2, standing: 'closed', reason: 'waived', reports: 1, decisions: 1 },
];

export const expectedCounters = { findings: 7, reports: 8, decisions: 13, relations: 3 } as const;
/** Events accepted by the stream: seven opened, one reported, thirteen decided and three related. */
export const expectedEventCount = 24;
