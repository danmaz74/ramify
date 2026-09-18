import { describe, expect, it } from 'vitest';
import { analyzeDependencyDiagram, analyzeProject, projectDependencyDiagram, projectTestReferences } from '../index.js';
import type { AnalysisReport, Capability, DependencyAnalyzerOutcome, OriginalId, TestReferenceFacts } from '../index.js';
import { architectPaths, architectProject } from './architect-fixture.js';
import { buildReport, dependencyReportSpec, diagramPaths, type FixtureSpec } from './modularity-fixture.js';

const limits = { maxResultBytes: 16 * 1024 ** 2 };
const project = (report: AnalysisReport, maxResultBytes = limits.maxResultBytes) =>
  projectTestReferences({ revision: 'batch:input-1', report, limits: { maxResultBytes } });
function references(report: AnalysisReport): TestReferenceFacts {
  const outcome = project(report);
  if (outcome.status !== 'projected') throw new Error(`Expected projected references: ${JSON.stringify(outcome)}`);
  return outcome.references;
}
const code = (owner: string, file: string, binding: string): OriginalId => ({ kind: 'code', owner, file, binding });

/**
 * `test-references`: `app` owns production `main.ts` and the test `main.test.ts`; `app/core` owns
 * `core.ts` and two tests; `app/tools` is a testing module whose ordinary `probe.ts` is test source.
 *
 * - `main.test.ts` calls `act` and `zed` of `core`, calls its own module's `local`, names `Shape` as a
 *   type, reads `loose` without settling it and imports `settings` unused.
 * - `core.test.ts` calls its own module's `act`; `types.test.ts` names `Shape` only.
 * - `probe.ts` calls `zed`, and has two facts for `act`, non-behavioral and unknown.
 * - Production `main.ts` calls `act`.
 */
const t = {
  main: 'src/main.ts', mainTest: 'src/tests/main.test.ts', core: 'subs/core/src/core.ts',
  coreTest: 'subs/core/src/tests/core.test.ts', typesTest: 'subs/core/src/tests/types.test.ts', probe: 'subs/tools/src/probe.ts',
} as const;
const spec: FixtureSpec = {
  modules: [{ id: 'app' }, { id: 'app/core' }, { id: 'app/tools', testing: true }],
  files: [{ path: t.main, owner: 'app' }, { path: t.mainTest, owner: 'app', area: 'tests' }, { path: t.core, owner: 'app/core' },
    { path: t.coreTest, owner: 'app/core', area: 'tests' }, { path: t.typesTest, owner: 'app/core', area: 'tests' },
    { path: t.probe, owner: 'app/tools' }],
  originals: [{ file: t.core, binding: 'act' }, { file: t.core, binding: 'Shape', value: false }, { file: t.core, binding: 'loose' },
    { file: t.core, binding: 'settings' }, { file: t.core, binding: 'zed' }, { file: t.main, binding: 'local' }],
  exposures: [],
  accesses: [
    { id: 'm1', importer: t.main, target: t.core, selections: [{ file: t.core, binding: 'act' }] },
    { id: 't1', importer: t.mainTest, target: t.core, selections: ['zed', 'act', 'Shape', 'loose', 'settings'].map(binding => ({ file: t.core, binding })) },
    { id: 't2', importer: t.mainTest, target: t.main, selections: [{ file: t.main, binding: 'local' }] },
    { id: 'c1', importer: t.coreTest, target: t.core, selections: [{ file: t.core, binding: 'act' }] },
    { id: 'c2', importer: t.typesTest, target: t.core, runtime: false, selections: [{ file: t.core, binding: 'Shape' }] },
    { id: 'p1', importer: t.probe, target: t.core, selections: [{ file: t.core, binding: 'zed' }, { file: t.core, binding: 'act' }] },
  ],
  behavior: { facts: [
    { consumer: t.main, file: t.core, binding: 'act', classification: 'behavioral' },
    { consumer: t.mainTest, file: t.core, binding: 'zed', classification: 'behavioral' },
    { consumer: t.mainTest, file: t.core, binding: 'act', classification: 'behavioral' },
    { consumer: t.mainTest, file: t.core, binding: 'Shape', classification: 'non-behavioral' },
    { consumer: t.mainTest, file: t.core, binding: 'loose', classification: 'unknown', limitIds: ['behavior-limit/l'] },
    { consumer: t.mainTest, file: t.core, binding: 'settings', classification: 'unused' },
    { consumer: t.mainTest, file: t.main, binding: 'local', classification: 'behavioral' },
    { consumer: t.coreTest, file: t.core, binding: 'act', classification: 'behavioral' },
    { consumer: t.typesTest, file: t.core, binding: 'Shape', classification: 'non-behavioral' },
    { consumer: t.probe, file: t.core, binding: 'zed', classification: 'behavioral' },
    { consumer: t.probe, file: t.core, binding: 'act', classification: 'non-behavioral' },
    { consumer: t.probe, file: t.core, binding: 'act', classification: 'unknown', limitIds: ['behavior-limit/p'] },
  ], limits: ['behavior-limit/l', 'behavior-limit/p'] },
};

describe('projectTestReferences: per-file projection of the behavior facts', () => {
  it('lists behavioral originals per test file, same-owner included, and counts unknown pairs (AV38)', () => {
    const projected = references(buildReport(spec));
    expect(projected).toEqual({ inputId: 'input-1', files: [
      // Ordered by owner, file, binding and kind; the type, the unknown and the unused pairs are not listed.
      { file: t.mainTest, exercises: [code('app', 'main.ts', 'local'), code('app/core', 'core.ts', 'act'), code('app/core', 'core.ts', 'zed')],
        unclassified: 1 },
      { file: t.coreTest, exercises: [code('app/core', 'core.ts', 'act')], unclassified: 0 },
      // The testing module's ordinary source; its two `act` facts form one unknown pair.
      { file: t.probe, exercises: [code('app/core', 'core.ts', 'zed')], unclassified: 1 },
    ] });
    // A file with only a type reference and the production file appear in no entry.
    expect(projected.files.map(entry => entry.file)).not.toContain(t.typesTest);
    expect(projected.files.map(entry => entry.file)).not.toContain(t.main);
    expect(Object.isFrozen(projected.files[0]!.exercises[0])).toBe(true);
    expect(JSON.parse(JSON.stringify(projected))).toEqual(projected);
    // The dependency-report fixture's test file calls `act` through B.
    expect(references(buildReport(dependencyReportSpec))).toEqual({ inputId: 'input-1',
      files: [{ file: diagramPaths.test, exercises: [code('a/core', 'act.ts', 'act')], unclassified: 0 }] });
  });

  it('keeps the stronger class of a repeated pair: behavioral, then unknown, then non-behavioral', () => {
    const repeated = (classifications: readonly ('behavioral' | 'unknown' | 'non-behavioral' | 'unused')[]) => references(buildReport({ ...spec,
      behavior: { facts: classifications.map(classification => ({ consumer: t.coreTest, file: t.core, binding: 'act', classification,
        ...classification === 'unknown' ? { limitIds: ['behavior-limit/x'] } : {} })), limits: ['behavior-limit/x'] } })).files;
    const act = [code('app/core', 'core.ts', 'act')];
    for (const order of [['behavioral', 'unknown', 'non-behavioral'], ['non-behavioral', 'behavioral', 'unused']] as const) {
      expect(repeated(order), order.join()).toEqual([{ file: t.coreTest, exercises: act, unclassified: 0 }]);
    }
    for (const order of [['unknown', 'non-behavioral'], ['unused', 'unknown', 'non-behavioral']] as const) {
      expect(repeated(order), order.join()).toEqual([{ file: t.coreTest, exercises: [], unclassified: 1 }]);
    }
    expect(repeated(['non-behavioral', 'unused'])).toEqual([]);
  });

  it('refuses an incomplete analysis, missing or failed behavior facts and oversized references', () => {
    const report = buildReport(spec);
    for (const execution of ['invalid', 'incomplete', 'unavailable'] as const) {
      expect(project({ ...report, outcome: { ...report.outcome, execution } })).toEqual({ status: 'refused', reason: 'analysis-incomplete' });
    }
    expect(project(buildReport({ ...spec, behavior: undefined }))).toEqual({ status: 'refused', reason: 'not-requested' });
    expect(project(buildReport({ ...spec, behavior: 'missing' }))).toEqual({ status: 'refused', reason: 'capability-failed' });
    expect(project(buildReport({ ...spec, behavior: { status: 'failed', facts: [], limits: ['behavior-limit/f'] } })))
      .toEqual({ status: 'refused', reason: 'capability-failed' });
    const bytes = Buffer.byteLength(JSON.stringify(references(report)), 'utf8');
    expect(project(report, bytes - 1)).toEqual({ status: 'refused', reason: 'resource-limit', observedBytes: bytes, maximumBytes: bytes - 1 });
    expect(project(report, bytes).status).toBe('projected');
    // Each projection measures its own JSON: at this bound the larger diagram of the same report is refused.
    expect(projectDependencyDiagram({ revision: 'batch:input-1', report, limits: { maxResultBytes: bytes } }))
      .toMatchObject({ status: 'refused', reason: 'resource-limit', maximumBytes: bytes });
  });
});

const timeout = 120_000;
const checkCapabilities: readonly Capability[] = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
  'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'];

describe('projectTestReferences: the architect fixture through the dependency analyzer (AV38)', () => {
  it('carries the references of the same report in the ready outcome, beside an unchanged diagram', () => architectProject(async (_root, inputs) => {
    const batch = async (capabilities: readonly Capability[]) => {
      const run = await analyzeProject({ project: inputs.project, registry: inputs.registry, capabilities, limits: inputs.limits });
      if (run.status !== 'reported' || run.report.outcome.execution !== 'completed') throw new Error('Expected a completed report');
      return run.report;
    };
    const requested = await batch([...checkCapabilities, 'dependency-behavior']);
    const ordinary = await batch(checkCapabilities);
    const outcome: DependencyAnalyzerOutcome = await analyzeDependencyDiagram({ project: inputs.project, report: ordinary,
      limits: { source: inputs.limits.source, maxResultBytes: limits.maxResultBytes, deadlineMs: timeout } });
    if (outcome.status !== 'ready') throw new Error(`Expected a ready outcome: ${JSON.stringify(outcome)}`);
    const expected = references(requested);
    expect(outcome.testReferences).toEqual(expected);
    expect(JSON.stringify(outcome.testReferences)).toBe(JSON.stringify(expected));
    expect(outcome.testReferences!.inputId).toBe(outcome.diagram.inputId);
    const diagram = projectDependencyDiagram({ revision: requested.inputId!, report: requested, limits });
    expect(diagram.status === 'projected' && JSON.stringify(diagram.diagram)).toBe(JSON.stringify(outcome.diagram));

    const p = architectPaths;
    expect(expected.files).toEqual([
      // Constructs `Engine` and names its type: listed once. Reads `loose`, whose use stays unknown: counted.
      { file: p.checks, exercises: [code('fixture/core', 'core.ts', 'run'), code('fixture/core/engine', 'engine.ts', 'Engine')], unclassified: 1 },
      { file: p.checksSupport, exercises: [code('fixture/core/engine', 'engine.ts', 'Engine')], unclassified: 0 },
      // Same-owner originals, internal `helper` included.
      { file: p.coreTest, exercises: [code('fixture/core', 'core.ts', 'helper'), code('fixture/core', 'core.ts', 'run')], unclassified: 0 },
    ]);
    const facts = requested.snapshot!.dependencyBehavior!.facts;
    const of = (file: string) => facts.filter(fact => fact.consumer.file === file).map(fact => [fact.original.binding, fact.classification, fact.evidence]);
    expect(of(p.checks)).toContainEqual(['Engine', 'behavioral', ['construction', 'type']]);
    expect(of(p.checks)).toContainEqual(['loose', 'unknown', []]);
    // The type-only test has facts, all non-behavioral, and no entry.
    expect(of(p.engineTest)).toEqual([['Engine', 'non-behavioral', ['type']], ['EngineOptions', 'non-behavioral', ['type']]]);
    // Production files, the test-named ordinary file among them, have behavioral facts and no entry.
    expect(of(p.alphaTest)).toEqual([['build', 'behavioral', ['call']]]);
    const testing = new Set(facts.filter(fact => fact.consumer.area.profile.includes('testing')).map(fact => fact.consumer.file));
    expect([...testing].sort()).toEqual([p.checks, p.checksSupport, p.coreTest, p.engineTest]);
    for (const entry of expected.files) expect(testing.has(entry.file)).toBe(true);
    // The test files add no boundary: the diagram's consumers are production files only.
    expect(outcome.diagram.boundaries.flatMap(fact => fact.consumerFiles).filter(file => testing.has(file))).toEqual([]);
  }), timeout);
});
