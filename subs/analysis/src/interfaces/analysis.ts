import type { ImportReason, ModelIssue, OriginalId, ResolvedTagRegistry, SourceArea, SourceLocation } from '../../subs/model/src/interfaces/model.js';
import type { DescriptionIssue } from '../../subs/descriptions/src/interfaces/syntax.js';
import type { LinkedDescriptions, LinkIssue } from '../../subs/descriptions/src/interfaces/linking.js';
import type { AcquisitionLimits, CapturedInput, ProjectInventory, ProjectIssue, ProjectRequest } from '../../subs/project/src/interfaces/project.js';
import type { SourceCatalog, SourceWorkLimits } from '../../subs/typescript/src/interfaces/source.js';

export type Capability = 'registry' | 'layout' | 'metadata' | 'descriptions'
  | 'source-catalog' | 'exposure-linking' | 'static-access' | 'tags-origin'
  | 'namespace-access' | 'lazy-access' | 'symbol-free-access' | 'resource-access'
  | 'coverage' | 'browser-verification';
export type StageId = 'registry' | 'acquisition' | 'parse' | 'catalog'
  | 'link' | 'access' | 'decide' | 'report';
export interface RunControl { readonly signal?: AbortSignal }
export interface AnalysisLimits {
  readonly acquisition: AcquisitionLimits;
  readonly source: SourceWorkLimits;
  readonly maxExposurePairs: number;
  readonly maxDiagnostics: number;
  readonly maxReportBytes: number;
  readonly disposeTimeoutMs: number;
  readonly deadlineMs: number;
}
export interface AnalysisInputs {
  readonly project: ProjectRequest;
  readonly registry: ResolvedTagRegistry;
  readonly capabilities: readonly Capability[];
  readonly limits: AnalysisLimits;
}
export interface InventoryInputs {
  readonly project: ProjectRequest;
  readonly registry: ResolvedTagRegistry;
  readonly limits: AcquisitionLimits;
}
export interface InventorySnapshot {
  readonly inventory: ProjectInventory;
  readonly areas: readonly SourceArea[];
  readonly inputs: readonly CapturedInput[];
  readonly inputId: string;
}
export type InventoryRun =
  | { readonly status: 'completed'; readonly snapshot: InventorySnapshot }
  | { readonly status: 'invalid' | 'incomplete' | 'unavailable';
      readonly diagnostics: readonly AnalysisDiagnostic[] }
  | { readonly status: 'cancelled' };
export type ValidationRun =
  | { readonly status: 'valid'; readonly input: InventorySnapshot;
      readonly catalog: SourceCatalog;
      readonly linked: Extract<LinkedDescriptions, { readonly status: 'valid' }> }
  | { readonly status: 'invalid' | 'incomplete' | 'unavailable';
      readonly diagnostics: readonly AnalysisDiagnostic[] }
  | { readonly status: 'cancelled' };
export type AnalysisCode = ModelIssue['code'] | DescriptionIssue['code']
  | ProjectIssue['code'] | LinkIssue['code'] | ImportReason
  | 'missing-export' | 'invalid-invocation' | 'unavailable-capability'
  | 'missing-stage' | 'session-used' | 'session-disposed' | 'output-failure'
  | 'resource-limit' | 'internal-error';
export interface AnalysisDiagnostic {
  readonly id: string;
  readonly category: 'invocation' | 'registry' | 'layout' | 'description'
    | 'missing-export' | 'import' | 'acquisition' | 'unavailable' | 'execution' | 'limit';
  readonly code: AnalysisCode;
  readonly message: string;
  readonly location: SourceLocation | null;
  readonly related: readonly SourceLocation[];
  readonly importer: SourceArea | null;
  readonly original: OriginalId | null;
  readonly accessId: string | null;
  readonly limit?: { readonly name: string; readonly maximum: number;
    readonly observed: number; readonly collectedPrefix: true };
}
