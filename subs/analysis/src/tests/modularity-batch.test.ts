import { describe, expect, it } from 'vitest';
import { analyzeProject, projectModularity } from '../index.js';
import type { AnalysisReport, Capability, Metric, ModularityReport, SessionInputs } from '../index.js';
import { fixture, paths, timeout } from './session-test-fixture.js';

const behaviorFiles = {
  [paths.description]: 'ramify 1\nmodule branch\nexpose-src value, compute from "provider.ts" to parent\nexpose-src value from "provider.ts" to descendants\n',
  [paths.rootMain]: "import { value, compute } from '../subs/branch/src/provider.js';\nvoid value;\ncompute();\n",
};

async function batch(inputs: SessionInputs, capabilities: readonly Capability[]): Promise<AnalysisReport> {
  const { session: _session, ...request } = inputs;
  const run = await analyzeProject({ ...request, capabilities });
  if (run.status !== 'reported') throw new Error('Expected a batch report');
  return run.report;
}
function project(report: AnalysisReport): ModularityReport {
  const outcome = projectModularity({ revision: `batch:${report.inputId}`, report,
    limits: { maxBoundaryChanges: 1000, maxReportBytes: 16 * 1024 * 1024 } });
  if (outcome.status !== 'projected') throw new Error(`Expected a projection: ${JSON.stringify(outcome)}`);
  return outcome.report;
}
function measured<T>(metric: Metric<T>): T {
  if (metric.state !== 'measured') throw new Error(`Expected a measured metric: ${JSON.stringify(metric)}`);
  return metric.value;
}

describe('modularity projection of a real batch analysis', () => {
  it('projects source structure and opt-in behavior from one completed report', () => fixture(async (_root, inputs) => {
    const capabilities: Capability[] = [...inputs.capabilities, 'dependency-behavior'];
    const report = await batch(inputs, capabilities);
    expect(report.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
    const modularity = project(report);
    expect(modularity.provenance).toMatchObject({ revision: `batch:${report.inputId}`, inputId: report.inputId,
      capabilities: ['coverage', 'dependency-behavior', 'static-access'], ownership: 'declared' });
    expect(modularity.coverage.state).toBe('complete');

    // Each named import specifier is its own access occurrence.
    const [production, test] = modularity.views;
    expect(production!.filter).toBe('production');
    expect(measured(production!.summary.all)).toEqual({ owners: 4, sourceFiles: 6, applicationOccurrences: 5,
      sameOwnerOccurrences: 0, crossOwnerOccurrences: 5, edges: 4, externalOccurrences: 0, outsideModuleOccurrences: 0,
      unresolvedOccurrences: 0, exactLocality: { numerator: 0, denominator: 5, value: 0 } });
    expect(production!.edges.map(edge => [edge.consumer, edge.provider, edge.relation, measured(edge.breadth.runtime).occurrences]))
      .toEqual([
        ['fixture', 'fixture/branch', 'child', 2],
        ['fixture/branch', 'fixture', 'parent', 1],
        ['fixture/branch/leaf', 'fixture/branch', 'parent', 1],
        ['fixture/sibling', 'fixture', 'parent', 1],
      ]);
    expect(measured(production!.cycles).map(component => [component.kind, component.members])).toEqual([
      ['runtime', ['fixture', 'fixture/branch']],
    ]);
    expect(production!.owners.map(owner => [owner.owner, measured(owner.behavior)])).toEqual([
      ['fixture', { behavioralDependencies: 1, nonBehavioralDependencies: 1 }],
      ['fixture/branch', { behavioralDependencies: 0, nonBehavioralDependencies: 1 }],
      ['fixture/branch/leaf', { behavioralDependencies: 0, nonBehavioralDependencies: 1 }],
      ['fixture/sibling', { behavioralDependencies: 0, nonBehavioralDependencies: 1 }],
    ]);
    expect(measured(production!.behavior)).toEqual({ behavioralDependencies: 1, nonBehavioralDependencies: 4 });
    const anyRow = (id: string) => measured(production!.owners.find(owner => owner.owner === id)!.interfaceUse).rows.at(-1);
    expect(anyRow('fixture')).toMatchObject({ exposedOriginals: 2, selectedOriginals: 1 });
    expect(anyRow('fixture/branch')).toMatchObject({ exposedOriginals: 2, selectedOriginals: 2 });
    expect(measured(production!.owners.find(owner => owner.owner === 'fixture/branch')!.subtree.all).locality)
      .toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(test!.owners).toEqual([]);

    // Identical reports project to identical JSON; an analysis without the request leaves behavior unavailable.
    expect(JSON.stringify(project({ ...report, runId: 'other' }))).toBe(JSON.stringify(modularity));
    const ordinary = project(await batch(inputs, inputs.capabilities));
    expect(ordinary.views[0]!.behavior).toEqual({ state: 'unavailable', reason: 'not-requested' });
    expect(ordinary.views[0]!.edges).toEqual(production!.edges);
  }, behaviorFiles), timeout);
});
