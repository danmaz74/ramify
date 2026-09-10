import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDescription } from '../subs/descriptions/src/parse.js';
import type { ParsedDescription } from '../subs/descriptions/src/interfaces/syntax.js';
import { deriveSourceAreas, resolveTagRegistry } from '../subs/model/src/index.js';
import type { SourceArea, SourceLocation } from '../subs/model/src/interfaces/model.js';
import { readProject } from '../subs/project/src/read-project.js';
import type { ProjectInputView, ProjectIssue } from '../subs/project/src/interfaces/project.js';
import type { AnalysisCode, AnalysisDiagnostic, InventoryInputs, InventoryRun, RunControl } from './interfaces/analysis.js';

const byteOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

function diagnostic(code: AnalysisCode, message: string, category: AnalysisDiagnostic['category'],
  locations: readonly SourceLocation[] = []): AnalysisDiagnostic {
  const content = { code, message, category, location: locations[0] ?? null, related: locations.slice(1),
    importer: null, original: null, accessId: null };
  return { id: `inventory:${createHash('sha256').update(JSON.stringify(content)).digest('hex')}`, ...content };
}

function projectDiagnostics(issues: readonly ProjectIssue[], parsed: ReadonlyMap<string, ParsedDescription>): AnalysisDiagnostic[] {
  const diagnostics = issues.flatMap(issue => {
    const description = parsed.get(issue.path);
    if (issue.code === 'invalid-description' && description?.status === 'invalid') {
      return description.issues.map(item => diagnostic(item.code, item.message, 'description', [{ file: item.file, ...item.span }]));
    }
    return [diagnostic(issue.code, issue.message, 'acquisition', [{ file: issue.path, start: 0, end: 0, line: 1, column: 1 }])];
  });
  return [...new Map(diagnostics.map(item => [item.id, item])).values()];
}

function detached<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  function freeze(item: unknown): void {
    if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); }
  }
  freeze(copy);
  return copy;
}

/** Acquire one coherent inventory with resolved profiles, then release the input view. */
export async function acquireInventory(inputs: InventoryInputs, control: RunControl = {}): Promise<InventoryRun> {
  if (control.signal?.aborted) return { status: 'cancelled' };
  const failure = (code: AnalysisCode, message: string): InventoryRun => ({ status: 'incomplete',
    diagnostics: [diagnostic(code, message, code === 'resource-limit' ? 'limit' : 'execution')] });
  if (Object.values(inputs.limits).some(value => !Number.isSafeInteger(value) || value <= 0) || inputs.limits.attempts > 3) {
    return detached({ status: 'unavailable', diagnostics: [diagnostic('resource-limit', 'Acquisition limits must be positive safe integers, with at most three attempts', 'limit')] });
  }
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
  let result: InventoryRun = failure('internal-error', 'Inventory acquisition did not complete');
  try {
    for (let attempt = 0; attempt < inputs.limits.attempts && performance.now() < deadline; attempt++) {
      let view: ProjectInputView | undefined;
      try {
        const parsed = new Map<string, ParsedDescription>();
        const acquired = await readProject({ request: inputs.project, parse: (file, text) => {
          const description = parseDescription(file, text); parsed.set(file, description); return description;
        }, limits: { ...inputs.limits, attempts: 1, deadlineMs: Math.max(1, Math.ceil(deadline - performance.now())) }, signal: abort.signal });
        if (acquired.status === 'cancelled') break;
        if (acquired.status !== 'acquired') {
          result = { status: acquired.status, diagnostics: projectDiagnostics(acquired.issues, parsed) };
          if (acquired.issues.some(issue => issue.code === 'changed-input')) continue;
          break;
        }
        view = acquired.view;
        const inventory = view.inventory;
        const areas: SourceArea[] = [];
        const diagnostics: AnalysisDiagnostic[] = [];
        for (const module of inventory.modules) {
          const ordinary = module.areas.find(area => area.kind === 'ordinary');
          if (!ordinary) throw new Error(`Missing ordinary source area for ${module.id}`);
          const profiles = deriveSourceAreas(registry.value, module.id, ordinary.root, module.headerTags);
          if (profiles.status === 'valid') areas.push(...profiles.value);
          else diagnostics.push(...profiles.issues.map(issue => diagnostic(issue.code, issue.message, 'registry',
            module.description.status === 'valid' ? [{ file: module.description.document.file, ...module.description.document.module.span }] : [])));
        }
        if (diagnostics.length) { result = { status: 'invalid', diagnostics }; break; }
        const seal = await view.seal();
        if (seal.status === 'changed') {
          result = failure('changed-input', `Inputs changed during inventory acquisition: ${seal.paths.join(', ')}`);
          continue;
        }
        const captured = [...seal.inputs].sort((a, b) => byteOrder(a.path, b.path) || byteOrder(a.role, b.role));
        const inputId = `input/1:${createHash('sha256').update(JSON.stringify({ scope: inventory.scope,
          registry: registry.value.id, integration: 'typescript/7.0.2/configuration-only/1',
          recipe: 'whole-project-inventory/profiles/1', inputs: captured })).digest('hex')}`;
        result = { status: 'completed', snapshot: { inventory, areas, inputs: captured, inputId } };
        break;
      } finally { await view?.dispose(); }
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    result = failure(code === 'resource-limit' ? 'resource-limit' : 'internal-error', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
    control.signal?.removeEventListener('abort', cancel);
  }
  if (control.signal?.aborted) return { status: 'cancelled' };
  if (abort.signal.aborted || performance.now() >= deadline) return detached(failure('resource-limit', 'Inventory acquisition exceeded its deadline'));
  if ('diagnostics' in result) result = { ...result, diagnostics: [...result.diagnostics].sort((a, b) =>
    byteOrder(a.location?.file ?? '', b.location?.file ?? '') || (a.location?.start ?? 0) - (b.location?.start ?? 0)
    || byteOrder(a.code, b.code) || byteOrder(a.message, b.message)) };
  return detached(result);
}
