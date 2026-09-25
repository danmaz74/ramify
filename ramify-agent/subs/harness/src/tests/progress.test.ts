import { finalCandidate } from './helpers/final-candidate.js';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { analysisLayout, hypothesisSchema } from '../analysis/records.js';
import type { ModuleTree, ViewIdentity } from '../interfaces/protocol/evidence.js';
import { moduleCapabilityComparisonResponseSchema, runQueryLimits, type ModuleCapabilityComparisonResponse } from '../interfaces/protocol/runs.js';
import { runView } from '../projections/inputs.js';
import { moduleCapabilityComparisonOf, type AnalysisCoverageLimits } from '../projections/module-capabilities.js';
import { capabilityProgressOf } from '../projections/progress.js';
import { entryAssignmentsSchema } from '../run/records.js';
import { RunQueries } from '../projections/queries.js';
import { workLayout } from '../work/records.js';
import { copyFixture } from './helpers/fixture.js';
import { expectNoProcesses, forgetExternalTools, openRunsWithoutProcesses } from './helpers/external-tools.js';
import { analysis, entry, hypothesis, requestCompletion } from './helpers/analysis.js';
import {
  at, constructedRun, forecast, hash, item, obligation, registered, requirement, reviews, type Line,
} from './helpers/constructed.js';
import { installTestRunner, runPath, startRun } from './helpers/runs.js';
import { scenariosCommit, scriptedGit } from './helpers/scripted-git.js';

/*
 * Hypothesis, decision, work and progress records stay visibly distinct: each
 * kind has its own directory, a hypothesis has no reference to a work item,
 * and progress is a projection that appends nothing.
 *
 * M2: todo, working on and completed handle provider waits, verified reuse,
 * reopened evidence and superseded hypotheses correctly.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  try { expectNoProcesses(); } finally { forgetExternalTools(); }
});

const root = 'collection-review';

function progressOf(lines: readonly Line[]) {
  return capabilityProgressOf(runView(constructedRun(lines)));
}

describe('the capability progress projection', () => {
  test('todo, working, completed and a forecast', () => {
    const progress = progressOf([
      { type: 'job-started', data: {} },
      {
        type: 'analysis-accepted', data: {},
        records: [
          ...['not-started', 'under-way', 'done', 'no-item'].map(capability => ({ path: at('registry', capability), body: registered(capability) })),
          { path: at('hypotheses', 'h1'), body: forecast('h1', 'forecast-only') },
          { path: 'work-items/wi-001/item.json', body: item('wi-001', { entry: 'not-started' }) },
          { path: 'work-items/wi-002/item.json', body: item('wi-002', { entry: 'under-way' }) },
          { path: 'work-items/wi-003/item.json', body: item('wi-003', { entry: 'done' }) },
        ],
      },
      { type: 'work-item-started', data: { workItem: 'wi-002', module: reviews } },
      { type: 'work-item-started', data: { workItem: 'wi-003', module: reviews } },
      { type: 'work-item-completed', data: { workItem: 'wi-003', gate: 'ga-0004' } },
    ]);
    expect(progress.map(row => [row.capability, row.state, row.tentative, row.entry, row.workItems, row.evidence])).toEqual([
      ['not-started', 'todo', false, true, ['wi-001'], []],
      ['under-way', 'working', false, true, ['wi-002'], []],
      ['done', 'completed', false, true, ['wi-003'], ['ga-0004']],
      // An expected need with no work started is `todo`, not absent.
      ['no-item', 'todo', false, true, [], []],
      ['forecast-only', 'todo', true, false, [], []],
    ]);
    for (const row of progress) expect(row.reason.length).toBeGreaterThan(0);
  });

  test('`completed` is stated only with current verification evidence', () => {
    const lines: Line[] = [
      { type: 'analysis-accepted', data: {}, records: [{ path: at('registry', 'done'), body: registered('done') }, { path: 'wi', body: item('wi-001', { entry: 'done' }) }] },
      { type: 'work-item-started', data: { workItem: 'wi-001', module: reviews } },
    ];
    expect(progressOf(lines)[0]).toMatchObject({ state: 'working', evidence: [] });
    // The completing event names the gate; without it nothing is completed.
    expect(progressOf([...lines, { type: 'work-item-completed', data: { workItem: 'wi-001', gate: 'ga-0002' } }])[0]).toMatchObject({ state: 'completed', evidence: ['ga-0002'] });
  });

  test('a capability the registry holds is never listed a second time as a forecast', () => {
    const progress = progressOf([{
      type: 'analysis-accepted', data: {},
      records: [{ path: at('registry', 'send-email'), body: registered('send-email') }, { path: at('hypotheses', 'h1'), body: forecast('h1', 'send-email') }],
    }]);
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ capability: 'send-email', entry: true, tentative: false });
  });
});

describe('M2: provider waits, verified reuse, reopened evidence and superseded hypotheses', () => {
  // A consumer, `send-button`, delegates `send-email` to a provider through
  // contract ct-001; its requirement rq-001 attaches to the obligation.
  const delegation: Line[] = [
    { type: 'job-started', data: {} },
    {
      type: 'analysis-accepted', data: {},
      records: [
        { path: at('registry', 'send-button'), body: registered('send-button') },
        { path: 'work-items/wi-001/item.json', body: item('wi-001', { entry: 'send-button' }) },
      ],
    },
    { type: 'work-item-started', data: { workItem: 'wi-001', module: reviews } },
    {
      type: 'contract-registered', data: {},
      records: [
        { path: at('registry', 'send-email'), body: registered('send-email', { origin: 'local-decision', decision: 'ld-wi-001-01', consumers: [{ capability: 'send-button', workItem: 'wi-001' }] }) },
        { path: at('obligations', 'ob-ct-001'), body: obligation('ct-001', 'send-email') },
        { path: at('requirements', 'rq-001'), body: requirement('rq-001', 'wi-001', 'send-button', 'ct-001') },
        { path: 'work-items/wi-002/item.json', body: item('wi-002', { obligation: { id: 'ob-ct-001', revision: 1, hash } }, { startedFor: 'wi-001' }) },
      ],
    },
    { type: 'work-item-yielded', data: { workItem: 'wi-001', requirements: ['rq-001'], invocation: 'inv-0004' } },
  ];

  test('a provider wait stays working, with its reason', () => {
    const progress = progressOf(delegation);
    const consumer = progress.find(row => row.capability === 'send-button')!;
    expect(consumer.state).toBe('working');
    expect(consumer.reason).toBe('Waiting for provider ob-ct-001 (rq-001)');
    expect(consumer.dependsOn).toEqual([{ capability: 'send-email', tentative: false }]);
    expect(progress.find(row => row.capability === 'send-email')).toMatchObject({ state: 'todo', workItems: ['wi-002'] });

    // The provider conforms and the consumer resumes; its requirement is
    // still open, so it is still working, now verifying.
    const resumed = progressOf([
      ...delegation,
      { type: 'work-item-started', data: { workItem: 'wi-002', module: reviews } },
      { type: 'provider-conformed', data: { obligation: 'ob-ct-001', revision: 1, workItem: 'wi-002', iteration: 'wi-002.i01', gate: 'ga-0006' } },
      { type: 'work-item-completed', data: { workItem: 'wi-002', gate: 'ga-0007' } },
      { type: 'work-item-resumed', data: { workItem: 'wi-001', requirements: ['rq-001'] } },
    ]);
    expect(resumed.find(row => row.capability === 'send-button')).toMatchObject({ state: 'working', reason: expect.stringContaining('verifying rq-001') });
    expect(resumed.find(row => row.capability === 'send-email')).toMatchObject({ state: 'completed', evidence: ['ga-0007', 'ga-0006'] });

    // A passing gate on the consumer while its requirement is unverified is
    // a fake-backed pass: still working.
    const fakeBacked = progressOf([...delegation, { type: 'work-item-completed', data: { workItem: 'wi-001', gate: 'ga-0005' } }]);
    expect(fakeBacked.find(row => row.capability === 'send-button')).toMatchObject({ state: 'working', reason: expect.stringContaining('rq-001 at revision 1') });

    // Verified at the current revision, it is completed.
    const verified = progressOf([
      ...delegation,
      { type: 'work-item-resumed', data: { workItem: 'wi-001', requirements: ['rq-001'] } },
      { type: 'requirement-verified', data: { requirement: 'rq-001', revision: 1, workItem: 'wi-001', iteration: 'wi-001.i02', gate: 'ga-0008' } },
      { type: 'work-item-completed', data: { workItem: 'wi-001', gate: 'ga-0009' } },
    ]);
    expect(verified.find(row => row.capability === 'send-button')).toMatchObject({ state: 'completed', evidence: ['ga-0009', 'ga-0008'] });
  });

  test('verified reuse is completed', () => {
    const reuse: Line[] = [
      {
        type: 'analysis-accepted', data: {},
        records: [
          { path: at('registry', 'review-panel'), body: registered('review-panel') },
          { path: 'work-items/wi-001/item.json', body: item('wi-001', { entry: 'review-panel' }) },
        ],
      },
      { type: 'work-item-started', data: { workItem: 'wi-001', module: reviews } },
      // A decision reuses an existing capability; it gets no work item of its own.
      {
        type: 'decision-accepted', data: {},
        records: [{ path: at('registry', 'format-date'), body: registered('format-date', { origin: 'global-decision', decision: 'gd-001', owner: root, consumers: [{ capability: 'review-panel', workItem: 'wi-001' }] }) }],
      },
    ];
    expect(progressOf(reuse).find(row => row.capability === 'format-date')).toMatchObject({ state: 'working', reason: expect.stringContaining('verified when consumer wi-001 passes') });
    const done = progressOf([...reuse, { type: 'work-item-completed', data: { workItem: 'wi-001', gate: 'ga-0003' } }]);
    expect(done.find(row => row.capability === 'format-date')).toMatchObject({
      state: 'completed', workItems: [], evidence: ['ga-0003'], reason: expect.stringContaining('Verified reuse'),
    });
    expect(done.find(row => row.capability === 'review-panel')!.dependsOn).toEqual([{ capability: 'format-date', tentative: false }]);
  });

  test('evidence-reopened returns a completed capability to working', () => {
    const completed: Line[] = [
      ...delegation,
      { type: 'work-item-started', data: { workItem: 'wi-002', module: reviews } },
      { type: 'provider-conformed', data: { obligation: 'ob-ct-001', revision: 1, workItem: 'wi-002', iteration: 'wi-002.i01', gate: 'ga-0006' } },
      { type: 'work-item-completed', data: { workItem: 'wi-002', gate: 'ga-0007' } },
    ];
    expect(progressOf(completed).find(row => row.capability === 'send-email')!.state).toBe('completed');

    const reopened = progressOf([
      ...completed,
      {
        type: 'evidence-reopened',
        data: {
          cause: 'contract-revision', contract: 'ct-001', revision: 2, iteration: 'wi-001.i03', obligation: 'ob-ct-001', requirements: ['rq-001'],
          bindings: [], followUps: [{ workItem: 'wi-003', follows: 'wi-002' }], superseded: [],
        },
        records: [
          { path: at('obligations', 'ob-ct-001', 2), body: obligation('ct-001', 'send-email', 2) },
          { path: at('requirements', 'rq-001', 2), body: requirement('rq-001', 'wi-001', 'send-button', 'ct-001', 2) },
          { path: 'work-items/wi-003/item.json', body: item('wi-003', { obligation: { id: 'ob-ct-001', revision: 2, hash } }, { follows: 'wi-002', startedFor: null }) },
        ],
      },
    ]);
    const provider = reopened.find(row => row.capability === 'send-email')!;
    expect(provider.state).toBe('working');
    expect(provider.reason).toBe('Evidence reopened by contract-revision of ct-001 at revision 2; follow-up wi-003 of completed wi-002 is open');
    expect(provider.workItems).toEqual(['wi-002', 'wi-003']);
    // The earlier completion stays in the evidence as history.
    expect(provider.evidence).toContain('ga-0007');
  });

  test('a reopened capability is not implemented now, though its earlier evidence remains', () => {
    const entries = {
      path: 'analysis/entries.json',
      body: entryAssignmentsSchema.parse({
        schema: 'ramify-agent.entry-assignments/1', view: { status: 'placeholder' },
        entries: [{ capability: 'send-button', description: 'A send button.', owner: reviews, requirementRefs: [], acceptanceRefs: [], citations: [] }],
      }),
    };
    const completed: Line[] = [
      { type: 'analysis-accepted', data: {}, records: [entries] },
      ...delegation,
      { type: 'work-item-started', data: { workItem: 'wi-002', module: reviews } },
      { type: 'provider-conformed', data: { obligation: 'ob-ct-001', revision: 1, workItem: 'wi-002', iteration: 'wi-002.i01', gate: 'ga-0006' } },
      { type: 'work-item-completed', data: { workItem: 'wi-002', gate: 'ga-0007' } },
    ];
    const tree = { status: 'unavailable' as const, message: 'not materialized' };
    const rows = (lines: readonly Line[]) => moduleCapabilityComparisonOf(runView(constructedRun(lines)), tree, { limits: [] })
      .modules.flatMap(entry => entry.capabilities.map(row => [entry.module, row.capability, row.initial.map(association => association.role), row.implementedHere?.evidence ?? null]));
    // Completed and first registered during the run: Implemented only.
    expect(rows(completed)).toEqual([
      [reviews, 'send-button', ['entry-owner'], null],
      [reviews, 'send-email', [], ['ga-0007', 'ga-0006']],
    ]);
    const reopened: Line[] = [
      ...completed,
      {
        type: 'evidence-reopened',
        data: {
          cause: 'contract-revision', contract: 'ct-001', revision: 2, iteration: 'wi-001.i03', obligation: 'ob-ct-001', requirements: ['rq-001'],
          bindings: [], followUps: [{ workItem: 'wi-003', follows: 'wi-002' }], superseded: [],
        },
        records: [
          { path: at('obligations', 'ob-ct-001', 2), body: obligation('ct-001', 'send-email', 2) },
          { path: at('requirements', 'rq-001', 2), body: requirement('rq-001', 'wi-001', 'send-button', 'ct-001', 2) },
          { path: 'work-items/wi-003/item.json', body: item('wi-003', { obligation: { id: 'ob-ct-001', revision: 2, hash } }, { follows: 'wi-002', startedFor: null }) },
        ],
      },
    ];
    // Reopened, it is working: no row, since it was neither forecast nor is it implemented now.
    expect(rows(reopened)).toEqual([[reviews, 'send-button', ['entry-owner'], null]]);
  });

  test('a superseded hypothesis leaves the list without becoming completed', () => {
    const progress = progressOf([{
      type: 'analysis-accepted', data: {},
      records: [
        { path: at('hypotheses', 'h1'), body: forecast('h1', 'still-open') },
        { path: at('hypotheses', 'h2'), body: forecast('h2', 'withdrawn') },
      ],
    }, {
      type: 'decision-accepted', data: {},
      records: [{ path: at('hypotheses', 'h2', 2), body: forecast('h2', 'withdrawn', { revision: 2, standing: 'superseded', cause: { decision: 'gd-001', reason: 'placed elsewhere' }, supersededBy: 'h1' }) }],
    }]);
    expect(progress.map(row => [row.capability, row.state, row.tentative])).toEqual([['still-open', 'todo', true]]);
    expect(progress.some(row => row.state === 'completed')).toBe(false);
  });
});

describe('over a real run', () => {
  test('the record kinds are distinct directories, and the projection appends nothing', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    const submitted = analysis(
      [entry('reviewer-note', reviews), entry('note-in-panel', root)],
      [hypothesis('note-storage', { involvedModules: [reviews] })],
    );
    const git = scriptedGit(fixture.root, { previews: finalCandidate(fixture.root, 'scenarios-of-review-notes').previews, head: 'progress-base', checkpoints: [
      scenariosCommit('review-notes'),
      { subject: 'wi-001', commit: null, changes: [] },
      { subject: 'wi-002', commit: null, changes: [] },
      { subject: 'final verification of plan "review-notes"', commit: null, changes: [] },
    ] });
    const { service } = await openRunsWithoutProcesses(fixture.root, git, {
      candidates: finalCandidate(fixture.root, 'scenarios-of-review-notes').candidates,
      script: (spec: SessionSpec) => [{ kind: 'submit' as const, input: spec.role === 'initial-architect' ? submitted : requestCompletion() }],
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    git.assertComplete();

    const directory = runPath(fixture.root, 'review-notes', receipt.jobId);
    // Each kind of record is in its own directory, with no other kind in it.
    expect((await readdir(directory)).sort()).toEqual(expect.arrayContaining(['analysis', 'gates', 'hypotheses', 'invocations', 'registry', 'work-items']));
    expect(await readdir(join(directory, 'hypotheses'))).toEqual(['note-storage']);
    expect((await readdir(join(directory, 'registry'))).sort()).toEqual(['note-in-panel', 'reviewer-note']);
    expect((await readdir(join(directory, 'work-items'))).sort()).toEqual(['wi-001', 'wi-002']);
    expect((await readdir(join(directory, 'work-items', 'wi-001'))).sort()).toEqual(['item.json', 'outline']);

    // The `Hypothesis` type has no reference to a work item: no committed
    // hypothesis carries one, and the schema refuses one.
    const body = JSON.parse(await readFile(join(directory, analysisLayout.hypothesis('note-storage', 1)), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(body)).not.toContain('workItem');
    expect(hypothesisSchema.safeParse({ ...body, workItem: 'wi-001' }).success).toBe(false);
    expect(JSON.stringify(body)).not.toContain('wi-00');

    // The projection is a pure function of the log and its records: asked
    // twice it answers the same thing, and the run's files are what they
    // were before it was asked.
    const before = await inventory(directory);
    const gitOperations = git.operations();
    const queries = new RunQueries(service);
    const first = (await queries.capabilities('review-notes', receipt.jobId)).capabilities;
    const second = (await queries.capabilities('review-notes', receipt.jobId)).capabilities;
    expect(second).toEqual(first);
    expect(await inventory(directory)).toEqual(before);
    expect(git.operations()).toEqual(gitOperations);

    expect(first.map(row => [row.capability, row.owner, row.state, row.tentative, row.workItems])).toEqual([
      ['reviewer-note', reviews, 'completed', false, ['wi-001']],
      ['note-in-panel', root, 'completed', false, ['wi-002']],
      ['note-storage', root, 'todo', true, []],
    ]);
    for (const row of first.slice(0, 2)) expect(row.evidence).toEqual([expect.stringMatching(/^ga-\d{4}$/)]);
    // The outline records the delivery; nothing derives work from it.
    expect((await readdir(join(directory, workLayout.directory('wi-001'), 'outline'))).sort()).toEqual(['1.json']);
  }, 300_000);
});

/** Every file beneath the run, with its size and modification time. */
async function inventory(directory: string): Promise<Array<[string, number, number]>> {
  const found: Array<[string, number, number]> = [];
  const walk = async (current: string): Promise<void> => {
    for (const child of await readdir(current, { withFileTypes: true })) {
      const path = join(current, child.name);
      if (child.isDirectory()) await walk(path);
      else {
        const info = await stat(path);
        found.push([path.slice(directory.length), info.size, info.mtimeMs]);
      }
    }
  };
  await walk(directory);
  return found.sort();
}

describe('the module-capability comparison', () => {
  const R = root;
  const notes = `${reviews}/notes`;
  const drafts = `${notes}/drafts`;
  const archive = `${drafts}/archive`;
  const panel = `${R}/panel`;
  const tree: ModuleTree = {
    status: 'available',
    revision: 'rev/7:tree:1',
    input: 'input/7:tree',
    modules: [
      { module: R, dir: '', parent: null },
      { module: panel, dir: 'subs/panel', parent: R },
      { module: `${R}/workspace`, dir: 'subs/workspace', parent: R },
      { module: reviews, dir: 'subs/workspace/subs/reviews', parent: `${R}/workspace` },
      { module: notes, dir: 'subs/workspace/subs/reviews/subs/notes', parent: reviews },
    ],
  };
  const proposal = (parent: string, name: string, purpose = `Holds ${name}.`) => ({ parent, directory: `subs/${name}`, purpose, tags: [] as string[] });

  function assignments(list: ReadonlyArray<{ capability: string; owner: string; proposed?: ReturnType<typeof proposal> }>, view: ViewIdentity = { status: 'placeholder' }) {
    return entryAssignmentsSchema.parse({
      schema: 'ramify-agent.entry-assignments/1',
      view,
      entries: list.map(entry => ({
        capability: entry.capability, description: `The run delivers ${entry.capability}.`, owner: entry.owner,
        ...(entry.proposed === undefined ? {} : { proposed: entry.proposed }),
        requirementRefs: [], acceptanceRefs: [], citations: [],
      })),
    });
  }

  function compare(lines: readonly Line[], current: ModuleTree = tree, limits: AnalysisCoverageLimits = { limits: [] }) {
    const response = moduleCapabilityComparisonOf(runView(constructedRun(lines)), current, limits);
    // Every answer satisfies the protocol schema and its coverage refinement.
    expect(moduleCapabilityComparisonResponseSchema.parse(response)).toEqual(response);
    return response;
  }

  const rowsOf = (response: ModuleCapabilityComparisonResponse) => response.modules.flatMap(entry => entry.capabilities.map(row => ({
    module: entry.module,
    capability: row.capability,
    initial: row.initial.map(association => `${association.role}${association.hypothesis === null ? '' : `:${association.hypothesis}`}`),
    implemented: row.implementedHere !== null,
  })));

  // Entries: one owned by an existing module, one whose owner moves, and two
  // proposed modules, the second beneath the first. Hypotheses: an exact
  // slug join with an entry, a forecast that involves modules and names an
  // anticipated consumer, and one revised after revision 1. A capability
  // first registered during the run is verified by reuse.
  const main: Line[] = [
    { type: 'job-started', data: {} },
    {
      type: 'analysis-accepted', data: { invocation: 'inv-0001' },
      records: [
        {
          path: 'analysis/entries.json', body: assignments([
            { capability: 'review-note', owner: notes },
            { capability: 'moved-thing', owner: reviews },
            { capability: 'note-drafts', owner: drafts, proposed: proposal(notes, 'drafts') },
            { capability: 'draft-archive', owner: archive, proposed: proposal(drafts, 'archive') },
          ]),
        },
        ...['review-note', 'moved-thing', 'note-drafts', 'draft-archive'].map(capability => ({
          path: at('registry', capability),
          body: registered(capability, { owner: capability === 'review-note' ? notes : capability === 'moved-thing' ? reviews : capability === 'note-drafts' ? drafts : archive }),
        })),
        { path: at('hypotheses', 'h-join'), body: forecast('h-join', 'review-note', { suggestedOwner: notes }) },
        {
          path: at('hypotheses', 'note-search'),
          body: forecast('note-search', 'note-search', { suggestedOwner: notes, involvedModules: [reviews, notes, reviews], anticipatedConsumers: [panel] }),
        },
        { path: at('hypotheses', 'h-revised'), body: forecast('h-revised', 'revised-later', { suggestedOwner: reviews }) },
        { path: 'work-items/wi-001/item.json', body: item('wi-001', { entry: 'review-note' }, { module: notes }) },
        { path: 'work-items/wi-002/item.json', body: item('wi-002', { entry: 'moved-thing' }) },
        { path: 'work-items/wi-003/item.json', body: item('wi-003', { entry: 'note-drafts' }, { module: drafts }) },
        { path: 'work-items/wi-004/item.json', body: item('wi-004', { entry: 'draft-archive' }, { module: archive }) },
      ],
    },
    { type: 'work-item-started', data: { workItem: 'wi-001', module: notes } },
    { type: 'work-item-completed', data: { workItem: 'wi-001', gate: 'ga-0002' } },
    {
      // A later decision moves moved-thing, revises a hypothesis and registers
      // format-date for reuse by wi-002; none of it rewrites revision 1.
      type: 'decision-accepted', data: {},
      records: [
        { path: at('registry', 'moved-thing', 2), body: registered('moved-thing', { revision: 2, owner: panel, origin: 'global-decision', decision: 'gd-001', previousOwner: reviews }) },
        { path: at('hypotheses', 'h-revised', 2), body: forecast('h-revised', 'revised-later', { revision: 2, suggestedOwner: panel, cause: { decision: 'gd-001', reason: 'moved' } }) },
        { path: at('registry', 'format-date'), body: registered('format-date', { origin: 'global-decision', decision: 'gd-001', owner: R, consumers: [{ capability: 'moved-thing', workItem: 'wi-002' }] }) },
      ],
    },
    { type: 'work-item-started', data: { workItem: 'wi-002', module: panel } },
    { type: 'work-item-completed', data: { workItem: 'wi-002', gate: 'ga-0003' } },
    { type: 'work-item-started', data: { workItem: 'wi-003', module: drafts } },
  ];

  test('both layers, exact-slug joins, every role once, changed placement and unforecast implementation', () => {
    const response = compare(main);
    expect(response.identityPolicy).toBe('exact-capability-slug/1');
    expect(response.runVersion).toBe(main.length);
    expect(response.initialView).toEqual({ status: 'placeholder' });
    expect(response.tree).toEqual(tree);

    expect(rowsOf(response)).toEqual([
      // Unforecast: registered during the run and verified, Implemented only.
      { module: R, capability: 'format-date', initial: [], implemented: true },
      // Changed placement: Initial in one module, Implemented in the other, with no mismatch status.
      { module: panel, capability: 'moved-thing', initial: [], implemented: true },
      { module: reviews, capability: 'moved-thing', initial: ['entry-owner'], implemented: false },
      // Involved twice by one hypothesis: once.
      { module: reviews, capability: 'note-search', initial: ['involved:note-search'], implemented: false },
      // The revised hypothesis keeps its revision-1 owner.
      { module: reviews, capability: 'revised-later', initial: ['suggested-owner:h-revised'], implemented: false },
      // An entry and a hypothesis of the same slug are one capability, one row, both roles.
      { module: notes, capability: 'review-note', initial: ['entry-owner', 'suggested-owner:h-join'], implemented: true },
      // Suggested owner and involved module are distinct roles of one row.
      { module: notes, capability: 'note-search', initial: ['suggested-owner:note-search', 'involved:note-search'], implemented: false },
      // Working is not implemented.
      { module: drafts, capability: 'note-drafts', initial: ['entry-owner'], implemented: false },
      { module: archive, capability: 'draft-archive', initial: ['entry-owner'], implemented: false },
    ]);
    // The anticipated consumer is no association.
    expect(response.modules.find(entry => entry.module === panel)!.capabilities.map(row => row.capability)).toEqual(['moved-thing']);

    // Completed rows keep their progress's reason and evidence.
    const reviewNote = response.modules.find(entry => entry.module === notes)!.capabilities[0]!;
    expect(reviewNote.implementedHere).toEqual({ reason: 'wi-001 passed its work-item gate ga-0002', evidence: ['ga-0002'] });

    // Placement: the tree's modules, the proposed ones after their parent's subtree.
    expect(response.modules.map(entry => [entry.module, entry.placement])).toEqual([
      [R, 'declared'], [panel, 'declared'], [`${R}/workspace`, 'declared'], [reviews, 'declared'], [notes, 'declared'],
      [drafts, 'proposed'], [archive, 'proposed'],
    ]);
    expect(response.modules.find(entry => entry.module === drafts)!.proposedAtStart).toEqual({ parent: notes, purpose: 'Holds drafts.', tags: [] });
    expect(response.modules.find(entry => entry.module === `${R}/workspace`)!.capabilities).toEqual([]);

    // Capability order: entries, revision-1 hypotheses, then the registry's discoveries.
    expect(response.coverage).toEqual({ state: 'complete', capabilities: 7, implemented: 3 });
  });

  test('a declared module keeps what was proposed for it at start', () => {
    const grown: ModuleTree = { ...tree, modules: [...tree.modules, { module: drafts, dir: 'subs/drafts', parent: notes }] };
    const response = compare(main, grown);
    expect(response.modules.filter(entry => [drafts, archive].includes(entry.module)).map(entry => [entry.module, entry.placement, entry.proposedAtStart?.parent]))
      .toEqual([[drafts, 'declared', notes], [archive, 'proposed', drafts]]);
    expect(response.coverage.state).toBe('complete');
  });

  test('the answer is deterministic', () => {
    expect(JSON.stringify(compare(main))).toBe(JSON.stringify(compare(main)));
  });

  test('a pending analysis is unavailable, with no view and no modules', () => {
    const response = compare([{ type: 'job-started', data: {} }]);
    expect(response).toMatchObject({ initialView: null, modules: [], coverage: { state: 'unavailable', reason: expect.stringContaining('pending') } });
  });

  test('an unavailable tree is partial: every module unplaced, with the tree\'s message', () => {
    const message = 'The architect view has not been materialized yet; a run materializes it before its initial analysis.';
    const response = compare(main, { status: 'unavailable', message });
    expect(new Set(response.modules.map(entry => entry.placement))).toEqual(new Set(['unplaced']));
    expect(response.modules.map(entry => entry.module)).toEqual([R, panel, reviews, notes, drafts, archive].sort());
    expect(response.modules.find(entry => entry.module === drafts)!.proposedAtStart).not.toBeNull();
    expect(response.coverage).toEqual({
      state: 'partial', knownCapabilities: 7, knownImplemented: 3, totalCapabilities: null,
      gaps: [`The current module tree is unavailable, so no module is placed: ${message}`],
    });
  });

  test('recorded coverage limits of the view and of the analysis are one gap each', () => {
    const view: ViewIdentity = { status: 'materialized', revision: 'r', input: 'i', coverageLimits: ['dependencies unavailable (stub)'] };
    const response = compare([{ type: 'analysis-accepted', data: {}, records: [{ path: 'analysis/entries.json', body: assignments([{ capability: 'review-note', owner: notes }], view) }] }],
      tree, { limits: ['The panel was not read.'] });
    expect(response.initialView).toEqual(view);
    expect(response.coverage).toMatchObject({
      state: 'partial',
      gaps: ['The architect view the initial analysis worked from reports: dependencies unavailable (stub)', 'The initial analysis reports: The panel was not read.'],
    });
    const unreadable = compare([{ type: 'analysis-accepted', data: {}, records: [{ path: 'analysis/entries.json', body: assignments([{ capability: 'review-note', owner: notes }]) }] }],
      tree, { unreadable: 'invocations/inv-0001/submission.json is not in the run' });
    expect(unreadable.coverage).toMatchObject({ state: 'partial', gaps: [expect.stringContaining('cannot be read')] });
  });

  test('an absent module without a proposal, and conflicting proposals, are unplaced with a gap', () => {
    const response = compare([{
      type: 'analysis-accepted', data: {},
      records: [
        {
          path: 'analysis/entries.json', body: assignments([
            { capability: 'first-draft', owner: drafts, proposed: proposal(notes, 'drafts') },
            { capability: 'second-draft', owner: drafts, proposed: proposal(reviews, 'drafts') },
          ]),
        },
        { path: at('hypotheses', 'far-away'), body: forecast('far-away', 'far-away', { suggestedOwner: `${R}/nowhere` }) },
      ],
    }]);
    expect(response.modules.slice(-2)).toEqual([
      { module: `${R}/nowhere`, placement: 'unplaced', proposedAtStart: null, capabilities: [{ capability: 'far-away', initial: [{ role: 'suggested-owner', hypothesis: 'far-away' }], implementedHere: null }] },
      {
        module: drafts, placement: 'unplaced', proposedAtStart: null, capabilities: [
          { capability: 'first-draft', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: null },
          { capability: 'second-draft', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: null },
        ],
      },
    ]);
    expect(response.coverage).toMatchObject({
      state: 'partial', knownCapabilities: 3, knownImplemented: 0, totalCapabilities: null,
      gaps: [
        `Module ${R}/nowhere is absent from the current tree and has no recorded proposed parent.`,
        `Module ${drafts} is absent from the current tree, and the entries that propose it disagree, so it has no provisional place.`,
      ],
    });
  });

  test('the capability bound drops whole capabilities from the end, the run\'s discoveries first', () => {
    const many = Array.from({ length: 501 }, (_, index) => `entry-${String(index).padStart(3, '0')}`);
    const response = compare([
      {
        type: 'analysis-accepted', data: {},
        records: [
          { path: 'analysis/entries.json', body: assignments(many.map(capability => ({ capability, owner: reviews }))) },
          { path: at('registry', 'discovered'), body: registered('discovered', { origin: 'local-decision', decision: 'ld-001', owner: notes, consumers: [{ capability: 'entry-000', workItem: 'wi-001' }] }) },
          { path: 'work-items/wi-001/item.json', body: item('wi-001', { entry: 'entry-000' }) },
        ],
      },
      { type: 'work-item-completed', data: { workItem: 'wi-001', gate: 'ga-0002' } },
    ]);
    const returned = new Set(response.modules.flatMap(entry => entry.capabilities.map(row => row.capability)));
    expect(returned.size).toBe(runQueryLimits.capabilities);
    expect(returned.has('entry-500')).toBe(false);
    expect(returned.has('discovered')).toBe(false);
    expect(response.coverage).toMatchObject({ state: 'partial', knownCapabilities: 500, knownImplemented: 0, totalCapabilities: 502 });
    if (response.coverage.state !== 'partial') throw new Error('partial');
    expect(response.coverage.gaps).toEqual([expect.stringMatching(/^The capabilities \(500\) bound returned 500 of 502 capabilities.*knownImplemented is a lower bound/)]);
  });

  test('the row bound keeps a capability with all of its rows or drops it whole', () => {
    const modules = Array.from({ length: 5 }, (_, index) => `${reviews}/m${index}`);
    const wide: ModuleTree = { ...tree, modules: [...tree.modules, ...modules.map(module => ({ module, dir: module, parent: reviews }))] };
    const hypotheses = Array.from({ length: 401 }, (_, index) => {
      const id = `forecast-${String(index).padStart(3, '0')}`;
      return { path: at('hypotheses', id), body: forecast(id, id, { suggestedOwner: modules[0]!, involvedModules: modules.slice(1) }) };
    });
    const response = compare([{
      type: 'analysis-accepted', data: {},
      records: [{ path: 'analysis/entries.json', body: assignments([{ capability: 'first', owner: notes }]) }, ...hypotheses],
    }], wide);
    const rows = response.modules.reduce((sum, entry) => sum + entry.capabilities.length, 0);
    // One entry row, then 399 forecasts of five rows each: 1,996 rows; the next would exceed 2,000.
    expect(rows).toBe(1 + 399 * 5);
    for (const module of modules) expect(response.modules.find(entry => entry.module === module)!.capabilities).toHaveLength(399);
    expect(response.coverage).toMatchObject({ state: 'partial', knownCapabilities: 400, totalCapabilities: 402 });
    if (response.coverage.state !== 'partial') throw new Error('partial');
    expect(response.coverage.gaps[0]).toMatch(/^The moduleCapabilityRows \(2000\) bound returned 400 of 402 capabilities and 1996 of 2006 rows.*lower bound/);
  });
});
