import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ScriptedAgent, ScriptStep } from '../../subs/agent/src/scripted.js';
import { reviewLayout, type ReviewRequest } from '../reviews/records.js';
import { snapshotToolNames } from '../reviews/snapshot.js';
import { runLayout, runRecordSchema } from '../run/records.js';
import { readCapturedDocuments } from '../run/document-inputs.js';
import { resolvePlanReference } from '../../subs/plan-evidence/src/references.js';
import type { ScriptedCommit } from './helpers/candidates.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { completionProposed, submit, write } from './helpers/iterations.js';
import {
  attemptRecord, candidates, eventsOf, limit, notesDirectory, plan, reviewRun, reviewTarget, store, tool,
} from './helpers/reviews.js';
import { onlyRun, runPath } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * The scope and design questions of a driven run (Plan 12 iteration 4):
 * every accepted iteration's audited candidate is asked the code, scope and
 * design questions as three requests; scope review forks the local
 * architect at the point that produced the assignment; design review forks
 * one orientation per guidance selection, and a changed selection is a new
 * orientation; a fork the executor cannot take starts fresh with the same
 * complete message, and records that it did.
 *
 * The agent is the scripted fake, whose fork inherits a session's appended
 * context up to the ref it forks. Git's answers for the gates and the
 * candidates are scripted and no process is started. The real pi fork is
 * exercised by the pi module's own fork-isolation test and by the
 * development probe `src/probes/pi-fork.probe.ts`.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const readme = `${notesDirectory}/README.md`;
const principles = 'docs/notes.principles.md';
const index = `${notesDirectory}/src/index.ts`;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/** The candidates with guidance: one principles document and the notes module's README, which the third iteration rewrites. */
function guidedCommits(): Record<string, ScriptedCommit> {
  const scripted = candidates();
  const guidance = { [principles]: 'Keep every store in memory.\n', [readme]: 'Notes keep one note per review run.\n' };
  return {
    'revision-01': { ...scripted['revision-01']!, files: { ...scripted['revision-01']!.files, ...guidance } },
    'revision-02': { ...scripted['revision-02']!, files: { ...scripted['revision-02']!.files, ...guidance } },
    'revision-03': {
      ...scripted['revision-03']!,
      changes: [...scripted['revision-03']!.changes, { status: 'M', path: readme }],
      files: { ...scripted['revision-03']!.files, ...guidance, [readme]: 'Notes keep one note per review run, and export their store.\n' },
    },
  };
}

const engineers = (during?: ScriptStep): ReadonlyArray<readonly ScriptStep[]> => [
  submit(completionProposed('Added the note store.'), write(store, 'export const store = new Map(); // v1\n')),
  submit(completionProposed('Stated the note limit.'), ...(during === undefined ? [] : [during]), write(limit, 'export const limit = (text: string) => text.length <= 50;\n')),
  submit(completionProposed('Exported the store.'), write(store, 'export const store = new Map(); // v3\n'), write(index, 'export * from \'./store.js\';\n')),
];

/** A clean review of every changed path of a candidate, each read through its patch. */
const clean = (paths: readonly string[]): ScriptStep[] => [
  ...paths.map(path => tool(snapshotToolNames.diff, { path })),
  { kind: 'submit', input: { inspected: [...paths], missing: [], concerns: [] } },
];
const changed = { 1: [store], 2: [limit], 3: [store, index, readme] } as const;
/** The reviewers of the three questions of the three iterations: rq-0001 to rq-0009, clean. */
function cleanReviewers(): Record<string, readonly ScriptStep[]> {
  const reviewers: Record<string, readonly ScriptStep[]> = {};
  for (const iteration of [1, 2, 3] as const) {
    for (const question of [0, 1, 2]) reviewers[`rq-${String((iteration - 1) * 3 + question + 1).padStart(4, '0')}`] = clean(changed[iteration]);
  }
  return reviewers;
}
const orient = (read: readonly string[]): ScriptStep[] => [{ kind: 'submit', input: { read: [...read], summary: 'Stores stay in memory, and a module keeps to its README\'s responsibility.' } }];

async function requestRecord(root: string, runId: string, id: string): Promise<ReviewRequest> {
  return JSON.parse(await readFile(runPath(root, plan, runId, reviewLayout.request(id)), 'utf8')) as ReviewRequest;
}

describe('three questions over one candidate', () => {
  test('each accepted iteration binds code, scope and design requests to one candidate, scope forks the assignment point and design forks one orientation per guidance selection', async () => {
    const root = await reviewTarget(cleanups);
    let agent!: ScriptedAgent;
    // A later turn of the local architect, after the second assignment and
    // before that iteration's scope review starts: the review must not see it.
    const laterTurn: ScriptStep = {
      kind: 'await',
      until: async () => {
        const architect = agent.sessions.find(session => session.spec.role === 'local-architect')!;
        await agent.appendContext(architect.ref, 'later-turn', 'LATER ARCHITECT TURN');
      },
    };
    const run = await reviewRun(root, cleanups, {
      commits: guidedCommits(),
      policy: { kinds: ['code', 'scope', 'design'], concurrency: 2 },
      agentReady: scripted => { agent = scripted; },
      engineer: engineers(laterTurn),
      reviewers: {
        ...cleanReviewers(),
        'orientation#1': orient([principles, readme]),
        'orientation#2': orient([principles, readme]),
      },
    });
    const { service, runId, events } = run;
    expect(onlyRun(service, plan).state).toBe('completed');

    // Three requests per accepted iteration, one per question, all over the
    // same audited candidate, gate, base and assignment.
    const requests = eventsOf(events, 'review-request-recorded');
    expect(requests.map(event => [event.data.request, event.data.iteration, event.data.kind, event.data.candidate])).toEqual([
      ['rq-0001', 'wi-001.i01', 'code', 'revision-01'], ['rq-0002', 'wi-001.i01', 'scope', 'revision-01'], ['rq-0003', 'wi-001.i01', 'design', 'revision-01'],
      ['rq-0004', 'wi-001.i02', 'code', 'revision-02'], ['rq-0005', 'wi-001.i02', 'scope', 'revision-02'], ['rq-0006', 'wi-001.i02', 'design', 'revision-02'],
      ['rq-0007', 'wi-001.i03', 'code', 'revision-03'], ['rq-0008', 'wi-001.i03', 'scope', 'revision-03'], ['rq-0009', 'wi-001.i03', 'design', 'revision-03'],
    ]);
    const records = await Promise.all(requests.map(event => requestRecord(root, runId, event.data.request)));
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const [code, scope, design] = records.slice(iteration * 3, iteration * 3 + 3) as [ReviewRequest, ReviewRequest, ReviewRequest];
      for (const other of [scope, design]) {
        expect({ ...other.key, kind: 'code' }).toEqual(code.key);
        expect([other.tree, other.gate, other.base, other.assignment]).toEqual([code.tree, code.gate, code.base, code.assignment]);
      }
      // Distinct questions with their own inputs and starting points.
      expect(code).toMatchObject({ requirements: [], guidance: [], forkPoint: { kind: 'none' } });
      expect(scope.guidance).toEqual([]);
      expect(design.requirements).toEqual([]);
    }

    // Scope binds the plan section its assignment cites, by the hash of its text.
    const runRecord = runRecordSchema.parse(JSON.parse(await readFile(runPath(root, plan, runId, runLayout.record), 'utf8')));
    const captured = await readCapturedDocuments(runPath(root, plan, runId, ''), runRecord.manifest);
    const section = resolvePlanReference(captured.manifest, captured.bytes, { anchor: 'Request' });
    expect(section.status).toBe('available');
    if (section.status !== 'available') return;
    expect(records[1]!.requirements[0]).toEqual({ ref: 'plan#request', hash: hash(section.text) });
    expect(records[1]!.requirements[1]).toMatchObject({ ref: 'assignment-source:wi-001.i01', hash: expect.stringMatching(/^[0-9a-f]{64}$/u) });
    expect(records[1]!.source).toMatchObject({ packageHash: expect.stringMatching(/^[0-9a-f]{64}$/u), deliveryHash: records[1]!.requirements[1]!.hash });

    // Scope forks the architect's point captured atomically with its assignment.
    const assigned = eventsOf(events, 'iteration-assigned');
    expect(assigned.every(event => event.data.architectRef !== null && event.data.architectRef !== undefined)).toBe(true);
    for (const [position, iteration] of [[1, 0], [4, 1], [7, 2]] as const) {
      const architectRef = assigned[iteration]!.data.architectRef!;
      expect(records[position]!.forkPoint).toEqual({ kind: 'session', session: architectRef.session, ref: architectRef.ref });
    }
    // The completion request records the architect's point after it.
    const completion = eventsOf(events, 'outline-revised').find(event => event.data.architectRef !== undefined)!;
    expect(completion.data.architectRef).toMatchObject({ session: assigned[0]!.data.architectRef!.session });
    expect(eventsOf(events, 'outline-revised').filter(event => event.data.architectRef !== undefined)).toHaveLength(1);

    const opened = eventsOf(events, 'session-opened');
    const reviewerSessions = agent.sessions.filter(session => session.spec.role === 'reviewer');
    const sessionOf = (request: string) => reviewerSessions.find(session => new RegExp(`review ${request} `, 'u').test(session.spec.prompt))!;
    for (const [request, iteration] of [['rq-0002', 0], ['rq-0005', 1], ['rq-0008', 2]] as const) {
      const architectRef = assigned[iteration]!.data.architectRef!;
      const reviewer = sessionOf(request);
      expect(reviewer.spec.session).toEqual({ mode: 'fork', from: architectRef.ref });
      expect(reviewer.start).toEqual({ mode: 'fork' });
      const started = eventsOf(events, 'review-attempt-started').find(event => event.data.request === request)!;
      expect(started.data.requestedStart).toBe('fork');
      expect(opened.find(event => event.data.session === started.data.session)!.data.fork)
        .toEqual({ from: { session: architectRef.session, invocation: assigned[iteration]!.data.invocation }, reason: 'scope-review', briefs: [] });
      expect(await attemptRecord(root, runId, `${request}.a01`)).toMatchObject({ requestedStart: 'fork', actualStart: 'fork', result: { result: 'complete' } });
    }
    // A forked reader keeps a reader's equipment: no built-in tool, the four
    // snapshot tools, and a working directory of its own, whatever its
    // parent session had.
    for (const request of ['rq-0002', 'rq-0003', 'rq-0005', 'rq-0006']) {
      const reviewer = sessionOf(request);
      expect(reviewer.spec.builtinTools).toEqual([]);
      expect(reviewer.spec.tools.map(definition => definition.name)).toEqual(Object.values(snapshotToolNames));
      expect(reviewer.spec.scope.workingDirectory.startsWith(runPath(root, plan, runId))).toBe(true);
    }
    // The second scope review started after the architect's later turn, and
    // sees the assignment point without it; the third assignment came after it.
    expect(sessionOf('rq-0005').inherited).toHaveLength(1);
    expect(sessionOf('rq-0005').inherited[0]).toContain('# Captured context for work item wi-001');
    expect(sessionOf('rq-0008').inherited).toContain('LATER ARCHITECT TURN');
    // The scope reviewer is given the question's procedure and the plan's text either way.
    expect(sessionOf('rq-0005').spec.systemPrompt).toContain('Ask of the candidate as a whole: does it do what the assignment asked');
    expect(sessionOf('rq-0005').spec.prompt).toContain('A reviewer can attach one note of at most 500 characters');

    // Design binds its guidance from the candidate; the first two candidates
    // share a selection and so an orientation, and the rewritten README is
    // another selection and another orientation.
    const [first, second, third] = [records[2]!, records[5]!, records[8]!];
    expect(first.guidance).toEqual([
      { ref: principles, hash: hash('Keep every store in memory.\n') },
      { ref: readme, hash: hash('Notes keep one note per review run.\n') },
    ]);
    expect(second.guidance).toEqual(first.guidance);
    expect(third.guidance[1]).toEqual({ ref: readme, hash: hash('Notes keep one note per review run, and export their store.\n') });
    expect(first.forkPoint.kind).toBe('orientation');
    expect(second.forkPoint).toEqual(first.forkPoint);
    expect(third.forkPoint.kind).toBe('orientation');
    expect(third.forkPoint).not.toEqual(first.forkPoint);

    const orientations = eventsOf(events, 'review-orientation-recorded');
    expect(orientations.map(event => [event.data.request, event.data.outcome])).toEqual([['rq-0003', 'oriented'], ['rq-0009', 'oriented']]);
    expect(orientations.map(event => event.data.key)).toEqual([
      (first.forkPoint as { key: string }).key, (third.forkPoint as { key: string }).key,
    ]);
    const orientationRecord = JSON.parse(await readFile(runPath(root, plan, runId, reviewLayout.orientation(orientations[0]!.data.key)), 'utf8'));
    expect(orientationRecord).toMatchObject({ schema: 'ramify-agent.review-orientation/1', outcome: 'oriented', guidance: first.guidance, ref: expect.any(String) });
    // The orientation read the guidance in full, with no tool.
    const orientationSessions = reviewerSessions.filter(session => session.spec.prompt.startsWith('Design orientation.'));
    expect(orientationSessions).toHaveLength(2);
    expect(orientationSessions[0]!.spec.prompt).toContain('Keep every store in memory.');
    expect(orientationSessions[0]!.spec.tools).toEqual([]);
    expect(orientationSessions[0]!.spec.submission.name).toBe('submit_orientation');

    for (const [request, orientation] of [['rq-0003', 0], ['rq-0006', 0], ['rq-0009', 1]] as const) {
      const reviewer = sessionOf(request);
      const recorded = JSON.parse(await readFile(runPath(root, plan, runId, reviewLayout.orientation(orientations[orientation]!.data.key)), 'utf8'));
      expect(reviewer.spec.session).toEqual({ mode: 'fork', from: recorded.ref });
      const started = eventsOf(events, 'review-attempt-started').find(event => event.data.request === request)!;
      expect(opened.find(event => event.data.session === started.data.session)!.data.fork)
        .toEqual({ from: { session: orientations[orientation]!.data.session, invocation: orientations[orientation]!.data.invocation }, reason: 'design-orientation', briefs: [] });
      // The message names the guidance by path and hash, complete without the fork.
      expect(reviewer.spec.prompt).toContain(`- ${principles} (sha256 `);
      expect(await attemptRecord(root, runId, `${request}.a01`)).toMatchObject({ requestedStart: 'fork', actualStart: 'fork' });
    }

    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 9, complete: 9, partial: 0, notVerified: 0, pending: 0 });
    expect(eventsOf(events, 'gate-attempted').every(event => event.data.verdict === 'passed')).toBe(true);
    run.git.assertComplete();
  }, 120_000);
});

describe('a missing or degraded fork starts fresh', () => {
  test('an executor that cannot fork gives scope and design reviews fresh sessions with the same complete message, and records the start it made', async () => {
    const root = await reviewTarget(cleanups);
    let agent!: ScriptedAgent;
    const run = await reviewRun(root, cleanups, {
      commits: guidedCommits(),
      policy: { kinds: ['scope', 'design'], concurrency: 1 },
      agentOptions: { support: { fork: { available: false, reason: 'This executor cannot fork' } } },
      agentReady: scripted => { agent = scripted; },
      engineer: engineers(),
      reviewers: {
        // A fresh design reviewer reads its guidance through the snapshot.
        'rq-0001': clean(changed[1]),
        'rq-0002': [tool(snapshotToolNames.read, { path: principles }), tool(snapshotToolNames.read, { path: readme }), ...clean(changed[1])],
        'rq-0003': clean(changed[2]),
        'rq-0004': clean(changed[2]),
        // A partial scope review and a partial design review keep their coverage honest.
        'rq-0005': [tool(snapshotToolNames.diff, { path: store }), { kind: 'submit', input: { inspected: [store], missing: [{ path: index, reason: 'Not reached' }, { path: readme, reason: 'Not reached' }], concerns: [] } }],
        'rq-0006': [tool(snapshotToolNames.diff, { path: store }), tool(snapshotToolNames.diff, { path: index }), { kind: 'submit', input: { inspected: [store, index], missing: [{ path: readme, reason: 'The guidance itself changed' }], concerns: [] } }],
        'orientation#1': orient([principles, readme]),
        'orientation#2': orient([principles, readme]),
      },
    });
    const { service, runId, events } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    const reviewers = agent.sessions.filter(session => session.spec.role === 'reviewer' && !session.spec.prompt.startsWith('Design orientation.'));
    expect(reviewers).toHaveLength(6);
    for (const reviewer of reviewers) {
      // Asked to fork, answered fresh with the executor's reason.
      expect(reviewer.spec.session.mode).toBe('fork');
      expect(reviewer.start).toEqual({ mode: 'fresh', degradedReason: 'This executor cannot fork' });
      expect(reviewer.inherited).toEqual([]);
    }
    for (const attempt of ['rq-0001.a01', 'rq-0002.a01', 'rq-0005.a01', 'rq-0006.a01']) {
      expect(await attemptRecord(root, runId, attempt)).toMatchObject({ requestedStart: 'fork', actualStart: 'fresh' });
    }
    // The invocation's end records the degradation: a fresh start is never measured as a fork.
    const reviewerInvocations = new Set(eventsOf(events, 'invocation-started')
      .filter(event => event.data.role === 'reviewer').map(event => event.data.invocation));
    const degraded = eventsOf(events, 'invocation-ended').filter(event => event.data.degraded !== undefined && reviewerInvocations.has(event.data.invocation));
    expect(degraded).toHaveLength(6);
    expect(degraded.every(event => event.data.degraded!.requested === 'fork' && event.data.degraded!.actual === 'fresh')).toBe(true);
    // The fresh scope reviewer still has the whole question: the assignment and the plan's text.
    const scope = reviewers.find(session => session.spec.prompt.startsWith('Scope review rq-0001 '))!;
    expect(scope.spec.prompt).toContain('A reviewer can attach one note of at most 500 characters');
    expect(scope.spec.prompt).toContain('Goal: Add the note store.');
    // The fresh design reviewer read the guidance from the candidate itself.
    const design = reviewers.find(session => session.spec.prompt.startsWith('Design review rq-0002 '))!;
    expect(design.results.slice(0, 2).map(result => [result.tool, result.isError, result.text.includes('Keep every store') || result.text.includes('Notes keep')])).toEqual([
      [snapshotToolNames.read, false, true], [snapshotToolNames.read, false, true],
    ]);

    const finished = eventsOf(events, 'review-attempt-finished');
    expect(finished.find(event => event.data.request === 'rq-0005')!.data.result).toBe('partial');
    expect(finished.find(event => event.data.request === 'rq-0006')!.data.result).toBe('partial');
    expect(await attemptRecord(root, runId, 'rq-0006.a01')).toMatchObject({
      result: { result: 'partial', inspected: [{ path: store }, { path: index }], missing: [{ path: readme }] }, checkFindings: [],
    });
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 6, complete: 4, partial: 2, notVerified: 0, pending: 0 });
    run.git.assertComplete();
  }, 120_000);

  test('a failed orientation is recorded once, and the design reviews of its guidance start fresh with the reason', async () => {
    const root = await reviewTarget(cleanups);
    let agent!: ScriptedAgent;
    const run = await reviewRun(root, cleanups, {
      commits: guidedCommits(),
      policy: { kinds: ['design'], concurrency: 1, retries: 0 },
      agentReady: scripted => { agent = scripted; },
      engineer: engineers(),
      reviewers: {
        'orientation#1': [{ kind: 'end', message: 'I read it.' }],
        'orientation#2': orient([principles, readme]),
        'rq-0001': clean(changed[1]),
        'rq-0002': clean(changed[2]),
        'rq-0003': clean(changed[3]),
      },
    });
    const { service, runId, events } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    const orientations = eventsOf(events, 'review-orientation-recorded');
    // One failed orientation for the shared selection, not one per review;
    // the third candidate's selection is another, which orients.
    expect(orientations.map(event => [event.data.request, event.data.outcome])).toEqual([['rq-0001', 'failed'], ['rq-0003', 'oriented']]);
    const failed = JSON.parse(await readFile(runPath(root, plan, runId, reviewLayout.orientation(orientations[0]!.data.key)), 'utf8'));
    expect(failed).toMatchObject({ outcome: 'failed', ref: null, summary: null, reason: expect.stringContaining('ended') });
    const reviewers = agent.sessions.filter(session => session.spec.role === 'reviewer' && !session.spec.prompt.startsWith('Design orientation.'));
    expect(reviewers.map(session => session.spec.session.mode)).toEqual(['fresh', 'fresh', 'fork']);
    for (const attempt of ['rq-0001.a01', 'rq-0002.a01']) {
      expect(await attemptRecord(root, runId, attempt)).toMatchObject({ requestedStart: 'fork', actualStart: 'fresh', result: { result: 'complete' } });
    }
    // The caller's degradation is on the invocation record, with its reason.
    const invocation = (await attemptRecord(root, runId, 'rq-0002.a01')).invocation!;
    const record = JSON.parse(await readFile(runPath(root, plan, runId, runLayout.invocation(invocation)), 'utf8'));
    expect(record.session).toMatchObject({ requested: 'fork', actual: 'fresh', degradedReason: expect.stringContaining('did not orient') });
    expect(await attemptRecord(root, runId, 'rq-0003.a01')).toMatchObject({ requestedStart: 'fork', actualStart: 'fork' });
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 3, complete: 3, partial: 0, notVerified: 0, pending: 0 });
  }, 120_000);

  test('a candidate without guidance leaves its design review unavailable, never clean', async () => {
    const root = await reviewTarget(cleanups);
    const run = await reviewRun(root, cleanups, {
      policy: { kinds: ['design'] },
      engineer: engineers(),
      reviewers: {},
    });
    const { service, runId, events } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    const request = await requestRecord(root, runId, 'rq-0001');
    expect(request).toMatchObject({ guidance: [], forkPoint: { kind: 'unavailable', reason: 'The candidate holds no guidance to judge a design against' } });
    expect(eventsOf(events, 'review-attempt-started')).toEqual([]);
    expect(eventsOf(events, 'review-orientation-recorded')).toEqual([]);
    expect(await attemptRecord(root, runId, 'rq-0001.a01')).toMatchObject({ result: { result: 'not-verified', reason: 'unavailable', detail: expect.stringContaining('no guidance') } });
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 3, complete: 0, partial: 0, notVerified: 3, pending: 0 });
  }, 120_000);
});
