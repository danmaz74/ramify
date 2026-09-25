import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';
import { reviewLayout } from '../reviews/records.js';
import { snapshotToolNames } from '../reviews/snapshot.js';
import type { scriptedCandidates } from './helpers/candidates.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { completionProposed, submit, write } from './helpers/iterations.js';
import {
  attemptRecord, escape, eventsOf, gate, limit, notes, notesDirectory, plan, reviewRun, reviewTarget, store, tool,
} from './helpers/reviews.js';
import { onlyRun, runPath } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * Code review of a driven run (Plan 12 iteration 3): every iteration that
 * closes accepted has its review requested before the driver passes it,
 * its reader runs beside the next iteration's writer against the audited
 * candidate alone, and its terminal attempt commits its coverage and the
 * CheckFindings its concerns open as one line.
 *
 * The agent is the scripted fake, Git's answers are scripted for the gates
 * and for the candidates, and no process is started. What the reviewers'
 * tools answered is read from the fake's own session records; what the run
 * decided is read from its log and records.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

describe('CF05: readers beside the writer, confined to the audited candidate', () => {
  test('two readers overlap the third iteration\'s writer, read only their own candidates, and every escape is refused', async () => {
    const root = await reviewTarget(cleanups);
    // Both readers wait at a point the writer's turn opens, so all three
    // sessions are live at once; the writer changes the live store first.
    const readersWaiting = [gate(), gate()] as const;
    const writerWrote = gate();
    const waitForWriter = (index: 0 | 1): ScriptStep => ({ kind: 'await', until: async () => { readersWaiting[index].open(); await writerWrote.opened; } });
    const run = await reviewRun(root, cleanups, {
      engineer: [
        submit(completionProposed('Added the note store.'), write('store.ts', 'export const store = new Map(); // v1\n')),
        submit(completionProposed('Stated the note limit.'), write('limit.ts', 'export const limit = (text: string) => text.length <= 50;\n')),
        submit(completionProposed('Exported the store.'),
          { kind: 'await', until: () => Promise.all(readersWaiting.map(waiting => waiting.opened)) },
          write('store.ts', 'export const store = new Map(); // v3\n'),
          write('index.ts', 'export * from \'./store.js\';\n'),
          { kind: 'await', until: async () => { writerWrote.open(); } }),
      ],
      reviewers: {
        'rq-0001': [
          tool(snapshotToolNames.diff, {}),
          tool(snapshotToolNames.diff, { path: store }),
          // Every way out of the candidate is refused, and so is the live tree.
          tool(snapshotToolNames.read, { path: join(root, store) }),
          tool(snapshotToolNames.read, { path: '../../outside.txt' }),
          tool(snapshotToolNames.read, { path: escape }),
          tool(snapshotToolNames.read, { path: `${escape}/passwd` }),
          tool(snapshotToolNames.list, { path: '.ramify-architect' }),
          tool(snapshotToolNames.read, { path: `${notesDirectory}/src/.ramify/api.json` }),
          tool('read', { path: store }),
          waitForWriter(0),
          // The live store is v3 now; the candidate's is still v1.
          tool(snapshotToolNames.read, { path: store }),
          { kind: 'submit', input: { inspected: [store], missing: [], concerns: [] } },
        ],
        'rq-0002': [
          tool(snapshotToolNames.read, { path: limit }),
          waitForWriter(1),
          tool(snapshotToolNames.search, { pattern: 'length <= 50' }),
          { kind: 'submit', input: { inspected: [limit], missing: [], concerns: [{
            summary: 'The note limit counts UTF-16 units, not characters',
            consequence: 'A note of 50 emoji is refused although the plan allows 50 characters',
            rationale: 'limit.ts compares text.length, which counts surrogate pairs twice',
            uncertainty: 'The plan does not say how characters are counted',
            remedy: 'Count code points in limit.ts',
            locations: [{ path: limit, startLine: 1, endLine: 1 }],
            suggests: null,
            risk: 'medium',
            ground: { path: limit, quote: 'text.length <= 50' },
          }] } },
        ],
        'rq-0003': [
          tool(snapshotToolNames.diff, { path: store }),
          { kind: 'submit', input: { inspected: [store], missing: [{ path: `${notesDirectory}/src/index.ts`, reason: 'The attempt ran out of its own time budget' }], concerns: [] } },
        ],
      },
    });
    const { service, runId, events, agent } = run;
    expect(onlyRun(service, plan).state).toBe('completed');

    // One request per accepted iteration, recorded before the driver passed it.
    const requests = eventsOf(events, 'review-request-recorded');
    expect(requests.map(event => [event.data.request, event.data.iteration, event.data.kind, event.data.candidate]))
      .toEqual([['rq-0001', 'wi-001.i01', 'code', 'revision-01'], ['rq-0002', 'wi-001.i02', 'code', 'revision-02'], ['rq-0003', 'wi-001.i03', 'code', 'revision-03']]);
    for (const request of requests) {
      const closed = events.find(event => event.type === 'iteration-closed' && event.data.iteration === request.data.iteration)!;
      const next = events.find(event => event.sequence > closed.sequence && (event.type === 'iteration-assigned' || event.type === 'outline-revised'))!;
      expect(closed.sequence).toBeLessThan(request.sequence);
      expect(request.sequence).toBeLessThan(next.sequence);
    }
    const request = JSON.parse(await readFile(runPath(root, plan, runId, reviewLayout.request('rq-0002')), 'utf8'));
    expect(request).toMatchObject({ schema: 'ramify-agent.review-request/1', key: { iteration: 'wi-001.i02', candidate: 'revision-02', kind: 'code', policy: 'review-policy/1' },
      workItem: 'wi-001', base: 'revision-01', tree: 'tree-02', forkPoint: { kind: 'none' }, requirements: [], guidance: [] });

    // The overlap: both readers started before the writer of wi-001.i03
    // ended, and ended after it started.
    const started = eventsOf(events, 'invocation-started');
    const ended = eventsOf(events, 'invocation-ended');
    const writer = started.find(event => event.data.role === 'engineer' && event.data.work.iteration === 'wi-001.i03')!;
    const writerEnd = ended.find(event => event.data.invocation === writer.data.invocation)!;
    const reviewInvocations = eventsOf(events, 'review-attempt-started').map(event => event.data.invocation);
    for (const invocation of reviewInvocations.slice(0, 2)) {
      expect(started.find(event => event.data.invocation === invocation)!.sequence).toBeLessThan(writerEnd.sequence);
      expect(ended.find(event => event.data.invocation === invocation)!.sequence).toBeGreaterThan(writer.sequence);
    }
    expect(started.filter(event => event.data.role === 'reviewer').every(event => !eventsOf(events, 'writer-acquired').some(acquired => acquired.data.invocation === event.data.invocation))).toBe(true);

    // The reader was given no built-in tool and no working directory of the project's.
    const sessions = agent!.sessions.filter(session => session.spec.role === 'reviewer');
    expect(sessions).toHaveLength(3);
    const first = sessions.find(session => session.spec.prompt.includes('rq-0001'))!;
    expect(first.spec.builtinTools).toEqual([]);
    expect(first.spec.tools.map(definition => definition.name)).toEqual(Object.values(snapshotToolNames));
    expect(first.spec.scope.workingDirectory).not.toBe(root);
    expect(first.spec.scope.workingDirectory.startsWith(runPath(root, plan, runId))).toBe(true);

    const results = first.results.map(result => [result.tool, result.isError, result.text.split('\n')[0]]);
    expect(results[0]).toEqual([snapshotToolNames.diff, false, `A\t${store}`]);
    expect(results[1]![1]).toBe(false);
    expect(results.slice(2, 9)).toEqual([
      [snapshotToolNames.read, true, expect.stringContaining('is an absolute path')],
      [snapshotToolNames.read, true, expect.stringContaining('leaves the audited candidate')],
      [snapshotToolNames.read, true, expect.stringContaining('is a symbolic link')],
      [snapshotToolNames.read, true, expect.stringContaining('is a symbolic link')],
      [snapshotToolNames.list, true, expect.stringContaining('is a generated view')],
      [snapshotToolNames.read, true, expect.stringContaining('is a generated view')],
      ['read', true, 'Tool read not found'],
    ]);
    // After the writer changed the live store, the reader still reads the audited one.
    expect(await readFile(join(root, store), 'utf8')).toBe('export const store = new Map(); // v3\n');
    expect(first.results[9]!.text).toContain('// v1');
    expect(first.results[9]!.text).not.toContain('// v3');
    expect(run.source.calls.filter(call => call.startsWith('readBlob')).sort()).toEqual([
      `readBlob revision-01 ${store}`, `readBlob revision-02 ${limit}`,
    ]);

    // CF04's covered results: a clean review, a concern promoted once, and a partial one.
    // The two overlapping readers finish in either order.
    const finished = eventsOf(events, 'review-attempt-finished').sort((a, b) => (a.data.attempt < b.data.attempt ? -1 : 1));
    expect(finished.map(event => [event.data.attempt, event.data.result, event.data.reason, event.data.settles, event.data.checkFindings.length]))
      .toEqual([['rq-0001.a01', 'complete', null, true, 0], ['rq-0002.a01', 'complete', null, true, 1], ['rq-0003.a01', 'partial', null, true, 0]]);
    expect(await attemptRecord(root, runId, 'rq-0001.a01')).toMatchObject({ result: { result: 'complete', inspected: [{ path: store }], concerns: 0 }, checkFindings: [], actualStart: 'fresh' });
    expect(await attemptRecord(root, runId, 'rq-0003.a01')).toMatchObject({
      result: { result: 'partial', inspected: [{ path: store }], missing: [{ path: `${notesDirectory}/src/index.ts` }], concerns: 0 }, checkFindings: [],
    });
    const concern = await attemptRecord(root, runId, 'rq-0002.a01');
    expect(concern).toMatchObject({ result: { result: 'complete', concerns: 1 }, checkFindings: ['cf-0001'], settles: true });
    const list = service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all' });
    expect(list).toMatchObject({ ok: true, view: { total: 1, items: [{ id: 'cf-0001', standing: 'open', reason: 'new', producers: ['review:code'] }] } });
    const detail = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0001' });
    expect(detail).toMatchObject({ ok: true, view: { reports: { items: [{
      producer: 'review:code', attempt: 'rq-0002.a01', reportKey: 'concern-01', source: { kind: 'tree', id: 'tree-02' }, issueKey: null,
      owner: { kind: 'work-item', workItem: 'wi-001' },
      observation: { kind: 'review-concern', evidence: [{ kind: 'review-submission', ref: reviewLayout.submission('rq-0002.a01'), hash: expect.stringMatching(/^sha256:/u) }] },
      judgment: { actor: { kind: 'agent', role: 'reviewer', invocation: concern.invocation }, risk: 'medium', ground: { ref: limit, hash: expect.stringMatching(/^sha256:/u) } },
      // The candidate declares no module, so the concern falls back to its work item's module.
      credibility: 'agent-generated',
      modules: [notes],
    }] } } });
    expect(JSON.parse(await readFile(runPath(root, plan, runId, reviewLayout.submission('rq-0002.a01')), 'utf8')))
      .toMatchObject({ schema: 'ramify-agent.review-submission/1', attempt: 'rq-0002.a01', inspected: [limit] });
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 3, complete: 2, partial: 1, notVerified: 0, pending: 0 });

    // The reviews change no gate: every gate passed and the run completed.
    expect(eventsOf(events, 'gate-attempted').every(event => event.data.verdict === 'passed')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'job-completed' });
    // A reviewer's invocation is no author of a gate's commit.
    for (const message of run.git.messages) {
      for (const invocation of reviewInvocations) expect(message).not.toContain(invocation);
    }
    run.git.assertComplete();
  }, 120_000);
});

describe('CF04: invalid, timed-out and unavailable reviews are not verified', () => {
  test('malformed output is retried once, a hung reader times out and an unreadable candidate is unavailable', async () => {
    const root = await reviewTarget(cleanups);
    const malformed: ScriptStep[] = [
      { kind: 'submit', input: { inspected: [], concerns: [] } },
      { kind: 'submit', input: { inspected: [store], missing: [], concerns: [] } },
      { kind: 'submit', input: { verdict: 'looks fine' } },
    ];
    let source!: ReturnType<typeof scriptedCandidates>;
    const run = await reviewRun(root, cleanups, {
      candidates: scripted => { source = scripted; },
      policy: { attemptMs: 1_000, concurrency: 1 },
      engineer: [
        submit(completionProposed('Added the note store.'), write('store.ts', 'export const store = new Map(); // v1\n')),
        submit(completionProposed('Stated the note limit.'), write('limit.ts', 'export const limit = (text: string) => text.length <= 50;\n')),
        submit(completionProposed('Exported the store.'),
          // The third candidate cannot be read by the time its reader starts.
          { kind: 'await', until: async () => { source.fail('treeEntries', 'revision-03'); } },
          write('store.ts', 'export const store = new Map(); // v3\n'), write('index.ts', 'export * from \'./store.js\';\n')),
      ],
      reviewers: {
        'rq-0001#1': malformed,
        'rq-0001#2': malformed,
        // A reader that never answers, and honors the stop its bound sends.
        'rq-0002': [{ kind: 'await', until: () => new Promise(() => undefined) }],
        'rq-0003': [{ kind: 'submit', input: { inspected: [], missing: [], concerns: [] } }],
      },
    });
    const { events, runId, service } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    const finished = eventsOf(events, 'review-attempt-finished');
    expect(finished.filter(event => event.data.request !== 'rq-0003').map(event => [event.data.attempt, event.data.result, event.data.reason, event.data.settles]))
      .toEqual([
        ['rq-0001.a01', 'not-verified', 'invalid-output', false],
        ['rq-0001.a02', 'not-verified', 'invalid-output', true],
        ['rq-0002.a01', 'not-verified', 'timed-out', false],
        ['rq-0002.a02', 'not-verified', 'timed-out', true],
      ]);
    // A candidate that cannot be read is unavailable at once, and not retried.
    expect(finished.filter(event => event.data.request === 'rq-0003').map(event => [event.data.attempt, event.data.result, event.data.reason, event.data.settles]))
      .toEqual([['rq-0003.a01', 'not-verified', 'unavailable', true]]);
    expect(await attemptRecord(root, runId, 'rq-0003.a01')).toMatchObject({ startedAt: null, invocation: null, session: null, actualStart: null,
      result: { detail: expect.stringContaining('could not be read') } });
    expect(eventsOf(events, 'review-attempt-started').map(event => event.data.attempt)).toEqual(['rq-0001.a01', 'rq-0001.a02', 'rq-0002.a01', 'rq-0002.a02']);
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 3, complete: 0, partial: 0, notVerified: 3, pending: 0 });
    // An invalid submission creates no CheckFinding and names no submission record.
    expect(finished.every(event => event.data.checkFindings.length === 0)).toBe(true);
    expect((await attemptRecord(root, runId, 'rq-0001.a02')).result).toMatchObject({ result: 'not-verified', reason: 'invalid-output' });
    expect(eventsOf(events, 'invocation-ended').filter(event => event.data.ended === 'invalid-submission')).toHaveLength(2);
    expect(service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all' })).toMatchObject({ ok: true, view: { total: 0 } });
    run.git.assertComplete();
  }, 120_000);
});
