import { createHash } from 'node:crypto';
import { explainImport, originalKey } from '../subs/model/src/index.js';
import type { ImportDecision, Model, SourceLocation } from '../subs/model/src/interfaces/model.js';
import type { SourceAccess } from '../subs/typescript/src/interfaces/source.js';
import type { AnalysisDiagnostic } from './interfaces/analysis.js';

interface EvaluatedAccess {
  readonly accessId: string;
  readonly decisions: readonly ImportDecision[];
  readonly outcome: 'checked' | 'external' | 'outside-scope' | 'unverifiable' | 'mixed';
  readonly diagnostics: readonly string[];
  readonly coverage: readonly string[];
}
const order = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Analysis-owned request mapping, ready for the session's decide stage. Call
 * only with a model built from valid, linked descriptions of these inputs. */
export function evaluateAccesses(model: Model, accesses: readonly SourceAccess[], maxDiagnostics: number): {
  readonly results: readonly EvaluatedAccess[]; readonly diagnostics: readonly AnalysisDiagnostic[];
} {
  if (!Number.isSafeInteger(maxDiagnostics) || maxDiagnostics <= 0) throw new TypeError('Invalid diagnostic limit');
  const diagnostics: AnalysisDiagnostic[] = [];
  const add = (access: SourceAccess, location: SourceLocation, code: AnalysisDiagnostic['code'],
    message: string, decision?: ImportDecision): string => {
    if (diagnostics.length >= maxDiagnostics) throw Object.assign(new Error('Source diagnostics exceed the analysis limit'), { code: 'resource-limit' });
    const related = [...(decision?.original?.declarations ?? []), ...(decision?.original?.tagEvidence ?? []),
      ...(decision?.visibility?.paths.flatMap(path => path.flatMap(hop => hop.evidence)) ?? []),
      ...(decision?.visibility?.ineffective.flatMap(exposure => exposure.evidence) ?? []),
      ...(decision?.reason === 'not-visible' && decision.original ? model.exposures.filter(exposure =>
        originalKey(exposure.original) === originalKey(decision.original!.id)).flatMap(exposure => exposure.evidence) : [])];
    const value = { category: code === 'missing-export' ? 'missing-export' as const : 'import' as const, code, message, location,
      related: [...new Map(related.map(at => [JSON.stringify(at), at])).values()].sort((a, b) => order(a.file, b.file) || a.start - b.start),
      importer: access.importer.area, original: decision?.original?.id ?? null, accessId: access.id };
    const id = `source-diagnostic/1:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
    diagnostics.push({ id, ...value });
    return id;
  };
  const results = accesses.map((access): EvaluatedAccess => {
    const decisions: ImportDecision[] = [], ids: string[] = [];
    let unknown = access.coverageIds.length > 0;
    let checked = false;
    if (access.target.kind === 'application') {
      const target = access.target.origin;
      const decide = (location: SourceLocation, selection: Parameters<typeof explainImport>[1]['selection'],
        forwarding: Parameters<typeof explainImport>[1]['forwarding']): void => {
        const decision = explainImport(model, { importer: access.importer, location, target, selection, forwarding });
        decisions.push(decision); checked = true;
        if (decision.status === 'denied') {
          const binding = decision.original ? `${decision.original.id.owner}:${decision.original.id.file}#${decision.original.id.binding}` : target.file;
          const tags = decision.requirements.filter(item => !item.satisfied).map(item => item.tag);
          const blockers = decision.blockingOrigins.map(origin => origin.file);
          ids.push(add(access, location, decision.reason,
            `${binding}: ${decision.reason}${tags.length ? ` (${tags.join(', ')})` : ''}${blockers.length ? ` via ${blockers.join(', ')}` : ''}`, decision));
        }
      };
      for (const selection of access.selections) {
        if (selection.status === 'resolved' && selection.original) decide(selection.location,
          { original: selection.original, request: selection.request }, selection.forwarding);
        else if (selection.status === 'missing-export') {
          checked = true;
          ids.push(add(access, selection.location, 'missing-export', `${target.file} has no export named ${selection.exportedName}`));
          decide(selection.location, null, selection.forwarding);
        } else {
          unknown = true;
          decide(selection.location, null, selection.forwarding);
        }
      }
      // A known target retains its origin guard even when a selected original
      // cannot be established. Deferred forms must never become empty successes.
      if (!decisions.length && (access.runtimeLoad || access.selections.length > 0)) decide(access.location, null, []);
      if (!access.selections.length && access.form !== 'side-effect-import') unknown = true;
    }
    return { accessId: access.id, decisions,
      outcome: access.target.kind === 'external' ? 'external' : access.target.kind === 'outside-module' ? 'outside-scope'
        : access.target.kind === 'unresolved' ? 'unverifiable' : unknown ? checked ? 'mixed' : 'unverifiable' : 'checked',
      diagnostics: ids, coverage: access.coverageIds };
  });
  results.sort((a, b) => order(a.accessId, b.accessId));
  diagnostics.sort((a, b) => order(a.location?.file ?? '', b.location?.file ?? '') || (a.location?.start ?? 0) - (b.location?.start ?? 0) || order(a.id, b.id));
  return { results, diagnostics };
}
