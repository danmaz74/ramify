import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { decision as decisionBody, forkDecision, localDecision, registryChange, requestPlacement } from './helpers/placement.js';
import { addModule, assign, byRole, completionProposed, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { accepted, added, answeredGit, modified, unchanged } from './helpers/contracts-git.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
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
 * is not fresh names the harness point it starts from and its reason.
 *
 * Git is external and answered from this file's own data, as are the gate's
 * commands; nothing here simulates a transition.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0)) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const consumer = 'collection-review/workspace/reviews/notes';
const consumerDirectory = 'subs/workspace/subs/reviews/subs/notes';
const provider = 'collection-review/workspace/reviews/limits';
const providerDirectory = 'subs/workspace/subs/reviews/subs/limits';

const lines = (...parts: string[]) => `${parts.join('\n')}\n`;

const stub = lines('export function addNote(note) {', '  throw new Error(\'the note limit is not available here yet\');', '}');
const consumerTest = lines(
  "import { test, expect } from 'vitest';",
  "import { addNote } from '../notes.ts';",
  "test('a note within the limit is kept', () => { expect(addNote('a short note')).toBe('a short note'); });",
  "test('a note over the limit is refused', () => { expect(addNote('x'.repeat(501))).toBe(''); });",
);
const contractFile = lines(
  '/** A note of at most 500 characters is within the limit. */',
  "export const noteLimitCases = [{ note: 'a short note', within: true }, { note: 'x'.repeat(501), within: false }];",
);
const fakeFile = lines(
  "import { noteLimitCases } from '../interfaces/note-limit.ts';",
  'export function createNoteLimitFake() {',
  '  void noteLimitCases;',
  '  return { withinLimit: (note) => note.length <= 500 };',
  '}',
);
const subjectsFile = lines(
  "import { createNoteLimitFake } from '../fakes/note-limit.fake.ts';",
  "export const subjects = [{ name: 'the fake', create: createNoteLimitFake }];",
);
const conformanceFile = lines(
  "import { test, expect } from 'vitest';",
  "import { noteLimitCases } from '../interfaces/note-limit.ts';",
  "import { subjects } from './note-limit.subjects.ts';",
  'for (const subject of subjects) for (const agreed of noteLimitCases) {',
  "  test(subject.name + ' answers ' + agreed.within, () => { expect(subject.create().withinLimit(agreed.note)).toBe(agreed.within); });",
  '}',
);
const integrated = lines(
  "import { createNoteLimitFake } from '../../limits/src/fakes/note-limit.fake.ts';",
  'const limit = createNoteLimitFake();',
  "export function addNote(note) { return limit.withinLimit(note) ? note : ''; }",
);
const realProvider = lines('export function createNoteLimit() {', '  return { withinLimit: (note) => note.length <= 500 };', '}');
const bothSubjects = lines(
  "import { createNoteLimitFake } from '../fakes/note-limit.fake.ts';",
  "import { createNoteLimit } from '../note-limit.ts';",
  "export const subjects = [{ name: 'the fake', create: createNoteLimitFake }, { name: 'the real provider', create: createNoteLimit }];",
);
const verified = lines(
  "import { createNoteLimit } from '../../limits/src/note-limit.ts';",
  'const limit = createNoteLimit();',
  "export function addNote(note) { return limit.withinLimit(note) ? note : ''; }",
);

const seam = {
  interface: `${providerDirectory}/src/interfaces/note-limit.ts`,
  fake: `${providerDirectory}/src/fakes/note-limit.fake.ts`,
  subjects: `${providerDirectory}/src/tests/note-limit.subjects.ts`,
  conformance: `${providerDirectory}/src/tests/note-limit.conformance.test.ts`,
  real: `${providerDirectory}/src/note-limit.ts`,
  consumer: `${consumerDirectory}/src/notes.ts`,
};

const contractNeeded = {
  kind: 'contract-needed' as const,
  need: {
    capability: 'note-limit',
    useCases: ['a reviewer attaches a note to a review run, and a note over the limit is refused'],
    inputs: ['the note text'],
    outputs: ['whether the note is within the limit'],
    sideEffects: [],
    constraints: ['at most 500 characters'],
    existingEvidence: [`${consumerDirectory}/src/tests/notes.test.ts`],
  },
  suggestedProvider: provider,
  summary: 'The note limit is not behavior this module owns, so nothing here was changed.',
};

const establishedContract = {
  kind: 'established' as const,
  mode: 'fake-backed' as const,
  authority: { kind: 'provider' as const, owner: provider, rationale: 'The note limit is a capability of its own, so its contract belongs with its provider.' },
  provider,
  behavior: 'A note of at most 500 characters is within the limit; a longer one is not.',
  artifacts: {
    interface: [{ path: seam.interface, exports: ['noteLimitCases'] }],
    conformance: [{ path: seam.conformance }],
    fake: [{ path: seam.fake, exports: ['createNoteLimitFake'] }],
    exposure: [{ path: `${providerDirectory}/module.ramify`, declaration: 'expose-src noteLimitCases from "interfaces/note-limit.ts" to parent' }],
  },
  fakeInjections: [seam.consumer],
  summary: 'The note limit is agreed, the consumer runs against its fake, and the conformance suite states what the provider owes.',
};

const placeTheLimit = localDecision(
  {
    question: 'Where does the note limit belong?',
    outcome: 'reuse',
    capability: 'note-limit',
    owner: provider,
    rationale: 'The limit is a rule of its own, and this subtree is mine to place work in.',
  },
  [registryChange({ capability: 'note-limit', owner: provider, behavior: 'A note of at most 500 characters is within the limit.' })],
);

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, consumerDirectory, 'notes', { 'src/notes.ts': stub, 'src/tests/notes.test.ts': consumerTest });
  await addModule(fixture.root, providerDirectory, 'limits', {});
  await installMiniRunner(fixture.root);
  return fixture.root;
}

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
    const root = await target();
    const git = answeredGit(root, {
      head: 'revision-00',
      commits: [
        accepted('wi-001.i02', 'revision-01', [...added(seam.interface, seam.fake, seam.subjects, seam.conformance), ...modified(seam.consumer)]),
        // The provider's first attempt commits its work and fails; the
        // repair it is continued for finds the tree unchanged, and passes.
        accepted('wi-002.i01', 'revision-02', [...added(seam.real), ...modified(seam.subjects)]),
        unchanged('wi-002.i01'),
        unchanged('wi-002'),
        accepted('wi-001.i03', 'revision-03', modified(seam.consumer)),
        unchanged('wi-001'),
        unchanged('final verification of plan "review-notes"'),
      ],
    });
    let providerAttempt: string | undefined;
    const opened = await openRuns(root, {
      git,
      inputs: treeInputs(),
      readinessExecution: directReadinessExecution(),
      model: 'provider/model-7',
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-notes', consumer)]))],
        'local-architect': [
          // The consumer asks where its own capability belongs; the global
          // fork decides, and the same architect is continued.
          submit(requestPlacement({ forCapability: 'review-notes', question: 'Is the reviewer note the notes module\'s own?' })),
          submit({ ...assign(consumer, {}, outline()), localDecisions: [placeTheLimit] }),
          submit({ kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'The consumer runs against the fake and waits for the real limit.' }),
          // The provider work item the registration started.
          submit(assign(provider, {}, outline({ changes: 'Implement the agreed limit and run the conformance suite against it.' }))),
          submit(requestCompletion()),
          // The consumer, resumed in a session of its own.
          submit(assign(consumer, { kind: 'verification', goal: 'Replace the fake with the real note limit and rerun the behavior.' })),
          submit(requestCompletion()),
        ],
        'global-fork': [submit(forkDecision({
          decision: decisionBody({ capability: 'review-notes', owner: consumer, rationale: 'The reviewer note is what the notes module is for.' }),
          brief: 'The reviewer note stays with the notes module.',
        }))],
        engineer: [
          submit(contractNeeded),
          submit(completionProposed('The real note limit is implemented.'), write(seam.real, realProvider), write(seam.subjects, bothSubjects)),
          submit(completionProposed('The failing suite passes now; nothing else needed changing.')),
          submit(completionProposed('The consumer now uses the real note limit.'), write(seam.consumer, verified)),
        ],
        'contract-engineer': [submit(establishedContract,
          write(seam.interface, contractFile), write(seam.fake, fakeFile), write(seam.subjects, subjectsFile),
          write(seam.conformance, conformanceFile), write(seam.consumer, integrated))],
      }),
      checkScript: ({ check, context }) => {
        if (context.checkpoint !== 'iteration') return {};
        providerAttempt ??= context.attemptId;
        return context.attemptId === providerAttempt && check.kind === 'tests'
          ? { outcome: { kind: 'completed', exitCode: 1 }, stderr: 'not ok\n' }
          : {};
      },
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    git.assertAnswered();

    const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
    expect(trace(events)).toEqual([
      'ses-0001 opened: initial-architect | ses-0001 live',
      'inv-0001 opens ses-0001 | ses-0001 live',
      'inv-0001 ended, ses-0001 kept | ses-0001 suspended',
      // The consumer's architect, and the fork of the architect context it
      // asked for. The fork leaves its source suspended.
      'ses-0002 opened: local-architect wi-001 | ses-0001 suspended, ses-0002 live',
      'inv-0002 opens ses-0002 | ses-0001 suspended, ses-0002 live',
      'inv-0002 ended, ses-0002 kept | ses-0001 suspended, ses-0002 suspended',
      'ses-0003 opened: global-fork wi-001, forked from ses-0001 at inv-0001 (placement-request, generation 1, briefs []) | ses-0001 suspended, ses-0002 suspended, ses-0003 live',
      'inv-0003 opens ses-0003 | ses-0001 suspended, ses-0002 suspended, ses-0003 live',
      'inv-0003 ended, ses-0003 finished: not-kept | ses-0001 suspended, ses-0002 suspended',
      'gd-001 appended to ses-0001 | ses-0001 suspended, ses-0002 suspended',
      // The same architect, continued: it assigns the iteration whose need
      // opens the contract sub-session.
      'inv-0004 continues ses-0002 from ses-0002 at inv-0002 (placement-answered) | ses-0001 suspended, ses-0002 live',
      'inv-0004 ended, ses-0002 kept | ses-0001 suspended, ses-0002 suspended',
      'ses-0004 opened: engineer wi-001 | ses-0001 suspended, ses-0002 suspended, ses-0004 live',
      'inv-0005 opens ses-0004 | ses-0001 suspended, ses-0002 suspended, ses-0004 live',
      'inv-0005 ended, ses-0004 finished: work-closed | ses-0001 suspended, ses-0002 suspended',
      'ses-0005 opened: contract-engineer wi-001, requested by inv-0005 (contract-needed) | ses-0001 suspended, ses-0002 suspended, ses-0005 live',
      'inv-0006 opens ses-0005 | ses-0001 suspended, ses-0002 suspended, ses-0005 live',
      'inv-0006 ended, ses-0005 kept | ses-0001 suspended, ses-0002 suspended, ses-0005 suspended',
      'ses-0005 finished: work-closed | ses-0001 suspended, ses-0002 suspended',
      // The yield ends the consumer architect's use.
      'inv-0007 continues ses-0002 from ses-0002 at inv-0004 (iteration-closed) | ses-0001 suspended, ses-0002 live',
      'inv-0007 ended, ses-0002 finished: not-kept | ses-0001 suspended',
      // The provider: its engineer is kept after the failing gate and
      // continued for the repair.
      'ses-0006 opened: local-architect wi-002 | ses-0001 suspended, ses-0006 live',
      'inv-0008 opens ses-0006 | ses-0001 suspended, ses-0006 live',
      'inv-0008 ended, ses-0006 kept | ses-0001 suspended, ses-0006 suspended',
      'ses-0007 opened: engineer wi-002 | ses-0001 suspended, ses-0006 suspended, ses-0007 live',
      'inv-0009 opens ses-0007 | ses-0001 suspended, ses-0006 suspended, ses-0007 live',
      'inv-0009 ended, ses-0007 kept | ses-0001 suspended, ses-0006 suspended, ses-0007 suspended',
      'inv-0010 continues ses-0007 from ses-0007 at inv-0009 (repair) | ses-0001 suspended, ses-0006 suspended, ses-0007 live',
      'inv-0010 ended, ses-0007 kept | ses-0001 suspended, ses-0006 suspended, ses-0007 suspended',
      'ses-0007 finished: work-closed | ses-0001 suspended, ses-0006 suspended',
      'inv-0011 continues ses-0006 from ses-0006 at inv-0008 (iteration-closed) | ses-0001 suspended, ses-0006 live',
      'inv-0011 ended, ses-0006 kept | ses-0001 suspended, ses-0006 suspended',
      'ses-0006 finished: work-closed | ses-0001 suspended',
      // The consumer, resumed, in a session of its own.
      'ses-0008 opened: local-architect wi-001 | ses-0001 suspended, ses-0008 live',
      'inv-0012 opens ses-0008 | ses-0001 suspended, ses-0008 live',
      'inv-0012 ended, ses-0008 kept | ses-0001 suspended, ses-0008 suspended',
      'ses-0009 opened: engineer wi-001 | ses-0001 suspended, ses-0008 suspended, ses-0009 live',
      'inv-0013 opens ses-0009 | ses-0001 suspended, ses-0008 suspended, ses-0009 live',
      'inv-0013 ended, ses-0009 kept | ses-0001 suspended, ses-0008 suspended, ses-0009 suspended',
      'ses-0009 finished: work-closed | ses-0001 suspended, ses-0008 suspended',
      'inv-0014 continues ses-0008 from ses-0008 at inv-0012 (iteration-closed) | ses-0001 suspended, ses-0008 live',
      'inv-0014 ended, ses-0008 kept | ses-0001 suspended, ses-0008 suspended',
      'ses-0008 finished: work-closed | ses-0001 suspended',
      // Run end finishes the architect context the run kept.
      'ses-0001 finished: run-ended | none open',
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
    expect((await invocation('inv-0003')).session).toMatchObject({ requested: 'fork', actual: 'fork' });
    expect(await invocation('inv-0010')).toMatchObject({ work: { iteration: 'wi-002.i01' }, attempt: 2, session: { requested: 'continued' } });
    const gates = events.flatMap(event => (event.type === 'gate-attempted' && event.data.checkpoint === 'iteration' ? [[event.data.verdict, event.data.next]] : []));
    expect(gates).toEqual([['failed', 'repair'], ['passed', 'accept'], ['passed', 'accept']]);
    // The work each session is for is the work of its invocations.
    expect(sessions.get('ses-0007')!.work).toEqual({ workItem: 'wi-002', iteration: 'wi-002.i01' });
    expect(sessions.get('ses-0003')!.work).toEqual({ workItem: 'wi-001', request: 'pr-001' });

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
    expect(sessions.get('ses-0003')!.fork).toEqual({ from: { session: 'ses-0001', invocation: 'inv-0001' }, reason: 'placement-request', generation: 1, briefs: [] });
    expect(sessions.get('ses-0005')!.requestedBy).toEqual({ invocation: 'inv-0005', reason: 'contract-needed' });
    expect(events.find(event => event.type === 'contract-requested')!.data).toMatchObject({ invocation: 'inv-0005', iteration: 'wi-001.i02' });

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
