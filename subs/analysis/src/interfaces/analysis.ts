import type { ImportDecision, ImportReason, Model, ModelIssue, OriginalId, ResolvedTagRegistry, SourceArea, SourceLocation } from '../../subs/model/src/interfaces/model.js';
import type { DescriptionIssue } from '../../subs/descriptions/src/interfaces/syntax.js';
import type { LinkedDescriptions, LinkIssue } from '../../subs/descriptions/src/interfaces/linking.js';
import type { AcquisitionLimits, CapturedInput, ProjectInventory, ProjectIssue, ProjectRequest, ProjectScope, OutsideSourceWarning } from '../../subs/project/src/interfaces/project.js';
import type { SourceAccess, SourceCatalog, SourceLimit, SourceWorkLimits } from '../../subs/typescript/src/interfaces/source.js';

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

export interface CapabilityExecution {
  readonly capability: Capability;
  readonly available: boolean;
  readonly requested: boolean;
  readonly executed: boolean;
}
export interface StageExecution {
  readonly stage: StageId;
  readonly status: 'completed' | 'invalid' | 'blocked' | 'unavailable'
    | 'failed' | 'not-requested';
  readonly blockedBy: readonly StageId[];
  readonly diagnosticIds: readonly string[];
}

export interface AccessResult {
  readonly accessId: string;
  readonly decisions: readonly ImportDecision[];
  readonly outcome: 'checked' | 'external' | 'outside-scope' | 'unverifiable' | 'mixed';
  readonly diagnostics: readonly string[];
  readonly coverage: readonly string[];
}
export interface AnalysisSnapshot {
  readonly inventory: ProjectInventory;
  readonly areas: readonly SourceArea[];
  readonly inputs: readonly CapturedInput[];
  readonly catalog: SourceCatalog | null;
  readonly linked: LinkedDescriptions | null;
  readonly model: Model | null;
  readonly accesses: readonly SourceAccess[];
  readonly results: readonly AccessResult[];
}
export interface AnalysisSummary {
  readonly complete: boolean;
  readonly owners: number;
  readonly sourceFiles: number;
  readonly resources: number;
  readonly originals: number;
  readonly accesses: number;
  readonly allowed: number;
  readonly denied: number;
  readonly errors: number;
  readonly warnings: number;
  readonly coverageNotes: number;
  readonly external: number;
}
export interface AnalysisReport {
  readonly schemaVersion: 'ramify.analysis/1';
  readonly runId: string;
  readonly inputId: string | null;
  readonly request: AnalysisInputs;
  readonly scope: ProjectScope | null;
  readonly registry: ResolvedTagRegistry | null;
  readonly capabilities: readonly CapabilityExecution[];
  readonly stages: readonly StageExecution[];
  readonly outcome: { readonly execution: 'completed' | 'invalid' | 'incomplete' | 'unavailable';
    readonly check: 'passed' | 'failed' | 'not-run';
    readonly coverage: 'complete' | 'partial' | 'not-run' };
  readonly snapshot: AnalysisSnapshot | null;
  readonly diagnostics: readonly AnalysisDiagnostic[];
  readonly warnings: readonly OutsideSourceWarning[];
  readonly coverage: readonly SourceLimit[];
  readonly summary: AnalysisSummary;
}
export type AnalysisRun =
  | { readonly status: 'reported'; readonly report: AnalysisReport }
  | { readonly status: 'cancelled' };
export interface AnalysisSession {
  analyze(control?: RunControl): Promise<AnalysisRun>;
  dispose(): Promise<void>;
}