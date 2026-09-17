import type { ImportReason, ModuleId, OriginalId } from '../../subs/model/src/interfaces/model.js';
import type { AnalysisReport } from './analysis.js';
import type { BehavioralDependencyMetrics, CandidateOwnership } from './modularity.js';

/**
 * Plain contract of the dependency-diagram projection. The units, precedence,
 * status, coverage and ordering rules are defined by the "Dependency diagram
 * facts" section of docs/architecture/modularity-report.spec.md.
 */

/**
 * One distinct `(consumer, importedModule, original)` boundary over the access
 * facts of one source filter. Unused boundaries and originals owned by the
 * consumer are absent. `unknown` facts carry coverage and never contribute a
 * displayed count.
 */
export interface DependencyBoundaryFact {
  /** Owner of the consumer files in the ownership in use. */
  readonly consumer: ModuleId;
  /** Owner of the resolved access target files in the ownership in use; may equal `consumer`. */
  readonly importedModule: ModuleId;
  /** Owner of the original's defining file in the ownership in use; never equal to `consumer`. */
  readonly originalOwner: ModuleId;
  readonly original: OriginalId;
  readonly classification: 'behavioral' | 'non-behavioral' | 'unknown';
  /** Byte order. */
  readonly consumerFiles: readonly string[];
  /** Resolved target files of the contributing accesses, in byte order. */
  readonly importedFiles: readonly string[];
  /** The original's project-relative defining file. */
  readonly originalFiles: readonly string[];
  /** Contributing `SourceAccess.id` values, in byte order. */
  readonly accessIds: readonly string[];
  /** From the contributing accesses' decisions for this original only: denied, then limited, then allowed. */
  readonly status: 'allowed' | 'limited' | 'denied';
  /** Distinct reasons of those decisions, in byte order. */
  readonly reasons: readonly ImportReason[];
  /** `BehaviorLimit.id` values of the contributing access facts when `unknown`; otherwise empty. */
  readonly limitIds: readonly string[];
}

export interface DependencyDiagramFacts {
  readonly inputId: string;
  /** Every module of the ownership tree in use, by id, including modules with no dependency. */
  readonly modules: readonly ModuleId[];
  /** Equal to the view's `behavior` metric value. */
  readonly headline: BehavioralDependencyMetrics;
  /** Ordered by consumer, imported module, then original identity. */
  readonly boundaries: readonly DependencyBoundaryFact[];
  /** The coverage of the view's `behavior` metric. */
  readonly coverage: {
    readonly state: 'complete' | 'partial';
    readonly unknownDependencies: number;
    readonly limitIds: readonly string[];
  };
}

export interface DependencyDiagramLimits {
  /** Maximum UTF-8 bytes of the diagram's JSON; a larger diagram is refused, never truncated. */
  readonly maxResultBytes: number;
}

export interface DependencyDiagramInput {
  readonly revision: string;
  /** A completed analysis that requested `dependency-behavior`. */
  readonly report: AnalysisReport;
  /** A candidate that `projectModularity` accepts; an invalid candidate is a caller error. */
  readonly ownership?: CandidateOwnership;
  readonly limits: DependencyDiagramLimits;
}

export type DependencyDiagramOutcome =
  | { readonly status: 'projected'; readonly diagram: DependencyDiagramFacts }
  | { readonly status: 'refused';
      readonly reason: 'analysis-incomplete' | 'not-requested'
        | 'capability-failed' | 'resource-limit';
      readonly observedBytes?: number; readonly maximumBytes?: number };
