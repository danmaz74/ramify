import { appendFile, readFile, rename, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent, type ScriptStep } from '../../subs/agent/src/scripted.js';
import { createApp } from '../http/app.js';
import { startServerWith } from '../http/server.js';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { metricsResponseSchema } from '../interfaces/protocol/runs.js';
import {
  runSessionsResponseSchema, sessionBodyResponseSchema, sessionListResponseSchema, sessionTranscriptResponseSchema,
  sessionUpdatesResponseSchema, standaloneSessionResponseSchema,
  type RunSessionView, type SessionCursor, type SessionRef,
} from '../interfaces/protocol/sessions.js';
import type { TranscriptBody, TranscriptEntry } from '../interfaces/protocol/transcripts.js';
import { runLayout } from '../run/records.js';
import { reduceSessions } from '../run/sessions.js';
import { sessionLayout, sessionsDirectory } from '../sessions/records.js';
import { runSingleSession } from '../sessions/single.js';
import { ContentStore } from '../transcripts/store.js';
import { readTranscript } from '../transcripts/writer.js';
import { commandResult } from './helpers/command-result.js';
import { createDirectCheckExecution } from './helpers/direct-check-execution.js';
import { expectNoProcesses, forgetExternalTools, openRunsWithoutProcesses } from './helpers/external-tools.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { copyFixture } from './helpers/fixture.js';
import { readDeclaredTree, shell, treeInputs, unsuitableScope } from './helpers/iterations.js';
import { mockGit } from './helpers/mock-git.js';
import { emptyAnalysis, runEventsOnDisk, runPath, startRun, stopRun, testPolicy, until } from './helpers/runs.js';
import { scriptedGit } from './helpers/scripted-git.js';
import { runSessionScenario } from './helpers/session-scenario.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * The session queries over HTTP, read by a plain Node client: `fetch` and
 * the protocol's schemas.
 *
 * A scripted run whose sessions take every relation, and two standalone
 * sessions, one finished and one whose harness died before its outcome,
 * are listed, derived and read back through their transcripts and bodies.
 * A run followed while it runs is polled with cursors: the poll answers
 * only entries after each cursor and reports a state change in the poll
 * after it is committed.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const plan = 'review-notes';
const notes = 'collection-review/workspace/reviews/notes';

async function get(origin: string, path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${origin}${path}`);
  return { status: response.status, body: await response.json() };
}

async function ok<T>(origin: string, path: string, schema: { parse(value: unknown): T }): Promise<T> {
  const { status, body } = await get(origin, path);
  expect([path, status]).toEqual([path, 200]);
  return schema.parse(body);
}

async function refused(origin: string, path: string): Promise<[number, string]> {
  const { status, body } = await get(origin, path);
  return [status, errorResponseSchema.parse(body).error.code];
}

/** One engineer session on the notes module, on the scripted fake; Git and the commands are answered. */
async function standaloneSession(root: string, steps: readonly ScriptStep[]): Promise<string> {
  const result = await runSingleSession({
    projectRoot: root,
    module: notes,
    prompt: 'Raise the note limit to 500.',
    agent: createScriptedAgent(steps),
    ramify: new FakeRamifyCli(),
    git: mockGit({ currentHead: async () => 'standalone-base', changedPaths: async () => [] }),
    checkExecution: createDirectCheckExecution({ script: [] }),
    commandExecution: async request => commandResult(request, { stdout: 'checking\n' }),
    refresh: readDeclaredTree,
    policy: testPolicy(root),
  });
  if (result.status !== 'finished') throw new Error(`The standalone session did not start: ${result.reason}`);
  return result.summary.session;
}

/** Every `file` body an entry names. */
function fileBodies(entry: TranscriptEntry): string[] {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node === null || typeof node !== 'object') return;
    const body = node as TranscriptBody;
    if (body.stored === 'file') found.push(body.path);
    Object.values(node).forEach(walk);
  };
  walk(entry);
  return found;
}

describe('ST09: the project\'s sessions, a run\'s sessions, their transcripts and bodies', () => {
  test('a scripted run and two standalone sessions, one finished and one interrupted, read over HTTP', async () => {
    const scenario = await runSessionScenario({ cleanup: step => { cleanups.push(step); } });
    const { root, runId, events } = scenario;
    // The standalone sessions take the project lock, as the server does.
    await scenario.service.close();
    const finished = await standaloneSession(root, [shell('echo checking'), { kind: 'submit', input: unsuitableScope('The limit lives elsewhere.') }]);
    const crashed = await standaloneSession(root, [{ kind: 'submit', input: unsuitableScope() }]);
    // The harness died before it wrote the outcome, which it writes last.
    await rm(join(root, sessionsDirectory, crashed, sessionLayout.outcome));

    const server = await startServerWith({
      projectRoot: root, port: 0, assetsDirectory: join(root, 'no-such-build'), ramify: new FakeRamifyCli(),
      runs: { inputs: treeInputs(), warn: () => undefined },
    });
    cleanups.push(() => server.close());
    const origin = server.url;
    const sessions = reduceSessions(events);

    // The project's list: every run session and both standalone sessions,
    // ordered by last change since none is live or suspended.
    const list = await ok(origin, protocolPaths.sessions(), sessionListResponseSchema);
    expect([list.total, list.offset, list.next, list.unserved]).toEqual([sessions.size + 2, 0, null, []]);
    const times = list.sessions.map(entry => Date.parse(entry.changedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    const standalone = list.sessions.filter(entry => entry.ref.source === 'standalone');
    expect(standalone.map(entry => [entry.ref.session, entry.state, entry.finished, entry.executor, entry.model, entry.reaches]).sort()).toEqual([
      [crashed, 'interrupted', null, 'scripted', null, { kind: 'module', module: notes }],
      [finished, 'finished', null, 'scripted', null, { kind: 'module', module: notes }],
    ].sort());
    for (const session of sessions.values()) {
      const entry = list.sessions.find(candidate => candidate.ref.source === 'run' && candidate.ref.session === session.id);
      expect(entry, session.id).toMatchObject({
        ref: { source: 'run', planId: plan, runId }, state: 'finished', finished: session.finished, role: session.role, work: session.work,
        executor: 'scripted', model: 'provider/model-7', invocations: session.invocations.length,
        startedAt: session.opened.at, changedAt: session.changed.at,
      });
    }
    expect(await refused(origin, '/api/v1/sessions?offset=x')).toEqual([400, 'invalid-request']);
    expect((await ok(origin, protocolPaths.sessions(list.total), sessionListResponseSchema)).sessions).toEqual([]);

    // The run's sessions: state, lineage, points and the elements each reaches.
    const answer = await ok(origin, protocolPaths.runSessions(plan, runId), runSessionsResponseSchema);
    expect([answer.version, answer.total]).toEqual([events.at(-1)!.sequence, sessions.size]);
    const views = new Map(answer.sessions.map(view => [view.session, view]));
    expect([...views.keys()]).toEqual([...sessions.keys()]);
    for (const session of sessions.values()) {
      expect(views.get(session.id), session.id).toMatchObject({
        state: 'finished', finished: session.finished, awaiting: null, point: session.point, opened: session.opened, changed: session.changed,
        lineage: { fork: session.fork, replaces: session.replaces },
      });
      expect(views.get(session.id)!.invocations.map(invocation => invocation.invocation)).toEqual(session.invocations);
    }
    expect(views.get('ses-0001')!.reaches).toEqual({ kind: 'run' });
    const fork = [...views.values()].find(view => view.role === 'global-fork')!;
    expect(fork.reaches).toEqual({ kind: 'request', request: fork.work.request, workItem: 'wi-001', capability: 'review-notes' });
    expect(views.get('ses-0001')!.lineage.forks).toEqual([fork.session]);
    // The brief appended back to the architect context is a mark with its point.
    const appended = events.find(event => event.type === 'brief-appended')!;
    expect(views.get('ses-0001')!.appends).toEqual([expect.objectContaining({ appended: { sequence: appended.sequence, at: appended.at }, point: { session: 'ses-0001', append: appended.sequence } })]);
    const architect = [...views.values()].find(view => view.role === 'local-architect')!;
    expect(architect.reaches).toEqual({ kind: 'work-item', workItem: 'wi-001', capability: 'review-notes', module: notes });
    // A continued architect was suspended between its invocations, each gap
    // from an end that kept it to the next start.
    expect(architect.invocations.length).toBeGreaterThan(1);
    expect(architect.suspended.length).toBeGreaterThanOrEqual(architect.invocations.length - 1);
    architect.invocations.slice(1).forEach((invocation, index) => {
      expect(invocation).toMatchObject({ start: 'continued', continues: { from: architect.invocations[index]!.point } });
      expect(architect.suspended[index]).toEqual({ from: architect.invocations[index]!.ended, until: invocation.started });
    });
    // The contract sub-session names its requester and that requester's session, which lists it.
    const contract = [...views.values()].find(view => view.role === 'contract-engineer')!;
    const requester = contract.lineage.requestedBy!;
    expect(requester).toMatchObject({ reason: 'contract-needed', session: expect.stringMatching(/^ses-/) });
    expect(views.get(requester.session!)!.lineage.requested).toEqual([contract.session]);
    // The repaired engineer's second segment continues for the repair.
    expect([...views.values()].some(view => view.invocations.some(invocation => invocation.continues?.reason === 'repair'))).toBe(true);
    // Each invocation carries the evaluation the Run page's metrics show for it.
    const metrics = await ok(origin, protocolPaths.runMetrics(plan, runId), metricsResponseSchema);
    const evaluations = new Map(metrics.evaluation.invocations.map(evaluation => [evaluation.invocation, evaluation]));
    for (const invocation of answer.sessions.flatMap(view => view.invocations)) {
      expect(invocation.evaluation, invocation.invocation).toEqual(evaluations.get(invocation.invocation));
      expect(invocation.ended).not.toBeNull();
    }

    // Each transcript, page by page from a cursor: the same entries the file holds.
    const refOf = (session: string): SessionRef => ({ source: 'run', planId: plan, runId, session });
    for (const session of sessions.keys()) {
      const onDisk = (await readTranscript(scenario.path(runLayout.transcript(session)))).entries;
      const whole = await ok(origin, protocolPaths.runSessionTranscript(plan, runId, session, 0), sessionTranscriptResponseSchema);
      expect(whole).toEqual({ session: refOf(session), page: { file: 'present', entries: onDisk, cursor: onDisk.length, more: false, partial: false, unreadable: [] } });
      const rest = await ok(origin, protocolPaths.runSessionTranscript(plan, runId, session, 2), sessionTranscriptResponseSchema);
      expect(rest.page.entries).toEqual(onDisk.filter(entry => entry.n > 2));
    }
    const beyond = await ok(origin, protocolPaths.runSessionTranscript(plan, runId, 'ses-0001', 10_000), sessionTranscriptResponseSchema);
    expect(beyond.page).toMatchObject({ entries: [], cursor: 10_000, more: false });
    expect(await refused(origin, protocolPaths.runSessionTranscript(plan, runId, 'ses-0999', 0))).toEqual([404, 'not-found']);
    expect(await refused(origin, protocolPaths.runSessionTranscript(plan, runId, 'inv-0001', 0))).toEqual([404, 'not-found']);
    expect(await refused(origin, protocolPaths.runSessionTranscript(plan, '20200101T000000Z-000000', 'ses-0001', 0))).toEqual([404, 'not-found']);
    expect(await refused(origin, `${protocolPaths.runSessionTranscript(plan, runId, 'ses-0001', 0).replace('after=0', 'after=-1')}`)).toEqual([400, 'invalid-request']);

    // A stored body by its hash: the system prompt every architect shares.
    const started = (await readTranscript(scenario.path(runLayout.transcript('ses-0001')))).entries[0]!;
    expect(started.type).toBe('started');
    const prompt = (started as Extract<TranscriptEntry, { type: 'started' }>).systemPrompt;
    expect(prompt.stored).toBe('blob');
    const hash = (prompt as Extract<TranscriptBody, { stored: 'blob' }>).hash;
    const stored = await ok(origin, protocolPaths.runBody(plan, runId, hash), sessionBodyResponseSchema);
    const content = (await new ContentStore(scenario.path(runLayout.blobs)).read(hash))!;
    expect(stored).toEqual({ content, bytes: Buffer.byteLength(content), truncated: false });
    expect(await refused(origin, protocolPaths.runBody(plan, runId, '0'.repeat(64)))).toEqual([404, 'not-found']);
    expect(await refused(origin, protocolPaths.runBody(plan, runId, 'not-a-hash'))).toEqual([400, 'invalid-request']);

    // A file body the run's transcripts name, such as a hook check's log.
    const files: Array<{ session: string; path: string }> = [];
    for (const session of sessions.keys()) {
      for (const path of (await readTranscript(scenario.path(runLayout.transcript(session)))).entries.flatMap(fileBodies)) files.push({ session, path });
    }
    const file = files[0];
    expect(file, 'a run transcript names a file body').toBeDefined();
    const read = await ok(origin, protocolPaths.runSessionFile(plan, runId, file!.session, file!.path), sessionBodyResponseSchema);
    expect(read.content).toBe(await readFile(scenario.path(...file!.path.split('/')), 'utf8'));
    // Only what a transcript names, and nothing outside the run.
    for (const path of [runLayout.record, '../../../../../package.json', `${file!.path}/..`]) {
      expect(await refused(origin, protocolPaths.runSessionFile(plan, runId, file!.session, path)), path).toEqual([404, 'not-found']);
    }

    // The standalone sessions: finished with its outcome, interrupted without.
    const done = await ok(origin, protocolPaths.standaloneSession(finished), standaloneSessionResponseSchema);
    expect(done).toMatchObject({
      session: { state: 'finished', executor: 'scripted', invocations: 1 },
      prompt: 'Raise the note limit to 500.',
      outcome: { ended: 'submitted', interruption: null, error: null },
      evaluation: { invocation: finished, role: 'engineer', writer: true, ended: 'submitted', lines: { coverage: 'partial', gaps: ['a standalone session records no line events'] } },
    });
    const gone = await ok(origin, protocolPaths.standaloneSession(crashed), standaloneSessionResponseSchema);
    expect(gone).toMatchObject({ session: { state: 'interrupted' }, outcome: null, evaluation: { ended: null, usage: { unavailable: 'the invocation has not ended' } } });
    const crashedEntries = (await readTranscript(join(root, sessionsDirectory, crashed, sessionLayout.transcript))).entries;
    expect(gone.session.changedAt).toBe(crashedEntries.at(-1)!.at);
    expect(await refused(origin, protocolPaths.standaloneSession('20200101T000000Z-000000'))).toEqual([404, 'not-found']);

    const standaloneRef: SessionRef = { source: 'standalone', session: finished };
    const transcript = await ok(origin, protocolPaths.standaloneTranscript(finished, 0), sessionTranscriptResponseSchema);
    expect(transcript.session).toEqual(standaloneRef);
    expect(transcript.page.entries).toEqual((await readTranscript(join(root, sessionsDirectory, finished, sessionLayout.transcript))).entries);
    // The shell's complete output, by the path its result names.
    const output = transcript.page.entries.flatMap(fileBodies).find(path => path.startsWith('shell/'))!;
    expect(output).toBe('shell/001.log');
    expect(await ok(origin, protocolPaths.standaloneFile(finished, output), sessionBodyResponseSchema)).toEqual({ content: 'checking\n', bytes: 9, truncated: false });
    expect(await refused(origin, protocolPaths.standaloneFile(finished, sessionLayout.session))).toEqual([404, 'not-found']);
    const systemPrompt = transcript.page.entries[0] as Extract<TranscriptEntry, { type: 'started' }>;
    const blob = systemPrompt.systemPrompt as Extract<TranscriptBody, { stored: 'blob' }>;
    expect((await ok(origin, protocolPaths.standaloneBody(finished, blob.hash), sessionBodyResponseSchema)).bytes).toBe(blob.bytes);

    // A transcript whose file is missing is answered as missing; a complete
    // line that is not JSON is skipped and reported by its line number.
    const lines = (await readFile(scenario.path(runLayout.transcript('ses-0002')), 'utf8')).split('\n').filter(Boolean).length;
    await appendFile(scenario.path(runLayout.transcript('ses-0002')), 'not a JSON value\n');
    const damaged = await ok(origin, protocolPaths.runSessionTranscript(plan, runId, 'ses-0002', 0), sessionTranscriptResponseSchema);
    expect([damaged.page.entries.length, damaged.page.unreadable]).toEqual([lines, [lines + 1]]);
    await rename(scenario.path(runLayout.transcript('ses-0002')), scenario.path('transcripts', 'moved.jsonl'));
    const missing = await ok(origin, protocolPaths.runSessionTranscript(plan, runId, 'ses-0002', 4), sessionTranscriptResponseSchema);
    expect(missing.page).toEqual({ file: 'missing', entries: [], cursor: 4, more: false, partial: false, unreadable: [] });
  }, 240_000);
});

describe('ST09: following a run\'s sessions with one poll', () => {
  test('the poll answers only entries after each cursor, never resets a number, and reports a state change in the next poll', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    const root = fixture.root;
    let started = 0;
    // The first run's architect ignores the stop past its grace, so the run
    // ends with the session the log still says is live: interrupted. The
    // second's waits until it is stopped, and honors the stop.
    const script = (): ScriptStep[] => (++started === 1
      ? [{ kind: 'message', text: 'Orienting.' }, { kind: 'stall', ms: 1500, thenIgnoreStop: true }, { kind: 'submit', input: emptyAnalysis() }]
      : [{ kind: 'message', text: 'Orienting.' }, { kind: 'wait', ms: 60_000 }]);
    const { service, agent } = await openRunsWithoutProcesses(root, scriptedGit(root, { head: 'poll-base', checkpoints: [] }), { script, stopGraceMs: 200 });
    cleanups.push(() => service.close());
    const server = createApp({ projectRoot: root, runs: service }).listen(0, '127.0.0.1');
    await new Promise<void>(accept => server.once('listening', () => accept()));
    cleanups.push(() => new Promise<void>(accept => { server.close(() => accept()); server.closeAllConnections(); }));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const entriesOf = async (runId: string): Promise<number> => (await readTranscript(runPath(root, plan, runId, runLayout.transcript('ses-0001')))).entries.length;
    const stop = async (runId: string): Promise<void> => {
      await service.execute(stopRun(plan, runId, service.getRun(plan, runId)!.version));
      await service.settled(plan, runId);
    };

    const first = (await service.execute(startRun(plan))).jobId;
    await until(async () => agent!.sessions.length === 1 && await entriesOf(first) >= 3);
    await stop(first);
    expect(service.getRun(plan, first)!.state).toBe('stopped');
    expect(reduceSessions(await runEventsOnDisk(root, plan, first)).get('ses-0001')!.state).toBe('live');

    const runId = (await service.execute(startRun(plan))).jobId;
    await until(async () => agent!.sessions.length === 2 && await entriesOf(runId) >= 3);

    // Live first, then the interrupted session of the run that ended.
    const list = await ok(origin, protocolPaths.sessions(), sessionListResponseSchema);
    expect(list.sessions.map(entry => [entry.ref.source === 'run' ? entry.ref.runId : null, entry.state])).toEqual([[runId, 'live'], [first, 'interrupted']]);
    const interrupted = await ok(origin, protocolPaths.runSessions(plan, first), runSessionsResponseSchema);
    expect(interrupted.sessions[0]).toMatchObject({ state: 'interrupted', awaiting: 'inv-0001', invocations: [{ ended: null, outcome: null }] });

    const live = await ok(origin, protocolPaths.runSessions(plan, runId), runSessionsResponseSchema);
    expect(live.sessions).toHaveLength(1);
    expect(live.sessions[0]).toMatchObject({ session: 'ses-0001', state: 'live', awaiting: 'inv-0001', invocations: [{ ended: null, kept: null, point: null }] });
    expect(live.sessions[0]!.invocations[0]!.evaluation).toMatchObject({ ended: null, usage: { unavailable: 'the invocation has not ended' } });
    const poll = (version: number, cursors: SessionCursor[]) => ok(origin, protocolPaths.runSessionUpdates(plan, runId, version, cursors), sessionUpdatesResponseSchema);

    // From nothing: the session, and its entries so far.
    const opening = await poll(0, [{ session: 'ses-0001', after: 0 }]);
    expect(opening.version).toBe(live.version);
    expect(opening.sessions.map(view => [view.session, view.state])).toEqual([['ses-0001', 'live']]);
    const [page] = opening.transcripts;
    expect(page!.page.entries.map(entry => entry.type)).toEqual(['started', 'message', 'message']);
    expect(page!.page.entries.map(entry => entry.n)).toEqual([1, 2, 3]);
    expect(page!.page.cursor).toBe(3);

    // Nothing changed: no session, no entry, and the cursor stays.
    const quiet = await poll(opening.version, [{ session: 'ses-0001', after: 3 }]);
    expect(quiet).toEqual({ version: opening.version, sessions: [], transcripts: [{ session: 'ses-0001', page: { ...page!.page, entries: [], cursor: 3 } }] });
    // Only the entries after the cursor.
    expect((await poll(opening.version, [{ session: 'ses-0001', after: 2 }])).transcripts[0]!.page.entries.map(entry => entry.n)).toEqual([3]);

    // The stop ends the invocation and finishes the session; the next poll says so.
    await stop(runId);
    const after = await poll(opening.version, [{ session: 'ses-0001', after: 3 }]);
    expect(after.version).toBeGreaterThan(opening.version);
    expect(after.sessions.map((view: RunSessionView) => [view.session, view.state, view.finished])).toEqual([['ses-0001', 'finished', 'run-ended']]);
    expect(after.sessions[0]!.invocations[0]).toMatchObject({ outcome: 'stopped', kept: false, point: { session: 'ses-0001', invocation: 'inv-0001' } });
    const newer = after.transcripts[0]!.page.entries;
    expect(newer.map(entry => entry.type)).toEqual(['ended', 'point']);
    expect(newer.map(entry => entry.n)).toEqual([4, 5]);
    expect(after.transcripts[0]!.page.cursor).toBe(5);
    expect(await poll(after.version, [{ session: 'ses-0001', after: 5 }])).toMatchObject({ version: after.version, sessions: [], transcripts: [{ page: { entries: [], cursor: 5 } }] });

    // A poll it cannot answer is refused, never guessed.
    const path = (query: string) => `${protocolPaths.runSessions(plan, runId)}/updates?${query}`;
    expect(await refused(origin, path(`version=${after.version + 1}&cursors=ses-0001:0`))).toEqual([400, 'invalid-request']);
    expect(await refused(origin, path('version=0&cursors=ses-0009:0'))).toEqual([404, 'not-found']);
    expect(await refused(origin, path('version=0&cursors=ses-0001'))).toEqual([400, 'invalid-request']);
    expect(await refused(origin, path('version=0&cursors=ses-0001:0,ses-0001:2'))).toEqual([400, 'invalid-request']);
    const many = Array.from({ length: 51 }, (_, index) => `ses-${String(index + 1).padStart(4, '0')}:0`).join(',');
    expect(await refused(origin, path(`version=0&cursors=${many}`))).toEqual([400, 'invalid-request']);
    expect((await poll(0, [])).transcripts).toEqual([]);
  }, 120_000);
});
