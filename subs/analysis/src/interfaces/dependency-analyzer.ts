import type { ProjectRequest } from '../../subs/project/src/interfaces/project.js';
import type { SourceWorkLimits } from '../../subs/typescript/src/interfaces/source.js';
import type { AnalysisReport, RunControl } from './analysis.js';
import type { DependencyDiagramFacts } from './dependency-diagram.js';

/**
 * Plain contract of the lean dependency analyzer: the dependency diagram of one
 * completed report, classified from its recorded imports over inputs verified
 * against that report.
 */
export interface DependencyAnalyzerLimits {
  /** The existing batch source work limits. */
  readonly source: SourceWorkLimits;
  /** Maximum UTF-8 bytes of the diagram's JSON; a larger diagram is refused, never truncated. */
  readonly maxResultBytes: number;
  readonly deadlineMs: number;
}

export interface DependencyAnalyzerInput {
  /** The resolved request of the project that produced `report`. */
  readonly project: ProjectRequest;
  /** A completed analysis report; its recorded accesses are classified. */
  readonly report: AnalysisReport;
  readonly limits: DependencyAnalyzerLimits;
}

export interface DependencyAnalyzerTimings {
  /** Acquisition, the inventory and area comparison, and sealing with its input comparison. */
  readonly acquireMs: number;
  /** Compiler helper start, the supplied-import classification and helper disposal. */
  readonly classifyMs: number;
  readonly projectMs: number;
  readonly totalMs: number;
}

export type DependencyAnalyzerOutcome =
  | { readonly status: 'ready'; readonly diagram: DependencyDiagramFacts;
      readonly behaviorRuns: number; readonly timings: DependencyAnalyzerTimings }
  /** Project-relative paths whose inputs differ from the report's, in byte order. */
  | { readonly status: 'inputs-changed'; readonly paths: readonly string[] }
  | { readonly status: 'cancelled' }
  | { readonly status: 'unavailable';
      readonly reason: 'invalid-report' | 'analysis-failed' | 'resource-limit';
      readonly message: string };

/** Runs the analyzer for one published report, such as in a separate process. */
export interface DependencyDiagramRunner {
  run(input: { readonly project: ProjectRequest; readonly report: AnalysisReport },
    control?: RunControl): Promise<DependencyAnalyzerOutcome>;
}
