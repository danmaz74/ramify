import type { ProjectScope } from '../../subs/project/src/interfaces/project.js';
import type { SourceLimit } from '../../subs/typescript/src/interfaces/source.js';

/** Seeds of one affected-module query against a retained session's current revision. */
export interface AffectedQuery {
  /** The session's current revision; any other value is `invalid-revision`. */
  readonly sequence: number;
  /** Exact inventory module IDs; unknown IDs fail the whole query. */
  readonly modules?: readonly string[];
  /** Project-relative, `/`-separated paths as the inventory spells them. */
  readonly paths?: readonly string[];
}
export interface AffectedModule {
  readonly id: string;
  /** Project-relative; '.' for the root. */
  readonly directory: string;
}
/** How a path seed resolved to a module. */
export type AffectedPathBasis = 'inventory' | 'declaration' | 'area' | 'none';
export interface AffectedPathSeed {
  readonly path: string;
  /** Null only with basis 'none'. */
  readonly module: string | null;
  readonly basis: AffectedPathBasis;
}
export type AffectedWideningReason = 'unowned-path' | 'partial-coverage';
export interface AffectedSelection {
  readonly schemaVersion: 'ramify.affected/1';
  /** The revision's observed-input identity; the answer describes exactly these inputs. */
  readonly inputId: string;
  readonly paths: readonly AffectedPathSeed[];
  /** The seeds. */
  readonly changedModules: readonly AffectedModule[];
  /** Reached dependents, seeds excluded. */
  readonly affectedModules: readonly AffectedModule[];
  /** Their union, or every module when widened. */
  readonly testModules: readonly AffectedModule[];
  readonly selection: 'dependency-closure' | 'all-modules';
  /** Empty for `dependency-closure`; distinct, sorted, for `all-modules`. */
  readonly widening: readonly AffectedWideningReason[];
  readonly scope: ProjectScope;
  readonly coverage: { readonly status: 'complete' | 'partial'; readonly notes: readonly SourceLimit[] };
  /** The revision's existing check verdict; never a claim that tests ran. */
  readonly analysisCheck: 'passed' | 'failed';
}
export type AffectedUnavailableReason =
  | 'invalid-query' | 'invalid-revision' | 'invalid-current' | 'missing-facts'
  | 'unknown-module' | 'resource-limit' | 'analysis-failed';
export type SessionAffectedOutcome =
  | { readonly status: 'answered'; readonly sequence: number; readonly result: AffectedSelection }
  | { readonly status: 'unavailable'; readonly reason: AffectedUnavailableReason;
      readonly message: string; readonly unknownModules: readonly string[] }
  | { readonly status: 'cancelled' };
