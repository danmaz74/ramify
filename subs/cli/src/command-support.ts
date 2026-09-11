import type { AnalysisDiagnostic, AnalysisReport } from '../../analysis/src/interfaces/analysis.js';
import type { CliEnvironment, CliExitCode } from './interfaces/cli.js';
import type { Capability } from '../../analysis/src/interfaces/analysis.js';
import { formatHuman, serializeReport } from './format.js';

export const capabilities: readonly Capability[] = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog',
  'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'];
const requiredStages = ['registry', 'acquisition', 'parse', 'catalog', 'link', 'access', 'decide', 'report'];

/** Defend the injected-operation boundary against an unrun or contradictory success. */
function checkedReport(report: AnalysisReport): AnalysisReport {
  if (report.outcome.execution !== 'completed') return report;
  const missing = requiredStages.filter(id => report.stages.filter(stage => stage.stage === id).length !== 1
    || report.stages.find(stage => stage.stage === id)?.status !== 'completed');
  const unavailable = capabilities.filter(id => !report.capabilities.some(item => item.capability === id && item.available && item.executed));
  if (!missing.length && !unavailable.length && report.summary.complete && report.outcome.check !== 'not-run') return report;
  const issue: AnalysisDiagnostic = { id: 'cli:missing-stage', category: 'execution', code: 'missing-stage',
    message: `Check did not complete required work: ${[...missing, ...unavailable, ...(!report.summary.complete || report.outcome.check === 'not-run' ? ['completion evidence'] : [])].join(', ')}`,
    location: null, related: [], importer: null, original: null, accessId: null };
  return { ...report, diagnostics: [...report.diagnostics, issue], outcome: { ...report.outcome, execution: 'incomplete', check: 'not-run' },
    summary: { ...report.summary, complete: false, errors: report.diagnostics.length + 1 } };
}


export function printReport(input: AnalysisReport, mode: string, format: 'human' | 'json', environment: CliEnvironment): CliExitCode {
  const { report, json } = serializeReport(checkedReport(input));
  const failed = report.outcome.execution === 'incomplete' || report.outcome.execution === 'unavailable'
    || report.stages.some(stage => stage.status === 'failed' || stage.status === 'unavailable');
  const code = failed ? 2 : report.outcome.execution === 'invalid' || report.outcome.check === 'failed'
    || report.diagnostics.length || report.summary.denied ? 1 : 0;
  environment.stdout(format === 'json' ? json + '\n' : formatHuman(report, mode));
  return code;
}
