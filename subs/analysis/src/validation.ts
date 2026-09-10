import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDescription } from '../subs/descriptions/src/parse.js';
import type { ParsedDescription } from '../subs/descriptions/src/interfaces/syntax.js';
import { linkDescriptions } from '../subs/descriptions/src/link.js';
import { deriveSourceAreas, resolveTagRegistry } from '../subs/model/src/index.js';
import type { SourceArea } from '../subs/model/src/interfaces/model.js';
import { readProject } from '../subs/project/src/read-project.js';
import type { ProjectInputView } from '../subs/project/src/interfaces/project.js';
import { createSourceAnalysis } from '../subs/typescript/src/source-analysis.js';
import type { SourceAnalysis } from '../subs/typescript/src/interfaces/source.js';
import type { AnalysisCode, AnalysisDiagnostic, AnalysisInputs, Capability, RunControl, ValidationRun } from './interfaces/analysis.js';

import { diagnostic, projectDiagnostics, detached } from './report-data.js';

const capabilities: readonly Capability[] = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking'];
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Validate one whole project and release all acquired/compiler state before returning. */
export async function validateProject(inputs: AnalysisInputs, control: RunControl = {}): Promise<ValidationRun> {
  if (control.signal?.aborted) return { status: 'cancelled' };
  const failure = (code: AnalysisCode, message: string, status: 'incomplete' | 'unavailable' = 'incomplete'): ValidationRun =>
    ({ status, diagnostics: [diagnostic(code, message, code === 'resource-limit' ? 'limit' : 'execution')] });
  if (Object.values(inputs.limits).flatMap(value => typeof value === 'object' ? Object.values(value) : [value])
    .some(value => !Number.isSafeInteger(value) || value <= 0) || inputs.limits.acquisition.attempts > 3) {
    return detached(failure('resource-limit', 'Analysis limits must be positive safe integers', 'unavailable'));
  }
  const unsupported = inputs.capabilities.filter(capability => !capabilities.includes(capability));
  if (unsupported.length) return detached({ status: 'unavailable', diagnostics: [diagnostic('unavailable-capability',
    `Project validation cannot execute: ${unsupported.join(', ')}`, 'unavailable')] });
  const registry = resolveTagRegistry(inputs.registry?.definitions);
  if (registry.status === 'invalid') return detached({ status: 'invalid', diagnostics: registry.issues.map(issue =>
    diagnostic(issue.code, issue.message, 'registry', issue.locations)) });
  if (registry.value.id !== inputs.registry.id || registry.value.isDefault !== inputs.registry.isDefault) {
    return detached({ status: 'invalid', diagnostics: [diagnostic('invalid-registry', 'Resolved registry identity does not match its definitions', 'registry')] });
  }
  const abort = new AbortController();
  const cancel = (): void => abort.abort();
  control.signal?.addEventListener('abort', cancel, { once: true });
  const deadline = performance.now() + inputs.limits.deadlineMs;
  const timer = setTimeout(cancel, inputs.limits.deadlineMs);
  const remaining = (maximum: number): number => Math.max(1, Math.ceil(Math.min(maximum, deadline - performance.now())));
  let result: ValidationRun = failure('internal-error', 'Validation did not complete');
  let acquisitionElapsed = 0;
  try {
    for (let attempt = 0; attempt < inputs.limits.acquisition.attempts; attempt++) {
      let view: ProjectInputView | undefined;
      let source: SourceAnalysis | undefined;
      try {
        if (acquisitionElapsed >= inputs.limits.acquisition.deadlineMs) {
          result = failure('resource-limit', 'Validation exhausted the total acquisition deadline'); break;
        }
        const parsed = new Map<string, ParsedDescription>();
        const acquisitionStart = performance.now();
        const acquired = await readProject({ request: inputs.project, parse: (file, text) => {
          const description = parseDescription(file, text); parsed.set(file, description); return description;
        }, limits: { ...inputs.limits.acquisition, attempts: 1,
          deadlineMs: remaining(inputs.limits.acquisition.deadlineMs - acquisitionElapsed) }, signal: abort.signal });
        acquisitionElapsed += performance.now() - acquisitionStart;
        if (acquired.status === 'cancelled') break;
        if (acquired.status !== 'acquired') {
          result = { status: acquired.status, diagnostics: projectDiagnostics(acquired.inventory, acquired.issues, parsed) };
          if (acquired.issues.some(issue => issue.code === 'changed-input')) continue;
          break;
        }
        view = acquired.view;
        const inventory = view.inventory;
        const areas: SourceArea[] = [];
        const profileIssues: AnalysisDiagnostic[] = [];
        for (const module of inventory.modules) {
          const profiles = deriveSourceAreas(registry.value, module.id, module.areas.find(area => area.kind === 'ordinary')!.root, module.headerTags);
          if (profiles.status === 'valid') areas.push(...profiles.value);
          else profileIssues.push(...profiles.issues.map(issue => diagnostic(issue.code, issue.message, 'registry',
            module.description.status === 'valid' ? [{ file: module.description.document.file, ...module.description.document.module.span }] : [])));
        }
        if (profileIssues.length) { result = { status: 'invalid', diagnostics: profileIssues }; break; }
        source = await createSourceAnalysis({ view, inventory, areas,
          limits: { ...inputs.limits.source, deadlineMs: remaining(inputs.limits.source.deadlineMs) }, signal: abort.signal });
        const catalog = await source.catalog(abort.signal);
        const linked = linkDescriptions({ registry: registry.value, inventory, catalog });
        const seal = await view.seal();
        if (seal.status === 'changed') {
          result = failure('changed-input', `Inputs changed during validation: ${seal.paths.join(', ')}`);
          continue;
        }
        if (linked.status === 'invalid') {
          result = { status: 'invalid', diagnostics: linked.issues.map(issue => diagnostic(issue.code, issue.message,
            issue.code === 'missing-export' ? 'missing-export' : 'description', issue.locations)) };
        } else {
          const pairCount = linked.selections.reduce((sum, selection) => sum + selection.pairs.length, 0);
          if (pairCount > inputs.limits.maxExposurePairs) {
            result = failure('resource-limit', `Expanded exposure pairs ${pairCount} exceed ${inputs.limits.maxExposurePairs}`);
          } else {
            const captured = [...seal.inputs].sort((a, b) => compare(a.path, b.path) || compare(a.role, b.role));
            const inputId = `input/1:${createHash('sha256').update(JSON.stringify({ scope: inventory.scope,
              registry: registry.value.id, integration: 'typescript/7.0.2/captured-catalog/1',
              recipe: 'adjacent-absent-config/extends/files-all-owned-and-configured/empty-include-exclude/resource-witness/1',
              roots: inventory.files.filter(file => file.kind === 'source').map(file => file.path).sort(compare), inputs: captured,
            })).digest('hex')}`;
            result = { status: 'valid', input: { inventory, areas, inputs: captured, inputId }, catalog, linked };
          }
        }
        const diagnosticCount = (result.status === 'invalid' || result.status === 'incomplete' || result.status === 'unavailable' ? result.diagnostics.length : 0)
          + inventory.warnings.length + catalog.coverage.length;
        if (diagnosticCount > inputs.limits.maxDiagnostics) result = failure('resource-limit', `Diagnostic records ${diagnosticCount} exceed ${inputs.limits.maxDiagnostics}`);
        break;
      } finally {
        const disposalStart = performance.now();
        try { await source?.dispose(); }
        finally { await view?.dispose(); }
        if (performance.now() - disposalStart > inputs.limits.disposeTimeoutMs) {
          throw Object.assign(new Error(`Validation disposal exceeded ${inputs.limits.disposeTimeoutMs} ms`), { code: 'resource-limit' });
        }
      }
    }
  } catch (error) {
    // Provider errors cross an owner boundary as ordinary Errors, never private classes.
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    result = failure(code === 'resource-limit' || code === 'deadline' ? 'resource-limit' : 'internal-error',
      error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
    control.signal?.removeEventListener('abort', cancel);
  }
  if (control.signal?.aborted) return { status: 'cancelled' };
  if (abort.signal.aborted || performance.now() >= deadline) return detached(failure('resource-limit', 'Validation exceeded its analyze deadline'));
  if ('diagnostics' in result) result = { ...result, diagnostics: [...result.diagnostics].sort((a, b) =>
    compare(a.location?.file ?? '', b.location?.file ?? '') || (a.location?.start ?? 0) - (b.location?.start ?? 0)
    || compare(a.code, b.code) || compare(a.message, b.message)) };
  if (Buffer.byteLength(JSON.stringify(result)) > inputs.limits.maxReportBytes) {
    result = failure('resource-limit', `Validation result exceeds ${inputs.limits.maxReportBytes} bytes`);
  }
  return detached(result);
}
