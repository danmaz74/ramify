import type { OriginalId, SourceOrigin, SourceLocation, SourceArea } from '../../../model/src/interfaces/model.js';
import type { ProjectInputView, ProjectInventory } from '../../../project/src/interfaces/project.js';

export interface CatalogOriginal {
  readonly id: OriginalId;
  readonly origin: SourceOrigin;
  readonly declarations: readonly SourceLocation[];
  readonly hasValue: boolean;
  readonly hasType: boolean;
}
export interface CatalogExport {
  readonly name: string;
  readonly original: OriginalId | null;
  readonly namespace: readonly CatalogExport[] | null;
  readonly forwarding: readonly SourceOrigin[];
}
export interface FileExports {
  readonly file: string;
  readonly state: 'complete' | 'incomplete' | 'ambiguous';
  readonly exports: readonly CatalogExport[];
  readonly issueIds: readonly string[];
  readonly descriptionFiles: readonly string[];
}
export interface SourceCatalog {
  readonly originals: readonly CatalogOriginal[];
  readonly files: readonly FileExports[];
  readonly coverage: readonly SourceLimit[];
}
export interface SourceLimit {
  readonly id: string;
  readonly code: 'unresolved-target' | 'unresolved-original' | 'incomplete-exports'
    | 'ambiguous-original' | 'unknown-key' | 'namespace-escape' | 'nonliteral-target'
    | 'unsupported-loader' | 'unsupported-commonjs' | 'shared-global'
    | 'resource-target' | 'resource-description' | 'compiled-source'
    | 'outside-module-target' | 'compiler-blocked';
  readonly location: SourceLocation;
  readonly message: string;
  readonly compilerCode?: number;
  readonly related: readonly SourceLocation[];
}
export interface SourceWorkLimits {
  readonly maxExports: number;
  readonly maxAccesses: number;
  readonly maxSelections: number;
  readonly maxForwardingDepth: number;
  readonly deadlineMs: number;
}
export interface SourceAnalysisInputs {
  readonly signal?: AbortSignal;
  readonly view: ProjectInputView;
  readonly inventory: ProjectInventory;
  readonly areas: readonly SourceArea[];
  readonly limits: SourceWorkLimits;
}
export interface SourceAnalysis {
  catalog(signal?: AbortSignal): Promise<SourceCatalog>;
  dispose(): Promise<void>;
}
