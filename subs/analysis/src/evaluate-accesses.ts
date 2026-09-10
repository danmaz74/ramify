import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { explainImport, originalKey } from '../subs/model/src/index.js';
import type { ImportDecision, Model, SourceLocation } from '../subs/model/src/interfaces/model.js';
import type { SourceAccess } from '../subs/typescript/src/interfaces/source.js';
import type { AccessResult, AnalysisDiagnostic } from './interfaces/analysis.js';

const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** Analysis-owned request mapping, ready for the session's decide stage. Call
 * only with a model built from valid, linked descriptions of these inputs. */
interface Collector {
  readonly diagnostic: (item: AnalysisDiagnostic) => void;
  readonly result: (item: AccessResult) => void;
  readonly checkpoint: () => void;
}
interface Evaluation {
  readonly results: readonly AccessResult[];
  readonly diagnostics: readonly AnalysisDiagnostic[];
}

/** Both synchronous stage fixtures and asynchronous sessions use these steps. */
function* evaluateSteps(model: Model, accesses: readonly SourceAccess[], maxDiagnostics: number, collect?: Collector): Generator<void, Evaluation> {
  if (!Number.isSafeInteger(maxDiagnostics) || maxDiagnostics <= 0) throw new TypeError('Invalid diagnostic limit');
  const diagnostics: AnalysisDiagnostic[] = [];
  const add = (access: SourceAccess, location: SourceLocation, code: AnalysisDiagnostic['code'],
    message: string, decision?: ImportDecision): string => {
    if (!collect && diagnostics.length >= maxDiagnostics) throw Object.assign(new Error('Source diagnostics exceed the analysis limit'), { code: 'resource-limit' });
    const related = [...(decision?.original?.declarations ?? []), ...(decision?.original?.tagEvidence ?? []),
      ...(decision?.visibility?.paths.flatMap(path => path.flatMap(hop => hop.evidence)) ?? []),
      ...(decision?.visibility?.ineffective.flatMap(exposure => exposure.evidence) ?? []),
      ...(decision?.reason === 'not-visible' && decision.original ? model.exposures.filter(exposure =>
        originalKey(exposure.original) === originalKey(decision.original!.id)).flatMap(exposure => exposure.evidence) : [])];
    const value = { category: code === 'missing-export' ? 'missing-export' as const : 'import' as const, code, message, location,
      related: [...new Map(related.map(at => [JSON.stringify(at), at])).values()].sort((a, b) => order(a.file, b.file) || a.start - b.start),
      importer: access.importer.area, original: decision?.original?.id ?? null, accessId: access.id };
    const id = `source-diagnostic/1:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
    collect?.diagnostic({ id, ...value });
    diagnostics.push({ id, ...value });
    return id;
  };
  const results: AccessResult[] = [];
  for (const access of accesses) {
    collect?.checkpoint();
    const decisions: ImportDecision[] = [], ids: string[] = [];
    let unknown = access.coverageIds.length > 0;
    let checked = false;
    if (access.target.kind === 'application') {
      const target = access.target.origin;
      const decide = (location: SourceLocation, selection: Parameters<typeof explainImport>[1]['selection'],
        forwarding: Parameters<typeof explainImport>[1]['forwarding']): void => {
        const decision = explainImport(model, { importer: access.importer, location, target, selection, forwarding });
        // Unsupported interpreters may establish a forbidden source origin,
        // but an ordinary target alone does not complete their unknown access.
        if (selection === null && ['commonjs', 'macro', 'unsupported'].includes(access.form) && decision.status === 'allowed') return;
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
        yield;
        collect?.checkpoint();
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
      if (!decisions.length) decide(access.location, null, []);
      // The interpreter distinguishes supported empty selections from unknown
      // flows. Both retain the same target-origin check, including erased forms.
      if (!access.selections.length && access.selectionForm === 'unknown') unknown = true;
    }
    const result: AccessResult = { accessId: access.id, decisions,
      outcome: access.target.kind === 'external' ? 'external' : access.target.kind === 'outside-module' ? 'outside-scope'
        : access.target.kind === 'unresolved' ? 'unverifiable' : unknown ? checked ? 'mixed' : 'unverifiable' : 'checked',
      diagnostics: ids, coverage: access.coverageIds };
    collect?.result(result);
    results.push(result);
    yield;
  }
  results.sort((a, b) => order(a.accessId, b.accessId));
  diagnostics.sort((a, b) => order(a.location?.file ?? '', b.location?.file ?? '') || (a.location?.start ?? 0) - (b.location?.start ?? 0) || order(a.id, b.id));
  return { results, diagnostics };
}

export function evaluateAccesses(model: Model, accesses: readonly SourceAccess[], maxDiagnostics: number): Evaluation {
  const steps = evaluateSteps(model, accesses, maxDiagnostics);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** Yield real event-loop turns between bounded selection batches, including
 * large whole-namespace occurrences, so cancellation can reach the engine. */
export async function evaluateAccessesAsync(model: Model, accesses: readonly SourceAccess[], maxDiagnostics: number, collect: Collector): Promise<void> {
  const steps = evaluateSteps(model, accesses, maxDiagnostics, collect);
  let count = 0;
  for (const _step of steps) {
    if (++count % 64 === 0) { await setImmediate(); collect.checkpoint(); }
  }
}
