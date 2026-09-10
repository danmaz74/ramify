import { createHash } from 'node:crypto';
import type { SourceLocation } from '../subs/model/src/interfaces/model.js';
import type { ParsedDescription } from '../subs/descriptions/src/interfaces/syntax.js';
import type { ProjectInventory, ProjectIssue } from '../subs/project/src/interfaces/project.js';
import type { AnalysisCode, AnalysisDiagnostic } from './interfaces/analysis.js';

export function diagnostic(code: AnalysisCode, message: string, category: AnalysisDiagnostic['category'],
  locations: readonly SourceLocation[] = []): AnalysisDiagnostic {
  const content = { code, message, category, location: locations[0] ?? null, related: locations.slice(1),
    importer: null, original: null, accessId: null };
  return { id: `validation:${createHash('sha256').update(JSON.stringify(content)).digest('hex')}`, ...content };
}

export function projectDiagnostics(inventory: ProjectInventory | null, issues: readonly ProjectIssue[], parsed: ReadonlyMap<string, ParsedDescription>): AnalysisDiagnostic[] {
  const result: AnalysisDiagnostic[] = [];
  for (const issue of issues) {
    const module = inventory?.modules.find(item => item.description.status === 'valid'
      ? item.description.document.file === issue.path : item.description.file === issue.path);
    const description = parsed.get(issue.path) ?? module?.description;
    if (issue.code === 'invalid-description' && description?.status === 'invalid') {
      result.push(...description.issues.map(item => diagnostic(item.code, item.message, 'description', [{ file: item.file, ...item.span }])));
      continue;
    }
    const references = inventory?.references.filter(ref => ref.description === issue.path && ref.status !== 'file'
      && issue.message.includes(JSON.stringify(ref.decoded))) ?? [];
    const doc = module?.description.status === 'valid' ? module.description.document : null;
    const spans = references.flatMap(ref => {
      const statement = doc?.statements.find(item => item.index === ref.statement);
      return statement ? [{ file: issue.path, ...statement.from.span }] : [];
    });
    const layout = ['missing-root-description', 'invalid-layout', 'duplicate-name', 'description-in-src',
      'stray-description', 'reserved-container', 'symlink-root', 'symlink-description'].includes(issue.code);
    result.push(diagnostic(issue.code, issue.message, references.length ? 'description' : layout ? 'layout' : 'acquisition',
      spans.length ? spans : [{ file: issue.path, start: 0, end: 0, line: 1, column: 1 }]));
  }
  return [...new Map(result.map(item => [item.id, item])).values()];
}

export function detached<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  function freeze(item: unknown): void {
    if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); }
  }
  freeze(copy);
  return copy;
}
