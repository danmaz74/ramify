import type { ModuleId, TagName } from '../../subs/model/src/interfaces/model.js';
import type { AnalysisReport, Capability } from './analysis.js';
import type { DependencyDiagramFacts } from './dependency-diagram.js';
import type { MeasurementDocumentationSize } from './measurements.js';

/**
 * Plain contract of the modularity projection. The units, filters, formulas,
 * coverage rules and ordering are defined by
 * docs/architecture/modularity-report.spec.md; field comments only name them.
 */

/** Production: importer or file outside every testing-classified area. Test: the complement. */
export type SourceFilter = 'production' | 'test';
export interface LoadVariants<T> {
  /** Every access occurrence that passes the source filter. */
  readonly all: T;
  /** Occurrences whose `SourceAccess.runtimeLoad` is true. */
  readonly runtime: T;
  /** Occurrences whose `SourceAccess.runtimeLoad` is false. */
  readonly typeOnly: T;
}

/** `value` is `numerator / denominator` unrounded, or null when the denominator is zero. */
export interface Ratio {
  readonly numerator: number;
  readonly denominator: number;
  readonly value: number | null;
}

export interface MetricCoverage {
  /** `SourceLimit.id` and `BehaviorLimit.id` values attributed to the metric's scope, in byte order. */
  readonly limitIds: readonly string[];
  /** Occurrences in scope whose target is unresolved or outside every module. */
  readonly unattributedAccesses: number;
  /** Behavior facts in scope classified `unknown` after deduplication; zero for other metrics. */
  readonly unknownDependencies: number;
}
export type MetricUnavailableReason =
  /** The analysis did not request `dependency-behavior`. */
  | 'not-requested'
  /** `dependency-behavior` was requested but not executed, so no facts exist. */
  | 'capability-failed'
  /** A declared-exposure measure under candidate ownership. */
  | 'candidate-exposure'
  /** The measure is not defined for this source filter. */
  | 'not-defined';
/** A partial metric is a lower bound for its counts and is never presented as measured. */
export type Metric<T> =
  | { readonly state: 'measured'; readonly value: T }
  | { readonly state: 'partial'; readonly observed: T; readonly coverage: MetricCoverage }
  | { readonly state: 'unavailable'; readonly reason: MetricUnavailableReason };

// Section 4: exactly the two public behavioral measures.
export interface BehavioralDependencyMetrics {
  readonly behavioralDependencies: number;
  readonly nonBehavioralDependencies: number;
}

// Section 2: contract breadth of one ordered edge or one boundary direction.
export interface EdgeBreadth {
  readonly occurrences: number;
  /** Distinct (original, exported name) pairs over selections with a non-null original. */
  readonly selectedSymbols: number;
  readonly consumerFiles: number;
  readonly providerFiles: number;
  readonly filePairs: number;
}
export interface BoundaryBreadth extends EdgeBreadth {
  /** Distinct providers for outgoing breadth; distinct consumers for incoming breadth. */
  readonly modules: number;
}

// Section 1: boundary locality of an exact owner or subtree.
export interface BoundaryMetrics {
  readonly internalOccurrences: number;
  readonly outgoing: BoundaryBreadth;
  readonly incoming: BoundaryBreadth;
  /** internalOccurrences / (internalOccurrences + outgoing.occurrences). */
  readonly locality: Ratio;
}

// Section 5: stability direction.
export interface StabilityMetrics {
  /** Ca: distinct consumer owners. */
  readonly afferent: number;
  /** Ce: distinct provider owners. */
  readonly efferent: number;
  /** Ce / (Ca + Ce). */
  readonly instability: Ratio;
}
export type StabilityDirection = 'toward-stable' | 'level' | 'toward-volatile' | 'undefined';

// Section 3: repository interface use.
export type InterfaceDestination = 'parent' | 'descendants' | 'any';
export type InterfaceCapability = 'value' | 'type-only' | 'any';
export interface InterfaceUseRow {
  readonly destination: InterfaceDestination;
  readonly capability: InterfaceCapability;
  readonly exposedOriginals: number;
  readonly selectedOriginals: number;
  /** repository interface use: selectedOriginals / exposedOriginals. */
  readonly repositoryInterfaceUse: Ratio;
}
export interface InterfaceUse {
  /** Nine rows: destinations parent, descendants, any, each with capabilities value, type-only, any. */
  readonly rows: readonly InterfaceUseRow[];
}

// Section 7: internal connectedness.
export interface IsolatedFile {
  readonly path: string;
  readonly declarationFile: boolean;
  readonly interfaceFile: boolean;
  readonly exposedOriginals: number | null;
  readonly incomingOccurrences: number;
  readonly outgoingOccurrences: number;
}
export interface Connectedness {
  readonly files: number;
  readonly components: number;
  readonly largestComponentFiles: number;
  /** largestComponentFiles / files. */
  readonly largestComponentCoverage: Ratio;
  readonly isolates: readonly IsolatedFile[];
}

// Section 9: context size.
export type DocumentationSize = MeasurementDocumentationSize;
export type ContextDocumentation = MeasurementDocumentationSize
  | { readonly state: 'unavailable'; readonly reason: 'candidate-documentation' };
export interface ContextSize {
  readonly sourceFiles: number;
  readonly sourceBytes: number;
  readonly resourceFiles: number;
  readonly resourceBytes: number;
  /** Independent of the production/test source filter. */
  readonly documentation: ContextDocumentation;
  readonly originals: number;
  /** Null under candidate ownership. */
  readonly exposedOriginals: number | null;
  readonly accessOccurrences: number;
}

export type OwnerRelation = 'child' | 'descendant' | 'parent' | 'ancestor' | 'unrelated';
export interface OwnerMetrics {
  readonly owner: ModuleId;
  readonly exact: LoadVariants<Metric<BoundaryMetrics>>;
  readonly subtree: LoadVariants<Metric<BoundaryMetrics>>;
  readonly stability: LoadVariants<Metric<StabilityMetrics>>;
  readonly interfaceUse: Metric<InterfaceUse>;
  readonly behavior: Metric<BehavioralDependencyMetrics>;
  readonly connectedness: Metric<Connectedness>;
  readonly context: { readonly exact: Metric<ContextSize>; readonly subtree: Metric<ContextSize> };
}
export interface EdgeMetrics {
  readonly consumer: ModuleId;
  readonly provider: ModuleId;
  /** The provider's relation to the consumer in the ownership tree in use. */
  readonly relation: OwnerRelation;
  readonly breadth: LoadVariants<Metric<EdgeBreadth>>;
  readonly direction: LoadVariants<StabilityDirection>;
}

// Section 6: cycle structure.
export interface CycleStep {
  readonly consumer: ModuleId;
  readonly provider: ModuleId;
  readonly runtimeOccurrences: number;
  readonly typeOnlyOccurrences: number;
}
export interface CycleComponent {
  /** `type-only`: a nontrivial component of the all-occurrence graph that is not a runtime component. */
  readonly kind: 'runtime' | 'type-only';
  readonly members: readonly ModuleId[];
  readonly occurrences: number;
  readonly runtimeOccurrences: number;
  readonly files: number;
  readonly selectedSymbols: number;
  /** One shortest cycle through each member, deduplicated. */
  readonly witnesses: readonly (readonly CycleStep[])[];
  /** Member lists of runtime components inside a type-only component; empty for a runtime component. */
  readonly runtimeComponents: readonly (readonly ModuleId[])[];
}

export interface ViewCounts {
  readonly owners: number;
  readonly sourceFiles: number;
  readonly applicationOccurrences: number;
  readonly sameOwnerOccurrences: number;
  readonly crossOwnerOccurrences: number;
  readonly edges: number;
  readonly externalOccurrences: number;
  readonly outsideModuleOccurrences: number;
  readonly unresolvedOccurrences: number;
  /** sameOwnerOccurrences / applicationOccurrences. */
  readonly exactLocality: Ratio;
}
export interface ModularityView {
  readonly filter: SourceFilter;
  readonly summary: LoadVariants<Metric<ViewCounts>>;
  readonly behavior: Metric<BehavioralDependencyMetrics>;
  readonly owners: readonly OwnerMetrics[];
  readonly edges: readonly EdgeMetrics[];
  readonly cycles: Metric<readonly CycleComponent[]>;
  /** The view's dependency-diagram facts; same availability and coverage as `behavior`. */
  readonly dependencyDiagram: Metric<DependencyDiagramFacts>;
}

// Counterfactual ownership (execution step 5).
export interface OwnershipModule {
  readonly id: ModuleId;
  readonly name: string;
  readonly parent: ModuleId | null;
  readonly headerTags: readonly TagName[];
}
export interface CandidateFileOwner {
  readonly path: string;
  readonly owner: ModuleId;
}
export interface CandidateOwnership {
  /** Caller label recorded in provenance, for example `A-15-file`. */
  readonly id: string;
  /** The complete candidate module tree. */
  readonly modules: readonly OwnershipModule[];
  /** Reassigned inventory files; every other file keeps its declared owner. */
  readonly files: readonly CandidateFileOwner[];
}
export interface OwnershipIssue {
  readonly code: 'invalid-candidate-id' | 'invalid-module-id' | 'duplicate-module' | 'invalid-tree'
    | 'unknown-owner' | 'unknown-file' | 'duplicate-file' | 'classification-change';
  readonly subject: string;
  readonly message: string;
}
export interface BoundaryChange {
  readonly accessId: string;
  readonly filter: SourceFilter;
  readonly importer: string;
  readonly target: string;
  readonly runtimeLoad: boolean;
  readonly declared: { readonly consumer: ModuleId; readonly provider: ModuleId };
  readonly candidate: { readonly consumer: ModuleId; readonly provider: ModuleId };
  readonly change: 'became-cross-owner' | 'became-same-owner' | 'changed-owners';
}
export interface BoundaryChanges {
  readonly total: number;
  readonly changes: readonly BoundaryChange[];
  readonly truncated: boolean;
}

export interface ModularityProvenance {
  /** The caller's revision identity: a resident `RevisionId`, or `batch:<inputId>`. */
  readonly revision: string;
  readonly analysisSchema: AnalysisReport['schemaVersion'];
  readonly inputId: string;
  readonly registryId: string;
  readonly check: AnalysisReport['outcome']['check'];
  readonly analysisCoverage: AnalysisReport['outcome']['coverage'];
  /** Requested and executed capabilities, in byte order. */
  readonly capabilities: readonly Capability[];
  /** The declared nested-tree directories, owned-ignored and external: consumers absent from the repository measures. */
  readonly omittedScopes: readonly string[];
  readonly ownership: 'declared' | 'candidate';
  readonly candidateId: string | null;
}
export interface ModularityReport {
  readonly schemaVersion: 'ramify.modularity/3';
  readonly provenance: ModularityProvenance;
  readonly coverage: { readonly state: 'complete' | 'partial'; readonly detail: MetricCoverage };
  /** The ownership tree in use, ordered by id. */
  readonly modules: readonly OwnershipModule[];
  /** Production view first, then test. */
  readonly views: readonly ModularityView[];
  /** Null under declared ownership. */
  readonly boundaryChanges: BoundaryChanges | null;
}

export interface ModularityLimits {
  readonly maxBoundaryChanges: number;
  readonly maxReportBytes: number;
}
export interface ModularityInput {
  readonly revision: string;
  readonly report: AnalysisReport;
  readonly ownership?: CandidateOwnership;
  readonly limits: ModularityLimits;
}
export type ModularityOutcome =
  | { readonly status: 'projected'; readonly report: ModularityReport }
  | { readonly status: 'invalid-ownership'; readonly issues: readonly OwnershipIssue[] }
  | { readonly status: 'unavailable'; readonly reason: 'analysis-incomplete' | 'resource-limit';
      readonly message: string };

// Section 8: change affinity from Git facts supplied by a separate adapter.
export interface ChangeHistoryProvenance {
  readonly source: 'git';
  /** Full commit id of the history's last commit; must equal the analyzed source commit. */
  readonly head: string;
  /** The revision range given to Git. */
  readonly range: string;
  readonly firstParent: boolean;
  readonly merges: 'excluded' | 'included';
  /** Repository-relative directory of the project root, `.` when they coincide. */
  readonly projectDirectory: string;
}
export interface HistoryCommit {
  readonly id: string;
  /** Changed paths relative to the project root, in byte order; renames list both paths. */
  readonly paths: readonly string[];
}
export interface ChangeHistory {
  readonly provenance: ChangeHistoryProvenance;
  /** Oldest first. */
  readonly commits: readonly HistoryCommit[];
}
export interface ChangeAffinityThresholds {
  readonly minOwnerCommits: number;
  readonly minSharedCommits: number;
  /** Commits changing more owners are excluded as broad; null disables the filter. */
  readonly maxOwnersPerCommit: number | null;
  /** Commit ids excluded explicitly, for example staged plan-delivery commits. */
  readonly excludedCommits: readonly string[];
}
export interface OwnerChangeCount {
  readonly owner: ModuleId;
  readonly commits: number;
  readonly sufficient: boolean;
}
export interface OwnerPairAffinity {
  readonly first: ModuleId;
  readonly second: ModuleId;
  readonly shared: number;
  /** Jaccard ratio: shared / commits changing either owner. */
  readonly affinity: Ratio;
  readonly sufficient: boolean;
}
export interface ChangeAffinityReport {
  readonly schemaVersion: 'ramify.change-affinity/1';
  readonly history: ChangeHistoryProvenance;
  readonly thresholds: ChangeAffinityThresholds;
  readonly revision: string;
  readonly filter: SourceFilter;
  readonly ownership: 'declared' | 'candidate';
  readonly candidateId: string | null;
  readonly commits: { readonly examined: number; readonly sampled: number;
    readonly excludedBroad: number; readonly excludedExplicit: number };
  readonly unmappedPaths: number;
  readonly owners: readonly OwnerChangeCount[];
  /** Pairs with at least one shared commit. */
  readonly pairs: readonly OwnerPairAffinity[];
}
export interface ChangeAffinityInput {
  readonly revision: string;
  readonly report: AnalysisReport;
  readonly ownership?: CandidateOwnership;
  readonly history: ChangeHistory;
  readonly thresholds: ChangeAffinityThresholds;
  readonly filter: SourceFilter;
}
export type ChangeAffinityOutcome =
  | { readonly status: 'projected'; readonly report: ChangeAffinityReport }
  | { readonly status: 'invalid-ownership'; readonly issues: readonly OwnershipIssue[] }
  | { readonly status: 'unavailable'; readonly reason: 'analysis-incomplete'; readonly message: string };

/** The materialized baseline written by the modularity probe (execution step 4). */
export interface ModularityDocument {
  readonly schemaVersion: 'ramify.modularity-document/1';
  /** Git provenance of the analyzed worktree, separate from the analysis revision. */
  readonly repository: { readonly commit: string; readonly clean: boolean };
  readonly declared: ModularityEvaluation;
  /** Ordered by candidate id. */
  readonly candidates: readonly ModularityEvaluation[];
}
export interface ModularityEvaluation {
  readonly modularity: ModularityReport;
  /** Null when no history was requested. */
  readonly changeAffinity: ChangeAffinityReport | null;
}
