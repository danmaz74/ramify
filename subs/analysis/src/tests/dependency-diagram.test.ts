import { describe, expect, it } from 'vitest';
import { projectDependencyDiagram, projectModularity } from '../index.js';
import type {
  AnalysisReport,
  CandidateOwnership,
  DependencyBoundaryFact,
  DependencyDiagramFacts,
  Metric,
  ModularityReport,
  OwnershipModule,
} from '../index.js';
import { buildReport, dependencyReportSpec, diagramPaths as p, type FixtureSpec } from './modularity-fixture.js';

const limits = { maxResultBytes: 16 * 1024 * 1024 };
const report = buildReport(dependencyReportSpec);

function diagramOf(input: AnalysisReport, ownership?: CandidateOwnership): DependencyDiagramFacts {
  const outcome = projectDependencyDiagram({ revision: 'batch:input-1', report: input, ownership, limits });
  if (outcome.status !== 'projected') throw new Error(`Expected a projection: ${JSON.stringify(outcome)}`);
  return outcome.diagram;
}
function modularity(input: AnalysisReport, ownership?: CandidateOwnership): ModularityReport {
  const outcome = projectModularity({ revision: 'batch:input-1', report: input, ownership,
    limits: { maxBoundaryChanges: 100, maxReportBytes: 16 * 1024 * 1024 } });
  if (outcome.status !== 'projected') throw new Error(`Expected a projection: ${JSON.stringify(outcome)}`);
  return outcome.report;
}
const valueOf = <T>(metric: Metric<T>): T => {
  if (metric.state === 'unavailable') throw new Error(`Expected a value: ${JSON.stringify(metric)}`);
  return metric.state === 'measured' ? metric.value : metric.observed;
};
/** `consumer>imported:binding` with classification and status. */
const row = (fact: DependencyBoundaryFact): string =>
  `${fact.consumer}>${fact.importedModule}:${fact.original.binding} ${fact.classification} ${fact.status}`;
const find = (diagram: DependencyDiagramFacts, consumer: string, imported: string, binding: string) =>
  diagram.boundaries.find(fact => fact.consumer === consumer && fact.importedModule === imported && fact.original.binding === binding);
/** The original-owner aggregation of the plan: regroup by (consumer, original) with the fixed precedence. */
function originalOwnerUnits(diagram: DependencyDiagramFacts): Map<string, string> {
  const order = ['behavioral', 'unknown', 'non-behavioral'];
  const units = new Map<string, string>();
  for (const fact of diagram.boundaries) {
    const key = `${fact.consumer}>${fact.originalOwner}:${fact.original.binding}`;
    const current = units.get(key);
    if (current === undefined || order.indexOf(fact.classification) < order.indexOf(current)) units.set(key, fact.classification);
  }
  return units;
}
const module = (id: string, headerTags: readonly string[] = []): OwnershipModule => ({
  id, name: id.split('/').at(-1)!, parent: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : null, headerTags });

describe('dependency diagram facts: dependency-report', () => {
  const diagram = diagramOf(report);

  it('BD07: keeps one boundary per imported module and one headline dependency per consumer and original', () => {
    expect(diagram.boundaries.map(row)).toEqual([
      'a>a:helper behavioral allowed',
      'a>a/b:Config non-behavioral allowed',
      'a>a/b:Shape non-behavioral allowed',
      'a>a/b:act behavioral allowed',
      'a>a/b:secret behavioral denied',
      'a>a/c:Config unknown allowed',
      'a>a/c:act non-behavioral allowed',
      'a>a/c:settings non-behavioral limited',
      'a>a/core:helper non-behavioral allowed',
    ]);
    // `act` through B and C: two boundaries, one headline dependency.
    expect(find(diagram, 'a', 'a/b', 'act')).toMatchObject({ originalOwner: 'a/core', consumerFiles: [p.both, p.main, p.mixed],
      importedFiles: [p.b], originalFiles: [p.act], accessIds: ['x01', 'x03', 'x17'], reasons: ['exposed'], limitIds: [] });
    expect(find(diagram, 'a', 'a/c', 'act')).toMatchObject({ consumerFiles: [p.both], importedFiles: [p.c], accessIds: ['x04'] });
    expect(diagram.headline).toEqual({ behavioralDependencies: 3, nonBehavioralDependencies: 2 });
    expect([...originalOwnerUnits(diagram)]).toEqual([
      ['a>a/core:helper', 'behavioral'], ['a>a/core:Config', 'unknown'], ['a>a/core:Shape', 'non-behavioral'],
      ['a>a/core:act', 'behavioral'], ['a>a/core:secret', 'behavioral'], ['a>a/core:settings', 'non-behavioral'],
    ]);
  });

  it('BD08: omits unused paths and controls, and keeps a self-barrel boundary to a foreign original', () => {
    // main imports `act` through C without using it: the C boundary is supported by both.ts only.
    expect(diagram.boundaries.flatMap(fact => fact.accessIds)).not.toContain('x02');
    for (const control of ['x09', 'x10', 'x13', 'x14', 'x15', 'x16', 'x19']) {
      expect(diagram.boundaries.flatMap(fact => fact.accessIds)).not.toContain(control);
    }
    expect(diagram.boundaries.map(fact => fact.original.binding)).not.toContain('unusedThing');
    expect(diagram.boundaries.map(fact => fact.original.binding)).not.toContain('local');
    expect(find(diagram, 'a', 'a', 'helper')).toMatchObject({ originalOwner: 'a/core', importedFiles: [p.barrel], accessIds: ['x11'] });
    expect(find(diagram, 'a', 'a/core', 'helper')).toMatchObject({ consumerFiles: [p.barrel], accessIds: ['x12'] });
    // Only-B-used, from a report with no other path to C.
    const onlyB = diagramOf(buildReport({ ...dependencyReportSpec, behavior: { facts: [
      { consumer: p.main, file: p.act, binding: 'act', classification: 'behavioral', accesses: [{ id: 'x01' }, { id: 'x02', classification: 'unused' }] },
    ] } }));
    expect(onlyB.boundaries.map(row)).toEqual(['a>a/b:act behavioral allowed']);
  });

  it('BD09: unknown facts make coverage partial without a count, and known lower bounds stay identified', () => {
    expect(find(diagram, 'a', 'a/c', 'Config')).toMatchObject({ classification: 'unknown', accessIds: ['x08'], limitIds: ['behavior-limit/u'] });
    expect(find(diagram, 'a', 'a/b', 'Config')).toMatchObject({ classification: 'non-behavioral', accessIds: ['x07'], limitIds: [] });
    expect(originalOwnerUnits(diagram).get('a>a/core:Config')).toBe('unknown');
    expect(diagram.coverage).toEqual({ state: 'partial', unknownDependencies: 1, limitIds: ['behavior-limit/u', 'source-limit/s'] });
    // The unknown unit is in neither headline count.
    expect(diagram.headline.behavioralDependencies + diagram.headline.nonBehavioralDependencies).toBe(originalOwnerUnits(diagram).size - 1);
  });

  it('BD10: resolves every role under the source filter and the ownership in use, omitting consumer-owned originals', () => {
    const declared = modularity(report);
    const test = declared.views.find(view => view.filter === 'test')!;
    expect(valueOf(test.dependencyDiagram).boundaries.map(row)).toEqual(['a>a/b:act behavioral allowed']);
    expect(valueOf(test.dependencyDiagram).boundaries[0]!.consumerFiles).toEqual([p.test]);
    expect(diagram.boundaries.flatMap(fact => fact.consumerFiles)).not.toContain(p.test);

    const tree = declared.modules.map(item => module(item.id, item.headerTags));
    // C merges into B and mixed.ts moves into B.
    const merged: CandidateOwnership = { id: 'merge-c', modules: tree.filter(item => item.id !== 'a/c'),
      files: [{ path: p.c, owner: 'a/b' }, { path: p.mixed, owner: 'a/b' }] };
    const candidate = diagramOf(report, merged);
    expect(candidate.modules).toEqual(['a', 'a/b', 'a/core', 'a/empty', 'a/tools']);
    expect(candidate.boundaries.map(row)).toEqual([
      'a>a:helper behavioral allowed',
      'a>a/b:Config unknown allowed',
      'a>a/b:Shape non-behavioral allowed',
      'a>a/b:act behavioral allowed',
      'a>a/b:settings non-behavioral limited',
      'a>a/core:helper non-behavioral allowed',
      'a/b>a/b:act behavioral allowed',
      'a/b>a/b:secret behavioral denied',
    ]);
    expect(find(candidate, 'a', 'a/b', 'act')).toMatchObject({ consumerFiles: [p.both, p.main], importedFiles: [p.b, p.c],
      accessIds: ['x01', 'x03', 'x04'] });
    expect(candidate.headline).toEqual({ behavioralDependencies: 4, nonBehavioralDependencies: 2 });
    expect(valueOf(modularity(report, merged).views[0]!.dependencyDiagram)).toEqual(candidate);

    // act.ts moves into the consumer: its originals become consumer-owned and leave the diagram.
    const moved = diagramOf(report, { id: 'move-act', modules: tree, files: [{ path: p.act, owner: 'a' }] });
    expect(moved.boundaries.map(row)).toEqual(['a>a:helper behavioral allowed', 'a>a/core:helper non-behavioral allowed']);
    expect(moved.headline).toEqual({ behavioralDependencies: 1, nonBehavioralDependencies: 0 });
    // The declared owner recorded in OriginalId is not candidate ownership.
    expect(moved.boundaries.every(fact => fact.original.owner === 'a/core' && fact.originalOwner !== 'a')).toBe(true);
  });

  it('BD11: takes status and reasons only from the decisions for the fact\'s own original', () => {
    expect(find(diagram, 'a', 'a/b', 'secret')).toMatchObject({ status: 'denied', reasons: ['not-visible'], accessIds: ['x17'] });
    expect(find(diagram, 'a', 'a/b', 'act')).toMatchObject({ status: 'allowed', reasons: ['exposed'] });
    // A source limit on the access makes its outcome `mixed`, so its own facts are limited.
    expect(find(diagram, 'a', 'a/c', 'settings')).toMatchObject({ status: 'limited', reasons: ['exposed'] });
    const onlyMixed = diagramOf(buildReport({ ...dependencyReportSpec, behavior: { facts: [
      { consumer: p.mixed, file: p.act, binding: 'act', classification: 'behavioral' },
      { consumer: p.mixed, file: p.act, binding: 'secret', classification: 'behavioral' },
    ] } }));
    expect(onlyMixed.boundaries.map(row)).toEqual(['a>a/b:act behavioral allowed', 'a>a/b:secret behavioral denied']);
    // Without an access result the status cannot be established.
    const noResults = { ...report, snapshot: { ...report.snapshot!, results: [] } };
    expect(new Set(diagramOf(noResults).boundaries.map(fact => fact.status))).toEqual(new Set(['limited']));
  });

  it('BD12: is deterministic, ordered, frozen, complete in modules and equal to the modularity view', () => {
    expect(diagram.inputId).toBe('input-1');
    expect(diagram.modules).toEqual(['a', 'a/b', 'a/c', 'a/core', 'a/empty', 'a/tools']);
    const frozen = (value: unknown): boolean => value === null || typeof value !== 'object'
      || (Object.isFrozen(value) && Object.values(value).every(frozen));
    expect(frozen(diagram)).toBe(true);
    expect(Object.isFrozen(report.snapshot!.dependencyBehavior!.facts[0]!.original)).toBe(false);

    const reversed: FixtureSpec = { ...dependencyReportSpec, modules: [...dependencyReportSpec.modules].reverse(),
      files: [...dependencyReportSpec.files].reverse(), originals: [...dependencyReportSpec.originals].reverse(),
      accesses: [...dependencyReportSpec.accesses].reverse() };
    const reordered = buildReport(reversed);
    const facts = reordered.snapshot!.dependencyBehavior!;
    const shuffled = { ...reordered, runId: 'another', snapshot: { ...reordered.snapshot!,
      dependencyBehavior: { ...facts, facts: [...facts.facts].reverse() } } };
    expect(JSON.stringify(diagramOf(shuffled))).toBe(JSON.stringify(diagram));

    const projected = modularity(report);
    expect(projected.schemaVersion).toBe('ramify.modularity/3');
    const production = projected.views[0]!;
    expect(production.dependencyDiagram).toEqual({ state: 'partial', observed: diagram,
      coverage: production.behavior.state === 'partial' ? production.behavior.coverage : null });
    expect(valueOf(production.dependencyDiagram).headline).toEqual(valueOf(production.behavior));
    for (const view of projected.views) expect(valueOf(view.dependencyDiagram).headline).toEqual(valueOf(view.behavior));
    expect(JSON.stringify(Object.keys(production))).toBe(JSON.stringify(['filter', 'summary', 'behavior', 'owners', 'edges', 'cycles', 'dependencyDiagram']));

    const bytes = Buffer.byteLength(JSON.stringify(diagram), 'utf8');
    expect(projectDependencyDiagram({ revision: 'r', report, limits: { maxResultBytes: bytes } }).status).toBe('projected');
    expect(projectDependencyDiagram({ revision: 'r', report, limits: { maxResultBytes: bytes - 1 } }))
      .toEqual({ status: 'refused', reason: 'resource-limit', observedBytes: bytes, maximumBytes: bytes - 1 });
  });

  it('BD12: refuses unavailable behavior and incomplete analyses, matching the modularity metric', () => {
    const { behavior: _behavior, ...withoutBehavior } = dependencyReportSpec;
    const notRequested = buildReport(withoutBehavior);
    expect(projectDependencyDiagram({ revision: 'r', report: notRequested, limits })).toEqual({ status: 'refused', reason: 'not-requested' });
    expect(modularity(notRequested).views[0]!.dependencyDiagram).toEqual({ state: 'unavailable', reason: 'not-requested' });
    const missing = buildReport({ ...dependencyReportSpec, behavior: 'missing' });
    expect(projectDependencyDiagram({ revision: 'r', report: missing, limits })).toEqual({ status: 'refused', reason: 'capability-failed' });
    expect(projectDependencyDiagram({ revision: 'r', report: { ...report, snapshot: { ...report.snapshot!, catalog: null } }, limits }))
      .toEqual({ status: 'refused', reason: 'analysis-incomplete' });

    // A failed classification projects no boundary and the behavior metric's partial coverage.
    const failed = diagramOf(buildReport({ ...dependencyReportSpec, behavior: { status: 'failed', facts: [], limits: ['behavior-limit/f'] } }));
    expect(failed.boundaries).toEqual([]);
    expect(failed.headline).toEqual({ behavioralDependencies: 0, nonBehavioralDependencies: 0 });
    expect(failed.coverage.state).toBe('partial');
    expect(failed.coverage.limitIds).toContain('behavior-limit/f');

    // Completed with zero dependencies is a measured zero.
    const empty = modularity(buildReport({ ...dependencyReportSpec, accesses: [], behavior: { facts: [] } }));
    expect(empty.views[0]!.dependencyDiagram).toEqual({ state: 'measured', value: { inputId: 'input-1',
      modules: ['a', 'a/b', 'a/c', 'a/core', 'a/empty', 'a/tools'], headline: { behavioralDependencies: 0, nonBehavioralDependencies: 0 },
      boundaries: [], coverage: { state: 'complete', unknownDependencies: 0, limitIds: [] } } });
  });

  it('asserts headline equality instead of publishing a second answer', () => {
    const facts = report.snapshot!.dependencyBehavior!;
    const inconsistent = { ...report, snapshot: { ...report.snapshot!, dependencyBehavior: { ...facts,
      facts: facts.facts.map(fact => ({ ...fact, accesses: fact.accesses.map(path => ({ ...path, classification: 'unused' as const })) })) } } };
    expect(() => projectDependencyDiagram({ revision: 'r', report: inconsistent, limits })).toThrow(/differ from the behavior metric/);
  });
});
