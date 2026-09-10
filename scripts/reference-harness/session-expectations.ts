import { analyzeProject } from '../../subs/analysis/src/index.js';
import type { AnalysisInputs, AnalysisReport } from '../../subs/analysis/src/index.js';
import { validationInputs } from './linking-expectations.js';
import type { Assertions } from './runner.js';
import { analysisEvidence, recordObservation } from './observations.js';

export function sessionInputs(root: string): AnalysisInputs {
  return { ...validationInputs(root), capabilities: ['registry', 'layout', 'metadata', 'descriptions',
    'source-catalog', 'exposure-linking', 'static-access', 'tags-origin', 'namespace-access',
    'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] };
}
export async function sessionReport(root: string): Promise<AnalysisReport> {
  const run = await analyzeProject(sessionInputs(root));
  if (run.status !== 'reported') throw new Error(`Unexpected cancelled analysis of ${root}`);
  recordObservation('analysis', analysisEvidence(run.report));
  return run.report;
}
export function completed(report: AnalysisReport, assertions: Assertions, coverage: 'complete' | 'partial' = 'complete', check: 'passed' | 'failed' = 'passed'): void {
  assertions.equal('public schema version', report.schemaVersion, 'ramify.analysis/1');
  assertions.equal('independent execution, permission and coverage outcomes', report.outcome, { execution: 'completed', check, coverage });
  assertions.ok('all required stages completed', report.stages.length === 8 && report.stages.every(stage => stage.status === 'completed'));
  assertions.ok('all requested capabilities executed', report.capabilities.filter(item => item.requested).every(item => item.available && item.executed));
  assertions.ok('sealed input identity and fresh batch UUID', report.inputId?.startsWith('input/1:')
    && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(report.runId));
  assertions.ok('completed report has its inventory and source snapshot', report.snapshot?.catalog && report.snapshot.linked && report.snapshot.model);
  assertions.equal('summary describes retained diagnostic and coverage evidence',
    [report.summary.complete, report.summary.errors, report.summary.warnings, report.summary.coverageNotes],
    [true, report.diagnostics.length, report.warnings.length, report.coverage.length]);
}
export function clean(report: AnalysisReport, assertions: Assertions): void {
  completed(report, assertions);
  assertions.equal('baseline source diagnostics and coverage', [report.diagnostics, report.coverage], [[], []]);
  assertions.ok('baseline has real allowed application decisions', report.summary.allowed > 0);
  assertions.equal('baseline denial count', report.summary.denied, 0);
}

/** Traverse all own descriptors, including non-enumerable and symbol keys.
 * A JSON-only check could hide a retained compiler/session reference. */
export function inspectPlainReport(value: unknown): { objects: number; bytes: number } {
  const seen = new Set<object>();
  function visit(item: unknown): void {
    if (item === null || typeof item !== 'object') {
      if (!['string', 'number', 'boolean'].includes(typeof item) && item !== null) throw new Error(`Non-JSON report member: ${typeof item}`);
      return;
    }
    if (seen.has(item)) return;
    seen.add(item);
    if (![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error('Report retains a non-plain object prototype');
    if (!Object.isFrozen(item)) throw new Error('Report retains a mutable object');
    for (const key of Reflect.ownKeys(item)) {
      if (typeof key !== 'string') throw new Error('Report retains a symbol property');
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!('value' in descriptor)) throw new Error('Report retains an accessor');
      if (!descriptor.enumerable && !(Array.isArray(item) && key === 'length')) throw new Error('Report retains a hidden property');
      visit(descriptor.value);
    }
  }
  visit(value);
  return { objects: seen.size, bytes: Buffer.byteLength(JSON.stringify(value)) };
}
