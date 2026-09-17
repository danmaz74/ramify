import { describe, expect, it, vi } from 'vitest';
import { analyzeProject } from '../index.js';
import type { AnalysisReport, Capability, SessionInputs } from '../index.js';
import { openSessionEngine } from '../session-engine.js';
import { fixture, paths, replace, revised, timeout } from './session-test-fixture.js';

/**
 * The classifier's `behaviorRuns` counter wherever it can run: every batch compiler helper
 * reports its own count with each result, and an in-process path would load the classifier
 * module in this test process. `adapter` counts requests that reached the batch operation.
 */
const entries = vi.hoisted(() => ({ adapter: 0, fail: false, lifetimes: [] as { behaviorRuns(): number }[],
  inProcess: undefined as (() => number) | undefined }));
vi.mock('../../subs/typescript/src/source-analysis.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../subs/typescript/src/source-analysis.js')>();
  return { ...actual, createSourceAnalysis: async (...args: Parameters<typeof actual.createSourceAnalysis>) => {
    const source = await actual.createSourceAnalysis(...args);
    entries.lifetimes.push(source);
    return { ...source, dependencyBehavior: (signal?: AbortSignal) => {
      entries.adapter++;
      return entries.fail ? Promise.reject(Object.assign(new Error('injected helper failure'), { code: 'read-failure' })) : source.dependencyBehavior(signal);
    } };
  } };
});
vi.mock('../../subs/typescript/src/behavior-classifier.js', async importOriginal => {
  const actual = await importOriginal<{ behaviorRuns(): number }>();
  entries.inProcess = actual.behaviorRuns;
  return actual;
});
/** Classifier runs across every helper lifetime and this process. */
const behaviorRuns = (): number => entries.lifetimes.reduce((total, source) => total + source.behaviorRuns(), 0) + (entries.inProcess?.() ?? 0);
const reset = (): void => { Object.assign(entries, { adapter: 0, fail: false, lifetimes: [] }); };

const behaviorFiles = {
  [paths.description]: 'ramify 1\nmodule branch\nexpose-src value, compute from "provider.ts" to parent\nexpose-src value from "provider.ts" to descendants\n',
  [paths.rootMain]: "import { value, compute } from '../subs/branch/src/provider.js';\nvoid value;\ncompute();\n",
};
const priorCapabilities = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking', 'static-access',
  'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage', 'browser-verification'];

function batchInputs(inputs: SessionInputs, capabilities: readonly Capability[]) {
  const { session: _session, ...request } = inputs;
  return { ...request, capabilities };
}
async function batch(inputs: SessionInputs, capabilities: readonly Capability[]): Promise<AnalysisReport> {
  const run = await analyzeProject(batchInputs(inputs, capabilities));
  if (run.status !== 'reported') throw new Error('Expected a batch report');
  return run.report;
}
/** The report with every requested-capability difference removed. */
function withoutBehavior(report: AnalysisReport): unknown {
  const { dependencyBehavior: _facts, ...snapshot } = report.snapshot!;
  return JSON.parse(JSON.stringify({ ...report, runId: 'compared', request: { ...report.request, capabilities: [] },
    capabilities: report.capabilities.filter(item => item.capability !== 'dependency-behavior'), snapshot }));
}

describe('opt-in dependency-behavior capability', () => {
  it('attaches facts only to an explicitly requesting batch analysis without changing its findings', () => fixture(async (_root, inputs) => {
    reset();
    const ordinary = await batch(inputs, inputs.capabilities);
    expect(entries.adapter).toBe(0);
    // The ordinary batch's helper reported results, all with zero classifier runs.
    expect(entries.lifetimes.length).toBeGreaterThan(0);
    expect(behaviorRuns()).toBe(0);
    const serialized = JSON.stringify(ordinary);
    expect(serialized).not.toContain('dependency-behavior');
    expect(serialized).not.toContain('dependencyBehavior');
    expect(Object.keys(ordinary.snapshot!)).toEqual(['inventory', 'areas', 'inputs', 'catalog', 'linked', 'model', 'accesses', 'results']);
    expect(ordinary.capabilities.map(item => item.capability)).toEqual(priorCapabilities);

    const requested = await batch(inputs, [...inputs.capabilities, 'dependency-behavior']);
    expect(entries.adapter).toBe(1);
    expect(behaviorRuns()).toBe(1);
    expect(requested.capabilities.at(-1)).toEqual({ capability: 'dependency-behavior', available: true, requested: true, executed: true });
    expect(requested.outcome).toEqual(ordinary.outcome);
    expect(withoutBehavior(requested)).toEqual(withoutBehavior(ordinary));
    const facts = requested.snapshot!.dependencyBehavior!;
    expect(facts.status).toBe('completed');
    expect(facts.facts.filter(fact => fact.consumer.file === paths.rootMain)
      .map(fact => [fact.original.owner, fact.original.binding, fact.classification, fact.evidence])).toEqual([
      ['fixture/branch', 'compute', 'behavioral', ['call']],
      ['fixture/branch', 'value', 'non-behavioral', ['data']],
    ]);
    expect(facts.facts.every(fact => fact.accesses.map(item => item.accessId).join() === fact.accessIds.join())).toBe(true);
    expect(Object.isFrozen(facts.facts[0])).toBe(true);

    entries.fail = true;
    const failed = await batch(inputs, [...inputs.capabilities, 'dependency-behavior']);
    entries.fail = false;
    expect(behaviorRuns()).toBe(1);
    expect(failed.capabilities.at(-1)).toMatchObject({ capability: 'dependency-behavior', executed: true });
    expect(failed.snapshot!.dependencyBehavior).toEqual({ status: 'failed', facts: [], limits: [expect.objectContaining({
      id: expect.stringMatching(/^behavior-limit\/1:[0-9a-f]{64}$/), code: 'compiler-failure', location: null })] });
    expect(withoutBehavior(failed)).toEqual(withoutBehavior(ordinary));
  }, behaviorFiles), timeout);

  it('never enters the classifier in retained sessions or changed-file updates, which reject the capability', () => fixture(async (root, inputs) => {
    reset();
    const refused = await openSessionEngine({ ...inputs, capabilities: [...inputs.capabilities, 'dependency-behavior'] });
    expect(refused.status).toBe('reported');
    if (refused.status !== 'reported') throw new Error('Expected a refused open');
    expect(refused.report.diagnostics.map(item => item.code)).toEqual(['unavailable-capability']);
    expect(refused.report.outcome).toEqual({ execution: 'unavailable', check: 'not-run', coverage: 'not-run' });
    expect(refused.report.capabilities.at(-1)).toEqual({ capability: 'dependency-behavior', available: false, requested: true, executed: false });

    const open = await openSessionEngine(inputs);
    if (open.status !== 'opened') throw new Error(`Expected an open session: ${JSON.stringify(open)}`);
    const handle = open.session;
    try {
      const current = handle.current;
      const invocation = { project: inputs.project, capabilities: [...inputs.capabilities, 'dependency-behavior'] as Capability[] };
      const rejected = await handle.update([{ path: paths.rootMain, kind: 'changed' }], {}, invocation);
      expect(rejected.status).toBe('reported');
      if (rejected.status !== 'reported') throw new Error('Expected a rejected update');
      expect(rejected.report.diagnostics.map(item => item.code)).toEqual(['unavailable-capability']);
      expect(handle.current).toBe(current);

      await replace(root, paths.rootMain, 'compute();', 'compute();\ncompute();');
      const revision = await revised(handle, [paths.rootMain]);
      expect(revision.outcome.execution).toBe('completed');
      const published = await handle.report();
      expect(JSON.stringify(published)).not.toMatch(/dependency-behavior|dependencyBehavior/);
      expect(published!.capabilities.map(item => item.capability)).toEqual(priorCapabilities);
      expect(published!.request.capabilities).toEqual(inputs.capabilities);
    } finally { await handle.dispose(); }
    expect(entries.adapter).toBe(0);
    expect(behaviorRuns()).toBe(0);
    // The retained adapter keeps its compiler in this process: it starts no batch helper and never loads the classifier.
    expect(entries.lifetimes).toEqual([]);
    expect(entries.inProcess).toBeUndefined();
  }, behaviorFiles), timeout);
});
