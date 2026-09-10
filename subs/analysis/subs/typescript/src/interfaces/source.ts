import type { OriginalId, SourceOrigin, SourceLocation, SourceArea, BindingRequest } from '../../../model/src/interfaces/model.js';
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
export type SourceTarget =
  | { readonly kind: 'application'; readonly origin: SourceOrigin }
  | { readonly kind: 'external'; readonly resolution: 'package' | 'builtin' | 'standard-library';
      readonly name: string; readonly resolvedFile: string | null }
  | { readonly kind: 'outside-module'; readonly file: string }
  | { readonly kind: 'unresolved' };
export type WrittenForm = 'import' | 'import-type' | 'inline-type-import'
  | 'named-export' | 'type-export' | 'inline-type-export'
  | 'namespace-import' | 'type-namespace-import' | 'star-export'
  | 'type-star-export' | 'namespace-export' | 'type-namespace-export'
  | 'dynamic-import' | 'import-type-query' | 'jsdoc-import-type'
  | 'side-effect-import' | 'empty-import' | 'empty-export' | 'discarded-import'
  | 'commonjs' | 'macro' | 'unsupported';
export interface AccessSelection {
  readonly location: SourceLocation;
  readonly exportedName: string;
  readonly localName: string | null;
  readonly original: OriginalId | null;
  readonly request: BindingRequest;
  readonly explicitType: boolean;
  readonly forwarding: readonly SourceOrigin[];
  readonly status: 'resolved' | 'missing-export' | 'unresolved';
}
export interface SourceAccess {
  readonly id: string;
  readonly location: SourceLocation;
  readonly importer: SourceOrigin;
  readonly specifier: string | null;
  readonly form: WrittenForm;
  readonly selectionForm: 'named' | 'default' | 'direct-member' | 'literal-key'
    | 'destructure' | 'qualified-type' | 'whole-star' | 'whole-namespace'
    | 'then-member' | 'then-destructure' | 'none' | 'unknown';
  readonly runtimeLoad: boolean;
  readonly target: SourceTarget;
  readonly selections: readonly AccessSelection[];
  readonly coverageIds: readonly string[];
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
  accesses(signal?: AbortSignal): Promise<{ readonly accesses: readonly SourceAccess[];
    readonly coverage: readonly SourceLimit[] }>;
  dispose(): Promise<void>;
}
