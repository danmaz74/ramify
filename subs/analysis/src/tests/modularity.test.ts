import { describe, expect, it } from 'vitest';
import { projectModularity } from '../index.js';
import type {
  AnalysisReport,
  LoadVariants,
  Metric,
  ModularityOutcome,
  ModularityReport,
  ModularityView,
  OwnerMetrics,
} from '../index.js';
import { buildReport, graphSpec, paths, type FixtureSpec } from './modularity-fixture.js';

const limits = { maxBoundaryChanges: 100, maxReportBytes: 16 * 1024 * 1024 };

function projected(report: AnalysisReport, revision = 'batch:input-1'): ModularityReport {
  const outcome: ModularityOutcome = projectModularity({ revision, report, limits });
  if (outcome.status !== 'projected') throw new Error(`Expected a projection: ${JSON.stringify(outcome)}`);
  return outcome.report;
}
function measured<T>(metric: Metric<T>): T {
  if (metric.state !== 'measured') throw new Error(`Expected a measured metric: ${JSON.stringify(metric)}`);
  return metric.value;
}
function partial<T>(metric: Metric<T>) {
  if (metric.state !== 'partial') throw new Error(`Expected a partial metric: ${JSON.stringify(metric)}`);
  return metric;
}
const view = (report: ModularityReport, filter: 'production' | 'test'): ModularityView =>
  report.views.find(item => item.filter === filter)!;
const owner = (item: ModularityView, id: string): OwnerMetrics => {
  const found = item.owners.find(entry => entry.owner === id);
  if (!found) throw new Error(`Owner ${id} is not listed`);
  return found;
};
const values = <T>(metrics: LoadVariants<Metric<T>>) =>
  ({ all: measured(metrics.all), runtime: measured(metrics.runtime), typeOnly: measured(metrics.typeOnly) });
const ratio = (numerator: number, denominator: number) =>
  ({ numerator, denominator, value: denominator === 0 ? null : numerator / denominator });

describe('modularity projection: declared ownership', () => {
  const report = projected(buildReport(graphSpec));
  const production = view(report, 'production');
  const test = view(report, 'test');

  it('records provenance, the ownership tree and views in contract order', () => {
    expect(report.schemaVersion).toBe('ramify.modularity/3');
    expect(report.provenance).toEqual({
      revision: 'batch:input-1', analysisSchema: 'ramify.analysis/3', inputId: 'input-1',
      registryId: buildReport(graphSpec).registry!.id, check: 'passed', analysisCoverage: 'complete',
      capabilities: ['coverage', 'registry', 'static-access'], omittedScopes: [], ownership: 'declared', candidateId: null,
    });
    expect(report.modules.map(module => [module.id, module.parent])).toEqual([
      ['app', null], ['app/core', 'app'], ['app/tools', 'app'], ['app/ui', 'app'], ['app/ui/widgets', 'app/ui'],
    ]);
    expect(report.views.map(item => item.filter)).toEqual(['production', 'test']);
    expect(report.boundaryChanges).toBeNull();
    expect(report.coverage).toEqual({ state: 'complete', detail: { limitIds: [], unattributedAccesses: 0, unknownDependencies: 0 } });
    expect(production.owners.map(item => item.owner)).toEqual(['app', 'app/core', 'app/ui', 'app/ui/widgets']);
    expect(test.owners.map(item => item.owner)).toEqual(['app', 'app/core', 'app/tools']);
  });

  // The modularity report specification: owned compiler source outside src/ is
  // analyzed as its owner's auxiliary source, so it counts as that owner's
  // production source, and its accesses as that owner's occurrences.
  it('counts auxiliary source as its owner\'s production source', () => {
    const script = 'subs/ui/scripts/build.ts';
    const spec: FixtureSpec = { ...graphSpec, files: [...graphSpec.files, { path: script, owner: 'app/ui', placement: 'auxiliary', bytes: 9 }],
      accesses: [...graphSpec.accesses, { id: 'a12', importer: script, target: paths.view, selections: [{ file: paths.view, binding: 'render' }] }] };
    const auxiliary = view(projected(buildReport(spec)), 'production');
    expect(values(auxiliary.summary).all).toMatchObject({ owners: 4, sourceFiles: 8, applicationOccurrences: 8, sameOwnerOccurrences: 2,
      crossOwnerOccurrences: 6, edges: 6, outsideModuleOccurrences: 0 });
    expect(measured(owner(auxiliary, 'app/ui').exact.all).internalOccurrences).toBe(measured(owner(production, 'app/ui').exact.all).internalOccurrences + 1);
  });

  it('summarizes each source filter per load variant without mixing production and test', () => {
    const base = { owners: 4, sourceFiles: 7, outsideModuleOccurrences: 0, unresolvedOccurrences: 0 };
    expect(values(production.summary)).toEqual({
      all: { ...base, applicationOccurrences: 7, sameOwnerOccurrences: 1, crossOwnerOccurrences: 6, edges: 6,
        externalOccurrences: 1, exactLocality: ratio(1, 7) },
      runtime: { ...base, applicationOccurrences: 5, sameOwnerOccurrences: 1, crossOwnerOccurrences: 4, edges: 4,
        externalOccurrences: 1, exactLocality: ratio(1, 5) },
      typeOnly: { ...base, applicationOccurrences: 2, sameOwnerOccurrences: 0, crossOwnerOccurrences: 2, edges: 2,
        externalOccurrences: 0, exactLocality: ratio(0, 2) },
    });
    expect(measured(test.summary.all)).toEqual({ owners: 2, sourceFiles: 3, applicationOccurrences: 3, sameOwnerOccurrences: 1,
      crossOwnerOccurrences: 2, edges: 1, externalOccurrences: 0, outsideModuleOccurrences: 0, unresolvedOccurrences: 0,
      exactLocality: ratio(1, 3) });
    expect(test.edges.map(edge => [edge.consumer, edge.provider, measured(edge.breadth.runtime).occurrences,
      measured(edge.breadth.typeOnly).occurrences])).toEqual([['app/tools', 'app/core', 1, 1]]);
  });

  it('measures exact and subtree boundary locality with breadth and null zero-denominator ratios', () => {
    const app = owner(production, 'app');
    expect(measured(app.exact.all)).toEqual({
      internalOccurrences: 0,
      outgoing: { occurrences: 2, selectedSymbols: 2, consumerFiles: 1, providerFiles: 2, filePairs: 2, modules: 2 },
      incoming: { occurrences: 1, selectedSymbols: 1, consumerFiles: 1, providerFiles: 1, filePairs: 1, modules: 1 },
      locality: ratio(0, 2),
    });
    expect(measured(app.exact.typeOnly).locality).toEqual({ numerator: 0, denominator: 0, value: null });
    expect(measured(app.subtree.all).locality).toEqual(ratio(7, 7));
    const core = measured(owner(production, 'app/core').exact.all);
    expect(core.internalOccurrences).toBe(1);
    expect(core.locality).toEqual(ratio(1, 2));
    expect(core.incoming).toEqual({ occurrences: 2, selectedSymbols: 2, consumerFiles: 2, providerFiles: 1, filePairs: 2, modules: 2 });
    const ui = owner(production, 'app/ui');
    expect(measured(ui.exact.all).locality).toEqual(ratio(0, 2));
    expect(values(ui.subtree)).toMatchObject({
      all: { internalOccurrences: 2, locality: ratio(2, 3), incoming: { occurrences: 1, modules: 1 } },
      runtime: { internalOccurrences: 2, locality: ratio(2, 2) },
      typeOnly: { internalOccurrences: 0, locality: ratio(0, 1) },
    });
  });

  it('lists edges by consumer then provider with relation, per-variant breadth and stability direction', () => {
    expect(production.edges.map(edge => [edge.consumer, edge.provider, edge.relation,
      edge.direction.all, edge.direction.runtime, edge.direction.typeOnly])).toEqual([
      ['app', 'app/core', 'child', 'toward-stable', 'toward-stable', 'undefined'],
      ['app', 'app/ui', 'child', 'toward-stable', 'toward-stable', 'undefined'],
      ['app/core', 'app', 'parent', 'toward-volatile', 'undefined', 'toward-stable'],
      ['app/ui', 'app/core', 'unrelated', 'toward-stable', 'undefined', 'toward-stable'],
      ['app/ui', 'app/ui/widgets', 'child', 'level', 'toward-volatile', 'undefined'],
      ['app/ui/widgets', 'app/ui', 'parent', 'level', 'toward-stable', 'undefined'],
    ]);
    expect(values(production.edges[0]!.breadth)).toEqual({
      all: { occurrences: 1, selectedSymbols: 1, consumerFiles: 1, providerFiles: 1, filePairs: 1 },
      runtime: { occurrences: 1, selectedSymbols: 1, consumerFiles: 1, providerFiles: 1, filePairs: 1 },
      typeOnly: { occurrences: 0, selectedSymbols: 0, consumerFiles: 0, providerFiles: 0, filePairs: 0 },
    });
  });

  it('computes afferent and efferent owners and instability per load variant', () => {
    const stability = (id: string) => values(owner(production, id).stability);
    expect(stability('app')).toEqual({
      all: { afferent: 1, efferent: 2, instability: ratio(2, 3) },
      runtime: { afferent: 0, efferent: 2, instability: ratio(2, 2) },
      typeOnly: { afferent: 1, efferent: 0, instability: ratio(0, 1) },
    });
    expect(stability('app/ui').all).toEqual({ afferent: 2, efferent: 2, instability: ratio(2, 4) });
    expect(stability('app/ui/widgets').typeOnly).toEqual({ afferent: 0, efferent: 0, instability: ratio(0, 0) });
  });

  it('reports runtime and type-only cycle components with shortest deduplicated witnesses', () => {
    expect(measured(production.cycles)).toEqual([
      { kind: 'runtime', members: ['app/ui', 'app/ui/widgets'], occurrences: 2, runtimeOccurrences: 2, files: 2, selectedSymbols: 2,
        witnesses: [[
          { consumer: 'app/ui', provider: 'app/ui/widgets', runtimeOccurrences: 1, typeOnlyOccurrences: 0 },
          { consumer: 'app/ui/widgets', provider: 'app/ui', runtimeOccurrences: 1, typeOnlyOccurrences: 0 },
        ]], runtimeComponents: [] },
      { kind: 'type-only', members: ['app', 'app/core', 'app/ui', 'app/ui/widgets'], occurrences: 6, runtimeOccurrences: 4,
        files: 5, selectedSymbols: 5,
        witnesses: [
          [{ consumer: 'app', provider: 'app/core', runtimeOccurrences: 1, typeOnlyOccurrences: 0 },
            { consumer: 'app/core', provider: 'app', runtimeOccurrences: 0, typeOnlyOccurrences: 1 }],
          [{ consumer: 'app/ui', provider: 'app/ui/widgets', runtimeOccurrences: 1, typeOnlyOccurrences: 0 },
            { consumer: 'app/ui/widgets', provider: 'app/ui', runtimeOccurrences: 1, typeOnlyOccurrences: 0 }],
        ],
        runtimeComponents: [['app/ui', 'app/ui/widgets']] },
    ]);
    expect(measured(test.cycles)).toEqual([]);
  });

  it('finds a longer shortest witness from each member and rotates it to the byte-least member', () => {
    const spec: FixtureSpec = {
      modules: [{ id: 'r' }, { id: 'r/a' }, { id: 'r/b' }, { id: 'r/c' }],
      files: [{ path: 'subs/a/src/a.ts', owner: 'r/a' }, { path: 'subs/b/src/b.ts', owner: 'r/b' }, { path: 'subs/c/src/c.ts', owner: 'r/c' }],
      originals: [], exposures: [],
      accesses: [
        { id: '1', importer: 'subs/c/src/c.ts', target: 'subs/a/src/a.ts', runtime: false },
        { id: '2', importer: 'subs/a/src/a.ts', target: 'subs/b/src/b.ts', runtime: false },
        { id: '3', importer: 'subs/b/src/b.ts', target: 'subs/c/src/c.ts', runtime: false },
        { id: '4', importer: 'subs/b/src/b.ts', target: 'subs/a/src/a.ts' },
      ],
    };
    const cycles = measured(view(projected(buildReport(spec)), 'production').cycles);
    expect(cycles.map(component => [component.kind, component.members, component.witnesses
      .map(witness => witness.map(step => `${step.consumer}>${step.provider}`))])).toEqual([
      ['type-only', ['r/a', 'r/b', 'r/c'], [['r/a>r/b', 'r/b>r/a'], ['r/a>r/b', 'r/b>r/c', 'r/c>r/a']]],
    ]);
  });

  it('classifies ancestor and descendant relations', () => {
    const spec: FixtureSpec = {
      modules: [{ id: 'r' }, { id: 'r/a' }, { id: 'r/a/b' }],
      files: [{ path: 'src/main.ts', owner: 'r' }, { path: 'subs/a/subs/b/src/b.ts', owner: 'r/a/b' }],
      originals: [], exposures: [],
      accesses: [
        { id: '1', importer: 'src/main.ts', target: 'subs/a/subs/b/src/b.ts' },
        { id: '2', importer: 'subs/a/subs/b/src/b.ts', target: 'src/main.ts', runtime: false },
      ],
    };
    const result = view(projected(buildReport(spec)), 'production');
    expect(result.edges.map(edge => [edge.consumer, edge.provider, edge.relation])).toEqual([
      ['r', 'r/a/b', 'descendant'], ['r/a/b', 'r', 'ancestor'],
    ]);
    // r/a owns no file but its subtree does, so it is listed with empty exact measures.
    expect(result.owners.map(item => item.owner)).toEqual(['r', 'r/a', 'r/a/b']);
    expect(measured(owner(result, 'r/a').exact.all).locality.value).toBeNull();
    expect(measured(owner(result, 'r/a').subtree.all)).toMatchObject({ internalOccurrences: 0, locality: ratio(0, 1) });
  });

  it('measures repository interface use of effective owned exposures per filter', () => {
    const rows = (metric: Metric<{ rows: readonly { destination: string; capability: string; exposedOriginals: number;
      selectedOriginals: number }[] }>) => measured(metric).rows.map(row =>
      `${row.destination}/${row.capability}:${row.selectedOriginals}/${row.exposedOriginals}`);
    expect(rows(owner(production, 'app/core').interfaceUse)).toEqual([
      'parent/value:1/2', 'parent/type-only:1/2', 'parent/any:2/4',
      'descendants/value:1/1', 'descendants/type-only:0/0', 'descendants/any:1/1',
      'any/value:1/2', 'any/type-only:1/2', 'any/any:2/4',
    ]);
    expect(measured(owner(production, 'app/core').interfaceUse).rows[4]!.repositoryInterfaceUse).toEqual(ratio(0, 0));
    expect(rows(owner(production, 'app/ui').interfaceUse).at(-1)).toBe('any/any:1/2');
    expect(rows(owner(production, 'app/ui/widgets').interfaceUse).at(-1)).toBe('any/any:1/1');
    expect(rows(owner(production, 'app').interfaceUse)).toContain('descendants/type-only:1/1');
    expect(rows(owner(test, 'app/core').interfaceUse).at(-1)).toBe('any/any:1/1');
    expect(rows(owner(test, 'app/tools').interfaceUse).at(-1)).toBe('any/any:0/0');
  });

  it('reports production connectedness with isolates and leaves the test view undefined', () => {
    expect(measured(owner(production, 'app').connectedness)).toEqual({
      files: 2, components: 2, largestComponentFiles: 1, largestComponentCoverage: ratio(1, 2),
      isolates: [
        { path: paths.service, declarationFile: false, interfaceFile: true, exposedOriginals: 1, incomingOccurrences: 1, outgoingOccurrences: 0 },
        { path: paths.main, declarationFile: false, interfaceFile: false, exposedOriginals: 0, incomingOccurrences: 0, outgoingOccurrences: 2 },
      ],
    });
    expect(measured(owner(production, 'app/core').connectedness)).toEqual({
      files: 2, components: 1, largestComponentFiles: 2, largestComponentCoverage: ratio(2, 2), isolates: [] });
    expect(measured(owner(production, 'app/ui').connectedness).isolates.map(item =>
      [item.path, item.declarationFile, item.exposedOriginals, item.incomingOccurrences, item.outgoingOccurrences])).toEqual([
      [paths.styles, true, 0, 0, 0], [paths.view, false, 2, 2, 2],
    ]);
    expect(owner(test, 'app/core').connectedness).toEqual({ state: 'unavailable', reason: 'not-defined' });
  });

  it('sums context size for exact owners and subtrees, including resources of the filter classification', () => {
    expect(measured(owner(production, 'app/ui').context.subtree)).toEqual({
      sourceFiles: 3, sourceBytes: 465, resourceFiles: 1, resourceBytes: 7, documentation: { files: 4, bytes: 60 },
      originals: 4, exposedOriginals: 3, accessOccurrences: 4 });
    expect(measured(owner(production, 'app/core').context.exact)).toEqual({
      sourceFiles: 2, sourceBytes: 220, resourceFiles: 0, resourceBytes: 0, documentation: { files: 2, bytes: 30 },
      originals: 4, exposedOriginals: 4, accessOccurrences: 2 });
    expect(measured(owner(test, 'app/core').context.exact)).toEqual({
      sourceFiles: 2, sourceBytes: 330, resourceFiles: 0, resourceBytes: 0, documentation: { files: 2, bytes: 30 },
      originals: 1, exposedOriginals: 1, accessOccurrences: 1 });
    expect(measured(owner(test, 'app/tools').context.exact).documentation).toEqual({ files: 1, bytes: 10 });
  });
});

describe('modularity projection: behavioral dependencies', () => {
  // Each behavior fact is supported by an access from its consumer file.
  const accesses: FixtureSpec['accesses'] = [...graphSpec.accesses,
    { id: 'b01', importer: paths.service, target: paths.view, runtime: false, selections: [{ file: paths.view, binding: 'render' }] },
    { id: 'b02', importer: paths.styles, target: paths.model, runtime: false, selections: [{ file: paths.model, binding: 'Model' }] }];
  const facts = [
    { consumer: paths.main, file: paths.model, binding: 'makeModel', classification: 'behavioral' as const },
    { consumer: paths.main, file: paths.view, binding: 'render', classification: 'behavioral' as const },
    { consumer: paths.service, file: paths.view, binding: 'render', classification: 'non-behavioral' as const },
    { consumer: paths.model, file: paths.service, binding: 'Service', classification: 'non-behavioral' as const },
    { consumer: paths.model, file: paths.helper, binding: 'help', classification: 'behavioral' as const },
    { consumer: paths.view, file: paths.button, binding: 'Button', classification: 'unused' as const },
    { consumer: paths.button, file: paths.view, binding: 'render', classification: 'non-behavioral' as const },
    { consumer: paths.probe, file: paths.model, binding: 'Model', classification: 'non-behavioral' as const },
  ];

  it('is unavailable when not requested or requested without facts', () => {
    expect(view(projected(buildReport(graphSpec)), 'production').behavior).toEqual({ state: 'unavailable', reason: 'not-requested' });
    const missing = view(projected(buildReport({ ...graphSpec, behavior: 'missing' })), 'production');
    expect(missing.behavior).toEqual({ state: 'unavailable', reason: 'capability-failed' });
    expect(owner(missing, 'app').behavior).toEqual({ state: 'unavailable', reason: 'capability-failed' });
  });

  it('deduplicates per consumer module and original with behavioral precedence, excluding same-owner and unused', () => {
    const report = projected(buildReport({ ...graphSpec, accesses, behavior: { facts } }));
    const production = view(report, 'production');
    expect(report.provenance.capabilities).toEqual(['coverage', 'dependency-behavior', 'registry', 'static-access']);
    expect(production.owners.map(item => [item.owner, measured(item.behavior)])).toEqual([
      ['app', { behavioralDependencies: 2, nonBehavioralDependencies: 0 }],
      ['app/core', { behavioralDependencies: 0, nonBehavioralDependencies: 1 }],
      ['app/ui', { behavioralDependencies: 0, nonBehavioralDependencies: 0 }],
      ['app/ui/widgets', { behavioralDependencies: 0, nonBehavioralDependencies: 1 }],
    ]);
    expect(measured(production.behavior)).toEqual({ behavioralDependencies: 2, nonBehavioralDependencies: 2 });
    expect(measured(view(report, 'test').behavior)).toEqual({ behavioralDependencies: 0, nonBehavioralDependencies: 1 });
  });

  it('ranks unknown above non-behavioral and makes the metric partial', () => {
    const unknown = [...facts,
      { consumer: paths.view, file: paths.model, binding: 'Model', classification: 'unknown' as const, limitIds: ['behavior-limit/b'] },
      { consumer: paths.styles, file: paths.model, binding: 'Model', classification: 'non-behavioral' as const }];
    const report = projected(buildReport({ ...graphSpec, accesses, behavior: { facts: unknown } }));
    const production = view(report, 'production');
    expect(partial(owner(production, 'app/ui').behavior)).toEqual({ state: 'partial',
      observed: { behavioralDependencies: 0, nonBehavioralDependencies: 0 },
      coverage: { limitIds: ['behavior-limit/b'], unattributedAccesses: 0, unknownDependencies: 1 } });
    expect(partial(production.behavior)).toMatchObject({ observed: { behavioralDependencies: 2, nonBehavioralDependencies: 2 },
      coverage: { limitIds: ['behavior-limit/b'], unknownDependencies: 1 } });
    expect(owner(production, 'app').behavior.state).toBe('measured');
    expect(report.coverage).toEqual({ state: 'partial', detail: { limitIds: ['behavior-limit/b'], unattributedAccesses: 0, unknownDependencies: 1 } });
  });

  it('is partial with the classifier limits when classification failed', () => {
    const production = view(projected(buildReport({ ...graphSpec, behavior: { status: 'failed', facts: [], limits: ['behavior-limit/f'] } })), 'production');
    for (const metric of [production.behavior, ...production.owners.map(item => item.behavior)]) {
      expect(partial(metric)).toEqual({ state: 'partial', observed: { behavioralDependencies: 0, nonBehavioralDependencies: 0 },
        coverage: { limitIds: ['behavior-limit/f'], unattributedAccesses: 0, unknownDependencies: 0 } });
    }
  });
});

describe('modularity projection: coverage', () => {
  it('attributes access limits and limits located in scope files', () => {
    const spec: FixtureSpec = { ...graphSpec,
      accesses: graphSpec.accesses.map(access => access.id === 'a02' ? { ...access, coverageIds: ['limit-a'] } : access),
      coverage: ['limit-a'], coverageAt: { 'limit-a': paths.main } };
    const report = projected(buildReport(spec));
    const production = view(report, 'production');
    expect(partial(production.summary.all).coverage).toEqual({ limitIds: ['limit-a'], unattributedAccesses: 0, unknownDependencies: 0 });
    expect(partial(owner(production, 'app').exact.all).observed.locality).toEqual(ratio(0, 2));
    // a02 has no endpoint in core and the limit lies in main.ts.
    expect(owner(production, 'app/core').exact.all.state).toBe('measured');
    expect(owner(production, 'app/ui/widgets').exact.all.state).toBe('measured');
    // The app→core edge touches main.ts, where the limit is located.
    expect(production.edges.map(edge => edge.breadth.all.state)).toEqual(['partial', 'partial', 'measured', 'measured', 'measured', 'measured']);
    // Interface use scopes every other consumer's occurrences.
    expect(owner(production, 'app/core').interfaceUse.state).toBe('partial');
    expect(owner(production, 'app/ui/widgets').connectedness.state).toBe('measured');
    expect(view(report, 'test').summary.all.state).toBe('measured');
    expect(report.coverage.state).toBe('partial');
  });

  it('counts unattributed accesses from scope files and unresolved application selections', () => {
    const spec: FixtureSpec = { ...graphSpec, accesses: [
      ...graphSpec.accesses.map(access => access.id === 'a10'
        ? { ...access, selections: [{ file: paths.model, binding: 'Model', status: 'missing-export' as const }] } : access),
      { id: 'a12', importer: paths.button, target: 'unresolved' },
      { id: 'a13', importer: paths.button, target: { outside: 'loose/file.ts' }, runtime: false },
    ] };
    const production = view(projected(buildReport(spec)), 'production');
    expect(partial(production.summary.all)).toMatchObject({
      observed: { unresolvedOccurrences: 1, outsideModuleOccurrences: 1 },
      coverage: { limitIds: [], unattributedAccesses: 2, unknownDependencies: 0 } });
    expect(partial(production.summary.runtime).coverage.unattributedAccesses).toBe(1);
    expect(partial(owner(production, 'app/ui/widgets').exact.typeOnly).coverage.unattributedAccesses).toBe(1);
    expect(partial(owner(production, 'app/core').exact.all).coverage.unattributedAccesses).toBe(0);
    expect(owner(production, 'app/core').exact.runtime.state).toBe('measured');
    expect(owner(production, 'app').exact.all.state).toBe('measured');
    expect(partial(owner(production, 'app').subtree.all).coverage.unattributedAccesses).toBe(2);
  });

  it('counts nested-tree and excluded occurrences with unresolved ones, as unattributed and never as edges', () => {
    const base = measured(view(projected(buildReport(graphSpec)), 'production').summary.all);
    const spec: FixtureSpec = { ...graphSpec, accesses: [...graphSpec.accesses,
      { id: 'a14', importer: paths.button, target: { nested: 'vendor/tool.ts' } },
      { id: 'a15', importer: paths.button, target: { excluded: 'dist/out.d.ts' }, runtime: false },
    ] };
    const production = view(projected(buildReport(spec)), 'production');
    // Neither names a provider: no edge or application occurrence is added.
    expect(partial(production.summary.all)).toMatchObject({
      observed: { edges: base.edges, applicationOccurrences: base.applicationOccurrences, outsideModuleOccurrences: 0, unresolvedOccurrences: 2 },
      coverage: { limitIds: [], unattributedAccesses: 2, unknownDependencies: 0 } });
    expect(production.edges.map(edge => [edge.consumer, edge.provider])).toEqual(
      view(projected(buildReport(graphSpec)), 'production').edges.map(edge => [edge.consumer, edge.provider]));
    expect(partial(production.summary.runtime).coverage.unattributedAccesses).toBe(1);
    expect(partial(production.summary.typeOnly).coverage.unattributedAccesses).toBe(1);
  });

  it('applies incomplete source export descriptions and unlocated limits', () => {
    const incomplete: FixtureSpec = { ...graphSpec, files: graphSpec.files.map(file => file.path === paths.helper
      ? { ...file, state: 'incomplete' as const, issueIds: ['issue-h'] } : file) };
    const production = view(projected(buildReport(incomplete)), 'production');
    expect(partial(owner(production, 'app/core').exact.all).coverage.limitIds).toEqual(['issue-h']);
    expect(owner(production, 'app/ui').exact.all.state).toBe('measured');
    // An incomplete resource description alone does not limit a metric.
    expect(owner(production, 'app/ui').context.exact.state).toBe('measured');

    const global = projected(buildReport({ ...graphSpec, coverage: ['limit-g'], coverageAt: { 'limit-g': 'package.json' } }));
    const all: Metric<unknown>[] = global.views.flatMap((item): Metric<unknown>[] => [item.summary.all, item.cycles,
      ...item.owners.flatMap((entry): Metric<unknown>[] => [entry.exact.all, entry.interfaceUse, entry.context.subtree])]);
    for (const metric of all) expect(partial(metric).coverage.limitIds).toEqual(['limit-g']);
    expect(owner(view(global, 'test'), 'app/core').connectedness.state).toBe('unavailable');
  });
});

describe('modularity projection: availability and determinism', () => {
  it('refuses incomplete analyses and oversized reports', () => {
    const report = buildReport(graphSpec);
    for (const incomplete of [
      { ...report, outcome: { ...report.outcome, execution: 'invalid' as const } },
      { ...report, inputId: null },
      { ...report, registry: null },
      { ...report, snapshot: null },
      { ...report, snapshot: { ...report.snapshot!, catalog: null } },
      { ...report, snapshot: { ...report.snapshot!, model: null } },
    ]) {
      expect(projectModularity({ revision: 'r', report: incomplete, limits })).toMatchObject({ status: 'unavailable', reason: 'analysis-incomplete' });
    }
    expect(projectModularity({ revision: 'r', report: { ...report, snapshot: { ...report.snapshot!, inputs: [] } }, limits }))
      .toMatchObject({ status: 'unavailable', reason: 'analysis-incomplete', message: expect.stringContaining('description input') });
    const failedCheck = projectModularity({ revision: 'r', report: { ...report, outcome: { ...report.outcome, check: 'failed' } }, limits });
    expect(failedCheck.status === 'projected' && failedCheck.report.provenance.check).toBe('failed');
    expect(projectModularity({ revision: 'r', report, limits: { ...limits, maxReportBytes: 100 } }))
      .toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
  });

  it('produces byte-identical JSON independent of input order and run identity', () => {
    // Declared nested trees are the omitted scopes; a module scratch directory is not one.
    const spec: FixtureSpec = { ...graphSpec, exclusions: [{ kind: 'external', directory: 'examples/app', owner: null },
      { kind: 'owned-nested-project', directory: 'site', owner: 'app' }, { kind: 'scratch', directory: 'src/tmp', owner: 'app' }],
      behavior: { facts: [{ consumer: paths.main, file: paths.model, binding: 'makeModel', classification: 'behavioral' }] } };
    const forward = buildReport(spec);
    const reversed = buildReport({ ...spec, modules: [...spec.modules].reverse(), files: [...spec.files].reverse(),
      originals: [...spec.originals].reverse(), exposures: [...spec.exposures].reverse(), accesses: [...spec.accesses].reverse() });
    const first = JSON.stringify(projected(forward));
    expect(JSON.stringify(projected({ ...reversed, runId: 'another' }))).toBe(first);
    expect(JSON.stringify(projected(forward))).toBe(first);
    expect(JSON.parse(first).provenance.omittedScopes).toEqual(['examples/app', 'site']);
  });
});
