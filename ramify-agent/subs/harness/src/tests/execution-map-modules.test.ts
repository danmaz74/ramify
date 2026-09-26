import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModuleTree } from '../interfaces/protocol/evidence.js';
import { executionModuleMapSchema } from '../interfaces/protocol/execution-map.js';
import { capturedLinesOf, executionModuleMapOf } from '../projections/execution-modules.js';
import { runView } from '../projections/inputs.js';
import { invocationSchema, lineEventSummarySchema, runLayout } from '../run/records.js';
import { iterationAssignmentSchema } from '../work/iterations.js';
import { at, constructedRun, hash, item, registered, reviews, type Line } from './helpers/constructed.js';
import { executionMapFixtureNodes, executionMapFixturePage } from './helpers/execution-map-fixture.js';

const root = 'collection-review';
const workspace = `${root}/workspace`;
const other = `${workspace}/other`;
const tree: ModuleTree = { status: 'available', revision: 'current-revision', input: 'current-input', modules: [
  { module: root, dir: '', parent: null },
  { module: workspace, dir: 'subs/workspace', parent: root },
  { module: reviews, dir: 'subs/workspace/subs/reviews', parent: workspace },
  { module: other, dir: 'subs/workspace/subs/other', parent: workspace },
] };
const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))); });

function writer(id: string) {
  return invocationSchema.parse({ schema: 'ramify-agent.invocation/1', id, role: 'engineer',
    work: { workItem: 'wi-001', iteration: 'wi-001.i01' }, attempt: 1,
    session: { requested: 'fresh', actual: 'fresh', ref: '' },
    prompt: { package: 'engineer', hash, inputsHash: hash },
    scope: { write: null, measurement: null, size: null }, writer: true,
    base: 'abc', startedAt: '2026-09-21T08:00:00.000Z' });
}

function started(id: string, ended = true): Line[] {
  return [
    { type: 'invocation-started', data: { invocation: id, role: 'engineer', session: 'ses-0001',
      work: { workItem: 'wi-001', iteration: 'wi-001.i01' }, start: 'opened' },
    records: [{ path: runLayout.invocation(id), body: writer(id) }] },
    ...(ended ? [{ type: 'invocation-ended' as const, data: { invocation: id, ended: 'failed', submission: null,
      session: 'ses-0001', kept: false, finished: 'not-kept' } }] : []),
  ];
}

async function setup(lines: Line[]) {
  const directory = await mkdtemp(join(tmpdir(), 'execution-modules-'));
  folders.push(directory);
  return runView(constructedRun(lines, undefined, directory));
}

async function writeLines(directory: string, id: string, paths: Array<{ path: string; owner: string | null;
  added: number; deleted: number; binary: boolean; bytes: number | null }>, coverage: 'complete' | 'partial' = 'complete') {
  const file = join(directory, runLayout.lineEvents(id));
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, JSON.stringify(lineEventSummarySchema.parse({ schema: 'ramify-agent.line-events/1', invocation: id,
    paths, unmapped: { paths: paths.filter(path => path.owner === null).length,
      added: paths.filter(path => path.owner === null).reduce((sum, path) => sum + path.added, 0),
      deleted: paths.filter(path => path.owner === null).reduce((sum, path) => sum + path.deleted, 0) },
    coverage, gaps: coverage === 'partial' ? ['unguarded shell'] : [] })));
}

describe('execution module relations and captured writer changes', () => {
  it('preserves fixture owner, scenario, architect, engineer, consumer and provider roles directly', async () => {
    const view = await setup([]);
    const map = executionModuleMapSchema.parse(executionModuleMapOf(view, executionMapFixturePage.tree,
      executionMapFixtureNodes, await capturedLinesOf(view)));
    const ui = map.modules.find(module => module.module === 'project/ui')!;
    const theme = map.modules.find(module => module.module === 'project/theme')!;
    expect(ui.direct).toEqual(expect.arrayContaining([
      expect.objectContaining({ element: 'capability:status-badge', role: 'owner' }),
      expect.objectContaining({ element: 'scenario:sc-status', role: 'owner' }),
      expect.objectContaining({ element: 'session:ses-local-status', role: 'local-architect' }),
      expect.objectContaining({ element: 'session:ses-engineer', role: 'engineer' }),
      expect.objectContaining({ element: 'requirement:req-status', role: 'consumer' }),
    ]));
    expect(theme.direct).toEqual(expect.arrayContaining([
      expect.objectContaining({ element: 'contract:ct-theme', role: 'provider' }),
      expect.objectContaining({ element: 'session:ses-contract', role: 'contract-engineer' }),
    ]));
    expect(ui.workedIn).toBe(true);
    expect(theme.workedIn).toBe(true);
    expect(map.modules.find(module => module.module === 'project')?.workedIn).toBe(false);
    expect(map.modules.find(module => module.module === 'project')?.involvedDescendants).toBe(2);
    expect(map.unplaced).toEqual([{ element: 'work-item:wi-unplaced', reason: 'The work item has no retained module placement.' }]);
  });

  it('keeps scope-only and ancestor nodes neutral while session reach and started work mark direct modules', async () => {
    const assignment = iterationAssignmentSchema.parse({ schema: 'ramify-agent.iteration-assignment/1', id: 'wi-001.i01', workItem: 'wi-001',
      outline: { id: 'wi-001', revision: 1, hash }, stage: 0, kind: 'ordinary', goal: 'Do work.', approach: 'Implement.',
      scope: { revision: 1, base: { module: reviews, includedChildren: [] },
        extra: [{ path: 'subs/workspace/subs/other/src/allowed.ts', purpose: 'contract' }], read: [], bootstrap: [], rationale: 'Allowed.',
        resolved: { roots: [], files: [], view: { status: 'placeholder' } } },
      externalCapabilities: [], completionEvidence: 'Check.', evidenceObligations: [],
      gate: { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: [], subtrees: [], extraSuites: [] } },
      guarded: [], authorizations: [] });
    const view = await setup([
      { type: 'analysis-accepted', data: {}, records: [
        { path: at('registry', 'review-notes'), body: registered('review-notes') },
        { path: 'work-items/wi-001/item.json', body: item('wi-001', { entry: 'review-notes' }) }] },
      { type: 'iteration-assigned', data: {}, records: [{ path: 'assignments/wi-001.i01.json', body: assignment }] },
      { type: 'work-item-started', data: { workItem: 'wi-001' } },
    ]);
    const source = { kind: 'work-item' as const, id: 'wi-001', sequence: 1, revision: 1 };
    const nodes = [
      { ...executionMapFixtureNodes.find(node => node.kind === 'work-item')!, key: 'work-item:wi-001', module: reviews,
        modules: [{ module: reviews, role: 'owner' as const, source }] },
      { ...executionMapFixtureNodes.find(node => node.kind === 'iteration')!, key: 'iteration:wi-001.i01',
        modules: [{ module: reviews, role: 'owner' as const, source }] },
    ];
    const captured = await capturedLinesOf(view);
    const map = executionModuleMapSchema.parse(executionModuleMapOf(view, tree, nodes, captured));
    expect(map.tree).toMatchObject({ revision: 'current-revision' });
    expect(map.modules.find(module => module.module === reviews)?.workedIn).toBe(true);
    expect(map.modules.find(module => module.module === other)).toMatchObject({ workedIn: false,
      direct: [{ element: 'iteration:wi-001.i01', role: 'authorized-scope' }] });
    expect(map.modules.find(module => module.module === workspace)).toMatchObject({ workedIn: false, involvedDescendants: 1 });
  });

  it('sums all settled owners, failed repair records, unmapped text and binary separately, with partial coverage', async () => {
    const view = await setup([...started('inv-failed'), ...started('inv-repair'), ...started('inv-missing')]);
    await writeLines(view.directory, 'inv-failed', [
      { path: 'subs/workspace/subs/reviews/src/a.ts', owner: reviews, added: 12, deleted: 3, binary: false, bytes: null },
      { path: 'subs/workspace/subs/other/src/tokens.ts', owner: other, added: 3, deleted: 1, binary: false, bytes: null },
      { path: 'subs/workspace/subs/other/src/logo.png', owner: other, added: 0, deleted: 0, binary: true, bytes: 210 },
    ]);
    await writeLines(view.directory, 'inv-repair', [
      { path: 'subs/workspace/subs/reviews/src/a.ts', owner: reviews, added: 2, deleted: 0, binary: false, bytes: null },
      { path: 'scratch/unknown.ts', owner: null, added: 4, deleted: 1, binary: false, bytes: null },
    ], 'partial');
    const captured = await capturedLinesOf(view);
    const map = executionModuleMapSchema.parse(executionModuleMapOf(view, tree, [], captured));
    expect(map.lines).toMatchObject({ coverage: 'partial', totals: { added: 21, deleted: 5, textPaths: 4 }, binary: { paths: 1 } });
    expect(map.modules.find(module => module.module === reviews)?.lines.totals).toMatchObject({ added: 14, deleted: 3,
      invocationIds: ['inv-failed', 'inv-repair'] });
    expect(map.modules.find(module => module.module === other)?.lines).toMatchObject({ totals: { added: 3, deleted: 1 }, binary: { paths: 1 } });
    expect(map.unmapped.totals).toMatchObject({ added: 4, deleted: 1 });
    expect(map.lines.gaps).toEqual(expect.arrayContaining([expect.stringContaining('inv-missing'), expect.stringContaining('unguarded shell')]));
    expect(map.modules.find(module => module.module === workspace)?.workedIn).toBe(false);
    expect(map.modules.find(module => module.module === workspace)?.involvedDescendants).toBe(2);
    expect(executionModuleMapOf(view, tree, [], await capturedLinesOf(view))).toEqual(map); // disk replay
  });

  it('treats a live writer as pending and keeps an unavailable tree explicit', async () => {
    const view = await setup(started('inv-live', false));
    const captured = await capturedLinesOf(view);
    expect(captured.coverage).toBe('pending');
    const unavailable: ModuleTree = { status: 'unavailable', message: 'Architect view missing.' };
    const map = executionModuleMapSchema.parse(executionModuleMapOf(view, unavailable, [], captured));
    expect(map.tree).toEqual(unavailable);
    expect(map.modules).toEqual([]);
    expect(map.lines).toMatchObject({ coverage: 'pending', totals: { added: 0, deleted: 0 } });
    const interrupted = await setup([...started('inv-unsettled', false), { type: 'job-interrupted', data: {} }]);
    expect((await capturedLinesOf(interrupted)).coverage).toBe('partial');
    expect((await capturedLinesOf(interrupted)).gaps).toEqual([expect.stringContaining('inv-unsettled')]);
  });

  it('keeps a proposed placement and recorded owner absent from the current tree outside it', async () => {
    const view = await setup([]);
    const proposed = `${reviews}/new-part`;
    const template = executionMapFixtureNodes.find(node => node.kind === 'capability')!;
    if (template.kind !== 'capability') throw new Error('Capability fixture missing');
    const node = { ...template, owner: proposed,
      proposed: { parent: reviews, directory: 'subs/workspace/subs/reviews/subs/new-part', purpose: 'New part.', tags: [] },
      modules: [{ module: proposed, role: 'owner' as const, source: template.sourceRefs[0]! }] };
    const map = executionModuleMapSchema.parse(executionModuleMapOf(view, tree, [node], await capturedLinesOf(view)));
    expect(map.proposed).toEqual([{ module: proposed, parent: reviews,
      directory: 'subs/workspace/subs/reviews/subs/new-part', element: node.key }]);
    expect(map.outsideTree).toMatchObject([{ module: proposed, workedIn: false,
      direct: [{ element: node.key, role: 'owner' }] }]);
    expect(map.modules.find(module => module.module === reviews)?.involvedDescendants).toBe(0);
  });
});
