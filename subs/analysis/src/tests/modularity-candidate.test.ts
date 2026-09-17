import { describe, expect, it } from 'vitest';
import { projectChangeAffinity, projectModularity } from '../index.js';
import type {
  AnalysisReport,
  CandidateOwnership,
  ChangeHistory,
  Metric,
  ModularityLimits,
  ModularityReport,
  ModularityView,
  OwnerMetrics,
  OwnershipIssue,
  OwnershipModule,
} from '../index.js';
import { buildReport, graphSpec, paths, type FixtureFact } from './modularity-fixture.js';

const limits: ModularityLimits = { maxBoundaryChanges: 100, maxReportBytes: 16 * 1024 * 1024 };
const facts: readonly FixtureFact[] = [
  { consumer: paths.main, file: paths.model, binding: 'makeModel', classification: 'behavioral' },
  { consumer: paths.main, file: paths.view, binding: 'render', classification: 'behavioral' },
  { consumer: paths.model, file: paths.service, binding: 'Service', classification: 'non-behavioral' },
  { consumer: paths.model, file: paths.helper, binding: 'help', classification: 'behavioral' },
  { consumer: paths.view, file: paths.button, binding: 'Button', classification: 'unused' },
  { consumer: paths.button, file: paths.view, binding: 'render', classification: 'non-behavioral' },
];
const report = buildReport({ ...graphSpec, behavior: { facts } });

const module = (id: string, headerTags: readonly string[] = []): OwnershipModule => ({
  id, name: id.split('/').at(-1)!, parent: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : null, headerTags });
const declaredModules: readonly OwnershipModule[] = [
  module('app'), module('app/core'), module('app/tools', ['testing']), module('app/ui'), module('app/ui/widgets'),
];
/** Splits `helper.ts` out of `app/core` into a new child. */
const split: CandidateOwnership = { id: 'split-helpers',
  modules: [...declaredModules, module('app/core/helpers')], files: [{ path: paths.helper, owner: 'app/core/helpers' }] };
/** Merges `app/ui/widgets` into `app/ui`. */
const merge: CandidateOwnership = { id: 'merge-widgets',
  modules: declaredModules.filter(item => item.id !== 'app/ui/widgets'), files: [{ path: paths.button, owner: 'app/ui' }] };

function projected(ownership?: CandidateOwnership, input: { report?: AnalysisReport; limits?: ModularityLimits } = {}): ModularityReport {
  const outcome = projectModularity({ revision: 'batch:input-1', report: input.report ?? report, limits: input.limits ?? limits, ownership });
  if (outcome.status !== 'projected') throw new Error(`Expected a projection: ${JSON.stringify(outcome)}`);
  return outcome.report;
}
function issues(ownership: CandidateOwnership): readonly OwnershipIssue[] {
  const outcome = projectModularity({ revision: 'r', report, limits, ownership });
  if (outcome.status !== 'invalid-ownership') throw new Error(`Expected invalid ownership: ${JSON.stringify(outcome)}`);
  const affinity = projectChangeAffinity({ revision: 'r', report, ownership, history: { provenance: {
    source: 'git', head: 'h', range: 'HEAD', firstParent: false, merges: 'excluded', projectDirectory: '.' }, commits: [] },
  thresholds: { minOwnerCommits: 1, minSharedCommits: 1, maxOwnersPerCommit: null, excludedCommits: [] }, filter: 'production' });
  expect(affinity).toEqual(outcome);
  return outcome.issues;
}
const pairs = (list: readonly OwnershipIssue[]) => list.map(issue => [issue.code, issue.subject]);
function measured<T>(metric: Metric<T>): T {
  if (metric.state !== 'measured') throw new Error(`Expected a measured metric: ${JSON.stringify(metric)}`);
  return metric.value;
}
const view = (result: ModularityReport, filter: 'production' | 'test'): ModularityView =>
  result.views.find(item => item.filter === filter)!;
const owner = (item: ModularityView, id: string): OwnerMetrics => item.owners.find(entry => entry.owner === id)!;
const ratio = (numerator: number, denominator: number) =>
  ({ numerator, denominator, value: denominator === 0 ? null : numerator / denominator });

describe('candidate ownership: validation', () => {
  it('accepts a legal candidate as a positive control', () => {
    expect(projected(split).provenance).toMatchObject({ ownership: 'candidate', candidateId: 'split-helpers' });
    // A module-owned test file keeps its testing classification under a non-testing owner.
    expect(projected({ ...split, files: [...split.files, { path: paths.modelTest, owner: 'app' }] }).boundaryChanges!.total).toBe(2);
  });

  it('rejects invalid candidate ids', () => {
    expect(pairs(issues({ ...split, id: '' }))).toEqual([['invalid-candidate-id', '']]);
    expect(pairs(issues({ ...split, id: 'tab\there' }))).toEqual([['invalid-candidate-id', 'tab\there']]);
    expect(pairs(issues({ ...split, id: 'lone\uD800' }))).toEqual([['invalid-candidate-id', 'lone\uD800']]);
  });

  it('rejects invalid module identities, names, parents and tags, and repeated modules', () => {
    expect(pairs(issues({ ...split, modules: [...split.modules,
      module('app/Bad'),
      { id: 'app/wrong', name: 'other', parent: 'app', headerTags: [] },
      { id: 'app/tagged', name: 'tagged', parent: 'app', headerTags: ['unregistered'] },
      module('app/ui'),
    ] }))).toEqual([
      ['duplicate-module', 'app/ui'],
      ['invalid-module-id', 'app/Bad'], ['invalid-module-id', 'app/tagged'], ['invalid-module-id', 'app/wrong'],
    ]);
  });

  it('rejects trees without the declared single root or with unknown parents', () => {
    expect(pairs(issues({ ...split, modules: [...split.modules, module('other')] }))).toEqual([['invalid-tree', '']]);
    expect(pairs(issues({ ...split, modules: [...declaredModules.filter(item => item.id !== 'app/core'), module('app/core/helpers')] })))
      .toEqual([['invalid-tree', 'app/core/helpers'],
        ['unknown-owner', paths.model], ['unknown-owner', paths.modelTest], ['unknown-owner', paths.support]]);
    const renamed: CandidateOwnership = { id: 'renamed', modules: declaredModules.map(item => item.parent === null ? module('root')
      : { ...item, id: item.id.replace(/^app/, 'root'), parent: item.parent.replace(/^app/, 'root') }),
    files: graphSpec.files.map(file => ({ path: file.path, owner: file.owner.replace(/^app/, 'root') })) };
    expect(pairs(issues(renamed))).toEqual([['invalid-tree', 'root']]);
  });

  it('rejects unknown and repeated files, unknown owners and testing classification changes, ordered by code then subject', () => {
    const result = issues({ ...merge, files: [
      { path: 'subs/core/src/gone.ts', owner: 'app' },
      { path: paths.view, owner: 'app/core' }, { path: paths.view, owner: 'app' },
      { path: paths.main, owner: 'app/missing' },
      { path: paths.probe, owner: 'app/core' },
    ] });
    expect(pairs(result)).toEqual([
      ['classification-change', paths.probe],
      ['duplicate-file', paths.view],
      ['unknown-file', 'subs/core/src/gone.ts'],
      // The retained button keeps a module the candidate removed.
      ['unknown-owner', paths.main], ['unknown-owner', paths.button],
    ]);
    expect(result.every(issue => issue.message.length > 0)).toBe(true);
    // Header tags change the classification of files an owner retains.
    expect(pairs(issues({ ...split, modules: split.modules.map(item => item.id === 'app/ui' ? module('app/ui', ['testing']) : item) })))
      .toEqual([['classification-change', paths.styles], ['classification-change', paths.css], ['classification-change', paths.view]]);
  });
});

describe('candidate ownership: recomputed measures', () => {
  const declared = projected();

  it('reproduces declared measures for the identity candidate, except exposure-dependent values', () => {
    const identity = projected({ id: 'identity', modules: [...declaredModules].reverse(),
      files: graphSpec.files.map(file => ({ path: file.path, owner: file.owner })) });
    const withoutExposure = (result: ModularityReport) => JSON.parse(JSON.stringify(result.views, (key, value) =>
      key === 'interfaceUse' || key === 'exposedOriginals' ? undefined : value));
    expect(withoutExposure(identity)).toEqual(withoutExposure(declared));
    expect(identity.modules).toEqual(declared.modules);
    expect(identity.coverage).toEqual(declared.coverage);
    expect(identity.boundaryChanges).toEqual({ total: 0, changes: [], truncated: false });
    expect(declared.boundaryChanges).toBeNull();
    expect(owner(view(identity, 'production'), 'app/core').interfaceUse).toEqual({ state: 'unavailable', reason: 'candidate-exposure' });
  });

  it('recomputes a split: new boundary, edge, behavioral dependency and null exposure values', () => {
    const result = projected(split);
    const production = view(result, 'production');
    expect(result.modules.map(item => item.id)).toEqual(['app', 'app/core', 'app/core/helpers', 'app/tools', 'app/ui', 'app/ui/widgets']);
    expect(production.owners.map(item => item.owner)).toEqual(['app', 'app/core', 'app/core/helpers', 'app/ui', 'app/ui/widgets']);
    expect(measured(production.summary.all)).toMatchObject({ applicationOccurrences: 7, sameOwnerOccurrences: 0,
      crossOwnerOccurrences: 7, edges: 7, exactLocality: ratio(0, 7) });
    expect(measured(view(result, 'test').summary.all)).toEqual(measured(view(declared, 'test').summary.all));
    expect(production.edges.find(edge => edge.consumer === 'app/core' && edge.provider === 'app/core/helpers')?.relation).toBe('child');
    expect(measured(owner(production, 'app/core').exact.all)).toMatchObject({ internalOccurrences: 0, locality: ratio(0, 2) });
    expect(measured(owner(production, 'app/core').subtree.all)).toMatchObject({ internalOccurrences: 1, locality: ratio(1, 2) });
    expect(measured(owner(production, 'app/core').behavior)).toEqual({ behavioralDependencies: 1, nonBehavioralDependencies: 1 });
    expect(measured(production.behavior)).toEqual({ behavioralDependencies: 3, nonBehavioralDependencies: 2 });
    expect(measured(production.cycles).map(component => [component.kind, component.members])).toEqual([
      ['runtime', ['app/ui', 'app/ui/widgets']], ['type-only', ['app', 'app/core', 'app/ui', 'app/ui/widgets']]]);

    for (const item of production.owners) {
      expect(item.interfaceUse).toEqual({ state: 'unavailable', reason: 'candidate-exposure' });
      expect(measured(item.context.exact).exposedOriginals).toBeNull();
      expect(measured(item.context.subtree).exposedOriginals).toBeNull();
      for (const isolate of measured(item.connectedness).isolates) expect(isolate.exposedOriginals).toBeNull();
    }
    expect(measured(owner(production, 'app/core/helpers').context.exact)).toMatchObject({ sourceFiles: 1, sourceBytes: 20, originals: 1 });
    expect(result.boundaryChanges).toEqual({ total: 1, truncated: false, changes: [{ accessId: 'a03', filter: 'production',
      importer: paths.model, target: paths.helper, runtimeLoad: true, declared: { consumer: 'app/core', provider: 'app/core' },
      candidate: { consumer: 'app/core', provider: 'app/core/helpers' }, change: 'became-cross-owner' }] });
  });

  it('recomputes a merge: removed runtime cycle, narrowed type-only component and regrouped behavior', () => {
    const result = projected(merge);
    const production = view(result, 'production');
    expect(production.owners.map(item => item.owner)).toEqual(['app', 'app/core', 'app/ui']);
    expect(measured(production.summary.all)).toMatchObject({ sameOwnerOccurrences: 3, crossOwnerOccurrences: 4, edges: 4,
      exactLocality: ratio(3, 7) });
    expect(measured(production.summary.runtime)).toMatchObject({ crossOwnerOccurrences: 2, edges: 2 });
    expect(measured(production.cycles).map(component => [component.kind, component.members, component.runtimeComponents]))
      .toEqual([['type-only', ['app', 'app/core', 'app/ui'], []]]);
    expect(measured(owner(production, 'app/ui').exact.all)).toMatchObject({ internalOccurrences: 2, locality: ratio(2, 3) });
    expect(measured(owner(production, 'app/ui').connectedness)).toMatchObject({ files: 3, components: 2, largestComponentFiles: 2 });
    expect(measured(owner(production, 'app/ui').behavior)).toEqual({ behavioralDependencies: 0, nonBehavioralDependencies: 0 });
    expect(measured(production.behavior)).toEqual({ behavioralDependencies: 2, nonBehavioralDependencies: 1 });
    expect(result.boundaryChanges!.changes.map(change => [change.accessId, change.change])).toEqual([
      ['a05', 'became-same-owner'], ['a06', 'became-same-owner']]);
  });

  it('classifies every boundary change kind in both filters, ordered by access id, and truncates at the limit', () => {
    const moved: CandidateOwnership = { id: 'move-model', modules: declaredModules, files: [{ path: paths.model, owner: 'app/ui' }] };
    const result = projected(moved);
    expect(result.boundaryChanges!.changes.map(change => [change.accessId, change.filter, change.change,
      `${change.declared.consumer}>${change.declared.provider}`, `${change.candidate.consumer}>${change.candidate.provider}`])).toEqual([
      ['a01', 'production', 'changed-owners', 'app>app/core', 'app>app/ui'],
      ['a03', 'production', 'became-cross-owner', 'app/core>app/core', 'app/ui>app/core'],
      ['a04', 'production', 'changed-owners', 'app/core>app', 'app/ui>app'],
      ['a08', 'test', 'became-cross-owner', 'app/core>app/core', 'app/core>app/ui'],
      ['a09', 'test', 'changed-owners', 'app/tools>app/core', 'app/tools>app/ui'],
      ['a10', 'production', 'became-same-owner', 'app/ui>app/core', 'app/ui>app/ui'],
    ]);
    const truncated = projected(moved, { limits: { ...limits, maxBoundaryChanges: 2 } }).boundaryChanges!;
    expect([truncated.total, truncated.truncated, truncated.changes.map(change => change.accessId)]).toEqual([6, true, ['a01', 'a03']]);
    const exact = projected(moved, { limits: { ...limits, maxBoundaryChanges: 6 } }).boundaryChanges!;
    expect([exact.total, exact.truncated, exact.changes.length]).toEqual([6, false, 6]);
  });

  it('serializes a candidate identically whatever the order of its modules, files and properties', () => {
    const reordered: CandidateOwnership = { files: [...split.files].reverse(), modules: [...split.modules].reverse()
      .map(item => ({ headerTags: item.headerTags, parent: item.parent, name: item.name, id: item.id })), id: split.id };
    expect(JSON.stringify(projected(reordered))).toBe(JSON.stringify(projected(split)));
  });
});

describe('candidate ownership: change affinity', () => {
  const history: ChangeHistory = {
    provenance: { source: 'git', head: 'c3', range: 'HEAD', firstParent: false, merges: 'excluded', projectDirectory: '.' },
    commits: [
      { id: 'c1', paths: [paths.button, paths.view] },
      { id: 'c2', paths: [paths.button, paths.main] },
      { id: 'c3', paths: [paths.helper, paths.model] },
    ],
  };
  const thresholds = { minOwnerCommits: 1, minSharedCommits: 1, maxOwnersPerCommit: 2, excludedCommits: [] };
  const affinity = (ownership?: CandidateOwnership) => {
    const outcome = projectChangeAffinity({ revision: 'r', report, history, thresholds, filter: 'production', ownership });
    if (outcome.status !== 'projected') throw new Error(JSON.stringify(outcome));
    return outcome.report;
  };

  it('maps history paths through the candidate owners', () => {
    const declared = affinity();
    expect(declared.pairs.map(pair => [pair.first, pair.second, pair.shared])).toEqual([
      ['app', 'app/ui/widgets', 1], ['app/ui', 'app/ui/widgets', 1]]);

    const merged = affinity(merge);
    expect([merged.ownership, merged.candidateId]).toEqual(['candidate', 'merge-widgets']);
    expect(merged.owners).toEqual([
      { owner: 'app', commits: 1, sufficient: true }, { owner: 'app/core', commits: 1, sufficient: true },
      { owner: 'app/ui', commits: 2, sufficient: true }]);
    expect(merged.pairs.map(pair => [pair.first, pair.second, pair.shared, pair.affinity])).toEqual([['app', 'app/ui', 1, ratio(1, 2)]]);

    const splitAffinity = affinity(split);
    expect(splitAffinity.owners.map(item => [item.owner, item.commits])).toEqual([
      ['app', 1], ['app/core', 1], ['app/core/helpers', 1], ['app/ui', 1], ['app/ui/widgets', 2]]);
    expect(splitAffinity.pairs.map(pair => [pair.first, pair.second])).toEqual([
      ['app', 'app/ui/widgets'], ['app/core', 'app/core/helpers'], ['app/ui', 'app/ui/widgets']]);
  });
});
