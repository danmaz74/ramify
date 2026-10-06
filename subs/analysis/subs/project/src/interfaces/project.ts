import type { ParsedDescription, DescriptionParser, RootMarkerReader, TextSpan } from '../../../descriptions/src/interfaces/syntax.js';

export interface ProjectRequest {
  readonly cwd: string;
  readonly root?: string;
  readonly scope: 'whole-project';
  readonly configuration: 'discover';
}
export interface ProjectScope {
  readonly root: string;
  readonly selection: 'given' | 'found';
  readonly invokedFrom: string;
  readonly configuration: string;
  readonly walkedAreas: readonly string[];
  /** The revision's containment and exclusion facts; `classifyProjectPath` reads them. */
  readonly ownership: ProjectOwnership;
}
/** One module of the ownership table. Directories are project-relative, `'.'` for the root. */
export interface PathOwner {
  readonly id: string;
  readonly parent: string | null;
  readonly directory: string;
}
/**
 * A directory Ramify does not enter. Only owned nested trees and `scratch`
 * exclusions keep an owner; every other kind is unowned.
 */
export interface ProjectExclusion {
  readonly kind: 'owned-unwired' | 'owned-nested-project' | 'external' | 'scratch' | 'repository' | 'packages' | 'output' | 'generated';
  readonly directory: string;
  readonly owner: string | null;
}
/**
 * Immutable, revision-bound path ownership: the modules and the rooted
 * exclusions (declared trees, module scratch directories and configured
 * output directories), each byte-ordered by directory. Repository, package
 * and generated exclusions are canonical segment rules of the classifier,
 * so they apply wherever such a segment occurs, present or not.
 */
export interface ProjectOwnership {
  readonly modules: readonly PathOwner[];
  readonly exclusions: readonly ProjectExclusion[];
}
/**
 * The ownership of one canonical project-relative path. An owned path may lie
 * in an owned nested tree or a scratch directory, named by `exclusion`;
 * ownership alone never states that a path was inventoried or checked.
 */
export type PathOwnership =
  | { readonly status: 'owned'; readonly module: string; readonly directory: string;
      readonly exclusion: ProjectExclusion | null }
  | { readonly status: 'excluded'; readonly module: null; readonly exclusion: ProjectExclusion }
  | { readonly status: 'outside-project'; readonly module: null }
  | { readonly status: 'invalid-path'; readonly message: string };
export interface CapturedInput {
  readonly path: string;
  readonly role: 'description' | 'readme' | 'source' | 'resource'
    | 'configuration' | 'dependency' | 'directory' | 'absent';
  readonly sha256: string;
  readonly bytes: number;
}
export interface InventoryArea {
  readonly owner: string;
  readonly kind: 'ordinary' | 'tests';
  readonly root: string;
  readonly present: boolean;
}
export type ModulePurpose =
  | { readonly state: 'present'; readonly readme: string; readonly paragraph: string }
  | { readonly state: 'missing-file' | 'no-paragraph'; readonly readme: string };
export interface InventoryModule {
  readonly id: string;
  readonly name: string;
  readonly parent: string | null;
  readonly directory: string;
  readonly headerTags: readonly string[];
  readonly areas: readonly InventoryArea[];
  readonly description: ParsedDescription;
  readonly purpose: ModulePurpose;
}
export interface InventoryFile {
  readonly path: string;
  readonly owner: string;
  readonly area: 'ordinary' | 'tests';
  readonly kind: 'source' | 'resource';
  /**
   * `src` beneath the owner's `src/`; `auxiliary` for owned compiler source
   * outside it, classified as ordinary.
   */
  readonly placement: 'src' | 'auxiliary';
  readonly sha256: string;
  readonly bytes: number;
}
export interface ExactReference {
  readonly description: string;
  readonly statement: number;
  readonly decoded: string;
  readonly normalized: string;
  readonly status: 'file' | 'missing' | 'directory' | 'escape' | 'symlink'
    | 'case-mismatch' | 'excluded' | 'invalid-path';
  readonly interfaceEligible: boolean;
}
/**
 * A nonblocking project warning, located at a project-relative `path`. Codes
 * are an open set: a reader tolerates a code it does not know.
 * `compiler-selected-owned-unwired`, `compiler-selected-owned-nested-project` and `compiler-selected-scratch` name, at the
 * tree or scratch directory, compiler-selected source Ramify does not analyze.
 * `ignored-but-walked`, which only the CLI adds from Git's output and never the
 * analysis, names a repository-ignored directory Ramify still walks; it lists no files.
 */
export interface ProjectWarning {
  readonly code: 'compiler-selected-owned-unwired' | 'compiler-selected-owned-nested-project' | 'compiler-selected-scratch' | 'ignored-but-walked';
  readonly path: string;
  readonly message: string;
  /** Where file evidence is needed: a bounded, byte-ordered prefix of the files, with `count` the total. */
  readonly files?: readonly string[];
  readonly count?: number;
}
export interface ProjectInventory {
  readonly scope: ProjectScope;
  readonly modules: readonly InventoryModule[];
  readonly files: readonly InventoryFile[];
  readonly references: readonly ExactReference[];
  readonly warnings: readonly ProjectWarning[];
}
export interface ProjectIssue {
  readonly code: 'root-not-found' | 'missing-root-description' | 'unmarked-root-description'
    | 'configuration-not-found' | 'references-only-configuration' | 'invalid-layout'
    | 'invalid-description' | 'duplicate-name' | 'description-in-src' | 'stray-description'
    | 'reserved-container' | 'undeclared-project-boundary' | 'invalid-nested-tree' | 'missing-owned-unwired' | 'missing-owned-nested-project'
    | 'overlapping-nested-tree' | 'symlink-root' | 'symlink-description'
    | 'symlink-reference' | 'case-mismatch' | 'missing-file' | 'invalid-path'
    | 'resource-limit' | 'read-failure' | 'changed-input';
  readonly path: string;
  readonly message: string;
  /** The located evidence within `path`, when the issue has one, such as a root marker or a declared directory. */
  readonly span?: TextSpan;
}
export interface AcquisitionLimits {
  readonly attempts: number;
  readonly maxFiles: number;
  readonly maxApplicationFiles: number;
  readonly maxFileBytes: number;
  readonly maxInputBytes: number;
  readonly maxApplicationBytes: number;
  readonly maxOwners: number;
  readonly maxDepth: number;
  readonly deadlineMs: number;
}
export interface ProjectInputView {
  readonly inventory: ProjectInventory;
  readonly inputs: readonly CapturedInput[];
  readFile(path: string): Promise<string | undefined>;
  fileExists(path: string): Promise<boolean>;
  directoryExists(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<readonly string[]>;
  realPath(path: string): Promise<string | undefined>;
  seal(): Promise<{ readonly status: 'coherent'; readonly inputs: readonly CapturedInput[] }
    | { readonly status: 'changed'; readonly paths: readonly string[] }>;
  dispose(): Promise<void>;
}
export interface ProjectReadOptions {
  readonly request: ProjectRequest;
  readonly parse: DescriptionParser;
  /** Decides a description's root marker from its module line, for selection and acquisition validity. */
  readonly marker: RootMarkerReader;
  readonly limits: AcquisitionLimits;
  readonly signal?: AbortSignal;
  readonly retained?: RetainedConfiguration | null;
  /** Resolved tag registry identity; only an input identity depends on it. */
  readonly registry?: string;
}
export type ProjectRead =
  | { readonly status: 'acquired'; readonly view: ProjectInputView;
      readonly configuration: RetainedConfiguration; readonly reusedConfiguration: boolean }
  | { readonly status: 'invalid' | 'unavailable' | 'incomplete';
      readonly inventory: ProjectInventory | null; readonly issues: readonly ProjectIssue[];
      readonly sealedInputs: readonly CapturedInput[] | null }
  | { readonly status: 'cancelled' };

export interface ObservationSink {
  file(path: string, sha256: string | null, bytes: number, role: 'source' | 'resource' | 'configuration' | 'dependency'): void;
  directory(path: string, entries: readonly string[]): void;
  absent(path: string): void;
  probe(path: string, operation: 'fileExists' | 'directoryExists' | 'realPath'): void;
}
export type InputChangeKind = 'changed' | 'created' | 'deleted' | 'unknown';
export interface ObservedChange {
  readonly path: string;
  readonly kind: InputChangeKind;
}
export type InventoryUpdate =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'local'; readonly inventory: ProjectInventory;
      readonly descriptions: readonly string[]; readonly readmes: readonly string[];
      readonly created: readonly string[]; readonly deleted: readonly string[]; readonly changed: readonly string[] }
  | { readonly kind: 'structural'; readonly inventory: ProjectInventory }
  | { readonly kind: 'invalid'; readonly inventory: ProjectInventory | null; readonly issues: readonly ProjectIssue[] }
  | { readonly kind: 'incomplete'; readonly issues: readonly ProjectIssue[] };
/**
 * Which compiler-reported observations `ProjectObserver.retire` releases; a
 * released path keeps its acquisition recipe. `all` releases every one now.
 * `probes` keeps every observation holding read bytes and marks existence
 * probes, absences and listings: the next promotion keeps each one the compiler
 * reported again and releases the rest.
 */
export type ObservationRetirement =
  | { readonly kind: 'all' }
  | { readonly kind: 'probes' };
export interface ProjectObserver {
  readonly inventory: ProjectInventory;
  /** The resolution of the acquisition behind `inventory`, replaced by a structural rebuild.
   * Passed to `resolveProjectRoot` as known, it is reused while its discovery queries answer the same. */
  readonly resolution: Extract<ProjectResolution, { readonly status: 'resolved' }>;
  readonly inputs: readonly CapturedInput[];
  readonly inputId: string;
  readonly sink: ObservationSink;
  /**
   * Whether an owned project-relative path outside every `src/` would be
   * auxiliary source under the current configuration: compiler source by
   * extension, where JavaScript counts only when the configuration admits it.
   * Reads nothing.
   */
  auxiliarySource(path: string): boolean;
  /** An aborted signal rejects `apply` and `reobserve` with an error named `Cancelled`, or with the signal's reason. */
  apply(changes: readonly ObservedChange[], signal?: AbortSignal): Promise<InventoryUpdate>;
  /** Release compiler-reported observations before a compiler update that reports them again. */
  retire(retirement: ObservationRetirement): Promise<void>;
  reobserve(signal?: AbortSignal): Promise<readonly ObservedChange[]>;
  readDescription(path: string): Promise<string | undefined>;
  readReadme(path: string): Promise<string | undefined>;
  dispose(): Promise<void>;
}
export type ProjectObserve =
  | { readonly status: 'observing'; readonly observer: ProjectObserver }
  | Exclude<ProjectRead, { readonly status: 'acquired' }>;

export type ProjectResolution =
  | { readonly status: 'resolved'; readonly root: string; readonly selection: 'given' | 'found';
      readonly invokedFrom: string; readonly configuration: string }
  | { readonly status: 'invalid' | 'unavailable'; readonly issues: readonly ProjectIssue[] };
export interface RetainedConfiguration {
  readonly key: string;
  readonly dependencies: readonly CapturedInput[];
  readonly bytes: number;
  readonly product: Readonly<Record<string, unknown>>;
}
