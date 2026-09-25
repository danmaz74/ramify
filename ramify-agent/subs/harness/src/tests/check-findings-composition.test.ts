import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ScriptedAgent } from '../../subs/agent/src/scripted.js';
import { replayCheckFindingEvents } from '../../subs/check-findings/src/replay.js';
import { selectCheckFindings } from '../../subs/check-findings/src/queries.js';
import { carriedCheckFindings, type RunEvent } from '../run/log.js';
import type { ReconciliationBasis } from '../reviews/reconciliation.js';
import { runLayout, type RunPolicy } from '../run/records.js';
import { reconciliationLayout } from '../reviews/reconciliation.js';
import { snapshotToolNames } from '../reviews/snapshot.js';
import {
  compositionCommits, compositionGates, compositionScenario, compositionTarget, concerns, disposition, principles, reconcile, review, submission, summariesOf, tagLimit,
  tags, tagsReadme,
} from './helpers/check-findings-composition.js';
import { compositionMeasurements } from './helpers/check-findings-measurements.js';
import { scriptedCandidates, testReviewPolicy } from './helpers/candidates.js';
import { identityOf, logLines, recordText, recoveryCompletions, runDirectory } from './helpers/composition.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { mockGit } from './helpers/mock-git.js';
import { eventsOf, gate, notes, plan, reviewRun, tool } from './helpers/reviews.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, staleCrashLock, testPolicy, until } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * The composed CheckFinding run of Plan 12 iteration 8: one clean work item
 * and one with concurrent code, scope and design concerns, an accepted
 * correction and a later changed candidate, driven end to end through the
 * run service. Every gate keeps its own verdict; the CheckFinding history,
 * the reviews' coverage and the reconciliation rounds are read back from
 * the run's queries and records, and the run's measurements are computed
 * from its log.
 *
 * The agent is the scripted fake, Git's answers for the gates and the
 * candidates are scripted, and no process is started. Set
 * `PLAN12_MEASUREMENTS_EXPORT=<file>` to write the measurements as JSON.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

/** The policy the run captured, from its record. */
async function capturedPolicy(root: string, runId: string): Promise<RunPolicy> {
  return (JSON.parse(await readFile(runPath(root, plan, runId, runLayout.record), 'utf8')) as { policy: RunPolicy }).policy;
}

const reconcilerSessions = (agent: ScriptedAgent) => agent.sessions.filter(session => session.spec.prompt.startsWith('# Reconciliation'));

describe('the composed run: a clean work item and a corrected one', () => {
  test('wi-001 reaches its gate with no reconciliation; wi-002\'s concurrent concerns are related, settled, corrected and fixed, and every gate keeps its verdict', async () => {
    const root = await compositionTarget(cleanups);
    const run = await reviewRun(root, cleanups, compositionScenario(root));
    const { service, runId, events, agent } = run;
    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');

    // Twelve requests, three per accepted iteration, one candidate each.
    const requests = eventsOf(events, 'review-request-recorded');
    expect(requests.map(event => [event.data.request, event.data.iteration, event.data.kind, event.data.candidate])).toEqual([
      ['rq-0001', 'wi-001.i01', 'code', 'revision-01'], ['rq-0002', 'wi-001.i01', 'scope', 'revision-01'], ['rq-0003', 'wi-001.i01', 'design', 'revision-01'],
      ['rq-0004', 'wi-002.i01', 'code', 'revision-02'], ['rq-0005', 'wi-002.i01', 'scope', 'revision-02'], ['rq-0006', 'wi-002.i01', 'design', 'revision-02'],
      ['rq-0007', 'wi-002.i02', 'code', 'revision-03'], ['rq-0008', 'wi-002.i02', 'scope', 'revision-03'], ['rq-0009', 'wi-002.i02', 'design', 'revision-03'],
      ['rq-0010', 'wi-002.i03', 'code', 'revision-04'], ['rq-0011', 'wi-002.i03', 'scope', 'revision-04'], ['rq-0012', 'wi-002.i03', 'design', 'revision-04'],
    ]);
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 12, complete: 12, partial: 0, notVerified: 0, pending: 0 });

    // wi-001: clean reviews, no reconciliation, its gate completes it.
    const started = eventsOf(events, 'reconciliation-started');
    expect(started.map(event => event.data.reconciliation)).toEqual(['wi-002.rc01', 'wi-002.rc02']);
    expect(eventsOf(events, 'work-item-completed').map(event => [event.data.workItem, event.data.unresolved])).toEqual([
      ['wi-001', undefined],
      ['wi-002', [{ checkFinding: 'cf-0005', reason: 'below-floor' }]],
    ]);

    // The three readers of wi-002's second candidate overlapped.
    const attempt = (request: string) => ({
      started: eventsOf(events, 'review-attempt-started').find(event => event.data.request === request)!.sequence,
      finished: eventsOf(events, 'review-attempt-finished').find(event => event.data.request === request)!.sequence,
    });
    expect(attempt('rq-0008').started).toBeLessThan(attempt('rq-0007').finished);
    // No more readers than the policy's two ever ran at once.
    let open = 0;
    let most = 0;
    for (const event of events) {
      if (event.type === 'review-attempt-started') most = Math.max(most, ++open);
      if (event.type === 'review-attempt-finished' && eventsOf(events, 'review-attempt-started').some(start => start.data.attempt === event.data.attempt)) open -= 1;
    }
    expect(most).toBe(2);

    // The signals: risk from the reader, credibility and modules bound by the harness.
    const summaries = new Map(summariesOf(service, runId).map(summary => [summary.id, summary]));
    expect([...summaries.values()].map(summary => [summary.id, summary.risk, summary.credibility, summary.modules, summary.standing, summary.reason])).toEqual([
      ['cf-0001', 'high', 'ungrounded', [tags], 'closed', 'fixed-by-assessment'],
      ['cf-0002', 'low', 'ungrounded', [tags], 'closed', 'waived'],
      ['cf-0003', 'medium', 'agent-generated', [tags], 'closed', 'superseded'],
      ['cf-0004', 'high', 'human-reviewed', [tags], 'closed', 'fixed-by-assessment'],
      ['cf-0005', 'low', 'ungrounded', [tags], 'open', 'new'],
    ]);
    // Two reports of one behavior, grouped with rationale; same-file distinct concerns stay apart.
    expect(summaries.get('cf-0001')!.group).toEqual({ canonical: 'cf-0001', members: ['cf-0001', 'cf-0004'] });
    expect(summaries.get('cf-0002')).toMatchObject({ group: null, materialChoice: { choice: 'The limit takes the text as given.' } });

    // Round 1 planned the correction; its acceptance claimed the repair on
    // the later candidate; round 2 fixed it within the non-low floor.
    const basis = (id: string) => readFile(runPath(root, plan, runId, reconciliationLayout.basis(id)), 'utf8').then(text => JSON.parse(text) as ReconciliationBasis);
    expect(await basis('wi-002.rc01')).toMatchObject({ round: 1, floor: 'any', source: { commit: 'revision-03', tree: '3'.repeat(40) } });
    expect((await basis('wi-002.rc01')).checkFindings.map(entry => entry.checkFinding)).toEqual(['cf-0004', 'cf-0001', 'cf-0003', 'cf-0002']);
    expect(await basis('wi-002.rc02')).toMatchObject({ round: 2, floor: 'non-low', source: { commit: 'revision-04', tree: '4'.repeat(40) } });
    const closed = eventsOf(events, 'iteration-closed').find(event => event.data.iteration === 'wi-002.i03')!;
    expect(closed.data.checkFindings!.map(event => [event.type, event.type === 'check-finding-decided' ? event.data.checkFinding : null])).toEqual([
      ['check-finding-decided', 'cf-0001'], ['check-finding-decided', 'cf-0004'],
    ]);
    expect(eventsOf(events, 'iteration-assigned').map(event => [event.data.iteration, event.data.corrects])).toEqual([
      ['wi-001.i01', undefined], ['wi-002.i01', undefined], ['wi-002.i02', undefined], ['wi-002.i03', 'wi-002.rc01'],
    ]);
    // Each round forked the architect's point after its completion request.
    expect(reconcilerSessions(agent!).map(session => session.start)).toEqual([{ mode: 'fork' }, { mode: 'fork' }]);

    // The design concern is grounded in the principles document it read; the scope concern in the README.
    const detail = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0004' });
    expect(detail).toMatchObject({ ok: true, view: { reports: { items: [{ judgment: { ground: { ref: principles } } }] } } });
    expect(service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0003' }))
      .toMatchObject({ ok: true, view: { reports: { items: [{ judgment: { ground: { ref: tagsReadme } } }] } } });
    expect(JSON.stringify(agent!.sessions.find(session => session.spec.prompt.includes('Design review rq-0009'))!.results))
      .toContain(snapshotToolNames.read);

    // Per-module counts: the notes module has none, the tags module one unsettled.
    const modules = service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'attention', module: tags, limit: 100 });
    expect(modules).toMatchObject({ ok: true, view: { total: 1, items: [{ id: 'cf-0005' }] } });
    expect(service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all', module: notes, limit: 100 })).toMatchObject({ ok: true, view: { total: 0 } });

    // Every gate passed on its own checks; a waiver and an unresolved signal changed none.
    expect(eventsOf(events, 'gate-attempted').map(event => [event.data.checkpoint, event.data.verdict])).toEqual([
      ['iteration', 'passed'], ['work-item', 'passed'],
      ['iteration', 'passed'], ['iteration', 'passed'], ['iteration', 'passed'], ['work-item', 'passed'],
      ['final', 'passed'],
    ]);
    run.git.assertComplete();

    const measured = compositionMeasurements(events, { policy: await capturedPolicy(root, runId) });
    // Code reviews start fresh; scope forks the assignment point and design one orientation per selection.
    expect(measured.reviews).toMatchObject({
      requests: 12, attempts: 12, complete: 12, notVerified: 0, partial: 0, retries: 0,
      starts: { 'fresh->fresh': 4, 'fork->fork': 8 }, orientations: { recorded: 2, oriented: 2 },
    });
    expect(measured.signals).toMatchObject({ total: 5, byRisk: { high: 2, medium: 1, low: 2 }, byCredibility: { ungrounded: 3, 'agent-generated': 1, 'human-reviewed': 1 } });
    expect(measured.rounds).toEqual({ 'wi-001': { rounds: 0, corrections: 0 }, 'wi-002': { rounds: 2, corrections: 1 } });
    expect(measured.humanDecisions).toEqual({ requested: 0, answered: 0, userWaivers: 0, userRevocations: 0 });
    expect(measured.waivers).toEqual({ 'agent:local-architect': 1 });
    expect(measured.unresolved).toEqual([{ workItem: 'wi-002', checkFinding: 'cf-0005', reason: 'below-floor', risk: 'low' }]);
    const exported = process.env['PLAN12_MEASUREMENTS_EXPORT'];
    if (exported !== undefined && exported !== '') await writeFile(exported, `${JSON.stringify({ fixture: 'composed', measured }, null, 2)}\n`);
  }, 120_000);
});

/** A service opened over the project as a crash left it: nothing is driven, and what recovery asks of Git is answered. */
async function restart(root: string) {
  const restarted = await openRuns(root, {
    script: [],
    git: mockGit({ changedPaths: async () => [], currentHead: async () => 'revision-04' }),
    candidates: scriptedCandidates(root, compositionCommits()),
    policy: projectRoot => testPolicy(projectRoot, { reviews: testReviewPolicy({ kinds: ['code', 'scope', 'design'] }) }),
  });
  return restarted;
}

/** The lines of the review, reconciliation and CheckFinding boundaries, where a crash is placed before and after. */
function boundary(event: RunEvent): boolean {
  return event.type.startsWith('review-') || event.type.startsWith('reconciliation-')
    || carriedCheckFindings(event).length > 0 || event.type === 'work-item-completed'
    || event.type === 'iteration-closed';
}

/** What a restart may add: the completions of what the log holds open, and the owed and unsettled reviews it finishes. */
const recoveryAppends: ReadonlySet<RunEvent['type']> = new Set([
  ...recoveryCompletions, 'review-request-recorded', 'review-attempt-finished', 'reconciliation-brief-appended',
]);

/** Each identity the log may hold once, beside the composition's own: a request, an attempt's start and end, a round's start, assessment and brief. */
function reviewIdentity(event: RunEvent): string | null {
  switch (event.type) {
    case 'review-request-recorded': return `${event.type}:${event.data.request}`;
    case 'review-attempt-started': case 'review-attempt-finished': return `${event.type}:${event.data.attempt}`;
    case 'review-orientation-recorded': return `${event.type}:${event.data.key}`;
    case 'reconciliation-started': case 'reconciliation-assessed': case 'reconciliation-brief-appended': return `${event.type}:${event.data.reconciliation}`;
    default: return identityOf(event);
  }
}

describe('CF06 and CF07: a crash at every review, reconciliation and CheckFinding boundary of the composed run', () => {
  test('recovery from each prefix of the log invokes no agent, appends only completions, keeps every identity once, rebuilds records and projections, and a second restart changes nothing', async () => {
    const root = await compositionTarget(cleanups);
    const run = await reviewRun(root, cleanups, compositionScenario(root));
    expect(onlyRun(run.service, plan).state).toBe('completed');
    await run.service.close();
    const runId = run.runId;
    const golden = await logLines(root, runId);
    const directory = runDirectory(root, runId);

    // A crash leaves a prefix of the log: the ledger writes whole lines only
    // (iteration 2's fault sweep), and its record copies may be missing. Each
    // cut is placed just before and just after one boundary line.
    const cuts = [...new Set(golden.flatMap((line, index) => (boundary(line.event) ? [index, index + 1] : [])))].sort((a, b) => a - b);
    expect(cuts.length).toBeGreaterThan(40);
    const written = new Set<string>();
    const recovered = new Map<number, RunEvent[]>();
    for (const cut of cuts) {
      const prefix = golden.slice(0, cut);
      // Nothing the crashed process committed after the cut, and none of its record copies, survives.
      for (const path of new Set([...golden.flatMap(line => line.records.map(record => record.path)), ...written])) {
        if (existsSync(join(directory, path))) await rm(join(directory, path));
      }
      await writeFile(join(directory, 'events.jsonl'), prefix.map(line => `${line.text}\n`).join(''));

      const restarted = await restart(root);
      try {
        const after = await logLines(root, runId);
        const context = `cut ${cut} after ${prefix.at(-1)?.event.type ?? 'nothing'}`;
        // The prefix is untouched; recovery called no agent session.
        expect(after.slice(0, cut).map(line => line.text), context).toEqual(prefix.map(line => line.text));
        expect(restarted.agent!.sessions, context).toEqual([]);
        const appended = after.slice(cut).map(line => line.event);
        for (const event of appended) {
          expect(recoveryAppends.has(event.type), `${context}: recovery appended ${event.type}`).toBe(true);
          // No producer runs again: recovery carries no CheckFinding event.
          expect(carriedCheckFindings(event), `${context}: ${event.type}`).toEqual([]);
        }
        const events = after.map(line => line.event);
        // Exactly once: every identity at most once, and the CheckFinding events replay.
        const identities = events.flatMap(event => reviewIdentity(event) ?? []);
        expect(identities.filter((identity, index) => identities.indexOf(identity) !== index), context).toEqual([]);
        const replayed = replayCheckFindingEvents(events.flatMap(event => [...carriedCheckFindings(event)]));
        if (!replayed.ok) throw new Error(`${context}: ${replayed.rejection.message}`);
        // Every accepted iteration in the prefix is owed its three requests, and none is left unsettled.
        const accepted = events.filter(event => event.type === 'iteration-closed' && event.data.outcome === 'accepted').length;
        const coverage = restarted.service.reviews(plan, runId)!.coverage;
        expect(coverage, context).toMatchObject({ state: 'available', requested: accepted * 3, pending: 0 });
        // The projections are rebuilt from the log alone.
        const list = restarted.service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all', limit: 100 });
        expect(list, context).toEqual(selectCheckFindings(replayed.state, { kind: 'list', owner: null, select: 'all', limit: 100 }));
        for (const id of replayed.state.findings.keys()) {
          expect(restarted.service.checkFindings(plan, runId, { kind: 'detail', checkFinding: id }), `${context}: ${id}`)
            .toEqual(selectCheckFindings(replayed.state, { kind: 'detail', checkFinding: id }));
        }
        // Every record the log commits is on disk, byte for byte.
        for (const line of after) {
          for (const record of line.records) {
            written.add(record.path);
            expect(await readFile(join(directory, record.path), 'utf8'), `${context}: ${record.path}`).toBe(recordText(record.body));
          }
        }
        expect(events.at(-1)!.type, context).toBe(cut === golden.length ? 'job-completed' : 'job-interrupted');
        recovered.set(cut, appended);
      } finally {
        await restarted.service.close();
      }
      // A second restart finds nothing to do.
      const before = await readFile(join(directory, 'events.jsonl'), 'utf8');
      const again = await restart(root);
      try {
        expect(await readFile(join(directory, 'events.jsonl'), 'utf8')).toBe(before);
        expect(again.agent!.sessions).toEqual([]);
      } finally {
        await again.service.close();
      }
    }
    // Three named boundaries, exactly: the gate-to-request crash of the
    // correction, whose line also claims the repair; a reader that was
    // running; and the committed assessment whose brief was not appended.
    const after = (predicate: (event: RunEvent) => boolean) => golden.findIndex(line => predicate(line.event)) + 1;
    const claimed = recovered.get(after(event => event.type === 'iteration-closed' && event.data.iteration === 'wi-002.i03'))!;
    expect(claimed.filter(event => event.type === 'review-request-recorded').map(event => event.type === 'review-request-recorded' && [event.data.request, event.data.kind]))
      .toEqual([['rq-0010', 'code'], ['rq-0011', 'scope'], ['rq-0012', 'design']]);
    const reading = recovered.get(after(event => event.type === 'review-attempt-started' && event.data.attempt === 'rq-0007.a01'))!;
    expect(reading.find(event => event.type === 'review-attempt-finished' && event.data.attempt === 'rq-0007.a01'))
      .toMatchObject({ data: { result: 'not-verified', reason: 'execution-failed', settles: true } });
    const assessed = recovered.get(after(event => event.type === 'reconciliation-assessed' && event.data.reconciliation === 'wi-002.rc01'))!;
    expect(assessed[0]).toMatchObject({ type: 'reconciliation-brief-appended', data: { reconciliation: 'wi-002.rc01', outcome: 'session-lost' } });
  }, 300_000);
});

describe('CF07: a shutdown owns the live readers of the composed run, and a late result is fenced', () => {
  test('closing the service while two of wi-002\'s readers run stops both and records nothing; a reader that ignores its stop ingests nothing; the restart settles every attempt once', async () => {
    const root = await compositionTarget(cleanups);
    const waiting = [gate(), gate()] as const;
    const signal = (index: 0 | 1) => ({ kind: 'await' as const, until: async () => { waiting[index].open(); } });
    const scenario = compositionScenario(root);
    const run = await reviewRun(root, cleanups, {
      ...scenario,
      detached: true,
      stopGraceMs: 300,
      reviewers: {
        ...scenario.reviewers,
        // This reader ignores its stop and submits its concerns afterwards.
        'rq-0007': [tool(snapshotToolNames.diff, { path: tagLimit }), signal(0), { kind: 'stall', ms: 1_500, thenIgnoreStop: true }, ...review([tagLimit], [concerns.defect]).slice(1)],
        'rq-0008': [tool(snapshotToolNames.diff, { path: tagLimit }), signal(1), { kind: 'await', until: () => new Promise(() => undefined) }],
      },
    });
    const { service, runId, agent } = run;
    await Promise.all(waiting.map(entry => entry.opened));
    const before = await runEventsOnDisk(root, plan, runId);
    await service.close();

    const readers = agent!.sessions.filter(session => session.spec.role === 'reviewer' && /rq-000[78]/u.test(session.spec.prompt));
    expect(readers).toHaveLength(2);
    expect(readers.every(session => session.stopCalls > 0)).toBe(true);
    // The late submission reached the tool after the shutdown and was refused there.
    const late = readers.find(session => session.spec.prompt.includes('rq-0007'))!;
    await until(() => late.outcome !== undefined, 10_000);
    expect(late.verdicts.at(-1)).toMatchObject({ accepted: false, final: true });
    const closed = await runEventsOnDisk(root, plan, runId);
    // A closing service records no review result and no CheckFinding.
    expect(closed.slice(before.length).filter(event => event.type.startsWith('review-') || carriedCheckFindings(event).length > 0)).toEqual([]);
    expect(closed.some(event => carriedCheckFindings(event).length > 0)).toBe(false);

    await staleCrashLock(root);
    const restarted = await restart(root);
    try {
      expect(restarted.agent!.sessions).toEqual([]);
      const after = await runEventsOnDisk(root, plan, runId);
      const finished = eventsOf(after.slice(closed.length), 'review-attempt-finished').map(event => [event.data.attempt, event.data.result, event.data.reason]);
      expect(finished).toEqual(expect.arrayContaining([['rq-0007.a01', 'not-verified', 'execution-failed'], ['rq-0008.a01', 'not-verified', 'execution-failed']]));
      expect(after.at(-1)).toMatchObject({ type: 'job-interrupted' });
      expect(restarted.service.reviews(plan, runId)!.coverage).toMatchObject({ state: 'available', requested: 9, pending: 0 });
      expect(summariesOf(restarted.service, runId)).toEqual([]);
    } finally {
      await restarted.service.close();
    }
  }, 120_000);
});

describe('CF15: the composed run under the tightest policy', () => {
  test('one reader, a queue of one, one retry and one reconciliation round: overflow, a retried invalid review and exhausted rounds are explicit gaps and unresolved signals, and every gate keeps its verdict', async () => {
    const root = await compositionTarget(cleanups);
    const scenario = compositionScenario(root, { concurrency: 1, queue: 1, retries: 1 });
    const run = await reviewRun(root, cleanups, {
      ...scenario,
      limits: { reconciliationRoundsPerWorkItem: 1 },
      // No correction is made: the work item's gate follows the second iteration.
      gates: [...compositionGates.slice(0, 4), ...compositionGates.slice(5)],
      reviewers: {
        ...scenario.reviewers,
        // The first attempt names a path it never read: invalid, retried once.
        'rq-0004#1': [{ kind: 'submit', input: { inspected: [tagLimit], missing: [], concerns: [] } }, { kind: 'end', message: 'gave up' }],
      },
      reconcilers: {
        // The only round is the last: its floor admits no correction, and the refused plan is returned to the fork.
        'wi-002.rc01': reconcile(
          submission([disposition('cf-0001', { action: 'repair' }), disposition('cf-0002', { action: 'leave' })], { kind: 'correct', goal: 'Correct the limit.' }),
          submission([disposition('cf-0001', { action: 'leave' }), disposition('cf-0003', { action: 'leave' }), disposition('cf-0002', { action: 'leave' })], { kind: 'unresolved' }),
        ),
      },
    });
    const { service, runId, events } = run;
    expect(onlyRun(service, plan).state).toBe('completed');
    const measured = compositionMeasurements(events, { policy: await capturedPolicy(root, runId) });
    const exported = process.env['PLAN12_MEASUREMENTS_EXPORT'];
    if (exported !== undefined && exported !== '') await writeFile(`${exported}.tight.json`, `${JSON.stringify({ fixture: 'tight', measured }, null, 2)}\n`);
    // The third request of every candidate found the queue full and never ran.
    expect(eventsOf(events, 'review-attempt-finished').map(event => [event.data.attempt, event.data.result, event.data.reason])).toEqual([
      ['rq-0003.a01', 'not-verified', 'queue-overflow'], ['rq-0001.a01', 'complete', null], ['rq-0002.a01', 'complete', null],
      ['rq-0006.a01', 'not-verified', 'queue-overflow'], ['rq-0004.a01', 'not-verified', 'invalid-output'], ['rq-0004.a02', 'complete', null],
      ['rq-0005.a01', 'complete', null], ['rq-0009.a01', 'not-verified', 'queue-overflow'], ['rq-0007.a01', 'complete', null], ['rq-0008.a01', 'complete', null],
    ]);
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 9, complete: 6, partial: 0, notVerified: 3, pending: 0 });
    // The only round was the last: its floor refused the correction, and the fork left every signal unresolved.
    const [fork] = reconcilerSessions(run.agent!);
    expect(JSON.stringify(fork!.verdicts[0])).toContain('correction-floor');
    expect(eventsOf(events, 'reconciliation-assessed').map(event => event.data.next)).toEqual(['unresolved']);
    expect(eventsOf(events, 'work-item-completed').map(event => [event.data.workItem, event.data.unresolved])).toEqual([
      ['wi-001', undefined],
      ['wi-002', [{ checkFinding: 'cf-0001', reason: 'rounds-exhausted' }, { checkFinding: 'cf-0003', reason: 'rounds-exhausted' }, { checkFinding: 'cf-0002', reason: 'rounds-exhausted' }]],
    ]);
    // Nothing manufactured a pass: the signals stay open, and every gate kept the verdict its checks gave.
    expect(summariesOf(service, runId).map(summary => [summary.id, summary.standing, summary.risk])).toEqual([
      ['cf-0001', 'open', 'high'], ['cf-0002', 'open', 'low'], ['cf-0003', 'open', 'medium'],
    ]);
    expect(eventsOf(events, 'gate-attempted').every(event => event.data.verdict === 'passed')).toBe(true);
    expect(measured.reviews).toMatchObject({ requests: 9, attempts: 10, retries: 1, notVerifiedByReason: { 'queue-overflow': 3 }, orientations: { recorded: 0 } });
    expect(measured.rounds).toEqual({ 'wi-001': { rounds: 0, corrections: 0 }, 'wi-002': { rounds: 1, corrections: 0 } });
    expect(measured.unresolved.map(entry => entry.risk)).toEqual(['high', 'medium', 'low']);
  }, 120_000);
});
