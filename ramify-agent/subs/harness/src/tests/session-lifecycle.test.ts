import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { runPath } from './helpers/runs.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { runSessionScenario } from './helpers/session-scenario.js';
import type { RunEvent } from '../run/log.js';
import { runLayout, type Invocation, type InvocationOutcome } from '../run/records.js';
import { applySessionEvent, pointLabel, reduceSessions, sessionEventTypes, type RunSessions } from '../run/sessions.js';
import { standaloneSessionState, type SessionOutcomeRecord } from '../sessions/records.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * The sessions of one scripted run, derived from its log after every event:
 * a local architect continued across a placement request, an iteration and
 * a yield; a global fork of the architect context, whose brief is appended
 * back to it; an engineer iteration whose need opens a contract sub-session;
 * a provider engineer continued for a repair after its first gate failed;
 * and the resumed consumer's fresh architect. Every invocation belongs to a
 * session, and the final run holds no suspended session. Every start that
 * is not fresh names the harness point it starts from and its reason. The
 * run is `helpers/session-scenario.ts`'s.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0)) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

/** One line per session event: the event, and then every session that is not finished, with its state. */
function trace(events: readonly RunEvent[]): string[] {
  const read = new Set<string>(sessionEventTypes);
  const lines: string[] = [];
  let sessions: RunSessions = new Map();
  for (const event of events) {
    const after = applySessionEvent(sessions, event);
    if (!read.has(event.type)) {
      // Every other event leaves every session as it was.
      expect(after).toBe(sessions);
      continue;
    }
    sessions = after;
    const open = [...sessions.values()].filter(session => session.state !== 'finished').map(session => `${session.id} ${session.state}`);
    lines.push(`${label(event)} | ${open.join(', ') || 'none open'}`);
  }
  return lines;
}

/** One session event, with the lineage relation it records. */
function label(event: RunEvent): string {
  switch (event.type) {
    case 'session-opened': {
      const { fork, replaces, requestedBy } = event.data;
      return `${event.data.session} opened: ${event.data.role}${event.data.work.workItem === undefined ? '' : ` ${event.data.work.workItem}`}`
        + (fork === undefined ? '' : `, forked from ${pointLabel(fork.from)} (${fork.reason}, generation ${fork.generation}, briefs [${fork.briefs.join(', ')}])`)
        + (replaces === undefined ? '' : `, replacing ${replaces.session} (${replaces.reason})`)
        + (requestedBy === undefined ? '' : `, requested by ${requestedBy.invocation} (${requestedBy.reason})`);
    }
    case 'invocation-started': {
      const continues = event.data.continues;
      return `${event.data.invocation} ${event.data.start === 'opened' ? 'opens' : 'continues'} ${event.data.session}`
        + (continues === undefined ? '' : ` from ${pointLabel(continues.from)} (${continues.reason}${continues.briefs.length === 0 ? '' : `, briefs [${continues.briefs.join(', ')}]`})`);
    }
    case 'invocation-ended': return `${event.data.invocation} ended, ${event.data.session} ${event.data.kept ? 'kept' : `finished: ${event.data.finished}`}`
      + (event.data.degraded === undefined ? '' : `, degraded from ${event.data.degraded.requested} to ${event.data.degraded.actual}`);
    case 'brief-appended': return `${event.data.decision} appended to ${event.data.session}`;
    case 'session-finished': return `${event.data.session} finished: ${event.data.reason}`;
    default: return event.type;
  }
}

describe('ST01, ST02, ST03: the sessions of a scripted run', () => {
  test('a continued local architect, a global fork, a contract sub-session and a repaired engineer derive the expected state after every event', async () => {
    const { root, runId, events } = await runSessionScenario({ cleanup: step => { cleanups.push(step); } });
    const receipt = { jobId: runId };
    // A fixed lineage trace checks every derived state after each session event,
    // including the analysis's intake and check sessions, the two selector
    // forks and the parent continuations they license.
    expect(trace(events)).toEqual([
      "ses-0001 opened: catalog-extractor | ses-0001 live",
      "inv-0001 opens ses-0001 | ses-0001 live",
      "inv-0001 ended, ses-0001 finished: not-kept | none open",
      "ses-0002 opened: initial-architect | ses-0002 live",
      "inv-0002 opens ses-0002 | ses-0002 live",
      "inv-0002 ended, ses-0002 kept | ses-0002 suspended",
      "ses-0003 opened: catalog-extractor | ses-0002 suspended, ses-0003 live",
      "inv-0003 opens ses-0003 | ses-0002 suspended, ses-0003 live",
      "inv-0003 ended, ses-0003 finished: not-kept | ses-0002 suspended",
      "ses-0004 opened: local-architect wi-001 | ses-0002 suspended, ses-0004 live",
      "inv-0004 opens ses-0004 | ses-0002 suspended, ses-0004 live",
      "inv-0004 ended, ses-0004 kept | ses-0002 suspended, ses-0004 suspended",
      "ses-0005 opened: context-selector wi-001, forked from ses-0004 at inv-0004 (context-selection, generation undefined, briefs []) | ses-0002 suspended, ses-0004 suspended, ses-0005 live",
      "inv-0005 opens ses-0005 | ses-0002 suspended, ses-0004 suspended, ses-0005 live",
      "inv-0005 ended, ses-0005 finished: not-kept | ses-0002 suspended, ses-0004 suspended",
      "inv-0006 continues ses-0004 from ses-0004 at inv-0004 (context-selected) | ses-0002 suspended, ses-0004 live",
      "inv-0006 ended, ses-0004 kept | ses-0002 suspended, ses-0004 suspended",
      "ses-0006 opened: global-fork wi-001, forked from ses-0002 at inv-0002 (placement-request, generation 1, briefs []) | ses-0002 suspended, ses-0004 suspended, ses-0006 live",
      "inv-0007 opens ses-0006 | ses-0002 suspended, ses-0004 suspended, ses-0006 live",
      "inv-0007 ended, ses-0006 finished: not-kept | ses-0002 suspended, ses-0004 suspended",
      "gd-001 appended to ses-0002 | ses-0002 suspended, ses-0004 suspended",
      "inv-0008 continues ses-0004 from ses-0004 at inv-0006 (placement-answered) | ses-0002 suspended, ses-0004 live",
      "inv-0008 ended, ses-0004 kept | ses-0002 suspended, ses-0004 suspended",
      "ses-0007 opened: engineer wi-001 | ses-0002 suspended, ses-0004 suspended, ses-0007 live",
      "inv-0009 opens ses-0007 | ses-0002 suspended, ses-0004 suspended, ses-0007 live",
      "inv-0009 ended, ses-0007 finished: work-closed | ses-0002 suspended, ses-0004 suspended",
      "ses-0008 opened: contract-engineer wi-001, requested by inv-0009 (contract-needed) | ses-0002 suspended, ses-0004 suspended, ses-0008 live",
      "inv-0010 opens ses-0008 | ses-0002 suspended, ses-0004 suspended, ses-0008 live",
      "inv-0010 ended, ses-0008 kept | ses-0002 suspended, ses-0004 suspended, ses-0008 suspended",
      "ses-0008 finished: work-closed | ses-0002 suspended, ses-0004 suspended",
      "inv-0011 continues ses-0004 from ses-0004 at inv-0008 (iteration-closed) | ses-0002 suspended, ses-0004 live",
      "inv-0011 ended, ses-0004 finished: not-kept | ses-0002 suspended",
      "ses-0009 opened: local-architect wi-002 | ses-0002 suspended, ses-0009 live",
      "inv-0012 opens ses-0009 | ses-0002 suspended, ses-0009 live",
      "inv-0012 ended, ses-0009 kept | ses-0002 suspended, ses-0009 suspended",
      "ses-0010 opened: context-selector wi-002, forked from ses-0009 at inv-0012 (context-selection, generation undefined, briefs []) | ses-0002 suspended, ses-0009 suspended, ses-0010 live",
      "inv-0013 opens ses-0010 | ses-0002 suspended, ses-0009 suspended, ses-0010 live",
      "inv-0013 ended, ses-0010 finished: not-kept | ses-0002 suspended, ses-0009 suspended",
      "inv-0014 continues ses-0009 from ses-0009 at inv-0012 (context-selected) | ses-0002 suspended, ses-0009 live",
      "inv-0014 ended, ses-0009 kept | ses-0002 suspended, ses-0009 suspended",
      "ses-0011 opened: engineer wi-002 | ses-0002 suspended, ses-0009 suspended, ses-0011 live",
      "inv-0015 opens ses-0011 | ses-0002 suspended, ses-0009 suspended, ses-0011 live",
      "inv-0015 ended, ses-0011 kept | ses-0002 suspended, ses-0009 suspended, ses-0011 suspended",
      "inv-0016 continues ses-0011 from ses-0011 at inv-0015 (repair) | ses-0002 suspended, ses-0009 suspended, ses-0011 live",
      "inv-0016 ended, ses-0011 kept | ses-0002 suspended, ses-0009 suspended, ses-0011 suspended",
      "ses-0011 finished: work-closed | ses-0002 suspended, ses-0009 suspended",
      "inv-0017 continues ses-0009 from ses-0009 at inv-0014 (iteration-closed) | ses-0002 suspended, ses-0009 live",
      "inv-0017 ended, ses-0009 kept | ses-0002 suspended, ses-0009 suspended",
      "ses-0009 finished: work-closed | ses-0002 suspended",
      "ses-0012 opened: local-architect wi-001 | ses-0002 suspended, ses-0012 live",
      "inv-0018 opens ses-0012 | ses-0002 suspended, ses-0012 live",
      "inv-0018 ended, ses-0012 kept | ses-0002 suspended, ses-0012 suspended",
      "ses-0013 opened: engineer wi-001 | ses-0002 suspended, ses-0012 suspended, ses-0013 live",
      "inv-0019 opens ses-0013 | ses-0002 suspended, ses-0012 suspended, ses-0013 live",
      "inv-0019 ended, ses-0013 kept | ses-0002 suspended, ses-0012 suspended, ses-0013 suspended",
      "ses-0013 finished: work-closed | ses-0002 suspended, ses-0012 suspended",
      "inv-0020 continues ses-0012 from ses-0012 at inv-0018 (iteration-closed) | ses-0002 suspended, ses-0012 live",
      "inv-0020 ended, ses-0012 kept | ses-0002 suspended, ses-0012 suspended",
      "ses-0012 finished: work-closed | ses-0002 suspended",
      "ses-0002 finished: run-ended | none open",
    ]);

    // Every invocation belongs to exactly one session.
    const sessions = reduceSessions(events);
    const started = events.filter(event => event.type === 'invocation-started').map(event => event.data.invocation);
    expect([...sessions.values()].flatMap(session => session.invocations).sort()).toEqual([...started].sort());
    // The final run holds no suspended session, and every one of them
    // records its executor and the model it was asked for.
    expect([...sessions.values()].every(session => session.state === 'finished')).toBe(true);
    expect(new Set([...sessions.values()].map(session => `${session.executor} ${session.model}`))).toEqual(new Set(['scripted provider/model-7']));
    // The session-finished of run end precedes the run's final event.
    expect(events.slice(-2).map(event => event.type)).toEqual(['session-finished', 'job-completed']);
    // The fork is a fork of the architect context, and the repair a
    // continuation of the engineer whose gate failed.
    const invocation = async (id: string) => JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.invocation(id)), 'utf8')) as Invocation;
    expect((await invocation('inv-0007')).session).toMatchObject({ requested: 'fork', actual: 'fork' });
    expect(await invocation('inv-0016')).toMatchObject({ work: { iteration: 'wi-002.i01' }, attempt: 2, session: { requested: 'continued' } });
    const gates = events.flatMap(event => (event.type === 'gate-attempted' && event.data.checkpoint === 'iteration' ? [[event.data.verdict, event.data.next]] : []));
    expect(gates).toEqual([['failed', 'repair'], ['passed', 'accept'], ['passed', 'accept']]);
    // The work each session is for is the work of its invocations.
    expect(sessions.get('ses-0011')!.work).toEqual({ workItem: 'wi-002', iteration: 'wi-002.i01' });
    expect(sessions.get('ses-0006')!.work).toEqual({ workItem: 'wi-001', request: 'pr-001' });

    // ST03: every start that is not fresh names its harness point and its
    // reason. A continuation names its own session's previous invocation, a
    // fork the architect context's point, and the contract sub-session the
    // engineer invocation whose need opened it.
    for (const event of events) {
      if (event.type === 'invocation-started' && event.data.start === 'continued') {
        expect(event.data.continues, event.data.invocation).toMatchObject({ from: { session: event.data.session }, reason: expect.any(String) });
      }
    }
    const requested = new Map<string, string>();
    for (const event of events) {
      if (event.type !== 'invocation-started') continue;
      requested.set(event.data.session, (await invocation(event.data.invocation)).session.requested);
    }
    for (const session of sessions.values()) {
      expect([session.id, session.fork === null], session.id).toEqual([session.id, requested.get(session.id) !== 'fork']);
    }
    expect(sessions.get('ses-0006')!.fork).toEqual({ from: { session: 'ses-0002', invocation: 'inv-0002' }, reason: 'placement-request', generation: 1, briefs: [] });
    expect(sessions.get('ses-0008')!.requestedBy).toEqual({ invocation: 'inv-0009', reason: 'contract-needed' });
    expect(events.find(event => event.type === 'contract-requested')!.data).toMatchObject({ invocation: 'inv-0009', iteration: 'wi-001.i02' });

    // No relation names an executor's ref: every ref the executor handed
    // back is absent from the lineage the log records.
    const refs = new Set<string>();
    for (const event of events) {
      if (event.type === 'brief-appended') refs.add(event.data.ref);
      if (event.type !== 'invocation-ended') continue;
      const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.outcome(event.data.invocation)), 'utf8')) as InvocationOutcome;
      if (outcome.session !== undefined) refs.add(outcome.session.ref);
    }
    expect(refs.size).toBeGreaterThan(10);
    const lineage = JSON.stringify(events.flatMap((event): unknown[] => {
      if (event.type === 'session-opened') return [event.data.fork, event.data.replaces, event.data.requestedBy];
      if (event.type === 'invocation-started') return [event.data.continues];
      if (event.type === 'invocation-ended') return [event.data.degraded];
      return [];
    }).filter(relation => relation !== undefined));
    for (const ref of refs) expect(lineage).not.toContain(ref);
  }, 180_000);
});

describe('a standalone session', () => {
  test('is finished once its outcome is written, and interrupted without one', () => {
    expect(standaloneSessionState({ session: 'x' } as unknown as SessionOutcomeRecord)).toBe('finished');
    expect(standaloneSessionState(null)).toBe('interrupted');
  });
});
