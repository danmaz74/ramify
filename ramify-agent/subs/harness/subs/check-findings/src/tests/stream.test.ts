import { describe, expect, it } from 'vitest';
import { checkFindingEventSchema, type CheckFindingEvent, type CheckFindingState } from '../interfaces/check-findings.js';
import { decideCheckFindingChange } from '../decide.js';
import { applyCheckFindingEvent, emptyCheckFindingState, replayCheckFindingEvents } from '../replay.js';
import { selectCheckFindings } from '../queries.js';
import { expectedCounters, expectedEventCount, expectedFindings, fixtureStream, secondReconciliation } from './fixtures/stream.js';

/** Runs the worked stream, checking each step's outcome, and returns the state and every accepted event. */
function runStream(): { state: CheckFindingState; events: CheckFindingEvent[] } {
  let state = emptyCheckFindingState();
  const events: CheckFindingEvent[] = [];
  for (const step of fixtureStream) {
    const decided = decideCheckFindingChange(state, step.command);
    if ('rejection' in step.expect) {
      expect(decided.ok ? 'accepted' : decided.rejection.code, step.name).toBe(step.expect.rejection);
      continue;
    }
    if (!decided.ok) throw new Error(`${step.name}: ${decided.rejection.code}: ${decided.rejection.message}`);
    expect(decided.events.map(event => event.type), step.name).toEqual(step.expect.events);
    expect(decided.replayed, step.name).toBe(step.expect.replayed ?? false);
    for (const event of decided.events) {
      const applied = applyCheckFindingEvent(state, event);
      if (!applied.ok) throw new Error(`${step.name}: ${applied.rejection.message}`);
      state = applied.state;
      events.push(event);
    }
  }
  return { state, events };
}

const views = (state: CheckFindingState) => ({
  all: selectCheckFindings(state, { kind: 'list', select: 'all' }),
  attention: selectCheckFindings(state, { kind: 'list', select: 'attention', owner: { kind: 'work-item', workItem: 'wi-001' }, due: ['cf-0002'] }),
  ordered: selectCheckFindings(state, { kind: 'list', select: 'all', order: 'attention' }),
  handler: selectCheckFindings(state, { kind: 'list', select: 'all', module: 'project/handler' }),
  details: [...state.findings.keys()].map(id => selectCheckFindings(state, { kind: 'detail', checkFinding: id })),
});

describe('the worked stream', () => {
  it('decides every step as the appendix states and derives the expected CheckFindings', () => {
    const { state, events } = runStream();
    expect(events).toHaveLength(expectedEventCount);
    expect(state.applied).toBe(expectedEventCount);
    expect(state.counters).toEqual(expectedCounters);
    expect([...state.findings.values()].map(entry => ({
      id: entry.id, revision: entry.revision, standing: entry.standing, reason: entry.reason,
      reports: entry.reports.length, decisions: entry.decisions.length,
    }))).toEqual(expectedFindings);
  });

  it('replays the events, read back from their JSON lines, into identical state and views', () => {
    const { state, events } = runStream();
    const lines = events.map(event => JSON.stringify(event));
    const read = lines.map(line => checkFindingEventSchema.parse(JSON.parse(line)));
    const replayed = replayCheckFindingEvents(read);
    if (!replayed.ok) throw new Error(replayed.rejection.message);
    expect(replayed.state).toEqual(state);
    expect(views(replayed.state)).toEqual(views(state));
  });

  it('replays in two parts from an intermediate state into the same state', () => {
    const { state, events } = runStream();
    const first = replayCheckFindingEvents(events.slice(0, 9));
    if (!first.ok) throw new Error(first.rejection.message);
    const rest = replayCheckFindingEvents(events.slice(9), first.state);
    if (!rest.ok) throw new Error(rest.rejection.message);
    expect(rest.state).toEqual(state);
  });

  it('shows the groups, the attention set, the material choices and the pending user decision', () => {
    const { state } = runStream();
    const all = selectCheckFindings(state, { kind: 'list', select: 'all' });
    if (!all.ok || all.view.kind !== 'list') throw new Error('no list');
    const byId = new Map(all.view.items.map(item => [item.id, item]));
    expect(byId.get('cf-0003')?.group).toEqual({ canonical: 'cf-0003', members: ['cf-0003', 'cf-0004'] });
    expect(byId.get('cf-0004')?.group).toEqual({ canonical: 'cf-0003', members: ['cf-0003', 'cf-0004'] });
    expect(byId.get('cf-0007')?.group).toEqual({ canonical: 'cf-0006', members: ['cf-0006', 'cf-0007'] });
    // The same-file pair was assessed distinct and stays ungrouped.
    expect(byId.get('cf-0001')?.group).toBeNull();
    expect(byId.get('cf-0002')?.group).toBeNull();
    // The revocation withdrew the waiver's material-choice report; cf-0003 now awaits the user.
    expect(byId.get('cf-0003')).toMatchObject({
      standing: 'open', awaiting: 'user-decision', pendingUserDecision: 'cfd-0012', materialChoice: null, risk: 'high', credibility: 'human-reviewed',
    });
    expect(all.view.counts).toEqual({
      total: 7,
      standings: { open: 1, deferred: 1, closed: 5 },
      reasons: { 'fixed-by-assessment': 1, deferred: 1, 'awaiting-user-decision': 1, waived: 3, 'fixed-by-check': 1 },
    });

    const attention = selectCheckFindings(state, { kind: 'list', select: 'attention', owner: { kind: 'work-item', workItem: 'wi-001' }, due: ['cf-0002'] });
    if (!attention.ok || attention.view.kind !== 'list') throw new Error('no list');
    expect(attention.view.items.map(item => [item.id, item.attention])).toEqual([['cf-0002', 'due'], ['cf-0003', 'open']]);
    const ordered = selectCheckFindings(state, { kind: 'list', select: 'attention', owner: { kind: 'work-item', workItem: 'wi-001' }, due: ['cf-0002'], order: 'attention' });
    if (!ordered.ok || ordered.view.kind !== 'list') throw new Error('no list');
    expect(ordered.view.items.map(item => [item.id, item.attention, item.risk])).toEqual([['cf-0003', 'open', 'high'], ['cf-0002', 'due', 'low']]);
    const notDue = selectCheckFindings(state, { kind: 'list', select: 'attention' });
    if (!notDue.ok || notDue.view.kind !== 'list') throw new Error('no list');
    expect(notDue.view.items.map(item => item.id)).toEqual(['cf-0003']);
  });

  it('derives the same events when steps 16 to 18 are one assessment, as the second reconciliation commits them', () => {
    const { events } = runStream();
    const before = replayCheckFindingEvents(events.slice(0, 18));
    if (!before.ok) throw new Error(before.rejection.message);
    const commands = fixtureStream.slice(secondReconciliation.from, secondReconciliation.to).map(step => step.command);
    const assessed = decideCheckFindingChange(before.state, {
      type: 'assess',
      commands: commands.map(command => {
        if (command.type !== 'dispose') throw new Error('not a disposition');
        return command;
      }),
    });
    expect(assessed.ok && assessed.events).toEqual(events.slice(18, 21));
  });

  it('keeps the waiver inspectable after the contradiction revoked it', () => {
    const { state } = runStream();
    const detail = selectCheckFindings(state, { kind: 'detail', checkFinding: 'cf-0003' });
    if (!detail.ok || detail.view.kind !== 'detail') throw new Error('no detail');
    expect(detail.view.decisions.items.map(item => [item.id, item.considered, item.decision.action])).toEqual([
      ['cfd-0003', 1, 'waive'], ['cfd-0011', 2, 'revoke-waiver'], ['cfd-0012', 3, 'request-user-decision'],
    ]);
    expect(detail.view.decisions.items[0]?.communication.mode).toBe('report');
    expect(detail.view.relations.map(relation => [relation.id, relation.relation])).toEqual([['cfl-0001', 'same-issue']]);
  });
});

describe('the worked stream after iteration 4b', () => {
  it('waives the re-raise of a waived issue as the harness, under the canonical\'s waiver', () => {
    const { state } = runStream();
    const reRaise = state.findings.get('cf-0007');
    expect(reRaise).toMatchObject({ standing: 'closed', reason: 'waived', settledBy: 'cfd-0013', revision: 2 });
    expect(reRaise?.reports[0]?.suggests).toBe('cf-0006');
    expect(reRaise?.decisions[0]).toMatchObject({
      actor: { kind: 'harness' },
      source: { kind: 'tree', id: 't-05' },
      decision: { action: 'waive', authority: { kind: 'governing-record', ref: 'cfd-0005' }, acceptedRisk: 'low' },
    });
    // The canonical's own waiver is unchanged.
    expect(state.findings.get('cf-0006')).toMatchObject({ reason: 'waived', settledBy: 'cfd-0005', revision: 2 });
  });

  it('carries the reporter\'s risk and ground and the harness\'s credibility and modules', () => {
    const { events } = runStream();
    const [first] = events;
    if (first?.type !== 'check-finding-opened') throw new Error('not opened');
    expect(first.data.report).toMatchObject({
      judgment: { risk: 'high', ground: { ref: 'src/tests/cart.test.ts', hash: `sha256:${'7d2'.padStart(64, '0')}` } },
      credibility: 'agent-generated',
      modules: ['project/cart'],
      id: 'cfr-0001',
    });
    const { state } = runStream();
    expect([...state.findings.values()].map(entry => [entry.id, entry.risk, entry.credibility, entry.modules])).toEqual([
      ['cf-0001', 'high', 'agent-generated', ['project/cart']],
      ['cf-0002', 'low', 'ungrounded', ['project/cart']],
      ['cf-0003', 'high', 'human-reviewed', ['project/cart']],
      ['cf-0004', 'medium', 'ungrounded', ['project/cart']],
      ['cf-0005', 'high', 'objective-reproduced', ['project/checkout']],
      ['cf-0006', 'low', 'agent-generated', ['project/handler']],
      ['cf-0007', 'low', 'ungrounded', ['project/handler']],
    ]);
  });

  it('orders every CheckFinding by risk, credibility and recency, and narrows a list to one module', () => {
    const { state } = runStream();
    const ordered = selectCheckFindings(state, { kind: 'list', select: 'all', order: 'attention' });
    if (!ordered.ok || ordered.view.kind !== 'list') throw new Error('no list');
    // High: the reproduced failure, then the human-reviewed ground, then the agent's.
    // Medium: one. Low: the agent-grounded design concern, then the two ungrounded ones, latest report first.
    expect(ordered.view.items.map(item => item.id)).toEqual(['cf-0005', 'cf-0003', 'cf-0001', 'cf-0004', 'cf-0006', 'cf-0007', 'cf-0002']);
    const handler = selectCheckFindings(state, { kind: 'list', select: 'all', module: 'project/handler' });
    if (!handler.ok || handler.view.kind !== 'list') throw new Error('no list');
    expect(handler.view.items.map(item => item.id)).toEqual(['cf-0006', 'cf-0007']);
    expect(handler.view.counts).toEqual({ total: 2, standings: { open: 0, deferred: 0, closed: 2 }, reasons: { waived: 2 } });
  });
});
