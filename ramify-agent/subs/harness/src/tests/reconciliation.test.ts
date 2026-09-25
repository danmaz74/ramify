import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ScriptedAgent, ScriptStep } from '../../subs/agent/src/scripted.js';
import type { CheckFindingSummary } from '../../subs/check-findings/src/interfaces/check-findings.js';
import { CommandRejection } from '../jobs/commands.js';
import type { RunEvent } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { reduceSessions } from '../run/sessions.js';
import { reconciliationLayout, type ReconciliationAssessment, type ReconciliationBasis } from '../reviews/reconciliation.js';
import { snapshotToolNames } from '../reviews/snapshot.js';
import { requestCompletion } from './helpers/analysis.js';
import { scriptedCandidates, testReviewPolicy, type ScriptedCommit } from './helpers/candidates.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { assign, completionProposed, outline, submit, write } from './helpers/iterations.js';
import { concern as boundConcern, decision, dispose, report } from './helpers/check-findings.js';
import { mockGit } from './helpers/mock-git.js';
import {
  candidates, eventsOf, finalReviewTree, gate, limit, notes, notesDirectory, plan, revisionGates, reviewRun, reviewTarget, store, tool, unchanged,
} from './helpers/reviews.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, staleCrashLock, testPolicy, until } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * Work-item reconciliation (Plan 12 iteration 5): at a completion request
 * the work item's reviews settle, and the CheckFindings they raised are
 * assessed by one fork of the local architect, at the point after that
 * request, in one submission. The assessment is committed before its brief
 * is appended to the architect's own session; a correction goes through the
 * ordinary iteration, gate and review; later rounds keep to the floor; and
 * a completion is validated against the basis once more before it commits.
 *
 * The agent is the scripted fake, Git's answers for the gates and the
 * candidates are scripted, and no process is started.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const index = `${notesDirectory}/src/index.ts`;
const correctedTree = 'd'.repeat(40);
const never = (): ScriptStep => ({ kind: 'await', until: () => new Promise(() => undefined) });

/** The three engineers, and a fourth for a correction. */
const engineers: ReadonlyArray<readonly ScriptStep[]> = [
  submit(completionProposed('Added the note store.'), write(store, 'export const store = new Map(); // v1\n')),
  submit(completionProposed('Stated the note limit.'), write(limit, 'export const limit = (text: string) => text.length <= 50;\n')),
  submit(completionProposed('Exported the store.'), write(store, 'export const store = new Map(); // v3\n'), write(index, 'export * from \'./store.js\';\n')),
  submit(completionProposed('Corrected the limit.'), write(limit, 'export const limit = (text: string) => text.length <= 500;\n')),
];

type Risk = 'high' | 'medium' | 'low';
/** One concern about a path of the candidate. */
const concern = (path: string, summary: string, risk: Risk) => ({
  summary, consequence: `${summary}, so the behavior differs from the goal`, rationale: 'read the candidate diff', uncertainty: 'moderate',
  remedy: 'a bounded change in the named file', locations: [{ path, startLine: 1, endLine: 1 }], suggests: null, risk, ground: null,
});
/** A reviewer that reads each changed path's patch and submits these concerns. */
const review = (paths: readonly string[], concerns: readonly ReturnType<typeof concern>[] = []): ScriptStep[] => [
  ...paths.map(path => tool(snapshotToolNames.diff, { path })),
  { kind: 'submit', input: { inspected: [...paths], missing: [], concerns: [...concerns] } },
];
const changed = { 1: [store], 2: [limit], 3: [store, index], 4: [limit] } as const;

/** One disposition of a reconciliation submission. */
const disposition = (checkFinding: string, action: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  checkFinding, rationale: `The assessment of ${checkFinding} against the current source.`, communication: { mode: 'quiet' }, action, ...extra,
});
const submission = (dispositions: readonly unknown[], next: Record<string, unknown>, relations: readonly unknown[] = []) => ({
  relations: [...relations], dispositions: [...dispositions], next, brief: 'The concerns were assessed together.',
});
const reconcile = (...inputs: unknown[]): ScriptStep[] => inputs.map(input => ({ kind: 'submit', input }) as ScriptStep);

/** The candidates, with a fourth that corrects the limit. */
function correctedCandidates(): Record<string, ScriptedCommit> {
  const scripted = candidates();
  return {
    ...scripted,
    'revision-04': {
      tree: correctedTree, base: 'revision-03', changes: [{ status: 'M', path: limit }],
      files: { ...scripted['revision-03']!.files, [limit]: 'export export const limit = (text: string) => text.length <= 500;\n' },
    },
  };
}
const correctionGates = [...revisionGates, { commit: 'revision-04', changes: [{ status: 'M', path: limit }] }, unchanged, unchanged];

/** The three assignments, the completion request, a correction and a second completion request. */
const architect = (correction = true): ReadonlyArray<readonly ScriptStep[]> => [
  submit(assign(notes, { goal: 'Add the note store.' }, outline())),
  submit(assign(notes, { goal: 'State the note limit.' })),
  submit(assign(notes, { goal: 'Export the store.' })),
  submit(requestCompletion()),
  ...(correction ? [submit(assign(notes, { goal: 'Correct the note limit to 500 characters.', kind: 'repair' })), submit(requestCompletion())] : []),
];

function listOf(service: Awaited<ReturnType<typeof reviewRun>>['service'], runId: string): CheckFindingSummary[] {
  const list = service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all', limit: 100 });
  if (list === undefined || !list.ok || list.view.kind !== 'list') throw new Error('no list');
  return [...list.view.items];
}

async function committed<T>(root: string, runId: string, path: string): Promise<T> {
  return JSON.parse(await readFile(runPath(root, plan, runId, path), 'utf8')) as T;
}

/**
 * A person's answer to a pending decision, sent at the run's version and
 * sent again at the version each refusal names. The run may still append
 * after the decision becomes visible (the brief's completion, a lost
 * session's end), and each append moves the version; the CheckFinding's
 * revision is what guards the decision itself.
 */
async function answerAtCurrentVersion(
  service: Awaited<ReturnType<typeof reviewRun>>['service'],
  runId: string,
  payload: { readonly checkFinding: string; readonly expectedRevision: number; readonly request: string; readonly option: string },
) {
  let expectedVersion = service.getRun(plan, runId)!.version;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await service.execute({
        commandId: `answer-${payload.checkFinding}-${expectedVersion}`, expectedVersion, type: 'respond-to-check-finding',
        payload: { planId: plan, jobId: runId, responder: 'reviewer', ...payload },
      });
    } catch (error) {
      if (!(error instanceof CommandRejection) || error.code !== 'stale-version' || error.currentVersion === undefined || attempt >= 10) throw error;
      expectedVersion = error.currentVersion;
    }
  }
}

const reconcilerSessions = (agent: ScriptedAgent) => agent.sessions.filter(session => session.spec.prompt.startsWith('# Reconciliation'));

describe('CF08: nothing to assess', () => {
  test('clean reviews take the work item to its gate with no reconciliation and no assessment call', async () => {
    const root = await reviewTarget(cleanups);
    const run = await reviewRun(root, cleanups, {
      engineer: engineers.slice(0, 3),
      reviewers: { 'rq-0001': review(changed[1]), 'rq-0002': review(changed[2]), 'rq-0003': review(changed[3]) },
    });
    expect(onlyRun(run.service, plan).state).toBe('completed');
    const types = run.events.map(event => event.type);
    expect(types.filter(type => type.startsWith('reconciliation-'))).toEqual([]);
    expect(reconcilerSessions(run.agent!)).toEqual([]);
    // Every request settled before the gate; the gate followed the completion request.
    const completion = run.events.findIndex(event => event.type === 'outline-revised' && event.data.architectRef !== undefined);
    const gateAt = run.events.findIndex((event, position) => position > completion && event.type === 'gate-attempted');
    expect(eventsOf(run.events.slice(0, gateAt), 'review-attempt-finished')).toHaveLength(3);
    expect(eventsOf(run.events, 'work-item-completed')[0]!.data).toEqual({ workItem: 'wi-001', gate: expect.any(String) });
  }, 60_000);
});

describe('CF02, CF03 and CF12: one routine assessment', () => {
  test('parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice', async () => {
    const root = await reviewTarget(cleanups);
    const run = await reviewRun(root, cleanups, {
      policy: { concurrency: 1 },
      engineer: engineers.slice(0, 3),
      reviewers: {
        // cf-0001 and cf-0002: two distinct concerns about one file.
        'rq-0001': review(changed[1], [concern(store, 'The store is exported twice', 'high'), concern(store, 'The store could be a plain object', 'low')]),
        // cf-0003: a judgment the architect finds wrong.
        'rq-0002': review(changed[2], [concern(limit, 'The limit should count bytes', 'medium')]),
        // cf-0004: the same behavior as cf-0001, reported by another reader of a later candidate.
        'rq-0003': review(changed[3], [concern(store, 'The store has a doubled export keyword', 'high')]),
      },
      reconcilers: {
        'wi-001.rc01': reconcile(submission([
          disposition('cf-0001', { action: 'fixed', reassessed: ['cfr-0001'] }),
          disposition('cf-0004', { action: 'fixed', reassessed: ['cfr-0004'] }),
          disposition('cf-0002', { action: 'waive', uncertainty: 'A plain object would serve as well.' }, {
            communication: { mode: 'report', choice: 'The store stays a Map.', uncertainty: 'A plain object would serve as well.', reason: 'It departs from the reviewer\'s suggestion.' },
          }),
          disposition('cf-0003', { action: 'supersede', reassessed: ['cfr-0003'], replacement: 'The plan limits characters, not bytes.' }),
        ], { kind: 'complete' }, [
          { from: 'cf-0004', to: 'cf-0001', relation: 'same-issue', shared: 'The store module exports its store once.', evidence: [`${store}:1`], rationale: 'Both name the doubled export of the same declaration.' },
          { from: 'cf-0002', to: 'cf-0001', relation: 'related-but-distinct', shared: 'The store declaration.', evidence: [`${store}:1`], rationale: 'One is a defect, the other a simplification.' },
        ])),
      },
    });
    const { service, runId, events, agent } = run;
    expect(onlyRun(service, plan).state).toBe('completed');

    // One round, one fork at the architect's point after its completion request.
    const completion = eventsOf(events, 'outline-revised').find(event => event.data.architectRef !== undefined)!;
    expect(eventsOf(events, 'reconciliation-started').map(event => event.data)).toEqual([{ workItem: 'wi-001', reconciliation: 'wi-001.rc01', round: 1 }]);
    const basis = await committed<ReconciliationBasis>(root, runId, reconciliationLayout.basis('wi-001.rc01'));
    expect(basis).toMatchObject({
      round: 1, floor: 'any', source: { commit: 'revision-03', tree: finalReviewTree }, due: [],
      forkPoint: { kind: 'session', session: completion.data.architectRef!.session, ref: completion.data.architectRef!.ref },
      requests: [
        { request: 'rq-0001', attempt: 'rq-0001.a01', result: 'complete' },
        { request: 'rq-0002', attempt: 'rq-0002.a01', result: 'complete' },
        { request: 'rq-0003', attempt: 'rq-0003.a01', result: 'complete' },
      ],
    });
    // The attention set is in attention order: by risk, then credibility, then the most recent report.
    expect(basis.checkFindings.map(entry => entry.checkFinding)).toEqual(['cf-0004', 'cf-0001', 'cf-0003', 'cf-0002']);
    const [fork] = reconcilerSessions(agent!);
    expect(fork!.spec.session).toEqual({ mode: 'fork', from: completion.data.architectRef!.ref });
    expect(fork!.start).toEqual({ mode: 'fork' });
    expect(fork!.spec.submission.name).toBe('submit_reconciliation');
    expect(fork!.spec.prompt).toContain('This is the first round: a correction may be planned for any signal.');
    expect(fork!.spec.prompt).toContain('Risk: high; credibility: ungrounded');
    const opened = eventsOf(events, 'session-opened').find(event => event.data.fork?.reason === 'reconciliation')!;
    expect(opened.data.fork).toEqual({ from: { session: completion.data.architectRef!.session, invocation: completion.data.invocation }, reason: 'reconciliation', briefs: [] });

    // The relations and dispositions, committed as one line.
    const assessed = eventsOf(events, 'reconciliation-assessed');
    expect(assessed).toHaveLength(1);
    expect(assessed[0]!.data).toMatchObject({ reconciliation: 'wi-001.rc01', next: 'complete' });
    expect(assessed[0]!.data.checkFindings.map(event => event.type)).toEqual([
      'check-finding-related', 'check-finding-related', 'check-finding-decided', 'check-finding-decided', 'check-finding-decided', 'check-finding-decided',
    ]);
    const summaries = new Map(listOf(service, runId).map(summary => [summary.id, summary]));
    expect(summaries.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'fixed-by-assessment', group: { canonical: 'cf-0001', members: ['cf-0001', 'cf-0004'] } });
    expect(summaries.get('cf-0004')).toMatchObject({ standing: 'closed', reason: 'fixed-by-assessment', group: { canonical: 'cf-0001', members: ['cf-0001', 'cf-0004'] } });
    // Same file, distinct concerns: not grouped.
    expect(summaries.get('cf-0002')).toMatchObject({ standing: 'closed', reason: 'waived', group: null, materialChoice: { choice: 'The store stays a Map.' } });
    // A judgment superseded with no code change.
    expect(summaries.get('cf-0003')).toMatchObject({ standing: 'closed', reason: 'superseded' });
    const detail = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0001' });
    expect(detail).toMatchObject({ ok: true, view: { decisions: { items: [{
      actor: { kind: 'agent', role: 'local-architect', invocation: assessed[0]!.data.invocation },
      source: { kind: 'tree', id: finalReviewTree },
      evidence: [{ kind: 'reconciliation-submission', ref: runLayout.submission(assessed[0]!.data.invocation), hash: expect.stringMatching(/^sha256:/u) }],
    }] } } });
    const waiver = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0002' });
    expect(waiver).toMatchObject({ ok: true, view: { decisions: { items: [{ decision: { action: 'waive', authority: { kind: 'work-item-assessment', ref: 'wi-001.rc01' }, acceptedRisk: 'low' } }] } } });

    // The brief was appended to the architect's own session after the commit.
    const appended = eventsOf(events, 'reconciliation-brief-appended');
    expect(appended.map(event => event.data)).toEqual([{ reconciliation: 'wi-001.rc01', session: completion.data.architectRef!.session, ref: expect.any(String), outcome: 'appended', reason: null }]);
    expect(events.indexOf(appended[0]!)).toBeGreaterThan(events.indexOf(assessed[0]!));
    const record = await committed<ReconciliationAssessment>(root, runId, reconciliationLayout.assessment('wi-001.rc01'));
    expect(record.brief).toContain('cf-0003: supersede');
    expect(record).toMatchObject({ requestedStart: 'fork', actualStart: 'fork', next: 'complete', relations: ['cfl-0001', 'cfl-0002'] });

    // No human, and the gate still ran after the assessment and alone completed the work item.
    const workGate = eventsOf(events, 'gate-attempted').find(event => event.data.checkpoint === 'work-item')!;
    expect(events.indexOf(workGate)).toBeGreaterThan(events.indexOf(appended[0]!));
    expect(eventsOf(events, 'work-item-completed')[0]!.data).toEqual({ workItem: 'wi-001', gate: workGate.data.gate });
  }, 60_000);
});

describe('CF11 and CF15: a correction round, and the floor of the next', () => {
  test('a repair is planned with its intent, the architect assigns the correction, its acceptance claims the repair, and the next round fixes it within its floor', async () => {
    const root = await reviewTarget(cleanups);
    const run = await reviewRun(root, cleanups, {
      policy: { concurrency: 1 },
      commits: correctedCandidates(),
      gates: correctionGates,
      architect: architect(),
      engineer: engineers,
      reviewers: {
        'rq-0001': review(changed[1]),
        'rq-0002': review(changed[2], [concern(limit, 'The limit is 50 characters, and the plan asks for 500', 'high')]),
        'rq-0003': review(changed[3], [concern(store, 'The store could be a plain object', 'low')]),
        // The correction's own review raises one more low-risk signal.
        'rq-0004': review(changed[4], [concern(limit, 'The limit could be a named constant', 'low')]),
      },
      reconcilers: {
        'wi-001.rc01': reconcile(submission([
          disposition('cf-0001', { action: 'repair' }),
          disposition('cf-0002', { action: 'waive', uncertainty: 'Either shape serves.' }),
        ], { kind: 'correct', goal: 'Make the note limit 500 characters, as the plan asks.' })),
        'wi-001.rc02': reconcile(
          // A correction of a low-risk signal in a later round is refused, and returned to the fork.
          submission([
            disposition('cf-0001', { action: 'fixed', reassessed: ['cfr-0001'] }),
            disposition('cf-0003', { action: 'repair' }),
          ], { kind: 'correct', goal: 'Name the constant.' }),
          submission([
            disposition('cf-0001', { action: 'fixed', reassessed: ['cfr-0001'] }),
            disposition('cf-0003', { action: 'leave' }),
          ], { kind: 'unresolved' }),
        ),
      },
    });
    const { service, runId, events, agent } = run;
    expect(onlyRun(service, plan).state).toBe('completed');

    // Round 1 planned the repair with this reconciliation's intent.
    const [first, second] = eventsOf(events, 'reconciliation-assessed');
    expect(first!.data).toMatchObject({ reconciliation: 'wi-001.rc01', next: 'correct' });
    const planned = first!.data.checkFindings.find(event => event.type === 'check-finding-decided' && event.data.checkFinding === 'cf-0001');
    expect(planned).toMatchObject({ data: { decision: { decision: { action: 'plan-repair', repair: { kind: 'intent', ref: 'wi-001.rc01' } } } } });

    // The architect's own session was continued to assign the correction,
    // with the brief in its history, and the assignment resolves the intent.
    const parentTurns = agent!.sessions.filter(session => session.spec.role === 'local-architect' && !session.spec.prompt.startsWith('# Reconciliation'));
    const correctionTurn = parentTurns[5]!;
    expect(correctionTurn.spec.session.mode).toBe('continue');
    expect(correctionTurn.inherited.some(text => text.includes('Reconciliation wi-001.rc01 (round 1)'))).toBe(true);
    expect(correctionTurn.spec.prompt).toContain('## Reconciliation wi-001.rc01');
    expect(correctionTurn.spec.prompt).toContain('Make the note limit 500 characters, as the plan asks.');
    expect(correctionTurn.spec.prompt).toContain('Its brief was appended to your session.');
    const continued = eventsOf(events, 'invocation-started').find(event => event.data.continues?.reason === 'reconciliation');
    expect(continued!.data.continues!.briefs).toEqual(['wi-001.rc01']);
    const assigned = eventsOf(events, 'iteration-assigned');
    expect(assigned.map(event => event.data.corrects)).toEqual([undefined, undefined, undefined, 'wi-001.rc01']);

    // The correction closed accepted with the repair claim on its own line;
    // the CheckFinding stayed open until the next round fixed it.
    const closed = eventsOf(events, 'iteration-closed').find(event => event.data.iteration === 'wi-001.i04')!;
    expect(closed.data.checkFindings).toEqual([expect.objectContaining({
      type: 'check-finding-decided',
      data: expect.objectContaining({ checkFinding: 'cf-0001', decision: expect.objectContaining({ decision: { action: 'claim-repair', candidate: { kind: 'tree', id: correctedTree }, change: 'wi-001.i04' } }) }),
    })]);
    expect(eventsOf(events, 'review-request-recorded').map(event => event.data.iteration)).toEqual(['wi-001.i01', 'wi-001.i02', 'wi-001.i03', 'wi-001.i04']);

    // Round 2 has the later floor; its first submission was refused for a
    // correction below it, and the second left that signal open.
    const basis = await committed<ReconciliationBasis>(root, runId, reconciliationLayout.basis('wi-001.rc02'));
    expect(basis).toMatchObject({ round: 2, floor: 'non-low', source: { commit: 'revision-04', tree: correctedTree } });
    expect(basis.checkFindings.map(entry => entry.checkFinding)).toEqual(['cf-0001', 'cf-0003']);
    const [, refork] = reconcilerSessions(agent!);
    expect(refork!.spec.session).toEqual({ mode: 'fork', from: eventsOf(events, 'outline-revised').filter(event => event.data.architectRef !== undefined)[1]!.data.architectRef!.ref });
    expect(refork!.spec.prompt).toContain('A correction may be planned only for a signal of at least medium risk');
    expect(refork!.verdicts[0]).toMatchObject({ accepted: false });
    expect(JSON.stringify(refork!.verdicts[0])).toContain('correction-floor: cf-0003 is of low risk');
    expect(second!.data).toMatchObject({ reconciliation: 'wi-001.rc02', next: 'unresolved' });

    const summaries = new Map(listOf(service, runId).map(summary => [summary.id, summary]));
    expect(summaries.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'fixed-by-assessment' });
    expect(summaries.get('cf-0002')).toMatchObject({ standing: 'closed', reason: 'waived' });
    expect(summaries.get('cf-0003')).toMatchObject({ standing: 'open', reason: 'new', risk: 'low' });
    // The work item completed through its gate, naming what it left open.
    expect(eventsOf(events, 'work-item-completed')[0]!.data.unresolved).toEqual([{ checkFinding: 'cf-0003', reason: 'below-floor' }]);
    expect(eventsOf(events, 'gate-attempted').every(event => event.data.verdict === 'passed')).toBe(true);
    run.git.assertComplete();
  }, 60_000);

  test('at the last round no correction is planned, what is open stays unresolved, and a signal raised after it does not block completion', async () => {
    const root = await reviewTarget(cleanups);
    let raised = false;
    let service!: Awaited<ReturnType<typeof reviewRun>>['service'];
    const run = await reviewRun(root, cleanups, {
      detached: true,
      limits: { reconciliationRoundsPerWorkItem: 1 },
      engineer: engineers.slice(0, 3),
      reviewers: {
        'rq-0001': review(changed[1]),
        'rq-0002': review(changed[2], [concern(limit, 'The limit is 50 characters, and the plan asks for 500', 'high')]),
        'rq-0003': review(changed[3]),
      },
      reconcilers: {
        'wi-001.rc01': reconcile(
          submission([disposition('cf-0001', { action: 'repair' })], { kind: 'correct', goal: 'Correct the limit.' }),
          submission([disposition('cf-0001', { action: 'leave' })], { kind: 'unresolved' }),
        ),
      },
      afterWrite: async (write, runId) => {
        // A signal raised while the work item's gate runs, after the last basis.
        if (write !== 'gate-committed' || raised) return;
        if (!(await runEventsOnDisk(root, plan, runId)).some(event => event.type === 'reconciliation-assessed')) return;
        raised = true;
        await service.recordCheckFindings(plan, runId, { cause: { kind: 'producer', producer: 'review:code', attempt: 'late' }, commands: [report(boundConcern({ attempt: 'late', tree: finalReviewTree }))] });
      },
    });
    service = run.service;
    cleanups.push(() => run.service.close());
    await run.service.settled(plan, run.runId);
    const events = await runEventsOnDisk(root, plan, run.runId);
    const { runId, agent } = run;
    expect(raised).toBe(true);
    expect(onlyRun(service, plan).state).toBe('completed');
    expect(await committed<ReconciliationBasis>(root, runId, reconciliationLayout.basis('wi-001.rc01'))).toMatchObject({ floor: 'none' });
    expect(JSON.stringify(reconcilerSessions(agent!)[0]!.verdicts[0])).toContain('correction-floor');
    expect(eventsOf(events, 'reconciliation-started')).toHaveLength(1);
    expect(eventsOf(events, 'reconciliation-refused')).toEqual([]);
    expect(eventsOf(events, 'work-item-completed')[0]!.data.unresolved).toEqual([
      { checkFinding: 'cf-0001', reason: 'rounds-exhausted' },
      { checkFinding: 'cf-0002', reason: 'raised-after-last-round' },
    ]);
    // The gates keep their verdicts, and the run completes.
    expect(eventsOf(events, 'gate-attempted').every(event => event.data.verdict === 'passed')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'job-completed' });
  }, 60_000);
});

describe('CF12: a strong authority conflict asks the user, with exact references', () => {
  test('the conflict cites the plan\'s exact text and revision, the work item waits for the answer, and the next round assesses it', async () => {
    const root = await reviewTarget(cleanups);
    const conflict = 'A note belongs to exactly one review run.';
    const options = [
      { id: 'one-note', summary: 'Keep one note per review run', consequence: 'The plan stands; the reviewer\'s request is declined.' },
      { id: 'many-notes', summary: 'Allow several notes', consequence: 'The plan\'s constraint changes, which a person must approve.' },
    ];
    const ask = (text: string) => submission([disposition('cf-0001', { action: 'request-user-decision', conflicts: [{ document: 'plan', text }], options })], { kind: 'await-user' });
    const run = await reviewRun(root, cleanups, {
      detached: true,
      engineer: engineers.slice(0, 3),
      reviewers: {
        'rq-0001': review(changed[1], [concern(store, 'A review run should keep several notes', 'high')]),
        'rq-0002': review(changed[2]),
        'rq-0003': review(changed[3]),
      },
      reconcilers: {
        // The first citation is not the plan's text, and is returned to the fork.
        'wi-001.rc01': reconcile(ask('A note belongs to one run.'), ask(conflict)),
        'wi-001.rc02': reconcile(submission([
          disposition('cf-0001', { action: 'waive', uncertainty: 'None: the user chose.' }),
        ], { kind: 'complete' })),
      },
    });
    cleanups.push(() => run.service.close());
    const { service, runId } = run;
    const pending = () => {
      const detail = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0001' });
      return detail?.ok === true && detail.view.kind === 'detail' && detail.view.summary.pendingUserDecision !== null ? detail.view : undefined;
    };
    await until(() => pending() !== undefined);
    const waiting = pending()!;
    const planText = await readFile(runPath(root, plan, runId, runLayout.capturedPlan), 'utf8');
    const { createHash } = await import('node:crypto');
    expect(waiting.decisions.items.at(-1)).toMatchObject({
      decision: {
        action: 'request-user-decision', authority: { kind: 'work-item-assessment', ref: 'wi-001.rc01' }, options,
        conflicts: [{ text: conflict, document: 'plan', revision: `sha256:${createHash('sha256').update(planText).digest('hex')}` }],
      },
    });
    expect(JSON.stringify(reconcilerSessions(run.agent!)[0]!.verdicts[0])).toContain('cite the conflicting text exactly');
    // The work item waits: no gate has run since the assessment.
    await new Promise(resolve => setTimeout(resolve, 200));
    const before = await runEventsOnDisk(root, plan, runId);
    const assessedAt = before.findIndex(event => event.type === 'reconciliation-assessed');
    expect(before.slice(assessedAt).some(event => event.type === 'gate-attempted' || event.type === 'work-item-completed')).toBe(false);
    expect(before[assessedAt]).toMatchObject({ data: { next: 'await-user' } });

    // A person answers through the protocol's command; the next round assesses the answer and settles it.
    // A reader may still append while the person answers; the answer is sent again at the version its refusal names.
    const receipt = await answerAtCurrentVersion(service, runId, {
      checkFinding: 'cf-0001', expectedRevision: waiting.summary.revision, request: waiting.summary.pendingUserDecision!, option: 'one-note',
    });
    expect((await runEventsOnDisk(root, plan, runId)).find(event => event.sequence === receipt.sequence))
      .toMatchObject({ type: 'check-findings-recorded', data: { cause: { kind: 'user-command', command: { commandId: receipt.commandId } } } });
    await service.settled(plan, runId);
    const events = await runEventsOnDisk(root, plan, runId);
    expect(onlyRun(service, plan).state).toBe('completed');
    expect(eventsOf(events, 'reconciliation-assessed').map(event => [event.data.reconciliation, event.data.next])).toEqual([
      ['wi-001.rc01', 'await-user'], ['wi-001.rc02', 'complete'],
    ]);
    expect(listOf(service, runId).find(summary => summary.id === 'cf-0001')).toMatchObject({ standing: 'closed', reason: 'waived' });
    expect(eventsOf(events, 'work-item-completed')[0]!.data.unresolved).toBeUndefined();
  }, 60_000);
});

describe('CF09 and CF16: a basis that no longer holds', () => {
  test('a changed revision refuses the assessment, a changed source and a later signal refuse completion, and a waiver outside the module is refused', async () => {
    const root = await reviewTarget(cleanups);
    let service!: Awaited<ReturnType<typeof reviewRun>>['service'];
    let runId = '';
    let raised = false;
    const userWaiver: ScriptStep = {
      kind: 'await',
      until: async () => {
        // While the fork assesses, a person waives cf-0001.
        await service.recordCheckFindings(plan, runId, {
          cause: { kind: 'user-response', command: 'waive-1' },
          commands: [dispose('cf-0001', 1, decision(
            { action: 'waive', authority: { kind: 'user-decision', ref: 'waive-1' }, acceptedRisk: 'high', uncertainty: 'The reviewer may be right.' },
            { actor: { kind: 'user', name: 'reviewer' } },
          ))],
        });
      },
    };
    const run = await reviewRun(root, cleanups, {
      detached: true,
      commits: {
        ...candidates(),
        // The work item's gate commits a change to the store, not a rendered feature file.
        'revision-04': { tree: correctedTree, base: 'revision-03', changes: [{ status: 'M', path: store }], files: candidates()['revision-03']!.files },
      },
      gates: [...revisionGates, { commit: 'revision-04', changes: [{ status: 'M', path: store }] }, unchanged, unchanged, unchanged],
      engineer: engineers.slice(0, 3),
      reviewers: {
        'rq-0001': review(changed[1]),
        'rq-0002': review(changed[2], [concern(limit, 'The limit is 50 characters, and the plan asks for 500', 'high')]),
        'rq-0003': review(changed[3], [concern(store, 'The store is not frozen', 'medium')]),
      },
      reconcilers: {
        'wi-001.rc01': [userWaiver, ...reconcile(submission([
          disposition('cf-0001', { action: 'waive', uncertainty: 'The limit is a detail.' }),
          disposition('cf-0002', { action: 'waive', uncertainty: 'Nothing mutates it.' }),
        ], { kind: 'complete' }))],
        'wi-001.rc02': reconcile(submission([
          disposition('cf-0002', { action: 'defer', revisit: 'When a caller mutates the store.' }),
        ], { kind: 'complete' })),
        'wi-001.rc03': reconcile(
          // cf-0003 concerns another module: this architect cannot waive it.
          submission([disposition('cf-0003', { action: 'waive', uncertainty: 'Not ours.' })], { kind: 'complete' }),
          submission([disposition('cf-0003', { action: 'leave' })], { kind: 'unresolved' }),
        ),
      },
      afterWrite: async (write, id) => {
        if (write !== 'gate-committed' || raised) return;
        const log = await runEventsOnDisk(root, plan, id);
        if (!log.some(event => event.type === 'reconciliation-refused' && event.data.stage === 'completion')) return;
        raised = true;
        await service.recordCheckFindings(plan, id, {
          cause: { kind: 'producer', producer: 'review:code', attempt: 'late' },
          commands: [report(boundConcern({ attempt: 'late', tree: correctedTree, summary: 'The cart module reads the notes store' }))],
        });
      },
    });
    service = run.service;
    runId = run.runId;
    cleanups.push(() => run.service.close());
    await service.settled(plan, runId);
    const events = await runEventsOnDisk(root, plan, runId);
    expect(onlyRun(service, plan).state).toBe('completed');

    // rc01 was refused at its commit: cf-0001 moved while the fork assessed it.
    const refused = eventsOf(events, 'reconciliation-refused').map(event => event.data);
    expect(refused[0]).toMatchObject({ reconciliation: 'wi-001.rc01', stage: 'assessment', reason: 'cf-0001 is at revision 2, not 1' });
    expect(eventsOf(events, 'reconciliation-assessed').map(event => event.data.reconciliation)).toEqual(['wi-001.rc02', 'wi-001.rc03']);
    const rc02 = await committed<ReconciliationBasis>(root, runId, reconciliationLayout.basis('wi-001.rc02'));
    expect(rc02.checkFindings).toEqual([{ checkFinding: 'cf-0002', revision: 1 }]);
    // The work item's first gate audited a changed store: its completion was refused.
    expect(refused[1]).toMatchObject({ reconciliation: 'wi-001.rc02', stage: 'completion', reason: expect.stringContaining(`${store} changed between the reconciled source revision-03 and the gate's revision-04`) });
    // The second gate met a signal raised after the basis: a round remained, and it was refused again.
    expect(refused[2]).toMatchObject({ stage: 'completion', reason: 'a CheckFinding became open after the basis' });
    expect(refused).toHaveLength(3);
    // The last round could not waive a signal of another module.
    const [, , last] = reconcilerSessions(run.agent!);
    expect(JSON.stringify(last!.verdicts[0])).toContain('insufficient-authority: cf-0003 concerns project/cart');
    const summaries = new Map(listOf(service, runId).map(summary => [summary.id, summary]));
    expect(summaries.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'waived' });
    expect(summaries.get('cf-0002')).toMatchObject({ standing: 'deferred', reason: 'deferred' });
    expect(summaries.get('cf-0003')).toMatchObject({ standing: 'open', modules: ['project/cart'] });
    expect(eventsOf(events, 'work-item-completed')[0]!.data.unresolved).toEqual([{ checkFinding: 'cf-0003', reason: 'rounds-exhausted' }]);
    // Three work-item gates ran, each with its own verdict.
    expect(eventsOf(events, 'gate-attempted').filter(event => event.data.checkpoint === 'work-item').map(event => event.data.verdict)).toEqual(['passed', 'passed', 'passed']);
  }, 60_000);
});

/** The correction scenario's reviewers and forks: cf-0001 repaired in round 1, fixed in round 2. */
const correctionScenario = {
  policy: { concurrency: 1 },
  commits: correctedCandidates(),
  gates: correctionGates,
  architect: architect(),
  engineer: engineers,
  reviewers: {
    'rq-0001': review(changed[1]),
    'rq-0002': review(changed[2], [concern(limit, 'The limit is 50 characters, and the plan asks for 500', 'high')]),
    'rq-0003': review(changed[3]),
    'rq-0004': review(changed[4]),
  },
  reconcilers: {
    'wi-001.rc01': reconcile(submission([disposition('cf-0001', { action: 'repair' })], { kind: 'correct', goal: 'Make the note limit 500 characters.' })),
    'wi-001.rc02': reconcile(submission([disposition('cf-0001', { action: 'fixed', reassessed: ['cfr-0001'] })], { kind: 'complete' })),
  },
} as const;

describe('CF10: a missing fork point and a failed brief append', () => {
  test('a fork point that no longer exists starts fresh with the whole packet, and a brief that cannot be appended reaches the next architect input from the log', async () => {
    const root = await reviewTarget(cleanups);
    const run = await reviewRun(root, cleanups, {
      ...correctionScenario,
      agentReady: agent => {
        const start = agent.startSession.bind(agent);
        // The architect's session is lost before the first reconciliation forks it.
        agent.startSession = spec => {
          if (spec.prompt.startsWith('# Reconciliation wi-001.rc01') && spec.session.mode === 'fork') agent.forget(spec.session.from);
          return start(spec);
        };
      },
    });
    const { service, runId, events, agent } = run;
    expect(onlyRun(service, plan).state).toBe('completed');

    const [first, second] = reconcilerSessions(agent!);
    expect(first!.spec.session.mode).toBe('fork');
    expect(first!.start).toMatchObject({ mode: 'fresh', degradedReason: expect.stringContaining('not known') });
    expect(first!.spec.prompt).toContain('## CheckFindings needing attention (1)');
    const record = await committed<ReconciliationAssessment>(root, runId, reconciliationLayout.assessment('wi-001.rc01'));
    expect(record).toMatchObject({ requestedStart: 'fork', actualStart: 'fresh' });
    const forkEnded = eventsOf(events, 'invocation-ended').find(event => event.data.invocation === record.invocation)!;
    expect(forkEnded.data.degraded).toMatchObject({ requested: 'fork', actual: 'fresh' });

    // The decisions were committed; the append found the session lost, and the session was finished as lost.
    const appended = eventsOf(events, 'reconciliation-brief-appended');
    expect(appended[0]!.data).toMatchObject({ reconciliation: 'wi-001.rc01', outcome: 'session-lost', ref: null });
    expect(eventsOf(events, 'session-finished').some(event => event.data.session === appended[0]!.data.session && event.data.reason === 'lost')).toBe(true);
    // The next architect turn starts fresh, and its input carries the brief from the log.
    const parentTurns = agent!.sessions.filter(session => session.spec.role === 'local-architect' && !session.spec.prompt.startsWith('# Reconciliation'));
    const correctionTurn = parentTurns[5]!;
    expect(correctionTurn.spec.session).toEqual({ mode: 'fresh' });
    expect(correctionTurn.spec.prompt).toContain('could not be appended to your session (session-lost');
    expect(correctionTurn.spec.prompt).toContain('> Reconciliation wi-001.rc01 (round 1)');
    // The second round forks the new session's point, and its brief lands.
    expect(second!.start).toEqual({ mode: 'fork' });
    expect(appended[1]!.data).toMatchObject({ reconciliation: 'wi-001.rc02', outcome: 'appended' });
    expect(listOf(service, runId)[0]).toMatchObject({ id: 'cf-0001', standing: 'closed', reason: 'fixed-by-assessment' });
  }, 60_000);
});

describe('CF10: the brief append outcomes that land nothing', () => {
  test('an append the executor fails is recorded as failed, the session is kept, and the next architect input carries the brief from the log', async () => {
    const root = await reviewTarget(cleanups);
    const run = await reviewRun(root, cleanups, {
      ...correctionScenario,
      agentReady: agent => {
        const append = agent.appendContext.bind(agent);
        agent.appendContext = async (ref, key, text) => {
          if (key === 'brief:wi-001.rc01') throw new Error('the executor refused the append');
          return append(ref, key, text);
        };
      },
    });
    const { service, runId, events, agent } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    const appended = eventsOf(events, 'reconciliation-brief-appended');
    expect(appended.map(event => event.data)).toEqual([
      { reconciliation: 'wi-001.rc01', session: expect.any(String), ref: null, outcome: 'failed', reason: 'the executor refused the append' },
      { reconciliation: 'wi-001.rc02', session: appended[0]!.data.session, ref: expect.any(String), outcome: 'appended', reason: null },
    ]);
    // Unlike a lost session, a failed append keeps it: the correction turn
    // continues it, and its input quotes the brief from the log.
    expect(eventsOf(events, 'session-finished').some(event => event.data.session === appended[0]!.data.session && event.data.reason === 'lost')).toBe(false);
    const parentTurns = agent!.sessions.filter(session => session.spec.role === 'local-architect' && !session.spec.prompt.startsWith('# Reconciliation'));
    const correctionTurn = parentTurns[5]!;
    expect(correctionTurn.spec.session.mode).toBe('continue');
    expect(correctionTurn.inherited.some(text => text.includes('Reconciliation wi-001.rc01'))).toBe(false);
    expect(correctionTurn.spec.prompt).toContain('could not be appended to your session (failed: the executor refused the append)');
    expect(correctionTurn.spec.prompt).toContain('> Reconciliation wi-001.rc01 (round 1)');
    expect(listOf(service, runId)[0]).toMatchObject({ id: 'cf-0001', standing: 'closed', reason: 'fixed-by-assessment' });
  }, 60_000);

  test('a round after the architect\'s session was lost has no session to append to, and records no-session', async () => {
    const root = await reviewTarget(cleanups);
    const options = [
      { id: 'one-note', summary: 'Keep one note per review run', consequence: 'The plan stands.' },
      { id: 'many-notes', summary: 'Allow several notes', consequence: 'The plan changes.' },
    ];
    const run = await reviewRun(root, cleanups, {
      detached: true,
      engineer: engineers.slice(0, 3),
      reviewers: {
        'rq-0001': review(changed[1], [concern(store, 'A review run should keep several notes', 'high')]),
        'rq-0002': review(changed[2]),
        'rq-0003': review(changed[3]),
      },
      agentReady: agent => {
        const start = agent.startSession.bind(agent);
        // The architect's session is lost before the first reconciliation forks it.
        agent.startSession = spec => {
          if (spec.prompt.startsWith('# Reconciliation wi-001.rc01') && spec.session.mode === 'fork') agent.forget(spec.session.from);
          return start(spec);
        };
      },
      reconcilers: {
        'wi-001.rc01': reconcile(submission([
          disposition('cf-0001', { action: 'request-user-decision', conflicts: [{ document: 'plan', text: 'A note belongs to exactly one review run.' }], options }),
        ], { kind: 'await-user' })),
        'wi-001.rc02': reconcile(submission([disposition('cf-0001', { action: 'waive', uncertainty: 'None: the user chose.' })], { kind: 'complete' })),
      },
    });
    cleanups.push(() => run.service.close());
    const { service, runId } = run;
    const pending = () => {
      const detail = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0001' });
      return detail?.ok === true && detail.view.kind === 'detail' && detail.view.summary.pendingUserDecision !== null ? detail.view.summary : undefined;
    };
    await until(() => pending() !== undefined);
    const waiting = pending()!;
    // The decision is visible once the assessment is committed; the brief's
    // completion and the lost session's end are appended after it.
    await answerAtCurrentVersion(service, runId, {
      checkFinding: 'cf-0001', expectedRevision: waiting.revision, request: waiting.pendingUserDecision!, option: 'one-note',
    });
    await service.settled(plan, runId);
    const events = await runEventsOnDisk(root, plan, runId);
    expect(onlyRun(service, plan).state).toBe('completed');
    // Round 1's append found the session lost and finished it; round 2 came
    // straight after the answer, with no architect turn to start another.
    expect(eventsOf(events, 'reconciliation-brief-appended').map(event => [event.data.reconciliation, event.data.outcome, event.data.session])).toEqual([
      ['wi-001.rc01', 'session-lost', expect.any(String)],
      ['wi-001.rc02', 'no-session', null],
    ]);
    expect(eventsOf(events, 'reconciliation-brief-appended')[1]!.data.reason).toContain('was not kept');
    const record = await committed<ReconciliationAssessment>(root, runId, reconciliationLayout.assessment('wi-001.rc02'));
    expect(record).toMatchObject({ parent: null, next: 'complete' });
    // The decisions were committed all the same, and the gate completed the work item.
    expect(listOf(service, runId)[0]).toMatchObject({ id: 'cf-0001', standing: 'closed', reason: 'waived' });
    expect(eventsOf(events, 'work-item-completed')[0]!.data.unresolved).toBeUndefined();
  }, 60_000);
});

/** A service opened over the crashed project, with the agent that held the architect's session. */
async function restart(root: string, agent: ScriptedAgent) {
  const restarted = await openRuns(root, {
    agent,
    git: mockGit({ changedPaths: async () => [], currentHead: async () => 'revision-03' }),
    candidates: scriptedCandidates(root, candidates()),
    policy: projectRoot => testPolicy(projectRoot, { reviews: testReviewPolicy() }),
  });
  cleanups.push(() => restarted.service.close());
  return restarted;
}

/** A run that crashes around the first reconciliation's brief append, restarted and restarted again. */
async function crashAroundAppend(when: 'before' | 'after'): Promise<void> {
  const root = await reviewTarget(cleanups);
  const crashed = gate();
  let scripted!: ScriptedAgent;
  let append!: ScriptedAgent['appendContext'];
  const run = await reviewRun(root, cleanups, {
    ...correctionScenario,
    detached: true,
    agentReady: agent => {
      scripted = agent;
      append = agent.appendContext.bind(agent);
      agent.appendContext = async (ref, key, text) => {
        if (key !== 'brief:wi-001.rc01') return append(ref, key, text);
        if (when === 'after') await append(ref, key, text);
        crashed.open();
        return new Promise(() => undefined);
      };
    },
  });
  await crashed.opened;
  await new Promise(resolve => setTimeout(resolve, 200));
  const before = await runEventsOnDisk(root, plan, run.runId);
  expect(before.at(-1)).toMatchObject({ type: 'reconciliation-assessed', data: { reconciliation: 'wi-001.rc01', next: 'correct' } });
  await staleCrashLock(root);

  scripted.appendContext = append;
  const restarted = await restart(root, scripted);
  expect(restarted.recovery.effects).toEqual([`${plan}/${run.runId}: the parent append of reconciliation wi-001.rc01`]);
  const after = await runEventsOnDisk(root, plan, run.runId);
  const recovered = after.slice(before.length);
  expect(recovered[0]).toMatchObject({ type: 'reconciliation-brief-appended', data: { reconciliation: 'wi-001.rc01', outcome: when === 'before' ? 'appended' : 'already-present' } });
  expect(recovered.at(-1)).toMatchObject({ type: 'job-interrupted' });
  // No second assessment, and the brief is in the architect's session once.
  expect(eventsOf(after, 'reconciliation-assessed')).toHaveLength(1);
  const parent = eventsOf(after, 'outline-revised').find(event => event.data.architectRef !== undefined)!.data.architectRef!;
  expect(await append(parent.ref, 'brief:wi-001.rc01', 'again')).toMatchObject({ outcome: 'already-present' });
  // The repair decision kept its intent, recoverable after the crash.
  const detail = restarted.service.checkFindings(plan, run.runId, { kind: 'detail', checkFinding: 'cf-0001' });
  expect(detail).toMatchObject({ ok: true, view: { summary: { standing: 'open', reason: 'repair-planned', repair: { kind: 'intent', ref: 'wi-001.rc01' } } } });

  // A second restart finds nothing to do.
  await restarted.service.close();
  cleanups.pop();
  const again = await restart(root, scripted);
  expect(again.recovery.effects).toEqual([]);
  expect(await runEventsOnDisk(root, plan, run.runId)).toEqual(after);
}

describe('CF10 and CF11: a crash between the decisions and the brief', () => {
  test('a crash before the parent append is recovered once from the committed assessment, and the repair keeps its intent', () => crashAroundAppend('before'), 60_000);
  test('a crash after the parent append is recovered once from the committed assessment, and the repair keeps its intent', () => crashAroundAppend('after'), 60_000);
});

describe('CF15: a work item\'s review deadline', () => {
  test('a reader still running at the deadline is fenced and stopped, the queue stays open, and the correction\'s review still runs', async () => {
    const root = await reviewTarget(cleanups);
    const reading = gate();
    const run = await reviewRun(root, cleanups, {
      ...correctionScenario,
      policy: { concurrency: 2, attemptMs: 60_000, settleMs: 400 },
      architect: [
        ...architect().slice(0, 3),
        // The completion request comes while the third reader is running.
        [{ kind: 'await', until: () => reading.opened }, ...submit(requestCompletion())],
        ...architect().slice(4),
      ],
      reviewers: {
        ...correctionScenario.reviewers,
        'rq-0003': [tool(snapshotToolNames.diff, { path: store }), { kind: 'await', until: async () => { reading.open(); } }, never()],
      },
    });
    const { service, runId, events } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    const finished = eventsOf(events, 'review-attempt-finished');
    expect(finished.find(event => event.data.request === 'rq-0003')!.data).toMatchObject({ result: 'not-verified', reason: 'deadline', settles: true });
    const started = eventsOf(events, 'review-attempt-started').find(event => event.data.request === 'rq-0003')!;
    // Its reader was stopped, and its session is finished.
    const sessions = reduceSessions(events);
    expect(sessions.get(started.data.session)!.state).toBe('finished');
    // The deadline gap is in the basis, and the correction's own review ran after it.
    const basis = await committed<ReconciliationBasis>(root, runId, reconciliationLayout.basis('wi-001.rc01'));
    expect(basis.requests.find(request => request.request === 'rq-0003')).toEqual({ request: 'rq-0003', attempt: 'rq-0003.a01', result: 'not-verified' });
    expect(finished.find(event => event.data.request === 'rq-0004')!.data).toMatchObject({ result: 'complete' });
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 4, complete: 3, partial: 0, notVerified: 1, pending: 0 });
  }, 60_000);
});
