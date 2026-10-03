export type ModuleId = string;
export type TagName = string;
export type TagKind = 'required-importer' | 'required-symbol';
export interface TagDefinition {
  readonly name: TagName;
  readonly kind: TagKind;
  readonly description?: string;
}
export interface ResolvedTagRegistry {
  readonly id: string;
  readonly definitions: readonly TagDefinition[];
  readonly isDefault: boolean;
}
export interface SourceLocation {
  readonly file: string;
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
}
export interface ModelIssue {
  readonly code: 'invalid-registry' | 'unknown-tag' | 'invalid-module-id'
    | 'duplicate-module' | 'invalid-tree' | 'invalid-original'
    | 'missing-required-tag' | 'conflicting-tags' | 'ungrounded-exposure';
  readonly message: string;
  readonly locations: readonly SourceLocation[];
}
export type ModelResult<T> =
  | { readonly status: 'valid'; readonly value: T }
  | { readonly status: 'invalid'; readonly issues: readonly ModelIssue[] };
export interface SourceArea {
  readonly owner: ModuleId;
  readonly kind: 'ordinary' | 'tests';
  readonly root: string;
  readonly profile: readonly TagName[];
}
export interface ModuleRecord {
  readonly id: ModuleId;
  readonly name: string;
  readonly parent: ModuleId | null;
  readonly headerTags: readonly TagName[];
  readonly areas: readonly SourceArea[];
}
export type OriginalId =
  | { readonly kind: 'code'; readonly owner: ModuleId; readonly file: string;
      readonly binding: string }
  | { readonly kind: 'resource'; readonly owner: ModuleId; readonly file: string;
      readonly binding: string };
export interface SourceOrigin {
  readonly file: string;
  readonly area: SourceArea;
  /**
   * True only for owned compiler source outside its owner's `src/`, which
   * keeps the owner's ordinary `area`; false for every origin beneath `src/`.
   */
  readonly auxiliary: boolean;
}
/** The project originals named by an original's declared signature. */
export interface SignatureCompanions {
  /** Distinct, in `originalKey` byte order; never the original itself. */
  readonly named: readonly OriginalId[];
  /** The first naming position of each entry of `named`, aligned with it. */
  readonly evidence: readonly SourceLocation[];
  /** Some read signature position has no annotation. */
  readonly inferred: boolean;
  /** References that resolve to no single project original. */
  readonly unresolved: number;
}
export interface Original {
  readonly id: OriginalId;
  readonly origin: SourceOrigin;
  readonly declarations: readonly SourceLocation[];
  readonly hasValue: boolean;
  readonly hasType: boolean;
  readonly tags: readonly TagName[];
  readonly tagEvidence: readonly SourceLocation[];
  readonly companions: SignatureCompanions;
}
export type Destination = 'parent' | 'descendants';
export interface Exposure {
  readonly module: ModuleId;
  readonly original: OriginalId;
  readonly names: readonly string[];
  readonly destinations: readonly Destination[];
  readonly evidence: readonly SourceLocation[];
  readonly provider: ModuleId | null;
  readonly effective: boolean;
}
export interface ModelInput {
  readonly registry: ResolvedTagRegistry;
  readonly modules: readonly ModuleRecord[];
  readonly originals: readonly Original[];
  readonly exposures: readonly Exposure[];
}
export interface Model {
  readonly registry: ResolvedTagRegistry;
  readonly modules: readonly ModuleRecord[];
  readonly originals: readonly Original[];
  readonly exposures: readonly Exposure[];
}
export interface ExposureHop {
  readonly module: ModuleId;
  readonly destination: Destination;
  readonly evidence: readonly SourceLocation[];
}
export interface VisibilityDecision {
  readonly visible: boolean;
  readonly importer: ModuleId;
  readonly original: OriginalId;
  readonly paths: readonly (readonly ExposureHop[])[];
  readonly ineffective: readonly Exposure[];
}
export type BindingRequest = 'value' | 'type-only';
export interface ImportQuestion {
  readonly importer: SourceOrigin;
  readonly location: SourceLocation;
  readonly target: SourceOrigin;
  readonly forwarding: readonly SourceOrigin[];
  readonly selection: { readonly original: OriginalId;
    readonly request: BindingRequest } | null;
}
export interface TagRequirement {
  readonly tag: TagName;
  readonly kind: TagKind;
  readonly satisfied: boolean;
}
export type ImportReason = 'same-owner' | 'exposed' | 'symbol-free'
  | 'testing-origin' | 'not-visible' | 'required-importer-tag'
  | 'required-symbol-tag';
export interface ImportDecision {
  readonly status: 'allowed' | 'denied';
  readonly reason: ImportReason;
  readonly question: ImportQuestion;
  readonly original: Original | null;
  readonly visibility: VisibilityDecision | null;
  readonly requirements: readonly TagRequirement[];
  readonly checkedOrigins: readonly SourceOrigin[];
  readonly blockingOrigins: readonly SourceOrigin[];
}
export type AvailableForm = 'value' | 'type-only';
export interface AvailableOriginal {
  readonly original: OriginalId;
  readonly form: AvailableForm;
}
export type CompanionReason = 'not-visible' | 'requires-tag';
export interface CompanionViolation {
  readonly module: ModuleId;
  readonly original: OriginalId;
  readonly companion: OriginalId;
  readonly destination: Destination;
  readonly reason: CompanionReason;
  /** Required-importer tags of the companion missing from the symbol; empty for not-visible. */
  readonly tags: readonly TagName[];
  /** The exposure statement: the first evidence location of the exposure. */
  readonly statement: SourceLocation;
}
