import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { reconciliationLayout, type ReconciliationBasis } from '../reviews/reconciliation.js';
import { reviewLayout, type ReviewRequest } from '../reviews/records.js';
import { snapshotToolNames } from '../reviews/snapshot.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { testReviewPolicy } from './helpers/candidates.js';
import { afterFinished, concern, disposition, reconcile, review, submission } from './helpers/check-findings-composition.js';
import { assign, completionProposed, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { eventsOf, limit, notes, notesDirectory, plan, reviewScript, reviewTarget, store } from './helpers/reviews.js';
import { git, initRepository, onlyRun, openRuns, runEventsOnDisk, runPath, startRun, testPolicy } from './helpers/runs.js';

/*
 * The real-process witness of the composed CheckFinding path (Plan 12
 * iteration 8): one work item over a real Git repository, reviewed by code,
 * scope and design readers through the real snapshot tools, reading Git's
 * objects. A code concern and a design concern grounded in the committed
 * principles document name one behavior; the reconciliation fork relates
 * them and plans a correction; the correction's commit claims the repair,
 * its own reader reads the corrected candidate, and the next round fixes
 * both. Every tree a CheckFinding names is the one Git holds for the
 * audited commit. The agents are the scripted fake; no model is called.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const principles = 'docs/notes.principles.md';
const principlesText = 'A note holds at most 500 characters.\n';
const feature = `${notesDirectory}/src/tests/features/${plan}/${plan}.feature`;

/** An orientation that names every guidance path its message gives. */
function orientation(spec: SessionSpec): readonly ScriptStep[] {
  const read = [...spec.prompt.matchAll(/^## (\S+) \(sha256 /gmu)].map(match => match[1]!);
  return [{ kind: 'submit', input: { read, summary: 'A note holds at most 500 characters.' } }];
}

describe('the composed CheckFinding path over a real repository', () => {
  test('concerns over real audited trees are related, corrected on a later commit, claimed on its tree and fixed, with the ground hashed from Git\'s objects', async () => {
    const root = await reviewTarget(cleanups);
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, principles), principlesText);
    await initRepository(root);

    const defect = concern(limit, 'The note limit is 50 characters, and the plan asks for 500', 'high');
    const design = concern(limit, 'The limit contradicts the notes principle of 500 characters', 'high', principles);
    const scripted = reviewScript({
      engineer: [
        submit(completionProposed('Added the note store.'), write('store.ts', 'export const store = new Map();\n')),
        submit(completionProposed('Stated the note limit.'), write('limit.ts', 'export const limit = (text: string) => text.length <= 50;\n')),
        submit(completionProposed('Corrected the note limit.'), write('limit.ts', 'export const limit = (text: string) => text.length <= 500;\n')),
      ],
      architect: [
        submit(assign(notes, { goal: 'Add the note store.' }, outline())),
        submit(assign(notes, { goal: 'State the note limit.' })),
        submit(requestCompletion()),
        submit(assign(notes, { goal: 'Make the note limit 500 characters.', kind: 'repair' })),
        submit(requestCompletion()),
      ],
      reviewers: {
        'rq-0001': review([store]), 'rq-0002': review([store]), 'rq-0003': review([store]),
        'rq-0004': review([limit], [defect]),
        'rq-0005': review([limit]),
        'rq-0006': review([limit], [design], [afterFinished(root, ['rq-0004.a01'])]),
        // The correction's reader reads the corrected candidate itself. Its
        // commit also carries the feature file the harness rendered again.
        'rq-0007': [{ kind: 'tool', tool: snapshotToolNames.read, input: { path: limit } }, ...review([limit, feature])],
        'rq-0008': review([limit, feature]), 'rq-0009': review([limit, feature]),
      },
      reconcilers: {
        'wi-001.rc01': reconcile(submission([
          disposition('cf-0001', { action: 'repair' }),
          disposition('cf-0002', { action: 'repair' }),
        ], { kind: 'correct', goal: 'Make the note limit 500 characters.' }, [
          { from: 'cf-0002', to: 'cf-0001', relation: 'same-issue', shared: 'The note limit is 500 characters.', evidence: [`${limit}:1`], rationale: 'Both name the 50-character limit.' },
        ])),
        'wi-001.rc02': reconcile(submission([
          disposition('cf-0001', { action: 'fixed', reassessed: ['cfr-0001'] }),
          disposition('cf-0002', { action: 'fixed', reassessed: ['cfr-0002'] }),
        ], { kind: 'complete' })),
      },
    });
    const script = (spec: SessionSpec): readonly ScriptStep[] => {
      if (spec.role === 'initial-architect') return [{ kind: 'submit', input: analysis([entry('review-notes', notes)]) }];
      return spec.role === 'reviewer' && spec.prompt.startsWith('Design orientation.') ? orientation(spec) : scripted(spec);
    };
    const opened = await openRuns(root, {
      script,
      git: gitService,
      inputs: treeInputs(),

      // Settlement outlasts one attempt, so a design reader still waiting at the completion request runs.
      policy: projectRoot => testPolicy(projectRoot, { reviews: testReviewPolicy({ kinds: ['code', 'scope', 'design'], concurrency: 2, settleMs: 120_000 }) }),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, receipt.jobId);
    const runId = receipt.jobId;
    const { service } = opened;
    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');

    const events = await runEventsOnDisk(root, plan, runId);
    const commits = eventsOf(events, 'iteration-closed').flatMap(event => (event.data.outcome === 'accepted' ? [event.data.commit!] : []));
    expect(commits).toHaveLength(3);
    const treeOf = async (commit: string) => (await git(root, 'rev-parse', `${commit}^{tree}`)).trim();
    const trees = await Promise.all(commits.map(treeOf));
    // Every request binds Git's tree of its audited commit.
    for (const event of eventsOf(events, 'review-request-recorded')) {
      const request = JSON.parse(await readFile(runPath(root, plan, runId, reviewLayout.request(event.data.request)), 'utf8')) as ReviewRequest;
      expect(request.tree).toBe(trees[commits.indexOf(event.data.candidate)]);
    }
    expect(service.reviews(plan, runId)!.coverage).toEqual({ state: 'available', requested: 9, complete: 9, partial: 0, notVerified: 0, pending: 0 });

    // The two concerns are reports on the second commit's real tree; the
    // design ground is the committed principles document, hashed as Git holds it.
    const detail = (id: string) => {
      const view = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: id });
      if (view === undefined || !view.ok || view.view.kind !== 'detail') throw new Error(`no ${id}`);
      return view.view;
    };
    const { createHash } = await import('node:crypto');
    expect(await git(root, 'show', `${commits[1]}:${principles}`)).toBe(principlesText);
    expect(detail('cf-0002').reports.items[0]).toMatchObject({
      source: { kind: 'tree', id: trees[1] },
      judgment: { ground: { ref: principles, hash: `sha256:${createHash('sha256').update(principlesText).digest('hex')}` } },
      credibility: 'human-reviewed', modules: [notes],
    });
    expect(detail('cf-0001').reports.items[0]).toMatchObject({ source: { kind: 'tree', id: trees[1] }, credibility: 'ungrounded', modules: [notes] });

    // Round 1 was based on the second commit's tree; the correction's commit
    // claims the repair on its own tree; round 2 was based on that tree and fixed both.
    const basis = async (id: string) => JSON.parse(await readFile(runPath(root, plan, runId, reconciliationLayout.basis(id)), 'utf8')) as ReconciliationBasis;
    expect(await basis('wi-001.rc01')).toMatchObject({ source: { commit: commits[1], tree: trees[1] }, floor: 'any' });
    expect(await basis('wi-001.rc02')).toMatchObject({ source: { commit: commits[2], tree: trees[2] }, floor: 'non-low' });
    const closed = eventsOf(events, 'iteration-closed').find(event => event.data.commit === commits[2])!;
    expect(closed.data.checkFindings!.map(event => event.type === 'check-finding-decided' && [event.data.checkFinding, event.data.decision.decision])).toEqual([
      ['cf-0001', { action: 'claim-repair', candidate: { kind: 'tree', id: trees[2] }, change: closed.data.iteration }],
      ['cf-0002', { action: 'claim-repair', candidate: { kind: 'tree', id: trees[2] }, change: closed.data.iteration }],
    ]);
    for (const id of ['cf-0001', 'cf-0002']) {
      expect(detail(id).summary).toMatchObject({ standing: 'closed', reason: 'fixed-by-assessment', group: { canonical: 'cf-0001', members: ['cf-0001', 'cf-0002'] } });
      expect(detail(id).decisions.items.at(-1)).toMatchObject({ source: { kind: 'tree', id: trees[2] } });
    }

    // The correction's reader read the corrected limit from Git's objects.
    const reader = opened.agent!.sessions.find(session => session.spec.role === 'reviewer' && session.spec.prompt.includes('Code review rq-0007'))!;
    expect(reader.results[0]).toMatchObject({ tool: snapshotToolNames.read, isError: false, text: expect.stringContaining('text.length <= 500') });
    expect(await git(root, 'show', `${commits[1]}:${limit}`)).toContain('text.length <= 50;');
    // Every gate passed on its own checks.
    expect(eventsOf(events, 'gate-attempted').every(event => event.data.verdict === 'passed')).toBe(true);
  }, 180_000);
});
