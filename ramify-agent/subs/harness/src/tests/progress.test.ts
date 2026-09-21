import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { analysisLayout, hypothesisSchema } from '../analysis/records.js';
import { runView } from '../projections/inputs.js';
import { capabilityProgressOf } from '../projections/progress.js';
import { RunQueries } from '../projections/queries.js';
import { workLayout } from '../work/records.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, hypothesis, requestCompletion } from './helpers/analysis.js';
import {
  at, constructedRun, forecast, hash, item, obligation, registered, requirement, reviews, type Line,
} from './helpers/constructed.js';
import { initRepository, installTestRunner, openRuns, runPath, startRun } from './helpers/runs.js';

/*
 * Hypothesis, decision, work and progress records stay visibly distinct: each
 * kind has its own directory, a hypothesis has no reference to a work item,
 * and progress is a projection that appends nothing.
 *
 * M2: todo, working on and completed handle provider waits, verified reuse,
 * reopened evidence and superseded hypotheses correctly.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
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
    await initRepository(fixture.root);
    const submitted = analysis(
      [entry('reviewer-note', reviews), entry('note-in-panel', root)],
      [hypothesis('note-storage', { involvedModules: [reviews] })],
    );
    const { service } = await openRuns(fixture.root, {
      script: (spec: SessionSpec) => [{ kind: 'submit' as const, input: spec.role === 'initial-architect' ? submitted : requestCompletion() }],
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

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
    const queries = new RunQueries(service);
    const first = (await queries.capabilities('review-notes', receipt.jobId)).capabilities;
    const second = (await queries.capabilities('review-notes', receipt.jobId)).capabilities;
    expect(second).toEqual(first);
    expect(await inventory(directory)).toEqual(before);

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
