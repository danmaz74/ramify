import type { OriginalId, SourceOrigin, SourceLocation, SourceArea, BindingRequest, SignatureCompanions } from '../../../model/src/interfaces/model.js';
import type { DependencyBehaviorFacts } from './dependency-behavior.js';
import type { ObservationSink, ProjectExclusion, ProjectInputView, ProjectInventory } from '../../../project/src/interfaces/project.js';

export interface CatalogOriginal {
  readonly id: OriginalId;
  readonly origin: SourceOrigin;
  readonly declarations: readonly SourceLocation[];
  readonly hasValue: boolean;
  readonly hasType: boolean;
  /** What the original's declared signature names, recorded for every exported original. */
  readonly companions: SignatureCompanions;
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
/** What one file's export description read. A change to any of these can change
 * that description, so recomputation follows these edges. */
export interface DescriptionDependencies {
  readonly files: readonly string[];
  readonly resources: readonly string[];
  readonly shims: readonly string[];
  readonly absent: readonly string[];
}
export interface FileDescription {
  readonly file: string;
  readonly exports: FileExports;
  readonly originals: readonly CatalogOriginal[];
  readonly coverage: readonly SourceLimit[];
  readonly dependencies: DescriptionDependencies;
}
export interface CatalogDelta {
  readonly recomputed: readonly string[];
  readonly changed: readonly string[];
  readonly moved: readonly string[];
  readonly changedOriginals: readonly OriginalId[];
  readonly removedOriginals: readonly OriginalId[];
}
export type SourceTarget =
  | { readonly kind: 'application'; readonly origin: SourceOrigin }
  | { readonly kind: 'external'; readonly resolution: 'package' | 'builtin' | 'standard-library';
      readonly name: string; readonly resolvedFile: string | null }
  | { readonly kind: 'outside-project'; readonly file: string }
  /** A physical project-relative target inside a declared nested tree, with its declaration. */
  | { readonly kind: 'nested-tree'; readonly file: string;
      readonly exclusion: ProjectExclusion & { readonly kind: 'owned-ignored' | 'external' } }
  /** A non-package target inside an always-excluded path; its contents are not interpreted. */
  | { readonly kind: 'excluded'; readonly file: string;
      readonly exclusion: ProjectExclusion & { readonly kind: 'scratch' | 'repository' | 'packages' | 'output' | 'generated' } }
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
    | 'outside-module-target' | 'compiler-blocked'
    /** Reported by analysis for an exposed original from its companion facts. */
    | 'signature-inferred' | 'signature-unresolved';
  readonly location: SourceLocation;
  readonly message: string;
  readonly compilerCode?: number;
  readonly related: readonly SourceLocation[];
}
export interface SymbolDetailLimits {
  readonly maxSignatureBytes: number;
  readonly maxDocumentationBytes: number;
  readonly maxOverloads: number;
  readonly maxResultBytes: number;
}
export interface SymbolDetailRequest {
  readonly original: OriginalId;
  readonly exportName: string;
}
export type SymbolDetail =
  | { readonly state: 'described'; readonly original: OriginalId; readonly exportName: string;
      readonly signature: string; readonly documentation?: string }
  | { readonly state: 'truncated'; readonly original: OriginalId; readonly exportName: string;
      readonly signature: string; readonly documentation?: string;
      readonly truncated: readonly ('signature' | 'documentation' | 'overloads')[] }
  | { readonly state: 'unavailable'; readonly original: OriginalId; readonly exportName: string;
      readonly reason: 'missing-file' | 'missing-export' | 'identity-mismatch'
        | 'unsupported-declaration' | 'compiler-failure' };
/** The behavior of an exported runtime value, by the behavior-capable rule's precedence. */
export type ExportBehavior = 'constructable' | 'callable' | 'member' | 'unknown';
/** An exported original's kind, from its primary declaration; `resource` for a non-code original. */
export type ExportKind = 'class' | 'function' | 'interface' | 'type' | 'enum'
  | 'namespace' | 'value' | 'resource';
export interface ExportShapeRequest { readonly original: OriginalId; readonly exportName: string }
export interface ExportShape {
  readonly original: OriginalId;
  readonly exportName: string;
  readonly kind: ExportKind;
  /** null: a supporting original. */
  readonly behavior: ExportBehavior | null;
}
/** Bounds of one test-title read: a title's UTF-8 bytes before its `…`, the
 * titles of one suite entry, and the encoded bytes of the whole result. */
export interface TestTitleLimits {
  readonly maxTitleBytes: number;
  readonly maxTitlesPerRecord: number;
  readonly maxResultBytes: number;
}
/** One suite's direct tests, or one continuation of a longer list. */
export interface TestSuiteTitles {
  /** Suite titles, outermost first; `[]` outside any suite. */
  readonly suite: readonly string[];
  /** The suite's direct tests only, in source order. */
  readonly tests: readonly string[];
}
/** One project-relative test file's titles, read statically from the compiler's
 * syntax tree. `dynamic` and `cut` count the titles recorded as `(dynamic)` and
 * the titles cut to the byte limit. */
export type TestFileTitles =
  | { readonly file: string; readonly state: 'described';
      readonly suites: readonly TestSuiteTitles[];
      readonly dynamic: number; readonly cut: number }
  | { readonly file: string; readonly state: 'unavailable';
      readonly reason: 'not-in-program' | 'compiler-failure' };
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
/** Recorded accesses a lean classifier run receives instead of interpreting source again. */
export interface SuppliedAccesses {
  readonly accesses: readonly SourceAccess[];
  /** Maximum encoded bytes of the returned facts; a larger result is a `resource-limit` failure. */
  readonly limits: { readonly maxFactBytes: number };
}
export interface SourceAnalysis {
  catalog(signal?: AbortSignal): Promise<SourceCatalog>;
  accesses(signal?: AbortSignal): Promise<{ readonly accesses: readonly SourceAccess[];
    readonly coverage: readonly SourceLimit[] }>;
  /**
   * The opt-in `dependency-behavior` facts over the accesses of this lifetime or,
   * when `supplied`, over those accesses without building the export catalog or
   * interpreting imports. Cancellation returns no partial facts.
   */
  dependencyBehavior(signal?: AbortSignal, supplied?: SuppliedAccesses): Promise<DependencyBehaviorFacts>;
  /** Classifier runs this lifetime's compiler helper has reported; readable after disposal. */
  behaviorRuns(): number;
  dispose(): Promise<void>;
}

/** Per-file interpretation over one owned compiler lifetime. */
export interface AccessInterpreter {
  interpret(files: readonly string[], signal?: AbortSignal): Promise<{
    readonly accesses: readonly SourceAccess[];
    readonly coverage: readonly SourceLimit[];
    readonly candidates: readonly { readonly file: string; readonly paths: readonly string[] }[];
  }>;
  replaceDescriptions(descriptions: readonly FileDescription[], removed: readonly string[]): void;
  dispose(): Promise<void>;
}

/** The files one update names. `inventory` is the current inventory when the
 * owned file list or areas changed, so the virtual inputs regenerate. */
export interface SourceChangeSet {
  readonly changed: readonly string[];
  readonly created: readonly string[];
  readonly deleted: readonly string[];
  readonly inventory: ProjectInventory | null;
  readonly invalidateAll: boolean;
}
/**
 * What an update that creates or deletes owned files, without a whole
 * invalidation, changed beyond the files it names. Paths are relative to the
 * root, a path outside it in its `../` spelling, in byte order.
 */
export interface MembershipReach {
  /** Program files outside the owned inventory that entered or left the program. */
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** Created or deleted owned files that can reach other files without an import the
   * access facts record: a script, a declaration file, a module augmentation, an
   * ambient module, a triple-slash reference or an import the compiler did not resolve. */
  readonly global: readonly string[];
  /** False when `baseUrl`, `rootDirs` or a `paths` mapping without an absolute base can resolve
   * a specifier to a path no candidate spells. */
  readonly spelled: boolean;
}
/** Plain inputs of a retained adapter. `sink` is project's port; the adapter
 * reports every filesystem observation it makes to it. */
export interface RetainedSourceInputs {
  readonly root: string;
  readonly configuration: string;
  readonly inventory: ProjectInventory;
  readonly areas: readonly SourceArea[];
  readonly limits: SourceWorkLimits;
  readonly sink: ObservationSink;
  readonly signal?: AbortSignal;
}
/** One warm compiler with exactly one live snapshot behind plain data. */
export interface RetainedSourceAnalysis {
  readonly hot: boolean;
  /** `reach` is present when the update created or deleted files on a warm
   * compiler without a whole invalidation. */
  update(changes: SourceChangeSet, signal?: AbortSignal): Promise<{ readonly snapshot: number; readonly elapsedMs: number;
    readonly reach?: MembershipReach }>;
  describe(files: readonly string[], signal?: AbortSignal): Promise<{ readonly descriptions: readonly FileDescription[];
    readonly delta: CatalogDelta }>;
  /** Bounded, body-free signatures and first-documentation-paragraphs for the
   * requested defining-file exports. One result per unique request in request
   * order; an invalid request or a total encoded result above
   * `limits.maxResultBytes` rejects with `SourceFailure`. An isolated
   * valid-request failure is an `unavailable` entry, never a rejection. */
  details(requests: readonly SymbolDetailRequest[], limits: SymbolDetailLimits, signal?: AbortSignal): Promise<readonly SymbolDetail[]>;
  /** The kind and behavior of each requested defining-file export, one per
   * request in request order, with the same hot-compiler precondition as
   * `details`. An invalid request rejects with `SourceFailure`; an export the
   * compiler cannot resolve is a `value` of `unknown` behavior. */
  shapes(requests: readonly ExportShapeRequest[], signal?: AbortSignal): Promise<readonly ExportShape[]>;
  /** The suite and test titles of each requested project-relative TypeScript or
   * JavaScript file, one per request in request order, with the same
   * hot-compiler precondition as `details`. An invalid request, invalid limits
   * or a total encoded result above `limits.maxResultBytes` rejects with
   * `SourceFailure`; a file outside the compiler program is an `unavailable`
   * entry. */
  testTitles(files: readonly string[], limits: TestTitleLimits, signal?: AbortSignal): Promise<readonly TestFileTitles[]>;
  catalog(): SourceCatalog;
  interpreter(): AccessInterpreter;
  releaseCompiler(): Promise<void>;
  dispose(): Promise<void>;
}
