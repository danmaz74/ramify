import { describe, expect, test } from 'vitest';
import { runEvent, type RunEvent, type RunEventInput } from '../run/log.js';
import { sessionId, sessionIdSchema } from '../run/records.js';
import {
  applySessionEvent, InvalidSessionTransitionError, reduceSessions, sessionsIn, type RunSessions, type SessionState,
} from '../run/sessions.js';

/*
 * The session reducer: a pure function of the run log with a closed set of
 * transitions. Every valid pair of a state and an event is taken here, and
 * every other pair is rejected with the event's sequence.
 */

const runId = '20260923T090000Z-5e5510';
const at = new Date('2026-09-23T09:00:00.000Z');

/** Builds events in order, each parsed by the log's own schema. */
function log(...inputs: RunEventInput[]): RunEvent[] {
  return inputs.map((input, index) => runEvent(runId, index + 1, input, new Date(at.getTime() + index * 1000)));
}

const opened = (session = 'ses-0001', role: 'initial-architect' | 'engineer' = 'engineer'): RunEventInput => ({
  type: 'session-opened',
  data: { session, role, work: role === 'engineer' ? { workItem: 'wi-001', iteration: 'wi-001.i01' } : {}, executor: 'scripted', model: null },
});
const started = (invocation: string, start: 'opened' | 'continued', session = 'ses-0001'): RunEventInput => ({
  type: 'invocation-started',
  data: { invocation, role: 'engineer', session, work: { workItem: 'wi-001', iteration: 'wi-001.i01' }, start },
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
    const [other] = log({ type: 'work-item-started', data: { workItem: 'wi-001', module: 'm' } });
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
