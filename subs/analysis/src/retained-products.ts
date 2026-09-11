import { createHash } from 'node:crypto';
import type { ParsedDescription } from '../subs/descriptions/src/interfaces/syntax.js';
import type { SourceCatalog, SourceAccess, SourceLimit } from '../subs/typescript/src/interfaces/source.js';
import type { CapturedInput, ProjectInputView } from '../subs/project/src/interfaces/project.js';
import type { AnalysisInputs, AnalysisReport, RetainedAnalysis, RetainedStageId, InputChange } from './interfaces/analysis.js';
import { copyReport } from './report-copy.js';

export const retainedEngine = 'typescript/7.0.2/captured-source/1';
export const identity = (data: unknown): string => createHash('sha256').update(JSON.stringify(data)).digest('hex');
export const dependencyKey = (inputs: readonly CapturedInput[]): string => identity(inputs.map(({ path, role, sha256 }) => [path, role, sha256]));
export type ReadCall = { readonly method: 'readFile' | 'fileExists' | 'directoryExists' | 'readDirectory' | 'realPath'; readonly path: string };
export interface CatalogProduct { readonly value: SourceCatalog; readonly calls: readonly ReadCall[]; readonly dependencies: readonly CapturedInput[]; readonly context: string }
export interface AccessProduct { readonly accesses: readonly SourceAccess[]; readonly coverage: readonly SourceLimit[] }
export type ParseProduct = Record<string, { readonly hash: string; readonly value: ParsedDescription }>;
export interface RetainedWork {
  readonly previous: RetainedAnalysis | null; readonly changes: readonly InputChange[] | null;
  products: Partial<Record<RetainedStageId, unknown>>; keys: Partial<Record<RetainedStageId, string>>;
  reused: RetainedStageId[]; sealed: readonly CapturedInput[] | null;
}
export function createRetainedWork(previous: RetainedAnalysis | null, changes: readonly InputChange[] | null): RetainedWork {
  return { previous: previous?.engine === retainedEngine && previous.schemaVersion === 'ramify.retained/1' ? previous : null,
    changes, products: {}, keys: {}, reused: [], sealed: null };
}
export function recordProduct(work: RetainedWork | undefined, stage: RetainedStageId, key: string, product: unknown, reused = false): void {
  if (!work) return;
  work.products[stage] = product; work.keys[stage] = key;
  if (reused && !work.reused.includes(stage)) work.reused.push(stage);
}
export function sourceDependencies(inputs: readonly CapturedInput[]): readonly CapturedInput[] {
  return inputs.filter(input => input.role !== 'description' && input.role !== 'readme' && !/(^|\/)README\.md$/.test(input.path));
}
export function captureReads(view: ProjectInputView, calls: ReadCall[]): ProjectInputView {
  const recorded = new Set<string>();
  const methods = ['readFile', 'fileExists', 'directoryExists', 'readDirectory', 'realPath'] as const;
  const wrappers = Object.fromEntries(methods.map(method => [method, (path: string) => {
    const key = JSON.stringify([method, path]);
    if (!recorded.has(key)) { recorded.add(key); calls.push({ method, path }); }
    return view[method](path);
  }]));
  return Object.freeze({ ...view, get inputs() { return view.inputs; }, ...wrappers }) as ProjectInputView;
}
export async function replayReads(view: ProjectInputView, calls: readonly ReadCall[]): Promise<void> {
  for (const call of calls) await view[call.method](call.path);
}
export function finishRetained(work: RetainedWork, report: AnalysisReport, inputs: AnalysisInputs): RetainedAnalysis | null {
  if (!work.sealed || !['completed', 'invalid'].includes(report.outcome.execution)) return null;
  const root = report.snapshot?.inventory.scope.root ?? inputs.project.root ?? inputs.project.cwd;
  const inputId = report.inputId ?? `input/1:${identity([root, inputs.project.scope, report.scope?.configuration ?? inputs.project.configuration,
    inputs.registry.id, retainedEngine, work.sealed])}`;
  const value = { schemaVersion: 'ramify.retained/1' as const, inputId, engine: retainedEngine, inputs: work.sealed,
    bytes: 0, stages: Object.entries(work.products).map(([stage, product]) => ({ stage: stage as RetainedStageId,
      key: work.keys[stage as RetainedStageId]!, bytes: Buffer.byteLength(JSON.stringify(product)) })), products: work.products };
  for (;;) { const bytes = Buffer.byteLength(JSON.stringify(value)); if (bytes === value.bytes) break; value.bytes = bytes; }
  return copyReport(value);
}
export function changedInputs(previous: RetainedAnalysis | null, inputs: readonly CapturedInput[]): readonly string[] | null {
  if (!previous) return null;
  const old = new Map(previous.inputs.map(input => [input.path, input]));
  const changed = new Set<string>();
  for (const input of inputs) {
    const before = old.get(input.path); old.delete(input.path);
    if (!before || before.role !== input.role || before.sha256 !== input.sha256) changed.add(input.path);
  }
  for (const path of old.keys()) changed.add(path);
  return [...changed].sort();
}
