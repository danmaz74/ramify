import { Buffer } from 'node:buffer';
import type { AnalysisDiagnostic, AnalysisReport } from '../../analysis/src/interfaces/analysis.js';
import type { SourceLocation } from '../../analysis/subs/model/src/interfaces/model.js';

const location = (value: SourceLocation): string => `${value.file}:${value.line}:${value.column}`;

/** Measure before writing; a faulty injected provider must still leave a bounded
 * failure report with the already collected findings, rather than no document. */
export function serializeReport(input: AnalysisReport): { report: AnalysisReport; json: string } {
  let report = input, json = JSON.stringify(input);
  const maximum = input.request.limits.maxReportBytes;
  const budget = Math.max(maximum, 64 * 1024);
  const observed = Buffer.byteLength(json);
  if (observed <= maximum || observed <= budget && input.diagnostics.some(issue => issue.code === 'resource-limit')) return { report, json };
  const issue: AnalysisDiagnostic = { id: 'cli:report-limit', category: 'limit', code: 'resource-limit',
    message: `Serialized result exceeds ${maximum} bytes (observed ${observed}); snapshot omitted and collected findings retained as a bounded prefix`,
    location: null, related: [], importer: null, original: null, accessId: null,
    limit: { name: 'maxReportBytes', maximum, observed, collectedPrefix: true } };
  let diagnostics = [...input.diagnostics];
  let warnings = [...input.warnings], coverage = [...input.coverage];
  let scope = input.scope;
  const encode = (): void => {
    report = { ...input, scope, snapshot: null, diagnostics: [...diagnostics, issue], warnings, coverage,
      outcome: { execution: 'incomplete', check: 'not-run', coverage: input.outcome.coverage === 'not-run' ? 'not-run' : 'partial' },
      stages: input.stages.map(stage => stage.stage === 'report' ? { ...stage, status: 'failed', diagnosticIds: [issue.id] } : stage),
      summary: { ...input.summary, complete: false, errors: diagnostics.length + 1, warnings: warnings.length, coverageNotes: coverage.length } };
    json = JSON.stringify(report);
  };
  encode();
  while (Buffer.byteLength(json) > budget) {
    if (coverage.length) coverage = coverage.slice(0, Math.floor(coverage.length / 2));
    else if (warnings.length) warnings = warnings.slice(0, Math.floor(warnings.length / 2));
    else if (diagnostics.length) diagnostics = diagnostics.slice(0, Math.floor(diagnostics.length / 2));
    else if (scope) scope = null;
    else throw new Error('Injected analysis request exceeds the bounded output envelope');
    encode();
  }
  return { report, json };
}

export function formatHuman(report: AnalysisReport): string {
  const lines = report.scope ? [
    `Root: ${report.scope.root} (${report.scope.selection === 'given' ? 'given' : `found from ${report.scope.invokedFrom}`})`,
    `Configuration: ${report.scope.configuration}`,
  ] : [`Root: unavailable (requested ${report.request.project.root ?? `from ${report.request.project.cwd}`})`, 'Configuration: unavailable'];
  for (const issue of report.diagnostics) {
    lines.push(`Error [${issue.code}]${issue.location ? ` ${location(issue.location)}` : ''}: ${issue.message}`);
    if (issue.importer) lines.push(`  Importer: ${issue.importer.owner} (${issue.importer.kind}; tags: ${issue.importer.profile.join(', ') || 'none'})`);
    if (issue.original) lines.push(`  Original: ${issue.original.owner}/${issue.original.file}#${issue.original.binding}`);
    for (const related of issue.related) lines.push(`  Related: ${location(related)}`);
  }
  for (const warning of report.warnings) lines.push(`Warning [${warning.code}] ${warning.entry}: ${warning.count} compiler-selected file${warning.count === 1 ? '' : 's'} outside module source (${warning.files.join(', ')})`);
  for (const limit of report.coverage) lines.push(`Analysis limit [${limit.code}] ${location(limit.location)}: ${limit.message}`);
  lines.push(`Execution: ${report.outcome.execution}; check: ${report.outcome.check}; coverage: ${report.outcome.coverage}`);
  lines.push(`Stages: ${report.stages.map(stage => `${stage.stage}=${stage.status}`).join(', ')}`);
  const requested = report.capabilities.filter(item => item.requested);
  lines.push(`Requested capabilities: ${requested.map(item => `${item.capability}=${!item.available ? 'unavailable' : item.executed ? 'executed' : 'not executed'}`).join(', ') || 'none'}`);
  const { summary } = report;
  lines.push(`${summary.complete ? 'Completed' : 'Incomplete'} scope: ${summary.owners} owners, ${summary.sourceFiles} source files, ${summary.resources} resources, ${summary.accesses} accesses`);
  lines.push(`Findings: ${summary.errors} errors, ${summary.warnings} warnings, ${summary.coverageNotes} analysis limits; ${summary.allowed} allowed, ${summary.denied} denied, ${summary.external} external`);
  if (report.scope) lines.push(`Walked source areas: ${report.scope.walkedAreas.join(', ') || 'none'}`);
  return lines.join('\n') + '\n';
}
