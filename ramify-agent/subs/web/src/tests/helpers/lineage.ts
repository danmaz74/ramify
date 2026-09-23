import type { RunSessionView, RunSessionsResponse, SessionInvocation } from '../../../../harness/src/interfaces/protocol/sessions.js';
import { at, evaluation, invocation, sessionView } from './sessions.js';

/*
 * One run's sessions with every lineage relation, for the timeline's tests.
 * Event sequences:
 *
 *   ses-0001 initial-architect  inv-0001 2–4, kept; suspended from 4; brief dec-001 appended at 6
 *   ses-0002 global-fork        forked from ses-0001's append at 6; inv-0002 7–8, fork made fresh
 *   ses-0003 engineer           inv-0003 9–10 (contract needed), kept; suspended 10–13;
 *                               inv-0005 continued 13–14, kept; suspended 14–15, finished replaced
 *   ses-0004 contract-engineer  requested by inv-0003; inv-0004 11–12, work closed
 *   ses-0005 engineer           in place of ses-0003 (reconstructed); inv-0006 16–, awaited
 */

const moment = (sequence: number) => ({ sequence, at: at(sequence) });

function segment(session: string, id: string, started: number, ended: number | null, extra: Partial<SessionInvocation> = {}): SessionInvocation {
  return invocation(id, {
    started: moment(started),
    ended: ended === null ? null : moment(ended),
    outcome: ended === null ? null : 'submitted',
    kept: ended === null ? null : true,
    point: ended === null ? null : { session, invocation: id },
    evaluation: evaluation(id, ended === null ? { ended: null } : {}),
    ...extra,
  });
}

const noLineage = { fork: null, replaces: null, replacedBy: null, requestedBy: null, requested: [], forks: [] };

export function lineageSessions(): RunSessionView[] {
  const appendPoint = { session: 'ses-0001', append: 6 };
  return [
    sessionView('ses-0001', {
      state: 'suspended', finished: null, role: 'initial-architect', work: {}, reaches: { kind: 'run' },
      opened: moment(1), changed: moment(6), point: appendPoint,
      invocations: [segment('ses-0001', 'inv-0001', 2, 4)],
      appends: [{ appended: moment(6), decision: 'dec-001', generation: 1, outcome: 'appended', point: appendPoint }],
      suspended: [{ from: moment(4), until: null }],
      lineage: { ...noLineage, forks: ['ses-0002'] },
    }),
    sessionView('ses-0002', {
      role: 'global-fork', work: { request: 'pr-001' }, reaches: { kind: 'request', request: 'pr-001', workItem: 'wi-001', capability: 'send-button' },
      finished: 'not-kept', opened: moment(7), changed: moment(8),
      invocations: [segment('ses-0002', 'inv-0002', 7, 8, {
        kept: false, degraded: { requested: 'fork', actual: 'fresh', reason: 'the source session file is gone' },
      })],
      lineage: { ...noLineage, fork: { from: appendPoint, reason: 'placement-request', generation: 1, briefs: ['dec-001'] } },
    }),
    sessionView('ses-0003', {
      finished: 'replaced', opened: moment(9), changed: moment(15),
      invocations: [
        segment('ses-0003', 'inv-0003', 9, 10),
        segment('ses-0003', 'inv-0005', 13, 14, {
          start: 'continued', continues: { from: { session: 'ses-0003', invocation: 'inv-0003' }, reason: 'iteration-closed', briefs: [] },
        }),
      ],
      suspended: [{ from: moment(10), until: moment(13) }, { from: moment(14), until: moment(15) }],
      lineage: { ...noLineage, replacedBy: 'ses-0005', requested: ['ses-0004'] },
    }),
    sessionView('ses-0004', {
      role: 'contract-engineer', finished: 'work-closed', opened: moment(11), changed: moment(12),
      invocations: [segment('ses-0004', 'inv-0004', 11, 12, { kept: false })],
      lineage: { ...noLineage, requestedBy: { invocation: 'inv-0003', reason: 'contract-needed', session: 'ses-0003' } },
    }),
    sessionView('ses-0005', {
      state: 'live', finished: null, opened: moment(16), changed: moment(16), awaiting: 'inv-0006',
      invocations: [segment('ses-0005', 'inv-0006', 16, null)],
      lineage: { ...noLineage, replaces: { session: 'ses-0003', reason: 'reconstructed' } },
    }),
  ];
}

export function lineageAnswer(sessions: RunSessionView[] = lineageSessions(), version = 16): RunSessionsResponse {
  return { version, sessions, total: sessions.length };
}
