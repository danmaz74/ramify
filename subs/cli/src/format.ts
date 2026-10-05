import { Buffer } from 'node:buffer';
import type { AnalysisDiagnostic, AnalysisReport } from '../../analysis/src/interfaces/analysis.js';
import type { SourceLocation } from '../../analysis/subs/model/src/interfaces/model.js';
import type { ProjectWarning } from '../../analysis/subs/project/src/interfaces/project.js';
import type { CheckDocument } from './interfaces/cli.js';

const location = (value: SourceLocation): string => `${value.file}:${value.line}:${value.column}`;
const oneLine = (text: string): string => text.replace(/[\r\n]+/g, ' ');
/** A warning's listed files, and how many more its count states, when it carries file evidence. */
function warningFiles(warning: ProjectWarning): string {
  if (!warning.files?.length) return '';
  const more = (warning.count ?? warning.files.length) - warning.files.length;
  return ` (${warning.files.join(', ')}${more > 0 ? `, and ${more} more` : ''})`;
}

/** A path as one human field: control characters, such as a newline in a name, are shown escaped. */
const shownPath = (path: string): string => /[\u0000-\u001f\u007f]/u.test(path) ? JSON.stringify(path) : path;

/** One named path's disposition: checked paths name their evidence, others why they were not analyzed or checked. */
function pathLine(item: CheckDocument['paths'][number]): string {
  const module = item.module === null ? '' : `; module ${item.module}`;
  if (item.disposition === 'checked') return `Path ${shownPath(item.path)}: checked (${item.reason}${module})`;
  const why = item.disposition === 'not-analyzed' && item.exclusion ? `${item.exclusion.kind} ${shownPath(item.exclusion.directory)}` : item.reason;
  return `Path ${shownPath(item.path)}: ${item.disposition === 'not-analyzed' ? 'not analyzed' : 'not checked'} (${why}${module})`;
}

/**
 * Root, mode, findings, warnings and limits, then one line per named path, then the
 * outcome. Only a checked path is labelled checked: a not-analyzed path is one the
 * complete check does not analyze either, and it never reads as passing.
 */
export function formatChangedHuman(document: CheckDocument): string {
  const lines = [`Root: ${document.root}`,
    `Mode: resident (${document.revision ? `revision ${document.revision.sequence}; ${document.revision.path}` : document.reason ?? 'no revision'})`];
  for (const finding of document.findings) lines.push(`Error${finding.new ? ' [new]' : ''} [${finding.code}]${finding.location ? ` ${location(finding.location)}` : ''}: ${finding.message.replace(/[\r\n]+/g, ' ')}`);
  for (const warning of document.warnings) lines.push(`Warning [${warning.code}] ${shownPath(warning.path)}: ${oneLine(warning.message)}`);
  for (const limit of document.coverage) lines.push(`Analysis limit [${limit.code}] ${location(limit.location)}: ${limit.message.replace(/[\r\n]+/g, ' ')}`);
  for (const item of document.paths) lines.push(pathLine(item));
  const count = (disposition: CheckDocument['paths'][number]['disposition']): number => document.paths.filter(item => item.disposition === disposition).length;
  const paths = `${count('checked')} checked, ${count('not-analyzed')} not analyzed, ${count('not-checked')} not checked`;
  const checked = document.checked ? `${document.checked.files.length} files (${document.checked.files.join(', ') || 'none'}), ${document.checked.accesses} accesses` : 'none';
  lines.push(`Outcome: ${document.outcome === 'checked' ? `checked (${paths})` : `not checked (${document.reason}; ${paths})`}; checked set: ${checked}; wait: ${document.timings.waitedMs.toFixed(1)} ms; findings: ${document.findings.length}`);
  return lines.join('\n') + '\n';
}

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

export function formatHuman(report: AnalysisReport, mode: string): string {
  const lines = report.scope ? [
    `Root: ${report.scope.root} (${report.scope.selection === 'given' ? 'given' : `found from ${report.scope.invokedFrom}`})`,
    `Configuration: ${report.scope.configuration}`,
  ] : [`Root: unavailable (requested ${report.request.project.root ?? `from ${report.request.project.cwd}`})`, 'Configuration: unavailable'];
  lines.push(`Mode: ${mode}`);
  for (const issue of report.diagnostics) {
    lines.push(`Error [${issue.code}]${issue.location ? ` ${location(issue.location)}` : ''}: ${issue.message}`);
    if (issue.importer) lines.push(`  Importer: ${issue.importer.owner} (${issue.importer.kind}; tags: ${issue.importer.profile.join(', ') || 'none'})`);
    if (issue.original) lines.push(`  Original: ${issue.original.owner}/${issue.original.file}#${issue.original.binding}`);
    for (const related of issue.related) lines.push(`  Related: ${location(related)}`);
  }
  for (const warning of report.warnings) lines.push(`Warning [${warning.code}] ${shownPath(warning.path)}: ${oneLine(warning.message)}${warningFiles(warning)}`);
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
