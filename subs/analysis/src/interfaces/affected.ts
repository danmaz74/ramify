import type { ProjectExclusion, ProjectScope } from '../../subs/project/src/interfaces/project.js';
import type { SourceLimit } from '../../subs/typescript/src/interfaces/source.js';

/** Seeds of one affected-module query against a retained session's current revision. */
export interface AffectedQuery {
  /** The session's current revision; any other value is `invalid-revision`. */
  readonly sequence: number;
  /** Exact inventory module IDs; unknown IDs fail the whole query. */
  readonly modules?: readonly string[];
  /**
   * Canonical project-relative, `/`-separated paths, present or not, `'.'` for
   * the root directory; leading `../` segments name a path outside the project.
   */
  readonly paths?: readonly string[];
}
export interface AffectedModule {
  readonly id: string;
  /** Project-relative; '.' for the root. */
  readonly directory: string;
}
/**
 * How a path seed resolved. An owned path resolves by its inventory entry, its
 * module's description or README, a source area of its module, or else by
 * containment under the current declarations; an excluded path by its unowned
 * exclusion; a path outside the project by none.
 */
export type AffectedPathBasis = 'inventory' | 'declaration' | 'area' | 'containment' | 'excluded' | 'none';
/**
 * One path seed, resolved without an inventory entry or a filesystem read of
 * the seed. An owned path names its module and the owned-ignored tree or
 * scratch directory it lies in, if any, in which case its basis is
 * containment. The module attributes the path; `kind` classifies it and
 * `selects` alone names the modules it selects, byte-ordered. An excluded path
 * selects nothing, and only a path outside the project widens the answer.
 */
export type AffectedPathSeed =
  | { readonly path: string; readonly status: 'owned'; readonly module: string;
      readonly basis: 'inventory' | 'declaration' | 'area' | 'containment'; readonly exclusion: ProjectExclusion | null;
      readonly kind: 'source-area' | 'auxiliary-source' | 'description' | 'readme'
        | 'captured-input' | 'inert' | 'ignored';
      readonly selects: readonly string[] }
  | { readonly path: string; readonly status: 'excluded'; readonly module: null; readonly basis: 'excluded';
      readonly exclusion: ProjectExclusion; readonly kind: null; readonly selects: readonly [] }
  | { readonly path: string; readonly status: 'outside-project'; readonly module: null; readonly basis: 'none';
      readonly exclusion: null; readonly kind: null; readonly selects: readonly [] };
export type AffectedWideningReason = 'unowned-path' | 'partial-coverage';
export interface AffectedSelection {
  readonly schemaVersion: 'ramify.affected/3';
  /** The revision's observed-input identity; the answer describes exactly these inputs. */
  readonly inputId: string;
  readonly paths: readonly AffectedPathSeed[];
  /** The module seeds and every module a path seed selects. */
  readonly changedModules: readonly AffectedModule[];
  /** Reached dependents, seeds excluded. */
  readonly affectedModules: readonly AffectedModule[];
  /** Their union, or every module when widened. */
  readonly testModules: readonly AffectedModule[];
  readonly selection: 'dependency-closure' | 'all-modules';
  /** Empty for `dependency-closure`; distinct, sorted, for `all-modules`. */
  readonly widening: readonly AffectedWideningReason[];
  /** The revision's scope; its `ownership` is the whole ownership topology: the modules and the rooted exclusions. */
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
