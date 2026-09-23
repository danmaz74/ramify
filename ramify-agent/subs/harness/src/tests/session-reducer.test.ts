import { describe, expect, test } from 'vitest';
import { runEvent, type RunEvent, type RunEventInput } from '../run/log.js';
import { sessionId, sessionIdSchema, type ContinueRelation, type ForkRelation, type ReplaceRelation, type RequestRelation } from '../run/records.js';
import {
  applySessionEvent, InvalidSessionTransitionError, invocationSessions, reduceSessions, sessionsIn, type RunSessions, type SessionState,
} from '../run/sessions.js';

/*
 * The session reducer: a pure function of the run log with a closed set of
 * transitions. Every valid pair of a state and an event is taken here, and
 * every other pair is rejected with the event's sequence. A lineage relation
 * is held to the points the log has reached.
 */

const runId = '20260923T090000Z-5e5510';
const at = new Date('2026-09-23T09:00:00.000Z');

/** Builds events in order, each parsed by the log's own schema. */
function log(...inputs: RunEventInput[]): RunEvent[] {
  return inputs.map((input, index) => runEvent(runId, index + 1, input, new Date(at.getTime() + index * 1000)));
}

/** The relations a session can be opened with. */
type Opening = { fork?: ForkRelation; replaces?: ReplaceRelation; requestedBy?: RequestRelation };

const opened = (session = 'ses-0001', role: 'initial-architect' | 'engineer' = 'engineer', relations: Opening = {}): RunEventInput => ({
  type: 'session-opened',
  data: { session, role, work: role === 'engineer' ? { workItem: 'wi-001', iteration: 'wi-001.i01' } : {}, executor: 'scripted', model: null, ...relations },
});
const started = (invocation: string, start: 'opened' | 'continued', session = 'ses-0001', continues?: ContinueRelation): RunEventInput => ({
  type: 'invocation-started',
  data: { invocation, role: 'engineer', session, work: { workItem: 'wi-001', iteration: 'wi-001.i01' }, start, ...(continues === undefined ? {} : { continues }) },
});
const ended = (invocation: string, kept: boolean, session = 'ses-0001'): RunEventInput => ({
  type: 'invocation-ended',
  data: kept
    ? { invocation, ended: 'submitted', submission: null, session, kept: true }
    : { invocation, ended: 'submitted', submission: null, session, kept: false, finished: 'work-closed' },
});
const appended = (session = 'ses-0001'): RunEventInput => ({
  type: 'brief-appended',
  data: { decision: 'gd-001', generation: 1, session, ref: 'scripted-1@3#1', outcome: 'appended' },
});
const released = (reason: 'run-ended' | 'interrupted' | 'replaced' = 'run-ended', session = 'ses-0001'): RunEventInput => ({
  type: 'session-finished',
  data: { session, reason },
});

/**
 * The states a session can be in when the next event names it: none; live
 * while its first invocation is being started ("opening"); live awaiting an
 * invocation; suspended; finished. Each is reached by a valid prefix.
 */
const prefixes: Record<'none' | 'opening' | 'live' | 'suspended' | 'finished', RunEventInput[]> = {
  none: [],
  opening: [opened()],
  live: [opened(), started('inv-0001', 'opened')],
  suspended: [opened(), started('inv-0001', 'opened'), ended('inv-0001', true)],
  finished: [opened(), started('inv-0001', 'opened'), ended('inv-0001', false)],
};

/** Every event the model reads, as the next event after a prefix. */
const next: Record<string, RunEventInput> = {
  'session-opened': opened(),
  'invocation-started, opened': started('inv-0002', 'opened'),
  'invocation-started, continued': started('inv-0002', 'continued'),
  'invocation-ended, kept': ended('inv-0001', true),
  'invocation-ended, finished': ended('inv-0001', false),
  'brief-appended': appended(),
  'session-finished': released(),
};

/** The valid pairs and the state each reaches: the transition table, and nothing else. */
const valid: Record<string, SessionState> = {
  'none + session-opened': 'live',
  'opening + invocation-started, opened': 'live',
  'live + invocation-ended, kept': 'suspended',
  'live + invocation-ended, finished': 'finished',
  'suspended + invocation-started, continued': 'live',
  'suspended + brief-appended': 'suspended',
  'suspended + session-finished': 'finished',
  // A session opened whose first invocation never started: the run ended,
  // or the harness crashed, between the two appends.
  'opening + session-finished': 'finished',
};

describe('the session reducer', () => {
  test('takes every valid transition and rejects every other pair with the event\'s sequence', () => {
    const outcomes: Record<string, SessionState | 'rejected'> = {};
    for (const [state, prefix] of Object.entries(prefixes)) {
      const before = reduceSessions(log(...prefix));
      for (const [label, input] of Object.entries(next)) {
        const event = log(...prefix, input).at(-1)!;
        try {
          outcomes[`${state} + ${label}`] = applySessionEvent(before, event).get('ses-0001')!.state;
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidSessionTransitionError);
          const rejected = error as InvalidSessionTransitionError;
          expect(rejected.sequence).toBe(prefix.length + 1);
          expect(rejected.session).toBe('ses-0001');
          expect(rejected.message).toContain(`Event ${prefix.length + 1}`);
          outcomes[`${state} + ${label}`] = 'rejected';
        }
      }
    }
    // Five states by seven events: thirty-five pairs, eight of them valid.
    expect(Object.keys(outcomes)).toHaveLength(35);
    const expected = Object.fromEntries(Object.keys(outcomes).map(pair => [pair, valid[pair] ?? 'rejected']));
    expect(outcomes).toEqual(expected);
  });

  test('a live session awaits one invocation: another one\'s end, or a second start, is rejected', () => {
    const live = [opened(), started('inv-0001', 'opened')];
    expect(() => reduceSessions(log(...live, ended('inv-0002', true)))).toThrow(/awaits inv-0001, not inv-0002/);
    expect(() => reduceSessions(log(...live, started('inv-0002', 'continued')))).toThrow(InvalidSessionTransitionError);
    // An invocation is one segment of one session, started once.
    const suspended = [...live, ended('inv-0001', true)];
    expect(() => reduceSessions(log(...suspended, started('inv-0001', 'continued')))).toThrow(/inv-0001 has already started/);
  });

  test('an event naming a session that was never opened is rejected from none', () => {
    const error = (() => {
      try {
        reduceSessions(log(opened('ses-0001'), started('inv-0001', 'opened', 'ses-0002')));
      } catch (caught) {
        return caught as InvalidSessionTransitionError;
      }
      return undefined;
    })();
    expect(error).toMatchObject({ sequence: 2, session: 'ses-0002', from: 'none', event: 'invocation-started' });
  });

  test('a session\'s invocations, appends, reason and moments are derived with its state', () => {
    const events = log(
      opened('ses-0001', 'initial-architect'),
      started('inv-0001', 'opened'),
      ended('inv-0001', true),
      appended(),
      appended(),
      started('inv-0002', 'continued'),
      ended('inv-0002', true),
      released('run-ended'),
    );
    const session = reduceSessions(events).get('ses-0001')!;
    expect(session).toEqual({
      id: 'ses-0001',
      role: 'initial-architect',
      work: {},
      executor: 'scripted',
      model: null,
      state: 'finished',
      invocations: ['inv-0001', 'inv-0002'],
      awaiting: null,
      appends: [4, 5],
      finished: 'run-ended',
      point: { session: 'ses-0001', invocation: 'inv-0002' },
      fork: null,
      replaces: null,
      requestedBy: null,
      opened: { sequence: 1, at: events[0]!.at },
      changed: { sequence: 8, at: events[7]!.at },
    });
  });

  test('sessions are independent: any number may be live at once, each awaiting its own invocation', () => {
    const sessions = reduceSessions(log(
      opened('ses-0001'), started('inv-0001', 'opened', 'ses-0001'),
      opened('ses-0002'), started('inv-0002', 'opened', 'ses-0002'),
      ended('inv-0002', true, 'ses-0002'),
    ));
    expect([...sessions.values()].map(session => [session.id, session.state, session.awaiting]))
      .toEqual([['ses-0001', 'live', 'inv-0001'], ['ses-0002', 'suspended', null]]);
    expect(sessionsIn(sessions, 'live').map(session => session.id)).toEqual(['ses-0001']);
  });

  test('an event the model does not read leaves the sessions as they were', () => {
    const before: RunSessions = reduceSessions(log(opened(), started('inv-0001', 'opened')));
    const [other] = log({ type: 'work-item-started', data: { workItem: 'wi-001', module: 'm', origin: 'entry' } });
    expect(applySessionEvent(before, other!)).toBe(before);
  });

  test('a run\'s session identifiers are counted from ses-0001, and the log accepts no other form', () => {
    expect([sessionId(1), sessionId(12), sessionId(10_000)]).toEqual(['ses-0001', 'ses-0012', 'ses-10000']);
    expect(sessionIdSchema.safeParse('ses-0001').success).toBe(true);
    for (const invalid of ['ses-1', 'inv-0001', 'scripted-1@3#1', '20260921T101500Z-a1b2c3']) {
      expect(sessionIdSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe('lineage', () => {
  const context = [opened('ses-0001', 'initial-architect'), started('inv-0001', 'opened'), ended('inv-0001', true)];

  test('a session\'s point moves to each invocation\'s end and each append', () => {
    const point = (...inputs: RunEventInput[]) => reduceSessions(log(...inputs)).get('ses-0001')!.point;
    expect(point(opened(), started('inv-0001', 'opened'))).toBeNull();
    expect(point(...context)).toEqual({ session: 'ses-0001', invocation: 'inv-0001' });
    expect(point(...context, appended())).toEqual({ session: 'ses-0001', append: 4 });
    expect(point(opened(), started('inv-0001', 'opened'), ended('inv-0001', false))).toEqual({ session: 'ses-0001', invocation: 'inv-0001' });
  });

  test('a continuation continues from its session\'s latest point, and from no other', () => {
    const continued = (from: ContinueRelation['from']) =>
      reduceSessions(log(...context, appended(), started('inv-0002', 'continued', 'ses-0001', { from, reason: 'repair', briefs: ['gd-001'] })));
    expect(continued({ session: 'ses-0001', append: 4 }).get('ses-0001')!.state).toBe('live');
    // The end of the previous invocation is no longer the latest point once
    // a brief is appended after it.
    expect(() => continued({ session: 'ses-0001', invocation: 'inv-0001' })).toThrow(/latest point is ses-0001 at append 4/);
    expect(() => continued({ session: 'ses-0002', append: 4 })).toThrow(InvalidSessionTransitionError);
    // A start that opens a session continues from nothing.
    expect(() => reduceSessions(log(opened(), started('inv-0001', 'opened', 'ses-0001', { from: { session: 'ses-0001', invocation: 'inv-0001' }, reason: 'repair', briefs: [] }))))
      .toThrow(/only a continued start continues from a point/);
  });

  test('a fork names a point its source reached, whatever state the source is in now', () => {
    const fork = (from: ForkRelation['from']): ForkRelation => ({ from, reason: 'placement-request', generation: 1, briefs: [] });
    const forked = reduceSessions(log(...context, appended(), opened('ses-0002', 'engineer', { fork: fork({ session: 'ses-0001', invocation: 'inv-0001' }) })));
    expect(forked.get('ses-0002')!.fork).toEqual(fork({ session: 'ses-0001', invocation: 'inv-0001' }));
    expect(forked.get('ses-0001')!.state).toBe('suspended');
    // A finished source still holds its points.
    expect(() => reduceSessions(log(...context, released(), opened('ses-0002', 'engineer', { fork: fork({ session: 'ses-0001', invocation: 'inv-0001' }) })))).not.toThrow();
    // A point not reached: an invocation still awaited, one that never ran, an append that did not happen.
    expect(() => reduceSessions(log(opened(), started('inv-0001', 'opened'), opened('ses-0002', 'engineer', { fork: fork({ session: 'ses-0001', invocation: 'inv-0001' }) }))))
      .toThrow(/forks from ses-0001 at inv-0001, which no session has reached/);
    expect(() => reduceSessions(log(...context, opened('ses-0002', 'engineer', { fork: fork({ session: 'ses-0001', invocation: 'inv-0009' }) })))).toThrow(InvalidSessionTransitionError);
    expect(() => reduceSessions(log(...context, opened('ses-0002', 'engineer', { fork: fork({ session: 'ses-0001', append: 3 }) })))).toThrow(InvalidSessionTransitionError);
  });

  test('a replacement names an opened session, and a request an invocation that started', () => {
    const replaced = reduceSessions(log(...context, released('replaced'),
      opened('ses-0002', 'engineer', { replaces: { session: 'ses-0001', reason: 'reconstructed' }, requestedBy: { invocation: 'inv-0001', reason: 'contract-needed' } })));
    expect(replaced.get('ses-0002')).toMatchObject({
      replaces: { session: 'ses-0001', reason: 'reconstructed' },
      requestedBy: { invocation: 'inv-0001', reason: 'contract-needed' },
      fork: null,
    });
    expect(() => reduceSessions(log(...context, opened('ses-0002', 'engineer', { replaces: { session: 'ses-0007', reason: 'context-rebuilt' } }))))
      .toThrow(/replaces ses-0007, which was never opened/);
    expect(() => reduceSessions(log(...context, opened('ses-0002', 'engineer', { requestedBy: { invocation: 'inv-0009', reason: 'contract-needed' } }))))
      .toThrow(/requested by inv-0009, which has not started/);
  });

  test('each invocation\'s session is read from its start, for a projection that groups by session', () => {
    const events = log(...context, started('inv-0002', 'continued', 'ses-0001', { from: { session: 'ses-0001', invocation: 'inv-0001' }, reason: 'repair', briefs: [] }),
      opened('ses-0002'), started('inv-0003', 'opened', 'ses-0002'));
    expect([...invocationSessions(events)]).toEqual([['inv-0001', 'ses-0001'], ['inv-0002', 'ses-0001'], ['inv-0003', 'ses-0002']]);
  });
});
